const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { handleAsyncError } = require('../utils/helpers');

// Get all rooms
router.get('/', handleAsyncError(roomController.getAllRooms));

// Get room by ID
router.get('/:id', handleAsyncError(roomController.getRoomById));

// Create new room
router.post('/', handleAsyncError(roomController.createRoom));

// Update room
router.put('/:id', handleAsyncError(roomController.updateRoom));

// Delete room
router.delete('/:id', handleAsyncError(roomController.deleteRoom));

// Room status management
router.patch('/:id/status', handleAsyncError(roomController.updateRoomStatus));

// Get available rooms
router.get('/available/list', handleAsyncError(roomController.getAvailableRooms));

// Get rooms availability for date/time range
router.post('/availability', handleAsyncError(roomController.checkRoomsAvailability));

// Get room's current booking
router.get('/:id/current-booking', handleAsyncError(roomController.getCurrentBooking));

// Get room's bookings
router.get('/:id/bookings', handleAsyncError(roomController.getRoomBookings));

// Get room's upcoming bookings
router.get('/:id/upcoming', handleAsyncError(roomController.getUpcomingBookings));

// Get room's booking history
router.get('/:id/history', handleAsyncError(roomController.getBookingHistory));

// Room device management
router.get('/:id/devices', handleAsyncError(roomController.getRoomDevices));
router.post('/:id/control', handleAsyncError(roomController.controlRoomDevices));

module.exports = router;