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

# Clone llama.cpp from Essential-AI fork with rnj1 architecture support
# The GGUF on HuggingFace uses 'rnj1' architecture which only exists in commit e1b7d46.
RUN git clone https://github.com/Essential-AI/llama.cpp.git . \
    && git checkout e1b7d46e8c3364cad6d3d17059e9748911726881 \
    && git submodule update --init --recursive

# Configure cmake build
RUN cmake -B build \
    -DGGML_BLAS=ON \
    -DGGML_BLAS_VENDOR=OpenBLAS \
    -DGGML_NATIVE=ON \
    -DLLAMA_BUILD_SERVER=ON

# Build all targets
RUN cmake --build build -j$(nproc)

# Debug: Show what was built
RUN echo "=== Contents of build directory ===" \
    && find build -name "llama*" -type f 2>/dev/null || true \
    && echo "=== Contents of build/bin ===" \
    && ls -la build/bin/ 2>/dev/null || echo "No build/bin directory"

# Copy llama-server to system path - MUST succeed or build fails
RUN if [ -f build/bin/llama-server ]; then \
        cp build/bin/llama-server /usr/local/bin/; \
    elif [ -f build/llama-server ]; then \
        cp build/llama-server /usr/local/bin/; \
    else \
        echo "ERROR: llama-server binary not found!"; \
        find build -type f -name "*server*" || true; \
        exit 1; \
    fi \
    && chmod +x /usr/local/bin/llama-server

# Verify the binary works
RUN /usr/local/bin/llama-server --help | head -5 || echo "Binary exists but --help failed"

# Copy shared libraries and cleanup
RUN find build -name "*.so*" -exec cp -v {} /usr/local/lib/ \; 2>/dev/null || true \
    && ldconfig \
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
