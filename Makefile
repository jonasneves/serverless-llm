.PHONY: help setup install build-chat build-qwen build-phi build-llama start-qwen start-phi start-llama stop logs-chat logs-qwen logs-phi health ps clean clean-all dev-remote dev-local dev-qwen dev-phi dev-llama dev-interface-local lint format

# =============================================================================
# Serverless LLM - Enhanced Makefile
# =============================================================================

help:
	@echo "Serverless LLM Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          Create .env from .env.example"
	@echo "  make install        Install Python dependencies for local development"
	@echo ""
	@echo "Development (recommended workflows):"
	@echo "  make dev-remote     Run chat locally with remote models (requires BASE_DOMAIN)"
	@echo "  make dev-local      Run chat + single model locally (specify MODEL=qwen|phi|llama)"
	@echo "  make dev-qwen       Run Qwen server only (for testing)"
	@echo "  make dev-phi        Run Phi server only (for testing)"
	@echo ""
	@echo "Docker (single model testing):"
	@echo "  make start-qwen     Start chat + Qwen in Docker"
	@echo "  make start-phi      Start chat + Phi in Docker"
	@echo "  make start-llama    Start chat + Llama in Docker"
	@echo ""
	@echo "Build:"
	@echo "  make build-chat     Build chat interface image"
	@echo "  make build-qwen     Build Qwen model image"
	@echo ""
	@echo "Stop:"
	@echo "  make stop           Stop all running services"
	@echo ""
	@echo "Monitor:"
	@echo "  make ps             List running containers"
	@echo "  make logs-chat      Follow chat interface logs"
	@echo "  make health         Check service health status"
	@echo ""
	@echo "Quality:"
	@echo "  make lint           Check Python code quality"
	@echo "  make format         Format Python code"
	@echo ""
	@echo "Clean:"
	@echo "  make clean          Remove stopped containers"
	@echo "  make clean-all      Remove all containers and images"

# =============================================================================
# Setup
# =============================================================================

setup:
	@if [ -f .env ]; then \
		echo "✓ .env already exists"; \
	else \
		cp .env.example .env && echo "✓ Created .env - please edit with your values"; \
	fi

install:
	@echo "Installing Python dependencies for local development..."
	@if command -v pip3 >/dev/null 2>&1; then \
		pip3 install -r app/chat-interface/requirements.txt; \
		pip3 install -r app/shared/requirements.txt; \
		echo "✓ Dependencies installed"; \
	else \
		echo "❌ Error: pip3 not found. Please install Python 3 first."; \
		exit 1; \
	fi

# =============================================================================
# Build Commands
# =============================================================================

build-chat:
	docker-compose build chat-interface

build-qwen:
	docker-compose --profile qwen build qwen

build-phi:
	docker-compose --profile phi build phi

build-llama:
	docker-compose --profile llama build llama

# =============================================================================
# Docker Start Commands (single model testing)
# =============================================================================

start-qwen:
	@echo "Starting chat interface + Qwen in Docker..."
	docker-compose --profile qwen up -d

start-phi:
	@echo "Starting chat interface + Phi in Docker..."
	docker-compose --profile phi up -d

start-llama:
	@echo "Starting chat interface + Llama in Docker..."
	docker-compose --profile llama up -d

start-r1qwen:
	@echo "Starting chat interface + DeepSeek R1 Qwen in Docker..."
	docker-compose --profile r1qwen up -d

# =============================================================================
# Development Commands (without Docker)
# =============================================================================

dev-remote:
	@echo "Starting chat interface with remote models..."
	@if [ -z "$$BASE_DOMAIN" ]; then \
		echo "❌ Error: BASE_DOMAIN not set in .env"; \
		echo "Set BASE_DOMAIN=your-domain.com to use remote Cloudflare tunnel models"; \
		exit 1; \
	fi
	@echo "✓ Using remote models at $$BASE_DOMAIN"
	cd app/chat-interface && python chat_server.py

dev-local:
	@if [ -z "$(MODEL)" ]; then \
		echo "Usage: make dev-local MODEL=qwen|phi|llama"; \
		exit 1; \
	fi
	@echo "Starting $(MODEL) server + chat interface locally..."
	@echo "This will start both services. Press Ctrl+C to stop."
	@echo ""
	@make -j2 dev-$(MODEL) dev-interface-local

dev-interface-local:
	@echo "Starting chat interface with local endpoints..."
	@sleep 3
	cd app/chat-interface && \
		QWEN_API_URL=http://localhost:8001 \
		PHI_API_URL=http://localhost:8002 \
		LLAMA_API_URL=http://localhost:8003 \
		python chat_server.py

dev-qwen:
	@echo "Starting Qwen inference server on :8001..."
	@if [ -z "$$HF_TOKEN" ]; then \
		echo "⚠️  Warning: HF_TOKEN not set. Model download may fail."; \
	fi
	cd app/qwen-inference && PORT=8001 python inference_server.py

dev-phi:
	@echo "Starting Phi inference server on :8002..."
	cd app/phi-inference && PORT=8002 python inference_server.py

dev-llama:
	@echo "Starting Llama inference server on :8003..."
	cd app/llama-inference && PORT=8003 python inference_server.py

# =============================================================================
# Stop Commands
# =============================================================================

stop:
	docker-compose --profile all down

# =============================================================================
# Logs
# =============================================================================

logs-chat:
	docker-compose logs -f chat-interface

logs-qwen:
	docker-compose logs -f qwen

logs-phi:
	docker-compose logs -f phi

# =============================================================================
# Monitoring
# =============================================================================

ps:
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

health:
	@echo "Checking service health..."
	@echo ""
	@curl -sf http://localhost:8080/health >/dev/null 2>&1 && \
		echo "✓ Chat Interface: OK" || echo "✗ Chat Interface: DOWN"
	@curl -sf http://localhost:8001/health >/dev/null 2>&1 && \
		echo "✓ Qwen:           OK" || echo "○ Qwen:           Not running"
	@curl -sf http://localhost:8002/health >/dev/null 2>&1 && \
		echo "✓ Phi:            OK" || echo "○ Phi:            Not running"
	@curl -sf http://localhost:8003/health >/dev/null 2>&1 && \
		echo "✓ Llama:          OK" || echo "○ Llama:          Not running"
	@curl -sf http://localhost:8004/health >/dev/null 2>&1 && \
		echo "✓ R1Qwen:         OK" || echo "○ R1Qwen:         Not running"
	@curl -sf http://localhost:8005/health >/dev/null 2>&1 && \
		echo "✓ Mistral:        OK" || echo "○ Mistral:        Not running"
	@curl -sf http://localhost:8006/health >/dev/null 2>&1 && \
		echo "✓ Gemma:          OK" || echo "○ Gemma:          Not running"
	@curl -sf http://localhost:8007/health >/dev/null 2>&1 && \
		echo "✓ RNJ:            OK" || echo "○ RNJ:            Not running"

# =============================================================================
# Quality Checks
# =============================================================================

lint:
	@echo "Checking Python code quality..."
	@if command -v ruff >/dev/null 2>&1; then \
		find app -name "*.py" -not -path "*/.*" -exec ruff check {} +; \
	else \
		echo "ruff not installed. Install with: pip install ruff"; \
		exit 1; \
	fi

format:
	@echo "Formatting Python code..."
	@if command -v ruff >/dev/null 2>&1; then \
		find app -name "*.py" -not -path "*/.*" -exec ruff format {} +; \
	else \
		echo "ruff not installed. Install with: pip install ruff"; \
		exit 1; \
	fi

# =============================================================================
# Cleanup
# =============================================================================

clean:
	@echo "Removing stopped containers..."
	docker container prune -f

clean-all:
	@echo "⚠️  WARNING: This will remove all containers, images, and volumes!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose --profile all down -v; \
		docker system prune -af --volumes; \
		echo "✓ Cleanup complete"; \
	else \
		echo "Cancelled"; \
	fi
