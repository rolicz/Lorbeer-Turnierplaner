.PHONY: help dev backend backend-lan test lint format gen-types clean frontend frontend-lan frontend-install

# Recipes need bash: scripts/node-env.sh sources nvm (not POSIX sh compatible).
SHELL := /bin/bash

BACKEND_DIR := backend
FRONTEND_DIR := frontend

FRONTEND_PORT ?= 8000

# Where vite's dev proxy forwards /api (prefix stripped) and /ws (L0): dev is one origin,
# like production behind Caddy. The phone's URL is the vite port only.
BACKEND_ORIGIN ?= http://127.0.0.1:8001

# Absolute path so it works even when backend Makefile runs in backend/
BACKEND_PY ?= $(abspath $(BACKEND_DIR)/.venv/bin/python)

help:
	@echo "Repo targets:"
	@echo "  make backend           Run backend (local) on 127.0.0.1:8001"
	@echo "  make backend-lan       Run backend (LAN) on 0.0.0.0:8001"
	@echo "  make frontend          Run frontend (local) on :$(FRONTEND_PORT), proxying /api + /ws to $(BACKEND_ORIGIN)"
	@echo "  make frontend-lan      Run frontend (LAN) on :$(FRONTEND_PORT), proxying /api + /ws to $(BACKEND_ORIGIN)"
	@echo "  make frontend-install  npm install in frontend/"
	@echo "  make dev               Run backend-lan + frontend-lan together (Linux/macOS)"
	@echo "  make test              Run backend tests"
	@echo "  make gen-types         Regenerate frontend TS types from OpenAPI schema"
	@echo "  make clean             Clean backend artifacts"

# Dev-origin mode (L1/L8): the WebAuthn relying party — and the cookie's `Secure` flag —
# follow the request's own `Origin`, so `http://localhost:8000` can register a passkey and
# the phone's `http://192.168.178.78:8000` keeps its session cookie. The boot guard refuses
# this flag under APP_ENV=production; docker-compose.yml never sets it.
DEV_AUTH_ENV := AUTH_DEV_ORIGIN=1 APP_ENV=development

backend:
	$(DEV_AUTH_ENV) $(MAKE) -C $(BACKEND_DIR) run PY=$(BACKEND_PY)

backend-lan:
	$(DEV_AUTH_ENV) $(MAKE) -C $(BACKEND_DIR) run-lan PY=$(BACKEND_PY)

test:
	$(MAKE) -C $(BACKEND_DIR) test PY=$(BACKEND_PY)

lint:
	$(MAKE) -C $(BACKEND_DIR) lint

format:
	$(MAKE) -C $(BACKEND_DIR) format

clean:
	$(MAKE) -C $(BACKEND_DIR) clean

gen-types:
	bash scripts/gen_types.sh

# Frontend targets load the right Node (Vite 7 needs >=20.19 / >=22.12) via nvm
# when available — see scripts/node-env.sh and .nvmrc.
NODE_ENV_SH := . scripts/node-env.sh;

frontend-install:
	$(NODE_ENV_SH) cd $(FRONTEND_DIR) && npm install

frontend:
	$(NODE_ENV_SH) cd $(FRONTEND_DIR) && BACKEND_ORIGIN=$(BACKEND_ORIGIN) npm run dev -- --port $(FRONTEND_PORT)

frontend-lan:
	$(NODE_ENV_SH) cd $(FRONTEND_DIR) && BACKEND_ORIGIN=$(BACKEND_ORIGIN) npm run dev -- --host 0.0.0.0 --port $(FRONTEND_PORT)

# Runs both concurrently (Linux/macOS). On Windows, use two terminals:
#   make backend-lan
#   make frontend-lan
# NOTE: no `set -m` here, deliberately. Job control puts each background job in its
# own process group, and Ctrl+C only signals the *foreground* group — so the two
# servers survived every Ctrl+C, were reparented to init and kept holding 8000/8001.
# That is where "Address already in use" came from, and a stale vite serving a white
# screen after a file it had cached was deleted. Without job control the children
# share this shell's group, so a terminal's Ctrl+C reaches them, and the trap covers
# SIGTERM and a closed terminal (SIGHUP) as well. `kill 0` targets the *group*, which
# is the point: killing `make backend-lan` alone leaves the `python run.py` grandchild
# holding the port.
#
# EXIT is deliberately NOT in the trap list. It fires on *any* exit, a `make -n` dry
# run included, and `kill 0` then takes down whatever process group make happened to
# be running in — which is fine in a terminal and destructive when make is driven by a
# script or a tool. Signals only.
dev:
	@echo "Starting backend (LAN) + frontend (LAN) ..."
	@bash -c 'trap "kill 0" INT TERM HUP; \
		$(MAKE) backend-lan & \
		$(MAKE) frontend-lan & \
		wait'
