.PHONY: help install dev preview build lint format clean check-cf tunnels tunnel tunnels-dry-run tunnels-list

-include .env
export

help:
	@echo "LLM Playground"
	@echo ""
	@echo "  make install                           Install Python dependencies"
	@echo "  make dev                               Run backend API locally (port 8080)"
	@echo "  make preview                           Preview frontend with api.neevs.io"
	@echo "  make build                             Build frontend"
	@echo "  make lint                              Check Python code"
	@echo "  make format                            Format Python code"
	@echo ""
	@echo "Tunnels (requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID):"
	@echo "  make tunnels DOMAIN=neevs.io           Setup all tunnels"
	@echo "  make tunnel MODEL=glm DOMAIN=neevs.io  Setup single tunnel"
	@echo "  make tunnels-dry-run DOMAIN=neevs.io   Preview setup"
	@echo "  make tunnels-list                      List models and ports"

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

preview:
	@echo "Starting preview with api.neevs.io..."
	cd app/chat/frontend && VITE_API_BASE_URL=https://api.neevs.io npm run dev

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

check-cf:
	@[ -n "$(CLOUDFLARE_API_TOKEN)" ] || { echo "CLOUDFLARE_API_TOKEN not set in .env"; exit 1; }
	@[ -n "$(CLOUDFLARE_ACCOUNT_ID)" ] || { echo "CLOUDFLARE_ACCOUNT_ID not set in .env"; exit 1; }

tunnels: check-cf
	@[ -n "$(DOMAIN)" ] || { echo "Usage: make tunnels DOMAIN=your-domain.com"; exit 1; }
	python3 scripts/setup_tunnels.py --domain $(DOMAIN)

tunnel: check-cf
	@[ -n "$(MODEL)" ] || { echo "Usage: make tunnel MODEL=glm DOMAIN=your-domain.com"; exit 1; }
	@[ -n "$(DOMAIN)" ] || { echo "Usage: make tunnel MODEL=glm DOMAIN=your-domain.com"; exit 1; }
	python3 scripts/setup_tunnels.py --domain $(DOMAIN) --models $(MODEL)

tunnels-dry-run:
	@[ -n "$(DOMAIN)" ] || { echo "Usage: make tunnels-dry-run DOMAIN=your-domain.com"; exit 1; }
	python3 scripts/setup_tunnels.py --domain $(DOMAIN) --dry-run

tunnels-list:
	@python3 config/models.py
