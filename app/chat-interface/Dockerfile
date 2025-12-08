# Stage 1: Builder
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

# Create a non-root user (use UID 10000 to avoid conflicts)
RUN useradd -m -u 10000 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
# Copy all Python files and JSON config
COPY --chown=appuser:appuser *.py .
COPY --chown=appuser:appuser *.json .
COPY --chown=appuser:appuser static ./static
COPY --chown=appuser:appuser tools ./tools

# Switch to non-root user
USER appuser

ENV PORT=8080

EXPOSE 8080

CMD ["python", "chat_server.py"]