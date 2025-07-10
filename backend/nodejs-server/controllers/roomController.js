const Room = require('../models/Room');
const Booking = require('../models/Booking');
const websocketService = require('../services/websocketService');
const { 
  successResponse, 
  errorResponse, 
  paginatedResponse,
  sanitizeInput,
  logAndReturnError
} = require('../utils/helpers');
const logger = require('../utils/logger');

const roomController = {
  // Get all rooms
  async getAllRooms(req, res) {
    try {
      const rooms = await Room.findAll();
      res.json(successResponse(rooms, 'Rooms retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get all rooms'));
    }
  },

  // Get room by ID
  async getRoomById(req, res) {
    try {
      const { id } = req.params;
      const room = await Room.findById(id);

      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      // Get current booking and upcoming bookings
      const [currentBooking, upcomingBookings] = await Promise.all([
        room.getCurrentBooking(),
        room.getUpcomingBookings(5)
      ]);

      const roomData = {
        ...room.toJSON(),
        current_booking: currentBooking,
        upcoming_bookings: upcomingBookings
      };

      res.json(successResponse(roomData, 'Room retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get room by ID'));
    }
  },

  // Create new room
  async createRoom(req, res) {
    try {
      const {
        name,
        capacity,
        location,
        equipment,
        esp32_id
      } = req.body;

      // Validation
      if (!name || !capacity) {
        return res.status(400).json(errorResponse('Name and capacity are required'));
      }

      if (capacity < 1 || capacity > 100) {
        return res.status(400).json(errorResponse('Capacity must be between 1 and 100'));
      }

      // Sanitize inputs
      const room = new Room({
        name: sanitizeInput(name),
        capacity: parseInt(capacity),
        location: sanitizeInput(location),
        equipment: sanitizeInput(equipment),
        esp32_id: sanitizeInput(esp32_id),
        status: 'available'
      });

      await room.save();

      logger.logRoomEvent(room.id, 'ROOM_CREATED', {
        name,
        capacity,
        esp32_id
      });

      res.status(201).json(successResponse(room, 'Room created successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Create room'));
    }
  },

  // Update room
  async updateRoom(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const room = await Room.findById(id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      // Validate capacity if provided
      if (updates.capacity && (updates.capacity < 1 || updates.capacity > 100)) {
        return res.status(400).json(errorResponse('Capacity must be between 1 and 100'));
      }

      // Sanitize string inputs
      const sanitizedUpdates = {};
      Object.keys(updates).forEach(key => {
        if (typeof updates[key] === 'string') {
          sanitizedUpdates[key] = sanitizeInput(updates[key]);
        } else {
          sanitizedUpdates[key] = updates[key];
        }
      });

      // Update room
      Object.assign(room, sanitizedUpdates);
      await room.save();

      logger.logRoomEvent(room.id, 'ROOM_UPDATED', sanitizedUpdates);

      res.json(successResponse(room, 'Room updated successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Update room'));
    }
  },

  // Delete room
  async deleteRoom(req, res) {
    try {
      const { id } = req.params;
      const room = await Room.findById(id);

      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      // Check if room has active bookings
      const currentBooking = await room.getCurrentBooking();
      if (currentBooking) {
        return res.status(400).json(errorResponse('Cannot delete room with active booking'));
      }

      // Check if room has future bookings
      const upcomingBookings = await room.getUpcomingBookings(1);
      if (upcomingBookings.length > 0) {
        return res.status(400).json(errorResponse('Cannot delete room with upcoming bookings'));
      }

      await room.delete();

      logger.logRoomEvent(id, 'ROOM_DELETED');

      res.json(successResponse(null, 'Room deleted successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Delete room'));
    }
  },

  // Update room status
  async updateRoomStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json(errorResponse('Status is required'));
      }

      const validStatuses = ['available', 'occupied', 'maintenance', 'disabled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json(errorResponse('Invalid status'));
      }

      const room = await Room.findById(id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      const oldStatus = room.status;
      await room.updateStatus(status);

      logger.logRoomEvent(id, 'STATUS_UPDATED', { 
        old_status: oldStatus, 
        new_status: status 
      });

      res.json(successResponse(room, 'Room status updated successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Update room status'));
    }
  },

  // Get available rooms
  async getAvailableRooms(req, res) {
    try {
      const { start_time, end_time } = req.query;

      let rooms;
      if (start_time && end_time) {
        rooms = await Room.getAvailableRooms(start_time, end_time);
      } else {
        const allRooms = await Room.findAll();
        rooms = allRooms.filter(room => room.status === 'available');
      }

      res.json(successResponse(rooms, 'Available rooms retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get available rooms'));
    }
  },

  // Check rooms availability for date/time range
  async checkRoomsAvailability(req, res) {
    try {
      const { start_time, end_time } = req.body;

      if (!start_time || !end_time) {
        return res.status(400).json(errorResponse('Start time and end time are required'));
      }

      const [allRooms, availableRooms] = await Promise.all([
        Room.findAll(),
        Room.getAvailableRooms(start_time, end_time)
      ]);

      const availabilityMap = {};
      
      // Mark all rooms as unavailable first
      allRooms.forEach(room => {
        availabilityMap[room.id] = {
          room: room.toJSON(),
          available: false,
          reason: 'Booked or unavailable'
        };
      });

      // Mark available rooms
      availableRooms.forEach(room => {
        availabilityMap[room.id] = {
          room: room.toJSON(),
          available: true,
          reason: null
        };
      });

      res.json(successResponse({
        start_time,
        end_time,
        rooms: Object.values(availabilityMap)
      }, 'Room availability checked successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Check rooms availability'));
    }
  },

  // Get room's current booking
  async getCurrentBooking(req, res) {
    try {
      const { id } = req.params;
      const room = await Room.findById(id);

      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      const currentBooking = await room.getCurrentBooking();

      res.json(successResponse(currentBooking, 'Current booking retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get current booking'));
    }
  },

  // Get room's bookings
  async getRoomBookings(req, res) {
    try {
      const { id } = req.params;
      const { status, limit, page = 1 } = req.query;

      const room = await Room.findById(id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      const filters = { room_id: id };
      if (status) filters.status = status;
      if (limit) filters.limit = parseInt(limit);

      const bookings = await Booking.findAll(filters);

      // Simple pagination
      if (page && limit) {
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedBookings = bookings.slice(startIndex, endIndex);

        return res.json(paginatedResponse(
          paginatedBookings,
          parseInt(page),
          parseInt(limit),
          bookings.length
        ));
      }

      res.json(successResponse(bookings, 'Room bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get room bookings'));
    }
  },

  // Get room's upcoming bookings
  async getUpcomingBookings(req, res) {
    try {
      const { id } = req.params;
      const { limit = 5 } = req.query;

      const room = await Room.findById(id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      const upcomingBookings = await room.getUpcomingBookings(parseInt(limit));

      res.json(successResponse(upcomingBookings, 'Upcoming bookings retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get upcoming bookings'));
    }
  },

  // Get room's booking history
  async getBookingHistory(req, res) {
    try {
      const { id } = req.params;
      const { days = 30, page = 1, limit = 20 } = req.query;

      const room = await Room.findById(id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - parseInt(days));

      const bookings = await Booking.findAll({
        room_id: id,
        date_from: dateFrom.toISOString(),
        limit: parseInt(limit) * parseInt(page) // Simple pagination
      });

      // Filter past bookings
      const pastBookings = bookings.filter(booking => booking.isPast());

      // Simple pagination
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedBookings = pastBookings.slice(startIndex, endIndex);

      res.json(paginatedResponse(
        paginatedBookings,
        parseInt(page),
        parseInt(limit),
        pastBookings.length
      ));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get booking history'));
    }
  },

  // Get room devices
  async getRoomDevices(req, res) {
    try {
      const { id } = req.params;
      const room = await Room.findById(id);

      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      const esp32Service = require('../services/esp32Service');
      const deviceStatus = esp32Service.getDeviceStatus();

      // Filter devices for this room
      const roomDevices = deviceStatus.connected_devices.filter(
        device => device.roomId === parseInt(id)
      );

      res.json(successResponse({
        room_id: id,
        esp32_id: room.esp32_id,
        connected_devices: roomDevices,
        device_count: roomDevices.length
      }, 'Room devices retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get room devices'));
    }
  },

  // Control room devices
  async controlRoomDevices(req, res) {
    try {
      const { id } = req.params;
      const { action, device_type, parameters = {} } = req.body;

      if (!action || !device_type) {
        return res.status(400).json(errorResponse('Action and device type are required'));
      }

      const room = await Room.findById(id);
      if (!room) {
        return res.status(404).json(errorResponse('Room not found'));
      }

      let result;

      switch (device_type) {
        case 'lights':
          result = await websocketService.controlLighting(id, parameters.state);
          break;
        
        case 'ac':
          result = await websocketService.controlAC(id, parameters.state, parameters.temperature);
          break;
        
        case 'outlets':
          result = await websocketService.controlOutlets(id, parameters.state);
          break;
        
        case 'door':
          result = await websocketService.controlDoor(id, parameters.action);
          break;
        
        case 'buzzer':
          result = await websocketService.soundBuzzer(id, parameters.pattern);
          break;
        
        case 'display':
          result = await websocketService.updateRoomDisplay(id, parameters.display_data);
          break;
        
        default:
          return res.status(400).json(errorResponse('Invalid device type'));
      }

      if (result.success) {
        logger.logRoomEvent(id, 'DEVICE_CONTROLLED', {
          device_type,
          action,
          parameters
        });

        res.json(successResponse(result, 'Device controlled successfully'));
      } else {
        res.status(500).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Control room devices'));
    }
  }
};

module.exports = roomController;