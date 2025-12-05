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

# Create a non-root user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY --chown=appuser:appuser chat_server.py .
COPY --chown=appuser:appuser http_client.py .
COPY --chown=appuser:appuser autogen_orchestrator.py .
COPY --chown=appuser:appuser tool_orchestrator.py .
COPY --chown=appuser:appuser discussion_engine.py .
COPY --chown=appuser:appuser confession_engine.py .
COPY --chown=appuser:appuser model_profiles.py .
COPY --chown=appuser:appuser orchestrator.py .
COPY --chown=appuser:appuser verbalized_sampling_engine.py .
COPY --chown=appuser:appuser voice_engine.py .
COPY --chown=appuser:appuser tools_config.json .
COPY --chown=appuser:appuser static ./static
COPY --chown=appuser:appuser tools ./tools

# Switch to non-root user
USER appuser

ENV PORT=8080

EXPOSE 8080

CMD ["python", "chat_server.py"]