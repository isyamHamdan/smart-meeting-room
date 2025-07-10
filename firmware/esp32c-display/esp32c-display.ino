#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <HardwareSerial.h>
#include <WiFi.h>
#include <time.h>

// LCD configuration (20x4 display)
LiquidCrystal_I2C lcd(0x27, 20, 4);

// RS485 Communication
HardwareSerial rs485(2);  // Use Serial2 for RS485
#define RS485_DE_RE 4     // Driver Enable / Receiver Enable pin

// Display state
struct DisplayState {
  bool meeting_active = false;
  String meeting_title = "";
  String meeting_organizer = "";
  String meeting_id = "";
  unsigned long meeting_start = 0;
  unsigned long meeting_end = 0;
  bool emergency_mode = false;
  bool display_on = true;
} displayState;

// Timing
unsigned long lastDisplayUpdate = 0;
unsigned long lastTimeUpdate = 0;
const unsigned long DISPLAY_UPDATE_INTERVAL = 1000;  // Update every second
const unsigned long TIME_UPDATE_INTERVAL = 1000;     // Update time every second

// Custom characters for LCD
byte clockChar[8] = {
  0b00000,
  0b01110,
  0b10001,
  0b10101,
  0b10011,
  0b10001,
  0b01110,
  0b00000
};

byte doorChar[8] = {
  0b11111,
  0b10001,
  0b10001,
  0b10101,
  0b10001,
  0b10001,
  0b11111,
  0b00000
};

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32C Display starting...");
  
  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  
  // Create custom characters
  lcd.createChar(0, clockChar);
  lcd.createChar(1, doorChar);
  
  // Initialize RS485
  rs485.begin(9600, SERIAL_8N1, 16, 17);  // RX=16, TX=17
  pinMode(RS485_DE_RE, OUTPUT);
  digitalWrite(RS485_DE_RE, LOW);  // Receive mode
  
  // Show startup message
  showStartupMessage();
  
  Serial.println("ESP32C Display initialized successfully");
}

void loop() {
  // Check RS485 messages
  checkRS485Messages();
  
  // Update display if needed
  if (millis() - lastDisplayUpdate > DISPLAY_UPDATE_INTERVAL) {
    updateDisplay();
    lastDisplayUpdate = millis();
  }
  
  delay(100);
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
  // Expected format: "C;TYPE;DATA"
  int firstSemicolon = message.indexOf(';');
  int secondSemicolon = message.indexOf(';', firstSemicolon + 1);
  
  if (firstSemicolon == -1 || secondSemicolon == -1) {
    Serial.println("Invalid RS485 message format");
    return;
  }
  
  String target = message.substring(0, firstSemicolon);
  String type = message.substring(firstSemicolon + 1, secondSemicolon);
  String data = message.substring(secondSemicolon + 1);
  
  if (target != "C") {
    return; // Not for us
  }
  
  if (type == "DISPLAY") {
    handleDisplayCommand(data);
  } else if (type == "STATUS") {
    handleStatusCommand(data);
  }
}

void handleDisplayCommand(String command) {
  if (command.startsWith("START_MEETING,")) {
    String meetingId = command.substring(14);
    startMeetingDisplay(meetingId);
    
  } else if (command == "END_MEETING") {
    endMeetingDisplay();
    
  } else if (command == "EMERGENCY") {
    activateEmergencyDisplay();
    
  } else if (command == "CLEAR_EMERGENCY") {
    clearEmergencyDisplay();
    
  } else if (command.startsWith("MESSAGE,")) {
    String msg = command.substring(8);
    showCustomMessage(msg);
    
  } else if (command == "DISPLAY_OFF") {
    lcd.noBacklight();
    displayState.display_on = false;
    
  } else if (command == "DISPLAY_ON") {
    lcd.backlight();
    displayState.display_on = true;
  }
}

void handleStatusCommand(String status) {
  // Send status back to ESP32A
  String response = "ONLINE,DISPLAY_READY";
  if (displayState.meeting_active) {
    response += ",MEETING_ACTIVE";
  }
  if (displayState.emergency_mode) {
    response += ",EMERGENCY_MODE";
  }
  
  sendRS485Message("A", "STATUS", response);
}

void startMeetingDisplay(String meetingId) {
  Serial.println("Starting meeting display for: " + meetingId);
  
  displayState.meeting_active = true;
  displayState.meeting_id = meetingId;
  displayState.meeting_start = millis();
  displayState.emergency_mode = false;
  
  // For demo purposes, set meeting title
  displayState.meeting_title = "Meeting Room";
  displayState.meeting_organizer = "Admin";
  
  lcd.clear();
  showMeetingInProgress();
}

void endMeetingDisplay() {
  Serial.println("Ending meeting display");
  
  displayState.meeting_active = false;
  displayState.meeting_id = "";
  displayState.meeting_title = "";
  displayState.meeting_organizer = "";
  displayState.emergency_mode = false;
  
  lcd.clear();
  showAvailableRoom();
}

void activateEmergencyDisplay() {
  Serial.println("Activating emergency display");
  
  displayState.emergency_mode = true;
  
  lcd.clear();
  showEmergencyMessage();
}

void clearEmergencyDisplay() {
  Serial.println("Clearing emergency display");
  
  displayState.emergency_mode = false;
  
  if (displayState.meeting_active) {
    showMeetingInProgress();
  } else {
    showAvailableRoom();
  }
}

void updateDisplay() {
  if (!displayState.display_on) {
    return;
  }
  
  if (displayState.emergency_mode) {
    showEmergencyMessage();
  } else if (displayState.meeting_active) {
    showMeetingInProgress();
  } else {
    showAvailableRoom();
  }
}

void showStartupMessage() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Meeting Room");
  lcd.setCursor(0, 1);
  lcd.print("System Starting...");
  lcd.setCursor(0, 2);
  lcd.print("ESP32C Display v1.0");
  lcd.setCursor(0, 3);
  lcd.print("Please wait...");
  
  delay(3000);
  
  lcd.clear();
  showAvailableRoom();
}

void showAvailableRoom() {
  lcd.setCursor(0, 0);
  lcd.print("   MEETING ROOM    ");
  lcd.setCursor(0, 1);
  lcd.print("     AVAILABLE     ");
  lcd.setCursor(0, 2);
  lcd.print("                  ");
  lcd.setCursor(0, 3);
  lcd.print("Scan QR to book   ");
  
  // Show current time on line 2
  showCurrentTime(2);
}

void showMeetingInProgress() {
  // Line 0: Title
  lcd.setCursor(0, 0);
  String title = displayState.meeting_title;
  if (title.length() > 20) {
    title = title.substring(0, 17) + "...";
  }
  title = centerText(title, 20);
  lcd.print(title);
  
  // Line 1: Status
  lcd.setCursor(0, 1);
  lcd.print("  MEETING IN PROGRESS  ");
  
  // Line 2: Organizer
  lcd.setCursor(0, 2);
  String org = "Org: " + displayState.meeting_organizer;
  if (org.length() > 20) {
    org = org.substring(0, 17) + "...";
  }
  lcd.print(padRight(org, 20));
  
  // Line 3: Duration
  lcd.setCursor(0, 3);
  unsigned long duration = (millis() - displayState.meeting_start) / 1000;
  String timeStr = formatDuration(duration);
  lcd.write(0);  // Clock character
  lcd.print(" Duration: " + timeStr);
}

void showEmergencyMessage() {
  static bool blinkState = false;
  blinkState = !blinkState;
  
  if (blinkState) {
    lcd.setCursor(0, 0);
    lcd.print("!!!! EMERGENCY !!!!");
    lcd.setCursor(0, 1);
    lcd.print("   DOOR UNLOCKED   ");
    lcd.setCursor(0, 2);
    lcd.print("  EVACUATE SAFELY  ");
    lcd.setCursor(0, 3);
    lcd.print("!!!! EMERGENCY !!!!");
  } else {
    lcd.clear();
  }
}

void showCustomMessage(String message) {
  lcd.clear();
  
  // Split message into lines (max 20 chars per line)
  int lines = 0;
  int start = 0;
  
  while (start < message.length() && lines < 4) {
    String line = message.substring(start, min(start + 20, (int)message.length()));
    lcd.setCursor(0, lines);
    lcd.print(padRight(line, 20));
    
    start += 20;
    lines++;
  }
}

void showCurrentTime(int line) {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    lcd.setCursor(0, line);
    lcd.print("Time: --:--:--      ");
    return;
  }
  
  char timeStr[9];
  strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
  
  lcd.setCursor(0, line);
  lcd.write(0);  // Clock character
  lcd.print(" ");
  lcd.print(timeStr);
  lcd.print("           ");
}

String formatDuration(unsigned long seconds) {
  unsigned long hours = seconds / 3600;
  unsigned long minutes = (seconds % 3600) / 60;
  unsigned long secs = seconds % 60;
  
  String result = "";
  if (hours > 0) {
    result += String(hours) + "h ";
  }
  if (minutes > 0 || hours > 0) {
    result += String(minutes) + "m ";
  }
  result += String(secs) + "s";
  
  return result;
}

String centerText(String text, int width) {
  if (text.length() >= width) {
    return text.substring(0, width);
  }
  
  int padding = (width - text.length()) / 2;
  String result = "";
  
  for (int i = 0; i < padding; i++) {
    result += " ";
  }
  
  result += text;
  
  while (result.length() < width) {
    result += " ";
  }
  
  return result;
}

String padRight(String text, int width) {
  if (text.length() >= width) {
    return text.substring(0, width);
  }
  
  String result = text;
  while (result.length() < width) {
    result += " ";
  }
  
  return result;
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