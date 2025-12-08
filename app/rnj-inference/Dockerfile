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
RUN git clone --recursive https://github.com/abetlen/llama-cpp-python.git /tmp/llama-cpp-python \
    && cd /tmp/llama-cpp-python/vendor/llama.cpp \
    && git remote add ggml https://github.com/ggml-org/llama.cpp || true \
    && git fetch ggml pull/17811/head:rnj-pr \
    && git checkout rnj-pr \
    && cd /tmp/llama-cpp-python \
    && CMAKE_ARGS="-DLLAMA_BLAS=ON -DLLAMA_BLAS_VENDOR=OpenBLAS" pip3 install . \
    && rm -rf /tmp/llama-cpp-python

COPY rnj-inference/inference_server.py .

ENV MODEL_NAME=EssentialAI/rnj-1-instruct-GGUF
ENV PORT=8000

EXPOSE 8000

CMD ["python3", "inference_server.py"]
