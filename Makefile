.PHONY: help setup build-all start stop logs clean test lint format

# =============================================================================
# Serverless LLM - Enhanced Makefile
# =============================================================================

help:
	@echo "Serverless LLM Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          Create .env from .env.example"
	@echo ""
	@echo "Build:"
	@echo "  make build-all      Build all Docker images"
	@echo "  make build-chat     Build chat interface only"
	@echo "  make build-qwen     Build Qwen model server"
	@echo ""
	@echo "Start (with profiles):"
	@echo "  make start          Start chat interface only"
	@echo "  make start-all      Start all services"
	@echo "  make start-qwen     Start chat + Qwen"
	@echo "  make start-phi      Start chat + Phi"
	@echo ""
	@echo "Development (without Docker):"
	@echo "  make dev-qwen       Run Qwen server locally"
	@echo "  make dev-interface  Run chat interface locally"
	@echo ""
	@echo "Stop:"
	@echo "  make stop           Stop all services"
	@echo ""
	@echo "Monitor:"
	@echo "  make ps             List running containers"
	@echo "  make logs           Follow all logs"
	@echo "  make logs-chat      Follow chat interface logs"
	@echo "  make health         Check service health"
	@echo ""
	@echo "Quality:"
	@echo "  make test           Run health checks"
	@echo "  make lint           Check Python code quality"
	@echo "  make format         Format Python code"
	@echo ""
	@echo "Clean:"
	@echo "  make clean          Remove stopped containers"
	@echo "  make clean-all      Nuclear option - remove everything"

# =============================================================================
# Setup
# =============================================================================

setup:
	@if [ -f .env ]; then \
		echo "✓ .env already exists"; \
	else \
		cp .env.example .env && echo "✓ Created .env - please edit with your values"; \
	fi

# =============================================================================
# Build Commands
# =============================================================================

build-all:
	docker-compose --profile all build

build-chat:
	docker-compose build chat-interface

build-qwen:
	docker-compose --profile qwen build qwen

build-phi:
	docker-compose --profile phi build phi

build-llama:
	docker-compose --profile llama build llama

# =============================================================================
# Start Commands (with profiles)
# =============================================================================

start:
	@echo "Starting chat interface only..."
	docker-compose up -d

start-all:
	@echo "Starting all services..."
	docker-compose --profile all up -d

start-qwen:
	@echo "Starting chat interface + Qwen..."
	docker-compose --profile qwen up -d

start-phi:
	@echo "Starting chat interface + Phi..."
	docker-compose --profile phi up -d

start-llama:
	@echo "Starting chat interface + Llama..."
	docker-compose --profile llama up -d

start-r1qwen:
	@echo "Starting chat interface + DeepSeek R1 Qwen..."
	docker-compose --profile r1qwen up -d

# =============================================================================
# Development (without Docker)
# =============================================================================

dev-qwen:
	@echo "Starting Qwen inference server locally..."
	@if [ -z "$$HF_TOKEN" ]; then \
		echo "Warning: HF_TOKEN not set. Model download may fail."; \
	fi
	cd app/qwen-inference && python inference_server.py

dev-phi:
	@echo "Starting Phi inference server locally..."
	cd app/phi-inference && python inference_server.py

dev-interface:
	@echo "Starting chat interface locally..."
	@if [ -z "$$QWEN_API_URL" ]; then \
		export QWEN_API_URL=http://localhost:8000; \
	fi
	cd app/chat-interface && python chat_server.py

# =============================================================================
# Stop Commands
# =============================================================================

stop:
	docker-compose --profile all down

# =============================================================================
# Logs
# =============================================================================

logs:
	docker-compose --profile all logs -f

logs-chat:
	docker-compose logs -f chat-interface

logs-qwen:
	docker-compose logs -f qwen

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

test:
	@echo "Running health checks..."
	@python -c "import requests; r = requests.get('http://localhost:8080/api/health/detailed'); print(r.json() if r.status_code == 200 else 'Failed')"

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
