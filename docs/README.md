# Smart Meeting Room System - Performance Optimized

## Overview

This project addresses the "lama ya" (slow/taking too long) issue by implementing a fast and efficient smart meeting room automation system using ESP32 devices and Node.js backend with optimized response times.

## Architecture

```
[Web Dashboard] ↔ [Node.js Server] ↔ [ESP32A Gateway] ↔ [ESP32B/C Devices]
    WebSocket         WebSocket           RS485
```

### Performance Features

- **Fast WebSocket Communication**: < 50ms response times
- **Optimized RS485 Protocol**: Minimal overhead, fast device communication
- **Real-time Dashboard**: Live performance monitoring
- **Immediate Access Control**: RFID response < 500ms
- **Efficient Memory Usage**: Optimized for ESP32 constraints

## Components

### 1. Node.js Backend (`backend/nodejs-server/`)
- WebSocket server for ESP32A communication
- REST API for web dashboard
- Real-time performance monitoring
- Command processing with response time tracking

### 2. ESP32A Gateway (`firmware/esp32a/`)
- WiFi connectivity to Node.js server
- RS485 master for ESP32B/C communication
- Actuator control (lights, AC, door, buzzer)
- Performance optimization for fast command execution

### 3. ESP32B Sensor/Input (`firmware/esp32b/`)
- RFID card reader (MFRC522)
- Manual and emergency buttons
- Fast scan processing < 500ms
- RS485 slave communication

### 4. ESP32C Display (`firmware/esp32c/`)
- OLED display (128x64)
- Real-time status updates
- Meeting countdown timer
- Smooth animations and transitions

## Quick Start

### 1. Setup Node.js Backend

```bash
cd backend/nodejs-server
npm install
npm start
```

Server will start on port 3000 with:
- WebSocket endpoint: `ws://localhost:3000`
- Web dashboard: `http://localhost:3000`
- API endpoint: `http://localhost:3000/api`

### 2. Configure ESP32 Devices

1. **ESP32A Gateway**: Update WiFi credentials and server IP
2. **ESP32B Sensor**: Connect MFRC522 RFID reader and buttons
3. **ESP32C Display**: Connect OLED display

### 3. Hardware Connections

#### ESP32A (Gateway)
- Pin 17: RS485 TX
- Pin 16: RS485 RX
- Pin 4: RS485 DE (Driver Enable)
- Pin 25: Relay for Lights
- Pin 26: Relay for AC
- Pin 27: Solenoid for Door
- Pin 14: Buzzer
- Pin 2: Status LED

#### ESP32B (Sensor/Input)
- Pin 17: RS485 TX
- Pin 16: RS485 RX
- Pin 4: RS485 DE
- Pin 10: RFID SS
- Pin 9: RFID RST
- Pin 25: Manual Button
- Pin 26: Emergency Button
- Pin 2: Access LED
- Pin 14: Error LED

#### ESP32C (Display)
- Pin 17: RS485 TX
- Pin 16: RS485 RX
- Pin 4: RS485 DE
- Pin 21: OLED SDA
- Pin 22: OLED SCL
- Pin 25: Backlight Control
- Pin 2: Status LED

### 4. RS485 Wiring

Connect all three ESP32 devices:
- A to A (RS485 A+)
- B to B (RS485 B-)
- GND to GND
- Add 120Ω termination resistors at both ends if using long cables

## Performance Monitoring

The web dashboard provides real-time performance metrics:

- **Average Response Time**: WebSocket command response times
- **Command Success Rate**: Percentage of successful operations
- **Connected Devices**: Real-time device status
- **Fastest/Slowest Response**: Performance statistics

## API Endpoints

### REST API
- `GET /api/rooms` - Get all rooms status
- `GET /api/rooms/:roomId/status` - Get specific room status
- `POST /api/rooms/:roomId/control` - Send control commands
- `GET /api/performance` - Get performance metrics
- `GET /health` - Health check

### WebSocket Events

#### From ESP32A:
- `esp32_register` - Device registration
- `command` - Command execution
- `rs485_data` - Data from ESP32B/C
- `heartbeat` - Connection keepalive

#### To ESP32A:
- `config` - Initial configuration
- `rs485_command` - Commands for ESP32B/C
- `command_response` - Command execution results

## Optimization Features

### 1. Fast Command Processing
- Commands processed in < 10ms on Node.js
- Direct actuator control on ESP32A
- Minimal JSON parsing overhead

### 2. Efficient RS485 Protocol
- Simple message format: `TARGET;COMMAND;PAYLOAD`
- Binary acknowledgments
- Timeout handling with retries

### 3. Performance Monitoring
- Real-time response time tracking
- Connection health monitoring
- Automatic reconnection handling

### 4. Memory Optimization
- Efficient JSON document sizing
- Buffer management on ESP32
- Garbage collection optimization

## Troubleshooting

### Common Issues

1. **Slow Response Times**
   - Check WiFi signal strength
   - Verify RS485 wiring
   - Monitor performance dashboard

2. **Device Connection Issues**
   - Check RS485 termination resistors
   - Verify baudrate settings (9600)
   - Monitor heartbeat messages

3. **RFID Reading Problems**
   - Check MFRC522 wiring
   - Verify SPI connections
   - Test with known good cards

## Development

### Adding New Features
1. Update Node.js server for new commands
2. Modify ESP32A for new actuators
3. Add corresponding ESP32B/C functionality
4. Update web dashboard UI

### Performance Testing
- Use built-in performance test button
- Monitor response times in dashboard
- Check serial console for debugging

## License

MIT License - see LICENSE file for details.