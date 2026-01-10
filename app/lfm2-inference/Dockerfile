# =============================================================================
# LFM2.5-Specific Inference Dockerfile
# =============================================================================
# This model requires building llama.cpp from master with lfm2 architecture
# support. Uses llama-server binary rather than llama-cpp-python bindings.
# DO NOT consolidate with shared Dockerfile.
# =============================================================================

FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install build dependencies for llama.cpp
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    libopenblas-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Build llama.cpp server binary from master (includes lfm2 support)
RUN git clone https://github.com/ggml-org/llama.cpp.git . \
    && git checkout master \
    && git submodule update --init --recursive \
    # Build with OpenBLAS + ARM NEON + OpenMP for maximum CPU performance
    && cmake -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DGGML_BLAS=ON \
        -DGGML_BLAS_VENDOR=OpenBLAS \
        -DGGML_OPENMP=ON \
        -DGGML_NATIVE=ON \
        -DGGML_NEON=ON \
        -DLLAMA_CURL=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_SERVER=ON \
    && cmake --build build --target llama-server -j$(nproc) \
    # Copy binary and shared libraries to standard locations
    && cp build/bin/llama-server /usr/local/bin/ \
    && chmod +x /usr/local/bin/llama-server \
    && find build -name "*.so*" -exec cp -v {} /usr/local/lib/ \; || true \
    && ldconfig \
    # Cleanup build files
    && rm -rf /build

WORKDIR /app

# Install runtime libraries
RUN apt-get update && apt-get install -y \
    libopenblas0-pthread \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy shared module
COPY app/shared/ ./shared/

# Copy model-specific files and install Python dependencies
COPY app/shared/requirements-llama-server.txt requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app/lfm2-inference/inference_server.py .

ENV MODEL_REPO=LiquidAI/LFM2.5-1.2B-Instruct-GGUF
ENV MODEL_FILE=LFM2.5-1.2B-Instruct-Q4_K_M.gguf
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "inference_server.py"]
