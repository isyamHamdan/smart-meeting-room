const io = require('socket.io-client');

// ESP32A Simulator
class ESP32Simulator {
    constructor(deviceId, deviceType) {
        this.deviceId = deviceId;
        this.deviceType = deviceType;
        this.socket = null;
        this.isConnected = false;
    }
    
    connect(serverUrl = 'http://localhost:3000') {
        console.log(`[${this.deviceId}] Connecting to server...`);
        
        this.socket = io(serverUrl);
        
        this.socket.on('connect', () => {
            console.log(`[${this.deviceId}] Connected to server`);
            this.identify();
        });
        
        this.socket.on('identified', (data) => {
            console.log(`[${this.deviceId}] Identified by server:`, data);
            this.isConnected = true;
        });
        
        this.socket.on('command', (data) => {
            console.log(`[${this.deviceId}] Received command:`, data);
            this.handleCommand(data);
        });
        
        this.socket.on('disconnect', () => {
            console.log(`[${this.deviceId}] Disconnected from server`);
            this.isConnected = false;
        });
    }
    
    identify() {
        this.socket.emit('esp32-identify', {
            deviceId: this.deviceId,
            deviceType: this.deviceType
        });
    }
    
    handleCommand(command) {
        const { cmd, target, reason } = command;
        
        switch (cmd) {
            case 'unlock':
                console.log(`[${this.deviceId}] Executing unlock command for ${target || 'door'}`);
                this.sendStatus({ action: 'unlock', target, status: 'success' });
                break;
                
            case 'lock':
                console.log(`[${this.deviceId}] Executing lock command for ${target || 'door'}`);
                this.sendStatus({ action: 'lock', target, status: 'success' });
                break;
                
            case 'emergency_unlock':
                console.log(`[${this.deviceId}] EMERGENCY UNLOCK - Reason: ${reason}`);
                this.sendStatus({ action: 'emergency_unlock', target, status: 'success' });
                break;
                
            default:
                console.log(`[${this.deviceId}] Unknown command: ${cmd}`);
        }
    }
    
    sendEvent(event, data) {
        if (!this.isConnected) {
            console.log(`[${this.deviceId}] Not connected, cannot send event`);
            return;
        }
        
        this.socket.emit('esp32-event', {
            event,
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            ...data
        });
    }
    
    sendStatus(status) {
        if (!this.isConnected) {
            console.log(`[${this.deviceId}] Not connected, cannot send status`);
            return;
        }
        
        this.socket.emit('esp32-status', {
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            ...status
        });
    }
    
    simulateRFID(cardId) {
        console.log(`[${this.deviceId}] Simulating RFID card: ${cardId}`);
        this.sendEvent('RFID_DETECTED', { cardId });
    }
    
    simulateButtonPress(button) {
        console.log(`[${this.deviceId}] Simulating button press: ${button}`);
        this.sendEvent('BUTTON_PRESSED', { button });
    }
    
    simulateEmergency() {
        console.log(`[${this.deviceId}] Simulating EMERGENCY button press!`);
        this.sendEvent('EMERGENCY_PRESSED', { emergency: true });
    }
}

// Create simulators for ESP32A, ESP32B, ESP32C
const esp32A = new ESP32Simulator('ESP32A-001', 'gateway_actuator');
const esp32B = new ESP32Simulator('ESP32B-001', 'sensor_input');
const esp32C = new ESP32Simulator('ESP32C-001', 'display');

// Connect all devices
esp32A.connect();
esp32B.connect();
esp32C.connect();

// Simulate some events after connection
setTimeout(() => {
    console.log('\n--- Starting Event Simulation ---\n');
    
    // Simulate RFID detection
    setTimeout(() => {
        esp32B.simulateRFID('CARD-123456');
    }, 1000);
    
    // Simulate manual button press
    setTimeout(() => {
        esp32B.simulateButtonPress('manual_unlock');
    }, 3000);
    
    // Simulate emergency button (uncomment to test)
    // setTimeout(() => {
    //     esp32B.simulateEmergency();
    // }, 5000);
    
}, 2000);

// Keep the process running
console.log('ESP32 Simulator started. Press Ctrl+C to exit.');
process.on('SIGINT', () => {
    console.log('\nShutting down ESP32 simulators...');
    process.exit(0);
});