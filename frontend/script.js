// frontend/script.js - Improved Pothole Detection with Webcam and Backend YOLO API

// Configuration
const CONFIG = {
    BACKEND_API_URL: 'https://pothole-detector-backend.onrender.com', // Update with your deployed Flask backend URL
    FPS: 30, // Target webcam FPS
    DETECTION_INTERVAL_MS: 200, // Send frames every 200ms (5 FPS)
    REPORT_INTERVAL_MS: 10000, // Report detections every 10s
    FETCH_RESULTS_INTERVAL_MS: 15000, // Fetch historical data every 15s
    JPEG_QUALITY: 0.6, // Lower quality for faster transmission
    CONFIDENCE_THRESHOLD: 0.5, // Minimum confidence for reporting detections
    MAX_RETRIES: 3, // Retry failed requests up to 3 times
    RETRY_DELAY_MS: 1000, // Base delay for exponential backoff
};

// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const chartCanvas = document.getElementById('resultsChart');
const ctx = canvas.getContext('2d');
const chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

// API Endpoints
const DETECT_FRAME_ENDPOINT = `${CONFIG.BACKEND_API_URL}/detect_frame`;
const REPORT_ENDPOINT = `${CONFIG.BACKEND_API_URL}/api/report_detection`;
const RESULTS_ENDPOINT = `${CONFIG.BACKEND_API_URL}/api/get_results`;

// State
let lastDetectionSendTime = 0;
let lastReportTime = 0;
let lastFetchTime = 0;
let currentDetectionCount = 0;
let clientLatitude = null;
let clientLongitude = null;
let isDetectionRunning = true; // Toggle for pausing detection
let resultsChart = null;
let frameCount = 0;
let lastFpsTime = Date.now();
let fps = 0;
let pendingRequests = 0; // Track concurrent requests

// --- Initialize Webcam ---
async function startWebcam() {
    updateStatus('Accessing webcam...');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus('Error: Webcam not supported by your browser.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = stream;

        video.addEventListener('loadedmetadata', () => {
            resizeCanvas();
            updateStatus('Webcam started. Detecting potholes...');
            processFrameLoop();
        });
    } catch (error) {
        updateStatus(`Error accessing webcam: ${error.message}`);
        console.error('Webcam access failed:', error);
    }
}

// --- Resize Canvas ---
function resizeCanvas() {
    const maxWidth = window.innerWidth * 0.9; // 90% of window width
    const aspectRatio = video.videoWidth / video.videoHeight;
    canvas.width = Math.min(video.videoWidth, maxWidth);
    canvas.height = canvas.width / aspectRatio;
    if (chartCanvas) {
        chartCanvas.width = canvas.width;
        chartCanvas.height = Math.min(400, window.innerHeight * 0.4);
    }
}

// --- Get Client Location ---
function getClientLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                clientLatitude = position.coords.latitude;
                clientLongitude = position.coords.longitude;
                console.log('Client location:', clientLatitude, clientLongitude);
            },
            (error) => {
                console.warn('Geolocation error:', error.message);
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
        );
    } else {
        console.warn('Geolocation not supported.');
    }
}

// --- Main Processing Loop ---
function processFrameLoop() {
    if (!isDetectionRunning) {
        requestAnimationFrame(processFrameLoop);
        return;
    }

    const now = Date.now();
    frameCount++;
    if (now - lastFpsTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        frameCount = 0;
        lastFpsTime = now;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.font = '16px Arial';
    ctx.fillStyle = 'green';
    ctx.fillText(`FPS: ${fps}`, 10, 20);

    if (now - lastDetectionSendTime > CONFIG.DETECTION_INTERVAL_MS && pendingRequests < 2) {
        lastDetectionSendTime = now;
        sendFrameForBackendDetection();
    }

    if (now - lastReportTime > CONFIG.REPORT_INTERVAL_MS) {
        lastReportTime = now;
        reportDetectionSummary();
    }

    if (now - lastFetchTime > CONFIG.FETCH_RESULTS_INTERVAL_MS) {
        lastFetchTime = now;
        fetchHistoricalData();
    }

    requestAnimationFrame(processFrameLoop);
}

// --- Send Frame to Backend ---
async function sendFrameForBackendDetection() {
    if (video.readyState < 2) {
        console.log('Video not ready.');
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    const base64Image = tempCanvas.toDataURL('image/jpeg', CONFIG.JPEG_QUALITY);
    tempCanvas.remove();

    pendingRequests++;
    try {
        const response = await fetchWithRetry(DETECT_FRAME_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
        });

        const result = await response.json();
        if (response.ok && result.status === 'success') {
            displayDetectionResults(result);
            if (result.detection_count > 0 && result.primary_confidence >= CONFIG.CONFIDENCE_THRESHOLD) {
                currentDetectionCount += result.detection_count;
            }
        } else {
            updateStatus(`Detection error: ${result.error || response.statusText}`);
        }
    } catch (error) {
        updateStatus(`Connection error: ${error.message}`);
        console.error('Detection error:', error);
    } finally {
        pendingRequests--;
    }
}

// --- Fetch with Retry ---
async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            throw new Error(response.statusText);
        } catch (error) {
            if (i === retries - 1) throw error;
            const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, i);
            console.warn(`Retry ${i + 1}/${retries} after ${delay}ms: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- Display Detection Results ---
function displayDetectionResults(result) {
    const { detection_count, primary_bbox, primary_confidence } = result;
    if (typeof detection_count !== 'number' || detection_count < 0) {
        console.warn('Invalid detection_count:', detection_count);
        return;
    }

    resultsDiv.innerText = `Potholes: ${detection_count}, Confidence: ${primary_confidence ? primary_confidence.toFixed(2) : 'N/A'}`;

    if (detection_count > 0 && primary_bbox && Array.isArray(primary_bbox) && primary_bbox.length === 4) {
        const [x_min, y_min, x_max, y_max] = primary_bbox.map(v => v * canvas.width / video.videoWidth);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x_min, y_min, x_max - x_min, y_max - y_min);

        if (primary_confidence !== null) {
            ctx.font = '16px Arial';
            ctx.fillStyle = 'red';
            const textY = y_min > 15 ? y_min - 5 : y_max + 15;
            ctx.fillText(primary_confidence.toFixed(2), x_min, textY);
        }
    }
}

// --- Report Detection Summary ---
async function reportDetectionSummary() {
    if (currentDetectionCount === 0) return;

    try {
        const response = await fetchWithRetry(REPORT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                detected_count: currentDetectionCount,
                latitude: clientLatitude,
                longitude: clientLongitude
            })
        });

        if (response.ok) {
            console.log(`Reported ${currentDetectionCount} detections.`);
            currentDetectionCount = 0;
        } else {
            console.error('Report failed:', response.statusText);
        }
    } catch (error) {
        console.error('Report error:', error);
    }
}

// --- Fetch Historical Data ---
async function fetchHistoricalData() {
    if (!chartCtx) return;

    try {
        const response = await fetchWithRetry(RESULTS_ENDPOINT);
        const data = await response.json();
        updateChart(data);
    } catch (error) {
        console.error('Fetch historical data error:', error);
    }
}

// --- Update Chart ---
function updateChart(data) {
    const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const detectionCounts = data.map(item => item.detected_count || 0);

    if (resultsChart) resultsChart.destroy();

    resultsChart = new Chart(chartCtx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Potholes Reported',
                data: detectionCounts,
                backgroundColor: 'rgba(255, 159, 64, 0.7)',
                borderColor: 'rgba(255, 159, 64, 1)',
                borderWidth: 1
            }]
        },
        options: {
            animation: { duration: 500 }, // Smooth transitions
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Potholes' }, ticks: { stepSize: 1 } },
                x: { title: { display: true, text: 'Time' }, autoSkip: true, maxTicksLimit: 10 }
            },
            plugins: {
                legend: { display: true },
                title: { display: true, text: 'Pothole Detections Over Time' },
                tooltip: {
                    callbacks: {
                        title: context => context[0] ? new Date(data[context[0].dataIndex].timestamp).toLocaleString() : ''
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// --- Update Status ---
function updateStatus(message) {
    statusDiv.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
}

// --- Toggle Detection ---
function toggleDetection() {
    isDetectionRunning = !isDetectionRunning;
    updateStatus(isDetectionRunning ? 'Detection resumed.' : 'Detection paused.');
    if (isDetectionRunning) processFrameLoop();
}

// --- Event Listeners ---
document.addEventListener('keydown', (e) => {
    if (e.key === ' ') toggleDetection(); // Spacebar to pause/resume
});
window.addEventListener('resize', resizeCanvas);

// --- Initialize ---
startWebcam();
getClientLocation();
fetchHistoricalData();