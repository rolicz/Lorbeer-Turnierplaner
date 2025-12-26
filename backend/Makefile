.PHONY: help run run-lan test lint clean

PY ?= python
PIP := pip

HOST ?= 127.0.0.1
PORT ?= 8001
SECRETS ?= ./secrets.json
RELOAD ?= --reload

help:
	@echo "Targets:"
	@echo "  make run          Run server on $(HOST):$(PORT)"
	@echo "  make run-lan      Run server on 0.0.0.0:$(PORT)"
	@echo "  make test         Run pytest"
	@echo "  make clean        Remove venv + cache files"


run:
	$(PY) run.py --host $(HOST) --port $(PORT) $(RELOAD) --secrets $(SECRETS)

run-lan:
	$(PY) run.py --host 0.0.0.0 --port $(PORT) $(RELOAD) --secrets $(SECRETS)

test:
	$(PY) -m pytest -q

clean:
	rm -rf $(VENV) .pytest_cache __pycache__ */__pycache__ app.db
