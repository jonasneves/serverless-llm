# Chrome Extension Setup

The Serverless LLM Playground can run as a Chrome extension with full-page interface and side panel controls.

## Quick Start

### 1. Build the Extension

```bash
make build-extension
```

This compiles the React app for Chrome extension usage.

### 2. Start the Backend Server

```bash
make dev-remote
```

The extension connects to your local FastAPI server at `http://localhost:8080`.

### 3. Load Extension in Chrome

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Navigate to: `app/chat/playground-app/dist-extension`
5. Click "Select"

Optional: enable auto-start for the local backend (Native Messaging)
- Copy the extension ID shown on its card in `chrome://extensions/`
- Follow "Auto-start local backend (Native Messaging)" below

### 4. Use the Extension

Click the extension icon in Chrome toolbar to open the full-page chat interface in a new tab.

## Features

### Full Page Interface
- Complete LLM chat UI with all modes (Single, Compare, Arena, Council, Roundtable, Agents)
- Gesture control support
- Model switching and configuration
- All existing playground features

### Side Panel
Access server controls via side panel:
- **Service Health Monitoring**: Real-time status checks for all inference servers
- **Configuration Management**: Store and edit server settings (ports, domains, tokens)
- **Quick Actions**: Launch full app, refresh health checks
- **Quick Start Guide**: Terminal command reference

To open side panel:
1. Click extension icon → right-click → "Open side panel"
2. Or use keyboard shortcut (configurable in Chrome)

## Architecture

```
Extension (Chrome)
├── Full Page (index.html)
│   └── Main chat interface
├── Side Panel (sidepanel.html)
│   └── Server controls & config
└── Background Service Worker
    └── Handles extension lifecycle

    ↓ HTTP Requests

Backend Server (localhost:8080)
├── FastAPI chat server
└── Model endpoints (8001-8007)
```

## Configuration

### Server Endpoints
Side panel allows configuring:
- **Chat API Base URL**: Where the chat backend lives (default: `http://localhost:8080`)
- **Models Base Domain**: Remote model domain for subdomain routing (leave empty for localhost model ports)
- **GitHub Token**: Optional token for Discussion/Agents modes

Settings persist in `chrome.storage.local`.

### Profiles
Side panel includes presets for common setups:
- **Remote (hosted)**: `https://chat.neevs.io` + `https://[service].neevs.io`
- **Local chat + remote models**: `http://localhost:8080` + `https://[service].neevs.io`
- **Local (chat + models)**: `http://localhost:8080` + localhost model ports

### Environment Variables
Backend still uses `.env` file. Side panel config supplements runtime settings.

## Development

### Rebuild Extension
After code changes:
```bash
make build-extension
```

Then click "Reload" on extension card in `chrome://extensions/`.

### Auto-start local backend (Native Messaging)
Chrome extensions can’t run Python/FastAPI directly, but they can call a local “native host” helper to start/stop it.

1. Load the extension (unpacked) and copy its ID from `chrome://extensions/`.
2. Install the native host manifest:
   - macOS (Chrome): `app/chat/playground-app/native-host/install-macos.sh <extension-id> chrome`
   - macOS (Arc): `app/chat/playground-app/native-host/install-macos.sh <extension-id> arc`
   - macOS (Brave): `app/chat/playground-app/native-host/install-macos.sh <extension-id> brave`
   - Linux: `app/chat/playground-app/native-host/install-linux.sh <extension-id>`
3. Reload the extension, open the side panel → `Deploy` tab → use `Start/Stop`.

Notes:
- Backend logs go to `serverless-llm/.native-host/backend.log`.
- The helper currently starts `make dev-remote` (expects `venv/` and `.env`).
- The side panel also includes a `Build` button that runs `make build-playground` via the native host (logs in `serverless-llm/.native-host/make-build-playground.log`).
- If the build fails with `Error 127`, install Node.js so `npm` is available, then re-run the native host install script (browsers often don’t inherit your shell `PATH`).
- If you see `Native host has exited`, re-run the install script (it creates a wrapper pointing at your local Python, since browsers often don’t inherit your shell `PATH`).

### Debug
- **Main app**: Right-click extension page → Inspect
- **Side panel**: Right-click side panel → Inspect
- **Background worker**: Extensions page → "service worker" link

### Hot Reload
Extension doesn't support hot reload. For rapid development:
1. Use `npm run dev` for standard web dev
2. Build extension for final testing

## Permissions

Extension requests:
- `sidePanel`: Enable side panel UI
- `storage`: Persist configuration
- `host_permissions`: Access localhost:8080-8007 (backend APIs)

No external network access or sensitive permissions.

## Customization

### Icons
Placeholder SVG icons in `public/`. Replace with custom images:
- `icon-16.svg` → 16x16px toolbar icon
- `icon-48.svg` → 48x48px extension management
- `icon-128.svg` → 128x128px Chrome Web Store

### Manifest
Edit `public/manifest.json` for:
- Extension name/description
- Permissions
- Keyboard shortcuts
- Content scripts (if needed)

## Limitations

- Native file system access limited to Chrome's sandboxed storage
- WebRTC/MediaPipe features work but require camera permissions

## What's Been Implemented

### ✅ Native Messaging (Backend Auto-Start)
- Start/Stop/Restart local backend directly from sidepanel
- Process status monitoring with PID display
- Log viewing for debugging
- Automatic mode detection (dev-remote vs dev-interface-local)

### ✅ CI/CD Deployment Triggers
- Monitor GitHub Actions workflow status (Chat, Build Images)
- Trigger deployments directly from sidepanel
- Active deployment count badges
- Quick action buttons for common deployments

### ✅ Enhanced Sidepanel UX
- Profile switching (Dev/Prod modes)
- Health monitoring for all services
- Recent activity feed
- Keyboard shortcuts (Ctrl+P, Ctrl+O)

## Future Enhancements

Potential additions to the control panel:
- **Deployment history** — Show recent workflow runs with success/failure timeline
- **Log streaming** — Real-time backend logs in sidepanel (currently shows tail only)
- **Environment editor** — Edit `.env` variables directly from sidepanel
- **Model status dashboard** — Show which models are loaded/available on each endpoint
