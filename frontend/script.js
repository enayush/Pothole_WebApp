const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const ctx = canvas.getContext('2d');

let model = undefined;
// !!! REPLACE WITH THE URL OF YOUR DEPLOYED FLASK BACKEND API !!!
const BACKEND_API_URL = 'YOUR_DEPLOYED_BACKEND_URL';
const REPORT_ENDPOINT = `${BACKEND_API_URL}/api/report_detection`;
const RESULTS_ENDPOINT = `${BACKEND_API_URL}/api/get_results`;

// --- 1. Load the TensorFlow.js model ---
async function loadModel() {
    statusDiv.innerText = 'Loading model...';
    try {
        // tf.loadGraphModel if it's a Graph Model, tf.loadLayersModel otherwise
        model = await tf.loadGraphModel('./model/model.json');
        statusDiv.innerText = 'Model loaded successfully!';
        startWebcam();
    } catch (error) {
        statusDiv.innerText = 'Failed to load model: ' + error.message;
        console.error('Model loading failed:', error);
    }
}

// --- 2. Access the webcam ---
async function startWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusDiv.innerText = 'Webcam not supported by your browser.';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.addEventListener('loadeddata', predictWebcam); // Start prediction once video is ready
    } catch (error) {
        statusDiv.innerText = 'Error accessing webcam: ' + error.message;
        console.error('Webcam access failed:', error);
    }
}

// --- 3. Prediction Loop ---
let lastReportTime = 0;
const REPORT_INTERVAL_MS = 5000; // Report detection every 5 seconds

async function predictWebcam() {
    if (!model) {
        requestAnimationFrame(predictWebcam); // Keep trying if model not loaded
        return;
    }

    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Preprocess frame (adjust based on YOUR model's requirements)
    // Typically involves resizing, normalizing pixel values
    const tfFrame = tf.browser.fromPixels(video).toFloat();
    // Example: Resize to a specific size (replace 224, 224 with your model's expected input shape)
    const resizedFrame = tf.image.resizeBilinear(tfFrame, [224, 224]);
    // Example: Normalize (adjust mean/std or scale 0-1)
    // const normalizedFrame = resizedFrame.div(255.0); // Scale 0-1
    // Add batch dimension
    const inputTensor = resizedFrame.expandDims(0); // Shape [1, H, W, C]

    // --- Run inference ---
    const predictions = await model.executeAsync(inputTensor); // Use executeAsync for graph models

    // --- Process predictions ---
    // THIS PART IS HIGHLY DEPENDENT ON YOUR MODEL'S OUTPUT
    // Example (for an object detection model outputting bounding boxes, scores, classes):
    // const [boxes, scores, classes] = predictions;
    // You'll need logic here to filter detections by score, map class IDs to names, etc.

    // For simplicity, let's just assume it outputs a single value indicating "pothole count" or "pothole confidence"
    const potholesDetected = processModelOutput(predictions); // Implement this function

    // Dispose tensors to free up memory
    tfFrame.dispose();
    resizedFrame.dispose();
    inputTensor.dispose();
    // Dispose of tensors returned by model.executeAsync() if you don't need them further
    predictions.forEach(p => p.dispose());


    // --- Display results on canvas ---
    // Clear canvas and draw current video frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Draw bounding boxes based on predictions (implement this logic)
    drawDetections(potholesDetected, ctx);


    // --- Display text results ---
    resultsDiv.innerText = `Potholes Detected: ${potholesDetected ? 'Yes' : 'No'}`; // Adjust based on how you represent detection

    // --- Report results to backend periodically ---
    const now = Date.now();
    if (now - lastReportTime > REPORT_INTERVAL_MS) {
        reportDetection(potholesDetected); // Implement this function
        lastReportTime = now;
    }

    // Loop the prediction
    requestAnimationFrame(predictWebcam);
}

// Implement this function based on your model's output
function processModelOutput(predictions) {
    // Example: Check if a 'pothole' class score is above a threshold
    // This is placeholder logic! Replace with your model's specific output handling.
    console.log("Model predictions:", predictions); // Log output to understand its structure
    // Based on console output, access prediction data
    // e.g., if output is [scoreTensor, classTensor] for a single object
    // const score = predictions[0].dataSync()[0]; // Get first score
    // return score > 0.7; // Example threshold

    // If your model just outputs a single value (like confidence), use that
    // const confidence = predictions[0].dataSync()[0];
    // return confidence > 0.5;

    // If it's object detection and predictions is an array of tensors like [boxes, classes, scores, num_detections]
    // const numDetections = predictions[3].dataSync()[0];
    // const detectionClasses = predictions[1].dataSync();
    // let potholeCount = 0;
    // for(let i = 0; i < numDetections; ++i) {
    //     if (detectionClasses[i] === YOUR_POTHOLE_CLASS_ID) { // Replace with the ID your model uses for 'pothole'
    //         potholeCount++;
    //     }
    // }
    // return potholeCount;

    // *** Placeholder: Assuming just a boolean detection ***
    // A simple placeholder - you MUST replace this with actual logic
    // Maybe your model outputs a single probability tensor?
    const probability = predictions[0].dataSync()[0]; // Example: Assuming first output is a probability score
    return probability > 0.5; // Simple threshold
}

// Implement this function to draw results on the canvas
function drawDetections(detectionResult, context) {
   // Example: If detectionResult is a boolean true/false
   if (detectionResult) {
       context.fillStyle = 'red';
       context.font = '24px Arial';
       context.fillText('POTHOLE DETECTED!', 10, 30);
   }
   // Example: If detectionResult contains bounding boxes and scores
   // Loop through bounding boxes and draw rectangles on the canvas
   // ctx.strokeStyle = 'red';
   // ctx.lineWidth = 2;
   // ctx.strokeRect(x, y, width, height); // Coordinates need scaling to canvas size
}


// --- 4. Report Detection to Backend ---
async function reportDetection(isPotholeDetected) {
    if (!isPotholeDetected) return; // Only report if detected

    try {
        const response = await fetch(REPORT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                // Add location data if you can get it (requires browser location API)
                // latitude: ...,
                // longitude: ...,
                // Or simplify: just send a count or a boolean
                detected: isPotholeDetected // Or a count if your processModelOutput gives a number
            }),
        });

        if (!response.ok) {
            console.error('Failed to report detection:', response.statusText);
        } else {
            console.log('Detection reported successfully.');
        }
    } catch (error) {
        console.error('Error reporting detection:', error);
        // Handle potential CORS issues or network problems
    }
}

// --- 5. Fetch Historical Data & Draw Graph ---
let resultsChart = null;

async function fetchHistoricalData() {
    try {
        const response = await fetch(RESULTS_ENDPOINT);
        if (!response.ok) {
             console.error('Failed to fetch historical data:', response.statusText);
             return;
        }
        const data = await response.json(); // Expecting JSON like [{timestamp: '...', count: N}, ...]
        console.log("Historical data:", data);
        updateChart(data);

    } catch (error) {
        console.error('Error fetching historical data:', error);
    }
}

function updateChart(data) {
    const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString());
    const detectionCounts = data.map(item => item.count || (item.detected ? 1 : 0)); // Adapt based on your backend data structure

    const ctx = document.getElementById('resultsChart').getContext('2d');

    if (resultsChart) {
        resultsChart.destroy(); // Destroy previous chart instance
    }

    resultsChart = new Chart(ctx, {
        type: 'line', // Or 'bar'
        data: {
            labels: labels,
            datasets: [{
                label: '# of Potholes Detected (Approx)', // Adjust label
                data: detectionCounts,
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
                fill: false // Don't fill area under the line
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Detections' }
                },
                x: {
                     title: { display: true, text: 'Time' }
                }
            }
        }
    });
}

// --- Initialize ---
loadModel();
// Fetch historical data initially and then periodically
fetchHistoricalData();
setInterval(fetchHistoricalData, 10000); // Fetch data every 10 seconds