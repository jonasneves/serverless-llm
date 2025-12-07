# Docker Architecture - Optimized with Ubuntu Slim Sidecars

This document explains the optimized container architecture that separates lightweight tasks (cloudflared, health monitoring) into ultra-slim containers.

## Architecture Overview

### Before (Monolithic)
```
┌─────────────────────────────────────┐
│ ubuntu-24.04-arm Runner (~500MB)    │
│ ┌─────────────────────────────────┐ │
│ │ Python Server                   │ │
│ │ + Dependencies                  │ │
│ │ + Cloudflared (Go binary)       │ │
│ │ + Health monitoring scripts     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### After (Microservices with Slim Containers)
```
┌──────────────────────┐  ┌────────────────┐  ┌──────────────────┐
│ Main Server          │  │ Cloudflared    │  │ Health Monitor   │
│ (python:3.11-slim)   │  │ (ubuntu:24.04) │  │ (ubuntu:24.04)   │
│ ~120MB               │  │ ~30MB          │  │ ~30MB            │
├──────────────────────┤  ├────────────────┤  ├──────────────────┤
│ - Python 3.11        │  │ - cloudflared  │  │ - curl           │
│ - venv               │  │ - ca-certs     │  │ - jq             │
│ - Model inference    │  │                │  │ - bash scripts   │
│ - API server         │  │                │  │                  │
└──────────────────────┘  └────────────────┘  └──────────────────┘
         │                        │                     │
         └────────────────────────┴─────────────────────┘
                        Docker Network
```

## Benefits

### 1. Resource Optimization
- **Cloudflared**: ~30MB container vs bundled in ~500MB runner
- **Health Monitor**: ~30MB container with only curl + jq
- **Total savings**: ~400MB+ per service when isolated

### 2. Better Isolation
- Each service runs in its own container
- Failures isolated (e.g., tunnel crash doesn't affect main server)
- Easier to restart individual components

### 3. Development-Production Parity
- Same `docker-compose.yml` works locally and in CI/CD
- No "works on my machine" issues
- Identical environment across all stages

### 4. Scalability
- Can scale cloudflared independently (multiple tunnels)
- Can add monitoring without touching main service
- Easier to add new sidecars (logging, metrics, etc.)

## File Structure

```
serverless-llm/
├── docker/
│   ├── cloudflared/
│   │   └── Dockerfile              # Ultra-lightweight tunnel (ubuntu:24.04)
│   └── health-monitor/
│       ├── Dockerfile              # Lightweight monitoring (ubuntu:24.04)
│       └── health-check.sh         # Monitoring script
├── app/
│   ├── chat-interface/
│   │   └── Dockerfile              # Multi-stage build
│   ├── phi-inference/
│   │   └── Dockerfile              # Multi-stage build (UPDATED)
│   └── [other-inference]/
│       └── Dockerfile              # Multi-stage build pattern
├── docker-compose.chat-interface.yml    # Chat interface + sidecars
├── docker-compose.inference.yml         # Template for inference servers
├── docker-compose.phi.yml               # Phi-3 specific
├── docker-compose.qwen.yml              # Qwen specific
├── docker-compose.all.yml               # Full stack
├── .env.example                         # Environment variables template
└── .github/
    └── workflows/
        └── containerized-chat-interface.yml  # Example container workflow
```

## Quick Start

### Local Development

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   # Edit .env with your tokens
   ```

2. **Start a single service (e.g., Phi-3):**
   ```bash
   docker-compose -f docker-compose.phi.yml up -d
   ```

3. **Start chat interface:**
   ```bash
   docker-compose -f docker-compose.chat-interface.yml up -d
   ```

4. **Start everything:**
   ```bash
   docker-compose -f docker-compose.all.yml up -d
   ```

5. **View logs:**
   ```bash
   # All services
   docker-compose -f docker-compose.all.yml logs -f

   # Specific service
   docker-compose -f docker-compose.all.yml logs -f chat-server

   # Lightweight sidecars
   docker-compose -f docker-compose.all.yml logs -f chat-cloudflared
   docker-compose -f docker-compose.all.yml logs -f health-monitor
   ```

6. **Stop services:**
   ```bash
   docker-compose -f docker-compose.all.yml down
   ```

### Production Deployment

#### Option 1: Docker Compose (Recommended for VPS/Dedicated)
```bash
# On your server
git clone <your-repo>
cd serverless-llm
cp .env.example .env
# Edit .env with production tokens

# Start with auto-restart
docker-compose -f docker-compose.all.yml up -d --restart unless-stopped
```

#### Option 2: GitHub Actions with Containers
See `.github/workflows/containerized-chat-interface.yml` for an example of running containers in GitHub Actions.

## Container Details

### Cloudflared Sidecar

**Base Image:** `ubuntu:24.04`
**Size:** ~30MB
**Purpose:** Run Cloudflare tunnels in isolated lightweight container

**Features:**
- Multi-architecture support (ARM64/AMD64)
- Non-root user
- Health checks built-in
- Minimal dependencies (just ca-certificates + curl)

**Usage:**
```bash
# Standalone
docker run -d \
  --name my-tunnel \
  --network my-network \
  cloudflared:latest \
  tunnel --no-autoupdate run --token YOUR_TOKEN

# With docker-compose (automatic)
docker-compose -f docker-compose.phi.yml up -d
```

### Health Monitor Sidecar

**Base Image:** `ubuntu:24.04`
**Size:** ~30MB
**Purpose:** Monitor service health, provide restart capabilities

**Features:**
- Configurable check intervals
- Multi-service monitoring
- Detailed logging every N checks
- Non-root user

**Environment Variables:**
- `SERVER_URL` - URL to monitor (default: `http://localhost:8080/health`)
- `CHECK_INTERVAL` - Seconds between checks (default: `30`)
- `TUNNEL_ENABLED` - Monitor tunnel status (default: `true`)

### Main Services (Inference/Chat)

**Base Image:** `python:3.11-slim`
**Build Pattern:** Multi-stage (Builder + Runtime)

**Stage 1 - Builder:**
- Heavy build dependencies (cmake, gcc, etc.)
- Compile Python packages
- Create virtual environment
- **Discarded after build** (not in final image)

**Stage 2 - Runtime:**
- Minimal runtime dependencies only
- Copy venv from builder
- Non-root user
- Health checks built-in
- **Result:** Smaller, more secure final image

## Image Size Comparison

| Service | Old Approach | New Approach | Savings |
|---------|-------------|--------------|---------|
| Cloudflared | Bundled (~500MB runner) | Standalone (~30MB) | ~470MB |
| Health Monitor | Bundled (~500MB runner) | Standalone (~30MB) | ~470MB |
| Phi Inference | Single-stage (~450MB) | Multi-stage (~380MB) | ~70MB |
| Chat Interface | Already optimized (multi-stage) | ✓ | - |

**Total per service stack:** ~1GB → ~440MB (56% reduction)

## Network Architecture

All services communicate via Docker networks:

```yaml
services:
  main-server:
    networks:
      - app-network

  cloudflared:
    networks:
      - app-network  # Can reach main-server via DNS

  health-monitor:
    networks:
      - app-network  # Can reach both services
```

Services can reach each other using container names:
- `http://chat-server:8080`
- `http://phi-inference:8000`

## Environment Variables

See `.env.example` for all required variables.

**Required for all services:**
- `HF_TOKEN` - Hugging Face token for model downloads

**Required per service:**
- `CLOUDFLARE_TUNNEL_TOKEN_XXX` - Tunnel token for each service

**Optional:**
- `GH_MODELS_TOKEN` - GitHub Models API access
- `BASE_DOMAIN` - Simplified domain configuration

## Monitoring & Debugging

### Check container status
```bash
docker ps
docker-compose -f docker-compose.all.yml ps
```

### View logs
```bash
# All logs
docker-compose -f docker-compose.all.yml logs

# Follow specific service
docker-compose -f docker-compose.all.yml logs -f phi-inference

# Last 100 lines
docker logs phi-inference --tail 100
```

### Enter a container
```bash
docker exec -it chat-server bash
docker exec -it chat-cloudflared sh  # Alpine-based
```

### Check resource usage
```bash
docker stats
```

### Inspect network
```bash
docker network inspect llm-network
```

## Upgrading from Monolithic to Containerized

### For GitHub Actions Workflows

**Before:**
```yaml
- name: Install cloudflared
  run: |
    curl -L ... -o cloudflared
    sudo mv cloudflared /usr/local/bin/

- name: Start server
  run: python server.py &

- name: Start tunnel
  run: cloudflared tunnel run --token $TOKEN &
```

**After:**
```yaml
- name: Build images
  run: |
    docker build -t cloudflared ./docker/cloudflared
    docker build -t server ./app/my-service

- name: Start containers
  run: |
    docker-compose -f docker-compose.my-service.yml up -d
```

### For Local Development

**Before:**
```bash
# Terminal 1
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python server.py

# Terminal 2
cloudflared tunnel run --token $TOKEN

# Terminal 3
while true; do curl localhost:8080/health; sleep 30; done
```

**After:**
```bash
docker-compose -f docker-compose.my-service.yml up
# Everything runs automatically, logs combined
```

## Best Practices

1. **Always use .env files** - Never commit tokens to git
2. **Use health checks** - All services should have healthchecks
3. **Multi-stage builds** - Separate build and runtime dependencies
4. **Non-root users** - Run containers as non-root for security
5. **Named networks** - Use explicit networks for service communication
6. **Volume persistence** - Cache models/data in Docker volumes
7. **Restart policies** - Use `unless-stopped` for production

## Troubleshooting

### Container won't start
```bash
docker logs <container-name>
docker-compose -f docker-compose.yml logs <service-name>
```

### Network issues
```bash
# Check if containers are on same network
docker network inspect <network-name>

# Test connectivity from one container to another
docker exec -it container1 curl http://container2:8080/health
```

### Health check failing
```bash
# Check health status
docker inspect <container-name> | jq '.[0].State.Health'

# Test health endpoint manually
docker exec -it <container-name> curl -f http://localhost:8000/health
```

### Out of disk space
```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove everything not currently used
docker system prune -a --volumes
```

## Next Steps

1. ✅ Optimized Dockerfiles created
2. ✅ Docker Compose configurations ready
3. ✅ Example GitHub Actions workflow provided
4. 🔄 Test locally with `docker-compose`
5. 🔄 Deploy to production
6. 🔄 Monitor performance improvements

## Contributing

When adding new services:

1. Follow multi-stage build pattern (see `app/llama-inference/Dockerfile`)
2. Create dedicated docker-compose file (e.g., `docker-compose.newservice.yml`)
3. Add to `docker-compose.all.yml`
4. Document environment variables in `.env.example`
5. Add health checks to Dockerfile
6. Use non-root user

## License

Same as parent project.
