# Chrome Extension Setup

`shipctl` is the Serverless LLM side panel Chrome extension with full-page interface and DevOps controls.

**Extension ID:** `oopokiicghaijdbmmmobemhncaengahi` (stable, persisted across reinstalls)

## Quick Start

### 1. Build the Extension

```bash
cd extension
make build
```

This compiles the React app for Chrome extension usage.

### 2. Load Extension in Chrome

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Navigate to: `extension/dist`
5. Click "Select" (you should see the `shipctl` card appear)

### 3. (Optional) Enable Native Messaging

To control your local backend from the extension:

```bash
make install-native            # For Chrome
make install-native BROWSER=arc    # For Arc
make install-native BROWSER=brave  # For Brave
```

### 4. Start the Backend Server

```bash
make dev-chat
```

The extension connects to your local FastAPI server at `http://localhost:8080`.

## Features

### Full Page Interface
- Complete LLM chat UI with all modes (Single, Compare, Arena, Council, Roundtable, Agents)
- Gesture control support
- Model switching and configuration
- All existing playground features

### Side Panel
Access the DevOps control plane via side panel with two tabs:

**Control Tab:**
- **Open App**: Quick buttons to open Dev (localhost) or Prod (chat.neevs.io) 
- **Local Server**: Start/stop/restart local backend with logs
- **Build**: Dropdown to build Playground, Extension, or Both
- **CI/CD Deployments**: Trigger GitHub Actions workflows (Chat, Build Images)

**Status Tab:**
- **Service Health**: Real-time status checks for all model inference servers
- **Connection Summary**: Overview of healthy/unhealthy services

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
cd extension
make build
```

Then click "Reload" on extension card in `chrome://extensions/`.

### Native Messaging Setup

The extension uses a **stable ID** (`oopokiicghaijdbmmmobemhncaengahi`) derived from a development key in the manifest. This means you don't need to copy IDs manually.

**Install:**
```bash
cd extension
make install-native              # Chrome (default)
make install-native BROWSER=arc  # Arc
make install-native BROWSER=brave # Brave
make install-native BROWSER=edge  # Edge
```

**Uninstall:**
```bash
make uninstall-native
make uninstall-native BROWSER=arc  # For specific browser
```

**Notes:**
- Backend logs go to `serverless-llm/.native-host/backend.log`.
- The helper starts `make dev-chat` (expects `venv/` and `.env`).
- If the build fails with `Error 127`, install Node.js so `npm` is available.
- If you see `Native host has exited`, re-run `make install-native`.

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
- Automatic mode detection (dev-chat vs dev-interface-local)

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
