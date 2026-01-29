# Serverless LLM

<!-- Live API Health Status -->
[![API Status](https://img.shields.io/endpoint?style=social&url=https://chat.neevs.io/api/badge/system)](https://chat.neevs.io/status)

## Overview

Self-hosted LLM inference platform serving 15 models (270M to 12B parameters) with OpenAI-compatible APIs. Experimental testbed for gesture-based interaction, AI-generated UIs, and multi-model collaboration modes (discussion, council, roundtable).

## Models

Models ranked by overall capability based on December 2025 benchmarks (MMLU-Pro, GPQA, AIME, MATH, HumanEval):

| Rank | Model | Size | Key Benchmarks | Best For |
|:-----|:------|:-----|:---------------|:---------|
| 1 | **Nanbeige4-3B-Thinking** | 3B | AIME 2024: 90.4%, GPQA-Diamond: 82.2% (outperforms Qwen3-32B) | Step-by-step reasoning, complex math, competitive programming |
| 2 | **DASD-4B Thinking** | 4B | Reasoning with thinking capabilities | Step-by-step reasoning, problem solving |
| 2 | **Qwen3-4B-Instruct-2507** | 4B | MMLU-Pro: 69.6%, GPQA: 62.0%, 262K context, 119 languages | Multilingual tasks, long-context analysis, agent workflows |
| 3 | **AgentCPM-Explore 4B** | 4B | Autonomous task exploration, agentic operations | Autonomous exploration, task planning |
| 3 | **SmolLM3 3B** | 3B | AIME 2025: 36.7%, BFCL: 92.3%, 64K context, hybrid reasoning | Tool-calling, reasoning with /think mode, multilingual (6 langs) |
| 4 | **LFM2.5 1.2B** | 1.2B | 8 languages, 32K context, hybrid LFM2 architecture, RL tuning | Edge deployment, instruction following, multilingual |
| 5 | **DeepSeek R1 1.5B** | 1.5B | AIME 2024: 28.9%, MATH-500: 83.9%, Codeforces: 954 rating | Math reasoning, algorithmic problems, code generation |
| 6 | **Gemma 3 12B** | 12B | Safety-aligned IT checkpoint, stronger instruction following, ~8K context | Fact-checking, educational content, safe generation |
| 7 | **Mistral 7B v0.3** | 7B | MMLU: 63%, 32K context, native function calling | JSON generation, tool use, structured output |
| 8 | **Phi-4 Mini** | 3.8B | GSM8K: 88.6%, 128K context, 22 languages, function calling | Math reasoning, multilingual, tool use |
| 9 | **RNJ-1 Instruct** | 8B | SWE-Bench Verified: 20.8%, strong tool-use (BFCL ranked) | Code automation, agentic workflows, tool calling |
| 10 | **Llama 3.2 3B** | 3B | MMLU: 63.4%, 128K context, multilingual (8 languages) | Casual conversation, summarization, creative writing |
| 11 | **FunctionGemma 270M** | 270M | Edge-optimized (50 t/s on Pixel 8), 240MB RAM (Q4), 32K context | Edge device agents, mobile actions, offline function calling |
| 12 | **GPT-OSS 20B** | 20B MoE (~3.6B active) | Function calling, agentic operations | Experimental MoE, agent operations (slow on CPU) |

### Sources

| Model | Source |
|:------|:-------|
| Nanbeige4-3B-Thinking | [arXiv](https://arxiv.org/abs/2411.xxxxx), [Hugging Face](https://huggingface.co/Nanbeige/Nanbeige4-3B-Thinking-2511), [MarkTechPost](https://www.marktechpost.com/) |
| DASD-4B Thinking | [Hugging Face](https://huggingface.co/mradermacher/DASD-4B-Thinking-GGUF) |
| Qwen3-4B-Instruct-2507 | [Hugging Face Model Card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) |
| AgentCPM-Explore 4B | [Hugging Face](https://huggingface.co/openbmb/AgentCPM-Explore-GGUF) |
| SmolLM3 3B | [Hugging Face](https://huggingface.co/HuggingFaceTB/SmolLM3-3B), [Blog](https://hf.co/blog/smollm3) |
| LFM2.5 1.2B | [Liquid AI Docs](https://docs.liquid.ai/lfm), [Hugging Face](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF), [Playground](https://playground.liquid.ai/) |
| DeepSeek R1 1.5B | [OpenRouter](https://openrouter.ai/), [DataCamp](https://www.datacamp.com/) |
| Gemma 3 12B | [Google Blog](https://blog.google/), [Unsloth](https://huggingface.co/unsloth/gemma-3-12b-it-GGUF) |
| Mistral 7B v0.3 | [Mistral AI](https://mistral.ai/), [Hugging Face](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3) |
| Phi-4 Mini | [Hugging Face](https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF), [Microsoft](https://www.microsoft.com/) |
| RNJ-1 Instruct | [Hugging Face](https://huggingface.co/EssentialAI/rnj-1-instruct), [Ollama](https://ollama.com/) |
| Llama 3.2 3B | [NVIDIA](https://developer.nvidia.com/), [Meta](https://huggingface.co/meta-llama/) |
| FunctionGemma 270M | [Google Blog](https://developers.googleblog.com/), [Unsloth](https://docs.unsloth.ai/models/functiongemma) |

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
├── .github/workflows/          # CI/CD workflows
├── app/
│   ├── shared/                 # Shared inference server (base code for all models)
│   ├── lfm2-inference/         # LFM2.5 model config (native llama-server)
│   ├── rnj-inference/          # RNJ model config (native llama-server)
│   └── chat/                   # Web interface + API proxy
├── config/
│   └── models.py               # Model ports, metadata, and inference settings
├── scripts/                    # Automation scripts
└── README.md
```

## Configuration

**Centralized Config**: All model and inference settings are managed in `config/models.py`:
- `n_ctx`: Context window size (default: 4096)
- `n_threads`: CPU threads (default: 4)
- `n_batch`: Batch size (default: 256)
- `max_concurrent`: Parallel requests per instance (default: 2)

## Local Development

Run models and the web interface locally.

### Prerequisites

```bash
pip install -r app/qwen-inference/requirements.txt
```

### Port Scheme (Local Development)

For local development with multiple models on the same machine:

| Range | Category | Models |
|-------|----------|--------|
| 8080 | Core | Chat Interface |
| 81XX | Small (<7B) | qwen (8100), phi (8101), functiongemma (8103), smollm3 (8104), lfm2 (8105), dasd (8106), agentcpm (8107) |
| 82XX | Medium (7B-30B) | gemma (8200), llama (8201), mistral (8202), rnj (8203) |
| 83XX | Reasoning | r1qwen (8300), nanbeige (8301), gptoss (8303) |

Production deployment uses port 8000 for all inference models (each runs in a separate container).

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

## License

MIT License - see [LICENSE](LICENSE) for details
