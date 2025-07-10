const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Import services and middleware
const logger = require('./utils/logger');
const database = require('./config/database');
const websocketService = require('./services/websocketService');

// Import routes
const apiRoutes = require('./routes/api');
const bookingRoutes = require('./routes/booking');
const roomRoutes = require('./routes/room');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
database.init().then(() => {
  logger.info('Database initialized successfully');
}).catch(err => {
  logger.error('Database initialization failed:', err);
});

// Initialize WebSocket service
websocketService.init(io);

// Routes
app.use('/api', apiRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/room', roomRoutes);

// Main dashboard route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested resource was not found'
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`Smart Meeting Room Server running on port ${PORT}`);
  logger.info(`Dashboard available at http://localhost:${PORT}`);
  logger.info(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

module.exports = { app, server, io };