# ESP32 Library Requirements

This document lists the required Arduino libraries for each ESP32 device in the Smart Meeting Room system.

## ESP32A (Gateway & Actuator)

### Required Libraries:
1. **WiFi** - Built-in ESP32 library for WiFi connectivity
2. **WebSocketsClient** - For WebSocket communication with Node.js server
   - Install via Library Manager: "WebSockets" by Markus Sattler
3. **ArduinoJson** - For JSON message parsing
   - Install via Library Manager: "ArduinoJson" by Benoit Blanchon
4. **HardwareSerial** - Built-in for RS485 communication

### Installation:
```
Arduino IDE → Tools → Manage Libraries
Search and install:
- WebSockets by Markus Sattler
- ArduinoJson by Benoit Blanchon
```

## ESP32B (Sensor & Input)

### Required Libraries:
1. **SPI** - Built-in ESP32 library for SPI communication
2. **MFRC522** - For RFID reader functionality
   - Install via Library Manager: "MFRC522" by GithubCommunity
3. **HardwareSerial** - Built-in for RS485 communication

### Installation:
```
Arduino IDE → Tools → Manage Libraries
Search and install:
- MFRC522 by GithubCommunity
```

## ESP32C (Display)

### Required Libraries:
1. **Wire** - Built-in ESP32 library for I2C communication
2. **LiquidCrystal_I2C** - For LCD display control
   - Install via Library Manager: "LiquidCrystal I2C" by Frank de Brabander
3. **WiFi** - Built-in (optional for time sync)
4. **HardwareSerial** - Built-in for RS485 communication

### Installation:
```
Arduino IDE → Tools → Manage Libraries
Search and install:
- LiquidCrystal I2C by Frank de Brabander
```

## Board Configuration

### ESP32 Board Package:
1. Open Arduino IDE
2. Go to File → Preferences
3. Add to Additional Board Manager URLs:
   ```
   https://dl.espressif.com/dl/package_esp32_index.json
   ```
4. Go to Tools → Board → Boards Manager
5. Search "ESP32" and install "esp32 by Espressif Systems"

### Board Settings:
- Board: "ESP32 Dev Module"
- Upload Speed: 921600
- CPU Frequency: 240MHz (WiFi/BT)
- Flash Frequency: 80MHz
- Flash Mode: QIO
- Flash Size: 4MB (32Mb)
- Partition Scheme: Default 4MB with spiffs
- Core Debug Level: None
- PSRAM: Disabled

## Hardware Wiring

### RFID Module (ESP32B):
```
MFRC522   ESP32B
VCC    →  3.3V
GND    →  GND
RST    →  GPIO 9
SS     →  GPIO 10
MOSI   →  GPIO 23
MISO   →  GPIO 19
SCK    →  GPIO 18
```

### LCD Display (ESP32C):
```
LCD I2C   ESP32C
VCC    →  5V or 3.3V
GND    →  GND
SDA    →  GPIO 21
SCL    →  GPIO 22
```

### RS485 Module (All ESP32s):
```
RS485     ESP32
VCC    →  5V or 3.3V
GND    →  GND
A      →  Connect to A of all devices
B      →  Connect to B of all devices
TX     →  GPIO 17
RX     →  GPIO 16
DE     →  GPIO 4
RE     →  GPIO 4
```

## Troubleshooting

### Library Installation Issues:
1. Make sure Arduino IDE is connected to internet
2. Try installing libraries manually from GitHub
3. Check Arduino IDE version (recommended 1.8.x or 2.x)

### Compilation Errors:
1. Check board selection
2. Verify all libraries are installed
3. Check ESP32 board package version
4. Clear Arduino cache: File → Preferences → Clear Cache

### Upload Issues:
1. Check USB cable connection
2. Hold BOOT button during upload if needed
3. Check correct COM port selection
4. Try different upload speeds