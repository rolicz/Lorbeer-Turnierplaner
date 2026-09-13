# Lorbeerkranz Tournament Planner (Monorepo)

A small tournament planner for EA FC nights, branded as **Lorbeerkranz**.
Supports **1v1** and **2v2** formats for small groups, generates fixtures, lets you enter live results, assign clubs **per match**, and keeps tournament history.
Designed to be snappy and work well on both mobile and desktop.

> **Working on the code?** `AGENTS.md` in this repo root is the canonical project knowledge
> (commands, conventions, data semantics, deploy quirks, gotchas) and `DESIGN.md` is the visual
> canon every UI change follows. This README is the setup/ops narrative; when the two disagree,
> `AGENTS.md` is newer.

---

## Important first

### Push notifications (PWA)

Push notifications are now built in for the installed PWA on:
- Android
- iPhone / iPad Home Screen web app

Covered events:
- Tournament comments
- Guestbook entries
- Anpoebeln / pokes
- Tournament created / updated / date changed / schedule generated / deleted
- Match started / finished / score changed
- Friendlies created / started / finished / score changed

Quick setup:

```bash
cd backend
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python manage.py generate-vapid --private-key-out ./vapid_private_key.pem
```

Then add the generated values to `backend/secrets.json`:

```json
{
  "push_vapid_public_key": "YOUR_PUBLIC_KEY",
  "push_vapid_private_key_file": "./vapid_private_key.pem",
  "push_vapid_subject": "mailto:you@example.com",
  "push_ttl_seconds": 300
}
```

Client usage:
- Logged-in users enable notifications from the bell menu in the top bar.
- iOS requires the app to be installed to the Home Screen first.
- Standard web push uses a service worker; the app includes `frontend/public/sw.js` for background delivery.

Production / Docker:
- Generate the private key into `backend/data/vapid_private_key.pem`.
- Set `PUSH_VAPID_PUBLIC_KEY` and `PUSH_VAPID_SUBJECT` in the compose environment or `.env`.
- `docker-compose.yml` already points `PUSH_VAPID_PRIVATE_KEY_FILE` at `/data/vapid_private_key.pem`.
- The frontend/proxy config now serves `sw.js` as `no-store`, and Caddy forwards `/ws/...` without stripping the `/ws` prefix.

---

## Repo structure

```
.
├── backend/    # FastAPI + SQLModel (SQLite) + JWT auth + WebSocket
├── frontend/   # React 18 + Vite 7 + Tailwind 3 + TanStack Query (responsive PWA)
├── deploy/     # Caddy reverse proxy config (production)
├── scripts/    # gen_types.sh (OpenAPI → TS), node-env.sh (nvm loader for the make targets)
├── AGENTS.md   # canonical project knowledge (commands, conventions, gotchas)
├── DESIGN.md   # the visual canon (surfaces, tokens, type scale, primitives)
└── FEATURES_*.md / REFACTORING_PLAN.md   # per-batch work trackers with decisions + deviations
```

---

## Features (high level)

- Tournament creation (1v1 / 2v2 round-robin style for small groups; 1v1 supports 3-6 players, 2v2 supports 4-6)
- Live match editing (goals, state, clubs per match side) + live updates via WebSocket
- Second leg (all-or-none), reorder matches, swap sides
- Player-based auth (case-insensitive username + password), with roles:
  - Reader: read-only (no login)
  - Editor: normal write operations
  - Admin: advanced operations (delete tournaments, rename players, etc.)
- Player profiles: avatar + 16:9 header image + about text + guestbook (owner-editable, public-readable)
- **Multiple cups** (configurable keys/names + optional start date), each with owner + history
- Tournament & match **comments** (edit, delete, pin one tournament comment), real-time updates
- **Unread comments** indicators/actions (stored locally in the browser): jump to latest unread + mark all read
- Comment images + profile images (cropped in UI), stored on disk
- Push notifications for installed PWAs (Android and iOS Home Screen)
- Stats page — one layout with four sections, addressable via `?view=`:
  - **Overview** (`?sub=`): Table (incl. Elo-like ratings) · Positions · Streaks · Records · Cups
  - **Trends**: pinch/pan chart over Points · Goals · Conceded · Goal diff · Win % · Elo · Form
  - **H2H**: Players (matrix + rivals) · Duos, plus a **Matchup** drill-in listing every match between two players (`?player=<a>&vs=<b>`)
  - **Player**: profile, key numbers, form, club stars, streak chips, match history
  - Mode (Overall / 1v1 / 2v2) and Source (Tournaments / Both / Friendlies) are global filters in a floating filter pill
- Friendlies page: create friendly matches and store them in DB (admin can delete); supported as optional data scope in stats
- “Bookmaker-style” prematch odds (form, ratings, direct duels, partner synergy, club stars, etc.)
- Mobile navigation: a fixed bottom tab bar (Dashboard · Tournaments · Friendlies · Stats · Players)
  where each tab returns to the last page you had open inside it; back (chevron **and** swipe)
  goes up the hierarchy, and every history entry keeps its scroll position
- Tabbed pages keep their tab in the URL as `?tab=` so every view is deep-linkable
- **No runtime CDN**: icons are bundled `lucide-react` components, flags come from the
  `flag-icons` package and club crests are served by our own backend — the PWA works offline-first

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
  "player_accounts": [
    { "name": "Roli", "password": "change-me", "admin": true },
    { "name": "Flo", "password": "change-me", "admin": false }
  ],
  "jwt_secret": "dev-change-me",
  "ws_require_auth": false,
  "log_level": "INFO",
  "push_vapid_public_key": "",
  "push_vapid_private_key_file": "./vapid_private_key.pem",
  "push_vapid_subject": "mailto:you@example.com",
  "push_ttl_seconds": 300
}
```

Notes:
- Use a strong `jwt_secret` in production.
- `db_url` uses `/data/app.db` so it can be persisted via a volume/bind mount in Docker.
- `player_accounts[].name` must match an existing player name (case-insensitive login).
- `admin: true` enables admin privileges for that player account.
- `push_vapid_*` enables browser push delivery for the PWA.

### Media storage (avatars + comment images)

- Media files are stored on disk (not as SQLite blobs).
- Root folder is controlled by `UPLOADS_DIR`:
  - Docker default (in this repo): `/data/uploads`
  - Local fallback: `./data/uploads`
- Files are separated by type:
  - Avatars: `avatars/<player_id>.<ext>`
  - Comment images: `comments/<comment_id>.<ext>`
  - Profile headers: `profile_headers/<player_id>.<ext>`

### Cups config (multiple cups)

The backend loads cup definitions from:
- `CUPS_CONFIG_PATH` (recommended in Docker), or
- fallback: `backend/app/cups.json`

Format (`since_date` and `eras` are optional, ISO `YYYY-MM-DD`):

```json
{
  "cups": [
    {
      "key": "default",
      "name": "Lorbeerkranz",
      "since_date": null,
      "eras": [{ "since": "2026-07-11", "mode": "2v2" }]
    },
    {
      "key": "bauernkranz",
      "name": "Bauernkranz",
      "since_date": "2026-01-05",
      "eras": [{ "since": "2026-07-11", "mode": "1v1" }]
    }
  ]
}
```

Notes:
- Cup `key` is used in URLs (`/cup?key=...`) and in the frontend mapping for cup colors.
- `since_date` means “cup history starts at this date”. Before that, the cup has no owner.
- `eras` (optional) scope which tournaments count toward a cup by **mode**, from a date
  on. Each era is `{ "since": "YYYY-MM-DD", "mode": "1v1" | "2v2" | "any" }`. The era
  active for a tournament dated `d` is the **last** era with `since <= d`; before the
  earliest era the mode is implicitly `"any"`. A tournament counts toward the cup iff its
  date passes `since_date` **and** the active era's mode is `"any"` or equals the
  tournament's mode. Ownership is one continuous fold across era boundaries: the holder
  carries over the boundary, and from then on only qualifying tournaments can move the cup.
  Eras must have valid modes, parseable dates, and no duplicate `since` per cup; leave
  `eras` out (or empty) to keep the classic “every tournament counts” behavior.
  When the era active today scopes a mode, the dashboard/cup page shows a small `1v1`/`2v2`
  pill next to the cup.

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

The frontend needs **Node ≥ 20.19 (or ≥ 22.12)** — Vite 7's floor. `.nvmrc` pins 24 and the
`make frontend`, `make frontend-lan` and `make frontend-install` targets source
`scripts/node-env.sh`, which activates nvm when it is installed, so they work from a login shell
that has no nvm loaded. Running `npm` directly? `. scripts/node-env.sh` first, or make sure
`node -v` is new enough.

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
- `frontend` (built with `node:22-alpine`, served by `nginx:alpine` — see `frontend/Dockerfile`;
  the build step uses `npm install`, not `npm ci`, because the lockfile is generated on glibc/arm64
  and the build image is musl)
- `backend` (FastAPI on `python:3.11-slim`)
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

The Caddyfile lives at `deploy/Caddyfile` and is exactly:

```caddyfile
lorbeerkranz.xyz, www.lorbeerkranz.xyz {
  encode gzip zstd

  handle_path /api/* {
    reverse_proxy backend:8001
  }

  handle /ws/* {
    reverse_proxy backend:8001
  }

  handle {
    reverse_proxy frontend:80
  }
}
```

Note the asymmetry: `handle_path` **strips** the `/api` prefix before proxying, while `handle`
**keeps** `/ws` — the backend mounts its WebSocket routes at `/ws/...`.

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
- **Editor**: normal write operations (enter results, manage clubs, reorder matches, swap sides, second leg when allowed, comments).
- **Admin**: advanced operations (create/rename players, delete tournaments/friendlies, edit past data, etc.).

Login:
- `POST /auth/login` with `{ "username": "...", "password": "..." }`
- Username matching is case-insensitive and resolved via `player_accounts` in `backend/secrets.json`.
- Response contains a JWT token used as:
  - `Authorization: Bearer <token>`

---

## Tournament status

A tournament is `draft` → `live` → `done`, but **status is derived, never set**: the backend
computes it from the states of the tournament's matches (`backend/app/tournament_status.py`) —
all matches `scheduled` → `draft`, all `finished` → `done`, anything in between → `live`. There is
no status endpoint; entering results is what moves a tournament forward.

---

## Tests

Backend tests (from the repo root, so the venv interpreter is used):

```bash
make test           # pytest
make lint           # ruff
```

Frontend checks (`tsc` + eslint + vitest) need Node ≥ 20.19 / ≥ 22.12 — `.nvmrc` pins 24 and the
`make frontend*` targets source `scripts/node-env.sh`, which loads nvm when it is available:

```bash
cd frontend && npm run check
cd frontend && npm run build
```

### Maintenance commands

`backend/manage.py` defaults `--secrets` to `backend/secrets.json`, so it can be run from the
repo root. Anything that opens the DB needs the backend venv interpreter:

```bash
# Seed DB (players / leagues / clubs upsert)
backend/.venv/bin/python backend/manage.py seed --file backend/data/seed.json

# Add one match
backend/.venv/bin/python backend/manage.py add-match --file backend/data/add-match.json

# Reclaim SQLite space after deletes/migrations
backend/.venv/bin/python backend/manage.py vacuum-db

# Optional: refresh SQLite planner statistics
backend/.venv/bin/python backend/manage.py vacuum-db --analyze

# Web push keys (no DB access)
python3 backend/manage.py generate-vapid --private-key-out backend/data/vapid_private_key.pem
```

Backups / dev-data sync (details in `AGENTS.md` §8):

```bash
python3 backend/manage.py backup-local-data        # → backup/local/<ts>/
python3 backend/manage.py backup-deploy-data       # rsync prod backend/data → backup/deploy/<ts>/
python3 backend/manage.py sync-local-from-deploy   # refresh the dev DB from production
```

---

## Notes

- WebSocket endpoints:
  - `/ws/tournaments/{tournament_id}` (live tournament updates + comments updates)
  - `/ws/tournaments` (global “something changed” updates)
  - `/ws/players/{player_id}` (profile-channel events: guestbook, pokes)
- Behind Caddy, websockets should use **wss** automatically via the same domain.
- Frontend env is build-time; after changing `frontend/.env.production`, rebuild the frontend image (`docker compose up -d --build frontend`).
- Live tournament reload button is a full fallback refresh (invalidates/refetches related tournament, comments, cup and stats queries).

### Useful API endpoints (quick reference)

Full, always-current list: `http://127.0.0.1:8001/docs`.

- Me / notifications:
  - `GET /me` (role + acting player for the bearer token)
  - `GET /me/notifications` (bell menu: unread comments, guestbook entries, pokes — each item
    carries the in-app `path` to open, e.g. `/profiles/3?tab=guestbook&entry=17`)
- Cups:
  - `GET /cup/defs`
  - `GET /cup?key=<cupKey>`
- Comments:
  - `GET /tournaments/{id}/comments`
  - `GET /tournaments/comments-summary` (used for unread indicators)
  - `POST /tournaments/{id}/comments` (editor+)
  - Comment author must be either own player or `General` (`author_player_id = null`)
  - `PATCH /comments/{comment_id}` (editor+)
  - `DELETE /comments/{comment_id}` (admin)
  - `GET /comments/{comment_id}/image`
  - `PUT /comments/{comment_id}/image` (editor+)
  - `DELETE /comments/{comment_id}/image` (editor+)
- Players / profiles:
  - `GET /players`
  - `POST /players` (admin)
  - `PATCH /players/{id}` (admin)
  - `GET /players/{id}/profile`
  - `PATCH /players/{id}/profile` (owner)
  - `GET /players/avatars` (meta)
  - `GET /players/{id}/avatar`
  - `PUT /players/{id}/avatar` (owner, overwrites)
  - `DELETE /players/{id}/avatar` (owner)
  - `GET /players/headers` (meta)
  - `GET /players/{id}/header-image`
  - `PUT /players/{id}/header-image` (owner, overwrites)
  - `DELETE /players/{id}/header-image` (owner)
  - `GET /players/{id}/guestbook`
  - `POST /players/{id}/guestbook` (editor+)
  - `DELETE /players/guestbook/{entry_id}` (entry author / profile owner / admin)
- Friendlies:
  - `GET /friendlies`
  - `POST /friendlies` (editor+)
  - `DELETE /friendlies/{friendly_id}` (admin)
- Stats:
  - `GET /stats/overview`
  - `GET /stats/players`
  - `GET /stats/h2h`
  - `POST /stats/h2h-matches` — every match between two sides; body takes `mode`,
    `scope`, `left_player_ids`, `right_player_ids`, `relation` (`opposed` | `teammates`) and
    `exact_teams` (`false` = "these players on opposite sides, whatever the partners"). This is
    what the stats **Matchup** view (`/stats?view=h2h&player=<a>&vs=<b>`) is built on.
  - `GET /stats/streaks`
  - `GET /stats/ratings`, `GET /stats/ratings/history`
  - `GET /stats/player-matches`
  - `POST /stats/odds`
  - Most stats endpoints support `scope=tournaments|both|friendlies`
- Tournaments:
  - `GET /tournaments`, `GET /tournaments/live`, `GET /tournaments/{id}`
  - `GET /tournaments/{id}/stats`
  - `PATCH /tournaments/{id}/date` (admin), `POST /tournaments/{id}/generate` (editor+),
    `POST /tournaments/{id}/reassign` (editor+, 2v2 draft)
- Matches:
  - `PATCH /matches/{id}` (score / state / clubs, editor+)
  - `PATCH /matches/{id}/swap-sides` (editor+)
