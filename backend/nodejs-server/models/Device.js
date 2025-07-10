const database = require('../config/database');
const logger = require('../utils/logger');

class Device {
  constructor(data = {}) {
    this.id = data.id;
    this.device_id = data.device_id;
    this.device_type = data.device_type; // 'ESP32A', 'ESP32B', 'ESP32C'
    this.event_type = data.event_type;
    this.event_data = data.event_data;
    this.timestamp = data.timestamp;
    this.room_id = data.room_id;
    this.booking_id = data.booking_id;
  }

  static async logEvent(deviceId, deviceType, eventType, eventData, roomId = null, bookingId = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        INSERT INTO device_events (device_id, device_type, event_type, event_data, room_id, booking_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const eventDataString = typeof eventData === 'object' ? JSON.stringify(eventData) : eventData;
      
      db.run(query, [deviceId, deviceType, eventType, eventDataString, roomId, bookingId], function(err) {
        if (err) {
          logger.error('Error logging device event:', err);
          reject(err);
        } else {
          const event = new Device({
            id: this.lastID,
            device_id: deviceId,
            device_type: deviceType,
            event_type: eventType,
            event_data: eventDataString,
            room_id: roomId,
            booking_id: bookingId,
            timestamp: new Date().toISOString()
          });
          
          logger.info(`Device event logged: ${deviceId} - ${eventType}`);
          resolve(event);
        }
      });
    });
  }

  static async getEventHistory(filters = {}) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      let query = `
        SELECT de.*, r.name as room_name, b.title as booking_title
        FROM device_events de
        LEFT JOIN rooms r ON de.room_id = r.id
        LEFT JOIN bookings b ON de.booking_id = b.id
      `;
      
      const conditions = [];
      const params = [];

      if (filters.device_id) {
        conditions.push('de.device_id = ?');
        params.push(filters.device_id);
      }

      if (filters.device_type) {
        conditions.push('de.device_type = ?');
        params.push(filters.device_type);
      }

      if (filters.event_type) {
        conditions.push('de.event_type = ?');
        params.push(filters.event_type);
      }

      if (filters.room_id) {
        conditions.push('de.room_id = ?');
        params.push(filters.room_id);
      }

      if (filters.date_from) {
        conditions.push('de.timestamp >= ?');
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        conditions.push('de.timestamp <= ?');
        params.push(filters.date_to);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY de.timestamp DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Error fetching device event history:', err);
          reject(err);
        } else {
          const events = rows.map(row => {
            const event = new Device(row);
            event.room_name = row.room_name;
            event.booking_title = row.booking_title;
            
            // Parse event_data if it's JSON
            try {
              if (event.event_data && typeof event.event_data === 'string') {
                event.event_data = JSON.parse(event.event_data);
              }
            } catch (e) {
              // Keep as string if not valid JSON
            }
            
            return event;
          });
          resolve(events);
        }
      });
    });
  }

  static async getDeviceStats(deviceId, dateFrom = null, dateTo = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      let query = `
        SELECT 
          device_type,
          event_type,
          COUNT(*) as count,
          DATE(timestamp) as date,
          MIN(timestamp) as first_event,
          MAX(timestamp) as last_event
        FROM device_events
        WHERE device_id = ?
      `;
      
      const params = [deviceId];

      if (dateFrom) {
        query += ' AND timestamp >= ?';
        params.push(dateFrom);
      }

      if (dateTo) {
        query += ' AND timestamp <= ?';
        params.push(dateTo);
      }

      query += ' GROUP BY device_type, event_type, DATE(timestamp) ORDER BY date DESC, event_type ASC';

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Error fetching device stats:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static async getSystemStats(dateFrom = null, dateTo = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      let query = `
        SELECT 
          device_type,
          COUNT(DISTINCT device_id) as device_count,
          COUNT(*) as total_events,
          COUNT(DISTINCT DATE(timestamp)) as active_days,
          MIN(timestamp) as first_event,
          MAX(timestamp) as last_event
        FROM device_events
      `;
      
      const params = [];

      if (dateFrom || dateTo) {
        query += ' WHERE ';
        const conditions = [];
        
        if (dateFrom) {
          conditions.push('timestamp >= ?');
          params.push(dateFrom);
        }

        if (dateTo) {
          conditions.push('timestamp <= ?');
          params.push(dateTo);
        }

        query += conditions.join(' AND ');
      }

      query += ' GROUP BY device_type ORDER BY device_type ASC';

      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Error fetching system stats:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static async getRecentEvents(limit = 50) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT de.*, r.name as room_name, b.title as booking_title
        FROM device_events de
        LEFT JOIN rooms r ON de.room_id = r.id
        LEFT JOIN bookings b ON de.booking_id = b.id
        ORDER BY de.timestamp DESC
        LIMIT ?
      `;

      db.all(query, [limit], (err, rows) => {
        if (err) {
          logger.error('Error fetching recent events:', err);
          reject(err);
        } else {
          const events = rows.map(row => {
            const event = new Device(row);
            event.room_name = row.room_name;
            event.booking_title = row.booking_title;
            
            // Parse event_data if it's JSON
            try {
              if (event.event_data && typeof event.event_data === 'string') {
                event.event_data = JSON.parse(event.event_data);
              }
            } catch (e) {
              // Keep as string if not valid JSON
            }
            
            return event;
          });
          resolve(events);
        }
      });
    });
  }

  static async cleanupOldEvents(daysToKeep = 30) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const query = 'DELETE FROM device_events WHERE timestamp < ?';
      
      db.run(query, [cutoffDate.toISOString()], function(err) {
        if (err) {
          logger.error('Error cleaning up old events:', err);
          reject(err);
        } else {
          logger.info(`Cleaned up ${this.changes} old device events`);
          resolve(this.changes);
        }
      });
    });
  }

  // Helper methods for specific event types
  static async logRFIDScan(deviceId, rfidData, roomId, bookingId = null) {
    return this.logEvent(deviceId, 'ESP32B', 'RFID_SCANNED', rfidData, roomId, bookingId);
  }

  static async logButtonPress(deviceId, buttonType, roomId, bookingId = null) {
    return this.logEvent(deviceId, 'ESP32B', 'BUTTON_PRESSED', { button: buttonType }, roomId, bookingId);
  }

  static async logEmergencyButton(deviceId, roomId) {
    return this.logEvent(deviceId, 'ESP32B', 'EMERGENCY_BUTTON', { emergency: true }, roomId);
  }

  static async logActuatorControl(deviceId, actuatorType, action, roomId, bookingId = null) {
    return this.logEvent(deviceId, 'ESP32A', 'ACTUATOR_CONTROL', { 
      actuator: actuatorType, 
      action: action 
    }, roomId, bookingId);
  }

  static async logDisplayUpdate(deviceId, displayData, roomId, bookingId = null) {
    return this.logEvent(deviceId, 'ESP32C', 'DISPLAY_UPDATE', displayData, roomId, bookingId);
  }

  static async logSensorData(deviceId, sensorType, sensorValue, roomId) {
    return this.logEvent(deviceId, 'ESP32B', 'SENSOR_DATA', { 
      sensor: sensorType, 
      value: sensorValue 
    }, roomId);
  }

  static async logSystemEvent(deviceId, deviceType, eventType, eventData, roomId = null) {
    return this.logEvent(deviceId, deviceType, eventType, eventData, roomId);
  }

  toJSON() {
    return {
      id: this.id,
      device_id: this.device_id,
      device_type: this.device_type,
      event_type: this.event_type,
      event_data: this.event_data,
      timestamp: this.timestamp,
      room_id: this.room_id,
      room_name: this.room_name,
      booking_id: this.booking_id,
      booking_title: this.booking_title
    };
  }
}

module.exports = Device;