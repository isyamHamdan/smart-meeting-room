# Smart Meeting Room - Node.js Backend

This is the Node.js backend server for the Smart Meeting Room system, providing WebSocket communication with ESP32 devices and a web dashboard for management.

## Project Structure

```
backend/nodejs-server/
├── index.js                 # Main server entry point
├── package.json             # Dependencies and scripts
├── .env                     # Environment configuration
├── config/                  # Configuration files
│   ├── database.js          # SQLite database setup
│   └── websocket.js         # WebSocket configuration
├── controllers/             # API route controllers
│   ├── bookingController.js # Booking management
│   ├── roomController.js    # Room management
│   └── deviceController.js  # Device management
├── models/                  # Data models
│   ├── Booking.js           # Booking model
│   ├── Room.js              # Room model
│   └── Device.js            # Device event model
├── routes/                  # API routes
│   ├── api.js               # Main API routes
│   ├── booking.js           # Booking routes
│   └── room.js              # Room routes
├── middleware/              # Express middleware
│   ├── auth.js              # Authentication middleware
│   └── validation.js        # Input validation
├── services/                # Business logic services
│   ├── websocketService.js  # WebSocket communication
│   ├── qrService.js         # QR code generation/validation
│   └── esp32Service.js      # ESP32 device handling
├── utils/                   # Utility functions
│   ├── logger.js            # Logging configuration
│   └── helpers.js           # Helper functions
├── public/                  # Static web files
│   ├── index.html           # Dashboard HTML
│   ├── css/
│   │   └── dashboard.css    # Dashboard styles
│   └── js/
│       └── dashboard.js     # Dashboard JavaScript
└── logs/                    # Log files (auto-created)
```

## Features

### Core Functionality
- **RESTful API** for room and booking management
- **WebSocket communication** with ESP32 devices
- **Real-time dashboard** for monitoring and control
- **QR code generation** for booking validation
- **SQLite database** for data persistence
- **Device event logging** and history

### API Endpoints

#### Rooms
- `GET /api/rooms` - Get all rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:id` - Get room details
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room
- `POST /api/rooms/:id/control` - Control room devices

#### Bookings
- `GET /api/bookings` - Get all bookings (with filters)
- `POST /api/bookings` - Create new booking
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id` - Update booking
- `DELETE /api/bookings/:id` - Delete booking
- `PATCH /api/bookings/:id/start` - Start meeting
- `PATCH /api/bookings/:id/end` - End meeting

#### Devices
- `GET /api/devices` - Get connected devices
- `GET /api/devices/:id/status` - Get device status
- `POST /api/devices/:id/command` - Send command to device

#### System
- `GET /api/stats` - Get system statistics
- `GET /api/health` - Health check
- `GET /api/activity` - Recent activity feed

### WebSocket Events

#### From ESP32 to Server
- `esp32_register` - Device registration
- `esp32_event` - Device events (RFID, buttons, sensors)
- `heartbeat` - Keep-alive signal

#### From Server to ESP32
- `command` - Control commands
- `registration_success` - Registration confirmation

#### From Server to Web Clients
- `device_connected` - Device connection notification
- `esp32_event` - Real-time device events
- `meeting_started` - Meeting start notification
- `emergency_alert` - Emergency alerts

### Device Event Types

#### ESP32B (Sensor/Input)
- `RFID_SCANNED` - RFID card scan
- `BUTTON_PRESSED` - Physical button press
- `SENSOR_DATA` - Temperature, humidity, motion data

#### ESP32A (Gateway/Actuator)
- `ACTUATOR_CONTROL` - Relay, solenoid, buzzer control
- `DEVICE_CONNECTED` - Device connection events

#### ESP32C (Display)
- `DISPLAY_UPDATE` - Screen content updates

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start the server:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

4. **Access the dashboard:**
   Open http://localhost:3000 in your browser

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | development |
| `PORT` | Server port | 3000 |
| `DB_PATH` | Database file path | database.sqlite |
| `JWT_SECRET` | JWT signing secret | (change in production) |
| `ESP32_API_KEY` | API key for ESP32 devices | esp32-smart-meeting-key-2024 |
| `LOG_LEVEL` | Logging level | info |

### Business Rules

- **Booking Duration:** 30 minutes minimum, 8 hours maximum
- **Business Hours:** 9 AM to 6 PM, weekdays only
- **Advance Booking:** Up to 30 days in advance
- **Room Access:** 15 minutes early access allowed

## Database Schema

### Tables
- `rooms` - Meeting room information
- `bookings` - Booking records
- `device_events` - Device event log
- `system_logs` - Application logs

### Sample Data
The system creates a default meeting room on first startup.

## Security Features

- **JWT Authentication** for API access
- **API Key Authentication** for ESP32 devices
- **Input Validation** and sanitization
- **Rate Limiting** protection
- **CORS Configuration**
- **Security Headers**

## Monitoring & Logging

- **Winston Logging** with file rotation
- **Database Event Logging**
- **Performance Monitoring**
- **Device Connectivity Tracking**
- **Real-time Activity Feed**

## Integration with ESP32

### Device Registration
```javascript
socket.emit('esp32_register', {
    deviceId: 'ESP32A_001',
    deviceType: 'ESP32A',
    roomId: 1
});
```

### Sending Events
```javascript
socket.emit('esp32_event', {
    eventType: 'RFID_SCANNED',
    eventData: { rfid_id: 'ABC123' }
});
```

### Receiving Commands
```javascript
socket.on('command', (data) => {
    // Handle command: data.command, data.commandData
});
```

## API Usage Examples

### Create a Booking
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "room_id": 1,
    "user_name": "John Doe",
    "user_email": "john@example.com",
    "title": "Team Meeting",
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T11:00:00Z"
  }'
```

### Control Room Lights
```bash
curl -X POST http://localhost:3000/api/rooms/1/control \
  -H "Content-Type: application/json" \
  -d '{
    "action": "control",
    "device_type": "lights",
    "parameters": {"state": true}
  }'
```

### Generate QR Code
```bash
curl -X POST http://localhost:3000/api/qr/generate \
  -H "Content-Type: application/json" \
  -d '{"booking_id": 1}'
```

## Dashboard Features

- **Real-time Monitoring** of rooms and devices
- **Booking Management** with calendar view
- **Device Control** buttons for manual operation
- **Activity Feed** showing all system events
- **Statistics Dashboard** with usage metrics
- **Emergency Controls** for safety

## Development

### Adding New Features

1. **New API Endpoint:**
   - Add route in `routes/`
   - Create controller in `controllers/`
   - Add validation in `middleware/validation.js`

2. **New Device Event:**
   - Add handler in `services/esp32Service.js`
   - Update event logging in `models/Device.js`
   - Add dashboard display in `public/js/dashboard.js`

3. **New WebSocket Event:**
   - Add handler in `config/websocket.js`
   - Update service in `services/websocketService.js`

### Testing

```bash
# Run tests (when implemented)
npm test

# Check API health
curl http://localhost:3000/health

# Monitor logs
tail -f logs/app.log
```

## Production Deployment

1. **Environment Setup:**
   - Set `NODE_ENV=production`
   - Configure secure `JWT_SECRET`
   - Set up HTTPS/SSL
   - Configure firewall rules

2. **Process Management:**
   - Use PM2 or similar process manager
   - Configure log rotation
   - Set up monitoring alerts

3. **Database:**
   - Regular SQLite backups
   - Consider PostgreSQL for high load
   - Monitor database size

## License

MIT License - see LICENSE file for details.