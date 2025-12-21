# =============================================================================
# RNJ-Specific Inference Dockerfile
# =============================================================================
# This model requires building llama.cpp from source (PR #17811) with specific
# configurations (MTMD=OFF for text-only support, CURL=OFF) rather than using
# pre-built llama-cpp-python bindings like other models.
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

# Build llama.cpp server binary directly from PR #17811
# This bypasses Python binding compatibility issues
RUN git clone https://github.com/ggml-org/llama.cpp.git . \
    && git fetch origin pull/17811/head:rnj-pr \
    && git checkout rnj-pr \
    && git submodule update --init --recursive \
    # Build with OpenBLAS + ARM NEON optimizations for maximum ARM performance
    # NEON provides SIMD acceleration on ARM (equivalent to AVX on x86)
    && cmake -B build \
        -DGGML_BLAS=ON \
        -DGGML_BLAS_VENDOR=OpenBLAS \
        -DGGML_NATIVE=ON \
        -DGGML_NEON=ON \
        -DLLAMA_CURL=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_SERVER=ON \
        -DLLAMA_MTMD=OFF \
    && cmake --build build --target llama-server -j$(nproc) \
    # Copy binary and any shared libraries to standard locations
    && cp build/bin/llama-server /usr/local/bin/ \
    && chmod +x /usr/local/bin/llama-server \
    && find build -name "*.so*" -exec cp -v {} /usr/local/lib/ \; || true \
    && ldconfig \
    # Cleanup build files
    && rm -rf /build

WORKDIR /app

# Install runtime libraries (OpenBLAS for BLAS, libgomp for OpenMP)
RUN apt-get update && apt-get install -y \
    libopenblas0-pthread \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy shared module
COPY shared/ ./shared/

# Copy model-specific files and install Python dependencies
COPY rnj-inference/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY rnj-inference/inference_server.py .

ENV MODEL_REPO=EssentialAI/rnj-1-instruct-GGUF
ENV MODEL_FILE=rnj-1-8B-instruct-Q4_K_M.gguf
ENV PORT=8000
# Runtime config (N_CTX, N_THREADS, N_BATCH, MAX_CONCURRENT) is set
# at runtime from config/inference.yaml via workflow environment variables

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "inference_server.py"]
