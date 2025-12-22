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

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../" && pwd)"
HOST_DIR="$ROOT_DIR/extension/native-host"
PY="$HOST_DIR/serverless_llm_native_host.py"
WRAPPER="$HOST_DIR/serverless_llm_native_host.sh"

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

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
exec "$PYTHON_BIN" "$PY" "\$@"
EOF

chmod +x "$WRAPPER"

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
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo "✓ Installed native host manifest:"
echo "  $MANIFEST_PATH"
echo ""
echo "Next:"
echo "  1) Reload the extension"
echo "  2) Open the side panel and use Backend controls"
