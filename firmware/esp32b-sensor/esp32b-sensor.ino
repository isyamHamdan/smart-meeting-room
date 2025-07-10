#include <SPI.h>
#include <MFRC522.h>
#include <HardwareSerial.h>

// RFID configuration
#define RST_PIN 9
#define SS_PIN 10
MFRC522 mfrc522(SS_PIN, RST_PIN);

// RS485 Communication
HardwareSerial rs485(2);  // Use Serial2 for RS485
#define RS485_DE_RE 4     // Driver Enable / Receiver Enable pin

// Button pins
#define MANUAL_BUTTON 5
#define EMERGENCY_BUTTON 18

// LED indicators
#define LED_STATUS 2
#define LED_RFID 19
#define LED_EMERGENCY 21

// Button states
bool manualButtonState = false;
bool emergencyButtonState = false;
bool lastManualState = false;
bool lastEmergencyState = false;

// RFID timing
unsigned long lastRFIDScan = 0;
const unsigned long RFID_SCAN_INTERVAL = 1000;  // 1 second between scans

// Debouncing
unsigned long lastManualPress = 0;
unsigned long lastEmergencyPress = 0;
const unsigned long DEBOUNCE_DELAY = 200;  // 200ms debounce

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32B Sensor/Input starting...");
  
  // Initialize SPI for RFID
  SPI.begin();
  mfrc522.PCD_Init();
  mfrc522.PCD_DumpVersionToSerial();
  
  // Initialize RS485
  rs485.begin(9600, SERIAL_8N1, 16, 17);  // RX=16, TX=17
  pinMode(RS485_DE_RE, OUTPUT);
  digitalWrite(RS485_DE_RE, LOW);  // Receive mode
  
  // Initialize buttons
  pinMode(MANUAL_BUTTON, INPUT_PULLUP);
  pinMode(EMERGENCY_BUTTON, INPUT_PULLUP);
  
  // Initialize LEDs
  pinMode(LED_STATUS, OUTPUT);
  pinMode(LED_RFID, OUTPUT);
  pinMode(LED_EMERGENCY, OUTPUT);
  
  // Initial LED states
  digitalWrite(LED_STATUS, HIGH);     // Status LED on
  digitalWrite(LED_RFID, LOW);        // RFID LED off
  digitalWrite(LED_EMERGENCY, LOW);   // Emergency LED off
  
  Serial.println("ESP32B Sensor/Input initialized successfully");
  
  // Startup LED sequence
  startupSequence();
}

void loop() {
  // Check RFID
  checkRFID();
  
  // Check buttons
  checkButtons();
  
  // Check RS485 messages
  checkRS485Messages();
  
  // Blink status LED to show system is running
  static unsigned long lastBlink = 0;
  if (millis() - lastBlink > 2000) {
    digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));
    lastBlink = millis();
  }
  
  delay(50);
}

void checkRFID() {
  // Check if enough time has passed since last scan
  if (millis() - lastRFIDScan < RFID_SCAN_INTERVAL) {
    return;
  }
  
  // Look for new cards
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }
  
  // Select one of the cards
  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }
  
  // Get card UID
  String cardUID = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    cardUID += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
    cardUID += String(mfrc522.uid.uidByte[i], HEX);
  }
  cardUID.toUpperCase();
  
  Serial.println("RFID card detected: " + cardUID);
  
  // Flash RFID LED
  digitalWrite(LED_RFID, HIGH);
  
  // Send RFID data to ESP32A via RS485
  sendRS485Message("A", "EVENT", "RFID_SCANNED," + cardUID);
  
  // Keep LED on for 500ms
  delay(500);
  digitalWrite(LED_RFID, LOW);
  
  // Halt PICC
  mfrc522.PICC_HaltA();
  
  // Stop encryption on PCD
  mfrc522.PCD_StopCrypto1();
  
  lastRFIDScan = millis();
}

void checkButtons() {
  // Read button states (inverted because of INPUT_PULLUP)
  manualButtonState = !digitalRead(MANUAL_BUTTON);
  emergencyButtonState = !digitalRead(EMERGENCY_BUTTON);
  
  // Manual button handling
  if (manualButtonState && !lastManualState) {
    // Button pressed
    if (millis() - lastManualPress > DEBOUNCE_DELAY) {
      Serial.println("Manual button pressed");
      
      // Send manual button event to ESP32A
      sendRS485Message("A", "EVENT", "MANUAL_BUTTON");
      
      lastManualPress = millis();
    }
  }
  
  // Emergency button handling
  if (emergencyButtonState && !lastEmergencyState) {
    // Emergency button pressed
    if (millis() - lastEmergencyPress > DEBOUNCE_DELAY) {
      Serial.println("EMERGENCY BUTTON PRESSED!");
      
      // Turn on emergency LED
      digitalWrite(LED_EMERGENCY, HIGH);
      
      // Send emergency event to ESP32A
      sendRS485Message("A", "EVENT", "EMERGENCY_BUTTON");
      
      // Emergency LED pattern
      for (int i = 0; i < 10; i++) {
        digitalWrite(LED_EMERGENCY, !digitalRead(LED_EMERGENCY));
        delay(100);
      }
      
      lastEmergencyPress = millis();
    }
  }
  
  // Emergency LED management
  if (!emergencyButtonState && digitalRead(LED_EMERGENCY)) {
    // Turn off emergency LED when button is released
    digitalWrite(LED_EMERGENCY, LOW);
  }
  
  // Update last states
  lastManualState = manualButtonState;
  lastEmergencyState = emergencyButtonState;
}

void checkRS485Messages() {
  if (rs485.available()) {
    String message = rs485.readStringUntil('\n');
    message.trim();
    
    if (message.length() > 0) {
      Serial.println("RS485 received: " + message);
      handleRS485Message(message);
    }
  }
}

void handleRS485Message(String message) {
  // Expected format: "B;ACTION;DATA"
  int firstSemicolon = message.indexOf(';');
  int secondSemicolon = message.indexOf(';', firstSemicolon + 1);
  
  if (firstSemicolon == -1 || secondSemicolon == -1) {
    Serial.println("Invalid RS485 message format");
    return;
  }
  
  String target = message.substring(0, firstSemicolon);
  String type = message.substring(firstSemicolon + 1, secondSemicolon);
  String data = message.substring(secondSemicolon + 1);
  
  if (target != "B") {
    return; // Not for us
  }
  
  if (type == "ACTION") {
    handleRS485Action(data);
  } else if (type == "STATUS") {
    handleRS485Status(data);
  }
}

void handleRS485Action(String actionData) {
  if (actionData == "READ_RFID") {
    Serial.println("Manual RFID read requested");
    // Force an immediate RFID check
    lastRFIDScan = 0;
    
  } else if (actionData == "LED_TEST") {
    Serial.println("LED test requested");
    ledTest();
    
  } else if (actionData == "STATUS_REQUEST") {
    // Send status back to ESP32A
    String status = "ONLINE,RFID_READY,BUTTONS_READY";
    sendRS485Message("A", "STATUS", status);
  }
}

void handleRS485Status(String statusData) {
  Serial.println("Status update received: " + statusData);
  
  if (statusData == "EMERGENCY_ACTIVE") {
    // Flash emergency LED
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_EMERGENCY, HIGH);
      delay(200);
      digitalWrite(LED_EMERGENCY, LOW);
      delay(200);
    }
  } else if (statusData == "MEETING_ACTIVE") {
    // Flash RFID LED to indicate meeting is active
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_RFID, HIGH);
      delay(100);
      digitalWrite(LED_RFID, LOW);
      delay(100);
    }
  }
}

void sendRS485Message(String target, String type, String data) {
  String message = target + ";" + type + ";" + data + "\n";
  
  // Switch to transmit mode
  digitalWrite(RS485_DE_RE, HIGH);
  delay(1);
  
  rs485.print(message);
  rs485.flush();
  
  // Switch back to receive mode
  delay(1);
  digitalWrite(RS485_DE_RE, LOW);
  
  Serial.println("RS485 sent: " + message.substring(0, message.length() - 1));
}

void startupSequence() {
  Serial.println("Running startup LED sequence...");
  
  // Turn all LEDs on
  digitalWrite(LED_STATUS, HIGH);
  digitalWrite(LED_RFID, HIGH);
  digitalWrite(LED_EMERGENCY, HIGH);
  delay(500);
  
  // Turn all LEDs off
  digitalWrite(LED_STATUS, LOW);
  digitalWrite(LED_RFID, LOW);
  digitalWrite(LED_EMERGENCY, LOW);
  delay(300);
  
  // Sequential LED test
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_STATUS, HIGH);
    delay(200);
    digitalWrite(LED_STATUS, LOW);
    
    digitalWrite(LED_RFID, HIGH);
    delay(200);
    digitalWrite(LED_RFID, LOW);
    
    digitalWrite(LED_EMERGENCY, HIGH);
    delay(200);
    digitalWrite(LED_EMERGENCY, LOW);
  }
  
  // Final state - only status LED on
  digitalWrite(LED_STATUS, HIGH);
}

void ledTest() {
  Serial.println("Running LED test...");
  
  // Test each LED individually
  for (int led = LED_STATUS; led <= LED_EMERGENCY; led += (LED_RFID - LED_STATUS)) {
    for (int i = 0; i < 5; i++) {
      digitalWrite(led, HIGH);
      delay(100);
      digitalWrite(led, LOW);
      delay(100);
    }
  }
  
  // Return to normal state
  digitalWrite(LED_STATUS, HIGH);
  digitalWrite(LED_RFID, LOW);
  digitalWrite(LED_EMERGENCY, LOW);
}