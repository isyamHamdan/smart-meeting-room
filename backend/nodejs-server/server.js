const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware for performance
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// In-memory storage for demo (production should use database)
const meetingRooms = {
  'room1': {
    id: 'room1',
    name: 'Conference Room 1',
    status: 'available', // available, occupied, maintenance
    currentBooking: null,
    esp32Status: {
      a: 'disconnected', // gateway
      b: 'disconnected', // sensor
      c: 'disconnected'  // display
    },
    actuators: {
      lights: false,
      ac: false,
      door: 'locked',
      buzzer: false
    }
  }
};

const activeBookings = new Map();
const connectedESP32 = new Map();

// Performance monitoring
const performanceMetrics = {
  wsResponseTime: [],
  rs485ResponseTime: [],
  averageLatency: 0
};

// WebSocket connection handling for ESP32A Gateway
io.on('connection', (socket) => {
  const startTime = Date.now();
  
  console.log(`New connection: ${socket.id} at ${new Date().toISOString()}`);
  
  // ESP32A Gateway Registration
  socket.on('esp32_register', (data) => {
    const { deviceId, type } = data;
    
    if (type === 'gateway') {
      connectedESP32.set(deviceId, {
        socketId: socket.id,
        type: 'esp32a',
        lastHeartbeat: Date.now(),
        status: 'connected'
      });
      
      // Update room status
      if (meetingRooms.room1) {
        meetingRooms.room1.esp32Status.a = 'connected';
      }
      
      console.log(`ESP32A Gateway registered: ${deviceId}`);
      
      // Send initial configuration
      socket.emit('config', {
        roomId: 'room1',
        rs485Config: {
          baudRate: 9600,
          timeout: 1000
        }
      });
    }
    
    // Broadcast updated status to web dashboard
    io.emit('system_status', {
      rooms: meetingRooms,
      connectedDevices: Array.from(connectedESP32.keys()),
      timestamp: Date.now()
    });
  });

  // Fast command processing for ESP32A
  socket.on('command', async (data) => {
    const commandStart = Date.now();
    
    try {
      const { target, action, params } = data;
      
      // Process command quickly
      const response = await processCommand(target, action, params);
      
      // Log performance
      const responseTime = Date.now() - commandStart;
      performanceMetrics.wsResponseTime.push(responseTime);
      
      socket.emit('command_response', {
        success: true,
        data: response,
        responseTime: responseTime
      });
      
      console.log(`Command processed in ${responseTime}ms: ${action} on ${target}`);
      
    } catch (error) {
      const responseTime = Date.now() - commandStart;
      
      socket.emit('command_response', {
        success: false,
        error: error.message,
        responseTime: responseTime
      });
      
      console.error(`Command failed in ${responseTime}ms:`, error);
    }
  });

  // RS485 data from ESP32B/C via ESP32A
  socket.on('rs485_data', (data) => {
    const { source, messageType, payload } = data;
    
    console.log(`RS485 data from ${source}: ${messageType}`, payload);
    
    // Process different message types quickly
    switch (messageType) {
      case 'RFID_SCAN':
        handleRFIDScan(payload);
        break;
      case 'BUTTON_PRESS':
        handleButtonPress(payload);
        break;
      case 'SENSOR_UPDATE':
        handleSensorUpdate(payload);
        break;
      case 'DISPLAY_ACK':
        handleDisplayAck(payload);
        break;
    }
    
    // Broadcast to web dashboard for real-time monitoring
    io.emit('device_event', {
      source,
      messageType,
      payload,
      timestamp: Date.now()
    });
  });

  // Heartbeat for connection monitoring
  socket.on('heartbeat', (data) => {
    const deviceId = data.deviceId;
    if (connectedESP32.has(deviceId)) {
      const device = connectedESP32.get(deviceId);
      device.lastHeartbeat = Date.now();
      connectedESP32.set(deviceId, device);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Connection disconnected: ${socket.id}`);
    
    // Find and remove disconnected ESP32
    for (const [deviceId, device] of connectedESP32.entries()) {
      if (device.socketId === socket.id) {
        connectedESP32.delete(deviceId);
        
        // Update room status
        if (meetingRooms.room1) {
          if (device.type === 'esp32a') {
            meetingRooms.room1.esp32Status.a = 'disconnected';
          }
        }
        
        console.log(`ESP32 ${deviceId} disconnected`);
        break;
      }
    }
    
    // Broadcast updated status
    io.emit('system_status', {
      rooms: meetingRooms,
      connectedDevices: Array.from(connectedESP32.keys()),
      timestamp: Date.now()
    });
    
    const connectionTime = Date.now() - startTime;
    console.log(`Connection duration: ${connectionTime}ms`);
  });
});

// Fast command processing function
async function processCommand(target, action, params) {
  const room = meetingRooms.room1;
  
  switch (target) {
    case 'door':
      if (action === 'unlock') {
        room.actuators.door = 'unlocked';
        // Send RS485 command to ESP32B
        broadcastToESP32A('rs485_command', {
          target: 'B',
          command: 'UNLOCK_DOOR',
          params: params
        });
        return { status: 'unlocked' };
      } else if (action === 'lock') {
        room.actuators.door = 'locked';
        broadcastToESP32A('rs485_command', {
          target: 'B',
          command: 'LOCK_DOOR',
          params: params
        });
        return { status: 'locked' };
      }
      break;
      
    case 'lights':
      room.actuators.lights = action === 'on';
      broadcastToESP32A('rs485_command', {
        target: 'A',
        command: action === 'on' ? 'LIGHTS_ON' : 'LIGHTS_OFF',
        params: params
      });
      return { status: action === 'on' ? 'on' : 'off' };
      
    case 'ac':
      room.actuators.ac = action === 'on';
      broadcastToESP32A('rs485_command', {
        target: 'A',
        command: action === 'on' ? 'AC_ON' : 'AC_OFF',
        params: params
      });
      return { status: action === 'on' ? 'on' : 'off' };
      
    case 'buzzer':
      room.actuators.buzzer = action === 'on';
      broadcastToESP32A('rs485_command', {
        target: 'A',
        command: action === 'on' ? 'BUZZER_ON' : 'BUZZER_OFF',
        params: params
      });
      return { status: action === 'on' ? 'on' : 'off' };
      
    case 'display':
      broadcastToESP32A('rs485_command', {
        target: 'C',
        command: 'UPDATE_DISPLAY',
        params: params
      });
      return { status: 'updated' };
  }
  
  throw new Error(`Unknown command: ${action} on ${target}`);
}

// Helper function to send commands to ESP32A
function broadcastToESP32A(event, data) {
  for (const [deviceId, device] of connectedESP32.entries()) {
    if (device.type === 'esp32a') {
      io.to(device.socketId).emit(event, data);
    }
  }
}

// Event handlers for different input types
function handleRFIDScan(payload) {
  const { cardId, timestamp } = payload;
  
  console.log(`RFID scan detected: ${cardId}`);
  
  // Quick validation (in production, check against database)
  const isValid = cardId.length === 8; // Simple validation
  
  if (isValid) {
    // Unlock door quickly
    processCommand('door', 'unlock', {});
    processCommand('lights', 'on', {});
    
    // Update display
    processCommand('display', 'update', {
      message: 'Access Granted',
      countdown: 300 // 5 minutes
    });
  } else {
    // Activate buzzer for invalid access
    processCommand('buzzer', 'on', {});
    setTimeout(() => {
      processCommand('buzzer', 'off', {});
    }, 1000);
  }
}

function handleButtonPress(payload) {
  const { buttonType, timestamp } = payload;
  
  console.log(`Button pressed: ${buttonType}`);
  
  switch (buttonType) {
    case 'manual_unlock':
      processCommand('door', 'unlock', {});
      break;
    case 'emergency':
      // Emergency unlock everything
      processCommand('door', 'unlock', {});
      processCommand('lights', 'on', {});
      processCommand('buzzer', 'on', {});
      
      // Alert system
      io.emit('emergency_alert', {
        room: 'room1',
        timestamp: Date.now()
      });
      break;
  }
}

function handleSensorUpdate(payload) {
  console.log('Sensor update:', payload);
  // Handle sensor data updates
}

function handleDisplayAck(payload) {
  console.log('Display acknowledgment:', payload);
  // Handle display confirmations
}

// REST API endpoints for web dashboard
app.get('/api/rooms', (req, res) => {
  res.json({
    success: true,
    data: Object.values(meetingRooms),
    timestamp: Date.now()
  });
});

app.get('/api/rooms/:roomId/status', (req, res) => {
  const room = meetingRooms[req.params.roomId];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  res.json({
    success: true,
    data: room,
    timestamp: Date.now()
  });
});

app.post('/api/rooms/:roomId/control', async (req, res) => {
  const { target, action, params } = req.body;
  
  try {
    const result = await processCommand(target, action, params);
    res.json({
      success: true,
      data: result,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
});

app.get('/api/performance', (req, res) => {
  const avgWsTime = performanceMetrics.wsResponseTime.length > 0 
    ? performanceMetrics.wsResponseTime.reduce((a, b) => a + b) / performanceMetrics.wsResponseTime.length 
    : 0;
    
  res.json({
    success: true,
    data: {
      averageWebSocketResponseTime: avgWsTime,
      connectedDevices: connectedESP32.size,
      totalCommands: performanceMetrics.wsResponseTime.length,
      uptime: process.uptime()
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Connection monitoring
setInterval(() => {
  const now = Date.now();
  const timeout = 30000; // 30 seconds timeout
  
  for (const [deviceId, device] of connectedESP32.entries()) {
    if (now - device.lastHeartbeat > timeout) {
      console.log(`Device ${deviceId} timed out`);
      connectedESP32.delete(deviceId);
      
      // Update room status
      if (meetingRooms.room1 && device.type === 'esp32a') {
        meetingRooms.room1.esp32Status.a = 'disconnected';
      }
    }
  }
}, 10000); // Check every 10 seconds

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Smart Meeting Room Server running on port ${PORT}`);
  console.log(`📊 Performance monitoring enabled`);
  console.log(`⚡ Optimized for fast response times`);
  console.log(`📱 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🌐 Web API: http://localhost:${PORT}/api`);
});