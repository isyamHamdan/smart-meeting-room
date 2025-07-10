/*
 * ESP32B - Sensor & Input Controller
 * Smart Meeting Room System
 * 
 * Features:
 * - RFID card reader (MFRC522)
 * - Manual unlock button
 * - Emergency button
 * - RS485 communication to ESP32A
 * - Fast response times for immediate access control
 */

#include <SPI.h>
#include <MFRC522.h>
#include <HardwareSerial.h>
#include <ArduinoJson.h>

// Pin Definitions
#define RST_PIN 9
#define SS_PIN 10
#define RS485_TX_PIN 17
#define RS485_RX_PIN 16
#define RS485_DE_PIN 4
#define BUTTON_MANUAL 25
#define BUTTON_EMERGENCY 26
#define LED_ACCESS 2
#define LED_ERROR 14
#define BUZZER_LOCAL 27

// RS485 Configuration
HardwareSerial RS485(2);
#define RS485_BAUD 9600

// RFID Configuration
MFRC522 mfrc522(SS_PIN, RST_PIN);

// Button debouncing
struct ButtonState {
  bool lastState = HIGH;
  bool currentState = HIGH;
  unsigned long lastDebounceTime = 0;
  const unsigned long debounceDelay = 50;
};

ButtonState manualButton;
ButtonState emergencyButton;

// Performance tracking
unsigned long lastHeartbeat = 0;
unsigned long totalScans = 0;
unsigned long successfulScans = 0;

// Device state
bool isOnline = true;
unsigned long lastRS485Response = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32B Sensor/Input initializing...");
  
  // Initialize pins
  pinMode(BUTTON_MANUAL, INPUT_PULLUP);
  pinMode(BUTTON_EMERGENCY, INPUT_PULLUP);
  pinMode(LED_ACCESS, OUTPUT);
  pinMode(LED_ERROR, OUTPUT);
  pinMode(BUZZER_LOCAL, OUTPUT);
  pinMode(RS485_DE_PIN, OUTPUT);
  
  // Set initial states
  digitalWrite(LED_ACCESS, LOW);
  digitalWrite(LED_ERROR, LOW);
  digitalWrite(BUZZER_LOCAL, LOW);
  digitalWrite(RS485_DE_PIN, LOW); // Receive mode
  
  // Initialize RS485
  RS485.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  Serial.println("RS485 initialized");
  
  // Initialize SPI bus
  SPI.begin();
  
  // Initialize MFRC522
  mfrc522.PCD_Init();
  delay(100);
  
  // Check if RFID reader is working
  if (mfrc522.PCD_PerformSelfTest()) {
    Serial.println("RFID reader initialized successfully");
    blinkLED(LED_ACCESS, 2);
  } else {
    Serial.println("RFID reader initialization failed");
    blinkLED(LED_ERROR, 3);
  }
  
  // Reset RFID reader after self-test
  mfrc522.PCD_Init();
  
  Serial.println("ESP32B Sensor/Input ready!");
  
  // Send initial status
  sendStatusUpdate();
}

void loop() {
  // Handle RFID scanning (high priority for fast access)
  handleRFID();
  
  // Handle button inputs
  handleButtons();
  
  // Handle RS485 communication
  handleRS485();
  
  // Send heartbeat every 60 seconds
  if (millis() - lastHeartbeat > 60000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  // Monitor communication health
  monitorCommunication();
  
  delay(10); // Small delay to prevent issues
}

void handleRFID() {
  // Reset the loop if no new card present on the sensor/reader
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }
  
  // Select one of the cards
  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }
  
  unsigned long scanStartTime = millis();
  totalScans++;
  
  // Get card UID
  String cardId = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    cardId += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
    cardId += String(mfrc522.uid.uidByte[i], HEX);
  }
  cardId.toUpperCase();
  
  Serial.printf("RFID Card detected: %s\n", cardId.c_str());
  
  // Quick local validation (length check)
  bool validFormat = (cardId.length() == 8);
  
  if (validFormat) {
    // Visual feedback for successful scan
    digitalWrite(LED_ACCESS, HIGH);
    successfulScans++;
    
    // Send RFID data to ESP32A immediately
    sendRFIDScan(cardId, scanStartTime);
    
    // Keep LED on for 2 seconds
    delay(2000);
    digitalWrite(LED_ACCESS, LOW);
  } else {
    // Invalid card format
    digitalWrite(LED_ERROR, HIGH);
    digitalWrite(BUZZER_LOCAL, HIGH);
    
    // Send invalid scan notification
    sendRFIDScan(cardId, scanStartTime, false);
    
    delay(1000);
    digitalWrite(LED_ERROR, LOW);
    digitalWrite(BUZZER_LOCAL, LOW);
  }
  
  // Halt PICC and stop encryption on PCD
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  
  unsigned long scanTime = millis() - scanStartTime;
  Serial.printf("RFID scan completed in %lu ms\n", scanTime);
}

void handleButtons() {
  // Manual unlock button
  handleButton(BUTTON_MANUAL, manualButton, "manual_unlock");
  
  // Emergency button
  handleButton(BUTTON_EMERGENCY, emergencyButton, "emergency");
}

void handleButton(int pin, ButtonState &button, String buttonType) {
  int reading = digitalRead(pin);
  
  if (reading != button.lastState) {
    button.lastDebounceTime = millis();
  }
  
  if ((millis() - button.lastDebounceTime) > button.debounceDelay) {
    if (reading != button.currentState) {
      button.currentState = reading;
      
      // Button pressed (LOW because of pull-up)
      if (button.currentState == LOW) {
        Serial.printf("Button pressed: %s\n", buttonType.c_str());
        
        // Visual feedback
        if (buttonType == "emergency") {
          // Emergency - flash both LEDs
          for (int i = 0; i < 5; i++) {
            digitalWrite(LED_ACCESS, HIGH);
            digitalWrite(LED_ERROR, HIGH);
            delay(100);
            digitalWrite(LED_ACCESS, LOW);
            digitalWrite(LED_ERROR, LOW);
            delay(100);
          }
        } else {
          // Manual unlock - flash access LED
          blinkLED(LED_ACCESS, 1);
        }
        
        // Send button press to ESP32A
        sendButtonPress(buttonType);
      }
    }
  }
  
  button.lastState = reading;
}

void sendRFIDScan(String cardId, unsigned long timestamp, bool valid = true) {
  DynamicJsonDocument doc(512);
  doc["cardId"] = cardId;
  doc["timestamp"] = timestamp;
  doc["scanTime"] = millis() - timestamp;
  doc["valid"] = valid;
  doc["deviceId"] = "ESP32B_001";
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "RFID_SCAN", payload);
}

void sendButtonPress(String buttonType) {
  DynamicJsonDocument doc(256);
  doc["buttonType"] = buttonType;
  doc["timestamp"] = millis();
  doc["deviceId"] = "ESP32B_001";
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "BUTTON_PRESS", payload);
}

void sendStatusUpdate() {
  DynamicJsonDocument doc(512);
  doc["deviceId"] = "ESP32B_001";
  doc["status"] = "online";
  doc["sensors"]["rfid"] = "active";
  doc["buttons"]["manual"] = digitalRead(BUTTON_MANUAL) == LOW ? "pressed" : "released";
  doc["buttons"]["emergency"] = digitalRead(BUTTON_EMERGENCY) == LOW ? "pressed" : "released";
  doc["stats"]["totalScans"] = totalScans;
  doc["stats"]["successfulScans"] = successfulScans;
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "STATUS_UPDATE", payload);
}

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc["deviceId"] = "ESP32B_001";
  doc["timestamp"] = millis();
  doc["uptime"] = millis() / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "HEARTBEAT", payload);
  
  Serial.println("Heartbeat sent to ESP32A");
}

void sendRS485Message(String target, String messageType, String payload) {
  // Format: TARGET;MESSAGE_TYPE;PAYLOAD
  String message = target + ";" + messageType + ";" + payload + "\n";
  
  // Switch to transmit mode
  digitalWrite(RS485_DE_PIN, HIGH);
  delayMicroseconds(100);
  
  RS485.print(message);
  RS485.flush();
  
  // Switch back to receive mode
  delayMicroseconds(100);
  digitalWrite(RS485_DE_PIN, LOW);
  
  Serial.printf("RS485 TX: %s", message.c_str());
  lastRS485Response = millis(); // Reset timeout
}

void handleRS485() {
  if (RS485.available()) {
    String message = RS485.readStringUntil('\n');
    message.trim();
    
    if (message.length() > 0) {
      Serial.printf("RS485 RX: %s\n", message.c_str());
      parseRS485Message(message);
      lastRS485Response = millis();
    }
  }
}

void parseRS485Message(String message) {
  // Parse format: TARGET;COMMAND;PARAMS
  int firstSemi = message.indexOf(';');
  int secondSemi = message.indexOf(';', firstSemi + 1);
  
  if (firstSemi == -1) return;
  
  String target = message.substring(0, firstSemi);
  
  // Check if message is for us (B)
  if (target != "B") return;
  
  String command = message.substring(firstSemi + 1, secondSemi != -1 ? secondSemi : message.length());
  String params = secondSemi != -1 ? message.substring(secondSemi + 1) : "";
  
  Serial.printf("Command received: %s\n", command.c_str());
  
  // Handle commands from ESP32A
  if (command == "STATUS_REQUEST") {
    sendStatusUpdate();
  }
  else if (command == "RESET_STATS") {
    totalScans = 0;
    successfulScans = 0;
    Serial.println("Statistics reset");
  }
  else if (command == "TEST_LEDS") {
    // Test LED functionality
    blinkLED(LED_ACCESS, 2);
    blinkLED(LED_ERROR, 2);
  }
  else if (command == "BUZZER_TEST") {
    digitalWrite(BUZZER_LOCAL, HIGH);
    delay(500);
    digitalWrite(BUZZER_LOCAL, LOW);
  }
  
  // Send acknowledgment
  DynamicJsonDocument ackDoc(256);
  ackDoc["command"] = command;
  ackDoc["status"] = "executed";
  ackDoc["timestamp"] = millis();
  
  String ackPayload;
  serializeJson(ackDoc, ackPayload);
  
  sendRS485Message("A", "COMMAND_ACK", ackPayload);
}

void monitorCommunication() {
  static unsigned long lastCheck = 0;
  
  if (millis() - lastCheck > 30000) { // Check every 30 seconds
    // Check if we've lost communication with ESP32A
    if (millis() - lastRS485Response > 180000) { // 3 minutes timeout
      Serial.println("Communication with ESP32A lost!");
      isOnline = false;
      
      // Flash error LED to indicate communication loss
      blinkLED(LED_ERROR, 5);
    } else {
      isOnline = true;
    }
    
    lastCheck = millis();
  }
}

void blinkLED(int pin, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(200);
    digitalWrite(pin, LOW);
    delay(200);
  }
}