# =============================================================================
# Nemotron-Specific Inference Dockerfile
# =============================================================================
# This model requires building llama.cpp from master (commit 2995341+) with
# nemotron_h_moe architecture support (PR #18058, merged Dec 16, 2025).
# Uses llama-server binary rather than llama-cpp-python bindings.
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

# Build llama.cpp server binary from master (includes nemotron_h_moe support)
RUN git clone https://github.com/ggml-org/llama.cpp.git . \
    && git checkout master \
    && git submodule update --init --recursive \
    # Build with OpenBLAS + ARM NEON + OpenMP for multi-threaded ARM performance
    && cmake -B build \
        -DGGML_BLAS=ON \
        -DGGML_BLAS_VENDOR=OpenBLAS \
        -DGGML_NATIVE=ON \
        -DGGML_NEON=ON \
        -DGGML_OPENMP=ON \
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
COPY shared/ ./shared/

# Copy model-specific files and install Python dependencies
COPY nemotron-inference/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY nemotron-inference/inference_server.py .

ENV MODEL_REPO=unsloth/Nemotron-3-Nano-30B-A3B-GGUF
# IQ2_M (~8GB) is the smallest available quantization for this 30B model
ENV MODEL_FILE=Nemotron-3-Nano-30B-A3B-UD-IQ2_M.gguf
ENV PORT=8000
ENV N_CTX=1024
ENV N_THREADS=4
ENV N_BATCH=512
ENV MAX_CONCURRENT=1

EXPOSE 8000

# Health check - 30B IQ2_M model needs up to 10 min to load with --no-mmap
HEALTHCHECK --interval=60s --timeout=30s --start-period=600s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "inference_server.py"]
