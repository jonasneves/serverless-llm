# AutoGen Studio Integration

## Overview

AutoGen Studio is now integrated into your serverless-llm chat interface! You now have **4 modes**:

1. **Arena** (`/`) - Side-by-side model comparison
2. **Discussion** (`/discussion`) - Multi-model discussion with debate
3. **AutoGen** (`/autogen`) - Programmatic multi-agent orchestration
4. **Studio** (`/studio`) - Visual no-code AutoGen Studio GUI

## What Was Added

### 1. AutoGen Studio Server
- Runs on **port 8081** internally
- Accessible via **`/studio`** path through reverse proxy
- Automatically starts with the chat server in GitHub Actions
- Health monitoring and auto-restart enabled

### 2. Path Rename
- **Old:** `/orchestrator` → **New:** `/autogen`
- Better reflects that it uses Microsoft AutoGen framework
- All navigation links updated across all pages

### 3. Navigation
All pages now have a **Studio** link in the top navigation bar

### 4. GitHub Actions Workflow
Updated `.github/workflows/chat-interface.yml`:
- Installs `autogenstudio>=0.4.0`
- Starts AutoGen Studio alongside chat server
- Health checks: Chat Server, Cloudflare Tunnel, **AutoGen Studio**
- Auto-restart if AutoGen Studio goes down
- Graceful shutdown for all services

## Access URLs

Once deployed:
- **Main Chat Interface:** `https://chat.neevs.io/`
- **Discussion Mode:** `https://chat.neevs.io/discussion`
- **AutoGen (Programmatic):** `https://chat.neevs.io/autogen`
- **AutoGen Studio (Visual):** `https://chat.neevs.io/studio`

## How It Works

### Reverse Proxy Setup
```
User Request to /studio/...
    ↓
FastAPI (port 8080)
    ↓
Proxy Handler
    ↓
AutoGen Studio (port 8081)
    ↓
Response back to user
```

### Files Modified
1. `requirements.txt` - Added `autogenstudio>=0.4.0`
2. `chat_server.py` - Added `/studio` proxy routes
3. `start_autogen_studio.sh` - Startup script
4. `.github/workflows/chat-interface.yml` - Workflow integration
5. All HTML files - Added Studio navigation link

## AutoGen Studio Features

Once deployed, you can use AutoGen Studio to:
- ✨ **Visual Workflow Builder** - Drag-and-drop agent creation
- 🤖 **Agent Teams** - Create multi-agent teams visually
- 🔧 **Tool Configuration** - Add tools (web search, code execution, etc.)
- 💬 **Test & Debug** - Test workflows interactively
- 📊 **Monitor Execution** - See agent conversations in real-time
- 💾 **Save Workflows** - Export and share agent configurations

## Differences: AutoGen vs Studio

| Feature | AutoGen (`/autogen`) | Studio (`/studio`) |
|---------|---------------------|-------------------|
| **Interface** | Programmatic API | Visual GUI |
| **Setup** | Code-defined agents | Drag-and-drop |
| **Use Case** | Production workflows | Prototyping/Testing |
| **Flexibility** | Full code control | Constrained by UI |
| **Learning Curve** | Requires coding | No-code friendly |

## Benefits

1. **Rapid Prototyping** - Design agent workflows visually before coding
2. **No Code Required** - Non-technical users can build workflows
3. **Side-by-Side** - Compare programmatic AutoGen with visual Studio
4. **Single Deployment** - Everything runs in one GitHub Actions workflow
5. **Always Available** - Same uptime as your chat interface

## Next Steps

After the workflow redeploys (2-3 minutes):
1. Go to `https://chat.neevs.io/studio`
2. Click "New Team" to create your first agent team
3. Add agents and tools visually
4. Test your workflow in the Studio interface
5. Export workflow JSON to implement programmatically in `/autogen`

## Troubleshooting

### Studio Not Loading
Check GitHub Actions logs:
```bash
# Look for AutoGen Studio startup
tail -f /tmp/autogen_studio.log
```

### Studio Appears Down
The health monitor will auto-restart:
- Checks every 30 seconds
- Auto-restarts if port 8081 is unresponsive
- Logs available in workflow logs

### Port Conflict
AutoGen Studio runs on **8081**, Chat Server on **8080**
- Both exposed through Cloudflare Tunnel
- No port conflicts as they're on different ports

## Architecture

```
GitHub Actions Runner
├── Chat Server (port 8080)
│   ├── / (Arena)
│   ├── /discussion (Discussion)
│   ├── /autogen (AutoGen Programmatic)
│   └── /studio/* (Proxy to AutoGen Studio)
├── AutoGen Studio (port 8081)
│   └── Visual GUI interface
└── Cloudflare Tunnel
    └── Exposes both to chat.neevs.io
```

Enjoy your new visual AutoGen Studio interface! 🚀

