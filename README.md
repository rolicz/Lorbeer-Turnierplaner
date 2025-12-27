# EA FC Tournament Planner (Monorepo)

A small tournament planner for EA FC nights.
Supports **1v1** and **2v2** formats for small groups, generates fixtures, lets you enter live results, assign clubs **per match**, and keeps tournament history.
Designed to be snappy and work well on both mobile and desktop.

---

## Repo structure

```
.
├── backend/   # FastAPI + SQLModel (SQLite) + JWT auth + WebSocket
├── frontend/  # React + Vite + Tailwind (responsive UI)
└── deploy/    # Caddy reverse proxy config (production)
```

---

## Features (high level)

- Tournament creation (1v1 / 2v2 round-robin style for small groups)
- Live match editing (goals, state, clubs per match side)
- Second leg (all-or-none), reorder matches
- Roles:
  - Reader: read-only (no login)
  - Editor: enter results + normal operations
  - Admin: advanced operations (delete tournaments, edit past, rename, etc.)
- Live updates via WebSocket (`/ws/tournaments/{id}`)
- Challenge Cup tracking (current owner + history), based on finished tournaments in date order

---

## Ports (defaults)

### Development (local/LAN)
- Backend: `http://127.0.0.1:8001`
- Frontend dev server: `http://127.0.0.1:8000`

### Production (Docker + Caddy)
- Public: `https://lorbeerkranz.xyz`
- Backend is **not** exposed directly; it’s behind Caddy at:
  - `https://lorbeerkranz.xyz/api/...`
  - `wss://lorbeerkranz.xyz/ws/...`

---

## Configuration

### Backend: `backend/secrets.json` (required, do not commit)

Create `backend/secrets.json`:

```json
{
  "db_url": "sqlite:////data/app.db",
  "editor_password": "change-me-editor",
  "admin_password": "change-me-admin",
  "jwt_secret": "dev-change-me",
  "log_level": "INFO",
  "cup_initial_owner_player_id": 5
}
```

Notes:
- Use a strong `jwt_secret` in production.
- `cup_initial_owner_player_id` must reference an existing player ID (create one first if needed).
- `db_url` uses `/data/app.db` so it can be persisted via a volume/bind mount in Docker.

Recommended `.gitignore` entries:
```
backend/secrets.json
backend/data/
backend/app.db
frontend/node_modules/
frontend/.env*
```

### Frontend env (Vite)

Vite variables are **build-time** (`VITE_*` is baked into the built frontend).
For local dev, create `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8001
VITE_WS_BASE_URL=ws://127.0.0.1:8001
```

For LAN dev (open UI from other devices), use your machine LAN IP, e.g.:

```env
VITE_API_BASE_URL=http://192.168.178.78:8001
VITE_WS_BASE_URL=ws://192.168.178.78:8001
```

For production behind Caddy, use same-origin routing (recommended), e.g. `frontend/.env.production`:

```env
VITE_API_BASE_URL=/api
# WebSocket base is derived automatically in the frontend (wss://<host>/ws)
VITE_WS_BASE_URL=
```

⚠️ Do **not** use `0.0.0.0` in browser URLs — it’s only for binding servers.

---

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt

# run locally
make run

# run on LAN
make run-lan
```

Docs: `http://127.0.0.1:8001/docs`

### Frontend

```bash
cd frontend
npm install

# local
npm run dev -- --port 8000

# LAN
npm run dev -- --host 0.0.0.0 --port 8000
```

---

## Docker deployment (HTTPS with Caddy)

This setup runs three containers:
- `frontend` (static site)
- `backend` (FastAPI)
- `caddy` (reverse proxy + HTTPS certs)

### 1) DNS + firewall prerequisites

- DNS A record:
  - `lorbeerkranz.xyz` → your server IPv4
- DNS for `www` (recommended):
  - `www` CNAME → `lorbeerkranz.xyz`
- Open ports on the server / Hetzner firewall:
  - TCP **80** and **443**

### 2) Persist SQLite on the host (easy to find)

Recommended bind mount location:
- Host: `./backend/data/app.db`
- Container: `/data/app.db`

Create the directory:
```bash
mkdir -p backend/data
```

Your `docker-compose.yml` backend volume should look like:
```yaml
volumes:
  - ./backend/data:/data
  - ./backend/secrets.json:/app/secrets.json:ro
```

### 3) Caddyfile

Place your Caddyfile at:
- `deploy/Caddyfile`

Typical structure:

```caddyfile
lorbeerkranz.xyz, www.lorbeerkranz.xyz {
  encode gzip

  @api path /api/* /docs* /openapi.json /ws/*
  handle @api {
    reverse_proxy backend:8001
  }

  handle {
    reverse_proxy frontend:80
  }
}
```

### 4) Build + run

From repo root:

```bash
docker compose up -d --build
```

### 5) Logs / debugging

```bash
docker compose ps

# follow logs
docker compose logs -f

# specific services
docker compose logs -f caddy
docker compose logs -f backend
docker compose logs -f frontend
```

Restart just the backend:
```bash
docker compose restart backend
```

Rebuild just backend after code changes:
```bash
docker compose up -d --build backend
```

### 6) Quick smoke tests

```bash
curl -I https://lorbeerkranz.xyz
curl -i https://lorbeerkranz.xyz/api/tournaments
```

---

## Authentication / roles

- **Reader**: no login; read-only access.
- **Editor**: normal write operations (enter results, manage clubs, reorder matches, second leg when allowed, status changes).
- **Admin**: advanced operations (create/rename players, delete tournaments, edit past data, etc.).

Login:
- `POST /auth/login` with `{ "password": "..." }`
- Response contains a JWT token used as:
  - `Authorization: Bearer <token>`

---

## Tournament status

Tournament status is:
- `draft` → `live` → `done`

API:
- `PATCH /tournaments/{tournament_id}/status` with body `{ "status": "draft" | "live" | "done" }`

---

## Tests

Backend tests:

```bash
cd backend
make test
```

---

## Notes

- WebSocket endpoint: `/ws/tournaments/{tournament_id}`
- Behind Caddy, websockets should use **wss** automatically via the same domain.
- Frontend env is build-time; after changing `frontend/.env.production`, rebuild the frontend image (`docker compose up -d --build frontend`).

