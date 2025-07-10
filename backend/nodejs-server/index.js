const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for meetings and system state
let meetings = [];
let systemState = {
  esp32a_connected: false,
  door_locked: true,
  lights_on: false,
  ac_on: false,
  current_meeting: null,
  last_rfid_scan: null,
  emergency_state: false
};

// Meeting management endpoints
app.get('/api/meetings', (req, res) => {
  res.json(meetings);
});

app.post('/api/meetings', (req, res) => {
  const { title, startTime, endTime, organizer, participants } = req.body;
  
  const meeting = {
    id: uuidv4(),
    title,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    organizer,
    participants: participants || [],
    qrCode: uuidv4(), // Simple QR code generation
    status: 'scheduled',
    createdAt: new Date()
  };
  
  meetings.push(meeting);
  
  // Notify ESP32A about new meeting
  io.emit('meeting_scheduled', meeting);
  
  res.status(201).json(meeting);
});

app.get('/api/system/status', (req, res) => {
  res.json(systemState);
});

// QR Code validation endpoint
app.post('/api/validate-qr', (req, res) => {
  const { qrCode } = req.body;
  
  const meeting = meetings.find(m => m.qrCode === qrCode && m.status === 'scheduled');
  
  if (!meeting) {
    return res.status(404).json({ error: 'Invalid QR code or meeting not found' });
  }
  
  const now = new Date();
  const startTime = new Date(meeting.startTime);
  const endTime = new Date(meeting.endTime);
  
  // Check if current time is within meeting window (allow 15 min early)
  const allowEarlyMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds
  
  if (now < (startTime.getTime() - allowEarlyMinutes) || now > endTime) {
    return res.status(400).json({ error: 'Meeting time window invalid' });
  }
  
  // Update meeting status and system state
  meeting.status = 'active';
  systemState.current_meeting = meeting;
  
  // Send unlock command to ESP32A
  io.emit('unlock_room', {
    meetingId: meeting.id,
    duration: endTime.getTime() - now.getTime()
  });
  
  res.json({ success: true, meeting });
});

// WebSocket connection handling for ESP32A
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Handle ESP32A connection
  socket.on('esp32a_connect', (data) => {
    console.log('ESP32A connected:', data);
    systemState.esp32a_connected = true;
    socket.esp32a = true;
    
    // Send current system state to ESP32A
    socket.emit('system_state', systemState);
    
    // Broadcast system status update
    io.emit('system_status', systemState);
  });
  
  // Handle RFID scan events from ESP32A
  socket.on('rfid_scanned', (data) => {
    console.log('RFID scanned:', data);
    systemState.last_rfid_scan = {
      cardId: data.cardId,
      timestamp: new Date()
    };
    
    // Broadcast RFID event to dashboard
    io.emit('rfid_event', systemState.last_rfid_scan);
  });
  
  // Handle emergency button events
  socket.on('emergency_pressed', (data) => {
    console.log('Emergency button pressed:', data);
    systemState.emergency_state = true;
    
    // Unlock door immediately in emergency
    socket.emit('emergency_unlock');
    
    // Broadcast emergency state
    io.emit('emergency_state', { active: true, timestamp: new Date() });
  });
  
  // Handle manual button events
  socket.on('manual_button', (data) => {
    console.log('Manual button pressed:', data);
    
    if (systemState.current_meeting) {
      // Toggle door lock if meeting is active
      systemState.door_locked = !systemState.door_locked;
      socket.emit('door_control', { locked: systemState.door_locked });
    }
    
    io.emit('manual_action', { 
      action: 'door_toggle', 
      timestamp: new Date(),
      door_locked: systemState.door_locked 
    });
  });
  
  // Handle actuator status updates from ESP32A
  socket.on('actuator_status', (data) => {
    console.log('Actuator status update:', data);
    
    // Update system state based on ESP32A feedback
    if (data.lights !== undefined) systemState.lights_on = data.lights;
    if (data.ac !== undefined) systemState.ac_on = data.ac;
    if (data.door !== undefined) systemState.door_locked = !data.door;
    
    // Broadcast updated status
    io.emit('system_status', systemState);
  });
  
  // Dashboard commands
  socket.on('control_lights', (data) => {
    if (socket.esp32a) {
      socket.emit('lights_control', data);
    } else {
      // Forward to ESP32A if this is dashboard client
      socket.broadcast.emit('lights_control', data);
    }
  });
  
  socket.on('control_ac', (data) => {
    if (socket.esp32a) {
      socket.emit('ac_control', data);
    } else {
      socket.broadcast.emit('ac_control', data);
    }
  });
  
  socket.on('control_door', (data) => {
    if (socket.esp32a) {
      socket.emit('door_control', data);
    } else {
      socket.broadcast.emit('door_control', data);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    if (socket.esp32a) {
      systemState.esp32a_connected = false;
      io.emit('system_status', systemState);
    }
  });
});

// Cleanup completed meetings periodically
setInterval(() => {
  const now = new Date();
  meetings = meetings.filter(meeting => {
    const endTime = new Date(meeting.endTime);
    if (now > endTime && meeting.status === 'active') {
      meeting.status = 'completed';
      
      // End current meeting if it matches
      if (systemState.current_meeting && systemState.current_meeting.id === meeting.id) {
        systemState.current_meeting = null;
        systemState.door_locked = true;
        
        // Lock room after meeting ends
        io.emit('lock_room', { meetingId: meeting.id });
        io.emit('system_status', systemState);
      }
    }
    
    // Keep meetings for 24 hours after completion
    return (now.getTime() - endTime.getTime()) < (24 * 60 * 60 * 1000);
  });
}, 60000); // Check every minute

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Smart Meeting Room server running on port ${PORT}`);
  console.log(`Dashboard available at: http://localhost:${PORT}`);
});