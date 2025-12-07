# Stage 1: Builder
FROM python:3.11-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY llama-inference/requirements.txt .
# Install with OpenBLAS support for CPU acceleration
RUN CMAKE_ARGS="-DLLAMA_BLAS=ON -DLLAMA_BLAS_VENDOR=OpenBLAS" pip3 install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

# Install runtime libraries for OpenBLAS and OpenMP
RUN apt-get update && apt-get install -y \
    libopenblas0-pthread \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user (use UID 10000 to avoid conflicts)
RUN useradd -m -u 10000 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy shared module first
COPY --chown=appuser:appuser shared/ ./shared/

# Copy application code
COPY --chown=appuser:appuser llama-inference/inference_server.py .

# Ensure appuser owns /app directory for cache creation
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

ENV MODEL_NAME=llama-3.2-3b
ENV PORT=8000

EXPOSE 8000

CMD ["python3", "inference_server.py"]
