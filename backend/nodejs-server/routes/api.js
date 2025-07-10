const express = require('express');
const router = express.Router();

const roomRoutes = require('./room');
const bookingRoutes = require('./booking');
const deviceController = require('../controllers/deviceController');
const { handleAsyncError, successResponse } = require('../utils/helpers');

// Mount sub-routes
router.use('/rooms', roomRoutes);
router.use('/bookings', bookingRoutes);

// Device management endpoints
router.get('/devices', handleAsyncError(deviceController.getDevices));
router.get('/devices/:deviceId/status', handleAsyncError(deviceController.getDeviceStatus));
router.get('/devices/:deviceId/events', handleAsyncError(deviceController.getDeviceEvents));
router.post('/devices/:deviceId/command', handleAsyncError(deviceController.sendDeviceCommand));

// System status endpoints
router.get('/status', handleAsyncError(async (req, res) => {
  const websocketService = require('../services/websocketService');
  const esp32Service = require('../services/esp32Service');
  
  const systemStatus = {
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    devices: esp32Service.getDeviceStatus(),
    websocket: {
      connected_devices: websocketService.getConnectedDevicesStatus().length
    }
  };
  
  res.json(successResponse(systemStatus, 'System status retrieved'));
}));

// Statistics endpoints
router.get('/stats', handleAsyncError(async (req, res) => {
  const Device = require('../models/Device');
  const Booking = require('../models/Booking');
  const Room = require('../models/Room');
  
  const { date_from, date_to } = req.query;
  
  const [deviceStats, rooms, todayBookings, activeBookings] = await Promise.all([
    Device.getSystemStats(date_from, date_to),
    Room.findAll(),
    Booking.getTodayBookings(),
    Booking.getActiveBookings()
  ]);
  
  const stats = {
    devices: deviceStats,
    rooms: {
      total: rooms.length,
      available: rooms.filter(r => r.status === 'available').length,
      occupied: rooms.filter(r => r.status === 'occupied').length
    },
    bookings: {
      today: todayBookings.length,
      active: activeBookings.length,
      by_status: {}
    }
  };
  
  // Count bookings by status
  todayBookings.forEach(booking => {
    stats.bookings.by_status[booking.status] = (stats.bookings.by_status[booking.status] || 0) + 1;
  });
  
  res.json(successResponse(stats, 'Statistics retrieved'));
}));

// QR Code endpoints
router.post('/qr/generate', handleAsyncError(async (req, res) => {
  const qrService = require('../services/qrService');
  const { booking_id } = req.body;
  
  if (!booking_id) {
    return res.status(400).json(errorResponse('Booking ID is required'));
  }
  
  const result = await qrService.generateBookingQR(booking_id);
  
  if (result.success) {
    res.json(successResponse(result, 'QR code generated'));
  } else {
    res.status(400).json(errorResponse(result.message));
  }
}));

router.post('/qr/validate', handleAsyncError(async (req, res) => {
  const qrService = require('../services/qrService');
  const { qr_code } = req.body;
  
  if (!qr_code) {
    return res.status(400).json(errorResponse('QR code is required'));
  }
  
  const result = await qrService.validateQRCode(qr_code);
  
  if (result.success) {
    res.json(successResponse(result, 'QR code validated'));
  } else {
    res.status(400).json(errorResponse(result.message));
  }
}));

// Emergency endpoints
router.post('/emergency/:roomId', handleAsyncError(async (req, res) => {
  const websocketService = require('../services/websocketService');
  const { roomId } = req.params;
  const { reason } = req.body;
  
  const result = await websocketService.emergencyShutdown(roomId, reason);
  
  if (result.success) {
    res.json(successResponse(result, 'Emergency shutdown initiated'));
  } else {
    res.status(500).json(errorResponse(result.message));
  }
}));

// Control endpoints
router.post('/control/:roomId/lights', handleAsyncError(async (req, res) => {
  const websocketService = require('../services/websocketService');
  const { roomId } = req.params;
  const { state } = req.body;
  
  const result = await websocketService.controlLighting(roomId, state);
  
  if (result.success) {
    res.json(successResponse(result, `Lights ${state ? 'turned on' : 'turned off'}`));
  } else {
    res.status(500).json(errorResponse(result.message));
  }
}));

router.post('/control/:roomId/ac', handleAsyncError(async (req, res) => {
  const websocketService = require('../services/websocketService');
  const { roomId } = req.params;
  const { state, temperature } = req.body;
  
  const result = await websocketService.controlAC(roomId, state, temperature);
  
  if (result.success) {
    res.json(successResponse(result, `AC ${state ? 'turned on' : 'turned off'}`));
  } else {
    res.status(500).json(errorResponse(result.message));
  }
}));

router.post('/control/:roomId/door', handleAsyncError(async (req, res) => {
  const websocketService = require('../services/websocketService');
  const { roomId } = req.params;
  const { action } = req.body; // 'lock' or 'unlock'
  
  const result = await websocketService.controlDoor(roomId, action);
  
  if (result.success) {
    res.json(successResponse(result, `Door ${action}ed`));
  } else {
    res.status(500).json(errorResponse(result.message));
  }
}));

// Activity feed
router.get('/activity', handleAsyncError(async (req, res) => {
  const Device = require('../models/Device');
  const { limit = 50 } = req.query;
  
  const events = await Device.getRecentEvents(parseInt(limit));
  
  res.json(successResponse(events, 'Activity feed retrieved'));
}));

// Health check
router.get('/health', (req, res) => {
  res.json(successResponse({
    status: 'healthy',
    timestamp: new Date().toISOString()
  }, 'API is healthy'));
});

module.exports = router;