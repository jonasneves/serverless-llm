# Cloudflared Tunnel Sidecar
# Ultra-lightweight container for running Cloudflare tunnels
# Base image: ~30MB (vs ~120MB for python:3.11-slim)
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install minimal dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download and install cloudflared for ARM64
ARG TARGETARCH=arm64
RUN ARCH=${TARGETARCH} && \
    if [ "$ARCH" = "amd64" ]; then ARCH="amd64"; fi && \
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared

# Create non-root user (UID 1000 is taken in ubuntu:24.04, use 10000)
RUN useradd -m -u 10000 tunnel && \
    mkdir -p /home/tunnel/.cloudflared && \
    chown -R tunnel:tunnel /home/tunnel

USER tunnel
WORKDIR /home/tunnel

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep cloudflared || exit 1

ENTRYPOINT ["/usr/local/bin/cloudflared"]
CMD ["tunnel", "--no-autoupdate", "run"]
