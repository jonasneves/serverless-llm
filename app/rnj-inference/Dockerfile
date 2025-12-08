FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install build dependencies for llama-cpp-python
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared module first
COPY shared/ ./shared/

# Copy model-specific files
COPY rnj-inference/requirements.txt .

# Install dependencies excluding llama-cpp-python (which we build manually)
RUN grep -v "llama-cpp-python" requirements.txt > requirements.no-lcp.txt \
    && pip3 install --no-cache-dir -r requirements.no-lcp.txt

# Build llama-cpp-python with custom llama.cpp from PR #17811
# Note: This PR adds RNJ-1 architecture support.
# We use GGML_STATIC=ON to statically link GGML into libllama.so,
# avoiding runtime dependency on libggml-base.so
RUN pip3 install --upgrade pip cmake scikit-build-core ninja \
    && git clone --recursive https://github.com/abetlen/llama-cpp-python.git /tmp/llama-cpp-python \
    && cd /tmp/llama-cpp-python/vendor/llama.cpp \
    && git remote add ggml https://github.com/ggml-org/llama.cpp || true \
    && git fetch ggml pull/17811/head:rnj-pr \
    && git checkout rnj-pr \
    && git submodule update --init --recursive \
    # Disable auxiliary llama.cpp targets that have build issues in the PR
    && echo "project(ignored)" > tools/CMakeLists.txt \
    && echo "project(ignored)" > examples/CMakeLists.txt \
    && echo "project(ignored)" > tests/CMakeLists.txt \
    # Patch llama-cpp-python's CMakeLists.txt to remove mtmd/llava references
    && cd /tmp/llama-cpp-python \
    && sed -i '/mtmd/d' CMakeLists.txt || true \
    && sed -i '/llava/d' CMakeLists.txt || true \
    && CMAKE_ARGS="-DLLAMA_BLAS=ON -DLLAMA_BLAS_VENDOR=OpenBLAS -DGGML_CCACHE=OFF -DGGML_STATIC=ON -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_SERVER=OFF" pip3 install --verbose . \
    && rm -rf /tmp/llama-cpp-python

# Copy llama.cpp shared libraries to standard location and update linker cache
RUN find /usr/local/lib/python3.11/site-packages/llama_cpp -name "*.so*" -exec cp -v {} /usr/local/lib/ \; \
    && ldconfig

COPY rnj-inference/inference_server.py .

# Install curl for health checks  
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

ENV MODEL_NAME=EssentialAI/rnj-1-instruct-GGUF
ENV PORT=8000
# Set library path to find llama.cpp shared libraries
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/site-packages/llama_cpp/lib:$LD_LIBRARY_PATH

EXPOSE 8000

# Health check aligned with other inference servers
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python3", "inference_server.py"]
