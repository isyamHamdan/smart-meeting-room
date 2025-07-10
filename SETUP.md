# Smart Meeting Room System - Setup Guide

Sistem otomasi ruang meeting terintegrasi berbasis ESP32 dengan komunikasi RS485 dan WebSocket.

## 🏗️ Arsitektur Sistem

```
[User Dashboard/Web]
        |
  (WebSocket/WiFi)
        |
   [Node.js Server]
        |
  (WebSocket/WiFi)
        |
     [ESP32A Gateway]
        |
   (RS485 wired bus)
    /           \
[ESP32B]     [ESP32C]
```

## 🚀 Quick Start

### 1. Setup Node.js Server

```bash
cd backend/nodejs-server
npm install
npm start
```

Server akan berjalan di `http://localhost:3000`

### 2. Konfigurasi ESP32 Devices

#### ESP32A (Gateway & Actuator)
- Upload firmware dari `firmware/esp32a-gateway/`
- Edit WiFi credentials di firmware
- Sambungkan ke pin relay, solenoid, dan buzzer
- Setup RS485 bus (pins 16/17, DE/RE pin 4)

#### ESP32B (Sensor & Input)
- Upload firmware dari `firmware/esp32b-sensor/`
- Sambungkan RFID reader (SPI pins)
- Sambungkan manual & emergency buttons
- Setup RS485 bus

#### ESP32C (Display)
- Upload firmware dari `firmware/esp32c-display/`
- Sambungkan LCD 20x4 (I2C)
- Setup RS485 bus

### 3. Wiring RS485

Sambungkan semua ESP32 dalam bus RS485:
- A ke A (semua device)
- B ke B (semua device)  
- GND ke GND (semua device)
- Tambahkan resistor terminasi 120Ω di ujung bus

## 📋 Fitur Yang Sudah Diimplementasi

- ✅ **Node.js Server dengan WebSocket**
  - Dashboard web untuk booking meeting
  - Validasi QR code
  - Monitoring sistem real-time
  - API endpoints untuk meeting management

- ✅ **Web Dashboard**
  - System status monitoring
  - Meeting booking form
  - Manual controls untuk aktuator
  - QR code validation
  - Real-time logs

- ✅ **ESP32A Gateway Firmware**
  - WebSocket client ke Node.js server
  - RS485 master communication
  - Kontrol relay (lampu, AC, power outlet)
  - Kontrol solenoid pintu
  - Emergency handling
  - Actuator status feedback

- ✅ **ESP32B Sensor Firmware**
  - RFID card reading (MFRC522)
  - Manual button handling
  - Emergency button dengan LED indicators
  - RS485 slave communication
  - Debouncing dan button state management

- ✅ **ESP32C Display Firmware**
  - LCD 20x4 display management
  - Meeting status display
  - Countdown timer
  - Emergency mode display
  - RS485 slave communication

## 🔧 Konfigurasi Hardware

### Pin Assignments ESP32A (Gateway)
```
GPIO 18 - Relay Lights
GPIO 19 - Relay AC  
GPIO 21 - Relay Power Outlets
GPIO 22 - Solenoid Door
GPIO 23 - Buzzer
GPIO 16 - RS485 RX
GPIO 17 - RS485 TX
GPIO 4  - RS485 DE/RE
```

### Pin Assignments ESP32B (Sensor)
```
GPIO 9  - RFID RST
GPIO 10 - RFID SS
GPIO 5  - Manual Button
GPIO 18 - Emergency Button
GPIO 2  - Status LED
GPIO 19 - RFID LED
GPIO 21 - Emergency LED
GPIO 16 - RS485 RX
GPIO 17 - RS485 TX
GPIO 4  - RS485 DE/RE
```

### Pin Assignments ESP32C (Display)
```
GPIO 21 - I2C SDA (LCD)
GPIO 22 - I2C SCL (LCD)
GPIO 16 - RS485 RX
GPIO 17 - RS485 TX
GPIO 4  - RS485 DE/RE
```

## 🔄 Protokol Komunikasi

### WebSocket (Node.js ↔ ESP32A)
```javascript
// Contoh pesan unlock room
{
  "cmd": "unlock_room",
  "meetingId": "123",
  "duration": 3600000
}
```

### RS485 Format
```
TARGET;TYPE;DATA\n

Contoh:
A;EVENT;RFID_SCANNED,1234ABCD
B;ACTION;READ_RFID
C;DISPLAY;START_MEETING,meeting123
```

## 🧪 Testing

### Test Dashboard
1. Buka `http://localhost:3000`
2. Book meeting baru
3. Copy QR code yang dihasilkan
4. Test validasi QR code
5. Test manual controls

### Test RS485 Communication
1. Monitor serial output ESP32A
2. Tekan button di ESP32B
3. Lihat pesan RS485 di ESP32A
4. Check display update di ESP32C

## 📝 Dependencies

### Node.js
- express: Web server
- socket.io: WebSocket communication
- uuid: QR code generation
- cors: Cross-origin requests

### ESP32 Arduino Libraries
- WiFi: WiFi connectivity
- WebSocketsClient: WebSocket client
- ArduinoJson: JSON parsing
- SPI: RFID communication
- MFRC522: RFID reader library
- Wire: I2C communication
- LiquidCrystal_I2C: LCD display

## 🔧 Troubleshooting

### ESP32A tidak connect ke server
- Check WiFi credentials
- Check server IP address
- Monitor serial output untuk error

### RS485 tidak berfungsi
- Check wiring A, B, GND
- Check terminasi resistor
- Monitor baud rate (9600)

### RFID tidak terbaca
- Check SPI wiring
- Check power supply RFID module
- Test dengan serial monitor

### LCD tidak tampil
- Check I2C address (0x27)
- Check SDA/SCL wiring
- Test dengan I2C scanner

## 📞 Support

Untuk pertanyaan atau masalah, silakan buat issue di repository ini.