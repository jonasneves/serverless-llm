#!/usr/bin/env bash
echo "$(date): Wrapper invoked with args: $@" >> ~/.native-host-wrapper.log
echo "$(date): PWD=$PWD" >> ~/.native-host-wrapper.log
echo "$(date): Python path: /Users/jonasneves/Documents/GitHub/serverless-llm/venv/bin/python" >> ~/.native-host-wrapper.log
exec "/Users/jonasneves/Documents/GitHub/serverless-llm/venv/bin/python" "/Users/jonasneves/Documents/GitHub/serverless-llm/app/chat-interface/playground-app/native-host/serverless_llm_native_host.py" "$@"
