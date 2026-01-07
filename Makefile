.PHONY: help setup install build-chat build-playground generate-configs start stop logs health ps clean lint format setup-tunnels

# Load .env file if it exists
-include .env
export

# Port scheme (from config/models.py)
# 8080: Chat, 81XX: Small, 82XX: Medium, 83XX: Reasoning

help:
	@echo "Serverless LLM"
	@echo ""
	@echo "Setup:"
	@echo "  make setup           Create .env from template"
	@echo "  make install         Install Python dependencies (venv)"
	@echo ""
	@echo "Development:"
	@echo "  make dev-chat        Run chat interface (uses remote models if BASE_DOMAIN set)"
	@echo "  make dev-MODEL       Run model locally (qwen|phi|llama|mistral|gemma|r1qwen|rnj|functiongemma|smollm3|lfm2|nanbeige|nemotron|gptoss)"
	@echo ""
	@echo "Docker:"
	@echo "  make start MODEL=x   Start chat + model in Docker"
	@echo "  make stop            Stop all services"
	@echo ""
	@echo "Tunnels:"
	@echo "  make setup-tunnels   Create Cloudflare tunnels (requires CF env vars)"
	@echo ""
	@echo "Build:"
	@echo "  make generate-configs Generate TypeScript config from Python"
	@echo "  make build-chat      Build chat Docker image"
	@echo "  make build-playground Build React app (runs generate-configs)"
	@echo ""
	@echo "Monitor:"
	@echo "  make health          Check service health"
	@echo "  make ps              List containers"
	@echo "  make logs            Follow chat logs"
	@echo ""
	@echo "Quality:"
	@echo "  make lint            Check Python code"
	@echo "  make format          Format Python code"

# =============================================================================
# Setup
# =============================================================================

setup:
	@if [ -f .env ]; then echo ".env exists"; else cp .env.example .env && echo "Created .env"; fi

install:
	@if ! command -v python3.11 >/dev/null 2>&1; then \
		echo "Python 3.11 required. Install: brew install python@3.11"; exit 1; \
	fi
	@[ -d venv ] || python3.11 -m venv venv
	@./venv/bin/pip install -q --upgrade pip
	@./venv/bin/pip install -q -r app/chat/backend/requirements.txt
	@./venv/bin/pip install -q -r app/shared/requirements.txt
	@echo "Done. Activate: source venv/bin/activate"

# =============================================================================
# Development (local, no Docker)
# =============================================================================

dev-chat:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/chat/backend && PYTHONPATH=../../..:$$PYTHONPATH ../../../venv/bin/python chat_server.py

dev-qwen:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/qwen-inference && PORT=8100 ../../venv/bin/python inference_server.py

dev-phi:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/phi-inference && PORT=8101 ../../venv/bin/python inference_server.py

dev-gemma:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/gemma-inference && PORT=8200 ../../venv/bin/python inference_server.py

dev-llama:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/llama-inference && PORT=8201 ../../venv/bin/python inference_server.py

dev-mistral:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/mistral-inference && PORT=8202 ../../venv/bin/python inference_server.py

dev-rnj:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/rnj-inference && PORT=8203 ../../venv/bin/python inference_server.py

dev-r1qwen:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/deepseek-r1qwen-inference && PORT=8300 ../../venv/bin/python inference_server.py

dev-functiongemma:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/functiongemma-inference && PORT=8103 ../../venv/bin/python inference_server.py

dev-smollm3:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/smollm3-inference && PORT=8104 ../../venv/bin/python inference_server.py

dev-lfm2:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/lfm2-inference && PORT=8105 ../../venv/bin/python inference_server.py

dev-nanbeige:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/nanbeige-inference && PORT=8301 ../../venv/bin/python inference_server.py

dev-nemotron:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/nemotron-inference && PORT=8302 ../../venv/bin/python inference_server.py

dev-gptoss:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/gpt-oss-inference && PORT=8303 ../../venv/bin/python inference_server.py

# =============================================================================
# Docker
# =============================================================================

start:
ifndef MODEL
	@echo "Usage: make start MODEL=qwen|phi|llama|mistral|gemma|r1qwen|rnj|functiongemma|smollm3|lfm2|nanbeige|nemotron|gptoss"
else
	docker-compose --profile $(MODEL) up -d
endif

stop:
	docker-compose --profile all down

logs:
	docker-compose logs -f chat

ps:
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# =============================================================================
# Build
# =============================================================================

build-chat:
	docker-compose build chat

# Generate TypeScript config from Python source of truth
generate-configs:
	@echo "Generating extension config from config/models.py..."
	python3 scripts/generate_extension_config.py

build-playground: generate-configs
	cd app/chat/frontend && npm install && npm run build


# =============================================================================
# Tunnels
# =============================================================================

# Use DOMAIN if provided, otherwise fall back to BASE_DOMAIN from .env
TUNNEL_DOMAIN := $(or $(DOMAIN),$(BASE_DOMAIN))

setup-tunnels:
ifndef CLOUDFLARE_API_TOKEN
	@echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env"
	@exit 1
endif
ifndef TUNNEL_DOMAIN
	@echo "Set BASE_DOMAIN in .env or use: make setup-tunnels DOMAIN=your-domain.com"
else
	python3 scripts/setup_tunnels.py --domain $(TUNNEL_DOMAIN)
endif

setup-tunnels-dry:
ifndef TUNNEL_DOMAIN
	@echo "Set BASE_DOMAIN in .env or use: make setup-tunnels-dry DOMAIN=your-domain.com"
else
	python3 scripts/setup_tunnels.py --domain $(TUNNEL_DOMAIN) --dry-run
endif

# =============================================================================
# Monitoring
# =============================================================================

health:
	@echo "Services:"
	@curl -sf http://localhost:8080/health >/dev/null 2>&1 && echo "  Chat (8080): up" || echo "  Chat (8080): down"
	@curl -sf http://localhost:8100/health >/dev/null 2>&1 && echo "  Qwen (8100): up" || echo "  Qwen (8100): -"
	@curl -sf http://localhost:8101/health >/dev/null 2>&1 && echo "  Phi (8101): up" || echo "  Phi (8101): -"
	@curl -sf http://localhost:8103/health >/dev/null 2>&1 && echo "  FunctionGemma (8103): up" || echo "  FunctionGemma (8103): -"
	@curl -sf http://localhost:8200/health >/dev/null 2>&1 && echo "  Gemma (8200): up" || echo "  Gemma (8200): -"
	@curl -sf http://localhost:8201/health >/dev/null 2>&1 && echo "  Llama (8201): up" || echo "  Llama (8201): -"
	@curl -sf http://localhost:8202/health >/dev/null 2>&1 && echo "  Mistral (8202): up" || echo "  Mistral (8202): -"
	@curl -sf http://localhost:8203/health >/dev/null 2>&1 && echo "  RNJ (8203): up" || echo "  RNJ (8203): -"
	@curl -sf http://localhost:8300/health >/dev/null 2>&1 && echo "  R1Qwen (8300): up" || echo "  R1Qwen (8300): -"

# =============================================================================
# Quality
# =============================================================================

lint:
	@command -v ruff >/dev/null || { echo "Install: pip install ruff"; exit 1; }
	ruff check app scripts config

format:
	@command -v ruff >/dev/null || { echo "Install: pip install ruff"; exit 1; }
	ruff format app scripts config

# =============================================================================
# Cleanup
# =============================================================================

clean:
	docker container prune -f
