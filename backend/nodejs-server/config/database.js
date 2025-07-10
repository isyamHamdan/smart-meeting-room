const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Error opening database:', err);
          reject(err);
        } else {
          logger.info('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const tables = [
        // Rooms table
        `CREATE TABLE IF NOT EXISTS rooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(100) NOT NULL,
          capacity INTEGER NOT NULL,
          location VARCHAR(200),
          equipment TEXT,
          status VARCHAR(20) DEFAULT 'available',
          esp32_id VARCHAR(50),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Bookings table
        `CREATE TABLE IF NOT EXISTS bookings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          room_id INTEGER NOT NULL,
          user_name VARCHAR(100) NOT NULL,
          user_email VARCHAR(150),
          title VARCHAR(200) NOT NULL,
          description TEXT,
          start_time DATETIME NOT NULL,
          end_time DATETIME NOT NULL,
          qr_code VARCHAR(200),
          status VARCHAR(20) DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (room_id) REFERENCES rooms (id)
        )`,

        // Device events table
        `CREATE TABLE IF NOT EXISTS device_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id VARCHAR(50) NOT NULL,
          device_type VARCHAR(20) NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          event_data TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          room_id INTEGER,
          booking_id INTEGER,
          FOREIGN KEY (room_id) REFERENCES rooms (id),
          FOREIGN KEY (booking_id) REFERENCES bookings (id)
        )`,

        // System logs table
        `CREATE TABLE IF NOT EXISTS system_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level VARCHAR(10) NOT NULL,
          message TEXT NOT NULL,
          meta TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      let completed = 0;
      const total = tables.length;

      tables.forEach((table, index) => {
        this.db.run(table, (err) => {
          if (err) {
            logger.error(`Error creating table ${index}:`, err);
            reject(err);
          } else {
            completed++;
            if (completed === total) {
              logger.info('All database tables created successfully');
              this.insertDefaultData().then(resolve).catch(reject);
            }
          }
        });
      });
    });
  }

  insertDefaultData() {
    return new Promise((resolve, reject) => {
      // Insert default room if none exists
      this.db.get("SELECT COUNT(*) as count FROM rooms", (err, row) => {
        if (err) {
          reject(err);
        } else if (row.count === 0) {
          const defaultRoom = `
            INSERT INTO rooms (name, capacity, location, equipment, esp32_id)
            VALUES ('Meeting Room A', 8, 'Floor 1', 'Projector, Whiteboard, Video Conference', 'ESP32A_001')
          `;
          
          this.db.run(defaultRoom, (err) => {
            if (err) {
              logger.error('Error inserting default room:', err);
              reject(err);
            } else {
              logger.info('Default room inserted successfully');
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  }

  getDb() {
    return this.db;
  }

  close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err);
          } else {
            logger.info('Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = new Database();