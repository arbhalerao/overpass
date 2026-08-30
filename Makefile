COMPOSE := docker compose
IMAGES  := overpass-backend overpass-frontend

.DEFAULT_GOAL := help
.PHONY: help install build up down clean purge

help: ## show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "\033[1m%-12s\033[0m %s\n", $$1, $$2}'

install: ## install the backend and frontend dependencies for local development
	$(MAKE) -C backend install
	$(MAKE) -C frontend install
	@echo "install complete"

build: ## rebuild both images without starting anything
	$(COMPOSE) build

up: ## build if needed and start the stack in the background
	$(COMPOSE) up -d --build
	@echo "frontend  http://localhost:$${FRONTEND_PORT:-51800}"
	@echo "backend   http://localhost:$${BACKEND_PORT:-51801}/docs"

down: ## stop and remove the containers, keeping volumes and images
	$(COMPOSE) down

clean: ## remove dependencies, caches and build output from backend and frontend
	$(MAKE) -C backend clean
	$(MAKE) -C frontend clean
	@echo "clean complete"

purge: ## remove containers, network, volumes and images built for this project
	$(COMPOSE) down --volumes --remove-orphans --rmi local
	@docker image rm $(IMAGES) >/dev/null 2>&1 || true
	@echo "purge complete"
