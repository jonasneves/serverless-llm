#!/usr/bin/env bash
set -euo pipefail

# Get script directory and root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
EXT_DIR="$ROOT_DIR/extension"
HOST_DIR="$EXT_DIR/native-host"

# Read extension ID from .extension-id file if not provided
if [[ $# -eq 0 ]]; then
  if [[ -f "$EXT_DIR/.extension-id" ]]; then
    EXT_ID="$(cat "$EXT_DIR/.extension-id" | tr -d '[:space:]')"
    echo "Using extension ID from .extension-id: $EXT_ID"
  else
    echo "Usage: $0 [extension-id] [browser]"
    echo ""
    echo "No extension ID provided and .extension-id file not found."
    echo "Run 'make build' first to generate the extension with stable ID."
    exit 1
  fi
else
  EXT_ID="$1"
fi

BROWSER="${2:-chrome}"

PY="$HOST_DIR/serverless_llm_native_host.py"

pick_python() {
  if [[ -x "$ROOT_DIR/venv/bin/python" ]]; then
    echo "$ROOT_DIR/venv/bin/python"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return
  fi
  echo "Python not found. Install Python 3.11 (or run: make install)." >&2
  exit 1
}

PYTHON_BIN="$(pick_python)"

# Update shebang in Python file directly (the working approach)
sed -i.bak "1s|.*|#!$PYTHON_BIN|" "$PY"
rm -f "$PY.bak"
chmod +x "$PY"

pick_dest_dir() {
  local base="$HOME/Library/Application Support"

  case "$BROWSER" in
    chrome)
      echo "$base/Google/Chrome/NativeMessagingHosts"
      ;;
    canary)
      echo "$base/Google/Chrome Canary/NativeMessagingHosts"
      ;;
    chromium)
      echo "$base/Chromium/NativeMessagingHosts"
      ;;
    brave)
      echo "$base/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      ;;
    arc)
      echo "$base/Arc/NativeMessagingHosts"
      ;;
    edge)
      echo "$base/Microsoft Edge/NativeMessagingHosts"
      ;;
    *)
      echo "Unknown browser: $BROWSER" >&2
      echo "Options: chrome | canary | chromium | brave | arc | edge" >&2
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

echo ""
echo "✓ Installed native host for $BROWSER"
echo "  Manifest: $MANIFEST_PATH"
echo "  Extension ID: $EXT_ID"
echo ""
echo "Next steps:"
echo "  1) Reload the extension in chrome://extensions"
echo "  2) Open the side panel and use Backend controls"
