# Serverless LLM Arena

<!-- Live API Health Status -->
[![API Status](https://img.shields.io/endpoint?style=social&url=https://chat.neevs.io/api/badge/system)](https://chat.neevs.io/status)

[![Qwen API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/qwen2.5-7b)](https://qwen.neevs.io/health)
[![Phi API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/phi-3-mini)](https://phi.neevs.io/health)
[![Llama API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/llama-3.2-3b)](https://llama.neevs.io/health)
[![Mistral API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/mistral-7b-instruct-v0.3)](https://mistral.neevs.io/health)
[![Qwen 14B API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/qwen2.5-14b-instruct)](https://qwen14b.neevs.io/health)
[![Gemma API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/gemma-2-9b-instruct)](https://gemma.neevs.io/health)

<!-- GitHub Actions Workflow Status -->
<details>
<summary>Deployment Status (GitHub Actions)</summary>

[![Chat Interface](https://github.com/jonasneves/serverless-llm/actions/workflows/chat-interface.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/chat-interface.yml)
[![Qwen Inference](https://github.com/jonasneves/serverless-llm/actions/workflows/qwen-inference.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/qwen-inference.yml)
[![Phi Inference](https://github.com/jonasneves/serverless-llm/actions/workflows/phi-inference.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/phi-inference.yml)
[![Llama Inference](https://github.com/jonasneves/serverless-llm/actions/workflows/llama-inference.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/llama-inference.yml)
[![Mistral Inference](https://github.com/jonasneves/serverless-llm/actions/workflows/mistral-inference.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/mistral-inference.yml)
[![Qwen 14B Inference](https://github.com/jonasneves/serverless-llm/actions/workflows/qwen14b-inference.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/qwen14b-inference.yml)
[![Gemma Inference](https://github.com/jonasneves/serverless-llm/actions/workflows/gemma-inference.yml/badge.svg)](https://github.com/jonasneves/serverless-llm/actions/workflows/gemma-inference.yml)

</details>

**LLM inference on GitHub Actions free tier with public access via Cloudflare Tunnels.**

Experiment with multiple AI interaction patterns: side-by-side comparison, collaborative discussion, multi-agent orchestration, and sampling diversity.

## Overview

- **Zero Infrastructure Cost**: Runs on GitHub Actions free tier
- **Multi-Model Support**: Qwen 2.5 (7B/14B), Phi-3, Llama 3.2, Mistral 7B, Gemma 2 9B
- **Real-Time Streaming**: Server-Sent Events for live responses
- **Public Access**: Cloudflare Tunnels for external connectivity
- **Auto-Restart**: Maintains availability across GitHub's 6-hour limit

## Architecture

![Architecture](architecture.png)

## Modes

### Arena
Compare model responses side-by-side with performance metrics.

### Discussion
Models collaborate through orchestrated turn-based discussions. [→ Docs](DISCUSSION_MODE.md)

### Agents
Multi-agent orchestration with tool calling (web search, code execution). [→ Docs](AGENTS.md)

### Variations
Compare direct prompting vs. verbalized sampling to explore output diversity. [→ Docs](VARIATIONS.md)

## Quick Start

### 1. Configure GitHub Secrets

Add to **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `HF_TOKEN` | Hugging Face token for gated models |
| `CLOUDFLARE_TUNNEL_TOKEN_QWEN` | Tunnel token for Qwen 7B server |
| `CLOUDFLARE_TUNNEL_TOKEN_PHI` | Tunnel token for Phi server |
| `CLOUDFLARE_TUNNEL_TOKEN_LLAMA` | Tunnel token for Llama server |
| `CLOUDFLARE_TUNNEL_TOKEN_MISTRAL` | Tunnel token for Mistral server |
| `CLOUDFLARE_TUNNEL_TOKEN_QWEN14B` | Tunnel token for Qwen 14B server |
| `CLOUDFLARE_TUNNEL_TOKEN_GEMMA` | Tunnel token for Gemma server |
| `CLOUDFLARE_TUNNEL_TOKEN_CHAT` | Tunnel token for web interface |
| `QWEN_API_URL` | Public URL (e.g., `https://qwen.neevs.io`) |
| `PHI_API_URL` | Public URL for Phi |
| `LLAMA_API_URL` | Public URL for Llama |
| `MISTRAL_API_URL` | Public URL for Mistral |
| `QWEN14B_API_URL` | Public URL for Qwen 14B |
| `GEMMA_API_URL` | Public URL for Gemma |
| `GH_MODELS_TOKEN` | GitHub token for Discussion/Agents modes ([create token](https://github.com/settings/personal-access-tokens/new)) |

### 2. Create Cloudflare Tunnels

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Navigate to **Access > Tunnels**
3. Create 7 tunnels routing to `localhost:8000` (models) and `localhost:8080` (interface)
4. Copy tokens to GitHub secrets

### 3. Run Workflows

```bash
gh workflow run qwen-inference.yml
gh workflow run phi-inference.yml
gh workflow run llama-inference.yml
gh workflow run mistral-inference.yml
gh workflow run qwen14b-inference.yml
gh workflow run gemma-inference.yml
gh workflow run chat-interface.yml
```

## OpenAI-Compatible API

Each model exposes standard endpoints:

```bash
curl -X POST https://qwen.neevs.io/v1/chat/completions \
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
| Qwen 2.5 | 7B | Q4_K_M | General purpose, coding |
| Qwen 2.5 | 14B | Q4_K_M | Advanced math, complex coding |
| Phi-3 Mini | 3.8B | Q4_K_M | Reasoning, instruction following |
| Llama 3.2 | 3B | Q4_K_M | Chat, creative writing |
| Mistral 7B v0.3 | 7B | Q4_K_M | Instruction following, structured output |
| Gemma 2 | 9B | Q4_K_M | Reasoning, safety, fact-checking |

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
- **6-Hour Limit**: Maximum job duration
- **Cold Start**: Model download on each run (~2-5 min)
- **Rate Limits**: GitHub Actions usage limits apply

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
