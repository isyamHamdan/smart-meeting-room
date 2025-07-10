const QRCode = require('qrcode');
const logger = require('../utils/logger');
const Booking = require('../models/Booking');
const { v4: uuidv4 } = require('uuid');

class QRService {
  constructor() {
    this.qrOptions = {
      type: 'png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 256
    };
  }

  // Generate QR code for booking
  async generateBookingQR(bookingId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      // Create QR code data
      const qrData = {
        type: 'booking',
        booking_id: bookingId,
        room_id: booking.room_id,
        user_email: booking.user_email,
        start_time: booking.start_time,
        end_time: booking.end_time,
        qr_code: booking.qr_code,
        timestamp: new Date().toISOString()
      };

      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), this.qrOptions);
      
      logger.info(`QR code generated for booking ${bookingId}`);
      
      return {
        success: true,
        qr_code: booking.qr_code,
        qr_image: qrCodeDataURL,
        qr_data: qrData
      };
    } catch (error) {
      logger.error('Error generating booking QR code:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Generate QR code as buffer for email attachment
  async generateQRCodeBuffer(bookingId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      const qrData = {
        type: 'booking',
        booking_id: bookingId,
        room_id: booking.room_id,
        user_email: booking.user_email,
        start_time: booking.start_time,
        end_time: booking.end_time,
        qr_code: booking.qr_code,
        timestamp: new Date().toISOString()
      };

      const qrCodeBuffer = await QRCode.toBuffer(JSON.stringify(qrData), {
        ...this.qrOptions,
        type: 'png'
      });
      
      return {
        success: true,
        buffer: qrCodeBuffer,
        filename: `booking-${bookingId}-qr.png`
      };
    } catch (error) {
      logger.error('Error generating QR code buffer:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Validate QR code and extract booking information
  async validateQRCode(qrCodeString) {
    try {
      let qrData;
      
      // Try to parse as JSON first (new format)
      try {
        qrData = JSON.parse(qrCodeString);
      } catch (parseError) {
        // If not JSON, treat as simple QR code (legacy format)
        const booking = await Booking.findByQRCode(qrCodeString);
        if (booking) {
          return {
            success: true,
            booking: booking,
            qr_data: {
              type: 'booking',
              booking_id: booking.id,
              qr_code: booking.qr_code
            }
          };
        } else {
          return {
            success: false,
            message: 'Invalid QR code or booking not found'
          };
        }
      }

      // Validate QR data structure
      if (!qrData.type || qrData.type !== 'booking') {
        return {
          success: false,
          message: 'Invalid QR code type'
        };
      }

      if (!qrData.booking_id || !qrData.qr_code) {
        return {
          success: false,
          message: 'Invalid QR code data'
        };
      }

      // Fetch booking from database
      const booking = await Booking.findById(qrData.booking_id);
      if (!booking) {
        return {
          success: false,
          message: 'Booking not found'
        };
      }

      // Verify QR code matches booking
      if (booking.qr_code !== qrData.qr_code) {
        return {
          success: false,
          message: 'QR code mismatch'
        };
      }

      // Additional validations
      const now = new Date();
      const startTime = new Date(booking.start_time);
      const endTime = new Date(booking.end_time);

      // Check if booking is in valid time window (allow 15 minutes before start)
      const earlyAccessTime = new Date(startTime.getTime() - 15 * 60 * 1000);
      
      if (now < earlyAccessTime) {
        return {
          success: false,
          message: 'Too early for this booking',
          booking: booking,
          early_access_time: earlyAccessTime
        };
      }

      if (now > endTime) {
        return {
          success: false,
          message: 'Booking has expired',
          booking: booking
        };
      }

      // Check booking status
      if (!['pending', 'confirmed'].includes(booking.status)) {
        return {
          success: false,
          message: `Booking is ${booking.status}`,
          booking: booking
        };
      }

      logger.info(`QR code validated successfully for booking ${booking.id}`);
      
      return {
        success: true,
        booking: booking,
        qr_data: qrData,
        can_start: now >= earlyAccessTime && now <= endTime
      };
    } catch (error) {
      logger.error('Error validating QR code:', error);
      return {
        success: false,
        message: 'Error validating QR code'
      };
    }
  }

  // Generate room access QR code (for general room access without booking)
  async generateRoomAccessQR(roomId, validFor = 60) {
    try {
      const accessCode = uuidv4();
      const expiresAt = new Date(Date.now() + validFor * 60 * 1000); // validFor in minutes

      const qrData = {
        type: 'room_access',
        room_id: roomId,
        access_code: accessCode,
        expires_at: expiresAt.toISOString(),
        timestamp: new Date().toISOString()
      };

      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), this.qrOptions);
      
      logger.info(`Room access QR generated for room ${roomId}, valid for ${validFor} minutes`);
      
      return {
        success: true,
        access_code: accessCode,
        qr_image: qrCodeDataURL,
        qr_data: qrData,
        expires_at: expiresAt
      };
    } catch (error) {
      logger.error('Error generating room access QR:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Generate emergency QR code
  async generateEmergencyQR(roomId, emergencyType = 'general') {
    try {
      const emergencyCode = uuidv4();

      const qrData = {
        type: 'emergency',
        room_id: roomId,
        emergency_type: emergencyType,
        emergency_code: emergencyCode,
        timestamp: new Date().toISOString()
      };

      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        ...this.qrOptions,
        color: {
          dark: '#FF0000', // Red for emergency
          light: '#FFFFFF'
        }
      });
      
      logger.info(`Emergency QR generated for room ${roomId}, type: ${emergencyType}`);
      
      return {
        success: true,
        emergency_code: emergencyCode,
        qr_image: qrCodeDataURL,
        qr_data: qrData
      };
    } catch (error) {
      logger.error('Error generating emergency QR:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Validate room access QR code
  async validateRoomAccessQR(qrCodeString) {
    try {
      const qrData = JSON.parse(qrCodeString);
      
      if (!qrData.type || qrData.type !== 'room_access') {
        return {
          success: false,
          message: 'Invalid room access QR code'
        };
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(qrData.expires_at);
      
      if (now > expiresAt) {
        return {
          success: false,
          message: 'Room access QR code has expired'
        };
      }

      return {
        success: true,
        room_id: qrData.room_id,
        access_code: qrData.access_code,
        expires_at: qrData.expires_at
      };
    } catch (error) {
      logger.error('Error validating room access QR:', error);
      return {
        success: false,
        message: 'Invalid QR code format'
      };
    }
  }

  // Generate QR code for visitor registration
  async generateVisitorQR(visitorData) {
    try {
      const visitorCode = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const qrData = {
        type: 'visitor',
        visitor_code: visitorCode,
        visitor_name: visitorData.name,
        visitor_email: visitorData.email,
        company: visitorData.company,
        purpose: visitorData.purpose,
        expires_at: expiresAt.toISOString(),
        timestamp: new Date().toISOString()
      };

      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), this.qrOptions);
      
      logger.info(`Visitor QR generated for ${visitorData.name}`);
      
      return {
        success: true,
        visitor_code: visitorCode,
        qr_image: qrCodeDataURL,
        qr_data: qrData,
        expires_at: expiresAt
      };
    } catch (error) {
      logger.error('Error generating visitor QR:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get QR code statistics
  async getQRStatistics(dateFrom = null, dateTo = null) {
    try {
      // This would typically fetch from a QR usage log table
      // For now, we'll return basic booking-based statistics
      
      const filters = {};
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;

      const bookings = await Booking.findAll(filters);
      
      const stats = {
        total_qr_generated: bookings.length,
        qr_by_status: {},
        qr_by_room: {},
        recent_scans: [] // Would come from scan log table
      };

      bookings.forEach(booking => {
        // Count by status
        stats.qr_by_status[booking.status] = (stats.qr_by_status[booking.status] || 0) + 1;
        
        // Count by room
        const roomKey = booking.room_name || `Room ${booking.room_id}`;
        stats.qr_by_room[roomKey] = (stats.qr_by_room[roomKey] || 0) + 1;
      });

      return {
        success: true,
        statistics: stats
      };
    } catch (error) {
      logger.error('Error getting QR statistics:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new QRService();