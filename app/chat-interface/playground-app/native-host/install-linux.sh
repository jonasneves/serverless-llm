#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <extension-id> [browser]"
  echo "Example: $0 abcdefghijklmnopqrstuvwxyzabcdef chrome"
  echo ""
  echo "Browser options: chrome | chromium | brave"
  exit 1
fi

EXT_ID="$1"
BROWSER="${2:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
HOST_DIR="$ROOT_DIR/app/chat-interface/playground-app/native-host"
PY="$HOST_DIR/serverless_llm_native_host.py"

pick_dest_dir() {
  case "$BROWSER" in
    chrome|"")
      echo "$HOME/.config/google-chrome/NativeMessagingHosts"
      return
      ;;
    chromium)
      echo "$HOME/.config/chromium/NativeMessagingHosts"
      return
      ;;
    brave)
      echo "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
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
echo "  1) Reload the extension"
echo "  2) Open the side panel and use Backend controls"
