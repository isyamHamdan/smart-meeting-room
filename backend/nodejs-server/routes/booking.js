const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { handleAsyncError } = require('../utils/helpers');

// Get all bookings with filters
router.get('/', handleAsyncError(bookingController.getAllBookings));

// Get booking by ID
router.get('/:id', handleAsyncError(bookingController.getBookingById));

// Create new booking
router.post('/', handleAsyncError(bookingController.createBooking));

// Update booking
router.put('/:id', handleAsyncError(bookingController.updateBooking));

// Delete booking
router.delete('/:id', handleAsyncError(bookingController.deleteBooking));

// Booking status management
router.patch('/:id/status', handleAsyncError(bookingController.updateBookingStatus));
router.patch('/:id/confirm', handleAsyncError(bookingController.confirmBooking));
router.patch('/:id/cancel', handleAsyncError(bookingController.cancelBooking));
router.patch('/:id/start', handleAsyncError(bookingController.startBooking));
router.patch('/:id/end', handleAsyncError(bookingController.endBooking));

// Get bookings by date
router.get('/date/:date', handleAsyncError(bookingController.getBookingsByDate));

// Get today's bookings
router.get('/today/list', handleAsyncError(bookingController.getTodayBookings));

// Get active bookings
router.get('/active/list', handleAsyncError(bookingController.getActiveBookings));

// Get upcoming bookings
router.get('/upcoming/list', handleAsyncError(bookingController.getUpcomingBookings));

// Get user's bookings
router.get('/user/:email', handleAsyncError(bookingController.getUserBookings));

// Check availability
router.post('/check-availability', handleAsyncError(bookingController.checkAvailability));

// Generate QR code for booking
router.get('/:id/qr', handleAsyncError(bookingController.generateQRCode));

// Validate QR code
router.post('/validate-qr', handleAsyncError(bookingController.validateQRCode));

module.exports = router;