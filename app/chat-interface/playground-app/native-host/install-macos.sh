#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <extension-id> [browser]"
  echo "Example: $0 abcdefghijklmnopqrstuvwxyzabcdef chrome"
  echo ""
  echo "Browser options: chrome | canary | chromium | brave | arc | edge"
  exit 1
fi

EXT_ID="$1"
BROWSER="${2:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
HOST_DIR="$ROOT_DIR/app/chat-interface/playground-app/native-host"
PY="$HOST_DIR/serverless_llm_native_host.py"

pick_dest_dir() {
  local base="$HOME/Library/Application Support"

  case "$BROWSER" in
    chrome|"")
      echo "$base/Google/Chrome/NativeMessagingHosts"
      return
      ;;
    canary)
      echo "$base/Google/Chrome Canary/NativeMessagingHosts"
      return
      ;;
    chromium)
      echo "$base/Chromium/NativeMessagingHosts"
      return
      ;;
    brave)
      echo "$base/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      return
      ;;
    arc)
      echo "$base/Arc/NativeMessagingHosts"
      return
      ;;
    edge)
      echo "$base/Microsoft Edge/NativeMessagingHosts"
      return
      ;;
    *)
      echo "Unknown browser: $BROWSER" >&2
      exit 1
      ;;
  esac
}

DEST_DIR="$(pick_dest_dir)"
mkdir -p "$DEST_DIR"

MANIFEST_PATH="$DEST_DIR/io.neevs.serverless_llm.json"
cat > "$MANIFEST_PATH" <<EOF
{
  "name": "io.neevs.serverless_llm",
  "description": "Serverless LLM native host (start/stop local backend)",
  "path": "$PY",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

chmod +x "$PY"

echo "✓ Installed native host manifest:"
echo "  $MANIFEST_PATH"
echo ""
echo "Next:"
echo "  1) Reload the extension in chrome://extensions"
echo "  2) Open the side panel and use Backend controls"
