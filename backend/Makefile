.PHONY: help install run run-lan test clean

PY ?= python3
PIP ?= pip

HOST ?= 127.0.0.1
PORT ?= 8001
SECRETS ?= ./secrets.json
RELOAD ?= --reload

help:
	@echo "Backend targets:"
	@echo "  make install      Create venv (.venv) and install requirements"
	@echo "  make run          Run server on $(HOST):$(PORT)"
	@echo "  make run-lan      Run server on 0.0.0.0:$(PORT)"
	@echo "  make test         Run pytest"
	@echo "  make clean        Remove caches + local DB"

install:
	@test -d .venv || $(PY) -m venv .venv
	@.venv/bin/python -m pip install -r requirements.txt

run:
	$(PY) run.py --host $(HOST) --port $(PORT) $(RELOAD) --secrets $(SECRETS)

run-lan:
	$(PY) run.py --host 0.0.0.0 --port $(PORT) $(RELOAD) --secrets $(SECRETS)

test:
	$(PY) -m pytest -q

clean:
	rm -f app.db
	rm -rf .pytest_cache __pycache__ */__pycache__ */*/__pycache__
	rm -rf .mypy_cache .ruff_cache
