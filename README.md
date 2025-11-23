# serverless-llm

Run LLM inference servers on GitHub Actions with Cloudflare Tunnel exposure. This project provides serverless infrastructure for running Qwen2.5-14B, Phi-3-medium, and Llama 3.2-8B models with a unified chat interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions Runners                    │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Qwen Workflow  │  Phi Workflow   │  Llama Workflow         │
│  (Port 8000)    │  (Port 8000)    │  (Port 8000)            │
└────────┬────────┴────────┬────────┴────────┬────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    Cloudflare Tunnels
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   qwen.your.domain  phi.your.domain  llama.your.domain
                           │
                           ▼
                  ┌─────────────────┐
                  │  Chat Interface │
                  │   (Port 8080)   │
                  └────────┬────────┘
                           │
                    Cloudflare Tunnel
                           │
                           ▼
                  chat.your.domain
```

## Workflows

| Workflow | Model | Description |
|----------|-------|-------------|
| `qwen-inference.yml` | Qwen 2.5-14B Instruct | Alibaba's Qwen model |
| `phi-inference.yml` | Phi-3 Medium 4K | Microsoft's Phi-3 model |
| `llama-inference.yml` | Llama 3.2-8B Instruct | Meta's Llama model |
| `chat-interface.yml` | - | Web UI for all models |

## Quick Start

### 1. Set up GitHub Secrets

Go to your repository **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|--------|-------------|
| `HF_TOKEN` | Hugging Face API token (required for gated models like Llama) |
| `CLOUDFLARE_TUNNEL_TOKEN_QWEN` | Cloudflare tunnel token for Qwen server |
| `CLOUDFLARE_TUNNEL_TOKEN_PHI` | Cloudflare tunnel token for Phi server |
| `CLOUDFLARE_TUNNEL_TOKEN_LLAMA` | Cloudflare tunnel token for Llama server |
| `CLOUDFLARE_TUNNEL_TOKEN_CHAT` | Cloudflare tunnel token for chat interface |
| `QWEN_API_URL` | Public URL for Qwen API (e.g., `https://qwen.your.domain`) |
| `PHI_API_URL` | Public URL for Phi API |
| `LLAMA_API_URL` | Public URL for Llama API |

### 2. Create Cloudflare Tunnels

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access > Tunnels**
3. Create 4 tunnels (one for each service)
4. Configure each tunnel to route to `http://localhost:PORT`:
   - Model servers: `http://localhost:8000`
   - Chat interface: `http://localhost:8080`
5. Copy the tunnel tokens to GitHub secrets

### 3. Run the Workflows

#### Option A: GitHub UI

1. Go to **Actions** tab in your repository
2. Select the workflow you want to run
3. Click **Run workflow**
4. Configure options and click **Run workflow**

#### Option B: GitHub CLI

```bash
# Start Qwen inference server
gh workflow run qwen-inference.yml

# Start Phi inference server
gh workflow run phi-inference.yml

# Start Llama inference server
gh workflow run llama-inference.yml

# Start chat interface (after model servers are running)
gh workflow run chat-interface.yml \
  -f qwen_api_url=https://qwen.your.domain \
  -f phi_api_url=https://phi.your.domain \
  -f llama_api_url=https://llama.your.domain
```

## API Endpoints

Each model server exposes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | OpenAI-compatible chat completion |
| `/generate` | POST | Simple text generation |

### Example API Call

```bash
curl -X POST https://qwen.your.domain/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 512,
    "temperature": 0.7
  }'
```

## Chat Interface

The chat interface provides a web UI to interact with all three models:

- Select model from dropdown
- Adjust temperature and max tokens
- View conversation history
- Real-time model status indicators

Access at: `https://chat.your.domain` (or your configured domain)

## Configuration Options

### Workflow Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `duration_hours` | 5.5 | How long to run (max 5.5 hours) |
| `auto_restart` | true | Auto-restart before GitHub timeout |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_NAME` | Model-specific | Hugging Face model ID |
| `USE_4BIT` | true | Use 4-bit quantization |
| `PORT` | 8000/8080 | Server port |

## Important Notes

### Resource Requirements

- **GPU**: These models require GPU for reasonable performance. Standard GitHub Actions runners are CPU-only.
- **Memory**: 14B models need ~32GB RAM even with 4-bit quantization
- **Self-hosted runners**: For production use, configure self-hosted runners with GPUs

### Limitations

1. **GitHub Actions timeout**: Maximum 6 hours per job
2. **CPU inference**: Very slow without GPU (minutes per response)
3. **No persistent storage**: Models are downloaded each run (cached when possible)

### Model Access

- **Llama 3.2**: Requires accepting Meta's license on Hugging Face
- **Qwen 2.5**: Publicly available
- **Phi-3**: Publicly available

## Project Structure

```
serverless-llm/
├── .github/
│   └── workflows/
│       ├── qwen-inference.yml
│       ├── phi-inference.yml
│       ├── llama-inference.yml
│       └── chat-interface.yml
├── app/
│   ├── qwen-inference/
│   │   ├── inference_server.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   ├── phi-inference/
│   │   ├── inference_server.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   ├── llama-inference/
│   │   ├── inference_server.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── chat-interface/
│       ├── chat_server.py
│       ├── requirements.txt
│       └── Dockerfile
├── EXAMPLES/
│   ├── LIVE-SERVER.md
│   └── live-server.yml
└── README.md
```

## Auto-Restart Feature

The workflows automatically restart before GitHub's 6-hour timeout to maintain continuous availability:

1. Default runtime: 5.5 hours
2. 5 minutes before timeout, triggers a repository dispatch event
3. New workflow run starts automatically
4. Brief downtime (~3-5 minutes) during restart

Disable by setting `auto_restart: false` when running the workflow.

## Local Development

Run the servers locally:

```bash
# Install dependencies
pip install -r app/qwen-inference/requirements.txt

# Start a model server
cd app/qwen-inference
python inference_server.py

# Start chat interface
cd app/chat-interface
export QWEN_API_URL=http://localhost:8000
python chat_server.py
```

## License

MIT
