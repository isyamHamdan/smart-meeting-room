/*
 * ESP32C - Display Controller
 * Smart Meeting Room System
 * 
 * Features:
 * - OLED/LCD display for room status and countdown
 * - RS485 communication to ESP32A
 * - Fast display updates for immediate visual feedback
 * - Meeting countdown timer
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HardwareSerial.h>
#include <ArduinoJson.h>

// Display Configuration
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Pin Definitions
#define RS485_TX_PIN 17
#define RS485_RX_PIN 16
#define RS485_DE_PIN 4
#define LED_STATUS 2
#define BACKLIGHT_PIN 25

// RS485 Configuration
HardwareSerial RS485(2);
#define RS485_BAUD 9600

// Display State
struct DisplayState {
  String roomName = "Conference Room 1";
  String status = "Available";
  String message = "Ready to use";
  int countdown = 0; // seconds
  bool countdownActive = false;
  unsigned long countdownStart = 0;
  bool backlightOn = true;
} displayState;

// Performance tracking
unsigned long lastUpdate = 0;
unsigned long lastHeartbeat = 0;
unsigned long totalUpdates = 0;
unsigned long lastRS485Response = 0;

// Animation state
bool isAnimating = false;
int animationFrame = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32C Display initializing...");
  
  // Initialize pins
  pinMode(LED_STATUS, OUTPUT);
  pinMode(BACKLIGHT_PIN, OUTPUT);
  pinMode(RS485_DE_PIN, OUTPUT);
  
  // Set initial states
  digitalWrite(LED_STATUS, LOW);
  digitalWrite(BACKLIGHT_PIN, HIGH); // Backlight on
  digitalWrite(RS485_DE_PIN, LOW); // Receive mode
  
  // Initialize RS485
  RS485.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  Serial.println("RS485 initialized");
  
  // Initialize display
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println("SSD1306 allocation failed");
    // Flash status LED to indicate error
    for (int i = 0; i < 10; i++) {
      digitalWrite(LED_STATUS, HIGH);
      delay(100);
      digitalWrite(LED_STATUS, LOW);
      delay(100);
    }
    return;
  }
  
  Serial.println("OLED display initialized");
  
  // Clear display and show startup message
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  showStartupScreen();
  
  Serial.println("ESP32C Display ready!");
  
  // Send initial status
  sendStatusUpdate();
}

void loop() {
  // Handle RS485 communication
  handleRS485();
  
  // Update display if needed
  updateDisplay();
  
  // Handle countdown timer
  updateCountdown();
  
  // Send heartbeat every 60 seconds
  if (millis() - lastHeartbeat > 60000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  // Monitor communication health
  monitorCommunication();
  
  delay(100); // 10 FPS display update rate
}

void showStartupScreen() {
  display.clearDisplay();
  
  // Title
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println("Smart");
  display.println("Meeting");
  display.setTextSize(1);
  display.println("Room System");
  
  // Version info
  display.setCursor(0, 55);
  display.print("ESP32C v1.0");
  
  display.display();
  delay(3000);
}

void updateDisplay() {
  static unsigned long lastDisplayUpdate = 0;
  
  // Update display at 10 FPS for smooth animations
  if (millis() - lastDisplayUpdate > 100) {
    drawMainScreen();
    lastDisplayUpdate = millis();
    totalUpdates++;
  }
}

void drawMainScreen() {
  display.clearDisplay();
  
  // Header with room name
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(displayState.roomName);
  
  // Status line
  display.drawLine(0, 10, SCREEN_WIDTH, 10, SSD1306_WHITE);
  
  // Room status
  display.setTextSize(2);
  display.setCursor(0, 15);
  
  if (displayState.status == "Available") {
    display.println("AVAILABLE");
  } else if (displayState.status == "Occupied") {
    display.println("OCCUPIED");
  } else if (displayState.status == "Maintenance") {
    display.println("MAINTENANCE");
  }
  
  // Message or countdown
  display.setTextSize(1);
  display.setCursor(0, 35);
  
  if (displayState.countdownActive && displayState.countdown > 0) {
    // Show countdown timer
    int minutes = displayState.countdown / 60;
    int seconds = displayState.countdown % 60;
    
    display.printf("Time remaining:");
    display.setCursor(0, 45);
    display.setTextSize(2);
    display.printf("%02d:%02d", minutes, seconds);
    
    // Progress bar
    int totalTime = 1800; // Assume 30 minutes max
    int progress = map(displayState.countdown, 0, totalTime, 0, SCREEN_WIDTH);
    display.drawRect(0, 58, SCREEN_WIDTH, 6, SSD1306_WHITE);
    display.fillRect(0, 58, progress, 6, SSD1306_WHITE);
    
  } else {
    // Show message
    display.println(displayState.message);
    
    // Show current time (using millis as demo)
    unsigned long currentTime = millis() / 1000;
    int hours = (currentTime / 3600) % 24;
    int minutes = (currentTime / 60) % 60;
    int seconds = currentTime % 60;
    
    display.setCursor(0, 50);
    display.printf("Time: %02d:%02d:%02d", hours, minutes, seconds);
  }
  
  // Status indicator
  display.fillCircle(SCREEN_WIDTH - 10, 5, 3, 
    lastRS485Response > 0 && (millis() - lastRS485Response < 60000) ? 
    SSD1306_WHITE : SSD1306_BLACK);
  
  // Animation for transitions
  if (isAnimating) {
    drawAnimation();
  }
  
  display.display();
}

void drawAnimation() {
  // Simple fade/transition animation
  animationFrame++;
  if (animationFrame > 10) {
    isAnimating = false;
    animationFrame = 0;
  }
  
  // Draw some animated elements (dots, etc.)
  for (int i = 0; i < 3; i++) {
    if ((animationFrame + i) % 4 == 0) {
      display.fillCircle(110 + i * 6, 58, 2, SSD1306_WHITE);
    }
  }
}

void updateCountdown() {
  if (displayState.countdownActive && displayState.countdown > 0) {
    unsigned long elapsed = (millis() - displayState.countdownStart) / 1000;
    int remainingTime = displayState.countdown - elapsed;
    
    if (remainingTime <= 0) {
      // Countdown finished
      displayState.countdownActive = false;
      displayState.countdown = 0;
      displayState.message = "Session ended";
      displayState.status = "Available";
      
      // Notify ESP32A
      sendCountdownFinished();
      
      // Flash display
      for (int i = 0; i < 3; i++) {
        digitalWrite(BACKLIGHT_PIN, LOW);
        delay(200);
        digitalWrite(BACKLIGHT_PIN, HIGH);
        delay(200);
      }
    } else {
      displayState.countdown = remainingTime;
    }
  }
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
  
  // Check if message is for us (C)
  if (target != "C") return;
  
  String command = message.substring(firstSemi + 1, secondSemi != -1 ? secondSemi : message.length());
  String params = secondSemi != -1 ? message.substring(secondSemi + 1) : "";
  
  Serial.printf("Command received: %s\n", command.c_str());
  
  // Handle commands from ESP32A
  if (command == "UPDATE_DISPLAY") {
    updateDisplayFromParams(params);
  }
  else if (command == "START_MEETING") {
    startMeeting(params);
  }
  else if (command == "END_MEETING") {
    endMeeting();
  }
  else if (command == "SET_MESSAGE") {
    setDisplayMessage(params);
  }
  else if (command == "SET_STATUS") {
    setRoomStatus(params);
  }
  else if (command == "START_COUNTDOWN") {
    startCountdown(params);
  }
  else if (command == "BACKLIGHT") {
    controlBacklight(params);
  }
  else if (command == "STATUS_REQUEST") {
    sendStatusUpdate();
  }
  
  // Send acknowledgment
  sendCommandAck(command);
}

void updateDisplayFromParams(String params) {
  if (params.length() == 0) return;
  
  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, params) != DeserializationError::Ok) return;
  
  isAnimating = true; // Start transition animation
  
  if (doc.containsKey("message")) {
    displayState.message = doc["message"].as<String>();
  }
  
  if (doc.containsKey("status")) {
    displayState.status = doc["status"].as<String>();
  }
  
  if (doc.containsKey("countdown")) {
    displayState.countdown = doc["countdown"];
    if (displayState.countdown > 0) {
      displayState.countdownActive = true;
      displayState.countdownStart = millis();
    }
  }
  
  Serial.println("Display updated from parameters");
}

void startMeeting(String params) {
  displayState.status = "Occupied";
  displayState.message = "Meeting in progress";
  
  // Parse meeting duration if provided
  if (params.length() > 0) {
    DynamicJsonDocument doc(256);
    if (deserializeJson(doc, params) == DeserializationError::Ok) {
      if (doc.containsKey("duration")) {
        displayState.countdown = doc["duration"];
        displayState.countdownActive = true;
        displayState.countdownStart = millis();
      }
    }
  }
  
  isAnimating = true;
  Serial.println("Meeting started on display");
}

void endMeeting() {
  displayState.status = "Available";
  displayState.message = "Ready to use";
  displayState.countdownActive = false;
  displayState.countdown = 0;
  
  isAnimating = true;
  Serial.println("Meeting ended on display");
}

void setDisplayMessage(String params) {
  if (params.length() > 0) {
    displayState.message = params;
    isAnimating = true;
  }
}

void setRoomStatus(String params) {
  if (params.length() > 0) {
    displayState.status = params;
    isAnimating = true;
  }
}

void startCountdown(String params) {
  if (params.length() > 0) {
    int seconds = params.toInt();
    if (seconds > 0) {
      displayState.countdown = seconds;
      displayState.countdownActive = true;
      displayState.countdownStart = millis();
      isAnimating = true;
    }
  }
}

void controlBacklight(String params) {
  if (params == "on") {
    digitalWrite(BACKLIGHT_PIN, HIGH);
    displayState.backlightOn = true;
  } else if (params == "off") {
    digitalWrite(BACKLIGHT_PIN, LOW);
    displayState.backlightOn = false;
  }
}

void sendCommandAck(String command) {
  DynamicJsonDocument doc(256);
  doc["command"] = command;
  doc["status"] = "executed";
  doc["timestamp"] = millis();
  doc["deviceId"] = "ESP32C_001";
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "COMMAND_ACK", payload);
}

void sendCountdownFinished() {
  DynamicJsonDocument doc(256);
  doc["event"] = "countdown_finished";
  doc["timestamp"] = millis();
  doc["deviceId"] = "ESP32C_001";
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "COUNTDOWN_FINISHED", payload);
}

void sendStatusUpdate() {
  DynamicJsonDocument doc(512);
  doc["deviceId"] = "ESP32C_001";
  doc["status"] = "online";
  doc["display"]["status"] = displayState.status;
  doc["display"]["message"] = displayState.message;
  doc["display"]["countdown"] = displayState.countdown;
  doc["display"]["countdownActive"] = displayState.countdownActive;
  doc["display"]["backlight"] = displayState.backlightOn;
  doc["stats"]["totalUpdates"] = totalUpdates;
  doc["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  sendRS485Message("A", "STATUS_UPDATE", payload);
}

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc["deviceId"] = "ESP32C_001";
  doc["timestamp"] = millis();
  doc["uptime"] = millis() / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["displayUpdates"] = totalUpdates;
  
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
}

void monitorCommunication() {
  static unsigned long lastCheck = 0;
  
  if (millis() - lastCheck > 30000) { // Check every 30 seconds
    // Update status LED based on communication health
    if (lastRS485Response > 0 && (millis() - lastRS485Response < 120000)) {
      digitalWrite(LED_STATUS, HIGH); // Communication OK
    } else {
      // Flash LED to indicate communication issues
      digitalWrite(LED_STATUS, (millis() / 500) % 2);
    }
    
    lastCheck = millis();
  }
}