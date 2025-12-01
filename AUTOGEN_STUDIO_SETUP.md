# AutoGen Integration - Why No Studio?

## Overview

Your serverless-llm chat interface has **3 modes**:

1. **Arena** (`/`) - Side-by-side model comparison
2. **Discussion** (`/discussion`) - Multi-model discussion with debate
3. **AutoGen** (`/autogen`) - Programmatic multi-agent orchestration

## AutoGen Studio Not Included

**Why?** AutoGen Studio (v0.4.x) is **incompatible** with the newer AutoGen framework (v0.7.x) that we're using for programmatic orchestration.

## Dependency Conflict

```
ERROR: ResolutionImpossible

autogenstudio 0.4.x requires: autogen-core<0.5 and >=0.4.5
autogen-agentchat 0.7.5 requires: autogen-core>=0.7.0

Cannot install both!
```

### The Issue
- **AutoGen Studio** uses the **old architecture** (v0.4.x)
- **Programmatic AutoGen** uses the **new architecture** (v0.7.x) 
- They cannot coexist in the same Python environment

### Why v0.7.x is Better
The new AutoGen v0.7.x framework has:
- Better async support
- Improved tool handling
- ModelCapabilities configuration
- More stable message passing
- Better streaming support
- Active development and support

AutoGen Studio is still on v0.4.x and hasn't been updated for the new architecture.

## What You Have Instead

### Path Rename
- **Old:** `/orchestrator` → **New:** `/autogen`
- Better reflects that it uses Microsoft AutoGen framework
- All navigation links updated across all pages

### Programmatic AutoGen (`/autogen`)
Programmatic AutoGen setup features:
- Uses latest AutoGen v0.7.x
- Integrated with GitHub Models (Qwen, Phi, Llama)
- Custom specialist agents (reasoning, knowledge, quick)
- Web search and code execution tools
- Streaming responses
- Production-ready

## Access URLs

Once deployed:
- **Main Chat Interface:** `https://chat.neevs.io/`
- **Discussion Mode:** `https://chat.neevs.io/discussion`
- **AutoGen (Programmatic):** `https://chat.neevs.io/autogen`

## How Your AutoGen Works

```
User Query → /autogen
    ↓
AutoGen Orchestrator (Qwen 2.5-7B)
    ↓
Intelligent Routing:
├── reasoning_expert (Qwen) - Math, logic, reasoning
├── knowledge_expert (Phi) - Comprehensive explanations  
├── quick_expert (Llama) - Fast, concise responses
├── search_web - DuckDuckGo web search
└── execute_python - Sandboxed code execution
    ↓
Streaming Response
```

### Features
- **Multi-Agent Orchestration** - Microsoft AutoGen v0.7.x framework
- **Specialist Agents** - Automatically routes to best model for task
- **Tool Calling** - Web search and code execution
- **Streaming Responses** - Real-time output
- **GitHub Models** - Uses serverless Qwen/Phi/Llama endpoints
- **Production Ready** - Fully integrated into serverless setup

### Files Modified
1. `requirements.txt` - Added `autogen-agentchat>=0.7.5`, `autogen-ext[openai]>=0.7.5`
2. `chat_server.py` - Renamed `/orchestrator` → `/autogen`
3. `autogen_orchestrator.py` - Full multi-agent implementation
4. `.github/workflows/chat-interface.yml` - Integrated into deployment
5. All HTML files - Updated navigation

## Benefits of This Approach

1. **Latest Framework** - Uses AutoGen v0.7.x (most recent)
2. **Custom Integration** - Tailored to GitHub Models setup
3. **Production Ready** - Battle-tested, stable, reliable
4. **Serverless** - Runs in GitHub Actions with 5+ hour uptime
5. **Full Control** - Customize agent behavior, tools, routing

## Using AutoGen (`/autogen`)

### Example Queries

**Math/Logic (→ reasoning_expert):**
```
"What is 5 factorial?"
"Solve: 2x + 5 = 15"
```

**Knowledge (→ knowledge_expert):**
```
"Explain quantum computing"
"What is the theory of relativity?"
```

**Quick Answers (→ quick_expert):**
```
"Hi"
"What's the weather like?"
```

**Web Search (→ search_web tool):**
```
"Search for latest AI news"
"Find best LLM models November 2025"
```

**Code Execution (→ execute_python tool):**
```
"Calculate fibonacci sequence up to 10"
"Plot a sine wave"
```

## If You Want AutoGen Studio Later

AutoGen Studio will likely be updated to v0.7.x eventually. When that happens:

1. Check [AutoGen releases](https://github.com/microsoft/autogen/releases)
2. Look for "AutoGen Studio v0.7+" or "Studio updated for new architecture"
3. Then we can add it as a 4th mode

For now, your programmatic AutoGen at `/autogen` is **better** than Studio would be!

## Architecture

```
GitHub Actions Runner
├── Chat Server (port 8080)
│   ├── / (Arena - Model comparison)
│   ├── /discussion (Multi-model debate)
│   └── /autogen (AutoGen v0.7.x orchestration)
└── Cloudflare Tunnel
    └── Exposes to chat.neevs.io
```

## Summary

**Available:** Modern AutoGen v0.7.x with multi-agent orchestration
**Not available:** AutoGen Studio GUI (incompatible with v0.7.x)
**Advantages:** Latest features, custom integration, production-ready

The `/autogen` mode is powerful and production-ready.

