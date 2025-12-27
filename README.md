# EA FC Tournament Planner (Monorepo)

A small tournament planner for EA FC nights.
Supports 1v1 and 2v2 formats for small groups, generates fixtures, lets you enter live results, assign clubs per match, and keep tournament history.
Designed to be snappy and work well on both mobile and desktop.

---

## Repo structure

```
.
├── backend/   # FastAPI + SQLite + JWT auth + WebSocket
└── frontend/  # React + Vite + Tailwind (responsive UI)
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+ (20+ recommended)
- npm

---

## Default ports

- Backend: `http://127.0.0.1:8001`
- Frontend (dev): `http://127.0.0.1:8000`

---

## Configuration

### Backend: `backend/secrets.json` (required)

This file contains local secrets and settings and **must not be committed**.

Create `backend/secrets.json`:

```json
{
  "jwt_secret": "dev-change-me",
  "editor_password": "change-me-editor",
  "admin_password": "change-me-admin",
  "db_url": "sqlite:///./app.db",
  "cors_allow_origins": [
    "http://localhost:8000",
    "http://127.0.0.1:8000"
  ],
  "cup_initial_owner_player_id": 5,
  "log_level": "INFO"
}
```

Field meanings:
- `jwt_secret`: secret used to sign JWTs (change for anything beyond local dev).
- `editor_password`: login password for role level 2 (editor).
- `admin_password`: login password for role level 3 (admin).
- `db_url`: SQLModel/SQLAlchemy DB URL (SQLite by default).
- `cors_allow_origins`: browser origins allowed to call the backend.

**LAN note:** if you access the frontend from another device, add the LAN origin, e.g. `http://192.168.178.10:8000`.

---

### Frontend: `frontend/.env` (recommended)

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8001
VITE_WS_BASE_URL=ws://127.0.0.1:8001
```

**LAN note:** If you open the frontend from another device, use the backend machine LAN IP:

```env
VITE_API_BASE_URL=http://192.168.178.10:8001
VITE_WS_BASE_URL=ws://192.168.178.10:8001
```

Do **not** use `0.0.0.0` in browser/client URLs (it’s only for binding servers).

---

## Quick start

### Backend

Install dependencies in a local venv:

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
```

Run locally:

```bash
cd backend
make run
# docs: http://127.0.0.1:8001/docs
```

Run on LAN:

```bash
cd backend
make run-lan
# docs: http://<your-lan-ip>:8001/docs
```

---

### Frontend

Install deps:

```bash
cd frontend
npm install
```

Run locally:

```bash
cd frontend
npm run dev -- --port 8000
# http://127.0.0.1:8000
```

Run on LAN:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 8000
# http://<your-lan-ip>:8000
```

---

## Repo-root Makefile (optional convenience)

If you have a repo-root `Makefile`, you can run:

```bash
make backend-lan
make frontend-lan
```

On Linux/macOS you can run both concurrently:

```bash
make dev
```

On Windows: use two terminals.

---

## Authentication / roles

- **Reader**: no login; read-only.
- **Editor**: normal write operations (enter results, create tournaments with existing players, manage clubs).
- **Admin**: advanced operations (create players, reorder matches, edit tournaments, enable second leg, etc.).

Login:
- `POST /auth/login` with `{ "password": "..." }`
- Response contains a JWT token used as:
  - `Authorization: Bearer <token>`

---

## Live updates (WebSocket)

Frontend connects to:

- `ws://<backend>/ws/tournaments/{tournament_id}`

Backend broadcasts events when something changes; the frontend invalidates React Query caches and updates the live view.

---

## Finalising a tournament

Tournament status is:

- `draft` / `live` / `done`

API:

- `PATCH /tournaments/{tournament_id}/status` with body `{ "status": "done" }`

---

## Tests

Backend tests:

```bash
cd backend
make test
```

---

## Do not commit (recommended)

Add these to your `.gitignore`:

- `backend/secrets.json`
- `backend/app.db`
- `frontend/node_modules/`
- `frontend/.env`
