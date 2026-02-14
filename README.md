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

- Tournament creation (1v1 / 2v2 round-robin style for small groups; 1v1 supports 3-6 players, 2v2 supports 4-6)
- Live match editing (goals, state, clubs per match side) + live updates via WebSocket
- Second leg (all-or-none), reorder matches, swap sides
- Roles:
  - Reader: read-only (no login)
  - Editor: enter results + normal operations
  - Admin: advanced operations (delete tournaments, edit past, rename, etc.)
- **Multiple cups** (configurable keys/names + optional start date), each with owner + history
- Tournament & match **comments** (edit, delete, pin one tournament comment), real-time updates
- **Unread comments** indicators/actions (stored locally in the browser): jump to latest unread + mark all read
- Comment images (editor/admin upload + crop) and player avatars (admin upload + crop), stored on disk
- Stats page: trends (pan/zoom), head-to-head (lists + matrix), streaks, ratings (Elo-like), player match history
- “Bookmaker-style” odds (prematch-focused; based on form, ratings, direct duels, partner synergy, club stars, etc.)
- Tools page: “Friendly match” sandbox (pick teams/clubs, see odds, enter result; not persisted)

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
  "ws_require_auth": false,
  "log_level": "INFO"
}
```

Notes:
- Use a strong `jwt_secret` in production.
- `db_url` uses `/data/app.db` so it can be persisted via a volume/bind mount in Docker.
- You can override any of these via env vars (e.g. `DB_URL`, `EDITOR_PASSWORD`, `ADMIN_PASSWORD`, `JWT_SECRET`).

### Media storage (avatars + comment images)

- Media files are stored on disk (not as SQLite blobs).
- Root folder is controlled by `UPLOADS_DIR`:
  - Docker default (in this repo): `/data/uploads`
  - Local fallback: `./data/uploads`
- Files are separated by type:
  - Avatars: `avatars/<player_id>.<ext>`
  - Comment images: `comments/<comment_id>.<ext>`

### Cups config (multiple cups)

The backend loads cup definitions from:
- `CUPS_CONFIG_PATH` (recommended in Docker), or
- fallback: `backend/app/cups.json`

Format (`since_date` is optional, ISO `YYYY-MM-DD`):

```json
{
  "cups": [
    { "key": "default", "name": "Lorbeerkranz", "since_date": null },
    { "key": "bauernkranz", "name": "Bauernkranz", "since_date": "2026-01-05" }
  ]
}
```

Notes:
- Cup `key` is used in URLs (`/cup?key=...`) and in the frontend mapping for cup colors.
- `since_date` means “cup history starts at this date”. Before that, the cup has no owner.

### Cup colors (frontend)

Cup colors are defined client-side in `frontend/src/cupColors.ts` by mapping cup keys to existing CSS variables.
If a key is missing, the UI falls back to `--color-accent`.

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

From repo root you can use the convenience targets:

```bash
make backend        # http://127.0.0.1:8001
make frontend       # http://127.0.0.1:8000
make dev            # both on LAN (0.0.0.0)
```

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

Optional but recommended for Linux hosts: create repo-root `.env` so Docker writes files with your host user:
```env
UID=1000
GID=1000
```

Your `docker-compose.yml` backend volume should look like:
```yaml
services:
  backend:
    user: "${UID:-1000}:${GID:-1000}"
    volumes:
      - ./backend/data:/data
      - ./backend/secrets.json:/app/secrets.json:ro
    environment:
      DB_URL: "sqlite:////data/app.db"
      # Optional cups config in the persisted data dir:
      CUPS_CONFIG_PATH: "/data/cups.json"
      UPLOADS_DIR: "/data/uploads"
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

### Maintenance commands

From `backend/`:

```bash
# Seed DB
python manage.py seed --file ./seed.json --secrets ./secrets.json

# Add one match
python manage.py add-match --file ./match.json --secrets ./secrets.json

# Reclaim SQLite space after deletes/migrations
python manage.py vacuum-db --secrets ./secrets.json

# Optional: refresh SQLite planner statistics
python manage.py vacuum-db --analyze --secrets ./secrets.json
```

---

## Notes

- WebSocket endpoints:
  - `/ws/tournaments/{tournament_id}` (live tournament updates + comments updates)
  - `/ws/tournaments` (global “something changed” updates)
- Behind Caddy, websockets should use **wss** automatically via the same domain.
- Frontend env is build-time; after changing `frontend/.env.production`, rebuild the frontend image (`docker compose up -d --build frontend`).
- Live tournament reload button is a full fallback refresh (invalidates/refetches related tournament, comments, cup and stats queries).

### Useful API endpoints (quick reference)

- Cups:
  - `GET /cup/defs`
  - `GET /cup?key=<cupKey>`
- Comments:
  - `GET /tournaments/{id}/comments`
  - `GET /tournaments/comments-summary` (used for unread indicators)
  - `POST /tournaments/{id}/comments` (editor+)
  - `PATCH /comments/{comment_id}` (editor+)
  - `DELETE /comments/{comment_id}` (admin)
  - `GET /comments/{comment_id}/image`
  - `PUT /comments/{comment_id}/image` (editor+)
  - `DELETE /comments/{comment_id}/image` (editor+)
- Player avatars:
  - `GET /players/avatars` (meta)
  - `GET /players/{id}/avatar`
  - `PUT /players/{id}/avatar` (admin, overwrites)
  - `DELETE /players/{id}/avatar` (admin)
- Stats:
  - `GET /stats/players`
  - `GET /stats/h2h`
  - `GET /stats/streaks`
  - `GET /stats/ratings`
  - `GET /stats/player-matches`
  - `POST /stats/odds`
