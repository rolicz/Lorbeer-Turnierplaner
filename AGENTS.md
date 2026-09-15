# Lorbeerkranz Tournament Planner — Project Knowledge (canonical)

> **This file is the single source of truth for agents and humans working on this repo.**
> It is tool-agnostic: `CLAUDE.md` and `GEMINI.md` only point here. When you learn something
> non-obvious about the project (deploy quirks, data semantics, decisions), **update this file**
> so the knowledge survives model/tool switches. Keep the "Current state" section dated.
>
> Last full review: 2026-09-15 (branch `feature/2026-09-audit`, Rounds 6 + 7; `main` at `cabda7c`, deployed).

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
| `frontend/` | React 18, Vite 7, TypeScript 5 (strict), Tailwind 3, TanStack Query 5, react-router 6, framer-motion, lucide-react, flag-icons | `frontend/src/main.tsx` → `src/app/App.tsx` |
| `deploy/` | Caddy 2 reverse proxy + auto-HTTPS | `deploy/Caddyfile` |
| root | `docker-compose.yml` (backend + frontend/nginx + caddy), `Makefile`, `scripts/gen_types.sh` | |
| `backup/` | git-ignored local + prod data snapshots (see §8) | |

Size (2026-09-13): backend ≈ 13.3k LOC Python (`app/` + `manage.py` + `run.py`), frontend
≈ 27.2k LOC TS/TSX (excl. `api/generated/` and `src/test/`; tests are another ≈ 4.7k).

### Backend modules
- `app/routers/*.py` — HTTP endpoints (auth, me, tournaments, matches, clubs, players, cup, stats,
  comments, friendlies, ideas, push). Routers should stay thin; bodies live in `app/services/`.
- `app/services/` — `tournament_view.py` (serialization), `tournament_list.py`, `events.py`
  (WS broadcasts), `notifications.py` + `webpush.py` + `notification_texts.py` (push pipeline),
  `cup.py` (cup ownership fold), `file_storage.py` (media on disk), `authorization.py`
  (owner/admin guards), `comments_view.py`, `guestbook*.py`, `ideas_view.py`, `poke_summary.py`,
  `stats/` (players, h2h, h2h_matches, streaks, ratings, odds, player_matches, tournament_stats,
  core, scope, registry), `comments_summary.py`, `guestbook_summary.py`,
  `club_stars.py` (the star-rating timeline: every write appends, every match resolves by date).
- `app/models.py` — all SQLModel tables. `app/schemas/requests.py` + `responses.py` — pydantic
  bodies/response models (**response models drive the generated frontend types**).
- `app/db.py` — engine + `init_db()` (create_all + additive runtime columns + backfills).
- `app/auth.py` — JWT + role deps. `app/cup_defs.py` — cups.json loader/validator.
- `app/feature_areas.py` — the Ideas board's area catalog (R5). Areas are stored as plain
  strings, never a foreign key: **a key is never deleted from `AREA_DEFS`, only marked
  `retired=True`**, so a destination the app drops still labels the old ideas that name it.
- `app/scheduling.py` — fixture generation (1v1 all pairs; 2v2 circle-method partnerships).
- `app/tournament_status.py` — **status is derived from match states** (see §5).
- `app/seed.py`, `app/league_nations.py`, `app/validation.py`, `app/tools/sync_club_crests.py`,
  `app/tools/recover_club_star_history.py` (diffs the deploy snapshots, §8).
- `manage.py` — CLI: seed, add-match, vacuum-db, generate-vapid, recover-club-star-history,
  backups/sync (§8).

### Frontend modules
- `src/api/` — `client.ts` (`apiFetch`, `apiUpload`, `mediaUrl`, central 401 → `api:unauthorized`
  event), one `*.api.ts` per resource, `queryKeys.ts` (`qk` factory — **always use it**),
  `types.ts` (aliases over `generated/schema.d.ts` + a few deliberate narrowings), `generated/`
  (from OpenAPI via `make gen-types`; never hand-edit).
- `src/hooks/realtime/` — pooled WebSocket layer (`connection.ts`: heartbeat 25s, liveness 35s,
  backoff), `wsEvents.ts` (event contract mirror of `services/events.py`), `applyEvent.ts`
  (cache merge), `RealtimeProvider.tsx`.
- `src/pages/` — dashboard, tournaments (+ `live/` tournament page, match detail, `live/comments/`
  feed + `CommentComposer`, admin panel), stats, profile, players admin, clubs,
  friendlies (`tools/` — `FriendlyMatchesListCard` holds the queries, the filter pill and the
  editor, `FriendlyList.tsx` the day-grouped list itself, Q7), `ideas/` (the Ideas board:
  `IdeasPage`, `IdeaCard`, `IdeaComposer`,
  `IdeaFields`, `ideaMeta.ts`, `useIdeaMutations.ts`), settings, login,
  `NotFoundPage` (the `*` route).
  `stats/` is one layout driven by `StatsInsights.tsx`: `statsNav.ts` resolves `?view=`/`?sub=`
  (and maps every legacy URL shape onto them, §10), `StatsSection.tsx` is the shared sub-view
  skeleton, `StatsFilterPill.tsx` the stats page's two groups for the shared
  `ui/primitives/FilterPill` (Q7), `h2h/MatchupView.tsx` +
  `h2h/matchupSummary.ts` the "A vs B, every match" drill-in.
- `src/ui/` — `primitives/` (Button, Card, CardSection, Modal, Input, Pill, EmptyState,
  InlineLoading, LoadingPlaceholder, MatchOverviewPanel, ScoreLine, MatchSides, StatTile, Chip,
  Stars, List/ListRow, PlayerLink, AvatarCircle [one ringed avatar, T15], RecordLine [the
  `3P 3-0-0 14:6 GD +8` line under a standings/results row — fixed columns sized per list by
  `recordWidths(rows)`], FilterPill [the app's floating filter capsule, used by stats and the
  friendlies list], …),
  `shell/` (AppShell, Sidebar desktop, MobileChrome drawer, BottomTabBar [mobile, 5 destinations
  — `navConfig` has seven, and the bar excludes Clubs and Ideas],
  navConfig, useDestinationLinks + lastLocation [per-destination last-page memory],
  routeMeta + backNavigation [contextual back, shared with the swipe gesture], navStack,
  useScrollRestoration + useReturnScroll for scroll memory, useTabParam [`?tab=` for every
  tabbed page], NotificationBell, RouteErrorBoundary [the *page* failed] and AppCrashBoundary
  [the app failed — mounted in `main.tsx` outside every provider, see `src/diagnostics/`]),
  `ClubBadge`, `NationFlag`, `SectionTabs`, and the club selection: `SelectClubsPanel` (T9 — one
  "Clubs" disclosure per match holding both club slots, the filters and the two random actions)
  with the `ClubPicker` sheet a slot opens. Every icon in these (and everywhere else) is a
  lucide-react component — see §9.
- `src/themes/*.css` — CSS-variable themes (blue default, dark, red, light, green) consumed by
  Tailwind via `rgb(var(--color-*))`. `src/styles.css` holds shared component classes.
- `src/diagnostics/` — the crash recorder (Round 7, 2026-09-15). `crashLog.ts` is a 10-entry ring
  buffer in `safeStorage` fed by both error boundaries, `window.onerror` and `unhandledrejection`;
  `breadcrumbs.ts` keeps the last 20 navigations (URL + PUSH/POP/REPLACE) **in memory** and attaches
  them to whatever is recorded; `lifecycle.ts` leaves a liveness marker so a death that throws
  nothing (iOS jettisoning the web view) is still visible on the next boot; `install.ts` wires the
  three from `main.tsx` before React renders. Read on the phone at Settings →
  Diagnostics (`ui/layout/DiagnosticsSettings.tsx`, `?tab=diagnostics`).
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
make test           # backend pytest   (baseline 130 tests green, ~3.7 min on the Pi, 2026-09-13)
make lint           # ruff (E/W/F/I; line-length 150)
make gen-types      # regenerate frontend/src/api/generated/schema.d.ts after ANY response-model change
cd frontend && npm run check   # tsc + eslint + vitest (baseline 369 tests in 40 files, ~35 s)
cd frontend && npm run build   # tsc -b + vite build (run for structural changes)
```

- **Node ≥ 20.19 / ≥ 22.12 is required** (Vite 7). `.nvmrc` pins 24; the frontend make targets
  source `scripts/node-env.sh`, which loads nvm when present, so `make dev`/`make frontend` work
  from any shell (login bash on this Pi does not load nvm and would otherwise pick system Node 18).
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
  star_rating 0.5–5 in 0.5 steps = the **current** value, league_id), `ClubStarRating`,
  `ClubCrestFile`, `PlayerProfile`,
  `PlayerAvatarFile`, `PlayerHeaderImageFile`, `PlayerGuestbookEntry` (+ThreadLink, Vote, Read),
  `PlayerPoke` (+Read), `Comment` (+Read, Vote, ImageFile, ThreadLink, AuthorLink),
  `TournamentPinnedComment`, `TournamentCreatorLink`, `FriendlyCreatorLink`,
  `FeatureRequest` (+`FeatureRequestArea`, `FeatureRequestVote`, `FeatureRequestImageFile`),
  `PushSubscription`, `PushSubscriptionPreference`.
- **The Ideas board** (R5, four new tables): `FeatureRequest` is one idea — author (never NULL,
  posting needs a login), `title`, `body`, `kind` (feature|change|bug), `status`
  (new|planned|doing|done|declined) + `status_note`, both admin-only, and `edited_at`, which is
  **only** stamped by a PATCH — `updated_at` moves for a status change or an image too, so a
  byline that reads `updated_at > created_at` would call an idea "edited" because someone triaged
  it. `FeatureRequestArea` is a child table (one row per area, so an idea names several) holding
  a **plain string** from `app/feature_areas.py`, never a foreign key. `FeatureRequestVote` is a
  "+1": the row's existence is the vote, and there is no `value` column, because a feature board
  asks "who else wants this". `FeatureRequestImageFile` mirrors `CommentImageFile`.
  Area rules, enforced server-side *and* mirrored in the composer: at least one, and the two
  scope answers (`general` "Not about one page", `several` "Several pages") stand alone.
- **Tournament "live/done/draft" is derived from match states** (`tournament_status.py`): all
  scheduled → draft, all finished → done, otherwise live. The `Tournament.status` column still
  exists but is not authoritative and there is **no status endpoint** (the README's old
  `PATCH /tournaments/{id}/status` claim was removed in D1). "Live now" = a tournament whose
  matches are mixed/playing.
- **Cup ownership** is a fold over qualifying finished tournaments (`services/cup.py`): winner =
  unique top of standings, else the decider winner (`decider_type` none|penalties|match|
  scheresteinpapier). Ties without decider → no winner, holder keeps the cup.
- **A club's stars are a timeline** (R4). `Club.star_rating` stays the club's *current* rating —
  the pickers, the clubs page and `services/stats/odds.py` all ask "how good is this club today"
  and keep reading it. `ClubStarRating` (`club_id`, `stars`, `valid_from` **date**, `changed_at`,
  `source`) answers the other question, "what was it worth the day that match was played":
  - **Every star write appends** through `services/club_stars.record_star_rating()` — `POST
    /clubs`, `PATCH /clubs/{id}` (the Clubs page panel *and* the picker's inline `ClubStarsEditor`
    both use it) and `app/seed.py::upsert_clubs`. **One row per club per day**: a second edit the
    same day is that day's value, and re-saving a rating already in force writes nothing.
  - **`init_db()` seeds** one row per club at its current rating, dated today, for any club with no
    history at all — idempotent, and with only that row every past match resolves to the current
    rating, i.e. exactly the behaviour before the table existed. Log line on first boot:
    `Club star history seeded: <n>`.
  - **The as-of rule** (`StarRatingResolver.as_of`, the only place it is written): the last row
    whose `valid_from` is on or before the match's own date — a tournament's `date`, a friendly's
    own `date`, **never** `started_at`/`finished_at`, which record data entry. Earlier than the
    first row → that first row (the oldest value on record). No date → the current rating. No club
    → nothing. `/stats/player-matches` and `/stats/h2h-matches` carry the answer per side as
    `club_stars`; **the frontend renders it and never re-derives the rule.**
  - `source` is `live` | `seed` | `recovered`. A **recovered** row's `valid_from` is an upper bound
    (the day a backup first showed the new value), which is why the UI says "by <date>" for it and
    "since <date>" for the rest. See §8 for the recovery command.
- **Media** are files on disk, metadata rows in DB: `uploads/avatars/{player_id}.{ext}`,
  `profile_headers/{player_id}.{ext}`, `comments/{comment_id}.{ext}`, `club_crests/{club_id}.{ext}`,
  `ideas/{request_id}.{ext}`.
  Served by the backend with cache-busting `?v=<updated_at>` (`mediaUrl()`).
- Stats scopes: `tournaments | both | friendlies`, taken as a `scope` query param by **every**
  `/stats/*` endpoint that reads matches — `/stats/players` learned it last (A4), so no stats
  surface can show the Source filter and ignore it. Ratings are Elo-like per mode.
- Push: languages `steirisch` (default) | `deutsch` | `english`; modes `finished_only` (default)
  | `all` | `off`; personal events (pokes, guestbook, a new idea) go only to the addressed
  player. Dispatcher is started in the FastAPI lifespan.

## 6. API & realtime contract (short map)

Prefixes: `/auth/login`, `/me`, `/me/notifications`, `/tournaments…` (list, `/live`, detail,
create, patch, `/date`, `/generate`, `/reorder`, `/second-leg`, `/stats`, `/decider`,
`/reassign` (+`/reassign-preview`), delete, comments), `/matches/{id}` (patch score/state/clubs,
`/swap-sides`),
`/clubs` (+`/leagues`, `/{id}/crest`, `/{id}/star-history` — public read, oldest first),
`/players…` (profiles, avatars, headers, guestbook, pokes,
read-maps), `/cup?key=`, `/cup/defs`, `/stats/{overview,players,h2h,h2h-matches,streaks,
player-matches,ratings,ratings/history,odds}`, `/friendlies`, `/ideas` (+`/areas`, `/{id}`,
`/{id}/status`, `/{id}/vote`, `/{id}/voters`, `/{id}/image`), `/push/{config,subscription,
subscriptions/me,test}`, `/comments/…`, `/health`.
Roles: `reader` (no token) < `editor` < `admin`; deps `require_editor` / `require_admin`;
owner-only checks in `services/authorization.py`. Error helpers in `app/api_utils.py`
(400/403/404/409).
**The editor's grace window (A10)** lives in `services/authorization.py` and nowhere else:
an editor may edit / set the decider on a tournament while it is not done **and for one hour
after its last match finished**, and may delete a tournament or a friendly only if they are its
recorded creator (`TournamentCreatorLink` / `FriendlyCreatorLink`) and within one hour of
creating it — admins always. The window is `GRACE_WINDOW`, the same 1h constant comments use
(`COMMENT_EDIT_WINDOW`). `TournamentDetailOut`, `TournamentListItemOut` and `FriendlyOut` carry
the per-caller answer as `can_edit` / `can_delete` / `can_set_decider`; **the frontend renders
its controls from those flags and never re-derives the rule**. Rows created before A10 have no
creator link and stay admin-only to delete. `PATCH /tournaments/{id}/second-leg` is the one
documented back door left: it can still revive a done tournament for any editor.
**Destroying matches destroys their comments (Q5).** `POST /tournaments/{id}/reassign` refuses
for exactly one reason — a match that is not `scheduled`, i.e. a real result — and its message
names which. Leftover goals, clubs and timestamps on scheduled matches are **not** a refusal:
they are cleared, because the schedule is rebuilt anyway (refusing on them used to freeze a
tournament for good). `GET /tournaments/{id}/reassign-preview` (editor+) returns
`{matches, matches_with_score, matches_with_club, comments}` so the confirmation can name what
goes **before** it is agreed to; the frontend never re-derives those counts. Every path that
deletes match rows — re-assign, re-`/generate`, disabling the second leg — goes through
`_bulk_delete_matches`, which also deletes the comments filed under those matches (and their
reply subtrees, image files, votes, reads, thread/author links) via
`services/comment_cleanup.py`; tournament-wide comments survive, and deleting a tournament now
takes **all** of its comments with it. The reason is not taste: `match.id` (and `tournament.id`)
have no AUTOINCREMENT and no FK enforcement (A9), so a comment left pointing at a dead id
silently reattaches itself to whatever gets that id next. In the same spirit, **a `PATCH
/matches/{id}` that sets `state: "scheduled"` clears both sides' goals** — every reset path
agrees, and the clubs stay.
**The Ideas board's rule (R5)** lives in the same module and answers a different question: an
idea is a document, not a result, so there is **no time window** — an idea is the author's for as
long as it exists (`can_edit_feature_request` / `can_delete_feature_request`), the status is the
admin's alone (`can_set_feature_request_status`), and `IdeaOut` carries all three as `can_edit` /
`can_delete` / `can_set_status`. Reading `/ideas` needs no token; every write needs one.
**The push on a new idea** goes to the admin accounts *only* (resolved by
`notifications.admin_player_ids` from `player_accounts[].admin`, matched to `Player.display_name`
case-insensitively, exactly as login does), never to its own author, and never to anyone else.
It is a personal event (`idea_created` is in `PERSONAL_DEFAULT_EVENT_TYPES`), so it reaches a
default "Results & personal" subscription; a device set to "Off" still gets nothing. It deep-links
to `/ideas?idea=<id>`, a one-shot param the page consumes and drops.

WebSocket channels (`app/main.py`, `app/ws.py`, `services/events.py`):
- `/ws/tournaments/{id}` → `tournament.sync` (full tournament payload), `tournament.deleted`,
  `comment.upsert|delete|meta`.
- `/ws/tournaments` → coarse `tournaments.changed {action, tournament_id?, status?}`. Writing or
  deleting a comment sends `action="comment"` — the only action that does **not** refetch the
  list, because it exists solely to move the unread badge (A5).
- `/ws/players/{id}` → profile-channel events, broadcast from `routers/players.py`:
  `player:pokes:update` and `player:guestbook:update` (created/updated/voted/deleted). Both are
  handled by one narrow resync (`resyncPlayer`), which invalidates the poke **and** guestbook
  keys — a profile's guestbook is realtime, its read state included.
Every envelope carries `ts` + a `seq` that is **monotonic per channel** (`app/ws.py` counts
1, 2, 3… separately for each tournament id, each player id, and the global channel — A9 split
the old process-wide counter, which no client could read as "you missed one"). The frontend
baselines `seq` on every connect and resyncs on a gap as well as on reconnect/visibility
(`connection.ts` `onGap` → the channel's resync in `useRealtime.ts`). A socket that fails a
broadcast is **closed**, not merely dropped from the channel: the endpoint's receive loop would
otherwise keep answering its pings and the client would show "live" forever without resyncing.
Behind Caddy the `/ws` prefix is **not** stripped (`handle /ws/*`), `/api` **is** (`handle_path`).

## 7. Deployment (production)

- **Host:** Hetzner VPS, SSH alias `hetzner` (user `rczerny`, defined in `~/.ssh/config`).
  Repo checkout on the server: `/home/rczerny/projects/Lorbeer-Turnierplaner`
  (GitHub remote `git@github.com:rolicz/Lorbeer-Turnierplaner.git`, branch `main`).
- **Runtime:** `docker compose` with three services — `backend` (python:3.11-slim, non-root
  `${UID}:${GID}`, healthcheck `/health`, bind mounts `./backend/data:/data` and
  `./backend/secrets.json:/app/secrets.json:ro`), `frontend` (node:22 build → nginx:alpine,
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
  6. **Once, on the deploy that ships R4: load the club star history by hand.** Roli asked for
     this to be written down rather than remembered (2026-09-15). `ClubStarRating` is created
     empty and `init_db()` seeds one row per club dated **that day**, so until the recovery runs,
     production believes every club has always had the rating it has now — which is the bug R4
     exists to fix, still live. The reconstruction reads the deploy snapshots, and those live on
     the dev machine, not on the server, so they have to travel:
     ```bash
     # on the dev machine, after the server's `git pull` + `up -d --build` succeeded.
     # Check the filter with --dry-run first; only app.db and snapshot.json are needed (~10 MB).
     rsync -av --prune-empty-dirs --include='*/' --include='app.db' --include='snapshot.json' \
       --exclude='*' backup/deploy/ hetzner:~/projects/Lorbeer-Turnierplaner/backend/data/star-snapshots/
     # on the server — ./backend/data is bind-mounted at /data, so the container sees them:
     docker compose exec backend python manage.py recover-club-star-history --path /data/star-snapshots
     docker compose exec backend python manage.py recover-club-star-history --path /data/star-snapshots --apply
     rm -rf ~/projects/Lorbeer-Turnierplaner/backend/data/star-snapshots   # copies, not runtime data
     ```
     **Run it without `--apply` first and read the report.** On the 2026-09-15 dev data it found
     626 opening ratings and 31 changes across 31 clubs, and moved 3 of 218 finished match sides;
     prod numbers should be close. If they are not, stop — step 2's backup is the way back.
     `snapshot.json`'s `"kind"` is what selects a snapshot, never the directory name, which is why
     that file has to be copied alongside each `app.db`.
  7. Smoke: `curl -I https://lorbeerkranz.xyz`, `curl https://lorbeerkranz.xyz/api/health`,
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

```bash
python3 backend/manage.py recover-club-star-history            # read-only report
python3 backend/manage.py recover-club-star-history --apply    # write the rows
```
`recover-club-star-history` (R4) reconstructs `ClubStarRating` by diffing the `club` table across
the deploy snapshots, because the app only ever stored one float per club. Rules it follows and
that must not be relaxed:
- **Deploy snapshots only.** `backup/local/*` are pre-sync copies of the *dev* database, so
  interleaving the two kinds by timestamp invents changes that immediately revert. Selection is by
  `snapshot.json`'s `"kind": "deploy"`, **never** by the directory name — two real deploy
  snapshots (`20260328-022654`, `20260913-150024`) are named without the `-deploy` suffix.
- **`backup/` is never written to**: every snapshot, and the target DB during a dry run, is opened
  `mode=ro`. A dry run configures no engine at all.
- A change is dated at the snapshot where the new value is **first seen** — an upper bound, marked
  `source="recovered"`. The report prints the window per change, the gaps longer than a week, and
  how many finished match sides change value.
Measured 2026-09-15 against the 12 usable snapshots (2026-03-28 → 2026-09-13): **31 changes across
31 clubs**, of which **3 of 218** finished match sides move (2 tournament sides — San Jose
Earthquakes, Carrarese Calcio — and 1 friendly side, Grazer AK). Nothing before 2026-03-28 is
recoverable; those matches keep the oldest value on record. The command is optional: skip it and
every past match simply keeps counting today's rating.

## 9. How work is done here (conventions)

- **Planning files at the repo root are the trackers**: `REFACTORING_PLAN.md` (cleanup, done),
  `FEATURES_2026-07.md` (T1–T11, done), `FEATURES_2026-08.md` (G1–G8, done),
  `FEATURES_2026-09.md` (32 tasks: H2H matchup, stats IA, mobile navigation, the design canon —
  done on `feature/2026-09-batch`, see §11). A new batch gets a
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
  `npm run check` (+ `npm run build` for structural changes). UI must work at ~390px (phone) and
  ≥1024px; verify in a real browser (Playwright against an isolated stack on spare ports + DB
  copy) in both the `blue` and the `light` theme.
- **Follow `DESIGN.md`** for anything visual: it is the canon for surfaces (`card`/`inset`/
  `chip`), semantic colour tokens (`text-win/draw/loss` for a *result*, `text-live`,
  `text-error`/`text-warn` for a *state* — never raw palette classes, and never a result token
  for a message), the radius/spacing/type scale, section headers and which primitive to use
  (`ScoreLine` for every score, `StatTile`, `Chip`/`ChipGroup`, `Button`, `Pill`,
  `List`/`ListRow` for a one-line row, `list-divided` + your own row where it carries a
  `ScoreLine`/`RecordLine`). When the code and `DESIGN.md` disagree, the code is wrong — unless
  the canon is what drifted, in which case fix the canon and say so (A8).
- **Identity is a link** (N4, 2026-09-13): a player's avatar/name opens `/profiles/<id>` through
  `ui/primitives/PlayerLink`, and a summary opens the detail it summarises (stats matchup, cup
  page, player stats). A row that already has an action keeps it — the identity link hugs its text
  and sits above a stretched link/button overlay (`ListRow` pattern). **Never nest an `<a>` in an
  `<a>`**; `document.querySelectorAll("a a").length` must stay 0.
- **An avatar speaks in the present tense** (T15, 2026-09-13): every player avatar is
  `ui/primitives/AvatarCircle` and wears a ring — neutral hairline by default, the cup's colour
  when `cups` says that player holds it **today** (`hooks/useCupHolders`). A ring is never used for
  historic ownership, and **one tense per screen**: only surfaces about *now* pass `cups` (Players
  page, profiles, the stats leaderboards, the dashboard cups preview). Inside a tournament — its
  standings/results, What-if, match lists, Overview — and in the Positions grid of past
  tournaments, avatars keep the hairline alone; cup information there comes only from the
  standings' `CupOwnerBadge` crown ("owned it going into this tournament", Roli's call after
  seeing rings on old results). Comment authors, guestbook entries and pickers carry no cup
  marking at all.
- **Icons: lucide-react only** (`DESIGN.md` §1.5). Font Awesome is gone (DS7, 2026-09-13) —
  the dependency, the CSS import and every `<i class="fa-…">` with it. Import the component
  (`import { Crown } from "lucide-react"`) and give it an explicit `size` in px; `aria-hidden`
  unless the icon carries meaning on its own, then `aria-label`/`title`.
- **Style:** match surrounding code; Tailwind + design tokens (no raw colors); compact-mobile
  idiom (`md:hidden` icon + `hidden md:inline` label, `text-xs` for dense text and `.text-micro`
  for markers — arbitrary `text-[Npx]` is banned, `DESIGN.md` §5);
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
- `/clubs` page and pickers require editor login; stats, live pages, friendlies, profiles and
  `/ideas` are public reads.
- **Ideas sits below Clubs in the sidebar and the drawer and has no bottom-bar tab** (R5, Roli's
  call): five items are what fits a phone row. It is the only nav destination a reader can see
  that an editor also sees in the same place, because reading the board is public and only
  writing needs a login.
- Six clubs have no crest (free TheSportsDB key limits): Nottingham Forest, San Lorenzo,
  St. Louis CITY SC, Wisła Płock, Al Shabab, United Tigewrs SC → monogram fallback; admin can
  `PUT /clubs/{id}/crest` manually. Crest precedence in UI: crest → nation flag → monogram.
- lucide icons are SVGs, not glyphs: they do **not** inherit the surrounding `font-size`, so an
  icon without `size` renders at 24px. House sizes: 14 in `text-xs`/`text-sm` context, 16 at
  `text-base`, 12 inside 10–11px runs and pills, plus `strokeWidth={2.25}` where a stroked icon
  looks too thin next to bold text.
- **A crash blanks to the *themed* page background, not to white** — that is the signature to look
  for in a video: white means the bundle never ran, the theme colour means it ran and the tree went
  away. Since Round 7 the app catches that case (`AppCrashBoundary`) and writes it down, so the
  first question after any report is **Settings → Diagnostics → Copy all**. Two boundaries, two
  jobs: `RouteErrorBoundary` (the page failed, the shell survives, resets on navigation) and
  `AppCrashBoundary` (the shell/provider/router failed, nothing survives, only a reload gets out).
- **In a dev build one throw reaches the recorder two or three times** — React re-renders a failed
  tree to build the component stack and re-throws it to `window` — as *different* Error objects, so
  object identity cannot dedupe them. `crashLog` samples `count` at 400 ms for exactly this; do not
  "fix" that into an exact counter without re-reading why. Roli's phone runs the **dev** server, so
  its stacks name real files and lines; a production stack would be minified.
- **Backgrounding a PWA is not a crash.** `lifecycle.ts` only reports a session whose last marker
  said `visible`; a `pagehide`/`visibilitychange` write (`hidden`) is an ordinary end and is
  silently dropped. Anything that makes the app write a `visible` marker on its way out would turn
  every app switch into a false "Ended unexpectedly".
- **A `card` inside a CSS grid needs `min-w-0`.** A grid item defaults to `min-width: auto`, so one
  unbreakable line inside it (a stack frame, a long URL) widens the whole page instead of
  scrolling/truncating. `SettingsSection` learned this the hard way in Round 7.
- **Safe areas belong to the container** (Q4): `body` carries the left/right inset padding, but a
  `fixed` overlay escapes it, so the drawer, `Modal`'s sheet and `ImageLightbox` name the insets
  themselves through the `safe-t/r/b/l` spacing tokens in `frontend/tailwind.config.cjs`
  (`pb-safe-b`, `left-safe-l`, `bottom-safe-b`, …, plus `max-h-sheet`, which clamps a sheet to the
  safe box so a tall dialog's buttons stay reachable). `env()` is 0px without insets, so none of it
  shows on Android, desktop or an older iPhone. Never hand-spell `env(safe-area-inset-*)` in a class.
  An overlay root also carries `style={{ margin: 0 }}`: a page column's `> * ~ *` rule hands every
  non-first child a 12px top margin, and a `fixed inset-0` box honours it (scrim 12px short).
- iOS PWA: push needs Home-Screen install; back navigation uses the router history index
  (`routeMeta.ts` classifies the route, `backNavigation.ts` decides pop-vs-up), don't replace
  with `history.back()` blindly. The swipe gesture (`useSwipeNav`) asks the *same* decision, so
  a chevron and a swipe can never land in different places; on a top-level page with nothing to
  pop the gesture does nothing at all. Any horizontally draggable element must carry
  `data-no-swipe-nav`, or a swipe past its scroll edge navigates.
- **One rhythm above every tab strip** (T10): `ui/layout/PageLayout.tsx` owns the desktop title
  row (back · `h1` · meta · actions) and renders it **outside** `.page` — a `hidden lg:flex`
  element is still a `space-y-*` sibling, which is what used to push every phone page's first
  block down for nothing. Every tabbed page puts `SectionTabs` first inside `.page` and no page
  renders a header block above it; measured, the first tab sits 16px under the mobile top bar
  and 72px from the top on desktop, on all of dashboard/tournaments/live/done/profile/settings/
  friendlies/clubs/stats/match detail. The live tournament's mode+date pills live next to the
  desktop `h1` and at the top of its Overview tab (`pages/live/TournamentMetaPills.tsx`).
- **One live indicator** (T10): the pulsing dot in the bottom tab bar (mobile) / sidebar
  "Live now" (desktop). `ui/shell/ConnectionIndicator.tsx` renders **nothing** while the socket
  is up and only says "Reconnecting"/"Offline" after a 1.2s grace period; the tournament page has
  no status chip, and the dashboard's "Live now" section label carries no dot.
- **Tab state is `?tab=` on every tabbed page** (U1). Eight pages go through
  `ui/shell/useTabParam.ts` (unknown or role-forbidden values fall back to the page default, the
  default value is deleted from the URL, writes are `replace`); `LiveTournamentPage` keeps its own
  `?tab=` state because its default depends on the tournament's status. Profile tabs used to be
  `?pt=` — that param is gone. **The dashboard has no tabs at all** since T5 (the Cups tab became
  the cups preview); its old `?tab=cups` redirects to `/stats?view=overview&sub=cups`.
  The Ideas board's own tabs are status groups: `open` (new · planned · doing, the default),
  `closed` (done · declined) and `all`; its area filter and sort are component state, not URL.
- **Stats URL scheme** (S1/S2/N4/T7): `/stats?view=overview|trends|h2h|player`, `&sub=` = the
  section's sub-view (`table|positions|streaks|records|cups` for Overview,
  `players|duos` for H2H), `&mode=overall|1v1|2v2`, `&source=tournaments|both|friendlies`,
  `&player=<ids>`, `&vs=<ids>` (opens the Matchup drill-in inside H2H), `&rel=together`
  (deep links only — an in-app matchup always opens on "Against") and `&cup=<key>` (T5: opens the
  Cups sub-view at that cup's section, then drops itself — a one-shot param, see
  `ui/shell/lastLocation.ts`). **`player` and `vs` carry one *or two* comma-separated ids**
  (T7): one per side is "this player vs that one, whatever the partners", two on both sides is
  the exact team matchup (`?player=1,4&vs=2,5` → `exact_teams` on `POST /stats/h2h-matches`).
  Outside the matchup only the first id counts, and leaving H2H collapses a team back to it.
  Every shortcut into a matchup is built by `statsMatchupHref()` (`pages/stats/statsNav.ts`) and
  defaults to **Source = Tournaments**. Every stats param is written with `replace` — except
  **opening the matchup, which is a push** (T11): the drill-in swaps the whole body, so it owns a
  history entry and swipe/browser back return to the list it was opened from (N2 restores that
  list's offset). Its in-view "Head-to-head" button asks the same question the gesture does
  (`resolveDrillInBackAction` in `ui/shell/backNavigation.ts`): pop when the entry behind is this
  stats page without `vs`, otherwise — a deep link from a match page or a profile — clear the
  param in place.
  All older shapes (`?view=table|stars`, `?section=…`, `#trends`, nav `state.statsTab`) are
  mapped once by `pages/stats/statsNav.ts` and rewritten — **never re-introduce `?section=`**.
- Scroll position is app-managed (N2): `history.scrollRestoration` is `"manual"`, each history
  entry's offset lives in sessionStorage (`navStack`) and in-page view swaps (tabs, stats
  sections) keep their own offsets (`useReturnScroll`) — the H2H matchup rides on its own history
  entry instead (T11). A same-page `replace` deliberately never moves the scroll, so filters and
  `?tab=` deep links stay put.
- Frontend Docker build uses `npm install` (not `ci`) on purpose: the lockfile is generated on the
  arm64/glibc Pi, the image is alpine/musl on x86.
- Tests use a temp SQLite file + `UPLOADS_DIR` in tmp (`backend/tests/conftest.py`); accounts
  `Editor`/`Admin`. Frontend tests: vitest + jsdom, files in `frontend/src/test/`.
- `backend/app.db*`, `backend/data/app.db` are real (synced) data — never commit, never run
  destructive experiments on them; copy first.

## 11. Current state (2026-09-15)

- **`main` is `cabda7c`** — the 2026-09 batch (32 tasks) plus Round 4 and Round 5, merged and
  **deployed**. Local `main` is one docs-only commit ahead (`356ada6`, the Round 6 plan) and that
  commit is not pushed. The batch branches `feature/2026-09-batch` and `feature/2026-09-round5`
  are merged and can be deleted whenever Roli wants.
- **Branch `feature/2026-09-audit` holds Round 6**, the ten audit items A1–A10 (tracker
  `FEATURES_2026-09.md`, baseline `356ada6`), all done 2026-09-14 and **not pushed, not merged**:
  two permission holes closed and an editor grace window built in their place (A1, A10), the match
  page made safe against a concurrent editor (A2), four realtime/deep-link bugs (A3, A5), one
  meaning for the Source filter (A4), the accessibility and light-theme contrast pass (A6), twelve
  runtime-polish items (A7), the design-canon reconciliation (A8) and seven hardening items (A9).
- Checks on the audit branch head, re-run together after the last Round 7 worker finished
  (2026-09-15, `6ef4a50`): `make test` **196 passed** (5:49), `make lint` clean,
  `make gen-types` no diff, `cd frontend && npm run check` **523 tests in 54 files**,
  `npm run build` green. `grep -rn "window.confirm" frontend/src` finds only the comment in
  `ConfirmDialog.tsx`, and `grep -rn "text-text-muted/" frontend/src` finds nothing (R2, R3).
- **Deploy notes for Round 6** — the standard `git pull && docker compose up -d --build` (§7) is
  enough, and **both** services must be rebuilt (the backend changed):
  - **Two new tables** (`TournamentCreatorLink`, `FriendlyCreatorLink`, A10) — `create_all` makes
    them, no column was added or altered, no backfill, **no manual server step**. Rows created
    before the deploy simply have no creator link and stay admin-only to delete.
  - Backend behaviour that changed: `GET /stats/players` takes `scope` (A4); the websocket `seq`
    is now numbered **per channel** and a failed socket is closed (A9), so clients resync on a gap;
    `DELETE /clubs/{id}` now also refuses a club referenced only by friendlies and cleans up its
    crest row and file (A9); the tournament/friendly payloads carry `can_edit` / `can_delete` /
    `can_set_decider` (A10).
  - Rollback stays safe: `main` @ `cabda7c` was booted against a copy of the migrated DB and
    served every route, created and deleted a tournament, and ignored the new tables.
- **The same branch also holds Round 7** (R1–R5, tracker `FEATURES_2026-09.md` § "Round 7",
  baseline `a1a2acc`), still **not pushed, not merged**: the two micro-tile grids (R1), one dialog
  and one tab order (R2), the theme readability pass (R3), **club star-rating history (R4)** and
  the Ideas board (R5).
- **Deploy notes for R4** (the only schema change in Round 7 so far):
  - **One new table**, `ClubStarRating` — `create_all` makes it, no column added or altered.
  - **A startup seed runs once**: expect `Club star history seeded: 626` in the backend log on the
    first boot, and nothing on every boot after. It writes one row per club at its current rating,
    so **nothing about the app changes** until a star is edited or the recovery is run.
  - **There IS a manual server step, and Roli asked not to be allowed to forget it: §7 step 6.**
    The recovery is what gives the table its real contents; without it the seed leaves every past
    match counting today's rating, which is the bug R4 exists to fix, still live. It cannot run
    from the dev machine against production — `manage.py` writes to its own configured database —
    so the snapshots travel to the server and the command runs in the container. Read-only first.
  - Rollback stays safe: the old code ignores the table, and `Club.star_rating` is still the
    current value that every old code path reads.
- Open follow-ups / known and accepted:
  - **Two decisions waiting for Roli**, both written up at the end of `FEATURES_2026-09.md`: the
    primary button fails the same contrast check in the four dark themes that A6 fixed in light
    (white on the teal = 2.49:1 in `dark`), which is one shared token and a look decision; and
    three destructive actions still call `window.confirm`, which `DESIGN.md` §7 forbids and A10
    already built `ui/primitives/ConfirmDialog.tsx` for.
  - `npm run build` prints the pre-existing "chunks larger than 500 kB" hint (≈669 kB
    `index-*.js`). Nobody has split it yet; it is not a regression.
  - `frontend/src/utils/format.ts` keeps three exports with no app caller
    (`fmtMonthDate`, `parseDateSafe`, `wrapTwoLinesWords`) — generic formatters covered by
    `src/test/format.test.ts`, deliberately left (D1).
  - `PATCH /tournaments/{id}/second-leg` can still revive a done tournament for any editor — the
    one documented back door left by A10.
  - The manual smoke checklist in `REFACTORING_PLAN.md` is a reference list, not a TODO.

## 12. Where knowledge lives

| What | Where |
|---|---|
| Canonical project knowledge (this) | `AGENTS.md` — update it when you learn something |
| Visual language (surfaces, tokens, type, primitives) | `DESIGN.md` — the design canon, follow it for every UI change |
| Tool entry points | `CLAUDE.md` (imports this file), `GEMINI.md` (points here) |
| Human README / setup narrative | `README.md` |
| Batch trackers (history + decisions) | `REFACTORING_PLAN.md`, `FEATURES_2026-07.md`, `FEATURES_2026-08.md`, `FEATURES_2026-09.md` |
| Claude Code auto-memory (per-machine, not in git) | `~/.claude/projects/-home-roli-projects-turnierplaner-reloaded/memory/` |
| Production data snapshots (not in git) | `backup/deploy/<ts>/`, `backup/local/<ts>/` |
