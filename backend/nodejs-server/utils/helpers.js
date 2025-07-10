const moment = require('moment');
const logger = require('./logger');

// Date and time helpers
const formatDate = (date) => {
  return moment(date).format('YYYY-MM-DD');
};

const formatDateTime = (date) => {
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
};

const formatTime = (date) => {
  return moment(date).format('HH:mm');
};

const isToday = (date) => {
  return moment(date).isSame(moment(), 'day');
};

const isTomorrow = (date) => {
  return moment(date).isSame(moment().add(1, 'day'), 'day');
};

const addMinutes = (date, minutes) => {
  return moment(date).add(minutes, 'minutes').toDate();
};

const addHours = (date, hours) => {
  return moment(date).add(hours, 'hours').toDate();
};

const addDays = (date, days) => {
  return moment(date).add(days, 'days').toDate();
};

const getTimeDifference = (startDate, endDate) => {
  const start = moment(startDate);
  const end = moment(endDate);
  return end.diff(start, 'minutes');
};

const getTimeFromNow = (date) => {
  return moment(date).fromNow();
};

const isValidTimeRange = (startTime, endTime) => {
  const start = moment(startTime);
  const end = moment(endTime);
  return start.isBefore(end);
};

// Validation helpers
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhoneNumber = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

const validateTimeSlot = (startTime, endTime, minDuration = 30) => {
  if (!isValidTimeRange(startTime, endTime)) {
    return { valid: false, message: 'End time must be after start time' };
  }

  const duration = getTimeDifference(startTime, endTime);
  if (duration < minDuration) {
    return { valid: false, message: `Minimum duration is ${minDuration} minutes` };
  }

  return { valid: true };
};

const validateBookingTime = (startTime, endTime) => {
  const now = moment();
  const start = moment(startTime);
  const end = moment(endTime);

  // Check if start time is in the past
  if (start.isBefore(now)) {
    return { valid: false, message: 'Start time cannot be in the past' };
  }

  // Check if it's within business hours (9 AM to 6 PM)
  const startHour = start.hour();
  const endHour = end.hour();
  
  if (startHour < 9 || startHour > 18 || endHour < 9 || endHour > 18) {
    return { valid: false, message: 'Bookings are only allowed between 9 AM and 6 PM' };
  }

  // Check if it's a weekend
  if (start.day() === 0 || start.day() === 6) {
    return { valid: false, message: 'Bookings are not allowed on weekends' };
  }

  return validateTimeSlot(startTime, endTime);
};

// String helpers
const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const capitalizeFirst = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const capitalizeWords = (str) => {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};

// Data helpers
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .substring(0, 1000); // Limit length
};

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  return Boolean(value);
};

const parseInteger = (value, defaultValue = 0) => {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const parseFloat = (value, defaultValue = 0.0) => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Array helpers
const removeDuplicates = (array) => {
  return [...new Set(array)];
};

const chunkArray = (array, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

const sortByProperty = (array, property, direction = 'asc') => {
  return array.sort((a, b) => {
    const aVal = a[property];
    const bVal = b[property];
    
    if (direction === 'desc') {
      return bVal > aVal ? 1 : -1;
    }
    return aVal > bVal ? 1 : -1;
  });
};

// Object helpers
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

const filterObject = (obj, keys) => {
  const filtered = {};
  keys.forEach(key => {
    if (obj.hasOwnProperty(key)) {
      filtered[key] = obj[key];
    }
  });
  return filtered;
};

const omitProperties = (obj, keysToOmit) => {
  const result = { ...obj };
  keysToOmit.forEach(key => {
    delete result[key];
  });
  return result;
};

// API response helpers
const successResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

const errorResponse = (message, errorCode = null, details = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (errorCode) response.error_code = errorCode;
  if (details) response.details = details;
  
  return response;
};

const paginatedResponse = (data, page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    success: true,
    data,
    pagination: {
      current_page: page,
      per_page: limit,
      total_items: total,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_prev_page: page > 1
    },
    timestamp: new Date().toISOString()
  };
};

// Device status helpers
const getDeviceStatusColor = (status) => {
  const statusColors = {
    'connected': 'green',
    'disconnected': 'red',
    'timeout': 'orange',
    'error': 'red',
    'pending': 'yellow'
  };
  return statusColors[status] || 'gray';
};

const getBookingStatusColor = (status) => {
  const statusColors = {
    'pending': 'yellow',
    'confirmed': 'blue',
    'active': 'green',
    'completed': 'gray',
    'cancelled': 'red'
  };
  return statusColors[status] || 'gray';
};

// Error handling helpers
const handleAsyncError = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const logAndReturnError = (error, context = '') => {
  logger.error(`${context}: ${error.message}`, { error: error.stack });
  return errorResponse('Internal server error', 'INTERNAL_ERROR');
};

// File helpers
const getFileExtension = (filename) => {
  return filename.split('.').pop().toLowerCase();
};

const isValidImageFile = (filename) => {
  const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  return validExtensions.includes(getFileExtension(filename));
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Performance helpers
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

const measureExecutionTime = async (fn, name = 'operation') => {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.logPerformance(name, duration);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.logPerformance(name, duration, { error: true });
    throw error;
  }
};

module.exports = {
  // Date/Time
  formatDate,
  formatDateTime,
  formatTime,
  isToday,
  isTomorrow,
  addMinutes,
  addHours,
  addDays,
  getTimeDifference,
  getTimeFromNow,
  isValidTimeRange,

  // Validation
  validateEmail,
  validatePhoneNumber,
  validateTimeSlot,
  validateBookingTime,

  // String manipulation
  generateRandomString,
  slugify,
  capitalizeFirst,
  capitalizeWords,

  // Data manipulation
  sanitizeInput,
  parseBoolean,
  parseInteger,
  parseFloat,

  // Array helpers
  removeDuplicates,
  chunkArray,
  sortByProperty,

  // Object helpers
  deepClone,
  filterObject,
  omitProperties,

  // API responses
  successResponse,
  errorResponse,
  paginatedResponse,

  // UI helpers
  getDeviceStatusColor,
  getBookingStatusColor,

  // Error handling
  handleAsyncError,
  logAndReturnError,

  // File helpers
  getFileExtension,
  isValidImageFile,
  formatFileSize,

  // Performance
  debounce,
  throttle,
  measureExecutionTime
};