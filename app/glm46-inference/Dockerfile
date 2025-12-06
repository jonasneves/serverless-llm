FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY inference_server.py .

ENV PORT=8000
ENV HF_MODEL_REPO=zai-org/GLM-4.6

EXPOSE 8000

CMD ["python3", "inference_server.py"]

