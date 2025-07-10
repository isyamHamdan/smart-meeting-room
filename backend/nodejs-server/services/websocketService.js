const logger = require('../utils/logger');
const websocketConfig = require('../config/websocket');
const Device = require('../models/Device');
const Booking = require('../models/Booking');
const Room = require('../models/Room');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedDevices = new Map();
    this.isInitialized = false;
  }

  init(io) {
    if (this.isInitialized) {
      logger.warn('WebSocket service already initialized');
      return;
    }

    this.io = io;
    websocketConfig.init(io);
    this.isInitialized = true;
    
    logger.info('WebSocket service initialized');
  }

  // Send command to specific ESP32 device
  async sendCommandToDevice(deviceId, command, commandData = {}) {
    try {
      const success = websocketConfig.sendCommandToDevice(deviceId, command, commandData);
      
      if (success) {
        // Log the command
        await Device.logSystemEvent(deviceId, 'COMMAND', 'COMMAND_SENT', {
          command,
          commandData
        });
        
        logger.info(`Command sent to device ${deviceId}: ${command}`);
        return { success: true, message: 'Command sent successfully' };
      } else {
        logger.warn(`Failed to send command to device ${deviceId}: device not connected`);
        return { success: false, message: 'Device not connected' };
      }
    } catch (error) {
      logger.error('Error sending command to device:', error);
      return { success: false, message: 'Failed to send command' };
    }
  }

  // Send command to ESP32A (Gateway/Actuator)
  async sendActuatorCommand(roomId, actuatorType, action) {
    try {
      // Find ESP32A device for the room
      const room = await Room.findById(roomId);
      if (!room || !room.esp32_id) {
        return { success: false, message: 'Room or ESP32 device not found' };
      }

      const commandData = {
        actuator: actuatorType,
        action: action,
        room_id: roomId,
        timestamp: new Date().toISOString()
      };

      const result = await this.sendCommandToDevice(room.esp32_id, 'ACTUATOR_CONTROL', commandData);
      
      if (result.success) {
        // Log actuator control
        await Device.logActuatorControl(room.esp32_id, actuatorType, action, roomId);
      }

      return result;
    } catch (error) {
      logger.error('Error sending actuator command:', error);
      return { success: false, message: 'Failed to send actuator command' };
    }
  }

  // Control room lighting
  async controlLighting(roomId, state) {
    return this.sendActuatorCommand(roomId, 'light', state ? 'on' : 'off');
  }

  // Control room AC
  async controlAC(roomId, state, temperature = null) {
    const action = state ? 'on' : 'off';
    const commandData = { state: action };
    
    if (temperature && state) {
      commandData.temperature = temperature;
    }

    return this.sendActuatorCommand(roomId, 'ac', commandData);
  }

  // Control power outlets
  async controlOutlets(roomId, state) {
    return this.sendActuatorCommand(roomId, 'outlets', state ? 'on' : 'off');
  }

  // Control door solenoid
  async controlDoor(roomId, action) {
    return this.sendActuatorCommand(roomId, 'door', action); // 'lock' or 'unlock'
  }

  // Sound buzzer
  async soundBuzzer(roomId, pattern = 'short') {
    return this.sendActuatorCommand(roomId, 'buzzer', pattern);
  }

  // Send display update to ESP32C
  async updateRoomDisplay(roomId, displayData) {
    try {
      const room = await Room.findById(roomId);
      if (!room || !room.esp32_id) {
        return { success: false, message: 'Room or ESP32 device not found' };
      }

      // Find ESP32C device (display) for the room
      const esp32CId = room.esp32_id.replace('ESP32A', 'ESP32C');
      
      const result = await this.sendCommandToDevice(esp32CId, 'DISPLAY_UPDATE', displayData);
      
      if (result.success) {
        await Device.logDisplayUpdate(esp32CId, displayData, roomId);
      }

      return result;
    } catch (error) {
      logger.error('Error updating room display:', error);
      return { success: false, message: 'Failed to update display' };
    }
  }

  // Start meeting session
  async startMeeting(bookingId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      // Update booking status to active
      await booking.activate();

      // Control room actuators
      await this.controlLighting(booking.room_id, true);
      await this.controlAC(booking.room_id, true);
      await this.controlOutlets(booking.room_id, true);
      await this.controlDoor(booking.room_id, 'unlock');

      // Update room display
      await this.updateRoomDisplay(booking.room_id, {
        status: 'meeting_active',
        title: booking.title,
        user: booking.user_name,
        start_time: booking.start_time,
        end_time: booking.end_time,
        remaining_time: booking.getRemainingTime()
      });

      // Sound welcome buzzer
      await this.soundBuzzer(booking.room_id, 'welcome');

      // Broadcast meeting started event
      this.broadcastEvent('meeting_started', {
        booking_id: bookingId,
        room_id: booking.room_id,
        timestamp: new Date().toISOString()
      });

      logger.info(`Meeting started for booking ${bookingId}`);
      return { success: true, message: 'Meeting started successfully' };
    } catch (error) {
      logger.error('Error starting meeting:', error);
      return { success: false, message: 'Failed to start meeting' };
    }
  }

  // End meeting session
  async endMeeting(bookingId) {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      // Update booking status to completed
      await booking.complete();

      // Control room actuators
      await this.controlLighting(booking.room_id, false);
      await this.controlAC(booking.room_id, false);
      await this.controlOutlets(booking.room_id, false);
      await this.controlDoor(booking.room_id, 'lock');

      // Update room display
      await this.updateRoomDisplay(booking.room_id, {
        status: 'available',
        message: 'Room Available'
      });

      // Sound goodbye buzzer
      await this.soundBuzzer(booking.room_id, 'goodbye');

      // Broadcast meeting ended event
      this.broadcastEvent('meeting_ended', {
        booking_id: bookingId,
        room_id: booking.room_id,
        timestamp: new Date().toISOString()
      });

      logger.info(`Meeting ended for booking ${bookingId}`);
      return { success: true, message: 'Meeting ended successfully' };
    } catch (error) {
      logger.error('Error ending meeting:', error);
      return { success: false, message: 'Failed to end meeting' };
    }
  }

  // Emergency shutdown
  async emergencyShutdown(roomId, reason = 'Emergency button pressed') {
    try {
      // Get current booking
      const room = await Room.findById(roomId);
      const currentBooking = await room.getCurrentBooking();

      // Emergency shutdown of all actuators
      await this.controlLighting(roomId, false);
      await this.controlAC(roomId, false);
      await this.controlOutlets(roomId, false);
      await this.controlDoor(roomId, 'unlock'); // Unlock for safety

      // Sound emergency buzzer
      await this.soundBuzzer(roomId, 'emergency');

      // Update display with emergency message
      await this.updateRoomDisplay(roomId, {
        status: 'emergency',
        message: 'EMERGENCY - EVACUATE',
        alert: true
      });

      // Cancel current booking if exists
      if (currentBooking) {
        await currentBooking.updateStatus('cancelled');
      }

      // Log emergency event
      await Device.logSystemEvent('SYSTEM', 'EMERGENCY', 'EMERGENCY_SHUTDOWN', {
        room_id: roomId,
        reason: reason,
        booking_id: currentBooking ? currentBooking.id : null
      }, roomId);

      // Broadcast emergency alert
      this.broadcastEvent('emergency_alert', {
        room_id: roomId,
        reason: reason,
        timestamp: new Date().toISOString(),
        booking_id: currentBooking ? currentBooking.id : null
      });

      logger.warn(`Emergency shutdown triggered for room ${roomId}: ${reason}`);
      return { success: true, message: 'Emergency shutdown completed' };
    } catch (error) {
      logger.error('Error during emergency shutdown:', error);
      return { success: false, message: 'Emergency shutdown failed' };
    }
  }

  // Broadcast event to all web clients
  broadcastEvent(eventType, data) {
    if (this.io) {
      this.io.emit(eventType, data);
      logger.info(`Broadcasted event: ${eventType}`);
    }
  }

  // Get connected devices status
  getConnectedDevicesStatus() {
    return websocketConfig.getDeviceStatusList();
  }

  // Check device connectivity
  isDeviceConnected(deviceId) {
    const devices = websocketConfig.getDeviceStatusList();
    return devices.some(device => device.deviceId === deviceId && device.status === 'connected');
  }

  // Send heartbeat request to all devices
  requestHeartbeat() {
    const devices = websocketConfig.getDeviceStatusList();
    devices.forEach(device => {
      this.sendCommandToDevice(device.deviceId, 'HEARTBEAT', {
        timestamp: new Date().toISOString()
      });
    });
  }

  // Start automatic room status updates
  startAutomaticUpdates() {
    // Update room displays every minute
    setInterval(async () => {
      try {
        const activeBookings = await Booking.getActiveBookings();
        
        for (const booking of activeBookings) {
          await this.updateRoomDisplay(booking.room_id, {
            status: 'meeting_active',
            title: booking.title,
            user: booking.user_name,
            remaining_time: booking.getRemainingTime()
          });
        }
      } catch (error) {
        logger.error('Error in automatic room updates:', error);
      }
    }, 60000); // Every minute

    // Send heartbeat every 30 seconds
    setInterval(() => {
      this.requestHeartbeat();
    }, 30000);

    logger.info('Automatic updates started');
  }
}

module.exports = new WebSocketService();