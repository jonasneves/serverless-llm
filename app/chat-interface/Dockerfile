# Stage 1: Node.js Builder (for playground app)
FROM node:20-alpine AS playground-builder

WORKDIR /app

# Copy playground package files first (for better layer caching)
COPY app/chat-interface/playground-app/package*.json ./playground-app/
WORKDIR /app/playground-app

# Install dependencies
RUN npm ci

# Copy playground source files
WORKDIR /app
COPY app/chat-interface/playground-app/ ./playground-app/
WORKDIR /app/playground-app

# Build playground (outputs to ../static/playground, which becomes /app/static/playground)
RUN npm run build

# Stage 2: Python Builder
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY app/chat-interface/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Runtime
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/venv/bin:$PATH"

# Create a non-root user (use UID 10000 to avoid conflicts)
RUN useradd -m -u 10000 appuser

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code (paths relative to project root since context is now '.')
# Copy all Python files and JSON config
COPY --chown=appuser:appuser app/chat-interface/*.py .
COPY --chown=appuser:appuser app/chat-interface/*.json .
# Copy directories
COPY --chown=appuser:appuser app/chat-interface/core ./core
COPY --chown=appuser:appuser app/chat-interface/utils ./utils
COPY --chown=appuser:appuser app/chat-interface/api ./api
COPY --chown=appuser:appuser app/chat-interface/services ./services
COPY --chown=appuser:appuser app/chat-interface/prompts ./prompts
COPY --chown=appuser:appuser app/chat-interface/clients ./clients
COPY --chown=appuser:appuser app/chat-interface/middleware ./middleware
COPY --chown=appuser:appuser app/chat-interface/engines ./engines
COPY --chown=appuser:appuser app/chat-interface/tools ./tools
# Copy config module from project root (Single Source of Truth)
COPY --chown=appuser:appuser config ./config
# Copy static files (excluding playground, which will be copied from builder)
COPY --chown=appuser:appuser app/chat-interface/static ./static
# Copy pre-built playground from playground-builder stage
COPY --from=playground-builder --chown=appuser:appuser /app/static/playground ./static/playground

# Switch to non-root user
USER appuser

ENV PORT=8080

EXPOSE 8080

CMD ["python", "chat_server.py"]