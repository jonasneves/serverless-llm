.PHONY: help setup install dev build lint format clean tunnels tunnel tunnels-dry-run tunnels-list

-include .env
export

help:
	@echo "LLM Playground"
	@echo ""
	@echo "  make setup       Create .env from template"
	@echo "  make install     Install Python dependencies"
	@echo "  make dev         Run backend API server locally (port 8080)"
	@echo "  make build       Build frontend (outputs to dist/)"
	@echo "  make lint        Check Python code"
	@echo "  make format      Format Python code"
	@echo ""
	@echo "Tunnels (requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env):"
	@echo "  make tunnels DOMAIN=neevs.io           Setup all tunnels (chat→api.DOMAIN)"
	@echo "  make tunnel MODEL=glm DOMAIN=neevs.io  Setup single model tunnel"
	@echo "  make tunnels-dry-run DOMAIN=neevs.io   Preview tunnel setup"
	@echo "  make tunnels-list                      List models and ports"

setup:
	@if [ -f .env ]; then echo ".env exists"; else cp .env.example .env && echo "Created .env"; fi

install:
	@if ! command -v python3.11 >/dev/null 2>&1; then \
		echo "Python 3.11 required. Install: brew install python@3.11"; exit 1; \
	fi
	@[ -d venv ] || python3.11 -m venv venv
	@./venv/bin/pip install -q --upgrade pip
	@./venv/bin/pip install -q -r app/chat/backend/requirements.txt
	@echo "Done. Activate: source venv/bin/activate"

dev:
	@[ -d venv ] || { echo "Run 'make install' first"; exit 1; }
	cd app/chat/backend && PYTHONPATH=../../..:$$PYTHONPATH ../../../venv/bin/python chat_server.py

build:
	@echo "Generating config from config/models.py..."
	@python3 scripts/generate_extension_config.py
	cd app/chat/frontend && npm install && npm run build

lint:
	@command -v ruff >/dev/null || { echo "Install: pip install ruff"; exit 1; }
	ruff check app scripts config

format:
	@command -v ruff >/dev/null || { echo "Install: pip install ruff"; exit 1; }
	ruff format app scripts config

clean:
	rm -rf venv __pycache__ .pytest_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Tunnel management
tunnels:
	@[ -n "$(DOMAIN)" ] || { echo "Usage: make tunnels DOMAIN=your-domain.com"; exit 1; }
	@[ -n "$(CLOUDFLARE_API_TOKEN)" ] || { echo "CLOUDFLARE_API_TOKEN not set in .env"; exit 1; }
	@[ -n "$(CLOUDFLARE_ACCOUNT_ID)" ] || { echo "CLOUDFLARE_ACCOUNT_ID not set in .env"; exit 1; }
	python3 scripts/setup_tunnels.py --domain $(DOMAIN)

tunnel:
	@[ -n "$(MODEL)" ] || { echo "Usage: make tunnel MODEL=glm DOMAIN=your-domain.com"; exit 1; }
	@[ -n "$(DOMAIN)" ] || { echo "Usage: make tunnel MODEL=glm DOMAIN=your-domain.com"; exit 1; }
	@[ -n "$(CLOUDFLARE_API_TOKEN)" ] || { echo "CLOUDFLARE_API_TOKEN not set in .env"; exit 1; }
	@[ -n "$(CLOUDFLARE_ACCOUNT_ID)" ] || { echo "CLOUDFLARE_ACCOUNT_ID not set in .env"; exit 1; }
	python3 scripts/setup_tunnels.py --domain $(DOMAIN) --models $(MODEL)

tunnels-dry-run:
	@[ -n "$(DOMAIN)" ] || { echo "Usage: make tunnels-dry-run DOMAIN=your-domain.com"; exit 1; }
	python3 scripts/setup_tunnels.py --domain $(DOMAIN) --dry-run

tunnels-list:
	@python3 config/models.py
