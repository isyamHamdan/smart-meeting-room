# smart-meeting-room

Sistem otomasi ruang meeting terintegrasi berbasis ESP32, dengan komunikasi RS485 antar perangkat dan WebSocket ke server Node.js.

---

## Arsitektur Sistem

- **Node.js Server**
  - Dashboard untuk booking, validasi QR, dan monitoring
  - Komunikasi WebSocket ke ESP32A (gateway/aktuator)

- **ESP32A (Gateway & Aktuator)**
  - WebSocket client ke Node.js
  - RS485 ke ESP32B (sensor/input) & ESP32C (display)
  - Kontrol relay, solenoid, buzzer

- **ESP32B (Sensor/Input)**
  - Membaca RFID & tombol (manual & emergency)
  - Kirim event ke ESP32A via RS485

- **ESP32C (Display)**
  - Tampilkan status & countdown
  - Update dari ESP32A via RS485

---

## Topologi Komunikasi

```
[User Dashboard/Web]
        |
  (WebSocket/WiFi)
        |
   [Node.js]
        |
  (WebSocket/WiFi)
        |
     [ESP32A]
        |
   (RS485 wired bus)
    /           \
[ESP32B]     [ESP32C]
```

---

## Fitur Node.js Server

- **RESTful API** untuk manajemen ruangan dan booking
- **WebSocket real-time** untuk komunikasi dengan ESP32
- **Dashboard web** untuk monitoring dan kontrol
- **Sistem autentikasi** dengan JWT
- **Database SQLite** untuk penyimpanan data
- **Logging sistem** dan event tracking
- **QR code generation** untuk validasi booking
- **Emergency controls** untuk keamanan

### API Endpoints Utama

- `GET/POST /api/rooms` - Manajemen ruangan
- `GET/POST /api/bookings` - Manajemen booking
- `GET /api/devices` - Status perangkat ESP32
- `POST /api/control/:roomId/:device` - Kontrol perangkat
- `GET /api/stats` - Statistik sistem
- `GET /api/activity` - Log aktivitas

### WebSocket Events

- **ESP32 → Server:** `esp32_register`, `esp32_event`, `heartbeat`
- **Server → ESP32:** `command`, `registration_success`
- **Server → Dashboard:** `device_connected`, `meeting_started`, `emergency_alert`

- **Booking & Validasi QR:** User booking via web/dashboard, scan QR, validasi otomatis.
- **Kontrol Aktuator:** Relay (lampu, AC, colokan), solenoid pintu, buzzer (melalui ESP32A).
- **Input User:** RFID, tombol manual, tombol emergency (melalui ESP32B).
- **Display:** Countdown & status meeting (ESP32C).
- **Komunikasi RS485:** Antar ESP32A, ESP32B, dan ESP32C.
- **Monitoring & Logging:** Semua event dan aksi tercatat di dashboard Node.js.
- **Keamanan:** Semua aksi utama harus tervalidasi lewat sistem terpusat.

---

## Contoh Protokol Pesan

- **WebSocket (Node.js → ESP32A):**
    ```json
    { "cmd": "unlock", "target": "door" }
    ```
- **RS485 (ESP32A → ESP32B):**
    ```
    B;ACTION;READ_RFID
    ```
- **RS485 (ESP32B → ESP32A):**
    ```
    A;EVENT;RFID_OK
    ```
- **RS485 (ESP32A → ESP32C):**
    ```
    C;DISPLAY;START_MEETING
    ```

---

## Wiring RS485

- Semua node: A ke A, B ke B, GND ke GND.
- Terminasi resistor 120Ω di ujung bus jika kabel panjang.

---

## Instalasi & Pengembangan

### Setup Node.js Server

1. **Masuk ke direktori server**
   ```bash
   cd backend/nodejs-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Konfigurasi environment (opsional)**
   ```bash
   cp .env.example .env
   # Edit .env sesuai kebutuhan
   ```

4. **Jalankan server**
   ```bash
   # Development mode (dengan auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Akses dashboard**
   - Buka browser: http://localhost:3000
   - API tersedia di: http://localhost:3000/api
   - Health check: http://localhost:3000/health

### Setup ESP32 Devices

1. **Upload firmware ke ESP32A, ESP32B, ESP32C**
2. **Konfigurasi WiFi untuk ESP32A (gateway)**
3. **Hubungkan ESP32B dan ESP32C ke ESP32A via RS485**
4. **Pastikan semua perangkat terhubung dan terdaftar di dashboard**

### Struktur Project Lengkap

```
smart-meeting-room/
├── README.md
├── backend/
│   └── nodejs-server/
│       ├── index.js              # Server utama
│       ├── package.json          # Dependencies Node.js
│       ├── .env                  # Konfigurasi environment
│       ├── config/               # Konfigurasi database & WebSocket
│       ├── controllers/          # Logic API endpoints
│       ├── models/               # Model data (Room, Booking, Device)
│       ├── routes/               # Routing API
│       ├── middleware/           # Authentication & validation
│       ├── services/             # Business logic services
│       ├── utils/                # Helper functions & logging
│       ├── public/               # Dashboard web (HTML/CSS/JS)
│       └── logs/                 # Log files
├── firmware/                     # ESP32 firmware (akan dibuat)
│   ├── esp32a-gateway/
│   ├── esp32b-sensor/
│   └── esp32c-display/
└── docs/                         # Dokumentasi (akan dibuat)
```

---

## Lisensi

MIT License

---

## Kontribusi

Silakan fork, pull request, atau ajukan issue untuk fitur/bug/saran.

```

---

Anda bisa copy-paste markdown di atas ke file `README.md` di repo Anda.  
Jika ingin contoh struktur folder, file, atau kode awal Node.js/ESP32, silakan minta saja!
