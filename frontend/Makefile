NPM := npm

.DEFAULT_GOAL := help
.PHONY: help install lint types check build run preview clean

help: ## show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "\033[1m%-10s\033[0m %s\n", $$1, $$2}'

install: ## install the dependencies exactly as the lockfile pins them
	$(NPM) ci
	@echo "install complete"

lint: ## check the source with oxlint
	$(NPM) run lint

types: ## type-check both project references, emitting nothing
	npx tsc -b

check: lint types ## everything that has to pass before a commit

build: ## type-check and bundle into dist/
	$(NPM) run build

run: ## serve on localhost:5173 with hot reload
	$(NPM) run dev

preview: ## serve the built dist/ the way production does, on localhost:4173
	$(NPM) run preview

clean: ## remove the dependencies, the build output and cache
	rm -rf node_modules dist dist-ssr .vite
	@echo "clean complete"
