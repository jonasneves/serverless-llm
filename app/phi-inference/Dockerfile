FROM nvidia/cuda:12.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY inference_server.py .

ENV MODEL_NAME=microsoft/Phi-3-medium-4k-instruct
ENV USE_4BIT=true
ENV PORT=8000

EXPOSE 8000

CMD ["python3", "inference_server.py"]
