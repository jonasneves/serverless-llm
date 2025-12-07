#!/bin/bash
set -e

# Health Monitor Script
# Monitors service health and provides restart capabilities

# Configuration
SERVER_URL="${SERVER_URL:-http://localhost:8080/health}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
TUNNEL_ENABLED="${TUNNEL_ENABLED:-true}"

echo "=========================================="
echo "Health Monitor Started"
echo "Server URL: $SERVER_URL"
echo "Check Interval: ${CHECK_INTERVAL}s"
echo "=========================================="
echo ""

LOOP_COUNT=0

while true; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Check server health
    if curl -sf "$SERVER_URL" > /dev/null 2>&1; then
        SERVER_STATUS="OK"
    else
        SERVER_STATUS="DOWN"
    fi

    # Check tunnel health (if enabled)
    TUNNEL_STATUS="N/A"
    if [ "$TUNNEL_ENABLED" = "true" ]; then
        if pgrep -f cloudflared > /dev/null 2>&1; then
            TUNNEL_STATUS="OK"
        else
            TUNNEL_STATUS="DOWN"
        fi
    fi

    # Log status
    printf "[%s] Server: %s | Tunnel: %s\n" \
        "$TIMESTAMP" "$SERVER_STATUS" "$TUNNEL_STATUS"

    # Show detailed logs every 5 iterations
    if [ $((LOOP_COUNT % 5)) -eq 0 ]; then
        echo "--- Health Check #$LOOP_COUNT ---"
        curl -sf "$SERVER_URL" 2>&1 | head -5 || echo "Server unreachable"
        echo "-----------------------------------"
    fi

    # Wait before next check
    sleep "$CHECK_INTERVAL"
done
