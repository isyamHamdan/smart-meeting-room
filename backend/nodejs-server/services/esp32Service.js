const logger = require('../utils/logger');
const websocketService = require('./websocketService');
const Device = require('../models/Device');
const Room = require('../models/Room');
const Booking = require('../models/Booking');

class ESP32Service {
  constructor() {
    this.deviceCommandQueue = new Map(); // Queue commands for offline devices
    this.deviceLastSeen = new Map(); // Track device connectivity
  }

  // Handle RFID scan event from ESP32B
  async handleRFIDScan(deviceId, rfidData, roomId) {
    try {
      logger.info(`RFID scanned on device ${deviceId}: ${rfidData.rfid_id}`);
      
      // Log the RFID scan event
      await Device.logRFIDScan(deviceId, rfidData, roomId);

      // Check if RFID corresponds to a valid booking QR code
      const booking = await Booking.findByQRCode(rfidData.rfid_id);
      
      if (booking) {
        // Valid booking found
        logger.info(`Valid booking found for RFID: ${booking.id}`);
        
        // Start the meeting if conditions are met
        const result = await websocketService.startMeeting(booking.id);
        
        // Send response back to ESP32A
        if (result.success) {
          await this.sendESP32Response(deviceId, 'RFID_VALIDATED', {
            booking_id: booking.id,
            user_name: booking.user_name,
            room_access: 'granted'
          });
        } else {
          await this.sendESP32Response(deviceId, 'RFID_REJECTED', {
            reason: result.message
          });
        }
        
        return result;
      } else {
        // Invalid RFID
        logger.warn(`Invalid RFID scanned: ${rfidData.rfid_id}`);
        
        await this.sendESP32Response(deviceId, 'RFID_REJECTED', {
          reason: 'Invalid booking code'
        });
        
        return { success: false, message: 'Invalid RFID' };
      }
    } catch (error) {
      logger.error('Error handling RFID scan:', error);
      
      await this.sendESP32Response(deviceId, 'RFID_ERROR', {
        reason: 'System error'
      });
      
      return { success: false, message: 'System error' };
    }
  }

  // Handle button press event from ESP32B
  async handleButtonPress(deviceId, buttonData, roomId) {
    try {
      const { button_type, button_id } = buttonData;
      
      logger.info(`Button pressed on device ${deviceId}: ${button_type}`);
      
      // Log the button press event
      await Device.logButtonPress(deviceId, button_type, roomId);

      let result = { success: true };

      switch (button_type) {
        case 'manual_start':
          result = await this.handleManualStart(roomId);
          break;
          
        case 'manual_end':
          result = await this.handleManualEnd(roomId);
          break;
          
        case 'emergency':
          result = await this.handleEmergencyButton(deviceId, roomId);
          break;
          
        case 'call_assistance':
          result = await this.handleAssistanceCall(roomId);
          break;
          
        default:
          logger.warn(`Unknown button type: ${button_type}`);
          result = { success: false, message: 'Unknown button type' };
      }

      // Send response back to ESP32
      await this.sendESP32Response(deviceId, 'BUTTON_RESPONSE', {
        button_type,
        action_result: result.success ? 'success' : 'failed',
        message: result.message
      });

      return result;
    } catch (error) {
      logger.error('Error handling button press:', error);
      return { success: false, message: 'System error' };
    }
  }

  // Handle manual meeting start
  async handleManualStart(roomId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        return { success: false, message: 'Room not found' };
      }

      // Check if there's an upcoming booking
      const upcomingBookings = await room.getUpcomingBookings(1);
      
      if (upcomingBookings.length > 0) {
        const nextBooking = upcomingBookings[0];
        const now = new Date();
        const startTime = new Date(nextBooking.start_time);
        
        // Allow manual start if within 15 minutes of scheduled time
        if (Math.abs(now - startTime) <= 15 * 60 * 1000) {
          return await websocketService.startMeeting(nextBooking.id);
        }
      }

      // No valid booking found
      return { success: false, message: 'No valid booking for manual start' };
    } catch (error) {
      logger.error('Error handling manual start:', error);
      return { success: false, message: 'System error' };
    }
  }

  // Handle manual meeting end
  async handleManualEnd(roomId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        return { success: false, message: 'Room not found' };
      }

      // Check if there's an active booking
      const currentBooking = await room.getCurrentBooking();
      
      if (currentBooking) {
        return await websocketService.endMeeting(currentBooking.id);
      } else {
        return { success: false, message: 'No active meeting to end' };
      }
    } catch (error) {
      logger.error('Error handling manual end:', error);
      return { success: false, message: 'System error' };
    }
  }

  // Handle emergency button press
  async handleEmergencyButton(deviceId, roomId) {
    try {
      logger.warn(`Emergency button pressed on device ${deviceId} in room ${roomId}`);
      
      // Log emergency event
      await Device.logEmergencyButton(deviceId, roomId);
      
      // Trigger emergency shutdown
      return await websocketService.emergencyShutdown(roomId, 'Emergency button pressed');
    } catch (error) {
      logger.error('Error handling emergency button:', error);
      return { success: false, message: 'Emergency system error' };
    }
  }

  // Handle assistance call
  async handleAssistanceCall(roomId) {
    try {
      logger.info(`Assistance called for room ${roomId}`);
      
      // Log assistance call
      await Device.logSystemEvent('SYSTEM', 'USER_ACTION', 'ASSISTANCE_CALLED', {
        room_id: roomId
      }, roomId);
      
      // Broadcast assistance request
      websocketService.broadcastEvent('assistance_requested', {
        room_id: roomId,
        timestamp: new Date().toISOString()
      });
      
      // You could integrate with external systems here (email, Slack, etc.)
      
      return { success: true, message: 'Assistance request sent' };
    } catch (error) {
      logger.error('Error handling assistance call:', error);
      return { success: false, message: 'Failed to call assistance' };
    }
  }

  // Handle sensor data from ESP32B
  async handleSensorData(deviceId, sensorData, roomId) {
    try {
      const { sensor_type, value, unit } = sensorData;
      
      // Log sensor data
      await Device.logSensorData(deviceId, sensor_type, value, roomId);
      
      // Process specific sensor types
      switch (sensor_type) {
        case 'temperature':
          await this.procesTemperatureData(roomId, value, unit);
          break;
          
        case 'humidity':
          await this.processHumidityData(roomId, value, unit);
          break;
          
        case 'motion':
          await this.processMotionData(roomId, value);
          break;
          
        case 'occupancy':
          await this.processOccupancyData(roomId, value);
          break;
          
        default:
          logger.info(`Sensor data received: ${sensor_type} = ${value} ${unit || ''}`);
      }
      
      return { success: true, message: 'Sensor data processed' };
    } catch (error) {
      logger.error('Error handling sensor data:', error);
      return { success: false, message: 'Failed to process sensor data' };
    }
  }

  // Process temperature sensor data
  async procesTemperatureData(roomId, temperature, unit) {
    // Auto-adjust AC if temperature is out of range
    if (unit === 'C' || unit === 'Celsius') {
      if (temperature > 28) {
        logger.info(`High temperature detected (${temperature}°C), adjusting AC`);
        await websocketService.controlAC(roomId, true, 22);
      } else if (temperature < 18) {
        logger.info(`Low temperature detected (${temperature}°C), adjusting AC`);
        await websocketService.controlAC(roomId, true, 24);
      }
    }
  }

  // Process humidity sensor data
  async processHumidityData(roomId, humidity, unit) {
    // Log humidity levels for facility management
    if (humidity > 70) {
      logger.warn(`High humidity detected in room ${roomId}: ${humidity}%`);
    } else if (humidity < 30) {
      logger.warn(`Low humidity detected in room ${roomId}: ${humidity}%`);
    }
  }

  // Process motion sensor data
  async processMotionData(roomId, motionDetected) {
    if (motionDetected) {
      logger.info(`Motion detected in room ${roomId}`);
      
      // Check if room should be available but has motion
      const room = await Room.findById(roomId);
      const currentBooking = await room.getCurrentBooking();
      
      if (!currentBooking) {
        // Motion in unbooked room - could indicate unauthorized access
        websocketService.broadcastEvent('unauthorized_motion', {
          room_id: roomId,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  // Process occupancy sensor data
  async processOccupancyData(roomId, occupancyCount) {
    logger.info(`Occupancy count in room ${roomId}: ${occupancyCount}`);
    
    // Update room display with occupancy info
    await websocketService.updateRoomDisplay(roomId, {
      occupancy_count: occupancyCount,
      last_updated: new Date().toISOString()
    });
  }

  // Send response back to ESP32 device
  async sendESP32Response(deviceId, responseType, responseData) {
    try {
      const success = await websocketService.sendCommandToDevice(deviceId, responseType, responseData);
      
      if (success.success) {
        logger.info(`Response sent to ESP32 ${deviceId}: ${responseType}`);
      } else {
        logger.warn(`Failed to send response to ESP32 ${deviceId}: ${success.message}`);
      }
      
      return success;
    } catch (error) {
      logger.error('Error sending ESP32 response:', error);
      return { success: false, message: 'Failed to send response' };
    }
  }

  // Handle device connection
  async handleDeviceConnect(deviceId, deviceInfo) {
    try {
      this.deviceLastSeen.set(deviceId, new Date());
      
      logger.info(`ESP32 device connected: ${deviceId}`);
      
      // Log device connection
      await Device.logSystemEvent(deviceId, deviceInfo.device_type, 'DEVICE_CONNECTED', deviceInfo, deviceInfo.room_id);
      
      // Send any queued commands
      if (this.deviceCommandQueue.has(deviceId)) {
        const queuedCommands = this.deviceCommandQueue.get(deviceId);
        for (const command of queuedCommands) {
          await websocketService.sendCommandToDevice(deviceId, command.type, command.data);
        }
        this.deviceCommandQueue.delete(deviceId);
        logger.info(`Sent ${queuedCommands.length} queued commands to ${deviceId}`);
      }
      
      return { success: true };
    } catch (error) {
      logger.error('Error handling device connect:', error);
      return { success: false, message: 'Failed to handle device connection' };
    }
  }

  // Handle device disconnection
  async handleDeviceDisconnect(deviceId, deviceInfo) {
    try {
      logger.warn(`ESP32 device disconnected: ${deviceId}`);
      
      // Log device disconnection
      await Device.logSystemEvent(deviceId, deviceInfo.device_type, 'DEVICE_DISCONNECTED', deviceInfo, deviceInfo.room_id);
      
      return { success: true };
    } catch (error) {
      logger.error('Error handling device disconnect:', error);
      return { success: false, message: 'Failed to handle device disconnection' };
    }
  }

  // Queue command for offline device
  queueCommandForDevice(deviceId, commandType, commandData) {
    if (!this.deviceCommandQueue.has(deviceId)) {
      this.deviceCommandQueue.set(deviceId, []);
    }
    
    this.deviceCommandQueue.get(deviceId).push({
      type: commandType,
      data: commandData,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Command queued for offline device ${deviceId}: ${commandType}`);
  }

  // Get device status and statistics
  getDeviceStatus() {
    const connectedDevices = websocketService.getConnectedDevicesStatus();
    const queuedCommands = {};
    
    this.deviceCommandQueue.forEach((commands, deviceId) => {
      queuedCommands[deviceId] = commands.length;
    });
    
    return {
      connected_devices: connectedDevices,
      queued_commands: queuedCommands,
      last_seen: Object.fromEntries(this.deviceLastSeen)
    };
  }

  // Clean up old queued commands
  cleanupQueuedCommands(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = new Date();
    
    this.deviceCommandQueue.forEach((commands, deviceId) => {
      const filteredCommands = commands.filter(command => {
        const commandTime = new Date(command.timestamp);
        return (now - commandTime) < maxAge;
      });
      
      if (filteredCommands.length !== commands.length) {
        this.deviceCommandQueue.set(deviceId, filteredCommands);
        logger.info(`Cleaned up ${commands.length - filteredCommands.length} old commands for device ${deviceId}`);
      }
    });
  }
}

module.exports = new ESP32Service();