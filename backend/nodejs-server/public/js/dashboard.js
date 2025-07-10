// Dashboard JavaScript
class SmartMeetingDashboard {
    constructor() {
        this.socket = null;
        this.currentTab = 'dashboard';
        this.data = {
            rooms: [],
            bookings: [],
            devices: [],
            activity: [],
            stats: {}
        };
        
        this.init();
    }

    // Initialize the dashboard
    init() {
        this.setupEventListeners();
        this.connectWebSocket();
        this.updateCurrentTime();
        this.loadInitialData();
    }

    // Setup event listeners
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.refreshCurrentTab();
        }, 30000);
    }

    // Connect to WebSocket
    connectWebSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('connected');
            this.socket.emit('web_client_register');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('esp32_event', (data) => {
            this.handleESP32Event(data);
        });

        this.socket.on('device_connected', (data) => {
            this.showAlert(`Device ${data.deviceId} connected`, 'success');
            this.refreshDevices();
        });

        this.socket.on('device_disconnected', (data) => {
            this.showAlert(`Device ${data.deviceId} disconnected`, 'warning');
            this.refreshDevices();
        });

        this.socket.on('meeting_started', (data) => {
            this.showAlert(`Meeting started in room ${data.room_id}`, 'success');
            this.refreshDashboard();
        });

        this.socket.on('meeting_ended', (data) => {
            this.showAlert(`Meeting ended in room ${data.room_id}`, 'info');
            this.refreshDashboard();
        });

        this.socket.on('emergency_alert', (data) => {
            this.showAlert(`EMERGENCY in room ${data.room_id}: ${data.reason}`, 'danger');
            this.refreshDashboard();
        });
    }

    // Update connection status
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        statusElement.className = `connection-status ${status}`;
        
        const statusText = {
            connected: 'Connected',
            disconnected: 'Disconnected',
            connecting: 'Connecting...'
        };
        
        const icon = status === 'connected' ? 'fa-circle text-success' : 
                    status === 'disconnected' ? 'fa-circle text-danger' : 
                    'fa-circle text-warning';
        
        statusElement.innerHTML = `<i class="fas ${icon}"></i> ${statusText[status]}`;
    }

    // Update current time
    updateCurrentTime() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            const dateString = now.toLocaleDateString();
            document.getElementById('current-time').textContent = `${dateString} ${timeString}`;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    // Switch between tabs
    switchTab(tabName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;
        this.loadTabData(tabName);
    }

    // Load initial data
    async loadInitialData() {
        await this.loadStats();
        await this.loadRooms();
        await this.loadBookings();
        await this.loadDevices();
        await this.loadActivity();
        this.updateDashboard();
    }

    // Load data for specific tab
    async loadTabData(tabName) {
        switch (tabName) {
            case 'dashboard':
                await this.loadStats();
                this.updateDashboard();
                break;
            case 'rooms':
                await this.loadRooms();
                this.updateRoomsTab();
                break;
            case 'bookings':
                await this.loadBookings();
                this.updateBookingsTab();
                break;
            case 'devices':
                await this.loadDevices();
                this.updateDevicesTab();
                break;
            case 'activity':
                await this.loadActivity();
                this.updateActivityTab();
                break;
            case 'settings':
                this.updateSettingsTab();
                break;
        }
    }

    // API call helper
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`/api${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            this.showAlert(`Failed to load data: ${error.message}`, 'danger');
            return null;
        }
    }

    // Load statistics
    async loadStats() {
        const response = await this.apiCall('/stats');
        if (response && response.success) {
            this.data.stats = response.data;
        }
    }

    // Load rooms
    async loadRooms() {
        const response = await this.apiCall('/rooms');
        if (response && response.success) {
            this.data.rooms = response.data;
        }
    }

    // Load bookings
    async loadBookings() {
        const response = await this.apiCall('/bookings');
        if (response && response.success) {
            this.data.bookings = response.data;
        }
    }

    // Load devices
    async loadDevices() {
        const response = await this.apiCall('/devices');
        if (response && response.success) {
            this.data.devices = response.data.devices;
        }
    }

    // Load activity
    async loadActivity() {
        const response = await this.apiCall('/activity');
        if (response && response.success) {
            this.data.activity = response.data;
        }
    }

    // Update dashboard
    updateDashboard() {
        // Update stats
        const stats = this.data.stats;
        document.getElementById('total-rooms').textContent = stats.rooms?.total || 0;
        document.getElementById('active-bookings').textContent = stats.bookings?.active || 0;
        document.getElementById('connected-devices').textContent = stats.devices?.length || 0;
        document.getElementById('todays-bookings').textContent = stats.bookings?.today || 0;

        // Update room status
        this.updateRoomStatus();
        
        // Update active meetings
        this.updateActiveMeetings();
        
        // Update device status
        this.updateDeviceStatus();
        
        // Update recent activity
        this.updateRecentActivity();
    }

    // Update room status
    updateRoomStatus() {
        const container = document.getElementById('room-status-list');
        
        if (!this.data.rooms.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-door-open"></i><h3>No rooms configured</h3></div>';
            return;
        }

        container.innerHTML = this.data.rooms.map(room => `
            <div class="room-item">
                <div class="room-info">
                    <h4>${room.name}</h4>
                    <p>${room.location || 'No location'}</p>
                </div>
                <span class="status-badge status-${room.status}">${room.status}</span>
            </div>
        `).join('');
    }

    // Update active meetings
    updateActiveMeetings() {
        const container = document.getElementById('active-meetings-list');
        const activeBookings = this.data.bookings.filter(booking => booking.status === 'active');
        
        if (!activeBookings.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><h3>No active meetings</h3></div>';
            return;
        }

        container.innerHTML = activeBookings.map(booking => `
            <div class="room-item">
                <div class="room-info">
                    <h4>${booking.title}</h4>
                    <p>${booking.room_name} - ${booking.user_name}</p>
                    <p class="text-muted">${this.formatTime(booking.start_time)} - ${this.formatTime(booking.end_time)}</p>
                </div>
                <span class="status-badge status-active">Active</span>
            </div>
        `).join('');
    }

    // Update device status
    updateDeviceStatus() {
        const container = document.getElementById('device-status-list');
        
        if (!this.data.devices.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-microchip"></i><h3>No devices connected</h3></div>';
            return;
        }

        container.innerHTML = this.data.devices.map(device => `
            <div class="device-item">
                <div class="device-info">
                    <div class="device-icon">
                        <i class="fas fa-microchip"></i>
                    </div>
                    <div class="device-details">
                        <h5>${device.deviceId}</h5>
                        <p>${device.deviceType} - Room ${device.roomId}</p>
                    </div>
                </div>
                <span class="status-badge status-${device.status}">${device.status}</span>
            </div>
        `).join('');
    }

    // Update recent activity
    updateRecentActivity() {
        const container = document.getElementById('recent-activity-list');
        
        if (!this.data.activity.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><h3>No recent activity</h3></div>';
            return;
        }

        const recentActivity = this.data.activity.slice(0, 5);
        
        container.innerHTML = recentActivity.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas ${this.getActivityIcon(activity.event_type)}"></i>
                </div>
                <div class="activity-content">
                    <h5>${this.formatActivityTitle(activity)}</h5>
                    <p>${activity.device_id} - ${activity.room_name || 'Unknown room'}</p>
                </div>
                <div class="activity-time">
                    ${this.formatTimeAgo(activity.timestamp)}
                </div>
            </div>
        `).join('');
    }

    // Refresh current tab
    refreshCurrentTab() {
        this.loadTabData(this.currentTab);
    }

    // Refresh dashboard
    refreshDashboard() {
        if (this.currentTab === 'dashboard') {
            this.loadInitialData();
        }
    }

    // Refresh devices
    refreshDevices() {
        if (this.currentTab === 'devices') {
            this.loadDevices().then(() => this.updateDevicesTab());
        }
    }

    // Refresh activity
    refreshActivity() {
        if (this.currentTab === 'activity') {
            this.loadActivity().then(() => this.updateActivityTab());
        }
    }

    // Handle ESP32 events
    handleESP32Event(data) {
        console.log('ESP32 Event:', data);
        
        // Add to activity feed
        this.data.activity.unshift(data);
        
        // Update activity if on activity tab
        if (this.currentTab === 'activity') {
            this.updateActivityTab();
        }
        
        // Update dashboard if on dashboard tab
        if (this.currentTab === 'dashboard') {
            this.updateRecentActivity();
        }
    }

    // Show alert
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alerts-container');
        const alertId = 'alert-' + Date.now();
        
        const alertHtml = `
            <div id="${alertId}" class="alert alert-${type}">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>${message}</div>
                    <button onclick="document.getElementById('${alertId}').remove()" style="background: none; border: none; font-size: 1.2em; cursor: pointer;">&times;</button>
                </div>
            </div>
        `;
        
        alertContainer.insertAdjacentHTML('beforeend', alertHtml);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert) alert.remove();
        }, 5000);
    }

    // Format time
    formatTime(dateString) {
        return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Format time ago
    formatTimeAgo(dateString) {
        const now = new Date();
        const date = new Date(dateString);
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    // Get activity icon
    getActivityIcon(eventType) {
        const icons = {
            'RFID_SCANNED': 'fa-id-card',
            'BUTTON_PRESSED': 'fa-hand-pointer',
            'SENSOR_DATA': 'fa-thermometer-half',
            'DEVICE_CONNECTED': 'fa-plug',
            'DEVICE_DISCONNECTED': 'fa-unlink',
            'MEETING_STARTED': 'fa-play',
            'MEETING_ENDED': 'fa-stop'
        };
        return icons[eventType] || 'fa-info-circle';
    }

    // Format activity title
    formatActivityTitle(activity) {
        const titles = {
            'RFID_SCANNED': 'RFID Card Scanned',
            'BUTTON_PRESSED': 'Button Pressed',
            'SENSOR_DATA': 'Sensor Data Received',
            'DEVICE_CONNECTED': 'Device Connected',
            'DEVICE_DISCONNECTED': 'Device Disconnected',
            'MEETING_STARTED': 'Meeting Started',
            'MEETING_ENDED': 'Meeting Ended'
        };
        return titles[activity.event_type] || activity.event_type;
    }

    // Update rooms tab
    updateRoomsTab() {
        const container = document.getElementById('rooms-content');
        
        if (!this.data.rooms.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-door-open"></i><h3>No rooms configured</h3><p>Add your first meeting room to get started</p></div>';
            return;
        }

        container.innerHTML = this.data.rooms.map(room => `
            <div class="room-card">
                <div class="room-header">
                    <div>
                        <h3 class="room-title">${room.name}</h3>
                        <p class="room-location">${room.location || 'No location'}</p>
                        <p class="text-muted">Capacity: ${room.capacity} people</p>
                    </div>
                    <span class="status-badge status-${room.status}">${room.status}</span>
                </div>
                <div class="room-equipment">
                    <p><strong>Equipment:</strong> ${room.equipment || 'None specified'}</p>
                    <p><strong>ESP32 ID:</strong> ${room.esp32_id || 'Not configured'}</p>
                </div>
                <div class="room-controls">
                    <button class="btn btn-primary" onclick="dashboard.controlRoom(${room.id}, 'lights', {state: true})">
                        <i class="fas fa-lightbulb"></i> Lights
                    </button>
                    <button class="btn btn-secondary" onclick="dashboard.controlRoom(${room.id}, 'ac', {state: true})">
                        <i class="fas fa-snowflake"></i> AC
                    </button>
                    <button class="btn btn-warning" onclick="dashboard.controlRoom(${room.id}, 'door', {action: 'unlock'})">
                        <i class="fas fa-door-open"></i> Unlock
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Control room
    async controlRoom(roomId, deviceType, parameters) {
        const response = await this.apiCall(`/rooms/${roomId}/control`, {
            method: 'POST',
            body: JSON.stringify({
                action: 'control',
                device_type: deviceType,
                parameters: parameters
            })
        });

        if (response && response.success) {
            this.showAlert(`${deviceType} controlled successfully`, 'success');
        } else {
            this.showAlert(`Failed to control ${deviceType}`, 'danger');
        }
    }

    // Update bookings tab
    updateBookingsTab() {
        const container = document.getElementById('bookings-content');
        
        if (!this.data.bookings.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><h3>No bookings found</h3><p>Create your first booking to get started</p></div>';
            return;
        }

        const tableHtml = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 1rem; text-align: left;">Title</th>
                        <th style="padding: 1rem; text-align: left;">Room</th>
                        <th style="padding: 1rem; text-align: left;">User</th>
                        <th style="padding: 1rem; text-align: left;">Time</th>
                        <th style="padding: 1rem; text-align: left;">Status</th>
                        <th style="padding: 1rem; text-align: left;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.data.bookings.map(booking => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 1rem;">
                                <strong>${booking.title}</strong>
                                ${booking.description ? `<br><small class="text-muted">${booking.description}</small>` : ''}
                            </td>
                            <td style="padding: 1rem;">${booking.room_name}</td>
                            <td style="padding: 1rem;">${booking.user_name}<br><small class="text-muted">${booking.user_email}</small></td>
                            <td style="padding: 1rem;">
                                ${this.formatTime(booking.start_time)} - ${this.formatTime(booking.end_time)}<br>
                                <small class="text-muted">${new Date(booking.start_time).toLocaleDateString()}</small>
                            </td>
                            <td style="padding: 1rem;">
                                <span class="status-badge status-${booking.status}">${booking.status}</span>
                            </td>
                            <td style="padding: 1rem;">
                                ${booking.status === 'confirmed' ? 
                                    `<button class="btn btn-success btn-sm" onclick="dashboard.startMeeting(${booking.id})">Start</button>` : ''}
                                ${booking.status === 'active' ? 
                                    `<button class="btn btn-danger btn-sm" onclick="dashboard.endMeeting(${booking.id})">End</button>` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = tableHtml;
    }

    // Start meeting
    async startMeeting(bookingId) {
        const response = await this.apiCall(`/bookings/${bookingId}/start`, {
            method: 'PATCH'
        });

        if (response && response.success) {
            this.showAlert('Meeting started successfully', 'success');
            this.loadBookings().then(() => this.updateBookingsTab());
        }
    }

    // End meeting
    async endMeeting(bookingId) {
        const response = await this.apiCall(`/bookings/${bookingId}/end`, {
            method: 'PATCH'
        });

        if (response && response.success) {
            this.showAlert('Meeting ended successfully', 'success');
            this.loadBookings().then(() => this.updateBookingsTab());
        }
    }

    // Update devices tab
    updateDevicesTab() {
        const container = document.getElementById('devices-content');
        
        if (!this.data.devices.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-microchip"></i><h3>No devices connected</h3><p>ESP32 devices will appear here when connected</p></div>';
            return;
        }

        container.innerHTML = this.data.devices.map(device => `
            <div class="device-card">
                <div class="device-header">
                    <div>
                        <h4 class="device-name">${device.deviceId}</h4>
                        <p class="device-type">${device.deviceType}</p>
                    </div>
                    <span class="status-badge status-${device.status}">${device.status}</span>
                </div>
                <div class="device-details">
                    <p><strong>Room:</strong> ${device.roomId}</p>
                    <p><strong>Last Seen:</strong> ${this.formatTimeAgo(device.lastSeen)}</p>
                </div>
                <div class="device-controls">
                    <button class="btn btn-secondary btn-sm" onclick="dashboard.sendDeviceCommand('${device.deviceId}', 'HEARTBEAT')">
                        <i class="fas fa-heartbeat"></i> Ping
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="dashboard.sendDeviceCommand('${device.deviceId}', 'RESTART')">
                        <i class="fas fa-redo"></i> Restart
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Send device command
    async sendDeviceCommand(deviceId, command, commandData = {}) {
        const response = await this.apiCall(`/devices/${deviceId}/command`, {
            method: 'POST',
            body: JSON.stringify({ command, command_data: commandData })
        });

        if (response && response.success) {
            this.showAlert(`Command sent to ${deviceId}`, 'success');
        }
    }

    // Update activity tab
    updateActivityTab() {
        const container = document.getElementById('activity-content');
        
        if (!this.data.activity.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><h3>No activity recorded</h3><p>Device events will appear here</p></div>';
            return;
        }

        container.innerHTML = this.data.activity.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas ${this.getActivityIcon(activity.event_type)}"></i>
                </div>
                <div class="activity-content">
                    <h5>${this.formatActivityTitle(activity)}</h5>
                    <p>${activity.device_id} - ${activity.room_name || 'Unknown room'}</p>
                    ${activity.event_data ? `<small class="text-muted">${JSON.stringify(activity.event_data)}</small>` : ''}
                </div>
                <div class="activity-time">
                    ${this.formatTimeAgo(activity.timestamp)}
                </div>
            </div>
        `).join('');
    }

    // Update settings tab
    updateSettingsTab() {
        const container = document.querySelector('#settings-tab .settings-content');
        
        // Update system info
        const systemInfoContainer = document.getElementById('system-info');
        systemInfoContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div>
                    <h5>Server Status</h5>
                    <p>Status: <span class="text-success">Running</span></p>
                    <p>Version: 1.0.0</p>
                </div>
                <div>
                    <h5>Connected Devices</h5>
                    <p>Total: ${this.data.devices.length}</p>
                    <p>Online: ${this.data.devices.filter(d => d.status === 'connected').length}</p>
                </div>
                <div>
                    <h5>Today's Stats</h5>
                    <p>Bookings: ${this.data.stats.bookings?.today || 0}</p>
                    <p>Active: ${this.data.stats.bookings?.active || 0}</p>
                </div>
            </div>
        `;
    }

    // Emergency stop all
    async emergencyStopAll() {
        if (!confirm('Are you sure you want to trigger emergency stop for all devices?')) {
            return;
        }

        const response = await this.apiCall('/emergency/all', {
            method: 'POST',
            body: JSON.stringify({ reason: 'Manual emergency stop from dashboard' })
        });

        if (response && response.success) {
            this.showAlert('Emergency stop activated for all devices', 'warning');
        }
    }
}

// Global functions
function refreshDashboard() {
    dashboard.refreshCurrentTab();
}

function refreshDevices() {
    dashboard.refreshDevices();
}

function refreshActivity() {
    dashboard.refreshActivity();
}

function filterBookings() {
    // Implementation for booking filters
    console.log('Filter bookings');
}

function showCreateRoomModal() {
    dashboard.showAlert('Room creation modal would open here', 'info');
}

function showCreateBookingModal() {
    dashboard.showAlert('Booking creation modal would open here', 'info');
}

function emergencyStopAll() {
    dashboard.emergencyStopAll();
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new SmartMeetingDashboard();
});