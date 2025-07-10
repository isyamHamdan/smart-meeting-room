const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

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

// In-memory storage for bookings and sessions
let bookings = [];
let activeSessions = [];
let esp32Clients = new Map();
let systemLogs = [];

// Utility function to log events
function logEvent(type, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        id: uuidv4(),
        timestamp,
        type,
        message,
        data
    };
    systemLogs.push(logEntry);
    console.log(`[${timestamp}] ${type}: ${message}`, data || '');
    
    // Keep only last 1000 logs
    if (systemLogs.length > 1000) {
        systemLogs = systemLogs.slice(-1000);
    }
    
    // Broadcast to all connected clients
    io.emit('system-log', logEntry);
}

// API Routes

// Get all bookings
app.get('/api/bookings', (req, res) => {
    res.json(bookings);
});

// Create new booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { userName, email, startTime, endTime, purpose } = req.body;
        
        if (!userName || !email || !startTime || !endTime) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const bookingId = uuidv4();
        const qrData = JSON.stringify({
            bookingId,
            userName,
            email,
            startTime,
            endTime
        });
        
        const qrCode = await QRCode.toDataURL(qrData);
        
        const booking = {
            id: bookingId,
            userName,
            email,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            purpose: purpose || '',
            qrCode,
            qrData,
            status: 'pending',
            createdAt: new Date()
        };
        
        bookings.push(booking);
        logEvent('BOOKING_CREATED', `New booking created for ${userName}`, booking);
        
        res.json(booking);
    } catch (error) {
        logEvent('ERROR', 'Failed to create booking', error.message);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

// Validate QR code
app.post('/api/validate-qr', (req, res) => {
    try {
        const { qrData } = req.body;
        
        if (!qrData) {
            return res.status(400).json({ error: 'QR data is required' });
        }
        
        const bookingData = JSON.parse(qrData);
        const booking = bookings.find(b => b.id === bookingData.bookingId);
        
        if (!booking) {
            logEvent('QR_VALIDATION_FAILED', 'Booking not found', bookingData);
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const now = new Date();
        const startTime = new Date(booking.startTime);
        const endTime = new Date(booking.endTime);
        
        // Check if current time is within booking window (allow 15 minutes early)
        const allowEarlyMinutes = 15;
        const earliestStart = new Date(startTime.getTime() - allowEarlyMinutes * 60000);
        
        if (now < earliestStart || now > endTime) {
            logEvent('QR_VALIDATION_FAILED', 'Booking time invalid', { booking, currentTime: now });
            return res.status(400).json({ error: 'Booking is not active at this time' });
        }
        
        booking.status = 'active';
        
        // Create active session
        const session = {
            id: uuidv4(),
            bookingId: booking.id,
            userName: booking.userName,
            startTime: now,
            endTime: booking.endTime,
            status: 'active'
        };
        
        activeSessions.push(session);
        
        logEvent('QR_VALIDATED', `QR validated for ${booking.userName}`, session);
        
        // Send unlock command to ESP32A
        sendToESP32('unlock', { target: 'door', session });
        
        res.json({ booking, session });
    } catch (error) {
        logEvent('ERROR', 'QR validation error', error.message);
        res.status(500).json({ error: 'QR validation failed' });
    }
});

// Get active sessions
app.get('/api/sessions', (req, res) => {
    res.json(activeSessions);
});

// End session
app.post('/api/sessions/:sessionId/end', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = activeSessions.find(s => s.id === sessionId);
        
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        session.status = 'ended';
        session.endTime = new Date();
        
        const booking = bookings.find(b => b.id === session.bookingId);
        if (booking) {
            booking.status = 'completed';
        }
        
        logEvent('SESSION_ENDED', `Session ended for ${session.userName}`, session);
        
        // Send lock command to ESP32A
        sendToESP32('lock', { target: 'door', session });
        
        res.json(session);
    } catch (error) {
        logEvent('ERROR', 'Failed to end session', error.message);
        res.status(500).json({ error: 'Failed to end session' });
    }
});

// Get system logs
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const logs = systemLogs.slice(-limit).reverse();
    res.json(logs);
});

// System status
app.get('/api/status', (req, res) => {
    res.json({
        server: 'running',
        timestamp: new Date().toISOString(),
        esp32Clients: esp32Clients.size,
        activeBookings: bookings.filter(b => b.status === 'active').length,
        activeSessions: activeSessions.filter(s => s.status === 'active').length,
        totalBookings: bookings.length,
        totalLogs: systemLogs.length
    });
});

// Function to send commands to ESP32
function sendToESP32(command, data = {}) {
    esp32Clients.forEach((client, clientId) => {
        try {
            client.emit('command', { cmd: command, ...data });
            logEvent('ESP32_COMMAND', `Sent command ${command} to ESP32 ${clientId}`, data);
        } catch (error) {
            logEvent('ERROR', `Failed to send command to ESP32 ${clientId}`, error.message);
        }
    });
}

// WebSocket handling
io.on('connection', (socket) => {
    logEvent('CONNECTION', `Client connected: ${socket.id}`);
    
    // Handle ESP32 identification
    socket.on('esp32-identify', (data) => {
        const { deviceId, deviceType } = data;
        esp32Clients.set(deviceId, socket);
        socket.deviceId = deviceId;
        socket.deviceType = deviceType;
        
        logEvent('ESP32_CONNECTED', `ESP32 device connected: ${deviceId} (${deviceType})`);
        
        socket.emit('identified', { status: 'ok', serverId: 'smart-meeting-room-server' });
    });
    
    // Handle ESP32 events
    socket.on('esp32-event', (data) => {
        logEvent('ESP32_EVENT', `Event from ESP32 ${socket.deviceId}`, data);
        
        // Handle different event types
        switch (data.event) {
            case 'RFID_DETECTED':
                handleRFIDEvent(data);
                break;
            case 'BUTTON_PRESSED':
                handleButtonEvent(data);
                break;
            case 'EMERGENCY_PRESSED':
                handleEmergencyEvent(data);
                break;
            default:
                logEvent('ESP32_EVENT_UNKNOWN', `Unknown event type: ${data.event}`, data);
        }
    });
    
    // Handle ESP32 status updates
    socket.on('esp32-status', (data) => {
        logEvent('ESP32_STATUS', `Status from ESP32 ${socket.deviceId}`, data);
    });
    
    socket.on('disconnect', () => {
        if (socket.deviceId) {
            esp32Clients.delete(socket.deviceId);
            logEvent('ESP32_DISCONNECTED', `ESP32 device disconnected: ${socket.deviceId}`);
        } else {
            logEvent('DISCONNECTION', `Client disconnected: ${socket.id}`);
        }
    });
});

// Event handlers
function handleRFIDEvent(data) {
    logEvent('RFID_EVENT', 'RFID card detected', data);
    // Add RFID validation logic here if needed
}

function handleButtonEvent(data) {
    logEvent('BUTTON_EVENT', 'Button pressed', data);
    
    if (data.button === 'manual_unlock') {
        // Manual unlock request - could require admin approval
        sendToESP32('unlock', { target: 'door', reason: 'manual' });
    }
}

function handleEmergencyEvent(data) {
    logEvent('EMERGENCY_EVENT', 'Emergency button pressed!', data);
    
    // Emergency unlock - immediate action
    sendToESP32('emergency_unlock', { target: 'all', reason: 'emergency' });
    
    // End all active sessions
    activeSessions.forEach(session => {
        if (session.status === 'active') {
            session.status = 'emergency_ended';
            session.endTime = new Date();
        }
    });
}

// Serve dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logEvent('SERVER_START', `Smart Meeting Room server started on port ${PORT}`);
    console.log(`Server running on http://localhost:${PORT}`);
});