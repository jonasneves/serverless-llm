# Serverless LLM

[![Nanbeige API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/nanbeige4-3b-thinking)](https://nanbeige.neevs.io/health)
[![Qwen API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/qwen3-4b)](https://qwen.neevs.io/health)
[![DeepSeek R1Qwen API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/deepseek-r1-distill-qwen-1.5b)](https://r1qwen.neevs.io/health)
[![Gemma API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/gemma-3-12b-it)](https://gemma.neevs.io/health)
[![Mistral API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/mistral-7b-instruct-v0.3)](https://mistral.neevs.io/health)
[![Phi API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/phi-3-mini)](https://phi.neevs.io/health)
[![RNJ API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/rnj-1-instruct)](https://rnj.neevs.io/health)
[![Llama API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/llama-3.2-3b)](https://llama.neevs.io/health)
[![FunctionGemma API](https://img.shields.io/endpoint?url=https://chat.neevs.io/api/badge/model/functiongemma-270m-it)](https://functiongemma.neevs.io/health)

<!-- Live API Health Status -->
[![API Status](https://img.shields.io/endpoint?style=social&url=https://chat.neevs.io/api/badge/system)](https://chat.neevs.io/status)

## Overview

Free 24/7 LLM APIs using GitHub Actions and Cloudflare Tunnels.

I wanted to experiment with non-keyboard LLM interaction - the playground supports ASL fingerspelling and hand gesture navigation using webcam-based hand tracking. You can spell questions in American Sign Language, and the AI can build interactive button interfaces that you select by pointing. Also supports emoji gesture responses (thumbs up, wave, etc.).

Also runs 11 different models (270M to 12B parameters) with OpenAI-compatible API endpoints, all on free infrastructure.

### Interaction Modes

- **ASL Mode**: Fingerspell messages using American Sign Language
  - Full A-Z alphabet recognition
  - Control gestures: thumbs up (send), open palm (clear), flat hand (space), pinch (backspace)
  - View switching: peace sign (✌️) or "I love you" sign (🤟) to cycle between chat/compare/council/roundtable layouts
- **Gesture Navigation**: Respond with emoji and navigate hands-free
  - Send emoji responses: 👍 👎 👋
  - AI builds interactive button UIs (via JSON) that you select by pointing
  - Dwell selection: hover over button for 1.8s to activate
  - Scroll with closed fist, navigate with pointing finger
- **Traditional Input**: Standard text chat and model comparison views

### Infrastructure

- **Zero Cost**: Runs on GitHub Actions free tier (unlimited minutes for public repos)
- **Multi-Model**: 11 models with different strengths (see table below)
- **High Availability**: 1-3 parallel instances per model for load balancing
- **Continuous Uptime**: Auto-restart before GitHub's 6-hour limit with graceful handoff
- **Public Access**: Cloudflare Tunnels for external connectivity
- **Fast Restarts**: GGUF models cached between runs

## Architecture

![Architecture](architecture.png)

## Models

Models ranked by overall capability based on December 2025 benchmarks (MMLU-Pro, GPQA, AIME, MATH, HumanEval):

| Rank | Model | Size | Key Benchmarks | Best For |
|:-----|:------|:-----|:---------------|:---------|
| 1 | **Nanbeige4-3B-Thinking** | 3B | AIME 2024: 90.4%, GPQA-Diamond: 82.2% (outperforms Qwen3-32B) | Step-by-step reasoning, complex math, competitive programming |
| 2 | **Qwen3-4B-Instruct-2507** | 4B | MMLU-Pro: 69.6%, GPQA: 62.0%, 262K context, 119 languages | Multilingual tasks, long-context analysis, agent workflows |
| 3 | **DeepSeek R1 1.5B** | 1.5B | AIME 2024: 28.9%, MATH-500: 83.9%, Codeforces: 954 rating | Math reasoning, algorithmic problems, code generation |
| 4 | **Gemma 3 12B** | 12B | Safety-aligned IT checkpoint, stronger instruction following, ~8K context | Fact-checking, educational content, safe generation |
| 5 | **Mistral 7B v0.3** | 7B | MMLU: 63%, 32K context, native function calling | JSON generation, tool use, structured output |
| 6 | **Phi-3 Mini** | 3.8B | MMLU: 69%, 4K context, trained on 3.3T tokens | Logic puzzles, efficient inference, mobile deployment |
| 7 | **RNJ-1 Instruct** | 8B | SWE-Bench Verified: 20.8%, strong tool-use (BFCL ranked) | Code automation, agentic workflows, tool calling |
| 8 | **Llama 3.2 3B** | 3B | MMLU: 63.4%, 128K context, multilingual (8 languages) | Casual conversation, summarization, creative writing |
| 9 | **FunctionGemma 270M** | 270M | Edge-optimized (50 t/s on Pixel 8), 240MB RAM (Q4), 32K context | Edge device agents, mobile actions, offline function calling |
| 10 | **Nemotron-3 Nano 30B** | 30B MoE (~3.5B active) | Mamba2+Transformer hybrid, reasoning traces | Unique MoE architecture, experimental (slow on CPU) |
| 11 | **GPT-OSS 20B** | 20B MoE (~3.6B active) | Function calling, agentic operations | Experimental MoE, agent operations (slow on CPU) |

### Sources

| Model | Source |
|:------|:-------|
| Nanbeige4-3B-Thinking | [arXiv](https://arxiv.org/abs/2411.xxxxx), [Hugging Face](https://huggingface.co/Nanbeige/Nanbeige4-3B-Thinking-2511), [MarkTechPost](https://www.marktechpost.com/) |
| Qwen3-4B-Instruct-2507 | [Hugging Face Model Card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) |
| DeepSeek R1 1.5B | [OpenRouter](https://openrouter.ai/), [DataCamp](https://www.datacamp.com/) |
| Gemma 3 12B | [Google Blog](https://blog.google/), [Unsloth](https://huggingface.co/unsloth/gemma-3-12b-it-GGUF) |
| Mistral 7B v0.3 | [Mistral AI](https://mistral.ai/), [Hugging Face](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3) |
| Phi-3 Mini | [arXiv](https://arxiv.org/abs/2404.xxxxx), [Microsoft](https://www.microsoft.com/) |
| RNJ-1 Instruct | [Hugging Face](https://huggingface.co/EssentialAI/rnj-1-instruct), [Ollama](https://ollama.com/) |
| Llama 3.2 3B | [NVIDIA](https://developer.nvidia.com/), [Meta](https://huggingface.co/meta-llama/) |
| FunctionGemma 270M | [Google Blog](https://developers.googleblog.com/), [Unsloth](https://docs.unsloth.ai/models/functiongemma) |

## Quick Start

**Setup overview**: Fork this repo, configure GitHub secrets and Cloudflare Tunnels, then trigger the workflows.

### 1. Configure GitHub Secrets

Add to **Settings > Secrets and variables > Actions**:

**Required:**
| Secret | Description |
|--------|-------------|
| `HF_TOKEN` | Hugging Face token for downloading gated models |
| `TUNNELS_JSON` | JSON containing all tunnel configurations (generated by `make setup-tunnels`) |
| `WORKFLOW_PAT` | GitHub Personal Access Token with `repo` scope (for auto-restart) |

**Optional:**
| Secret | Description |
|--------|-------------|
| `BASE_DOMAIN` | Your domain (e.g., `neevs.io`) - used by chat to construct model URLs |
| `{MODEL}_API_URL` | Override model endpoint URLs (e.g., `QWEN_API_URL=https://qwen.neevs.io`). If `BASE_DOMAIN` is set, these are auto-constructed. |
| `GH_MODELS_TOKEN` | GitHub token for Discussion/Agents/Council modes. Uses free quota by default. [Create your own](https://github.com/settings/personal-access-tokens/new) for dedicated quota. |
| `CLOUDFLARE_TUNNEL_TOKEN_CHAT` | **Legacy fallback** for chat tunnel (not needed if using `TUNNELS_JSON`) |


### 2. Create Cloudflare Tunnels

**Automated (Recommended):**
1. Add GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
2. Run: `python scripts/setup_tunnels.py --domain yourdomain.com`
3. Copy output JSON to GitHub Secret: `TUNNELS_JSON`

**Manual:**
Create tunnels in Cloudflare Zero Trust dashboard and add tokens to GitHub Secrets.

See [Tunnel Automation](.docs/TUNNEL_AUTOMATION.md) for details.

## API

### Endpoints

Each model exposes OpenAI-compatible endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check and model status |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completion (streaming supported) |

### Example Request

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

### Performance Debugging

- Check runtime settings via `GET /health/details` (includes `n_ctx`, `n_threads`, `n_batch`, `max_concurrent`)
- Add `"include_perf": true` to `/v1/chat/completions` to return queue/compute timing (and TTFT for streaming)
- Compare models with `python3 scripts/bench_models.py --models qwen phi llama --stream --include-perf`

## Project Structure

```
serverless-llm/
├── .github/workflows/          # GitHub Actions workflows for each model + interface
├── app/
│   ├── nanbeige-inference/     # Nanbeige4-3B-Thinking model server
│   ├── qwen-inference/         # Qwen3-4B-Instruct-2507 model server
│   ├── deepseek-r1qwen-inference/ # DeepSeek R1 Qwen 1.5B model server
│   ├── gemma-inference/        # Gemma 3 12B model server
│   ├── mistral-inference/      # Mistral 7B model server
│   ├── phi-inference/          # Phi-3 Mini model server
│   ├── rnj-inference/          # RNJ-1 Instruct model server
│   ├── llama-inference/        # Llama 3.2 3B model server
│   ├── functiongemma-inference/ # FunctionGemma 270M model server
│   ├── nemotron-inference/     # Nemotron-3 Nano 30B MoE model server
│   ├── gpt-oss-inference/      # GPT-OSS 20B MoE model server
│   └── chat/                   # Web interface + API proxy
├── config/                     # Centralized configuration
│   ├── inference.yaml          # Model inference settings (n_ctx, threads, etc.)
│   └── models.py               # Model ports and metadata
├── scripts/                    # Automation scripts
│   ├── setup_tunnels.py        # Cloudflare tunnel automation
│   └── get_tunnel_token.py     # Token retrieval utility
└── README.md
```

## Technologies

| Component | Technology |
|-----------|------------|
| Compute | GitHub Actions (ARM64 runners, 4 vCPU, 16GB RAM) |
| LLM Runtime | llama-cpp-python (GGUF) |
| API Framework | FastAPI |
| Streaming | Server-Sent Events |
| Tunneling | Cloudflare Zero Trust |
| Caching | GitHub Actions Cache (models) |
| Frontend | React + TypeScript |
| Hand Tracking | MediaPipe + fingerpose (ASL recognition) |

## Configuration

**Centralized Config**: All inference settings are managed in `config/inference.yaml`:
- `n_ctx`: Context window size (default: 4096)
- `n_threads`: CPU threads (default: 4, matches runner vCPUs)
- `n_batch`: Batch size (default: 256)
- `max_concurrent`: Parallel requests per instance (default: 2)

**High Availability**: Run multiple parallel instances per model:
- Each workflow supports 1-3 concurrent instances
- Cloudflare Tunnels load-balance across active instances
- Zero-downtime during restarts with multiple instances

**Auto-Restart**: Workflows restart before GitHub's 6-hour limit:
- Default runtime: 5.5 hours
- Auto-restart triggers new workflow via repository dispatch
- New instance starts before old one stops (graceful handoff)

## Local Development

Run models and the web interface locally without GitHub Actions.

### Prerequisites

```bash
pip install -r app/qwen-inference/requirements.txt
```

### Port Scheme (Local Development)

For local development with multiple models on the same machine:

| Range | Category | Models |
|-------|----------|--------|
| 8080 | Core | Chat Interface |
| 81XX | Small (<7B) | qwen (8100), phi (8101), functiongemma (8103) |
| 82XX | Medium (7B-30B) | gemma (8200), llama (8201), mistral (8202), rnj (8203) |
| 83XX | Reasoning | r1qwen (8300), nanbeige (8301), nemotron (8302), gptoss (8303) |

GitHub Actions uses port 8000 for all inference models (each runs on a separate runner).

See `config/models.py` for the authoritative configuration.

### Start a Model Server

```bash
cd app/qwen-inference
python inference_server.py  # Runs on port 8100
```

### Start the Web Interface

```bash
cd app/chat
export QWEN_API_URL=http://localhost:8100
export GH_MODELS_TOKEN=ghp_xxxxxxxxxxxxx  # Optional
python chat_server.py  # Runs on port 8080
```

### Run with Docker Compose

```bash
# Chat interface only
docker-compose up

# Chat + specific models
docker-compose --profile qwen --profile phi up

# All services
docker-compose --profile all up
```

## Limitations

- **CPU Inference**: No GPU on GitHub-hosted runners (slower generation, ~10-50 tokens/sec depending on model)
- **Brief Downtime**: ~3-5 minutes during auto-restart (only with single instance; eliminated with 2+ instances)
- **First Run**: Initial model download (~2-5 min), subsequent runs use cached models

## License

MIT License - see [LICENSE](LICENSE) for details
