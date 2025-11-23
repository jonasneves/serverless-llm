FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY chat_server.py .

ENV PORT=8080

EXPOSE 8080

CMD ["python", "chat_server.py"]
