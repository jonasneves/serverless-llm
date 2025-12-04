FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for audio processing (ffmpeg is critical)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY inference_server.py .

# Expose the port
EXPOSE 8007

# Run the server
CMD ["uvicorn", "inference_server:app", "--host", "0.0.0.0", "--port", "8007"]
