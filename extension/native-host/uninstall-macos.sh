#!/usr/bin/env bash
set -euo pipefail

BROWSER="${1:-chrome}"

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

MANIFEST_PATH="$(pick_dest_dir)/io.neevs.serverless_llm.json"

if [[ -f "$MANIFEST_PATH" ]]; then
  rm "$MANIFEST_PATH"
  echo "✓ Removed native host manifest for $BROWSER"
  echo "  $MANIFEST_PATH"
else
  echo "No native host manifest found for $BROWSER"
  echo "  Expected: $MANIFEST_PATH"
fi
