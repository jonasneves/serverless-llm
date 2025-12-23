#!/usr/bin/env bash
set -euo pipefail

BROWSER="${1:-chrome}"

pick_dest_dir() {
  case "$BROWSER" in
    chrome)
      echo "$HOME/.config/google-chrome/NativeMessagingHosts"
      ;;
    chromium)
      echo "$HOME/.config/chromium/NativeMessagingHosts"
      ;;
    brave)
      echo "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      ;;
    *)
      echo "Unknown browser: $BROWSER" >&2
      echo "Options: chrome | chromium | brave" >&2
      exit 1
      ;;
  esac
}

MANIFEST_PATH="$(pick_dest_dir)/io.neevs.serverless_llm.json"

if [[ -f "$MANIFEST_PATH" ]]; then
  rm "$MANIFEST_PATH"
  echo "✓ Removed native host manifest for $BROWSER"
  echo "  $MANIFEST_PATH"
else
  echo "No native host manifest found for $BROWSER"
  echo "  Expected: $MANIFEST_PATH"
fi
