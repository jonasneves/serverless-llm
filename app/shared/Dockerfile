# =============================================================================
# llama-server Inference Dockerfile
# =============================================================================
# Builds llama.cpp from source and runs models via the native llama-server
# binary. Used by models whose architecture requires a newer llama.cpp than
# llama-cpp-python packages (lfm2, lfm2mini, lfm2thinking, qwen, jancode,
# falcon).
#
# Build args:
#   MODEL_NAME   - Model name from config/models.py (e.g., "lfm2", "qwen")
#   LLAMA_COMMIT - llama.cpp git tag/SHA to pin (invalidates clone layer cache)
# =============================================================================

# Stage 1: Builder — compiles llama-server from source
FROM python:3.11-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

ARG LLAMA_COMMIT=""

RUN git clone https://github.com/ggml-org/llama.cpp.git . \
    && git submodule update --init --recursive \
    && if [ -n "$LLAMA_COMMIT" ]; then git checkout "$LLAMA_COMMIT"; fi \
    && cmake -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DGGML_BLAS=ON \
        -DGGML_BLAS_VENDOR=OpenBLAS \
        -DGGML_OPENMP=ON \
        -DGGML_NATIVE=ON \
        -DGGML_NEON=ON \
        -DLLAMA_FLASH_ATTN=ON \
        -DLLAMA_CURL=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_SERVER=ON \
    && cmake --build build --target llama-server -j$(nproc) \
    && mkdir -p /build/runtime-libs \
    && find /build/build -name "*.so*" -exec cp {} /build/runtime-libs/ \;

# Stage 2: Runtime — minimal image with only the binary and runtime libraries
FROM python:3.11-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Runtime libraries only (no build tools)
# libgfortran5 is often needed by OpenBLAS for threading/optimization routines
RUN apt-get update && apt-get install -y \
    libopenblas0-pthread \
    libgomp1 \
    libgfortran5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled binary and shared libraries from builder
COPY --from=builder /build/build/bin/llama-server /usr/local/bin/llama-server
# llama.cpp produces shared libs (libllama, libggml, libmtmd) that llama-server links against
COPY --from=builder /build/runtime-libs/ /usr/local/lib/
RUN chmod +x /usr/local/bin/llama-server

# Run ldconfig to index runtime libraries
RUN ldconfig

# Create a non-root user (use UID 10000 to avoid conflicts)
RUN useradd -m -u 10000 appuser

WORKDIR /app

COPY app/shared/requirements-llama-server.txt requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser app/shared/ ./shared/
COPY --chown=appuser:appuser config/ ./config/

# Ensure appuser owns /app
RUN chown -R appuser:appuser /app

USER appuser

# MODEL_NAME is set at runtime (docker run -e MODEL_NAME=...) not baked in
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "shared/llama_inference_server.py"]
