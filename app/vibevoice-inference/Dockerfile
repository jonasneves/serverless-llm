FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

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

ENV MODEL_NAME=vibevoice-1.5b
ENV PORT=8000

# Expose the port
EXPOSE 8000

# Run the server
CMD ["python3", "inference_server.py"]
