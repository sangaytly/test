// Mushroom Monitor - frontend app (completed)
// Configure this to your Google Apps Script Web App URL (returns JSON).
const GOOGLE_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL"; // <-- replace with real URL

// Timezone offset hours (if you need to adjust timestamps)
const UTC_OFFSET_HOURS = 6; // change if needed

const REFRESH_INTERVAL = 60000; // 60s

let allData = []; // array of {timestamp: ISOstring, temperature: number, humidity: number}
let currentRange = 60; // default in minutes
let chart = null;
let refreshTimer = null;

// Utility: format ISO timestamp to human time and date
function formatTime(iso) {
    if (!iso) return "--";
    const d = new Date(iso);
    // apply offset if needed
    if (typeof UTC_OFFSET_HOURS === "number" && UTC_OFFSET_HOURS !== 0) {
        const msOffset = UTC_OFFSET_HOURS * 3600 * 1000;
        const nd = new Date(d.getTime() + msOffset);
        return nd.toLocaleTimeString();
    }
    return d.toLocaleTimeString();
}

function formatDateTime(iso) {
    if (!iso) return "--";
    const d = new Date(iso);
    if (typeof UTC_OFFSET_HOURS === "number" && UTC_OFFSET_HOURS !== 0) {
        const msOffset = UTC_OFFSET_HOURS * 3600 * 1000;
        const nd = new Date(d.getTime() + msOffset);
        return nd.toLocaleString();
    }
    return d.toLocaleString();
}

// Fallback data generator (simulated) for testing when back-end URL isn't set
function generateSimulatedData(points = 120, intervalMinutes = 1) {
    const now = Date.now();
    const arr = [];
    for (let i = points - 1; i >= 0; i--) {
        const ts = new Date(now - i * intervalMinutes * 60000).toISOString();
        // simple oscillation for temperature and humidity
        const temp = 20 + 4 * Math.sin((i / points) * Math.PI * 4) + (Math.random() - 0.5);
        const hum = 75 + 8 * Math.cos((i / points) * Math.PI * 2) + (Math.random() - 0.5) * 2;
        arr.push({ timestamp: ts, temperature: +temp.toFixed(2), humidity: +hum.toFixed(1) });
    }
    return arr;
}

// Fetch data from Google Script or use simulated data
async function fetchData() {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === "YOUR_GOOGLE_APPS_SCRIPT_URL") {
        // simulation
        return generateSimulatedData(180, 1);
    }

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Expecting array of objects with keys: timestamp, temperature, humidity
        return json;
    } catch (err) {
        console.error("fetchData error:", err);
        // fall back to simulated data on error
        return generateSimulatedData(120, 1);
    }
}

function filterByRange(data, range) {
    if (!Array.isArray(data)) return [];
    const now = Date.now();
    if (range === "day") {
        const cutoff = now - 24 * 3600 * 1000;
        return data.filter(d => new Date(d.timestamp).getTime() >= cutoff);
    }
    if (range === "month") {
        const cutoff = now - 30 * 24 * 3600 * 1000;
        return data.filter(d => new Date(d.timestamp).getTime() >= cutoff);
    }
    // numeric minutes
    const minutes = Number(range) || 60;
    const cutoff = now - minutes * 60000;
    return data.filter(d => new Date(d.timestamp).getTime() >= cutoff);
}

function updateCards(latest) {
    const tempEl = document.getElementById("tempValue");
    const humEl = document.getElementById("humValue");
    const tempTimeEl = document.getElementById("tempTime");
    const humTimeEl = document.getElementById("humTime");
    const dataCountEl = document.getElementById("dataCount");
    const lastSyncEl = document.getElementById("lastSync");
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");

    if (!latest) {
        tempEl.textContent = "--";
        humEl.textContent = "--";
        tempTimeEl.textContent = "Last update: --";
        humTimeEl.textContent = "Last update: --";
        dataCountEl.textContent = "0";
        lastSyncEl.textContent = "--";
        if (statusDot) statusDot.style.background = "orange";
        if (statusText) statusText.textContent = "No data";
        return;
    }

    tempEl.textContent = latest.temperature != null ? latest.temperature : "--";
    humEl.textContent = latest.humidity != null ? latest.humidity : "--";
    tempTimeEl.textContent = `Last update: ${formatTime(latest.timestamp)}`;
    humTimeEl.textContent = `Last update: ${formatTime(latest.timestamp)}`;
    dataCountEl.textContent = allData.length;
    lastSyncEl.textContent = formatDateTime(new Date().toISOString());
    if (statusDot) statusDot.style.background = "#2ecc71";
    if (statusText) statusText.textContent = GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL !== "YOUR_GOOGLE_APPS_SCRIPT_URL" ? "Connected" : "Simulating data";
}

function buildChart(labels, temps, hums) {
    const ctx = document.getElementById("combinedChart").getContext("2d");
    if (chart) {
        chart.data.labels = labels;
        chart.data.datasets[0].data = temps;
        chart.data.datasets[1].data = hums;
        chart.update();
        return;
    }

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Temperature (°C)",
                    data: temps,
                    borderColor: "#e74c3c",
                    backgroundColor: "rgba(231,76,60,0.1)",
                    yAxisID: "y",
                    tension: 0.25,
                    pointRadius: 0,
                },
                {
                    label: "Humidity (%)",
                    data: hums,
                    borderColor: "#3498db",
                    backgroundColor: "rgba(52,152,219,0.08)",
                    yAxisID: "y1",
                    tension: 0.25,
                    pointRadius: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            plugins: {
                legend: { position: "top" },
                tooltip: { mode: "index", intersect: false },
            },
            scales: {
                x: {
                    display: true,
                    title: { display: false }
                },
                y: {
                    type: "linear",
                    display: true,
                    position: "left",
                    title: { display: true, text: "°C" },
                    suggestedMin: 0,
                },
                y1: {
                    type: "linear",
                    display: true,
                    position: "right",
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: "%" },
                    suggestedMin: 0,
                }
            }
        }
    });
}

async function refresh() {
    try {
        const data = await fetchData();
        // normalize data: ensure timestamp, temperature, humidity
        allData = (Array.isArray(data) ? data.slice() : []).map(d => {
            return {
                timestamp: d.timestamp || d.time || d.date || new Date().toISOString(),
                temperature: Number(d.temperature != null ? d.temperature : (d.temp != null ? d.temp : NaN)),
                humidity: Number(d.humidity != null ? d.humidity : (d.hum != null ? d.hum : NaN)),
            };
        });

        // sort by timestamp
        allData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const filtered = filterByRange(allData, currentRange);
        const labels = filtered.map(d => formatTime(d.timestamp));
        const temps = filtered.map(d => isFinite(d.temperature) ? d.temperature : null);
        const hums = filtered.map(d => isFinite(d.humidity) ? d.humidity : null);

        buildChart(labels, temps, hums);

        const latest = allData.length ? allData[allData.length - 1] : null;
        updateCards(latest);
    } catch (err) {
        console.error("refresh error:", err);
    }
}

function setupControls() {
    document.querySelectorAll(".control-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".control-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const range = btn.getAttribute("data-range");
            currentRange = range === "60" ? 60 : range;
            refresh();
        });
    });
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
}

// Init
document.addEventListener("DOMContentLoaded", () => {
    setupControls();
    refresh().then(() => {
        startAutoRefresh();
    });
});