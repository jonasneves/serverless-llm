.PHONY: help setup install dev build lint format clean

-include .env
export

help:
	@echo "Serverless LLM"
	@echo ""
	@echo "  make setup       Create .env from template"
	@echo "  make install     Install Python dependencies"
	@echo "  make dev         Run chat interface locally"
	@echo "  make build       Build React frontend"
	@echo "  make lint        Check Python code"
	@echo "  make format      Format Python code"

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
