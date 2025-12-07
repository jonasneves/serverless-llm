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
COPY mistral-inference/requirements.txt .
# Install with OpenBLAS support for CPU acceleration
RUN CMAKE_ARGS="-DLLAMA_BLAS=ON -DLLAMA_BLAS_VENDOR=OpenBLAS" pip3 install --no-cache-dir -r requirements.txt

COPY mistral-inference/inference_server.py .

ENV MODEL_NAME=Mistral-7B-Instruct-v0.3
ENV PORT=8000

EXPOSE 8000

CMD ["python3", "inference_server.py"]
