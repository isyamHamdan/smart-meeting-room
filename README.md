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

## Fitur Utama

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

1. **Jalankan server Node.js**  
    ```bash
    node backend/nodejs-server/index.js
    ```
2. **Upload firmware ke ESP32A, ESP32B, ESP32C**
3. **Pastikan semua perangkat terhubung ke WiFi (untuk ESP32A) dan bus RS485**

---

## Lisensi

MIT License

---

## Kontribusi

Silakan fork, pull request, atau ajukan issue untuk fitur/bug/saran.

```

---

Anda bisa copy-paste markdown di atas ke file `README.md` di repo Anda.  