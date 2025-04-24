# Use a lightweight Python base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements.txt and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
# Removed the problematic COPY database.db line
COPY app.py .

# Ensure the database file exists and is writable by the user running the app
# This creates an empty database.db if it wasn't copied (because it didn't exist)
# and ensures permissions are okay for the app to write to it.
RUN touch database.db && chmod 777 database.db

# Expose the port Flask/Gunicorn runs on
EXPOSE 5000

# Command to run the application using Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]