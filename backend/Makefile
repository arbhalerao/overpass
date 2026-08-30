VENV := .venv
PY   := $(VENV)/bin/python

CACHES := .mypy_cache .pytest_cache .dmypy.json .coverage htmlcov

.DEFAULT_GOAL := help
.PHONY: help venv install format check lint types run clean

help: ## show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "} {printf "\033[1m%-10s\033[0m %s\n", $$1, $$2}'

venv: ## create the virtualenv if it is missing
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PY) -m pip install --quiet --upgrade pip
	@$(PY) --version

install: venv ## install the package and its dev tools
	$(PY) -m pip install -e ".[dev]"
	@echo "install complete"

format: ## rewrite the code with black
	$(PY) -m black app

lint: ## check formatting without changing anything
	$(PY) -m black --check app

types: ## run mypy in strict mode
	$(PY) -m mypy app

check: lint types ## everything that has to pass before a commit

run: ## serve on localhost:8000 with reload
	$(PY) -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

clean: ## remove the venv and every cache and build artefact
	rm -rf $(VENV) $(CACHES) .eggs build dist
	find . -path ./data -prune -o -type d -name __pycache__ -print0 | xargs -0 rm -rf
	find . -path ./data -prune -o -name '*.egg-info' -print0 | xargs -0 rm -rf
	find . -path ./data -prune -o -name '*.py[cod]' -print0 | xargs -0 rm -f
	@echo "clean complete"
