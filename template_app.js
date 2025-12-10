// ============================================================================
// MUSHROOM MONITOR - WEB APPLICATION
// ============================================================================
// This is the frontend application that fetches data from Google Sheets
// and displays it with real-time charts and visualizations.
// ============================================================================

// ============================================================================
// CONFIGURATION - EDIT THESE VALUES FOR YOUR SETUP
// ============================================================================

// Replace this with the URL of your deployed Google Apps Script Web App
const GOOGLE_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL";

// TIMEZONE CONFIGURATION - IMPORTANT!
// Set this to your local timezone offset from UTC
// Examples:
//   UTC+6 (Asia/Bhutan): UTC_OFFSET_HOURS = 6
//   UTC+5:30 (India): UTC_OFFSET_HOURS = 5.5
//   UTC+8 (Singapore): UTC_OFFSET_HOURS = 8
//   UTC-5 (USA Eastern): UTC_OFFSET_HOURS = -5
//   UTC+0 (GMT): UTC_OFFSET_HOURS = 0
const UTC_OFFSET_HOURS = 6; // Change this to your timezone offset

// Data refresh interval in milliseconds (60 seconds = 60000 ms)
const REFRESH_INTERVAL = 60000;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let allData = [];
let currentRange = 60; // Default: last 60 minutes
let currentFilteredData = []; // Store the currently displayed filtered data
let temperatureChart = null;
let humidityChart = null;
let combinedChart = null;
let lastUpdateTime = null;

// ============================================================================
// DATA CLEANING FUNCTIONS (ROBUST)
// ============================================================================

/**
 * Extract the date part from any format (ISO string, Date object, or simple string)
 * Returns format: "YYYY-MM-DD"
 */
function cleanDate(dateValue) {
    if (!dateValue) return '--';
    
    // If it's an ISO string like "2025-10-30T18:00:00.000Z"
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return `${match[1]}-${match[2]}-${match[3]}`;
        }
    }
    
    // If it's already in YYYY-MM-DD format
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue;
    }
    
    // If it's a Date object
    if (dateValue instanceof Date) {
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return String(dateValue);
}

/**
 * Extract the time part from any format (ISO string, Date object, or simple string)
 * Returns format: "HH:MM:SS"
 */
function cleanTime(timeValue) {
    if (!timeValue) return '--';
    
    // If it's an ISO string like "1899-12-30T12:07:51.000Z"
    if (typeof timeValue === 'string' && timeValue.includes('T')) {
        const match = timeValue.match(/T(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
            return `${match[1]}:${match[2]}:${match[3]}`;
        }
    }
    
    // If it's already in HH:MM:SS format
    if (typeof timeValue === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(timeValue)) {
        return timeValue;
    }
    
    // If it's a Date object
    if (timeValue instanceof Date) {
        const hours = String(timeValue.getHours()).padStart(2, '0');
        const minutes = String(timeValue.getMinutes()).padStart(2, '0');
        const seconds = String(timeValue.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }
    
    return String(timeValue);
}

/**
 * Convert UTC date and time to local timezone
 * Input: date="2025-10-30", time="12:07:51" (assumed to be UTC)
 * Output: Date object adjusted to the configured timezone
 */
function convertToLocalDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr || dateStr === '--' || timeStr === '--') {
        return new Date();
    }
    
    try {
        // Create a UTC date string in ISO format
        const isoString = `${dateStr}T${timeStr}Z`;
        const utcDate = new Date(isoString);
        return utcDate;
    } catch (e) {
        console.error('Error converting date/time:', dateStr, timeStr, e);
        return new Date();
    }
}

/**
 * Format date and time to user's timezone format
 * Input: date="2025-10-30", time="12:07:51" (UTC)
 * Output: "HH:MM:SS (UTC+X)" - formatted to the configured timezone
 */
function formatDateTimeForDisplay(dateStr, timeStr) {
    if (!dateStr || !timeStr || dateStr === '--' || timeStr === '--') {
        return '--:--:-- (UTC' + (UTC_OFFSET_HOURS >= 0 ? '+' : '') + UTC_OFFSET_HOURS + ')';
    }
    
    try {
        // Convert to UTC Date object
        const utcDate = convertToLocalDateTime(dateStr, timeStr);
        
        // Convert UTC to the configured timezone
        const userDate = new Date(utcDate.getTime() + (UTC_OFFSET_HOURS * 60 * 60 * 1000));
        
        const hours = String(userDate.getUTCHours()).padStart(2, '0');
        const minutes = String(userDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(userDate.getUTCSeconds()).padStart(2, '0');
        
        // Format: HH:MM:SS (UTC+X)
        const tzString = 'UTC' + (UTC_OFFSET_HOURS >= 0 ? '+' : '') + UTC_OFFSET_HOURS;
        return `${hours}:${minutes}:${seconds} (${tzString})`;
    } catch (e) {
        console.error('Error formatting date/time:', dateStr, timeStr, e);
        return '--:--:-- (UTC' + (UTC_OFFSET_HOURS >= 0 ? '+' : '') + UTC_OFFSET_HOURS + ')';
    }
}

/**
 * Clean and normalize a data row from the Google Sheet
 */
function cleanDataRow(row) {
    return {
        date: cleanDate(row.date),
        time: cleanTime(row.time),
        temperature: parseFloat(row.temperaturec || row.temperature || 0),
        humidity: parseFloat(row.humidity || row.humidity1 || 0)
    };
}

// ============================================================================
// DATA FETCHING AND PROCESSING
// ============================================================================

async function fetchData() {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const result = await response.json();
        
        if (result.status === 'SUCCESS' && result.data) {
            // Clean all data rows
            allData = result.data.map(cleanDataRow);
            
            console.log(`Fetched ${allData.length} data points`);
            updateLiveData();
            updateCharts();
            updateDataTable();
            updateStatusIndicator('connected');
        } else {
            console.error('API returned error:', result);
            updateStatusIndicator('error');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        updateStatusIndicator('error');
    }
}

// ============================================================================
// DATA PROCESSING AND FORMATTING
// ============================================================================

function getFilteredData(range) {
    if (range === 60) {
        // Last 60 minutes
        return allData.slice(-60);
    } else if (range === 'day') {
        // Last 24 hours (1440 minutes)
        return allData.slice(-1440);
    } else if (range === 'month') {
        // Last 30 days (43200 minutes)
        return allData.slice(-43200);
    } else if (range === 'year') {
        // All data (last 365 days)
        return allData.slice(-525600);
    }
    return allData;
}

/**
 * Create simple sequential labels for the X-axis
 */
function createSimpleLabels(count) {
    return Array(count).fill('');
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateLiveData() {
    if (allData.length === 0) return;

    const latestData = allData[allData.length - 1];
    
    // Values are already cleaned
    const temp = latestData.temperature;
    const hum = latestData.humidity;
    const date = latestData.date;
    const time = latestData.time;
    
    // Format date and time for display
    const formattedDateTime = formatDateTimeForDisplay(date, time);

    // Update temperature card
    document.getElementById('tempValue').textContent = temp.toFixed(1);
    document.getElementById('tempTime').textContent = `Last update: ${formattedDateTime}`;

    // Update humidity card
    document.getElementById('humValue').textContent = hum.toFixed(1);
    document.getElementById('humTime').textContent = `Last update: ${formattedDateTime}`;

    // Update system status
    document.getElementById('dataCount').textContent = allData.length;
    
    // Get current time in configured timezone
    const now = new Date();
    const utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    const userNow = new Date(utcNow.getTime() + (UTC_OFFSET_HOURS * 60 * 60 * 1000));
    
    const hours = String(userNow.getUTCHours()).padStart(2, '0');
    const minutes = String(userNow.getUTCMinutes()).padStart(2, '0');
    const seconds = String(userNow.getUTCSeconds()).padStart(2, '0');
    const tzString = 'UTC' + (UTC_OFFSET_HOURS >= 0 ? '+' : '') + UTC_OFFSET_HOURS;
    document.getElementById('lastSync').textContent = `${hours}:${minutes}:${seconds} (${tzString})`;
}

function updateCharts() {
    currentFilteredData = getFilteredData(currentRange);
    
    if (currentFilteredData.length === 0) {
        console.warn('No data available for the selected range');
        return;
    }

    // Create simple labels
    const labels = createSimpleLabels(currentFilteredData.length);
    const tempData = currentFilteredData.map(d => d.temperature);
    const humData = currentFilteredData.map(d => d.humidity);

    // Update Temperature Chart
    temperatureChart.data.labels = labels;
    temperatureChart.data.datasets[0].data = tempData;
    temperatureChart.update();

    // Update Humidity Chart
    humidityChart.data.labels = labels;
    humidityChart.data.datasets[0].data = humData;
    humidityChart.update();

    // Update Combined Chart
    combinedChart.data.labels = labels;
    combinedChart.data.datasets[0].data = tempData;
    combinedChart.data.datasets[1].data = humData;
    combinedChart.update();
}

function updateDataTable() {
    const tableBody = document.getElementById('dataTableBody');
    
    if (allData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="no-data">No data available yet. Waiting for sensor readings...</td></tr>';
        return;
    }

    // Show the last 10 readings in reverse order (newest first)
    const recentData = allData.slice(-10).reverse();
    
    console.log(`Displaying ${recentData.length} rows in the table`);
    
    tableBody.innerHTML = recentData.map(row => {
        const formattedDateTime = formatDateTimeForDisplay(row.date, row.time);
        return `
        <tr>
            <td>${formattedDateTime}</td>
            <td>${row.temperature.toFixed(1)}</td>
            <td>${row.humidity.toFixed(1)}</td>
        </tr>
    `;
    }).join('');
}

function updateStatusIndicator(status) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    statusDot.classList.remove('connected', 'error');

    if (status === 'connected') {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
    } else if (status === 'error') {
        statusDot.classList.add('error');
        statusText.textContent = 'Connection Error';
    } else {
        statusText.textContent = 'Connecting...';
    }
}

// ============================================================================
// CONTROL BUTTONS
// ============================================================================

function setupControlButtons() {
    const buttons = document.querySelectorAll('.control-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            buttons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Update current range and refresh charts
            const range = button.getAttribute('data-range');
            if (range === 'day') {
                currentRange = 'day';
            } else if (range === 'month') {
                currentRange = 'month';
            } else if (range === 'year') {
                currentRange = 'year';
            } else {
                currentRange = 60; // Default to 60 minutes
            }
            
            updateCharts();
        });
    });
}

// ============================================================================
// CHART INITIALIZATION
// ============================================================================

function initializeCharts() {
    // Temperature Chart
    const tempCtx = document.getElementById('temperatureChart').getContext('2d');
    temperatureChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#e74c3c',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const data = currentFilteredData[index];
                            if (data) {
                                return formatDateTimeForDisplay(data.date, data.time);
                            }
                            return 'Data';
                        }
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { beginAtZero: false }
            }
        }
    });

    // Humidity Chart
    const humCtx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(humCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Humidity (%)',
                data: [],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#3498db',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const data = currentFilteredData[index];
                            if (data) {
                                return formatDateTimeForDisplay(data.date, data.time);
                            }
                            return 'Data';
                        }
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { beginAtZero: false, max: 100 }
            }
        }
    });

    // Combined Chart
    const combCtx = document.getElementById('combinedChart').getContext('2d');
    combinedChart = new Chart(combCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const data = currentFilteredData[index];
                            if (data) {
                                return formatDateTimeForDisplay(data.date, data.time);
                            }
                            return 'Data';
                        }
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Temperature (°C)' } },
                y1: { type: 'linear', position: 'right', title: { display: true, text: 'Humidity (%)' }, max: 100 }
            }
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing Mushroom Monitor Dashboard...');
    console.log('Configured Timezone Offset: UTC' + (UTC_OFFSET_HOURS >= 0 ? '+' : '') + UTC_OFFSET_HOURS);
    
    initializeCharts();
    setupControlButtons();
    fetchData();
    
    // Refresh data every minute
    setInterval(fetchData, REFRESH_INTERVAL);
});
