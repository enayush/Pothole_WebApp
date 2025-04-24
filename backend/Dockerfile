# Use a lightweight Python base image
FROM python:3.9-slim

# Set working directory
WORKDIR /app

# Copy requirements.txt and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code and database file
COPY app.py .
COPY database.db . || echo "database.db not found, will be created on first run" # Copy if exists, ok if not

# Ensure the database file is writable (optional, but good practice if starting empty)
RUN touch database.db && chmod 777 database.db

# Expose the port Flask/Gunicorn runs on
EXPOSE 5000

# Command to run the application using Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]