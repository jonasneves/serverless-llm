# Health Monitor Sidecar
# Lightweight container for monitoring service health
# Base image: ~30MB
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install minimal dependencies for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 monitor

# Copy health check script
COPY health-check.sh /usr/local/bin/health-check.sh
RUN chmod +x /usr/local/bin/health-check.sh && \
    chown monitor:monitor /usr/local/bin/health-check.sh

USER monitor
WORKDIR /home/monitor

ENTRYPOINT ["/usr/local/bin/health-check.sh"]
