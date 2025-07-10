const { body, query, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

const validation = {
  // Handle validation results
  handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => `${error.param}: ${error.msg}`);
      logger.warn('Validation errors:', { errors: errorMessages, body: req.body });
      return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', errorMessages));
    }
    next();
  },

  // Common validation rules
  rules: {
    // Email validation
    email: body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),

    // Required email
    requiredEmail: body('email')
      .exists()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .normalizeEmail()
      .withMessage('Must be a valid email address'),

    // Password validation
    password: body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),

    // Required string fields
    requiredString: (field, minLength = 1, maxLength = 255) => 
      body(field)
        .exists()
        .notEmpty()
        .withMessage(`${field} is required`)
        .isLength({ min: minLength, max: maxLength })
        .withMessage(`${field} must be between ${minLength} and ${maxLength} characters`)
        .trim(),

    // Optional string fields
    optionalString: (field, maxLength = 255) =>
      body(field)
        .optional()
        .isLength({ max: maxLength })
        .withMessage(`${field} must be less than ${maxLength} characters`)
        .trim(),

    // Integer validation
    integer: (field, min = 0, max = Number.MAX_SAFE_INTEGER) =>
      body(field)
        .isInt({ min, max })
        .withMessage(`${field} must be an integer between ${min} and ${max}`)
        .toInt(),

    // Required integer
    requiredInteger: (field, min = 0, max = Number.MAX_SAFE_INTEGER) =>
      body(field)
        .exists()
        .notEmpty()
        .withMessage(`${field} is required`)
        .isInt({ min, max })
        .withMessage(`${field} must be an integer between ${min} and ${max}`)
        .toInt(),

    // Boolean validation
    boolean: (field) =>
      body(field)
        .isBoolean()
        .withMessage(`${field} must be a boolean`)
        .toBoolean(),

    // Date validation
    date: (field) =>
      body(field)
        .isISO8601()
        .withMessage(`${field} must be a valid ISO 8601 date`)
        .toDate(),

    // Required date
    requiredDate: (field) =>
      body(field)
        .exists()
        .notEmpty()
        .withMessage(`${field} is required`)
        .isISO8601()
        .withMessage(`${field} must be a valid ISO 8601 date`)
        .toDate(),

    // ID parameter validation
    idParam: param('id')
      .isInt({ min: 1 })
      .withMessage('ID must be a positive integer')
      .toInt(),

    // Query pagination validation
    pagination: [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer')
        .toInt(),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
        .toInt()
    ],

    // Room capacity validation
    roomCapacity: body('capacity')
      .isInt({ min: 1, max: 100 })
      .withMessage('Capacity must be between 1 and 100')
      .toInt(),

    // Booking status validation
    bookingStatus: body('status')
      .isIn(['pending', 'confirmed', 'active', 'completed', 'cancelled'])
      .withMessage('Status must be one of: pending, confirmed, active, completed, cancelled'),

    // Room status validation
    roomStatus: body('status')
      .isIn(['available', 'occupied', 'maintenance', 'disabled'])
      .withMessage('Status must be one of: available, occupied, maintenance, disabled'),

    // Time range validation
    timeRange: [
      body('start_time')
        .exists()
        .notEmpty()
        .withMessage('Start time is required')
        .isISO8601()
        .withMessage('Start time must be a valid ISO 8601 date')
        .toDate(),
      body('end_time')
        .exists()
        .notEmpty()
        .withMessage('End time is required')
        .isISO8601()
        .withMessage('End time must be a valid ISO 8601 date')
        .toDate()
        .custom((endTime, { req }) => {
          const startTime = new Date(req.body.start_time);
          if (endTime <= startTime) {
            throw new Error('End time must be after start time');
          }
          return true;
        }),
    ],

    // Device command validation
    deviceCommand: [
      body('command')
        .exists()
        .notEmpty()
        .withMessage('Command is required')
        .isIn(['ACTUATOR_CONTROL', 'DISPLAY_UPDATE', 'HEARTBEAT', 'RESTART', 'UPDATE_CONFIG', 'GET_DIAGNOSTICS'])
        .withMessage('Invalid command type'),
      body('command_data')
        .optional()
        .isObject()
        .withMessage('Command data must be an object')
    ]
  },

  // Booking validation
  bookingValidation: [
    validation.rules.requiredInteger('room_id', 1),
    validation.rules.requiredString('user_name', 2, 100),
    validation.rules.requiredEmail,
    validation.rules.requiredString('title', 2, 200),
    validation.rules.optionalString('description', 1000),
    ...validation.rules.timeRange,
    validation.handleValidationErrors
  ],

  // Update booking validation
  updateBookingValidation: [
    validation.rules.idParam,
    validation.rules.integer('room_id', 1),
    validation.rules.optionalString('user_name', 2, 100),
    validation.rules.email,
    validation.rules.optionalString('title', 2, 200),
    validation.rules.optionalString('description', 1000),
    body('start_time').optional().isISO8601().toDate(),
    body('end_time').optional().isISO8601().toDate(),
    validation.handleValidationErrors
  ],

  // Room validation
  roomValidation: [
    validation.rules.requiredString('name', 2, 100),
    validation.rules.roomCapacity,
    validation.rules.optionalString('location', 200),
    validation.rules.optionalString('equipment', 500),
    validation.rules.optionalString('esp32_id', 50),
    validation.handleValidationErrors
  ],

  // Update room validation
  updateRoomValidation: [
    validation.rules.idParam,
    validation.rules.optionalString('name', 2, 100),
    validation.rules.integer('capacity', 1, 100),
    validation.rules.optionalString('location', 200),
    validation.rules.optionalString('equipment', 500),
    validation.rules.optionalString('esp32_id', 50),
    validation.handleValidationErrors
  ],

  // Status update validation
  statusUpdateValidation: [
    validation.rules.idParam,
    body('status').exists().notEmpty().withMessage('Status is required'),
    validation.handleValidationErrors
  ],

  // Booking status validation
  bookingStatusValidation: [
    validation.rules.idParam,
    validation.rules.bookingStatus,
    validation.handleValidationErrors
  ],

  // Room status validation
  roomStatusValidation: [
    validation.rules.idParam,
    validation.rules.roomStatus,
    validation.handleValidationErrors
  ],

  // Login validation
  loginValidation: [
    validation.rules.requiredEmail,
    body('password').exists().notEmpty().withMessage('Password is required'),
    validation.handleValidationErrors
  ],

  // QR code validation
  qrValidation: [
    body('qr_code').exists().notEmpty().withMessage('QR code is required'),
    validation.handleValidationErrors
  ],

  // Device command validation
  deviceCommandValidation: [
    param('deviceId').exists().notEmpty().withMessage('Device ID is required'),
    ...validation.rules.deviceCommand,
    validation.handleValidationErrors
  ],

  // Availability check validation
  availabilityValidation: [
    validation.rules.requiredInteger('room_id', 1),
    ...validation.rules.timeRange,
    validation.handleValidationErrors
  ],

  // Room control validation
  roomControlValidation: [
    validation.rules.idParam,
    body('action').exists().notEmpty().withMessage('Action is required'),
    body('device_type')
      .exists()
      .notEmpty()
      .withMessage('Device type is required')
      .isIn(['lights', 'ac', 'outlets', 'door', 'buzzer', 'display'])
      .withMessage('Invalid device type'),
    body('parameters').optional().isObject().withMessage('Parameters must be an object'),
    validation.handleValidationErrors
  ],

  // Query filters validation
  queryFiltersValidation: [
    query('room_id').optional().isInt({ min: 1 }).toInt(),
    query('status').optional().isString().trim(),
    query('date').optional().isISO8601().toDate(),
    query('user_email').optional().isEmail().normalizeEmail(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    validation.handleValidationErrors
  ],

  // Date range validation
  dateRangeValidation: [
    query('date_from').optional().isISO8601().toDate(),
    query('date_to').optional().isISO8601().toDate(),
    validation.handleValidationErrors
  ],

  // Custom validation for business rules
  businessRules: {
    // Validate booking time is within business hours
    validateBusinessHours(req, res, next) {
      const { start_time, end_time } = req.body;
      
      if (start_time && end_time) {
        const start = new Date(start_time);
        const end = new Date(end_time);
        
        const startHour = start.getHours();
        const endHour = end.getHours();
        
        if (startHour < 9 || startHour > 18 || endHour < 9 || endHour > 18) {
          return res.status(400).json(errorResponse('Bookings are only allowed between 9 AM and 6 PM'));
        }
        
        // Check if it's a weekend
        if (start.getDay() === 0 || start.getDay() === 6) {
          return res.status(400).json(errorResponse('Bookings are not allowed on weekends'));
        }
      }
      
      next();
    },

    // Validate booking duration
    validateBookingDuration(minMinutes = 30, maxMinutes = 480) {
      return (req, res, next) => {
        const { start_time, end_time } = req.body;
        
        if (start_time && end_time) {
          const start = new Date(start_time);
          const end = new Date(end_time);
          const durationMinutes = (end - start) / (1000 * 60);
          
          if (durationMinutes < minMinutes) {
            return res.status(400).json(errorResponse(`Minimum booking duration is ${minMinutes} minutes`));
          }
          
          if (durationMinutes > maxMinutes) {
            return res.status(400).json(errorResponse(`Maximum booking duration is ${maxMinutes} minutes`));
          }
        }
        
        next();
      };
    },

    // Validate booking is not in the past
    validateFutureBooking(req, res, next) {
      const { start_time } = req.body;
      
      if (start_time) {
        const start = new Date(start_time);
        const now = new Date();
        
        if (start <= now) {
          return res.status(400).json(errorResponse('Booking time cannot be in the past'));
        }
      }
      
      next();
    },

    // Validate advance booking limit
    validateAdvanceBooking(maxDaysAdvance = 30) {
      return (req, res, next) => {
        const { start_time } = req.body;
        
        if (start_time) {
          const start = new Date(start_time);
          const now = new Date();
          const daysAdvance = (start - now) / (1000 * 60 * 60 * 24);
          
          if (daysAdvance > maxDaysAdvance) {
            return res.status(400).json(errorResponse(`Cannot book more than ${maxDaysAdvance} days in advance`));
          }
        }
        
        next();
      };
    }
  }
};

module.exports = validation;