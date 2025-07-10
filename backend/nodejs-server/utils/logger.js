const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: format,
    level: process.env.LOG_LEVEL || 'info'
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '..', 'logs', 'app.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    level: 'info'
  }),
  
  // File transport for error logs only
  new winston.transports.File({
    filename: path.join(__dirname, '..', 'logs', 'error.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    level: 'error'
  })
];

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false
});

// If we're not in production, log to the console with the colorized simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    level: 'debug'
  }));
}

// Add database logging transport
if (process.env.DB_LOGGING === 'true') {
  class DatabaseTransport extends winston.Transport {
    constructor(options) {
      super(options);
    }

    log(info, callback) {
      setImmediate(() => {
        // Only log to database in production or when explicitly enabled
        try {
          // Import database here to avoid circular dependency
          const database = require('../config/database');
          const db = database.getDb();
          
          if (db) {
            const query = 'INSERT INTO system_logs (level, message, meta) VALUES (?, ?, ?)';
            const meta = JSON.stringify({
              timestamp: info.timestamp,
              ...info.meta
            });
            
            db.run(query, [info.level, info.message, meta], (err) => {
              if (err) {
                console.error('Error logging to database:', err);
              }
            });
          }
        } catch (error) {
          console.error('Database logging error:', error);
        }
      });
      
      callback();
    }
  }

  logger.add(new DatabaseTransport({
    level: 'error' // Only log errors to database by default
  }));
}

// Create a stream object for morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Helper methods for structured logging
logger.logBookingEvent = (bookingId, event, data = {}) => {
  logger.info(`Booking ${bookingId}: ${event}`, {
    booking_id: bookingId,
    event_type: event,
    ...data
  });
};

logger.logDeviceEvent = (deviceId, deviceType, event, data = {}) => {
  logger.info(`Device ${deviceId} (${deviceType}): ${event}`, {
    device_id: deviceId,
    device_type: deviceType,
    event_type: event,
    ...data
  });
};

logger.logRoomEvent = (roomId, event, data = {}) => {
  logger.info(`Room ${roomId}: ${event}`, {
    room_id: roomId,
    event_type: event,
    ...data
  });
};

logger.logUserAction = (userId, action, data = {}) => {
  logger.info(`User ${userId}: ${action}`, {
    user_id: userId,
    action_type: action,
    ...data
  });
};

logger.logSystemEvent = (event, data = {}) => {
  logger.info(`System: ${event}`, {
    event_type: event,
    ...data
  });
};

logger.logSecurity = (event, data = {}) => {
  logger.warn(`Security: ${event}`, {
    security_event: true,
    event_type: event,
    ...data
  });
};

logger.logPerformance = (operation, duration, data = {}) => {
  const level = duration > 1000 ? 'warn' : 'info';
  logger[level](`Performance: ${operation} took ${duration}ms`, {
    performance_metric: true,
    operation,
    duration_ms: duration,
    ...data
  });
};

// Error handling for uncaught exceptions and unhandled rejections
if (process.env.NODE_ENV === 'production') {
  logger.exceptions.handle(
    new winston.transports.File({
      filename: path.join(__dirname, '..', 'logs', 'exceptions.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );

  logger.rejections.handle(
    new winston.transports.File({
      filename: path.join(__dirname, '..', 'logs', 'rejections.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  );
}

// Log rotation setup (optional)
if (process.env.LOG_ROTATION === 'true') {
  require('winston-daily-rotate-file');
  
  const dailyRotateFileTransport = new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '..', 'logs', 'smart-meeting-room-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
  });

  logger.add(dailyRotateFileTransport);
}

module.exports = logger;