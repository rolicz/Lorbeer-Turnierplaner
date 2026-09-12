# Lorbeerkranz Tournament Planner — Project Knowledge (canonical)

> **This file is the single source of truth for agents and humans working on this repo.**
> It is tool-agnostic: `CLAUDE.md` and `GEMINI.md` only point here. When you learn something
> non-obvious about the project (deploy quirks, data semantics, decisions), **update this file**
> so the knowledge survives model/tool switches. Keep the "Current state" section dated.
>
> Last full review: 2026-09-12 (main at `b56b1fb`).

---

## 1. What this is

A private, mobile-first web app for a small friend group's **EA FC (FIFA) nights**. It plans
1v1 / 2v2 round-robin tournaments, records live results, tracks two rotating "cups"
(Lorbeerkranz = 2v2, Bauernkranz = 1v1, since 2026-07-11), keeps history, stats, ratings, odds,
comments/guestbook/pokes, and sends push notifications to installed PWAs. UI language is English,
notification texts are Styrian dialect / German / English (user-selectable). Public at
`https://lorbeerkranz.xyz` (reader = no login; editors/admins log in with player accounts).

Owner/maintainer: Roli (admin account, knows the frontend better than the backend).
Players are a fixed small set (5 in seed; e.g. Roli, Berni, Flo).

## 2. Stack & repo layout

| Part | Tech | Entry |
|---|---|---|
| `backend/` | Python 3.11, FastAPI 0.115, SQLModel 0.0.22 (SQLite), PyJWT, httpx (web push), uvicorn | `backend/run.py` → `app/main.py:create_app()` |
| `frontend/` | React 18, Vite 5, TypeScript 5 (strict), Tailwind 3, TanStack Query 5, react-router 6, framer-motion, lucide-react, flag-icons | `frontend/src/main.tsx` → `src/app/App.tsx` |
| `deploy/` | Caddy 2 reverse proxy + auto-HTTPS | `deploy/Caddyfile` |
| root | `docker-compose.yml` (backend + frontend/nginx + caddy), `Makefile`, `scripts/gen_types.sh` | |
| `backup/` | git-ignored local + prod data snapshots (see §8) | |

Size (2026-09): backend ≈ 14.7k LOC Python, frontend ≈ 29k LOC TS/TSX (excl. generated + tests).

### Backend modules
- `app/routers/*.py` — HTTP endpoints (auth, me, tournaments, matches, clubs, players, cup, stats,
  comments, friendlies, push). Routers should stay thin; bodies live in `app/services/`.
- `app/services/` — `tournament_view.py` (serialization), `tournament_list.py`, `events.py`
  (WS broadcasts), `notifications.py` + `webpush.py` + `notification_texts.py` (push pipeline),
  `cup.py` (cup ownership fold), `file_storage.py` (media on disk), `authorization.py`
  (owner/admin guards), `comments_view.py`, `guestbook*.py`, `poke_summary.py`,
  `stats/` (players, h2h, streaks, ratings, odds, player_matches, core, scope, registry).
- `app/models.py` — all SQLModel tables. `app/schemas/requests.py` + `responses.py` — pydantic
  bodies/response models (**response models drive the generated frontend types**).
- `app/db.py` — engine + `init_db()` (create_all + additive runtime columns + backfills).
- `app/auth.py` — JWT + role deps. `app/cup_defs.py` — cups.json loader/validator.
- `app/scheduling.py` — fixture generation (1v1 all pairs; 2v2 circle-method partnerships).
- `app/tournament_status.py` — **status is derived from match states** (see §5).
- `app/seed.py`, `app/league_nations.py`, `app/validation.py`, `app/tools/sync_club_crests.py`.
- `app/stats.py` — legacy compat module for an old `/players/stats` endpoint; nothing imports it
  (safe to delete when convenient).
- `manage.py` — CLI: seed, add-match, vacuum-db, generate-vapid, backups/sync (§8).

### Frontend modules
- `src/api/` — `client.ts` (`apiFetch`, `apiUpload`, `mediaUrl`, central 401 → `api:unauthorized`
  event), one `*.api.ts` per resource, `queryKeys.ts` (`qk` factory — **always use it**),
  `types.ts` (aliases over `generated/schema.d.ts` + a few deliberate narrowings), `generated/`
  (from OpenAPI via `make gen-types`; never hand-edit).
- `src/hooks/realtime/` — pooled WebSocket layer (`connection.ts`: heartbeat 25s, liveness 35s,
  backoff), `wsEvents.ts` (event contract mirror of `services/events.py`), `applyEvent.ts`
  (cache merge), `RealtimeProvider.tsx`.
- `src/pages/` — dashboard, tournaments (+ `live/` tournament page, match detail, comments,
  admin panel), stats (tabs: players, trends, h2h, streaks, ratings, stars, matches),
  profile, players admin, clubs, friendlies (`tools/`), settings, login.
- `src/ui/` — `primitives/` (Button, Card, CardSection, Modal, Sheet, Input, Pill, EmptyState,
  LoadingPlaceholder, MatchOverviewPanel, …), `shell/` (AppShell, Sidebar desktop, MobileChrome,
  navConfig, routeMeta/contextual back, NotificationBell), `ClubBadge`, `NationFlag`,
  `ClubCombobox`, `SectionTabs`.
- `src/themes/*.css` — CSS-variable themes (blue default, dark, red, light, green) consumed by
  Tailwind via `rgb(var(--color-*))`. `src/styles.css` holds shared component classes.
- `src/push/` — service-worker registration + subscription; `public/sw.js` handles push/click.
- `src/auth/AuthContext.tsx` — token/role in localStorage; "view as lower role" and admin
  "act as player" overrides are frontend-only conveniences.

## 3. Commands

```bash
# one-time setup
cd backend && python3 -m venv .venv && ./.venv/bin/python -m pip install -r requirements.txt
cd frontend && npm install

# dev servers (repo root). Backend 127.0.0.1:8001, frontend :8000 (LAN variants bind 0.0.0.0)
make backend        # or: make backend-lan
make frontend       # or: make frontend-lan
make dev            # both, LAN

# checks — run before every commit
make test           # backend pytest   (baseline 115 tests green, ~3.5 min on the Pi, 2026-09-12)
make lint           # ruff (E/W/F/I; line-length 150)
make gen-types      # regenerate frontend/src/api/generated/schema.d.ts after ANY response-model change
cd frontend && npm run check   # tsc + eslint + vitest (baseline 158 tests in 18 files green)
cd frontend && npm run build   # tsc -b + vite build (run for structural changes)
```

- `make format` = ruff format. Frontend has no prettier; match surrounding style.
- Backend API docs: `http://127.0.0.1:8001/docs`.
- Dev machine is a Raspberry Pi 5 (arm64, LAN IP 192.168.178.78). `frontend/.env.local` points
  the dev UI at `http://192.168.178.78:8001` so phones on the LAN can test the PWA.
- **Ports 8000, 8001, 8010 (and 5173) belong to Roli's long-running dev services** (this project
  and others). For throwaway verification stacks use other ports (e.g. backend 8003, vite 8020)
  and a *copy* of the DB.

## 4. Configuration & secrets

**Backend** reads, in precedence order: CLI flag → env var → `backend/secrets.json` → default
(`app/settings.py`). `secrets.json` is git-ignored and **must never be read or printed by
agents** (Roli declined that explicitly). Template: `backend/secrets.json.example`.

| Key (secrets.json / ENV) | Meaning |
|---|---|
| `db_url` / `DB_URL` | SQLite URL. Dev: `sqlite:///./app.db` (→ `backend/app.db`). Docker: `sqlite:////data/app.db`. |
| `player_accounts[]` | `{name, password, admin}`; `name` must match an existing `Player.display_name` (case-insensitive). admin=true → role admin, else editor. |
| `jwt_secret` / `JWT_SECRET` | HS256 secret; tokens last 180 days. |
| `ws_require_auth` | If true, WS connections need `?token=`. Default false (public read). |
| `push_vapid_public_key`, `push_vapid_private_key_file`, `push_vapid_subject`, `push_ttl_seconds` | Web push (VAPID). Private key PEM lives in `backend/data/vapid_private_key.pem` (dev) / `/data/vapid_private_key.pem` (prod). |
| `CUPS_CONFIG_PATH` (env) | Cup definitions JSON; falls back to bundled `backend/app/cups.json`. Prod: `/data/cups.json`. Validated at startup — **malformed config = backend refuses to boot**. |
| `UPLOADS_DIR` (env) | Media root. Docker `/data/uploads`; local fallback `./data/uploads`. |
| `CORS_ALLOW_ORIGINS` (env) | Default `*`. |

**Frontend** (Vite, build-time only): `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`.
`frontend/.env.production` (committed) = `/api` and empty WS base (derived from `window.location`
→ `wss://host/ws`). Never use `0.0.0.0` in browser URLs.

**Cups config** (`cups.json`): list of `{key, name, since_date?, eras?}`; era =
`{since: YYYY-MM-DD, mode: 1v1|2v2|any}`; the last era with `since <= tournament.date` applies.
Current prod config (mirrored in `backend/app/cups.json` and `backend/data/cups.json`):
`default`/Lorbeerkranz → 2v2 since 2026-07-11; `bauernkranz`/Bauernkranz → since_date 2026-01-05,
1v1 since 2026-07-11. Cup colors are mapped client-side in `frontend/src/cupColors.ts`.

## 5. Data model & persistence rules

- **SQLite, no migration framework.** Schema = `SQLModel.metadata.create_all()` +
  `_RUNTIME_COLUMNS` in `app/db.py` (idempotent `ALTER TABLE ADD COLUMN`) + idempotent startup
  backfills (`backfill_league_nations`). Rules for schema changes:
  1. Prefer **new tables** (e.g. `TournamentPinnedComment`, `CommentAuthorLink`, `ClubCrestFile`)
     over altering existing ones.
  2. If a column is unavoidable: nullable/defaulted, add it to `_RUNTIME_COLUMNS`, never rename/drop.
  3. Old code must boot against the migrated DB (rollback safety). Backfills only write NULL rows.
  4. No manual server steps unless unavoidable; if needed, document them in §7 and the plan file.
- Tables: `Tournament` (mode 1v1|2v2, `status` column exists but see below, date, decider_*),
  `Player`, `TournamentPlayer`, `Match` (leg 1|2, order_index, state scheduled|playing|finished),
  `MatchSide` (side A|B, club_id, goals) + `MatchSidePlayer`, `FriendlyMatch`/`FriendlyMatchSide`/
  `FriendlyMatchSidePlayer`, `League` (name unique, `nation` flag code), `Club` (name+game unique,
  star_rating 0.5–5 in 0.5 steps, league_id), `ClubCrestFile`, `PlayerProfile`,
  `PlayerAvatarFile`, `PlayerHeaderImageFile`, `PlayerGuestbookEntry` (+ThreadLink, Vote, Read),
  `PlayerPoke` (+Read), `Comment` (+Read, Vote, ImageFile, ThreadLink, AuthorLink),
  `TournamentPinnedComment`, `PushSubscription`, `PushSubscriptionPreference`.
- **Tournament "live/done/draft" is derived from match states** (`tournament_status.py`): all
  scheduled → draft, all finished → done, otherwise live. There is a `status` column and a
  `PATCH /tournaments/{id}/status` mention in the README, but the API/UI treat match states as
  truth. "Live now" = a tournament whose matches are mixed/playing.
- **Cup ownership** is a fold over qualifying finished tournaments (`services/cup.py`): winner =
  unique top of standings, else the decider winner (`decider_type` none|penalties|match|
  scheresteinpapier). Ties without decider → no winner, holder keeps the cup.
- **Media** are files on disk, metadata rows in DB: `uploads/avatars/{player_id}.{ext}`,
  `profile_headers/{player_id}.{ext}`, `comments/{comment_id}.{ext}`, `club_crests/{club_id}.{ext}`.
  Served by the backend with cache-busting `?v=<updated_at>` (`mediaUrl()`).
- Stats scopes: `tournaments | both | friendlies`. Ratings are Elo-like per mode.
- Push: languages `steirisch` (default) | `deutsch` | `english`; modes `finished_only` (default)
  | `all` | `off`; personal events (pokes, guestbook) go only to the addressed player.
  Dispatcher is started in the FastAPI lifespan.

## 6. API & realtime contract (short map)

Prefixes: `/auth/login`, `/me`, `/me/notifications`, `/tournaments…` (list, `/live`, detail,
create, patch, `/date`, `/generate`, `/reorder`, `/second-leg`, `/stats`, `/decider`,
`/reassign`, delete, comments), `/matches/{id}` (patch score/state/clubs, `/swap-sides`),
`/clubs` (+`/leagues`, `/{id}/crest`), `/players…` (profiles, avatars, headers, guestbook, pokes,
read-maps), `/cup?key=`, `/cup/defs`, `/stats/{overview,players,h2h,h2h-matches,streaks,
player-matches,ratings,ratings/history,odds}`, `/friendlies`, `/push/{config,subscription,
subscriptions/me,test}`, `/comments/…`, `/health`.
Roles: `reader` (no token) < `editor` < `admin`; deps `require_editor` / `require_admin`;
owner-only checks in `services/authorization.py`. Error helpers in `app/api_utils.py`
(400/403/404/409).

WebSocket channels (`app/main.py`, `app/ws.py`, `services/events.py`):
- `/ws/tournaments/{id}` → `tournament.sync` (full tournament payload), `tournament.deleted`,
  `comment.upsert|delete|meta`.
- `/ws/tournaments` → coarse `tournaments.changed {action, tournament_id?, status?}`.
- `/ws/players/{id}` → profile-channel events.
Every envelope carries `ts` + monotonic `seq`; the frontend resyncs on gaps/reconnect.
Behind Caddy the `/ws` prefix is **not** stripped (`handle /ws/*`), `/api` **is** (`handle_path`).

## 7. Deployment (production)

- **Host:** Hetzner VPS, SSH alias `hetzner` (user `rczerny`, defined in `~/.ssh/config`).
  Repo checkout on the server: `/home/rczerny/projects/Lorbeer-Turnierplaner`
  (GitHub remote `git@github.com:rolicz/Lorbeer-Turnierplaner.git`, branch `main`).
- **Runtime:** `docker compose` with three services — `backend` (python:3.11-slim, non-root
  `${UID}:${GID}`, healthcheck `/health`, bind mounts `./backend/data:/data` and
  `./backend/secrets.json:/app/secrets.json:ro`), `frontend` (node:20 build → nginx:alpine,
  `frontend/nginx.conf`: hashed assets immutable, `index.html`/`sw.js`/manifest `no-store`,
  SPA fallback), `caddy` (ports 80/443, `deploy/Caddyfile`, certs in named volumes).
- **Persistent data on the server** = `backend/data/` (`app.db`, `cups.json`,
  `vapid_private_key.pem`, `uploads/{avatars,profile_headers,comments,club_crests}`) plus the
  git-ignored `backend/secrets.json`. Nothing else is stateful.
- **Standard deploy** (run on the server):
  ```bash
  ssh hetzner
  cd ~/projects/Lorbeer-Turnierplaner && git pull && docker compose up -d --build
  docker compose logs -f backend      # expect "Cup defs validated", "DB initialized"
  ```
  Only the frontend changed → `docker compose up -d --build frontend` (Vite env is baked in).
- **Deploy checklist** (do these in order, before/after `up -d --build`):
  1. Local: `make test && make lint && cd frontend && npm run check && npm run build` green,
     `make gen-types` yields no diff, work merged to `main` and pushed.
  2. Take a prod data backup first: `python3 backend/manage.py backup-deploy-data` (rsync over SSH
     into `backup/deploy/<ts>/`). Cheap insurance; SQLite + uploads are small.
  3. If cup config changed: edit `/data/cups.json` on the server **by hand** (it is not in git);
     a typo makes the backend exit at startup — check `docker compose logs backend`.
  4. After a schema/backfill change: confirm the one-time log line (e.g.
     `League nations backfilled: 39`) and that the app loads.
  5. After changes that need new media (e.g. club crests): run the tool inside the container,
     e.g. `docker compose exec backend python -m app.tools.sync_club_crests` (done on prod
     already; 591/597 crests present as of the 2026-08-20 snapshot).
  6. Smoke: `curl -I https://lorbeerkranz.xyz`, `curl https://lorbeerkranz.xyz/api/health`,
     open the PWA on a phone, check cup owners on the dashboard and one live/done tournament.
- **Rollback:** `git checkout <previous-sha> && docker compose up -d --build`. Schema changes are
  additive, so old code boots on the new DB. If data must be restored, rsync the desired
  `backup/deploy/<ts>/data/` back to `backend/data/` on the server and restart backend.
- **Not automated:** there is no CI/CD, no GitHub Actions, no scheduled backups. Deploys and
  backups are manual from this dev machine.
- Push notifications on prod need `PUSH_VAPID_PUBLIC_KEY` and `PUSH_VAPID_SUBJECT` in the
  server's root `.env` (compose passes them through) and the PEM at `/data/vapid_private_key.pem`.

## 8. Backups & dev-data sync (`backend/manage.py`)

```bash
python3 backend/manage.py backup-local-data          # → backup/local/<ts>/data/…
python3 backend/manage.py backup-deploy-data         # rsync prod backend/data → backup/deploy/<ts>/
python3 backend/manage.py sync-local-from-deploy     # backup local, pull prod, mirror prod into dev
```
`sync-local-from-deploy` is how Roli refreshes the dev DB with real data (last runs: 2026-08-20,
2026-08-08, 2026-07-12…). It writes the prod DB to **both** `backend/app.db` and
`backend/data/app.db`, mirrors `uploads/`, `cups.json`, `*.pem`. Snapshots are named
`<ts>-before-sync` (local) and `<ts>-deploy` (prod) and carry a `snapshot.json`. `backup/` is
git-ignored; the latest deploy snapshot is the best offline picture of production.
Other helpers: `seed --file backend/data/seed.json` (players/leagues/clubs upsert),
`add-match --file`, `vacuum-db [--analyze]`, `generate-vapid`.

## 9. How work is done here (conventions)

- **Planning files at the repo root are the trackers**: `REFACTORING_PLAN.md` (cleanup, done),
  `FEATURES_2026-07.md` (T1–T11, done), `FEATURES_2026-08.md` (G1–G8, done). A new batch gets a
  new dated file with the same shape: baseline commit, rules for implementing agents, decisions
  already made, one section per task with exact files/symbols, definition of done, deviations
  notes, verification gates, deployment notes. Plans must be mechanical enough that a cheaper
  model can implement them without making design choices.
- **Branching:** feature/refactor work on a branch off `main` (`feature/<yyyy-mm>-<topic>`),
  one task per commit with the task ID (`feat(G3): …`, `refactor(A1): …`, `fix(T10): …`),
  merged to `main` when the batch is verified. `main` is what gets deployed.
- **Commit/push only when Roli says so** — never after every prompt. Leave the tree dirty and
  report what is ready.
- **Model policy** (Roli's choice): high-effort model (Fable/Opus) for analysis, planning,
  review, verification; cheaper models (Sonnet) for mechanical implementation; **never Haiku**.
  Minimize model switches. `/refactor-task` (`.claude/commands/refactor-task.md`) shows the
  kickoff pattern for plan-driven sessions.
- **Verification gates:** backend touched → `make test` + `make lint`; response models touched →
  `make gen-types` and commit `schema.d.ts` in the same commit; frontend touched →
  `npm run check` (+ `npm run build` for structural changes). UI must work at ~375px and ≥1024px;
  verify in a real browser (Playwright against an isolated stack on spare ports + DB copy).
- **Style:** match surrounding code; Tailwind + design tokens (no raw colors); compact-mobile
  idiom (`md:hidden` icon + `hidden md:inline` label, `text-xs`/`text-[11px]` for dense text);
  `qk` for every query key; generated types, no hand-written API mirrors; thin routers, logic in
  services; error helpers from `api_utils.py`. No new dependencies unless the plan says so.
- **Local-first rule:** the PWA must not depend on runtime CDNs. Assets ship in the bundle or are
  served by our backend (flags via `flag-icons` npm, crests via `/clubs/{id}/crest`).
- Decided against (don't re-propose): refresh tokens, pagination envelopes, zod runtime
  validation, backend event bus, UI framework/CSS migration, CI pipeline changes.

## 10. Gotchas & non-obvious facts

- League name `NWSL (North America))` has a trailing `))` typo **in the DB**; exact-name maps must
  keep it. `Primera División` = Argentina. DB club name typos exist (`Quatar`, `United Tigewrs SC`).
- Cup era boundary is **2026-07-11** (not 07-12): the deciding "4. Lorbeerkranzturnier" is dated
  11.07. Expected owners after that date: Lorbeerkranz → Berni, Bauernkranz → Roli.
- `/clubs` page and pickers require editor login; stats, live pages, friendlies, profiles are
  public reads.
- Six clubs have no crest (free TheSportsDB key limits): Nottingham Forest, San Lorenzo,
  St. Louis CITY SC, Wisła Płock, Al Shabab, United Tigewrs SC → monogram fallback; admin can
  `PUT /clubs/{id}/crest` manually. Crest precedence in UI: crest → nation flag → monogram.
- `frontend/index.html` still loads Font Awesome 6.6 from cdnjs — the one remaining local-first
  violation (Roli asked on 2026-08-07 to bundle it; not done yet). `StarsFA.tsx` and some icons
  depend on it.
- iOS PWA: push needs Home-Screen install; back navigation uses the router history index
  (`routeMeta.ts`), don't replace with `history.back()` blindly.
- Frontend Docker build uses `npm install` (not `ci`) on purpose: the lockfile is generated on the
  arm64/glibc Pi, the image is alpine/musl on x86.
- Tests use a temp SQLite file + `UPLOADS_DIR` in tmp (`backend/tests/conftest.py`); accounts
  `Editor`/`Admin`. Frontend tests: vitest + jsdom, files in `frontend/src/test/`.
- `backend/app.db*`, `backend/data/app.db` are real (synced) data — never commit, never run
  destructive experiments on them; copy first.
- `frontend/public/` contains leftovers (`original.jpg` 170 kB, `index-html-snippet.txt`) that
  ship in the build; harmless but removable.

## 11. Current state (2026-09-12)

- `main` = `b56b1fb` (2026-08-08, G8), pushed, clean tree. All feature/refactor branches are
  merged except `feat/todo-md-full-implementation` (stale WIP from 2026-03; ignore).
- Production: last known deploy state = G7/G8 era (prod uploads contain the 591 crests as of the
  2026-08-20 backup), so main and prod are believed identical. (Verify with
  `ssh hetzner 'cd ~/projects/Lorbeer-Turnierplaner && git log -1 --oneline'` if in doubt.)
- Baseline checks on main: `make test`, `make lint`, `npm run check` all green (2026-09-12).
- Open follow-ups: bundle Font Awesome locally; optional cleanup of `backend/app/stats.py`
  and `frontend/public` leftovers; the manual smoke checklist in `REFACTORING_PLAN.md` is a
  reference list, not a TODO.

## 12. Where knowledge lives

| What | Where |
|---|---|
| Canonical project knowledge (this) | `AGENTS.md` — update it when you learn something |
| Tool entry points | `CLAUDE.md` (imports this file), `GEMINI.md` (points here) |
| Human README / setup narrative | `README.md` |
| Batch trackers (history + decisions) | `REFACTORING_PLAN.md`, `FEATURES_2026-07.md`, `FEATURES_2026-08.md` |
| Claude Code auto-memory (per-machine, not in git) | `~/.claude/projects/-home-roli-projects-turnierplaner-reloaded/memory/` |
| Production data snapshots (not in git) | `backup/deploy/<ts>/`, `backup/local/<ts>/` |
