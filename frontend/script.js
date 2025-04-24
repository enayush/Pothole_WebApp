const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const ctx = canvas.getContext('2d');

let model = undefined;
// !!! REPLACE WITH THE URL OF YOUR DEPLOYED FLASK BACKEND API !!!
const BACKEND_API_URL = 'https://pothole-detector-backend.onrender.com';
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
    // Resize to the shape expected by the model: [640, 640]
    const resizedFrame = tf.image.resizeBilinear(tfFrame, [640, 640]); // <-- CHANGE [224, 224] to [640, 640]
    // Example: Normalize (adjust mean/std or scale 0-1) if your model requires it
    // const normalizedFrame = resizedFrame.div(255.0);
    // Add batch dimension
    const inputTensor = resizedFrame.expandDims(0); // Resulting shape will be [1, 640, 640, 3]

    // Pass inputTensor to model.execute() or model.predict()
    const predictions = await model.executeAsync(inputTensor); // Or model.predict(inputTensor);
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
    // --- Step 1: Log and inspect the 'predictions' variable ---
    console.log("--- Inspecting TF.js predictions ---");
    console.log("Predictions variable type:", typeof predictions);
    console.log("Is predictions an Array?", Array.isArray(predictions));

    if (Array.isArray(predictions)) {
        console.log("Predictions is an array. Length:", predictions.length);
        // If it's an array, iterate through items and log their types/shapes
        predictions.forEach((tensor, index) => {
            console.log(`  Item ${index}:`, tensor);
            if (tensor && typeof tensor.shape !== 'undefined') {
                console.log(`    Shape:`, tensor.shape);
                console.log(`    Is Tensor?`, tensor instanceof tf.Tensor);
                // WARNING: Calling .arraySync() or .dataSync() on large tensors can freeze the browser!
                // Only use on small or known tensors for debugging.
                // console.log(`    Data (first few):`, tensor.dataSync().slice(0, 10));
            } else {
                console.log("    Item is not a Tensor or has no shape.");
            }
        });
    } else if (predictions && typeof predictions.shape !== 'undefined') {
        console.log("Predictions is a single Tensor.");
        console.log("  Shape:", predictions.shape);
        console.log(`  Is Tensor?`, predictions instanceof tf.Tensor);
        // WARNING: Calling .arraySync() or .dataSync() on large tensors can freeze the browser!
        // Only use on small or known tensors for debugging.
        // console.log(`    Data (first few):`, predictions.dataSync().slice(0, 10));
    } else {
        console.log("Predictions is not an array or a Tensor:", predictions);
    }
    console.log("--- End Inspection ---");


    // --- Step 2: Based on console output, write the actual logic ---
    // This part MUST be written by you after you see the console logs from Step 1.
    // Example (assuming it returns an array where the first item is scores and second is boxes):
    // if (Array.isArray(predictions) && predictions.length >= 2 &&
    //     predictions[0] instanceof tf.Tensor && predictions[1] instanceof tf.Tensor) {
    //     const scores = predictions[0].dataSync(); // Get scores as a JS array
    //     const boxes = predictions[1].dataSync();   // Get boxes as a JS array (flat array)
    //     // Now loop through scores and boxes to find detections above a threshold
    //     let detected_count = 0;
    //     let primary_bbox = null;
    //     let primary_confidence = null;
    //     const threshold = 0.5; // Match your model's expected threshold or adjust
    //     for (let i = 0; i < scores.length; i++) {
    //         if (scores[i] > threshold) {
    //             detected_count++;
    //             if (primary_bbox === null) {
    //                 // Assuming boxes are [y1, x1, y2, x2] or [x1, y1, x2, y2] in normalized [0,1] format
    //                 // You'll need to know your model's output format!
    //                 const box = boxes.slice(i * 4, i * 4 + 4); // Extract box coords for this detection
    //                 // Convert normalized coords [0,1] to pixel coords [0, videoWidth/Height]
    //                 const videoWidth = video.videoWidth;
    //                 const videoHeight = video.videoHeight;
    //                 // Example for [y1, x1, y2, x2] format:
    //                 // const x_min = box[1] * videoWidth;
    //                 // const y_min = box[0] * videoHeight;
    //                 // const x_max = box[3] * videoWidth;
    //                 // const y_max = box[2] * videoHeight;
    //                 // Example for [x1, y1, x2, y2] format:
    //                 const x_min = box[0] * videoWidth;
    //                 const y_min = box[1] * videoHeight;
    //                 const x_max = box[2] * videoWidth;
    //                 const y_max = box[3] * videoHeight;
    //                 primary_bbox = [x_min, y_min, x_max, y_max]; // Store as pixel values
    //                 primary_confidence = scores[i];
    //             }
    //         }
    //     }
    //     // Return structure expected by displayDetectionResults if it's called with this output
    //     // Or just return the processed data you need for your logic
    //     return { detection_count: detected_count, primary_bbox: primary_bbox, primary_confidence: primary_confidence };

    // } else {
    //    console.warn("Unexpected predictions format:", predictions);
    return { detection_count: 0, primary_bbox: null, primary_confidence: null }; // Return no detections if format is unexpected
    // }


    // --- Step 3: Remove or comment out Step 1 logging once you know the structure ---
    // And uncomment Step 2 logic.

    // *** Placeholder return (will not work) ***
    // const probability = predictions[0].dataSync()[0]; // REMOVE or COMMENT OUT
    // return probability > 0.5; // REMOVE or COMMENT OUT
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