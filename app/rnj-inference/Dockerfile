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

# Build llama.cpp server binary with RNJ-1 support
# NOTE: Using pre-refactor commit (e1b7d46) because current HF GGUF uses 'rnj1' architecture.
# The merged PR refactored rnj1 -> gemma3, but Essential AI hasn't updated their GGUF yet.
RUN git clone https://github.com/ggml-org/llama.cpp.git . \
    && git checkout e1b7d46e8c3364cad6d3d17059e9748911726881 \
    && git submodule update --init --recursive \
    # Build with OpenBLAS + ARM NEON optimizations for maximum ARM performance
    # NEON provides SIMD acceleration on ARM (equivalent to AVX on x86)
    && cmake -B build \
        -DGGML_BLAS=ON \
        -DGGML_BLAS_VENDOR=OpenBLAS \
        -DGGML_NATIVE=ON \
        -DGGML_NEON=ON \
        -DLLAMA_CURL=OFF \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_SERVER=ON \
    && cmake --build build -j$(nproc) \
    # Find and copy llama-server binary (path varies by llama.cpp version)
    && (cp build/bin/llama-server /usr/local/bin/ 2>/dev/null || \
        cp build/llama-server /usr/local/bin/ 2>/dev/null || \
        cp bin/llama-server /usr/local/bin/ 2>/dev/null || \
        (find build -name "llama-server" -type f -executable -exec cp {} /usr/local/bin/ \;)) \
    && chmod +x /usr/local/bin/llama-server \
    && ls -la /usr/local/bin/llama-server \
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
