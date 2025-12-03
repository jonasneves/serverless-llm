# Serverless LLM Arena
Free, serverless, multi-model chat with Qwen, Llama, Phi, Mistral, Gemma — powered only by GitHub Actions + Cloudflare

**https://chat.neevs.io**

<!-- Live API Health Status -->
[![API Status](https://img.shields.io/endpoint?style=social&url=https://chat.neevs.io/api/badge/system)](https://chat.neevs.io/status)

[![Qwen API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/qwen2.5-7b)](https://qwen.neevs.io/health)
[![Phi API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/phi-3-mini)](https://phi.neevs.io/health)
[![Llama API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/llama-3.2-3b)](https://llama.neevs.io/health)
[![Mistral API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/mistral-7b-instruct-v0.3)](https://mistral.neevs.io/health)
[![Qwen 14B API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/qwen2.5-14b-instruct)](https://qwen14b.neevs.io/health)
[![Gemma API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/gemma-2-9b-instruct)](https://gemma.neevs.io/health)

LLM inference on GitHub Actions free tier with public access via Cloudflare Tunnels.

Allows experimentation with multiple AI interaction patterns: side-by-side comparison, collaborative discussion, multi-agent orchestration, and sampling diversity.

## Overview Features

- **Zero Infrastructure Cost**: Runs on GitHub Actions free tier (unlimited minutes for public repos)
- **Multi-Model Support**: Qwen 2.5 (7B/14B), Phi-3, Llama 3.2, Mistral 7B, Gemma 2 9B
- **Model Caching**: GGUF models cached between runs for fast restarts
- **Continuous Availability**: Auto-restart with graceful handoff maintains ~99% uptime
- **Public Access**: External connectivity via Cloudflare Tunnels

## Architecture

![Architecture](architecture.png)

## Modes

### Arena
Compare model responses side-by-side with performance metrics (default mode).

### Discussion
Models collaborate through orchestrated turn-based discussions. [→ Docs](DISCUSSION_MODE.md)

### Agents
Multi-agent orchestration with tool calling (web search, code execution). [→ Docs](AGENTS.md)

### Variations
Compare direct prompting vs. verbalized sampling to explore output diversity. [→ Docs](VARIATIONS.md)

## Quick Start

**Setup overview**: Fork this repo, configure GitHub secrets and Cloudflare Tunnels, then trigger the workflows.

### 1. Configure GitHub Secrets

Add to **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `HF_TOKEN` | Hugging Face token for gated models |
| `CLOUDFLARE_TUNNEL_TOKEN_{MODEL}` | Tunnel token for each model (QWEN, PHI, LLAMA, MISTRAL, QWEN14B, GEMMA) |
| `CLOUDFLARE_TUNNEL_TOKEN_CHAT` | Tunnel token for web interface |
| `{MODEL}_API_URL` | Public URL for each model (e.g., `https://qwen.neevs.io`) |
| `GH_MODELS_TOKEN` | GitHub token for Discussion/Agents modes ([create token](https://github.com/settings/personal-access-tokens/new)) |

### 2. Create Cloudflare Tunnels

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Navigate to **Access > Tunnels**
3. Create 7 tunnels routing to `localhost:8000` (models) and `localhost:8080` (interface)
4. Copy tokens to GitHub secrets

### 3. Run Workflows

```bash
# Start each model server
gh workflow run {model}-inference.yml  # qwen, phi, llama, mistral, qwen14b, gemma

# Start web interface
gh workflow run chat-interface.yml
```

## OpenAI-Compatible API

Each model exposes standard endpoints:

```bash
curl -X POST <YOUR_MODEL_API_URL>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Explain quantum computing"}],
    "max_tokens": 512,
    "temperature": 0.7,
    "stream": true
  }'
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (streaming supported) |

## Models

| Model | Parameters | Quantization | Strengths |
|-------|------------|--------------|-----------|
| Qwen 2.5 | 7B | Q4_K_M | Code generation, multilingual tasks |
| Qwen 2.5 | 14B | Q4_K_M | Complex coding, mathematical reasoning |
| Phi-3 Mini | 3.8B | Q4_K_M | Efficient reasoning, instruction following |
| Llama 3.2 | 3B | Q4_K_M | Conversational AI, creative writing |
| Mistral 7B v0.3 | 7B | Q4_K_M | Structured output, function calling |
| Gemma 2 | 9B | Q4_K_M | Fact-checking, safety-aligned responses |

## Project Structure

```
serverless-llm/
├── .github/workflows/          # GitHub Actions workflows
├── app/
│   ├── qwen-inference/         # Qwen 7B model server
│   ├── qwen14b-inference/      # Qwen 14B model server
│   ├── phi-inference/          # Phi model server
│   ├── llama-inference/        # Llama model server
│   ├── mistral-inference/      # Mistral model server
│   ├── gemma-inference/        # Gemma model server
│   └── chat-interface/         # Web interface + proxy
└── docs/                       # Mode-specific documentation
```

## Technologies

| Component | Technology |
|-----------|------------|
| Compute | GitHub Actions |
| LLM Runtime | llama-cpp-python (GGUF) |
| API Framework | FastAPI |
| Streaming | Server-Sent Events |
| Tunneling | Cloudflare Zero Trust |
| Caching | GitHub Actions Cache (models) |
| Frontend | Vanilla JS + marked.js |

## Configuration

**Auto-Restart**: Workflows restart before GitHub's 6-hour limit:
- Default runtime: 5.5 hours
- Auto-restart triggers new workflow via repository dispatch
- ~3-5 minutes downtime during transition

**Workflow Inputs**:
- `duration_hours`: Runtime before auto-restart (default: 5.5)
- `auto_restart`: Enable auto-restart (default: true)

## Limitations

- **CPU Inference**: No GPU on GitHub-hosted runners (slower generation)
- **Brief Downtime**: ~3-5 minutes during auto-restart transitions every 5.5 hours
- **First Run**: Initial model download (~2-5 min), subsequent runs use cached models

## Local Development

```bash
# Install dependencies
pip install -r app/qwen-inference/requirements.txt

# Start model server
cd app/qwen-inference && python inference_server.py

# Start interface (separate terminal)
cd app/chat-interface
export QWEN_API_URL=http://localhost:8001
export PHI_API_URL=http://localhost:8002
export LLAMA_API_URL=http://localhost:8003
python chat_server.py
```

## License

MIT License - see [LICENSE](LICENSE)
