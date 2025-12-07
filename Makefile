.PHONY: help setup build-all start stop logs clean

help:
	@echo "Serverless LLM Commands"
	@echo ""
	@echo "Setup:    make setup"
	@echo "Build:    make build-all"
	@echo "Start:    make start-chat | start-phi | start-all"
	@echo "Stop:     make stop-all"
	@echo "Monitor:  make ps | logs-all | health"
	@echo "Clean:    make clean | clean-all"
	@echo ""

setup:
	@[ -f .env ] || (cp .env.example .env && echo "Created .env")

build-all:
	docker-compose -f docker-compose.all.yml build

build-chat:
	docker-compose -f docker-compose.chat-interface.yml build

build-phi:
	docker-compose -f docker-compose.phi.yml build

start-chat:
	docker-compose -f docker-compose.chat-interface.yml up -d

start-phi:
	docker-compose -f docker-compose.phi.yml up -d

start-all:
	docker-compose -f docker-compose.all.yml up -d

stop-all:
	docker-compose -f docker-compose.all.yml down

logs-chat:
	docker-compose -f docker-compose.chat-interface.yml logs -f

logs-all:
	docker-compose -f docker-compose.all.yml logs -f

ps:
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

health:
	@curl -sf http://localhost:8080/health && echo "Chat: OK" || echo "Chat: DOWN"
	@curl -sf http://localhost:8000/health && echo "Phi: OK" || echo "Phi: DOWN"

clean:
	docker container prune -f

clean-all:
	docker-compose -f docker-compose.all.yml down -v
	docker system prune -af --volumes
