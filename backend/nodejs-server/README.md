# Smart Meeting Room - Node.js Server

Node.js backend server untuk sistem Smart Meeting Room dengan komunikasi WebSocket ke ESP32 dan dashboard web untuk booking & monitoring.

## Fitur

- **WebSocket Server**: Komunikasi real-time dengan ESP32A (gateway/aktuator)
- **Web Dashboard**: Interface untuk booking, validasi QR, dan monitoring
- **Booking System**: Sistem pemesanan ruang meeting dengan validasi waktu
- **QR Code Generation**: Generate QR code untuk akses ruang
- **QR Code Validation**: Validasi QR untuk memulai sesi meeting
- **Event Logging**: Pencatatan semua aktivitas sistem
- **Monitoring**: Status real-time sistem dan perangkat

## Instalasi

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Jalankan server**
   ```bash
   npm start
   ```

3. **Akses dashboard**
   ```
   http://localhost:3000
   ```

## Dependencies

- **express**: Web server framework
- **socket.io**: WebSocket server untuk komunikasi real-time
- **qrcode**: Generate QR code untuk booking
- **uuid**: Generate unique ID untuk booking dan sesi
- **cors**: Cross-origin resource sharing

## API Endpoints

### Bookings
- `GET /api/bookings` - Ambil semua booking
- `POST /api/bookings` - Buat booking baru
- `POST /api/validate-qr` - Validasi QR code

### Sessions
- `GET /api/sessions` - Ambil semua sesi aktif
- `POST /api/sessions/:sessionId/end` - Akhiri sesi

### System
- `GET /api/status` - Status sistem
- `GET /api/logs` - System logs

## WebSocket Events

### ESP32 → Server
- `esp32-identify`: Identifikasi perangkat ESP32
- `esp32-event`: Event dari ESP32 (RFID, button, emergency)
- `esp32-status`: Update status dari ESP32

### Server → ESP32
- `command`: Perintah ke ESP32 (unlock, lock, emergency_unlock)
- `identified`: Konfirmasi identifikasi

### Server → Client
- `system-log`: Real-time log events

## Struktur Data

### Booking
```json
{
  "id": "uuid",
  "userName": "string",
  "email": "string",
  "startTime": "datetime",
  "endTime": "datetime",
  "purpose": "string",
  "qrCode": "data:image/png;base64,...",
  "qrData": "json string",
  "status": "pending|active|completed",
  "createdAt": "datetime"
}
```

### Session
```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "userName": "string",
  "startTime": "datetime",
  "endTime": "datetime",
  "status": "active|ended|emergency_ended"
}
```

## Testing

### ESP32 Simulator
Untuk testing komunikasi WebSocket tanpa hardware ESP32:

```bash
node esp32-simulator.js
```

Simulator akan:
- Membuat koneksi 3 ESP32 virtual (ESP32A, ESP32B, ESP32C)
- Simulasi RFID detection
- Simulasi button press
- Simulasi emergency button

### Test API
```bash
# Test system status
curl http://localhost:3000/api/status

# Test create booking
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "Test User",
    "email": "test@example.com", 
    "startTime": "2025-07-10T15:00:00Z",
    "endTime": "2025-07-10T16:00:00Z",
    "purpose": "Meeting test"
  }'
```

## Protokol Komunikasi

### WebSocket Commands (Server → ESP32)
```json
{
  "cmd": "unlock",
  "target": "door",
  "session": { ... }
}
```

Commands:
- `unlock`: Buka pintu/relay
- `lock`: Tutup pintu/relay  
- `emergency_unlock`: Emergency unlock semua

### ESP32 Events (ESP32 → Server)
```json
{
  "event": "RFID_DETECTED",
  "deviceId": "ESP32B-001",
  "timestamp": "2025-07-10T14:00:00Z",
  "cardId": "CARD-123456"
}
```

Events:
- `RFID_DETECTED`: Kartu RFID terdeteksi
- `BUTTON_PRESSED`: Tombol ditekan
- `EMERGENCY_PRESSED`: Tombol emergency ditekan

## Development

### Development Mode
```bash
npm run dev
```

### Environment Variables
```bash
PORT=3000  # Server port (default: 3000)
```

## Monitoring & Logging

Server mencatat semua aktivitas:
- Koneksi/diskoneksi ESP32
- Booking creation & validation
- Session start/end
- System events
- Error conditions

Logs dapat diakses via:
- Dashboard web (real-time)
- API endpoint `/api/logs`
- Console output

## Security

- Validasi waktu booking (maksimal 15 menit lebih awal)
- QR code dengan data terenkripsi
- Session management dengan unique ID
- CORS protection untuk API

## Architecture

```
[Web Dashboard] ←→ [Node.js Server] ←→ [ESP32A Gateway]
                          ↓                    ↓
                    [API/WebSocket]        [RS485 Bus]
                          ↓                    ↓
                     [Database]         [ESP32B & ESP32C]
                     (In-Memory)        (Sensors & Display)
```

## Lisensi

MIT License