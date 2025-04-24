import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS # Needed to allow requests from GitHub Pages

app = Flask(__name__)
CORS(app) # Enable CORS for all origins

DATABASE = 'database.db'

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row # Access columns by name
    return db

# Helper to close db connection on app teardown
from flask import g
@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# Function to initialize the database table
def init_db():
    with app.app_context():
        db = get_db()
        # Create detections table if it doesn't exist
        db.execute('''
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                detected INTEGER NOT NULL, -- 1 if detected, 0 if not (or store a count)
                latitude REAL,
                longitude REAL
            )
        ''')
        db.commit()

# --- API Endpoint to Receive Detections ---
@app.route('/api/report_detection', methods=['POST'])
def report_detection():
    data = request.get_json()
    timestamp = data.get('timestamp')
    detected = data.get('detected', 0) # Default to 0 if not provided
    latitude = data.get('latitude')
    longitude = data.get('longitude')

    if not timestamp:
        return jsonify({"error": "Timestamp is required"}), 400

    db = get_db()
    db.execute(
        'INSERT INTO detections (timestamp, detected, latitude, longitude) VALUES (?, ?, ?, ?)',
        (timestamp, detected, latitude, longitude)
    )
    db.commit()

    print(f"Reported detection: {timestamp}, Detected: {detected}") # Log for debugging
    return jsonify({"message": "Detection reported successfully"}), 201

# --- API Endpoint to Get Historical Results ---
@app.route('/api/get_results', methods=['GET'])
def get_results():
    db = get_db()
    # Fetch last 100 detections, ordered by time
    # Adapt query based on how you want to represent data (e.g., count per hour)
    cursor = db.execute('SELECT timestamp, detected FROM detections ORDER BY timestamp DESC LIMIT 100')
    results = cursor.fetchall()

    # Convert Row objects to dictionaries for JSON serialization
    results_list = [dict(row) for row in results]

    # Reverse to get chronological order for charting
    results_list.reverse()

    return jsonify(results_list)

# --- Basic Root route (Optional - maybe shows database content or a status) ---
@app.route('/')
def index():
    return "Pothole Detector Backend. API endpoints: /api/report_detection (POST), /api/get_results (GET)"

# Initialize database on first run
init_db()

# Use gunicorn for production deployment
# For local development, you can run with python app.py
# if __name__ == '__main__':
#     app.run(debug=True, host='0.0.0.0', port=5000)