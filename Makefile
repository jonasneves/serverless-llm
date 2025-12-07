# Serverless LLM - Docker Management
# Simplified commands for managing containerized services

.PHONY: help setup build-all build-sidecars build-services start stop logs clean

# Default target
help:
	@echo "Serverless LLM - Docker Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup              - Create .env from template"
	@echo ""
	@echo "Build:"
	@echo "  make build-all          - Build all images (sidecars + services)"
	@echo "  make build-sidecars     - Build lightweight sidecars (cloudflared, monitor)"
	@echo "  make build-services     - Build all service images"
	@echo "  make build-chat         - Build chat interface"
	@echo "  make build-phi          - Build Phi-3 inference"
	@echo "  make build-qwen         - Build Qwen inference"
	@echo ""
	@echo "Run (Individual Services):"
	@echo "  make start-chat         - Start chat interface + sidecars"
	@echo "  make start-phi          - Start Phi-3 + sidecars"
	@echo "  make start-qwen         - Start Qwen + sidecars"
	@echo "  make start-all          - Start all services"
	@echo ""
	@echo "Stop:"
	@echo "  make stop-chat          - Stop chat interface"
	@echo "  make stop-phi           - Stop Phi-3"
	@echo "  make stop-qwen          - Stop Qwen"
	@echo "  make stop-all           - Stop all services"
	@echo ""
	@echo "Logs:"
	@echo "  make logs-chat          - View chat interface logs"
	@echo "  make logs-phi           - View Phi-3 logs"
	@echo "  make logs-all           - View all service logs"
	@echo ""
	@echo "Maintenance:"
	@echo "  make ps                 - Show running containers"
	@echo "  make stats              - Show container resource usage"
	@echo "  make clean              - Remove stopped containers"
	@echo "  make clean-all          - Remove containers, images, volumes"
	@echo ""

# Setup
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file - please edit with your tokens"; \
	else \
		echo ".env already exists - skipping"; \
	fi

# Build targets
build-all: build-sidecars build-services
	@echo "All images built successfully"

build-sidecars:
	@echo "Building lightweight sidecars (~30MB each)..."
	docker build -t cloudflared:latest ./docker/cloudflared
	docker build -t health-monitor:latest ./docker/health-monitor
	@echo "Sidecar images built"
	@docker images cloudflared:latest health-monitor:latest --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}"

build-services: build-chat build-phi build-qwen build-llama
	@echo "All service images built"

build-chat:
	@echo "Building chat interface..."
	docker build -t chat-interface:latest ./app/chat-interface

build-phi:
	@echo "Building Phi-3 inference server..."
	docker build -t phi-inference:latest ./app/phi-inference

build-qwen:
	@echo "Building Qwen inference server..."
	docker build -t qwen-inference:latest ./app/qwen-inference

build-llama:
	@echo "Building Llama inference server..."
	docker build -t llama-inference:latest ./app/llama-inference

# Start services
start-chat:
	@echo "Starting chat interface with sidecars..."
	docker-compose -f docker-compose.chat-interface.yml up -d
	@echo "Chat interface started"
	@echo "Access at: http://localhost:8080"

start-phi:
	@echo "Starting Phi-3 with sidecars..."
	docker-compose -f docker-compose.phi.yml up -d
	@echo "Phi-3 started on port 8000"

start-qwen:
	@echo "Starting Qwen with sidecars..."
	docker-compose -f docker-compose.qwen.yml up -d
	@echo "Qwen started on port 8001"

start-all:
	@echo "Starting all services..."
	docker-compose -f docker-compose.all.yml up -d
	@echo ""
	@echo "All services started!"
	@echo "Chat interface: http://localhost:8080"
	@echo "Phi-3 API:      http://localhost:8000"
	@echo "Qwen API:       http://localhost:8001"

# Stop services
stop-chat:
	docker-compose -f docker-compose.chat-interface.yml down

stop-phi:
	docker-compose -f docker-compose.phi.yml down

stop-qwen:
	docker-compose -f docker-compose.qwen.yml down

stop-all:
	docker-compose -f docker-compose.all.yml down

# Logs
logs-chat:
	docker-compose -f docker-compose.chat-interface.yml logs -f

logs-phi:
	docker-compose -f docker-compose.phi.yml logs -f

logs-qwen:
	docker-compose -f docker-compose.qwen.yml logs -f

logs-all:
	docker-compose -f docker-compose.all.yml logs -f

# Monitoring
ps:
	@echo "Running containers:"
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

stats:
	@echo "Container resource usage:"
	@docker stats --no-stream

# Cleanup
clean:
	@echo "Removing stopped containers..."
	docker container prune -f
	@echo "Cleanup complete"

clean-all:
	@echo "WARNING: This will remove all containers, images, and volumes!"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	docker-compose -f docker-compose.all.yml down -v
	docker system prune -af --volumes
	@echo "Full cleanup complete"

# Development helpers
dev-rebuild-chat: stop-chat
	@echo "Rebuilding and restarting chat interface..."
	docker-compose -f docker-compose.chat-interface.yml build --no-cache chat-server
	docker-compose -f docker-compose.chat-interface.yml up -d
	@echo "Chat interface rebuilt and restarted"

dev-rebuild-phi: stop-phi
	@echo "Rebuilding and restarting Phi-3..."
	docker-compose -f docker-compose.phi.yml build --no-cache phi-inference
	docker-compose -f docker-compose.phi.yml up -d
	@echo "Phi-3 rebuilt and restarted"

# Health checks
health:
	@echo "Checking service health..."
	@echo ""
	@echo "Chat Interface:"
	@curl -sf http://localhost:8080/health || echo "  ✗ DOWN"
	@echo ""
	@echo "Phi-3:"
	@curl -sf http://localhost:8000/health || echo "  ✗ DOWN"
	@echo ""
	@echo "Qwen:"
	@curl -sf http://localhost:8001/health || echo "  ✗ DOWN"
	@echo ""

# Show architecture
show-arch:
	@echo "Container Architecture:"
	@echo ""
	@echo "┌──────────────────────┐  ┌────────────────┐  ┌──────────────────┐"
	@echo "│ Main Server          │  │ Cloudflared    │  │ Health Monitor   │"
	@echo "│ (python:3.11-slim)   │  │ (ubuntu:24.04) │  │ (ubuntu:24.04)   │"
	@echo "│ ~120MB               │  │ ~30MB          │  │ ~30MB            │"
	@echo "└──────────────────────┘  └────────────────┘  └──────────────────┘"
	@echo ""
	@echo "Current running containers:"
	@docker ps --format "  {{.Names}}: {{.Image}} ({{.Status}})"
	@echo ""
	@echo "Image sizes:"
	@docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep -E "(chat|phi|qwen|cloudflared|health-monitor)" || true
