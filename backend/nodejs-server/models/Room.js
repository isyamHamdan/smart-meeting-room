const database = require('../config/database');
const logger = require('../utils/logger');

class Room {
  constructor(data = {}) {
    this.id = data.id;
    this.name = data.name;
    this.capacity = data.capacity;
    this.location = data.location;
    this.equipment = data.equipment;
    this.status = data.status || 'available';
    this.esp32_id = data.esp32_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async findAll() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'SELECT * FROM rooms ORDER BY name ASC';
      
      db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('Error fetching rooms:', err);
          reject(err);
        } else {
          const rooms = rows.map(row => new Room(row));
          resolve(rooms);
        }
      });
    });
  }

  static async findById(id) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'SELECT * FROM rooms WHERE id = ?';
      
      db.get(query, [id], (err, row) => {
        if (err) {
          logger.error('Error fetching room by ID:', err);
          reject(err);
        } else if (row) {
          resolve(new Room(row));
        } else {
          resolve(null);
        }
      });
    });
  }

  static async findByEsp32Id(esp32Id) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'SELECT * FROM rooms WHERE esp32_id = ?';
      
      db.get(query, [esp32Id], (err, row) => {
        if (err) {
          logger.error('Error fetching room by ESP32 ID:', err);
          reject(err);
        } else if (row) {
          resolve(new Room(row));
        } else {
          resolve(null);
        }
      });
    });
  }

  static async getAvailableRooms(startTime, endTime) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT r.* FROM rooms r
        WHERE r.status = 'available'
        AND r.id NOT IN (
          SELECT DISTINCT room_id FROM bookings 
          WHERE status = 'active'
          AND (
            (start_time <= ? AND end_time > ?) OR
            (start_time < ? AND end_time >= ?) OR
            (start_time >= ? AND start_time < ?)
          )
        )
        ORDER BY r.name ASC
      `;
      
      db.all(query, [startTime, startTime, endTime, endTime, startTime, endTime], (err, rows) => {
        if (err) {
          logger.error('Error fetching available rooms:', err);
          reject(err);
        } else {
          const rooms = rows.map(row => new Room(row));
          resolve(rooms);
        }
      });
    });
  }

  async save() {
    const db = database.getDb();
    
    if (this.id) {
      // Update existing room
      return new Promise((resolve, reject) => {
        const query = `
          UPDATE rooms 
          SET name = ?, capacity = ?, location = ?, equipment = ?, 
              status = ?, esp32_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(query, [
          this.name, this.capacity, this.location, this.equipment,
          this.status, this.esp32_id, this.id
        ], function(err) {
          if (err) {
            logger.error('Error updating room:', err);
            reject(err);
          } else {
            logger.info(`Room updated: ${this.lastID}`);
            resolve(this);
          }
        });
      });
    } else {
      // Create new room
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO rooms (name, capacity, location, equipment, status, esp32_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [
          this.name, this.capacity, this.location, this.equipment,
          this.status, this.esp32_id
        ], function(err) {
          if (err) {
            logger.error('Error creating room:', err);
            reject(err);
          } else {
            this.id = this.lastID;
            logger.info(`Room created: ${this.lastID}`);
            resolve(this);
          }
        });
      });
    }
  }

  async delete() {
    if (!this.id) {
      throw new Error('Cannot delete room without ID');
    }

    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'DELETE FROM rooms WHERE id = ?';
      
      db.run(query, [this.id], function(err) {
        if (err) {
          logger.error('Error deleting room:', err);
          reject(err);
        } else {
          logger.info(`Room deleted: ${this.id}`);
          resolve(true);
        }
      });
    });
  }

  async updateStatus(newStatus) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'UPDATE rooms SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      db.run(query, [newStatus, this.id], function(err) {
        if (err) {
          logger.error('Error updating room status:', err);
          reject(err);
        } else {
          this.status = newStatus;
          logger.info(`Room ${this.id} status updated to: ${newStatus}`);
          resolve(this);
        }
      });
    });
  }

  async getCurrentBooking() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT * FROM bookings 
        WHERE room_id = ? 
        AND status = 'active'
        AND start_time <= CURRENT_TIMESTAMP 
        AND end_time > CURRENT_TIMESTAMP
        ORDER BY start_time ASC
        LIMIT 1
      `;
      
      db.get(query, [this.id], (err, row) => {
        if (err) {
          logger.error('Error fetching current booking:', err);
          reject(err);
        } else {
          resolve(row ? new (require('./Booking'))(row) : null);
        }
      });
    });
  }

  async getUpcomingBookings(limit = 5) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT * FROM bookings 
        WHERE room_id = ? 
        AND status IN ('pending', 'confirmed')
        AND start_time > CURRENT_TIMESTAMP
        ORDER BY start_time ASC
        LIMIT ?
      `;
      
      db.all(query, [this.id, limit], (err, rows) => {
        if (err) {
          logger.error('Error fetching upcoming bookings:', err);
          reject(err);
        } else {
          const bookings = rows.map(row => new (require('./Booking'))(row));
          resolve(bookings);
        }
      });
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      capacity: this.capacity,
      location: this.location,
      equipment: this.equipment,
      status: this.status,
      esp32_id: this.esp32_id,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Room;