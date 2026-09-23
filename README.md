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
├── backend/    # FastAPI + SQLModel (SQLite) + cookie sessions, passkeys + WebSocket
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
- **Private by default**: nothing — no page, picture, stat or websocket — is readable without a
  login (see "Authentication" below). Log in with your display name and a password, or with a
  passkey (Face ID / Touch ID); new people join with a one-hour invite code; an admin page shows
  who is logged in from which device
- Player profiles: avatar + 16:9 header image + about text + guestbook (owner-editable, readable
  by everyone who shares a group with that player)
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
- Backend: `http://127.0.0.1:8001` (never opened in a browser — vite proxies to it)
- Frontend dev server: `http://127.0.0.1:8000` — the **only** URL a browser or phone uses; it
  proxies `/api/…` (prefix stripped) and `/ws/…` to the backend, exactly like Caddy in production

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
  "log_level": "INFO",
  "push_vapid_public_key": "",
  "push_vapid_private_key_file": "./vapid_private_key.pem",
  "push_vapid_subject": "mailto:you@example.com",
  "push_ttl_seconds": 300
}
```

Notes:
- `db_url` uses `/data/app.db` so it can be persisted via a volume/bind mount in Docker.
- **`player_accounts[]` is migrated on the first boot and never used for logging in again.** Each
  entry whose `name` matches an existing player (case-insensitively) becomes a real account with
  its password hashed (argon2id); `admin: true` makes that account the site admin and an owner of
  the group. An entry that matches no player is skipped and logged, never created. Leave the list
  in the file until a deploy of this code has been proven on a phone — it is also the login of the
  previous release, i.e. the rollback's — and delete it afterwards.
- `jwt_secret` is only kept so that a phone still holding a pre-cookie login token can trade it for
  a session once (`POST /auth/exchange`); empty means that exchange answers 410. It goes away with
  `player_accounts[]`.
- `push_vapid_*` enables browser push delivery for the PWA.
- New settings, all optional and all with safe defaults (env var or the lower-case key):
  `APP_ENV` (`production` | `development` | `test`; Docker sets `production`), `TRUSTED_PROXY_HOPS`
  (Docker sets `1` for Caddy), `AUTH_ORIGIN` / `AUTH_RP_ID` / `AUTH_RP_NAME` (the passkey relying
  party, default `https://lorbeerkranz.xyz`), `AUTH_DEV_ORIGIN` (development only — the Makefile
  sets it), `PASSWORD_HASH_PROFILE` (`default` | `test`), `SESSION_TTL_DAYS` (90). **An unknown
  `APP_ENV` or `PASSWORD_HASH_PROFILE`, a dev origin in production, or a non-https pinned origin
  makes the backend refuse to boot** and name the setting in its last log line.
- `ws_require_auth` is gone (a websocket always needs the session); an old file that still has it
  loads fine.

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

Cups live in the database. On the first boot of a database with no cups, the backend **imports**
them from:
- `CUPS_CONFIG_PATH` (recommended in Docker), or
- fallback: `backend/app/cups.json`

After that the file is only a seed: it is still validated on every boot (a malformed file stops
the backend), but editing it changes nothing — the backend logs a warning that the file and the
database differ.

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

Vite variables are **build-time** (`VITE_*` is baked into the built frontend). Dev and production
are both **same-origin** — the login is a cookie, and a cookie set by the backend's port would be
invisible to a page served from vite's — so `frontend/.env.local` (dev) holds exactly what the
committed `frontend/.env.production` holds:

```env
VITE_API_BASE_URL=/api
# WebSocket base is derived automatically in the frontend (ws(s)://<host>/ws)
VITE_WS_BASE_URL=
```

An older `.env.local` with absolute `http://…:8001` URLs **must be replaced**: with it the app
logs in and immediately forgets it. In dev, vite's proxy (`frontend/vite.config.ts`) forwards
`/api/…` and `/ws/…` to `BACKEND_ORIGIN` (default `http://127.0.0.1:8001`; `make frontend
BACKEND_ORIGIN=…` overrides it), so a phone on the LAN uses the vite URL alone
(`http://192.168.178.78:8000`).

⚠️ Do **not** use `0.0.0.0` in browser URLs — it’s only for binding servers.

---

## Local development

From repo root you can use the convenience targets:

```bash
make backend        # http://127.0.0.1:8001  (runs with AUTH_DEV_ORIGIN=1 APP_ENV=development)
make frontend       # http://127.0.0.1:8000  (proxies /api and /ws to the backend)
make dev            # both on LAN (0.0.0.0)
```

**Passkeys in dev** work only in a browser on `http://localhost:8000` (a secure context). A phone
on `http://192.168.178.78:8000` is plain HTTP off localhost, so its browser hides WebAuthn and the
app hides "Use a passkey" — passkeys on a phone are production-only (HTTPS). The password login
works everywhere.

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

# run locally (the repo-root `make backend` adds the dev auth env for you)
make run

# run on LAN
make run-lan
```

Docs: `http://127.0.0.1:8001/docs`

### Frontend

```bash
cd frontend
npm install

# local (vite.config.ts already proxies /api and /ws to BACKEND_ORIGIN)
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
      # Auth: production arms the boot guard; Caddy is the one proxy in front.
      APP_ENV: "production"
      TRUSTED_PROXY_HOPS: "1"
```

### 3) Caddyfile

The Caddyfile lives at `deploy/Caddyfile` and is exactly:

```caddyfile
# Import additional site configs (one file per app). Host dir configurable
# via CADDY_SITES_DIR in .env; defaults to the in-repo deploy/sites/.
import /etc/caddy/sites/*.caddy

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

The `import` line lets the same Caddy serve other apps on the server (one `*.caddy` file each in
`${CADDY_SITES_DIR:-./deploy/sites}`). So **recreating the `caddy` container interrupts every site
on the box**, and a checkout older than the commit that added the import would take the other
sites down: deploy with `docker compose up -d --build backend frontend` so Caddy is left alone.

### 4) Build + run

From repo root:

```bash
docker compose up -d --build            # first install
docker compose up -d --build backend frontend   # every later deploy (leaves Caddy alone)
```

The deploy that introduces the login (the auth batch) has its own checklist — backup, a dress
rehearsal against the fresh backup, `manage.py auth-preflight` on the server before `up`, the
exact first-boot log and an escape hatch: see `AGENTS.md` §7.

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
curl -I https://lorbeerkranz.xyz                      # 200 — nginx serves the app shell
curl -s -o /dev/null -w '%{http_code}\n' https://lorbeerkranz.xyz/api/tournaments   # 401 — nothing without a login
docker compose ps                                     # backend "healthy"
```

`/api/health` answers **401 from outside, by design** — only the container's own healthcheck
(loopback) may call it, so `docker compose ps` is the health check. The API answers **405 to
HEAD**, so every `/api` check is a GET; anything that reads data needs a session (a browser, or
`curl -c jar` after a `POST /api/auth/login`).

---

## Authentication / roles

**Nothing is readable without a login.** Every API route, picture and websocket sits behind one
default-deny gate; the only ways in without a session are logging in, registering with a code,
using a reset link and signing in with a passkey. There is no read-only "reader" any more.

Roles (per group; the app has one group today, **Altherren**, and every URL carries it —
`/g/altherren/…`):
- **Member** (= the old editor): enter results, clubs, comments, friendlies, ideas — every
  ordinary write.
- **Owner**: a member who may also create invite codes and make other members owners.
- **Site admin** (Roli): everything, in every group — plus the admin-only operations the old
  "admin" had (delete tournaments/friendlies, rename players, edit past data), reset links and
  other people's devices.
- A logged-in account in **no group** sees only "You're not in a group yet" and a field for a code.

Logging in:
- With your **display name** (case-insensitive — "Flo" displays, "flo" logs in) and a password of
  at least 10 characters, or with a **passkey** ("Use a passkey" — Face ID / Touch ID, no name
  typed). Add a passkey under Settings → Account → Passkeys. An account always keeps **one way
  in**: the last passkey cannot be removed without a password, and the password cannot be removed
  without a passkey. Removing a passkey signs out every device of that account.
- A login is a **session**: an `HttpOnly` cookie, 90 days, renewed as the app is used. Settings →
  Account → Devices lists where you are logged in and signs any of them out; the admin page does
  the same for everyone.
- **New people** register with an **invite code** (`ABCD-EFGH`, single use, valid one hour), which
  an owner or the site admin creates on the admin page (`/g/altherren/admin`) and sends however
  they like; registering with it also joins the group. An existing account can redeem a code under
  Settings → Account → Groups.
- **A forgotten password** is fixed by a **reset link** the site admin creates on the admin page
  (single use, one hour) — or, on the server, `docker compose exec -T backend python manage.py
  reset-link --player <name>`. There is no email.
- The installed iPhone app and Safari have **separate cookie jars**: a link opened from WhatsApp
  opens Safari, which shows the login screen once even though the home-screen app is logged in.
  Expected.
- Login attempts, code redemptions and reset attempts are rate-limited (a countdown, never a
  lockout).

Accounts are created from `player_accounts[]` on the first boot (see Configuration); after that the
database is the only source. Server-side escape hatches, if a login ever breaks:
`manage.py reset-link`, `set-password`, `make-admin`, `invite`, `sessions` (details in `AGENTS.md`
§7–§8).

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
  - `GET /me` (who this session is: role, player, groups, `has_password`, `has_passkey`)
  - `GET /me/notifications` (bell menu: unread comments, guestbook entries, pokes, idea events —
    each item carries the absolute in-app `path` to open, e.g.
    `/g/altherren/profiles/3?tab=guestbook&entry=17`)
- Auth (public: `login`, `exchange`, `register`, `reset`, `passkeys/login/*`; everything else needs
  a session):
  - `POST /auth/login`, `POST /auth/logout`, `POST /auth/register`, `POST /auth/redeem`,
    `POST /auth/reset`, `POST /auth/exchange` (one-time: a pre-cookie token → a session)
  - `POST /auth/password`, `DELETE /auth/password`
  - `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/sessions/revoke-others`
  - `POST /auth/passkeys/register/options|verify`, `GET /auth/passkeys`,
    `DELETE /auth/passkeys/{id}`, `POST /auth/passkeys/login/options|verify`
- Admin (owner+; the four marked are site admin only):
  - `GET /admin/accounts`, `POST|GET /admin/invites`, `DELETE /admin/invites/{id}`,
    `PUT /admin/groups/{slug}/members/{pid}/role`
  - site admin: `GET /admin/accounts/{pid}/sessions`, `DELETE /admin/sessions/{sid}`,
    `POST /admin/accounts/{pid}/revoke-sessions`, `POST /admin/reset-links`
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
  - `GET /players/{id}/profile` (someone who shares a group with that player, or the site admin —
    the same for the guestbook, pokes, avatar and header image below)
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
