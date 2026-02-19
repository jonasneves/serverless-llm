# Serverless LLM

LLM playground with Cloudflare tunnel routing. Python backend + static frontend.

## Commands

- `make install` — create venv + install deps (Python 3.11 required)
- `make dev` — run backend API locally (port 8080)
- `make preview` — preview frontend against api.neevs.io
- `make build` — build frontend
- `make lint` / `make format` — Python code quality
- `make tunnels DOMAIN=neevs.io` — set up all Cloudflare tunnels
- `source venv/bin/activate` — activate venv (after install)

## Architecture

`app/chat/backend/` — Python FastAPI
`config/` — model and tunnel configuration
`docker/` + `docker-compose.yml` — container setup
`tunnels.json` — Cloudflare tunnel map (copy from `tunnels.json.example`)
