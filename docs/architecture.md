# Architecture

## How it works

```
GitHub Actions runner
  └── Docker: inference server (llama-cpp-python or llama-server)
        └── cloudflared quick tunnel → <random>.trycloudflare.com
              └── registered in tunnel-registry Worker

GitHub Pages (static frontend)
  └── fetches active tunnel URLs from tunnel-registry Worker
  └── streams chat directly to inference servers
```

- **Inference**: each `make inference MODEL=<name>` triggers a workflow on `ubuntu-24.04-arm`. The runner downloads the model from Hugging Face, starts the server, opens a Cloudflare quick tunnel, and registers its URL with the tunnel-registry Worker.
- **Frontend**: static Vite + React app. No backend — calls inference servers and GitHub Models API directly.
- **Tunnel registry**: a Cloudflare Worker at `tunnel-registry.jonasneves.workers.dev` maps model names to their currently-active tunnel URLs.

## Project Structure

```
├── .github/workflows/
│   ├── inference.yml                          # Dispatch: reads config, calls reusable workflow
│   ├── reusable-inference-containerized.yml   # Core: pull image, run server, start tunnel, monitor
│   ├── build-push-images.yml                  # Build and push Docker images to GHCR
│   └── deploy.yml                             # Deploy frontend to GitHub Pages
├── app/
│   ├── shared/                                # Dockerfiles + shared entry points (read MODEL_NAME)
│   ├── tunnel-registry/                       # Cloudflare Worker: active tunnel URL registry
│   └── chat/frontend/                         # Vite + React frontend
├── config/
│   └── models.py                              # Single source of truth: ports, HF repos, inference settings
└── scripts/
    ├── sync_worker_config.py                  # Regenerate Worker ROUTE_MAP from models.py
    ├── sync_workflow_choices.py               # Regenerate inference.yml model choices from models.py
    ├── sync_readme_models.py                  # Regenerate README model table from models.py
    └── update_github_models.py                # Refresh GitHub Models catalog
```

## Configuration

All model settings live in `config/models.py`:

| Field | Description |
|-------|-------------|
| `hf_repo` / `hf_file` | Hugging Face GGUF source |
| `n_ctx` | Context window (default: 4096) |
| `n_threads` | CPU threads (default: 4) |
| `n_batch` | Batch size (default: 256) |
| `max_concurrent` | Parallel requests (default: 2) |

## API

The tunnel registry at `tunnel-registry.jonasneves.workers.dev` exposes a unified OpenAI-compatible gateway over the entire fleet. No auth required.

```bash
# List online models
curl https://tunnel-registry.jonasneves.workers.dev/v1/models

# Chat with a specific model
curl -X POST https://tunnel-registry.jonasneves.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma", "messages": [{"role": "user", "content": "Hello"}]}'

# Auto-route to the best model for the task
curl -X POST https://tunnel-registry.jonasneves.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Write a binary search in Python"}]}'
```

Streaming is supported — set `"stream": true`. If a model is offline the response is `503`.

### Auto-routing

`"model": "auto"` classifies the prompt and routes to the best available model:

| Category | Preferred models |
|---|---|
| `coding` | jancode |
| `reasoning` | nanbeige, phireasoning, falcon, qwenclaude27b |
| `function_calling` | smollm3, gptoss, rnj |
| `general` | qwen, qwen7b, lfm2 |

Falls back to any available model if routing fails.

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://tunnel-registry.jonasneves.workers.dev/v1",
    api_key="unused",
)
response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Explain transformers"}],
)
print(response.choices[0].message.content)
```

### Per-model tunnel API

Each inference server also exposes its own OpenAI-compatible API directly at its tunnel URL. Tunnel URLs are ephemeral — fetch the current URL from `GET /tunnel/{model}` first.

Add `"include_perf": true` to get queue/compute timing in the response.
