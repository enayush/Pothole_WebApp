// frontend/script.js - Final version for Client Camera + Backend Python YOLO Detection

const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const chartCanvas = document.getElementById('resultsChart'); // Assuming you have this for the graph
const ctx = canvas.getContext('2d');
const chartCtx = chartCanvas.getContext('2d'); // Context for Chart.js

// !!! REPLACE WITH THE ACTUAL PUBLIC URL OF YOUR DEPLOYED FLASK BACKEND API !!!
// This is the URL you got from Render (e.g., https://your-service-name.onrender.com)
const BACKEND_API_URL = 'https://pothole-detector-backend.onrender.com'; // <-- Update this!
const DETECT_FRAME_ENDPOINT = `${BACKEND_API_URL}/detect_frame`; // Endpoint to send frames for detection
const REPORT_ENDPOINT = `${BACKEND_API_URL}/api/report_detection`; // Endpoint to send detection summaries
const RESULTS_ENDPOINT = `${BACKEND_API_URL}/api/get_results`; // Endpoint to get historical data

const FPS = 30; // Assume webcam is ~30 FPS
const DETECTION_INTERVAL_MS = 1000 / 5; // Send a frame for backend detection every ~200ms (5 FPS) - Adjust based on backend load
const REPORT_INTERVAL_MS = 10000; // Report detection summary to backend every 10 seconds
const FETCH_RESULTS_INTERVAL_MS = 15000; // Fetch historical results for graphs every 15 seconds

let lastDetectionSendTime = 0;
let lastReportTime = 0;
let lastFetchTime = 0;
let currentDetectionCount = 0; // Accumulate detection count within a reporting interval

let resultsChart = null; // To hold the Chart.js instance
let clientLatitude = null;
let clientLongitude = null;


// --- 1. Access the webcam ---
async function startWebcam() {
    statusDiv.innerText = 'Accessing webcam...';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusDiv.innerText = 'Webcam not supported by your browser.';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); // Prefer rear camera on mobile
        video.srcObject = stream;

        // Adjust canvas size once video metadata is loaded
        video.addEventListener('loadedmetadata', () => {
            console.log("Video metadata loaded. Setting canvas size.");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
             // Set chart canvas dimensions (example)
            if (chartCanvas) {
                 chartCanvas.width = video.videoWidth; // Match video width
                 chartCanvas.height = Math.min(400, window.innerHeight * 0.4); // Example: Max 400px or 40% of screen height
            }
            statusDiv.innerText = 'Webcam started. Sending frames for detection...';
            // Start the main processing/loop function
            processFrameLoop();
        });

    } catch (error) {
        statusDiv.innerText = 'Error accessing webcam: ' + error.message;
        console.error('Webcam access failed:', error);
    }
}

// --- Optional: Get Client Location ---
function getClientLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                clientLatitude = position.coords.latitude;
                clientLongitude = position.coords.longitude;
                console.log("Client location obtained:", clientLatitude, clientLongitude);
            },
            (error) => {
                console.warn('Could not get client location:', error.message);
                clientLatitude = null;
                clientLongitude = null;
            },
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 } // Options for geolocation
        );
    } else {
        console.warn('Geolocation is not supported by this browser.');
        clientLatitude = null;
        clientLongitude = null;
    }
}

// --- Main Processing Loop ---
function processFrameLoop() {
    const now = Date.now();

    // Draw the current video frame onto the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // --- Tasks to perform periodically ---

    // 1. Send frame to backend for detection
    if (now - lastDetectionSendTime > DETECTION_INTERVAL_MS) {
         lastDetectionSendTime = now;
         sendFrameForBackendDetection(); // Call the function to capture and send a frame
    }

    // 2. Report accumulated detection count summary to backend
    if (now - lastReportTime > REPORT_INTERVAL_MS) {
        lastReportTime = now;
        reportDetectionSummary();
    }

    // 3. Fetch historical data for the graph
    if (now - lastFetchTime > FETCH_RESULTS_INTERVAL_MS) {
         lastFetchTime = now;
         fetchHistoricalData();
    }

    // Loop the processFrameLoop function using requestAnimationFrame
    requestAnimationFrame(processFrameLoop);
}


// --- Send Frame to Backend for Detection ---
async function sendFrameForBackendDetection() {
     if (video.readyState < 2) { // Check if video is ready
        console.log("Video not ready to capture frame.");
        return;
    }

    // Create a temporary canvas to get image data from the video frame
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Ensure temporary canvas matches current video frame size
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    // Draw the current video frame onto the temporary canvas
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    // Convert the canvas content to a JPEG base64 string
    // Use a quality factor (0 to 1) to balance size and quality for sending
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.7); // Correct variable name

    // Clean up temporary canvas
    tempCanvas.remove();

    try {
        // Send the base64 image data to the backend detection endpoint
        console.log("Sending frame for detection...");
        const response = await fetch(DETECT_FRAME_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: base64Image }), // <-- FIX THIS LINE: use base64Image
        });

        // Get the JSON response from the backend
        const result = await response.json();

        if (response.ok) {
            // Process and display detection results received from backend
            // Expected result format: { status: "success", detection_count: N, primary_bbox: [x_min, y_min, x_max, y_max] or null, primary_confidence: float or null }
            console.log("Detection result from backend:", result);
            displayDetectionResults(result); // Call function to update UI based on backend result

            // Accumulate count for the reporting interval
            if (result.detection_count > 0) {
                 currentDetectionCount += result.detection_count;
            }

        } else {
            // Handle errors from the backend (e.g., 500 Internal Server Error, 400 Bad Request)
            console.error('Backend detection failed:', result.error || response.statusText);
            resultsDiv.innerText = `Detection Error: ${result.error || response.statusText}`;
             // Display error status visually if needed
             // ctx.font = '16px Arial';
             // ctx.fillStyle = 'red';
             // ctx.fillText('Backend Error!', 10, canvas.height - 10);

        }
    } catch (error) {
        // Handle network errors (e.g., backend is down, CORS issue not handled)
        console.error('Error sending frame for detection or receiving response:', error);
        resultsDiv.innerText = `Connection Error: ${error.message}. Check Backend URL & CORS.`;
         // Display connection error status visually
         // ctx.font = '16px Arial';
         // ctx.fillStyle = 'orange';
         // ctx.fillText('Connection Error!', 10, canvas.height - 10);
    }
}


// --- Display Detection Results from Backend ---
function displayDetectionResults(result) {
    // This function receives the object returned by the backend's /detect_frame API
    // result is expected to be like: { detection_count: N, primary_bbox: [x_min, y_min, x_max, y_max] or null, primary_confidence: float or null }

    const { detection_count, primary_bbox, primary_confidence } = result;

    // Update text status
    resultsDiv.innerText = `Found: ${detection_count} Potholes. Confidence: ${primary_confidence !== null ? primary_confidence.toFixed(2) : 'N/A'}`;

    // Clear any previous drawings *on the canvas context* (the frame is redrawn every loop)
    // We need to clear only the drawing layer if we were using separate canvas for drawing
    // But since we draw frame then boxes on the *same* canvas, drawing frame clears old boxes
    // We might just clear potential previous error text drawn directly on canvas

    // Redraw the frame (already done in processFrameLoop, so no need here)
    // ctx.clearRect(0, 0, canvas.width, canvas.height);
    // ctx.drawImage(video, 0, 0, canvas.width, canvas.height);


    // Draw bounding box if detection_count > 0 AND bbox is provided
    if (detection_count > 0 && primary_bbox && Array.isArray(primary_bbox) && primary_bbox.length === 4) {
        const [x_min, y_min, x_max, y_max] = primary_bbox;

        // Draw the bounding box
        ctx.strokeStyle = 'red'; // Red box color
        ctx.lineWidth = 2; // Box line width
        ctx.strokeRect(x_min, y_min, x_max - x_min, y_max - y_min); // Draw rectangle

        // Optional: Draw confidence score text near the box
        if (primary_confidence !== null) {
             const confidenceText = primary_confidence.toFixed(2);
             const textX = x_min;
             const textY = y_min > 10 ? y_min - 5 : y_max + 15; // Position text above or below box
             ctx.font = '16px Arial';
             ctx.fillStyle = 'red';
             ctx.fillText(confidenceText, textX, textY);
        }

    }
    // No need to explicitly draw "POTHOLE DETECTED" text if you have count and box
    // You can add it here if detection_count > 0:
    // if (detection_count > 0) {
    //      ctx.font = '24px Arial';
    //      ctx.fillStyle = 'red';
    //      ctx.fillText('POTHOLE DETECTED!', 10, 30);
    // }
}


// --- Report Detection Summary to Backend ---
async function reportDetectionSummary() {
     // Only report if there has been at least one detection in the last interval
     if (currentDetectionCount === 0) {
         // console.log("No potholes detected in this interval, not reporting.");
         return; // Don't send a report if count is 0
     }

     try {
         console.log(`Reporting ${currentDetectionCount} detections summary...`);
         const response = await fetch(REPORT_ENDPOINT, {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
             },
             body: JSON.stringify({
                 timestamp: new Date().toISOString(), // ISO 8601 format for backend
                 detected_count: currentDetectionCount, // Send the accumulated count
                 latitude: clientLatitude, // Send client location if available
                 longitude: clientLongitude
             }),
         });

         if (!response.ok) {
             console.error('Failed to report detection summary:', response.statusText);
         } else {
             console.log(`Successfully reported ${currentDetectionCount} detections.`);
             // Reset the counter after successful reporting
             currentDetectionCount = 0;
         }
     } catch (error) {
         console.error('Error reporting detection summary:', error);
     }
}


// --- Fetch Historical Data & Draw Graph ---
async function fetchHistoricalData() {
    try {
        console.log("Fetching historical data...");
        const response = await fetch(RESULTS_ENDPOINT);
        if (!response.ok) {
             console.error('Failed to fetch historical data:', response.statusText);
             return;
        }
        const data = await response.json(); // Expecting JSON like [{timestamp: '...', detected_count: N, ...}, ...]
        console.log("Historical data received:", data);

        if (chartCanvas) { // Only update chart if chartCanvas exists
            updateChart(data);
        } else {
             console.warn("Chart canvas element not found.");
        }


    } catch (error) {
        console.error('Error fetching historical data:', error);
    }
}

// Function to update the Chart.js graph
function updateChart(data) {
    // Prepare data for Chart.js
    const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })); // Format time nicely with seconds
    const detectionCounts = data.map(item => item.detected_count || 0); // Ensure it's a number, default to 0 if missing

    const chartContext = chartCanvas.getContext('2d'); // Get context again

    if (resultsChart) {
        resultsChart.destroy(); // Destroy previous chart instance to update it
    }

    resultsChart = new Chart(chartContext, {
        type: 'bar', // Bar chart might be better for counts over time intervals
        data: {
            labels: labels,
            datasets: [{
                label: 'Potholes Reported (Count)',
                data: detectionCounts,
                backgroundColor: 'rgba(255, 159, 64, 0.7)', // Orange/Yellow color, slightly opaque
                borderColor: 'rgba(255, 159, 64, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Potholes' },
                    ticks: {
                        stepSize: 1 // Show integer ticks for counts
                    }
                },
                x: {
                     title: { display: true, text: 'Time Reported' },
                     // Options for handling many labels if needed
                     autoSkip: true, // Automatically skip labels if they overlap
                     maxTicksLimit: 10 // Limit number of labels on x-axis
                     // maxRotation: 90,
                     // minRotation: 0
                }
            },
            plugins: {
                legend: {
                    display: true // Show legend
                },
                title: {
                    display: true,
                    text: 'Pothole Detections Over Time' // Chart title
                },
                tooltip: {
                    callbacks: {
                        // Custom tooltip to show timestamp more clearly
                        title: function(context) {
                             if (context && context.length > 0 && data[context[0].dataIndex]) {
                                 return new Date(data[context[0].dataIndex].timestamp).toLocaleString(); // Show full date/time
                             }
                             return '';
                        }
                        // You can add other callbacks for label, footer etc.
                    }
                }
            },
             responsive: true, // Chart resizes with container
             maintainAspectRatio: false // Allow controlling size via CSS or attributes
        }
    });
}


// --- Initialize Application ---
// Start the webcam, which will then trigger the processFrameLoop
startWebcam();

// Attempt to get client location (runs asynchronously)
getClientLocation();

// Fetch historical data initially
fetchHistoricalData();

// The processFrameLoop now handles sending frames, reporting summaries, and fetching history periodically.
// We removed the separate setIntervals for fetch/report.