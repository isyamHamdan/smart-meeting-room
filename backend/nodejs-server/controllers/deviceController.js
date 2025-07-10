const Device = require('../models/Device');
const websocketService = require('../services/websocketService');
const esp32Service = require('../services/esp32Service');
const { 
  successResponse, 
  errorResponse, 
  paginatedResponse,
  logAndReturnError
} = require('../utils/helpers');
const logger = require('../utils/logger');

const deviceController = {
  // Get all connected devices
  async getDevices(req, res) {
    try {
      const { type, room_id } = req.query;
      
      const connectedDevices = websocketService.getConnectedDevicesStatus();
      const deviceStatus = esp32Service.getDeviceStatus();

      let devices = connectedDevices;

      // Filter by device type
      if (type) {
        devices = devices.filter(device => device.deviceType === type);
      }

      // Filter by room ID
      if (room_id) {
        devices = devices.filter(device => device.roomId === parseInt(room_id));
      }

      const response = {
        devices,
        total_count: devices.length,
        connected_count: devices.filter(d => d.status === 'connected').length,
        queued_commands: deviceStatus.queued_commands,
        last_updated: new Date().toISOString()
      };

      res.json(successResponse(response, 'Devices retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get devices'));
    }
  },

  // Get specific device status
  async getDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;
      
      const connectedDevices = websocketService.getConnectedDevicesStatus();
      const device = connectedDevices.find(d => d.deviceId === deviceId);

      if (!device) {
        return res.status(404).json(errorResponse('Device not found or not connected'));
      }

      // Get device statistics
      const stats = await Device.getDeviceStats(deviceId);
      
      const deviceInfo = {
        ...device,
        statistics: stats,
        is_online: websocketService.isDeviceConnected(deviceId)
      };

      res.json(successResponse(deviceInfo, 'Device status retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get device status'));
    }
  },

  // Get device events/history
  async getDeviceEvents(req, res) {
    try {
      const { deviceId } = req.params;
      const { 
        event_type, 
        date_from, 
        date_to, 
        limit = 50, 
        page = 1 
      } = req.query;

      const filters = { device_id: deviceId };
      
      if (event_type) filters.event_type = event_type;
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;
      if (limit) filters.limit = parseInt(limit) * parseInt(page);

      const events = await Device.getEventHistory(filters);

      // Simple pagination
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedEvents = events.slice(startIndex, endIndex);

      res.json(paginatedResponse(
        paginatedEvents,
        parseInt(page),
        parseInt(limit),
        events.length
      ));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get device events'));
    }
  },

  // Send command to device
  async sendDeviceCommand(req, res) {
    try {
      const { deviceId } = req.params;
      const { command, command_data = {} } = req.body;

      if (!command) {
        return res.status(400).json(errorResponse('Command is required'));
      }

      // Check if device is connected
      if (!websocketService.isDeviceConnected(deviceId)) {
        return res.status(404).json(errorResponse('Device not connected'));
      }

      const result = await websocketService.sendCommandToDevice(deviceId, command, command_data);

      if (result.success) {
        logger.logDeviceEvent(deviceId, 'UNKNOWN', 'COMMAND_SENT', {
          command,
          command_data
        });

        res.json(successResponse(result, 'Command sent successfully'));
      } else {
        res.status(500).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Send device command'));
    }
  },

  // Handle ESP32 events (called by WebSocket service)
  async handleESP32Event(deviceId, deviceType, eventType, eventData, roomId) {
    try {
      logger.logDeviceEvent(deviceId, deviceType, eventType, eventData);

      // Log to database
      await Device.logEvent(deviceId, deviceType, eventType, eventData, roomId);

      // Handle specific events
      switch (eventType) {
        case 'RFID_SCANNED':
          return await esp32Service.handleRFIDScan(deviceId, eventData, roomId);
        
        case 'BUTTON_PRESSED':
          return await esp32Service.handleButtonPress(deviceId, eventData, roomId);
        
        case 'SENSOR_DATA':
          return await esp32Service.handleSensorData(deviceId, eventData, roomId);
        
        case 'DEVICE_CONNECTED':
          return await esp32Service.handleDeviceConnect(deviceId, eventData);
        
        case 'DEVICE_DISCONNECTED':
          return await esp32Service.handleDeviceDisconnect(deviceId, eventData);
        
        default:
          logger.info(`Unhandled ESP32 event: ${eventType} from ${deviceId}`);
          return { success: true, message: 'Event logged' };
      }
    } catch (error) {
      logger.error('Error handling ESP32 event:', error);
      return { success: false, message: 'Error processing event' };
    }
  },

  // Get device statistics
  async getDeviceStatistics(req, res) {
    try {
      const { date_from, date_to } = req.query;
      
      const stats = await Device.getSystemStats(date_from, date_to);
      
      res.json(successResponse(stats, 'Device statistics retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get device statistics'));
    }
  },

  // Get recent device events for activity feed
  async getRecentEvents(req, res) {
    try {
      const { limit = 20 } = req.query;
      
      const events = await Device.getRecentEvents(parseInt(limit));
      
      res.json(successResponse(events, 'Recent events retrieved successfully'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get recent events'));
    }
  },

  // Emergency stop all devices
  async emergencyStopAll(req, res) {
    try {
      const { reason = 'Emergency stop initiated' } = req.body;
      
      const connectedDevices = websocketService.getConnectedDevicesStatus();
      const results = [];

      for (const device of connectedDevices) {
        if (device.roomId) {
          const result = await websocketService.emergencyShutdown(device.roomId, reason);
          results.push({
            room_id: device.roomId,
            device_id: device.deviceId,
            result
          });
        }
      }

      logger.logSystemEvent('EMERGENCY_STOP_ALL', { reason, affected_devices: results.length });

      res.json(successResponse({
        affected_devices: results.length,
        results
      }, 'Emergency stop initiated for all devices'));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Emergency stop all'));
    }
  },

  // Restart device
  async restartDevice(req, res) {
    try {
      const { deviceId } = req.params;
      
      const result = await websocketService.sendCommandToDevice(deviceId, 'RESTART', {
        timestamp: new Date().toISOString()
      });

      if (result.success) {
        logger.logDeviceEvent(deviceId, 'UNKNOWN', 'RESTART_COMMAND_SENT');
        res.json(successResponse(result, 'Restart command sent successfully'));
      } else {
        res.status(500).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Restart device'));
    }
  },

  // Update device configuration
  async updateDeviceConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const { config } = req.body;

      if (!config) {
        return res.status(400).json(errorResponse('Configuration is required'));
      }

      const result = await websocketService.sendCommandToDevice(deviceId, 'UPDATE_CONFIG', config);

      if (result.success) {
        logger.logDeviceEvent(deviceId, 'UNKNOWN', 'CONFIG_UPDATED', config);
        res.json(successResponse(result, 'Device configuration updated successfully'));
      } else {
        res.status(500).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Update device config'));
    }
  },

  // Get device diagnostics
  async getDeviceDiagnostics(req, res) {
    try {
      const { deviceId } = req.params;

      // Request diagnostics from device
      const result = await websocketService.sendCommandToDevice(deviceId, 'GET_DIAGNOSTICS', {
        timestamp: new Date().toISOString()
      });

      if (result.success) {
        res.json(successResponse(result, 'Diagnostics request sent successfully'));
      } else {
        res.status(500).json(errorResponse(result.message));
      }
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Get device diagnostics'));
    }
  },

  // Cleanup old device events
  async cleanupOldEvents(req, res) {
    try {
      const { days = 30 } = req.body;
      
      const deletedCount = await Device.cleanupOldEvents(parseInt(days));
      
      logger.logSystemEvent('EVENT_CLEANUP', { deleted_events: deletedCount, days_kept: days });
      
      res.json(successResponse({
        deleted_events: deletedCount,
        days_kept: parseInt(days)
      }, `Cleaned up ${deletedCount} old events`));
    } catch (error) {
      res.status(500).json(logAndReturnError(error, 'Cleanup old events'));
    }
  }
};

module.exports = deviceController;