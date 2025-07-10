const logger = require('../utils/logger');

class WebSocketConfig {
  constructor() {
    this.connectedESP32Devices = new Map();
    this.webClients = new Set();
  }

  init(io) {
    this.io = io;
    
    io.on('connection', (socket) => {
      logger.info(`New connection established: ${socket.id}`);

      // Handle ESP32 device registration
      socket.on('esp32_register', (data) => {
        try {
          const { deviceId, deviceType, roomId } = data;
          
          this.connectedESP32Devices.set(deviceId, {
            socketId: socket.id,
            deviceType,
            roomId,
            lastSeen: new Date(),
            status: 'connected'
          });

          socket.join(`room_${roomId}`);
          socket.deviceId = deviceId;
          socket.deviceType = deviceType;
          socket.roomId = roomId;

          logger.info(`ESP32 device registered: ${deviceId} (${deviceType}) for room ${roomId}`);
          
          socket.emit('registration_success', {
            deviceId,
            timestamp: new Date().toISOString()
          });

          // Notify web clients about device connection
          this.broadcastToWebClients('device_connected', {
            deviceId,
            deviceType,
            roomId,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          logger.error('Error registering ESP32 device:', error);
          socket.emit('registration_error', { message: 'Registration failed' });
        }
      });

      // Handle web client registration
      socket.on('web_client_register', () => {
        this.webClients.add(socket.id);
        socket.isWebClient = true;
        
        logger.info(`Web client registered: ${socket.id}`);
        
        // Send current device status to new web client
        socket.emit('device_status_list', this.getDeviceStatusList());
      });

      // Handle ESP32 device events
      socket.on('esp32_event', (data) => {
        try {
          const { eventType, eventData } = data;
          const deviceId = socket.deviceId;
          
          logger.info(`ESP32 event from ${deviceId}: ${eventType}`, eventData);

          // Update last seen timestamp
          if (this.connectedESP32Devices.has(deviceId)) {
            const device = this.connectedESP32Devices.get(deviceId);
            device.lastSeen = new Date();
          }

          // Broadcast event to web clients
          this.broadcastToWebClients('esp32_event', {
            deviceId,
            eventType,
            eventData,
            timestamp: new Date().toISOString()
          });

          // Handle specific event types
          this.handleESP32Event(socket, eventType, eventData);

        } catch (error) {
          logger.error('Error handling ESP32 event:', error);
        }
      });

      // Handle commands from web clients to ESP32 devices
      socket.on('send_command', (data) => {
        try {
          const { targetDeviceId, command, commandData } = data;
          
          if (this.connectedESP32Devices.has(targetDeviceId)) {
            const device = this.connectedESP32Devices.get(targetDeviceId);
            const targetSocket = io.sockets.sockets.get(device.socketId);
            
            if (targetSocket) {
              targetSocket.emit('command', {
                command,
                commandData,
                timestamp: new Date().toISOString()
              });
              
              logger.info(`Command sent to ${targetDeviceId}: ${command}`);
              
              if (socket.isWebClient) {
                socket.emit('command_sent', {
                  targetDeviceId,
                  command,
                  timestamp: new Date().toISOString()
                });
              }
            } else {
              socket.emit('command_error', {
                message: `Device ${targetDeviceId} not reachable`
              });
            }
          } else {
            socket.emit('command_error', {
              message: `Device ${targetDeviceId} not found`
            });
          }
        } catch (error) {
          logger.error('Error sending command:', error);
          socket.emit('command_error', { message: 'Failed to send command' });
        }
      });

      // Handle heartbeat from ESP32 devices
      socket.on('heartbeat', () => {
        const deviceId = socket.deviceId;
        if (deviceId && this.connectedESP32Devices.has(deviceId)) {
          const device = this.connectedESP32Devices.get(deviceId);
          device.lastSeen = new Date();
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
        
        if (socket.deviceId) {
          // ESP32 device disconnected
          this.connectedESP32Devices.delete(socket.deviceId);
          
          this.broadcastToWebClients('device_disconnected', {
            deviceId: socket.deviceId,
            timestamp: new Date().toISOString()
          });
          
          logger.info(`ESP32 device disconnected: ${socket.deviceId}`);
        }
        
        if (socket.isWebClient) {
          // Web client disconnected
          this.webClients.delete(socket.id);
          logger.info(`Web client disconnected: ${socket.id}`);
        }
      });
    });

    // Start heartbeat check for ESP32 devices
    this.startHeartbeatCheck();
  }

  handleESP32Event(socket, eventType, eventData) {
    switch (eventType) {
      case 'RFID_SCANNED':
        // Handle RFID scan event
        break;
      
      case 'BUTTON_PRESSED':
        // Handle button press event
        break;
      
      case 'EMERGENCY_BUTTON':
        // Handle emergency button press
        this.handleEmergency(socket.roomId, eventData);
        break;
      
      case 'SENSOR_DATA':
        // Handle sensor data
        break;
      
      default:
        logger.warn(`Unknown event type: ${eventType}`);
    }
  }

  handleEmergency(roomId, eventData) {
    // Broadcast emergency to all clients
    this.io.emit('emergency_alert', {
      roomId,
      eventData,
      timestamp: new Date().toISOString()
    });
    
    logger.warn(`Emergency alert for room ${roomId}:`, eventData);
  }

  broadcastToWebClients(eventType, data) {
    this.webClients.forEach(clientId => {
      const client = this.io.sockets.sockets.get(clientId);
      if (client) {
        client.emit(eventType, data);
      }
    });
  }

  getDeviceStatusList() {
    const devices = [];
    this.connectedESP32Devices.forEach((device, deviceId) => {
      devices.push({
        deviceId,
        deviceType: device.deviceType,
        roomId: device.roomId,
        status: device.status,
        lastSeen: device.lastSeen
      });
    });
    return devices;
  }

  sendCommandToDevice(deviceId, command, commandData) {
    if (this.connectedESP32Devices.has(deviceId)) {
      const device = this.connectedESP32Devices.get(deviceId);
      const targetSocket = this.io.sockets.sockets.get(device.socketId);
      
      if (targetSocket) {
        targetSocket.emit('command', {
          command,
          commandData,
          timestamp: new Date().toISOString()
        });
        return true;
      }
    }
    return false;
  }

  startHeartbeatCheck() {
    setInterval(() => {
      const now = new Date();
      const timeoutMs = 60000; // 60 seconds timeout
      
      this.connectedESP32Devices.forEach((device, deviceId) => {
        if (now - device.lastSeen > timeoutMs) {
          logger.warn(`Device ${deviceId} heartbeat timeout`);
          device.status = 'timeout';
          
          this.broadcastToWebClients('device_timeout', {
            deviceId,
            timestamp: now.toISOString()
          });
        }
      });
    }, 30000); // Check every 30 seconds
  }
}

module.exports = new WebSocketConfig();