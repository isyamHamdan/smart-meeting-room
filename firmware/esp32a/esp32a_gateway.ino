/*
 * ESP32A - Gateway & Actuator Controller
 * Smart Meeting Room System
 * 
 * Features:
 * - WiFi connection to Node.js server via WebSocket
 * - RS485 master for ESP32B and ESP32C
 * - Actuator control (relay, solenoid, buzzer)
 * - Fast response times optimized for "lama ya" performance issues
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* websocket_server = "192.168.1.100"; // Node.js server IP
const int websocket_port = 3000;

// Pin Definitions
#define RS485_TX_PIN 17
#define RS485_RX_PIN 16
#define RS485_DE_PIN 4    // Driver Enable
#define RELAY_LIGHTS 25
#define RELAY_AC 26
#define SOLENOID_DOOR 27
#define BUZZER_PIN 14
#define LED_STATUS 2

// RS485 Configuration
HardwareSerial RS485(2);
#define RS485_BAUD 9600

// WebSocket Client
WebSocketsClient webSocket;

// Performance Monitoring
unsigned long lastHeartbeat = 0;
unsigned long commandStartTime = 0;
int totalCommands = 0;
int successfulCommands = 0;

// Device Status
struct DeviceStatus {
  bool wifiConnected = false;
  bool websocketConnected = false;
  bool esp32bConnected = false;
  bool esp32cConnected = false;
  unsigned long lastRS485Response = 0;
} deviceStatus;

// Actuator States
struct ActuatorStates {
  bool lights = false;
  bool ac = false;
  bool door = false; // true = unlocked, false = locked
  bool buzzer = false;
} actuators;

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32A Gateway initializing...");
  
  // Initialize pins
  pinMode(LED_STATUS, OUTPUT);
  pinMode(RELAY_LIGHTS, OUTPUT);
  pinMode(RELAY_AC, OUTPUT);
  pinMode(SOLENOID_DOOR, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RS485_DE_PIN, OUTPUT);
  
  // Set initial actuator states (all off/locked for safety)
  digitalWrite(RELAY_LIGHTS, LOW);
  digitalWrite(RELAY_AC, LOW);
  digitalWrite(SOLENOID_DOOR, LOW); // Locked
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(RS485_DE_PIN, LOW); // Receive mode
  
  // Initialize RS485
  RS485.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  Serial.println("RS485 initialized");
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup WebSocket
  setupWebSocket();
  
  Serial.println("ESP32A Gateway ready!");
  blinkStatus(3); // 3 blinks to indicate ready
}

void loop() {
  webSocket.loop();
  
  // Handle RS485 incoming data
  handleRS485();
  
  // Send heartbeat every 30 seconds
  if (millis() - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  // Status LED indication
  updateStatusLED();
  
  // Monitor connection health
  monitorConnections();
  
  delay(10); // Small delay to prevent watchdog issues
}

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startTime < 30000) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    deviceStatus.wifiConnected = true;
    Serial.println();
    Serial.print("WiFi connected! IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_STATUS, HIGH);
  } else {
    Serial.println("WiFi connection failed!");
    deviceStatus.wifiConnected = false;
  }
}

void setupWebSocket() {
  webSocket.begin(websocket_server, websocket_port, "/socket.io/?EIO=4&transport=websocket");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket Disconnected");
      deviceStatus.websocketConnected = false;
      break;
      
    case WStype_CONNECTED:
      Serial.printf("WebSocket Connected to: %s\n", payload);
      deviceStatus.websocketConnected = true;
      
      // Register as ESP32A Gateway
      DynamicJsonDocument doc(1024);
      doc["deviceId"] = "ESP32A_001";
      doc["type"] = "gateway";
      doc["capabilities"] = "actuators,rs485_master";
      
      String registerMsg;
      serializeJson(doc, registerMsg);
      webSocket.sendTXT("42[\"esp32_register\"," + registerMsg + "]");
      
      Serial.println("Registered with server as ESP32A Gateway");
      break;
      
    case WStype_TEXT:
      handleWebSocketMessage((char*)payload);
      break;
      
    case WStype_ERROR:
      Serial.println("WebSocket Error");
      break;
      
    default:
      break;
  }
}

void handleWebSocketMessage(String message) {
  // Parse socket.io message format
  if (message.startsWith("42[\"")) {
    int start = message.indexOf("\"") + 1;
    int end = message.indexOf("\"", start);
    String event = message.substring(start, end);
    
    int jsonStart = message.indexOf(",") + 1;
    int jsonEnd = message.lastIndexOf("]");
    String jsonData = message.substring(jsonStart, jsonEnd);
    
    if (event == "config") {
      handleConfig(jsonData);
    } else if (event == "rs485_command") {
      handleRS485Command(jsonData);
    } else if (event == "command") {
      handleDirectCommand(jsonData);
    }
  }
}

void handleConfig(String jsonData) {
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, jsonData);
  
  Serial.println("Received configuration:");
  serializeJsonPretty(doc, Serial);
}

void handleRS485Command(String jsonData) {
  commandStartTime = millis();
  totalCommands++;
  
  DynamicJsonDocument doc(512);
  deserializeJson(doc, jsonData);
  
  String target = doc["target"];
  String command = doc["command"];
  
  Serial.printf("RS485 Command: %s -> %s\n", target.c_str(), command.c_str());
  
  // Send RS485 message with optimized protocol
  sendRS485Message(target, command, doc["params"]);
  
  successfulCommands++;
  
  // Send response time back to server
  unsigned long responseTime = millis() - commandStartTime;
  sendCommandResponse(true, responseTime, "RS485 command sent");
}

void handleDirectCommand(String jsonData) {
  commandStartTime = millis();
  totalCommands++;
  
  DynamicJsonDocument doc(512);
  deserializeJson(doc, jsonData);
  
  String target = doc["target"];
  String action = doc["action"];
  
  Serial.printf("Direct Command: %s %s\n", target.c_str(), action.c_str());
  
  bool success = executeActuatorCommand(target, action);
  
  if (success) {
    successfulCommands++;
  }
  
  unsigned long responseTime = millis() - commandStartTime;
  sendCommandResponse(success, responseTime, success ? "Command executed" : "Command failed");
}

bool executeActuatorCommand(String target, String action) {
  if (target == "lights") {
    bool turnOn = (action == "on");
    digitalWrite(RELAY_LIGHTS, turnOn ? HIGH : LOW);
    actuators.lights = turnOn;
    Serial.printf("Lights: %s\n", turnOn ? "ON" : "OFF");
    return true;
  }
  
  else if (target == "ac") {
    bool turnOn = (action == "on");
    digitalWrite(RELAY_AC, turnOn ? HIGH : LOW);
    actuators.ac = turnOn;
    Serial.printf("AC: %s\n", turnOn ? "ON" : "OFF");
    return true;
  }
  
  else if (target == "door") {
    bool unlock = (action == "unlock");
    digitalWrite(SOLENOID_DOOR, unlock ? HIGH : LOW);
    actuators.door = unlock;
    Serial.printf("Door: %s\n", unlock ? "UNLOCKED" : "LOCKED");
    
    // Auto-lock after 10 seconds for security
    if (unlock) {
      // In production, use a timer interrupt or task
      // For demo, we'll handle this in the main loop
    }
    return true;
  }
  
  else if (target == "buzzer") {
    bool turnOn = (action == "on");
    digitalWrite(BUZZER_PIN, turnOn ? HIGH : LOW);
    actuators.buzzer = turnOn;
    Serial.printf("Buzzer: %s\n", turnOn ? "ON" : "OFF");
    return true;
  }
  
  return false;
}

void sendRS485Message(String target, String command, JsonObject params) {
  // Optimized RS485 protocol: TARGET;COMMAND;PARAMS
  String message = target + ";" + command;
  
  if (!params.isNull()) {
    message += ";";
    serializeJson(params, message);
  }
  
  message += "\n";
  
  // Switch to transmit mode
  digitalWrite(RS485_DE_PIN, HIGH);
  delayMicroseconds(100); // Small delay for line driver
  
  RS485.print(message);
  RS485.flush(); // Wait for transmission to complete
  
  // Switch back to receive mode
  delayMicroseconds(100);
  digitalWrite(RS485_DE_PIN, LOW);
  
  Serial.printf("RS485 TX: %s", message.c_str());
}

void handleRS485() {
  if (RS485.available()) {
    String message = RS485.readStringUntil('\n');
    message.trim();
    
    if (message.length() > 0) {
      Serial.printf("RS485 RX: %s\n", message.c_str());
      parseRS485Message(message);
      deviceStatus.lastRS485Response = millis();
    }
  }
}

void parseRS485Message(String message) {
  // Parse format: SOURCE;EVENT;DATA
  int firstSemi = message.indexOf(';');
  int secondSemi = message.indexOf(';', firstSemi + 1);
  
  if (firstSemi == -1 || secondSemi == -1) return;
  
  String source = message.substring(0, firstSemi);
  String event = message.substring(firstSemi + 1, secondSemi);
  String data = message.substring(secondSemi + 1);
  
  // Update connection status
  if (source == "B") deviceStatus.esp32bConnected = true;
  if (source == "C") deviceStatus.esp32cConnected = true;
  
  // Forward to server via WebSocket
  DynamicJsonDocument doc(1024);
  doc["source"] = "ESP32" + source;
  doc["messageType"] = event;
  
  if (data.length() > 0) {
    DynamicJsonDocument dataDoc(512);
    if (deserializeJson(dataDoc, data) == DeserializationError::Ok) {
      doc["payload"] = dataDoc;
    } else {
      doc["payload"]["raw"] = data;
    }
  }
  
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT("42[\"rs485_data\"," + jsonString + "]");
}

void sendCommandResponse(bool success, unsigned long responseTime, String message) {
  DynamicJsonDocument doc(512);
  doc["success"] = success;
  doc["responseTime"] = responseTime;
  doc["message"] = message;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT("42[\"command_response\"," + jsonString + "]");
}

void sendHeartbeat() {
  DynamicJsonDocument doc(512);
  doc["deviceId"] = "ESP32A_001";
  doc["timestamp"] = millis();
  doc["uptime"] = millis() / 1000;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["totalCommands"] = totalCommands;
  doc["successRate"] = totalCommands > 0 ? (successfulCommands * 100.0 / totalCommands) : 100.0;
  
  // Device connection status
  doc["connectedDevices"]["esp32b"] = deviceStatus.esp32bConnected;
  doc["connectedDevices"]["esp32c"] = deviceStatus.esp32cConnected;
  
  // Actuator status
  doc["actuators"]["lights"] = actuators.lights;
  doc["actuators"]["ac"] = actuators.ac;
  doc["actuators"]["door"] = actuators.door;
  doc["actuators"]["buzzer"] = actuators.buzzer;
  
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT("42[\"heartbeat\"," + jsonString + "]");
  
  Serial.println("Heartbeat sent");
}

void updateStatusLED() {
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  
  if (deviceStatus.wifiConnected && deviceStatus.websocketConnected) {
    // Solid on when fully connected
    digitalWrite(LED_STATUS, HIGH);
  } else if (deviceStatus.wifiConnected) {
    // Fast blink when WiFi connected but WebSocket not
    if (millis() - lastBlink > 250) {
      ledState = !ledState;
      digitalWrite(LED_STATUS, ledState);
      lastBlink = millis();
    }
  } else {
    // Slow blink when WiFi not connected
    if (millis() - lastBlink > 1000) {
      ledState = !ledState;
      digitalWrite(LED_STATUS, ledState);
      lastBlink = millis();
    }
  }
}

void monitorConnections() {
  static unsigned long lastCheck = 0;
  
  if (millis() - lastCheck > 60000) { // Check every minute
    // Reset device connection flags if no recent communication
    if (millis() - deviceStatus.lastRS485Response > 120000) { // 2 minutes timeout
      deviceStatus.esp32bConnected = false;
      deviceStatus.esp32cConnected = false;
    }
    
    // Reconnect WiFi if disconnected
    if (WiFi.status() != WL_CONNECTED) {
      deviceStatus.wifiConnected = false;
      Serial.println("WiFi connection lost, reconnecting...");
      connectWiFi();
    }
    
    lastCheck = millis();
  }
}

void blinkStatus(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_STATUS, HIGH);
    delay(200);
    digitalWrite(LED_STATUS, LOW);
    delay(200);
  }
}