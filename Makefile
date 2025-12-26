.PHONY: help dev backend backend-lan test clean frontend frontend-lan frontend-install

BACKEND_DIR := backend
FRONTEND_DIR := frontend

FRONTEND_PORT ?= 8000

# Absolute path so it works even when backend Makefile runs in backend/
BACKEND_PY ?= $(abspath $(BACKEND_DIR)/.venv/bin/python)

help:
	@echo "Repo targets:"
	@echo "  make backend           Run backend (local) on 127.0.0.1:8001"
	@echo "  make backend-lan       Run backend (LAN) on 0.0.0.0:8001"
	@echo "  make frontend          Run frontend (local) on :$(FRONTEND_PORT)"
	@echo "  make frontend-lan      Run frontend (LAN) on :$(FRONTEND_PORT)"
	@echo "  make frontend-install  npm install in frontend/"
	@echo "  make dev               Run backend-lan + frontend-lan together (Linux/macOS)"
	@echo "  make test              Run backend tests"
	@echo "  make clean             Clean backend artifacts"

backend:
	$(MAKE) -C $(BACKEND_DIR) run PY=$(BACKEND_PY)

backend-lan:
	$(MAKE) -C $(BACKEND_DIR) run-lan PY=$(BACKEND_PY)

test:
	$(MAKE) -C $(BACKEND_DIR) test PY=$(BACKEND_PY)

clean:
	$(MAKE) -C $(BACKEND_DIR) clean

frontend-install:
	cd $(FRONTEND_DIR) && npm install

frontend:
	cd $(FRONTEND_DIR) && npm run dev -- --port $(FRONTEND_PORT)

frontend-lan:
	cd $(FRONTEND_DIR) && npm run dev -- --host 0.0.0.0 --port $(FRONTEND_PORT)

# Runs both concurrently (Linux/macOS). On Windows, use two terminals:
#   make backend-lan
#   make frontend-lan
dev:
	@echo "Starting backend (LAN) + frontend (LAN) ..."
	@bash -lc 'set -m; \
		$(MAKE) backend-lan & \
		$(MAKE) frontend-lan & \
		wait'
