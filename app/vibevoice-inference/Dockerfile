# Stage 1: Builder
FROM python:3.10-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies for audio processing (needed for build if any wheels need compilation)
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY vibevoice-inference/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.10-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

# Install runtime dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --chown=appuser:appuser vibevoice-inference/inference_server.py .

# Ensure appuser owns /app directory for cache creation
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

ENV MODEL_NAME=vibevoice-1.5b
ENV PORT=8000

EXPOSE 8000

CMD ["python3", "inference_server.py"]