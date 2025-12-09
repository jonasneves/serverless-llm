# Serverless LLM

[![Qwen API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/qwen3-4b)](https://qwen.neevs.io/health)
[![DeepSeek R1Qwen API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/deepseek-r1-distill-qwen-1.5b)](https://r1qwen.neevs.io/health)
[![Gemma API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/gemma-2-9b-instruct)](https://gemma.neevs.io/health)
[![Mistral API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/mistral-7b-instruct-v0.3)](https://mistral.neevs.io/health)
[![Phi API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/phi-3-mini)](https://phi.neevs.io/health)
[![Llama API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/llama-3.2-3b)](https://llama.neevs.io/health)

## Overview

Free, serverless, multi-model chat powered only by GitHub Actions + Cloudflare

Allows experimentation with multiple AI interaction patterns: side-by-side comparison, collaborative discussion, multi-agent orchestration, and output variations.

- **Zero Infrastructure Cost**: Runs on GitHub Actions free tier (unlimited minutes for public repos)
- **Multi-Model Support**: 7 models ranked by capability (see table below)
- **High Availability**: Run 1-3 parallel instances per model for zero-downtime restarts and load balancing
- **Model Caching**: GGUF models cached between runs for fast restarts
- **Continuous Availability**: Auto-restart with graceful handoff
- **Public Access**: External connectivity via Cloudflare Tunnels

## Models

Models ranked by overall capability based on Dec 2025 benchmarks (MMLU-Pro, GPQA, MATH, HumanEval):

| Rank | Model | Size | Key Strengths | Best For |
|:-----|:------|:-----|:--------------|:---------|
| 1 | **Qwen3 4B** | 4B | Multilingual (119 langs), long-context (1M tokens), reasoning, coding, agent capabilities | Complex reasoning, code generation, agent tasks |
| 2 | **DeepSeek R1 1.5B** | 1.5B | Math/reasoning (o1-preview level), efficient CoT, coding (96.3% Codeforces) | Step-by-step reasoning, math problems, algorithms |
| 3 | **Gemma 2 9B** | 9B | On-device efficiency, reasoning, responsible AI, safety-aligned | Fact-checking, educational content, safe generation |
| 4 | **Mistral 7B v0.3** | 7B | Instruction-following, structured output, function calling | JSON generation, tool use, task decomposition |
| 5 | **Phi-3 Mini** | 3.8B | Compact reasoning, synthetic data efficiency, instruction following | Logic puzzles, moderate difficulty tasks |
| 6 | **RNJ-1 Instruct** | 8B | Tool-calling, agentic capabilities (70% SWE-Bench) | Automation workflows, tool use |
| 7 | **Llama 3.2 3B** | 3B | Lightweight chat, creative writing, long context (131K) | Casual conversation, summarization, storytelling |

## Architecture

![Architecture](architecture.png)

## Quick Start

**Setup overview**: Fork this repo, configure GitHub secrets and Cloudflare Tunnels, then trigger the workflows.

### 1. Configure GitHub Secrets

Add to **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `HF_TOKEN` | Hugging Face token for gated models |
| `CLOUDFLARE_TUNNEL_TOKEN_{MODEL}` | Tunnel token for each model (QWEN, PHI, LLAMA, MISTRAL, GEMMA, R1QWEN) |
| `CLOUDFLARE_TUNNEL_TOKEN_CHAT` | Tunnel token for web interface |
| `{MODEL}_API_URL` | Public URL for each model (e.g., `https://qwen.neevs.io`) |
| `GH_MODELS_TOKEN` | GitHub token for Discussion/Agents modes ([create token](https://github.com/settings/personal-access-tokens/new)) |

### 2. Create Cloudflare Tunnels

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. Navigate to **Access > Tunnels**
3. Create tunnels for each model and the interface (route to `localhost:8000` for models and `localhost:8080` for the interface)
4. Copy tokens to GitHub secrets

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

**High Availability**: Run multiple parallel instances per model:
- Each workflow supports 1-3 concurrent instances
- Cloudflare Tunnels load-balance across active instances
- Zero-downtime during restarts with multiple instances

**Auto-Restart**: Workflows restart before GitHub's 6-hour limit:
- Default runtime: 5.5 hours
- Auto-restart triggers new workflow via repository dispatch
- New instance starts before old one stops (graceful handoff)

## Limitations

- **CPU Inference**: No GPU on GitHub-hosted runners (slower generation)
- **Brief Downtime**: ~3-5 minutes during auto-restart (only with single instance; eliminated with 2+ instances)
- **First Run**: Initial model download (~2-5 min), subsequent runs use cached models
