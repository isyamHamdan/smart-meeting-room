const Booking = require('../models/Booking');
const Room = require('../models/Room');
const qrService = require('../services/qrService');
const websocketService = require('../services/websocketService');
const { 
  successResponse, 
  errorResponse, 
  paginatedResponse,
  validateEmail,
  validateBookingTime,
  logAndReturnError
} = require('../utils/helpers');
const logger = require('../utils/logger');

const bookingController = {
  // Get all bookings with filters
  async getAllBookings(req, res) {
    try {
      const {
        room_id,
        status,
        date,
        user_email,
        page = 1,
        limit = 20
      } = req.query;

      const filters = {};
      if (room_id) filters.room_id = room_id;
      if (status) filters.status = status;
      if (date) filters.date = date;
      if (user_email) filters.user_email = user_email;
      if (limit) filters.limit = parseInt(limit);

      const bookings = await Booking.findAll(filters);
      
      // For pagination (simplified - in production you'd want proper pagination)
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedBookings = bookings.slice(startIndex, endIndex);

      if (page && limit) {
        return res.json(paginatedResponse(
          paginatedBookings, 
          parseInt(page), 
          parseInt(limit), 
          bookings.length
        ));
      }

      res.json(successResponse(bookings, 'Bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get all bookings'));
    }
  },

  // Get booking by ID
  async getBookingById(req, res) {
    try {
      const { id } = req.params;
      const booking = await Booking.findById(id);

      if (!booking) {
        return res.status(404).json(errorResponse('Booking not found'));
      }

      res.json(successResponse(booking, 'Booking retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get booking by ID'));
    }
  },

  // Create new booking
  async createBooking(req, res) {
    try {
      const {
        room_id,
        user_name,
        user_email,
        title,
        description,
        start_time,
        end_time
      } = req.body;

      // Validation
      if (!room_id || !user_name || !user_email || !title || !start_time || !end_time) {
        return res.status(400).json(errorResponse('Missing required fields'));
      }

      if (!validateEmail(user_email)) {
        return res.status(400).json(errorResponse('Invalid email format'));
      }

      const timeValidation = validateBookingTime(start_time, end_time);
      if (!timeValidation.valid) {
        return res.status(400).json(errorResponse(timeValidation.message));
      }

      // Check if room exists
      const room = await Room.findById(room_id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      // Check for conflicts
      const hasConflict = await Booking.checkConflict(room_id, start_time, end_time);
      if (hasConflict) {
        return res.status(409).json(errorResponse('Time slot is already booked'));
      }

      // Create booking
      const booking = new Booking({
        room_id,
        user_name,
        user_email,
        title,
        description,
        start_time,
        end_time,
        status: 'pending'
      });

      await booking.save();

      logger.logBookingEvent(booking.id, 'BOOKING_CREATED', {
        room_id,
        user_email,
        start_time,
        end_time
      });

      res.status(201).json(successResponse(booking, 'Booking created successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Create booking'));
    }
  },

  // Update booking
  async updateBooking(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const booking = await Booking.findById(id);
      if (!booking) {
        return res.status(404).json(errorResponse('Booking not found'));
      }

      // Validate email if provided
      if (updates.user_email && !validateEmail(updates.user_email)) {
        return res.status(400).json(errorResponse('Invalid email format'));
      }

      // Validate time if provided
      if (updates.start_time || updates.end_time) {
        const startTime = updates.start_time || booking.start_time;
        const endTime = updates.end_time || booking.end_time;
        
        const timeValidation = validateBookingTime(startTime, endTime);
        if (!timeValidation.valid) {
          return res.status(400).json(errorResponse(timeValidation.message));
        }

        // Check for conflicts (excluding current booking)
        const hasConflict = await Booking.checkConflict(
          booking.room_id, 
          startTime, 
          endTime, 
          booking.id
        );
        if (hasConflict) {
          return res.status(409).json(errorResponse('Time slot is already booked'));
        }
      }

      // Update booking
      Object.assign(booking, updates);
      await booking.save();

      logger.logBookingEvent(booking.id, 'BOOKING_UPDATED', updates);

      res.json(successResponse(booking, 'Booking updated successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Update booking'));
    }
  },

  // Delete booking
  async deleteBooking(req, res) {
    try {
      const { id } = req.params;
      const booking = await Booking.findById(id);

      if (!booking) {
        return res.status(404).json(errorResponse('Booking not found'));
      }

      await booking.delete();

      logger.logBookingEvent(id, 'BOOKING_DELETED');

      res.json(successResponse(null, 'Booking deleted successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Delete booking'));
    }
  },

  // Update booking status
  async updateBookingStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json(errorResponse('Status is required'));
      }

      const validStatuses = ['pending', 'confirmed', 'active', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json(errorResponse('Invalid status'));
      }

      const booking = await Booking.findById(id);
      if (!booking) {
        return res.status(404).json(errorResponse('Booking not found'));
      }

      await booking.updateStatus(status);

      logger.logBookingEvent(id, 'STATUS_UPDATED', { old_status: booking.status, new_status: status });

      res.json(successResponse(booking, 'Booking status updated successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Update booking status'));
    }
  },

  // Confirm booking
  async confirmBooking(req, res) {
    try {
      const { id } = req.params;
      const booking = await Booking.findById(id);

      if (!booking) {
        return res.status(404).json(errorResponse('Booking not found'));
      }

      await booking.confirm();

      logger.logBookingEvent(id, 'BOOKING_CONFIRMED');

      res.json(successResponse(booking, 'Booking confirmed successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Confirm booking'));
    }
  },

  // Cancel booking
  async cancelBooking(req, res) {
    try {
      const { id } = req.params;
      const booking = await Booking.findById(id);

      if (!booking) {
        return res.status(404).json(errorResponse('Booking not found'));
      }

      await booking.cancel();

      logger.logBookingEvent(id, 'BOOKING_CANCELLED');

      res.json(successResponse(booking, 'Booking cancelled successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Cancel booking'));
    }
  },

  // Start booking (activate meeting)
  async startBooking(req, res) {
    try {
      const { id } = req.params;
      const result = await websocketService.startMeeting(id);

      if (result.success) {
        logger.logBookingEvent(id, 'MEETING_STARTED');
        res.json(successResponse(result, 'Meeting started successfully'));
      } else {
        res.status(400).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Start booking'));
    }
  },

  // End booking (end meeting)
  async endBooking(req, res) {
    try {
      const { id } = req.params;
      const result = await websocketService.endMeeting(id);

      if (result.success) {
        logger.logBookingEvent(id, 'MEETING_ENDED');
        res.json(successResponse(result, 'Meeting ended successfully'));
      } else {
        res.status(400).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'End booking'));
    }
  },

  // Get bookings by date
  async getBookingsByDate(req, res) {
    try {
      const { date } = req.params;
      const bookings = await Booking.findAll({ date });

      res.json(successResponse(bookings, 'Bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get bookings by date'));
    }
  },

  // Get today's bookings
  async getTodayBookings(req, res) {
    try {
      const bookings = await Booking.getTodayBookings();
      res.json(successResponse(bookings, "Today's bookings retrieved successfully"));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, "Get today's bookings"));
    }
  },

  // Get active bookings
  async getActiveBookings(req, res) {
    try {
      const bookings = await Booking.getActiveBookings();
      res.json(successResponse(bookings, 'Active bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get active bookings'));
    }
  },

  // Get upcoming bookings
  async getUpcomingBookings(req, res) {
    try {
      const { limit = 10 } = req.query;
      const bookings = await Booking.findAll({ 
        status: 'confirmed',
        limit: parseInt(limit)
      });

      // Filter upcoming bookings
      const now = new Date();
      const upcomingBookings = bookings.filter(booking => 
        new Date(booking.start_time) > now
      );

      res.json(successResponse(upcomingBookings, 'Upcoming bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get upcoming bookings'));
    }
  },

  // Get user's bookings
  async getUserBookings(req, res) {
    try {
      const { email } = req.params;
      const { status, limit } = req.query;

      const filters = { user_email: email };
      if (status) filters.status = status;
      if (limit) filters.limit = parseInt(limit);

      const bookings = await Booking.findAll(filters);

      res.json(successResponse(bookings, 'User bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get user bookings'));
    }
  },

  // Check availability
  async checkAvailability(req, res) {
    try {
      const { room_id, start_time, end_time } = req.body;

      if (!room_id || !start_time || !end_time) {
        return res.status(400).json(errorResponse('Missing required fields'));
      }

      const hasConflict = await Booking.checkConflict(room_id, start_time, end_time);
      
      res.json(successResponse({
        available: !hasConflict,
        room_id,
        start_time,
        end_time
      }, hasConflict ? 'Time slot is not available' : 'Time slot is available'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Check availability'));
    }
  },

  // Generate QR code for booking
  async generateQRCode(req, res) {
    try {
      const { id } = req.params;
      const result = await qrService.generateBookingQR(id);

      if (result.success) {
        res.json(successResponse(result, 'QR code generated successfully'));
      } else {
        res.status(400).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Generate QR code'));
    }
  },

  // Validate QR code
  async validateQRCode(req, res) {
    try {
      const { qr_code } = req.body;

      if (!qr_code) {
        return res.status(400).json(errorResponse('QR code is required'));
      }

      const result = await qrService.validateQRCode(qr_code);

      if (result.success) {
        res.json(successResponse(result, 'QR code validated successfully'));
      } else {
        res.status(400).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Validate QR code'));
    }
  }
};

module.exports = bookingController;