#!/bin/bash
# Start AutoGen Studio on port 8081

# Create AutoGen Studio app directory if it doesn't exist
mkdir -p /tmp/autogen-studio

# Start AutoGen Studio
echo "Starting AutoGen Studio on port 8081..."
autogenstudio ui --port 8081 --appdir /tmp/autogen-studio --host 0.0.0.0 2>&1 | tee /tmp/autogen_studio.log &

STUDIO_PID=$!
echo "AutoGen Studio PID: $STUDIO_PID"
echo $STUDIO_PID > /tmp/autogen_studio.pid

# Wait a bit for startup
sleep 5

# Check if it's running
if ps -p $STUDIO_PID > /dev/null; then
    echo "AutoGen Studio started successfully on http://localhost:8081"
else
    echo "AutoGen Studio failed to start"
    cat /tmp/autogen_studio.log
    exit 1
fi

