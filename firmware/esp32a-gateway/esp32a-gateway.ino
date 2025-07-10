#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// WiFi credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// WebSocket server configuration
const char* websocket_server = "192.168.1.100";  // Change to your server IP
const int websocket_port = 3000;

// RS485 Communication
HardwareSerial rs485(2);  // Use Serial2 for RS485
#define RS485_DE_RE 4     // Driver Enable / Receiver Enable pin

// GPIO Pins for actuators
#define RELAY_LIGHTS 18
#define RELAY_AC 19
#define RELAY_POWER 21
#define SOLENOID_DOOR 22
#define BUZZER 23

// System state
struct SystemState {
  bool lights_on = false;
  bool ac_on = false;
  bool power_on = false;
  bool door_unlocked = false;
  bool emergency_mode = false;
  String current_meeting_id = "";
} systemState;

WebSocketsClient webSocket;
unsigned long lastHeartbeat = 0;
unsigned long lastRS485Check = 0;

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32A Gateway & Actuator starting...");
  
  // Initialize GPIO pins
  pinMode(RELAY_LIGHTS, OUTPUT);
  pinMode(RELAY_AC, OUTPUT);
  pinMode(RELAY_POWER, OUTPUT);
  pinMode(SOLENOID_DOOR, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(RS485_DE_RE, OUTPUT);
  
  // Set initial states (all OFF/LOCKED)
  digitalWrite(RELAY_LIGHTS, LOW);
  digitalWrite(RELAY_AC, LOW);
  digitalWrite(RELAY_POWER, LOW);
  digitalWrite(SOLENOID_DOOR, LOW);  // LOW = locked
  digitalWrite(BUZZER, LOW);
  digitalWrite(RS485_DE_RE, LOW);    // Receive mode
  
  // Initialize RS485
  rs485.begin(9600, SERIAL_8N1, 16, 17);  // RX=16, TX=17
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize WebSocket
  setupWebSocket();
  
  Serial.println("ESP32A Gateway initialized successfully");
}

void loop() {
  webSocket.loop();
  
  // Check RS485 messages every 100ms
  if (millis() - lastRS485Check > 100) {
    checkRS485Messages();
    lastRS485Check = millis();
  }
  
  // Send heartbeat every 30 seconds
  if (millis() - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  delay(10);
}

void setupWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("WiFi connected! IP address: ");
  Serial.println(WiFi.localIP());
}

void setupWebSocket() {
  webSocket.begin(websocket_server, websocket_port, "/socket.io/?EIO=4&transport=websocket");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  
  Serial.println("WebSocket client initialized");
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket Disconnected");
      break;
      
    case WStype_CONNECTED:
      Serial.printf("WebSocket Connected to: %s\n", payload);
      // Announce ESP32A connection
      sendESP32AConnect();
      break;
      
    case WStype_TEXT:
      Serial.printf("Received: %s\n", payload);
      handleWebSocketMessage((char*)payload);
      break;
      
    default:
      break;
  }
}

void handleWebSocketMessage(String message) {
  // Parse Socket.IO message format
  if (message.startsWith("42[")) {
    // Remove Socket.IO wrapper
    int start = message.indexOf('[');
    int end = message.lastIndexOf(']');
    String jsonStr = message.substring(start, end + 1);
    
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, jsonStr);
    
    if (error) {
      Serial.println("JSON parsing failed");
      return;
    }
    
    String event = doc[0];
    JsonObject data = doc[1];
    
    if (event == "system_state") {
      handleSystemState(data);
    } else if (event == "unlock_room") {
      handleUnlockRoom(data);
    } else if (event == "lock_room") {
      handleLockRoom(data);
    } else if (event == "lights_control") {
      handleLightsControl(data);
    } else if (event == "ac_control") {
      handleACControl(data);
    } else if (event == "door_control") {
      handleDoorControl(data);
    } else if (event == "emergency_unlock") {
      handleEmergencyUnlock();
    }
  }
}

void handleSystemState(JsonObject data) {
  Serial.println("Received system state update");
  // Update local state based on server state
  bool currentMeeting = data["current_meeting"];
  systemState.emergency_mode = data["emergency_state"];
}

void handleUnlockRoom(JsonObject data) {
  String meetingId = data["meetingId"];
  long duration = data["duration"];
  
  Serial.println("Unlocking room for meeting: " + meetingId);
  
  systemState.current_meeting_id = meetingId;
  systemState.door_unlocked = true;
  systemState.lights_on = true;
  systemState.power_on = true;
  
  // Activate actuators
  digitalWrite(SOLENOID_DOOR, HIGH);  // Unlock door
  digitalWrite(RELAY_LIGHTS, HIGH);   // Turn on lights
  digitalWrite(RELAY_POWER, HIGH);    // Turn on power outlets
  
  // Send confirmation buzzer
  buzzConfirmation();
  
  // Notify ESP32C to start meeting display
  sendRS485Message("C", "DISPLAY", "START_MEETING," + meetingId);
  
  // Send status update
  sendActuatorStatus();
}

void handleLockRoom(JsonObject data) {
  String meetingId = data["meetingId"];
  
  Serial.println("Locking room after meeting: " + meetingId);
  
  systemState.current_meeting_id = "";
  systemState.door_unlocked = false;
  systemState.lights_on = false;
  systemState.ac_on = false;
  systemState.power_on = false;
  
  // Deactivate actuators
  digitalWrite(SOLENOID_DOOR, LOW);   // Lock door
  digitalWrite(RELAY_LIGHTS, LOW);    // Turn off lights
  digitalWrite(RELAY_AC, LOW);        // Turn off AC
  digitalWrite(RELAY_POWER, LOW);     // Turn off power outlets
  
  // Notify ESP32C to end meeting display
  sendRS485Message("C", "DISPLAY", "END_MEETING");
  
  // Send status update
  sendActuatorStatus();
}

void handleLightsControl(JsonObject data) {
  bool on = data["on"];
  systemState.lights_on = on;
  digitalWrite(RELAY_LIGHTS, on ? HIGH : LOW);
  Serial.println("Lights " + String(on ? "ON" : "OFF"));
  sendActuatorStatus();
}

void handleACControl(JsonObject data) {
  bool on = data["on"];
  systemState.ac_on = on;
  digitalWrite(RELAY_AC, on ? HIGH : LOW);
  Serial.println("AC " + String(on ? "ON" : "OFF"));
  sendActuatorStatus();
}

void handleDoorControl(JsonObject data) {
  bool locked = data["locked"];
  systemState.door_unlocked = !locked;
  digitalWrite(SOLENOID_DOOR, locked ? LOW : HIGH);
  Serial.println("Door " + String(locked ? "LOCKED" : "UNLOCKED"));
  sendActuatorStatus();
}

void handleEmergencyUnlock() {
  Serial.println("EMERGENCY UNLOCK ACTIVATED!");
  
  systemState.emergency_mode = true;
  systemState.door_unlocked = true;
  
  // Unlock door immediately
  digitalWrite(SOLENOID_DOOR, HIGH);
  
  // Emergency buzzer pattern
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(200);
    digitalWrite(BUZZER, LOW);
    delay(200);
  }
  
  // Notify ESP32C about emergency
  sendRS485Message("C", "DISPLAY", "EMERGENCY");
  
  sendActuatorStatus();
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
  // Expected format: "A;EVENT;DATA"
  int firstSemicolon = message.indexOf(';');
  int secondSemicolon = message.indexOf(';', firstSemicolon + 1);
  
  if (firstSemicolon == -1 || secondSemicolon == -1) {
    Serial.println("Invalid RS485 message format");
    return;
  }
  
  String target = message.substring(0, firstSemicolon);
  String type = message.substring(firstSemicolon + 1, secondSemicolon);
  String data = message.substring(secondSemicolon + 1);
  
  if (target != "A") {
    return; // Not for us
  }
  
  if (type == "EVENT") {
    handleRS485Event(data);
  }
}

void handleRS485Event(String eventData) {
  if (eventData.startsWith("RFID_SCANNED,")) {
    String cardId = eventData.substring(13);
    Serial.println("RFID scanned: " + cardId);
    
    // Send to server
    DynamicJsonDocument doc(256);
    doc[0] = "rfid_scanned";
    doc[1]["cardId"] = cardId;
    doc[1]["timestamp"] = millis();
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT("42" + message);
    
  } else if (eventData == "MANUAL_BUTTON") {
    Serial.println("Manual button pressed");
    
    // Send to server
    DynamicJsonDocument doc(256);
    doc[0] = "manual_button";
    doc[1]["timestamp"] = millis();
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT("42" + message);
    
  } else if (eventData == "EMERGENCY_BUTTON") {
    Serial.println("Emergency button pressed!");
    
    // Send to server
    DynamicJsonDocument doc(256);
    doc[0] = "emergency_pressed";
    doc[1]["timestamp"] = millis();
    
    String message;
    serializeJson(doc, message);
    webSocket.sendTXT("42" + message);
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

void sendESP32AConnect() {
  DynamicJsonDocument doc(256);
  doc[0] = "esp32a_connect";
  doc[1]["device"] = "ESP32A_Gateway";
  doc[1]["version"] = "1.0";
  doc[1]["ip"] = WiFi.localIP().toString();
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT("42" + message);
}

void sendActuatorStatus() {
  DynamicJsonDocument doc(512);
  doc[0] = "actuator_status";
  doc[1]["lights"] = systemState.lights_on;
  doc[1]["ac"] = systemState.ac_on;
  doc[1]["power"] = systemState.power_on;
  doc[1]["door"] = systemState.door_unlocked;
  doc[1]["emergency"] = systemState.emergency_mode;
  doc[1]["meeting_id"] = systemState.current_meeting_id;
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT("42" + message);
}

void sendHeartbeat() {
  DynamicJsonDocument doc(256);
  doc[0] = "heartbeat";
  doc[1]["timestamp"] = millis();
  doc[1]["uptime"] = millis() / 1000;
  doc[1]["free_heap"] = ESP.getFreeHeap();
  
  String message;
  serializeJson(doc, message);
  webSocket.sendTXT("42" + message);
}

void buzzConfirmation() {
  digitalWrite(BUZZER, HIGH);
  delay(100);
  digitalWrite(BUZZER, LOW);
  delay(50);
  digitalWrite(BUZZER, HIGH);
  delay(100);
  digitalWrite(BUZZER, LOW);
}