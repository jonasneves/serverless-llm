.PHONY: help setup build-all start stop logs clean

# =============================================================================
# Serverless LLM - Makefile
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
	@echo "Start:"
	@echo "  make start-all      Start all services"
	@echo "  make start-chat     Start chat interface only"
	@echo "  make start-qwen     Start Qwen model only"
	@echo ""
	@echo "Stop:"
	@echo "  make stop-all       Stop all services"
	@echo ""
	@echo "Monitor:"
	@echo "  make ps             List running containers"
	@echo "  make logs-all       Follow all logs"
	@echo "  make logs-chat      Follow chat interface logs"
	@echo "  make health         Check service health"
	@echo ""
	@echo "Clean:"
	@echo "  make clean          Remove stopped containers"
	@echo "  make clean-all      Nuclear option - remove everything"

# Setup
setup:
	@[ -f .env ] || (cp .env.example .env && echo "Created .env - edit with your values")
	@[ -f .env ] && echo ".env already exists"

# Build commands
build-all:
	docker-compose -f docker-compose.all.yml build

build-chat:
	docker-compose -f docker-compose.chat-interface.yml build

build-qwen:
	docker-compose -f docker-compose.qwen.yml build

build-phi:
	docker-compose -f docker-compose.phi.yml build

# Start commands
start-all:
	docker-compose -f docker-compose.all.yml up -d

start-chat:
	docker-compose -f docker-compose.chat-interface.yml up -d

start-qwen:
	docker-compose -f docker-compose.qwen.yml up -d

start-phi:
	docker-compose -f docker-compose.phi.yml up -d

# Stop commands
stop-all:
	docker-compose -f docker-compose.all.yml down

stop-chat:
	docker-compose -f docker-compose.chat-interface.yml down

# Logs
logs-chat:
	docker-compose -f docker-compose.chat-interface.yml logs -f

logs-all:
	docker-compose -f docker-compose.all.yml logs -f

# Monitoring
ps:
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

health:
	@echo "Checking service health..."
	@curl -sf http://localhost:8080/health && echo "Chat Interface: ✓ OK" || echo "Chat Interface: ✗ DOWN"
	@curl -sf http://localhost:8001/health && echo "Qwen:           ✓ OK" || echo "Qwen:           ✗ DOWN"
	@curl -sf http://localhost:8002/health && echo "Phi:            ✓ OK" || echo "Phi:            ✗ DOWN"
	@curl -sf http://localhost:8003/health && echo "Llama:          ✓ OK" || echo "Llama:          ✗ DOWN"
	@curl -sf http://localhost:8004/health && echo "R1Qwen:         ✓ OK" || echo "R1Qwen:         ✗ DOWN"

# Cleanup
clean:
	docker container prune -f

clean-all:
	docker-compose -f docker-compose.all.yml down -v
	docker system prune -af --volumes
