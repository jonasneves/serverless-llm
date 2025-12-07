# Stage 1: Builder
FROM python:3.10-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
# Use CPU-only PyTorch to save ~2GB
ENV PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cpu

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY vibevoice-inference/requirements.txt .

# Install dependencies with CPU-only PyTorch
RUN pip install --no-cache-dir -r requirements.txt \
    # Clean up to reduce image size
    && find /opt/venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/venv -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/venv -type d -name "test" -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/venv -type f -name "*.pyc" -delete 2>/dev/null || true \
    && find /opt/venv -type f -name "*.pyo" -delete 2>/dev/null || true \
    && rm -rf /opt/venv/lib/python*/site-packages/torch/test 2>/dev/null || true \
    && rm -rf /opt/venv/lib/python*/site-packages/caffe2 2>/dev/null || true

# Stage 2: Runtime
FROM python:3.10-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

# Install runtime dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create a non-root user (use UID 10000 to match other images)
RUN useradd -m -u 10000 appuser

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