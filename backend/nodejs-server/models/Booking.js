const database = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class Booking {
  constructor(data = {}) {
    this.id = data.id;
    this.room_id = data.room_id;
    this.user_name = data.user_name;
    this.user_email = data.user_email;
    this.title = data.title;
    this.description = data.description;
    this.start_time = data.start_time;
    this.end_time = data.end_time;
    this.qr_code = data.qr_code;
    this.status = data.status || 'pending';
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async findAll(filters = {}) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      let query = `
        SELECT b.*, r.name as room_name, r.location as room_location
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id = r.id
      `;
      
      const conditions = [];
      const params = [];

      if (filters.room_id) {
        conditions.push('b.room_id = ?');
        params.push(filters.room_id);
      }

      if (filters.status) {
        conditions.push('b.status = ?');
        params.push(filters.status);
      }

      if (filters.date) {
        conditions.push('DATE(b.start_time) = DATE(?)');
        params.push(filters.date);
      }

      if (filters.user_email) {
        conditions.push('b.user_email = ?');
        params.push(filters.user_email);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY b.start_time ASC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Error fetching bookings:', err);
          reject(err);
        } else {
          const bookings = rows.map(row => {
            const booking = new Booking(row);
            booking.room_name = row.room_name;
            booking.room_location = row.room_location;
            return booking;
          });
          resolve(bookings);
        }
      });
    });
  }

  static async findById(id) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT b.*, r.name as room_name, r.location as room_location
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id = r.id
        WHERE b.id = ?
      `;
      
      db.get(query, [id], (err, row) => {
        if (err) {
          logger.error('Error fetching booking by ID:', err);
          reject(err);
        } else if (row) {
          const booking = new Booking(row);
          booking.room_name = row.room_name;
          booking.room_location = row.room_location;
          resolve(booking);
        } else {
          resolve(null);
        }
      });
    });
  }

  static async findByQRCode(qrCode) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT b.*, r.name as room_name, r.location as room_location
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id = r.id
        WHERE b.qr_code = ?
      `;
      
      db.get(query, [qrCode], (err, row) => {
        if (err) {
          logger.error('Error fetching booking by QR code:', err);
          reject(err);
        } else if (row) {
          const booking = new Booking(row);
          booking.room_name = row.room_name;
          booking.room_location = row.room_location;
          resolve(booking);
        } else {
          resolve(null);
        }
      });
    });
  }

  static async getActiveBookings() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT b.*, r.name as room_name, r.location as room_location
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id = r.id
        WHERE b.status = 'active'
        AND b.start_time <= CURRENT_TIMESTAMP
        AND b.end_time > CURRENT_TIMESTAMP
        ORDER BY b.start_time ASC
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('Error fetching active bookings:', err);
          reject(err);
        } else {
          const bookings = rows.map(row => {
            const booking = new Booking(row);
            booking.room_name = row.room_name;
            booking.room_location = row.room_location;
            return booking;
          });
          resolve(bookings);
        }
      });
    });
  }

  static async getTodayBookings() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT b.*, r.name as room_name, r.location as room_location
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id = r.id
        WHERE DATE(b.start_time) = DATE('now')
        ORDER BY b.start_time ASC
      `;
      
      db.all(query, [], (err, rows) => {
        if (err) {
          logger.error('Error fetching today bookings:', err);
          reject(err);
        } else {
          const bookings = rows.map(row => {
            const booking = new Booking(row);
            booking.room_name = row.room_name;
            booking.room_location = row.room_location;
            return booking;
          });
          resolve(bookings);
        }
      });
    });
  }

  static async checkConflict(roomId, startTime, endTime, excludeBookingId = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      let query = `
        SELECT COUNT(*) as count FROM bookings
        WHERE room_id = ?
        AND status IN ('pending', 'confirmed', 'active')
        AND (
          (start_time <= ? AND end_time > ?) OR
          (start_time < ? AND end_time >= ?) OR
          (start_time >= ? AND start_time < ?)
        )
      `;
      
      const params = [roomId, startTime, startTime, endTime, endTime, startTime, endTime];

      if (excludeBookingId) {
        query += ' AND id != ?';
        params.push(excludeBookingId);
      }

      db.get(query, params, (err, row) => {
        if (err) {
          logger.error('Error checking booking conflict:', err);
          reject(err);
        } else {
          resolve(row.count > 0);
        }
      });
    });
  }

  async save() {
    const db = database.getDb();
    
    // Generate QR code if not exists
    if (!this.qr_code) {
      this.qr_code = uuidv4();
    }

    if (this.id) {
      // Update existing booking
      return new Promise((resolve, reject) => {
        const query = `
          UPDATE bookings 
          SET room_id = ?, user_name = ?, user_email = ?, title = ?, 
              description = ?, start_time = ?, end_time = ?, status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(query, [
          this.room_id, this.user_name, this.user_email, this.title,
          this.description, this.start_time, this.end_time, this.status, this.id
        ], function(err) {
          if (err) {
            logger.error('Error updating booking:', err);
            reject(err);
          } else {
            logger.info(`Booking updated: ${this.id}`);
            resolve(this);
          }
        });
      });
    } else {
      // Create new booking
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO bookings (room_id, user_name, user_email, title, description, 
                               start_time, end_time, qr_code, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [
          this.room_id, this.user_name, this.user_email, this.title,
          this.description, this.start_time, this.end_time, this.qr_code, this.status
        ], function(err) {
          if (err) {
            logger.error('Error creating booking:', err);
            reject(err);
          } else {
            this.id = this.lastID;
            logger.info(`Booking created: ${this.lastID}`);
            resolve(this);
          }
        });
      });
    }
  }

  async delete() {
    if (!this.id) {
      throw new Error('Cannot delete booking without ID');
    }

    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'DELETE FROM bookings WHERE id = ?';
      
      db.run(query, [this.id], function(err) {
        if (err) {
          logger.error('Error deleting booking:', err);
          reject(err);
        } else {
          logger.info(`Booking deleted: ${this.id}`);
          resolve(true);
        }
      });
    });
  }

  async updateStatus(newStatus) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      db.run(query, [newStatus, this.id], function(err) {
        if (err) {
          logger.error('Error updating booking status:', err);
          reject(err);
        } else {
          this.status = newStatus;
          logger.info(`Booking ${this.id} status updated to: ${newStatus}`);
          resolve(this);
        }
      });
    });
  }

  async cancel() {
    return this.updateStatus('cancelled');
  }

  async confirm() {
    return this.updateStatus('confirmed');
  }

  async activate() {
    return this.updateStatus('active');
  }

  async complete() {
    return this.updateStatus('completed');
  }

  isActive() {
    const now = new Date();
    const startTime = new Date(this.start_time);
    const endTime = new Date(this.end_time);
    
    return this.status === 'active' && now >= startTime && now < endTime;
  }

  isUpcoming() {
    const now = new Date();
    const startTime = new Date(this.start_time);
    
    return ['pending', 'confirmed'].includes(this.status) && startTime > now;
  }

  isPast() {
    const now = new Date();
    const endTime = new Date(this.end_time);
    
    return endTime <= now;
  }

  getDuration() {
    const startTime = new Date(this.start_time);
    const endTime = new Date(this.end_time);
    
    return Math.round((endTime - startTime) / (1000 * 60)); // Duration in minutes
  }

  getRemainingTime() {
    if (!this.isActive()) return 0;
    
    const now = new Date();
    const endTime = new Date(this.end_time);
    
    return Math.max(0, Math.round((endTime - now) / (1000 * 60))); // Remaining time in minutes
  }

  toJSON() {
    return {
      id: this.id,
      room_id: this.room_id,
      room_name: this.room_name,
      room_location: this.room_location,
      user_name: this.user_name,
      user_email: this.user_email,
      title: this.title,
      description: this.description,
      start_time: this.start_time,
      end_time: this.end_time,
      qr_code: this.qr_code,
      status: this.status,
      duration: this.getDuration(),
      remaining_time: this.getRemainingTime(),
      is_active: this.isActive(),
      is_upcoming: this.isUpcoming(),
      is_past: this.isPast(),
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = Booking;