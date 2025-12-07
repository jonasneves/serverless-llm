# GitHub Container Registry (GHCR) Setup

This repository uses GitHub Container Registry to store pre-built Docker images for inference servers, significantly reducing startup time and compute costs.

## How It Works

### 1. Build and Push Workflow
**File:** `.github/workflows/build-push-images.yml`

- **Triggers:**
  - Automatically on push to `main` when relevant files change:
    - `app/shared/**` (rebuilds all models)
    - `app/*/Dockerfile`
    - `app/*/requirements.txt`
    - `app/*/inference_server.py`
  - Manually via `workflow_dispatch` (can specify which models to build)

- **Smart Change Detection:**
  - Only builds models whose files have changed
  - If `shared/` changes, rebuilds all models
  - Manual trigger allows building specific models or all

- **Image Tags:**
  - `latest` - latest build from main branch
  - `main-{git-sha}` - specific commit SHA for versioning

### 2. Inference Workflows
**File:** `.github/workflows/reusable-inference-containerized.yml`

- **Pull from GHCR first** (fast startup ~30s)
  - Images stored at: `ghcr.io/jonasneves/serverless-llm/{model}-inference:latest`

- **Fallback to local build** if pull fails
  - Ensures workflows still work even if GHCR is unavailable
  - Uses GitHub Actions cache for faster builds

## Benefits

### Speed
- **Before:** 3-5 minutes to build inference server (compile llama-cpp-python)
- **After:** ~30 seconds to pull pre-built image
- **Impact:** Faster auto-restarts, less downtime

### Cost Efficiency
- Fewer billable compute minutes in GitHub Actions
- Build once, use many times (especially with multiple instances)

### Reliability
- Pre-built images are tested and verified
- Consistent environment across runs
- Can rollback to specific SHA if needed

## Available Images

Current inference servers with GHCR support:
- `deepseek-r1qwen-inference` - DeepSeek R1 Distill Qwen 1.5B
- `qwen-inference` - Qwen3-4B
- `phi-inference` - Microsoft Phi-3
- `llama-inference` - Llama 3.2 3B
- `rnj-inference` - RNJ-1 Instruct

## Usage

### Pull Images Locally
```bash
# Pull latest image
docker pull ghcr.io/jonasneves/serverless-llm/deepseek-r1qwen-inference:latest

# Pull specific version
docker pull ghcr.io/jonasneves/serverless-llm/deepseek-r1qwen-inference:main-fc81cce

# Run locally
docker run -p 8000:8000 \
  -e HF_TOKEN=your_token \
  ghcr.io/jonasneves/serverless-llm/deepseek-r1qwen-inference:latest
```

### Manually Trigger Build
1. Go to Actions > "Build and Push Inference Images"
2. Click "Run workflow"
3. Choose models to build (comma-separated or "all")

### Force Rebuild All Images
```bash
# Trigger via GitHub CLI
gh workflow run build-push-images.yml -f models=all
```

## Permissions

The setup requires:
- `packages: write` - Build workflow can push to GHCR
- `packages: read` - Inference workflows can pull from GHCR

These are automatically granted via `GITHUB_TOKEN` in Actions.

## Storage

- **Free tier:** 500MB storage, 1GB bandwidth per month (public repos)
- **Current usage:** ~200MB per model image
- Images are automatically cleaned up after 90 days if untagged

## Troubleshooting

### Image Pull Fails
- Workflow automatically falls back to local build
- Check if image exists: `docker pull ghcr.io/jonasneves/serverless-llm/{model}:latest`
- Manually trigger build workflow if needed

### Build Workflow Not Triggering
- Check if changed files match path filters
- Manually trigger via workflow_dispatch

### Image Size Too Large
- Current images are optimized with multi-stage builds (where applicable)
- llama-cpp-python with OpenBLAS is the main contributor (~150MB)
- Consider pruning old images to stay within limits
