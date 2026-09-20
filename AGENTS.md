# Lorbeerkranz Tournament Planner — Project Knowledge (canonical)

> **This file is the single source of truth for agents and humans working on this repo.**
> It is tool-agnostic: `CLAUDE.md` and `GEMINI.md` only point here. When you learn something
> non-obvious about the project (deploy quirks, data semantics, decisions), **update this file**
> so the knowledge survives model/tool switches. Keep the "Current state" section dated.
>
> Last full review: 2026-09-19 (branch `feature/2026-09-guestbook`; code at `34a48e2`, this pass on
> top). `f425961` is still the only thing deployed: the design, Ideas and badges batches are all
> merged to `main` (`14e27db`) and undeployed, and the guestbook batch (K1–K4, then Q-A/Q-B, G1–G3
> and G4) is not merged. **Q-A and Q-B now have their canon pass** (G5, this one): K4 reviewed the
> tree at `ad21035` and G1–G3's pass deliberately did not speak for the two commits after it, so
> this file and `DESIGN.md` described a word-only subject chip and an always-open About field that
> the code had already replaced. Both are corrected here, against the running app.

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
  `cup.py` (cup ownership fold), `file_storage.py` (media on disk), `media_derivatives.py`
  (the derived-size cache behind `?w=` — §5, §6), `authorization.py`
  (owner/admin guards), `comments_view.py`, `guestbook*.py`, `ideas_view.py` + `idea_events.py`
  (the Ideas board's event log, and the one helper that answers who hears about an event — §6),
  `poke_summary.py`, `stats/` (players, h2h, h2h_matches, streaks, ratings, odds, player_matches,
  records, tournament_stats, core, scope, registry), `comments_summary.py`, `guestbook_summary.py`,
  `club_stars.py` (the star-rating timeline: every write appends, every match resolves by date),
  `record_holders.py` (who held which record last time, and the one function every result-changing
  path calls — §5, §6), `guestbook_subjects.py` (what a guestbook entry is *about*, and the copy
  that keeps it true — §5).
- **`guestbook_subjects.py` is the only module that reads or writes `PlayerSubjectSnapshot` /
  `PlayerGuestbookEntrySubject`** (K1): `find_or_create_snapshot` pins the current version of a
  profile's header image, About text or avatar — called **before** the entry is inserted, so a
  subject that is not there any more costs a 409 and nothing else; `subjects_for_entries` builds
  the payload and decides `current`; `release_subjects` stages the rows and hands the files back to
  unlink **after** the commit; `sweep_orphan_subjects` runs from `init_db()`. The rule all four
  serve is in §5. Its two halves in `file_storage.py` are `media_path_for_guestbook_subject` and
  `list_media(rel_dir)` (the sweep's eyes, sorted), with `GUESTBOOK_SUBJECT_DIR` spelled **once**
  there because the path builder and the sweep both name that directory.
- **`media_derivatives.py` is the only module that knows a derivative exists** (W1,
  2026-09-20). `MEDIA_WIDTHS` / `MediaWidth` is the one ladder of seven widths — a `Literal`,
  so FastAPI publishes it as an OpenAPI enum and the browser's copy is typed off the generated
  schema; `MediaWidthParam` is the one annotation all four media GETs spell; `derived_bytes`
  the one derivation (LANCZOS → WebP q82, with `ImageOps.exif_transpose` so a phone's rotated
  upload does not come back lying on its side); `derived_rel_path` the one place a cached
  file's path is written; `media_response` the one helper that turns a row into bytes — **in
  the service, not in a router**, because the fourth family lives in `routers/comments.py` and
  a router importing a router is how one mechanism quietly becomes two; `purge_derivatives`
  the throw-away, called by `file_storage` from its two byte-changing paths and by no router
  at all; and `sweep_orphan_derivatives` the boot sweep `init_db()` runs. `file_storage.py`
  gained `list_media_tree`, `media_mtime` and `delete_media_dir` for it and **stays the only
  module that knows where the media root is**. The rule they serve is §5's, the wire is §6's.
- **`stats/records.py` is the only place that decides what a record is** (M1). `RECORD_DEFS` is the
  registry — sixteen keys, each with its English label, its one-line explainer, its sort column and
  its deep-link `path` — and `compute_stats_records` folds the answer out of
  `compute_stats_ratings`, `compute_stats_streaks`, `compute_stats_players` and
  `finished_matches_with_players`, **writing no ranking query of its own**.
  `stats/players.py::finished_matches_with_players` is public for it: it is *the* loader for
  "finished matches in this mode and source", and a second one is how a badge and a page come to
  disagree. `stats/player_matches.py` exports `stats_match_dict`, `friendly_stats_match_dict`,
  `friendly_group` and `player_ref` at module level for the same reason, so `/stats/records`
  renders a match row *identically* to `/stats/player-matches` — same `club_stars` as-of rule (R4),
  same friendly pseudo-ids (tournament `-(1_000_000+fid)`, match `2_000_000_000+fid`).
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
  `mediaSizes.ts` (W2) is the browser's half of the server's width ladder and the **only** thing
  in the app that decides how wide a picture is asked for: `MEDIA_WIDTHS`, typed off the
  **generated** schema (a rung added or removed on the server is a type error here on the next
  `make gen-types`), `MAX_DPR` = 3, `mediaWidthFor(cssPx)` (the smallest rung that covers a box,
  `undefined` when none does, which means "ask for the original") and `avatarPxFromSizeClass`
  (the px behind `h-20 w-20`). `mediaUrl(path, v, w)` stays the one media URL builder, and a
  call that passes no width produces the **byte-identical** URL it produced before the batch —
  deliberately, so nothing a browser has already cached is invalidated.
- `src/hooks/realtime/` — pooled WebSocket layer (`connection.ts`: heartbeat 25s, liveness 35s,
  backoff), `wsEvents.ts` (event contract mirror of `services/events.py`), `applyEvent.ts`
  (cache merge), `RealtimeProvider.tsx`.
- `src/pages/` — dashboard, tournaments (+ `live/` tournament page, match detail, `live/comments/`
  feed + `CommentComposer`, admin panel), stats, profile, players admin,
  clubs (`ClubsPage.tsx` holds the queries, filters, create form and delete dialog,
  `clubs/ClubList.tsx` the grouped list whose row *is* the edit trigger, Q15),
  friendlies (`tools/` — `FriendlyMatchesListCard` holds the queries, the filter pill and the
  editor, `FriendlyList.tsx` the day-grouped list itself, Q7), `ideas/` (the Ideas board:
  `IdeasPage`, `IdeaCard`, `IdeaComposer`,
  `IdeaFields`, `IdeaComments.tsx` (the flat comment thread and the toggle that opens it, P4),
  `ideaMeta.ts`, `useIdeaMutations.ts`), settings, login,
  `NotFoundPage` (the `*` route).
  `stats/` is one layout driven by `StatsInsights.tsx`: `statsNav.ts` resolves `?view=`/`?sub=`
  (and maps every legacy URL shape onto them, §10), `StatsSection.tsx` is the shared sub-view
  skeleton, `StatsFilterPill.tsx` the stats page's two groups for the shared
  `ui/primitives/FilterPill` (Q7), `h2h/MatchupView.tsx` +
  `h2h/matchupSummary.ts` the "A vs B, every match" drill-in,
  `recordIcons.ts` the one map from a record key to its lucide glyph (M3 — four copies lived in
  four files before it, which is how `Goal` and `Flame` each came to mean two records at once),
  `useOneShotSectionParam.ts` the `?record=`/`?cup=` anchor Streaks, Records and Cups all consume
  (M4), and `RecordsView.tsx`, which **reads `/stats/records`** instead of computing the
  superlatives in the browser from six requests (M4).
  `profile/RecordBadges.tsx` is the profile's band of the records that player holds today **and the
  one `Modal` legend any of its chips opens** (M5 built the band, M8 made it explain itself — §9).
  `profile/guestbookSubjects.ts` is the browser's **one** subject vocabulary (K2) — the three kinds'
  words (`Header image` / `Earlier header image` …), their glyphs, `subjectExcerpt` and the two
  small folds — read by the feed's **citation** (`GuestbookEntryCard`, Q-B: the pinned copy as a
  thumbnail or a quoted excerpt, with the word beside it, as one tap target; `DESIGN.md` §7) and by
  `profile/SubjectCommentTrigger.tsx`, the one
  "comment on this" control the banner, the avatar and the About head all wear (K3; its three looks
  are `DESIGN.md` §7, and it owns `SECTION_HEAD_ACTION_CLASS`, the one `h-8` string a section
  head's actions share — Q-A put the owner's About **Edit** beside it). The guestbook's armed
  composer borrows `ModeBadge` from
  `pages/live/comments/CommentComposer.tsx`, which is **exported** for it — a shared primitive that
  lives in a page module because that is where its family is, and the one chip a composer wears to
  say what it is about to post. **The guestbook feed is flat** (G1): `GuestbookSection.tsx` is a
  `section-head` + `list-divided` rows at the page gutter, like every other section on the profile,
  and `GuestbookEntryCard.tsx` is the row — no `card`, no `inset`. Its reply *and* the tournament
  feed's reply are both `CommentSendRow`; the one field left in either is the edit form
  (`DESIGN.md` §9b). `useProfileGuestbook.ts` holds all of its state and **reads the feed with the
  viewer's token** (G4 — §6: the rows carry per-caller answers, so the viewer is part of the key).
  `ProfileOverviewTab.tsx`'s About block renders the visitor's read view for the owner too, until
  the owner opens the editor from that head (Q-A; `DESIGN.md` §9b).
- `src/ui/` — `primitives/` (Button, Card, CardSection, Modal, Input, Pill, EmptyState,
  InlineLoading, LoadingPlaceholder, MatchOverviewPanel, ScoreLine, MatchSides, ClubMark [the one
  16px club symbol every score-only match row wears, Q8/Q17], StatTile, Chip,
  Stars, List/ListRow, PlayerLink, AvatarCircle [one ringed avatar, T15], RecordLine [the
  `3P 3-0-0 14:6 GD +8` line under a standings/results row — fixed columns sized per list by
  `recordWidths(rows)`], FilterPill [the app's floating filter capsule, used by stats and the
  friendlies list], …),
  `shell/` (AppShell, Sidebar desktop, MobileChrome drawer, BottomTabBar [mobile, 5 destinations
  — `navConfig` has seven, and the bar excludes Clubs and Ideas],
  navConfig, useDestinationLinks + lastLocation [per-destination last-page memory],
  routeHierarchy [the app's one hierarchy] + backNavigation [the one back decision, shared by both
  chevrons and the swipe, plus `NAV_JUMP_STATE`, the mark a nav link puts on its navigation],
  navStack [the entry behind us, how this one was arrived at, and each entry's scroll offset],
  useScrollRestoration + useReturnScroll for scroll memory, useTabParam [`?tab=` for every
  tabbed page], keyboardOpen [the on-screen keyboard's one answer: `<html data-keyboard-open>`,
  Q2], NotificationBell + notificationText [the bell's copy for all seven kinds, in one module],
  PushSetupNotice ["this device gets no notifications", P5], RouteErrorBoundary [the *page*
  failed] and AppCrashBoundary
  [the app failed — mounted in `main.tsx` outside every provider, see `src/diagnostics/`]),
  `ClubBadge`, `NationFlag`, `SectionTabs`, and the club selection: `SelectClubsPanel` (T9 — one
  "Clubs" disclosure per match holding both club slots, the filters and the two random actions)
  with the `ClubPicker` sheet a slot opens. Every icon in these (and everywhere else) is a
  lucide-react component — see §9.
- `src/themes/*.css` — CSS-variable themes (blue default, dark, red, light, green) consumed by
  Tailwind via `rgb(var(--color-*))`. `src/styles.css` holds shared component classes.
- `src/diagnostics/` — the crash recorder (Round 7, 2026-09-15; the blank-screen detector
  2026-09-16). `crashLog.ts` is a 10-entry ring buffer in `safeStorage` fed by both error
  boundaries, `window.onerror` and `unhandledrejection`, plus two synthetic sources;
  `breadcrumbs.ts` keeps the last 20 navigations (URL + PUSH/POP/REPLACE) **in memory** and attaches
  them to whatever is recorded; `lifecycle.ts` leaves a liveness marker so a death that throws
  nothing (iOS jettisoning the web view) is still visible on the next boot **and looks at the screen
  on every tick**, so an app that stops drawing while the page stays open records itself on the spot
  (`blank-screen`) instead of leaving no trace; `blankNotice.ts` paints the message that replaces the
  blank screen — plain DOM, no React, no router, no context, because any of them may be what failed;
  `install.ts` wires them from `main.tsx` before React renders. Read on the phone at Settings →
  Diagnostics (`ui/layout/DiagnosticsSettings.tsx`, `?tab=diagnostics`).
- `src/push/` — service-worker registration + subscription; `public/sw.js` handles push/click and
  re-subscribes on `pushsubscriptionchange`. `pushSetup.ts` is the pure answer to "does this device
  receive push, and what should be done about it" (P5), and `usePushNotifications` is mounted
  app-wide by `AppShell` as well as by Settings — see §10.
- `src/auth/AuthContext.ts` (the context object + `useAuth`) and `src/auth/AuthProvider.tsx`
  (the component) — token/role in localStorage; "view as lower role" and admin "act as player"
  overrides are frontend-only conveniences.
- **A React context is two files** (Q10, 2026-09-16): `<Name>Context.ts` holds the
  `createContext` object and the hooks that read it and **exports no component** — being `.ts` it
  cannot even contain JSX — while `<Name>Provider.tsx` holds the provider and nothing else. The
  four pairs are `auth/AuthContext` + `auth/AuthProvider`, `ui/RealtimeStatusContext` +
  `ui/RealtimeStatusProvider`, `ui/layout/ThemeContext` + `ui/layout/ThemeProvider`,
  `ui/layout/PageTitleContext` + `ui/layout/PageTitleProvider`. One module holding both is the
  shape React Fast Refresh declines: Vite re-times the importers instead, the mounted provider
  keeps handing out the *old* `createContext` object while the hook reads the new one, and
  `useAuth` throws "must be used within AuthProvider" with the provider visible in the stack —
  above `RouteErrorBoundary`, so the whole app blanks. Dev-only, never production.
  `react-refresh/only-export-components` is an **error**, not a warning (`eslint .` exits 0 on
  warnings, so a warning could never fail a gate): when it fires on a context module, split the
  file — never add the disable comment. Consuming a context is unchanged; `useAuth` and friends
  still import from the same `…Context` specifier.

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
make test           # backend pytest   (baseline 273 passed, 11–15 min on the Pi, 2026-09-19; §11 is the authority)
make lint           # ruff (E/W/F/I; line-length 150)
make gen-types      # regenerate frontend/src/api/generated/schema.d.ts after ANY response-model change
cd frontend && npm run check   # tsc + eslint + vitest (baseline 735 tests in 74 files, ~72 s)
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
| `UPLOADS_DIR` (env) | Media root. Docker `/data/uploads`; local fallback `./data/uploads`. Also holds the derived-size cache at `<root>/derived` (W1, §5) — files, not data, safe to delete. |
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
  `PlayerSubjectSnapshot` + `PlayerGuestbookEntrySubject`,
  `PlayerPoke` (+Read), `Comment` (+Read, Vote, ImageFile, ThreadLink, AuthorLink),
  `TournamentPinnedComment`, `TournamentCreatorLink`, `FriendlyCreatorLink`,
  `FeatureRequest` (+`FeatureRequestArea`, `FeatureRequestVote`, `FeatureRequestImageFile`,
  `FeatureRequestComment`, `FeatureRequestEvent`, `FeatureRequestEventRead`),
  `RecordHolder`, `RecordKeyState`,
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
- **Comments and the event log on an idea** (P1, three more tables). `FeatureRequestComment` is one
  flat comment under an idea — author (never NULL, commenting needs a login), `body`, no thread
  link, no image, no vote and **no editing at all**, so there is no `edited_at`: `updated_at` exists
  only because every sibling table has one and a later column would have to go through
  `_RUNTIME_COLUMNS`, and **nothing ever moves it**. Never render an "edited" byline from it.
  `FeatureRequestEvent` is one row per thing that happened to an idea — kind `created` | `comment` |
  `vote` | `status`, the actor, the comment id where there is one, and the status + note as set —
  with `FeatureRequestEventRead(player_id, event_id)` as its read state. One event table, not four
  read tables: a status change was not a row at all before, and a vote has no id of its own, so the
  log is the shape that makes all four kinds one thing. **The bell derives from state, as it does
  for the other three kinds**: an unvote deletes its `vote` event, a deleted comment takes its
  event, and deleting an idea takes its comments, events and reads with it — `featurerequest.id`
  and `featurerequestcomment.id` have no AUTOINCREMENT either (A9), so a row left pointing at a dead
  id would silently reattach to whatever takes that id next. `record_idea_event` writes the actor's
  **own read row** along with the event (the guestbook's trick), so "never tell me about my own
  action" is a stored fact rather than a filter every reader has to remember; a status re-save that
  changes neither status nor note records nothing. Three additive tables, nothing altered, nothing
  in `_RUNTIME_COLUMNS` — and rule 3 above (rollback safety) was **measured, not asserted**: the
  commit before the schema landed (`1c8808d`, extracted with `git archive` so `.git` was never
  touched) was booted against a database the new code had already written all three tables into,
  answered `GET /ideas` **200**, and still created an idea and voted on it. The one documented consequence of a rollback: an idea
  posted under the old code carries no `created` event, so the admins get no bell item for it.
- **Who held what, last time** (M2, two more tables). Every record a reader sees is computed live
  (`services/stats/records.py`); nothing in this app has ever *stored* a ranking, which is fine for
  drawing a page and useless for "Rumpi took it from you", because there is no previous answer to
  diff against. `RecordHolder` (`record_key`, `player_id`, `since`) is that previous answer and
  `RecordKeyState` (`record_key`, `computed_at`, `holder_count`) is which keys have been computed
  at all — both additive, nothing altered, nothing in `_RUNTIME_COLUMNS`, **written only by
  `services/record_holders.py::reconcile_record_holders`** and read by nothing else.
  - **Seeding is silent, and `RecordKeyState` is what makes that honest.** A key with **no** state
    row has never been computed — the first boot on production, and every record kind a later
    deploy adds — so its holders are stored and announced to nobody; a key *with* a row and no
    holder rows means nobody holds it, which is a real answer, not a missing one. `init_db()` seeds
    them the way it seeds `ClubStarRating` and logs `Record holders seeded: N`.
  - **A boot absorbs drift; it never announces it.** `init_db()` runs before the FastAPI lifespan
    starts the dispatcher, so there is nothing to push into — and a deploy must not buzz everybody
    with a backlog. A boot that finds movement says so in the log and stops there:
    `Record holders reconciled at startup: N moved (…) — absorbed, not announced`.
  - **Rule 3 above was measured, not asserted.** The commit before the schema landed (`f8a02b7`,
    extracted with `git archive` so `.git` was never touched) was booted against a database the new
    code had already written both tables into: it boots clean, `GET /stats/players`,
    `/stats/ratings` and `/tournaments` answer **200**, a `PATCH /matches/{id}` answers **200**,
    `/stats/records` answers 404 because that endpoint does not exist there yet — and the 21
    `recordholder` rows were left **untouched**, because old code never reads or writes them. The
    one consequence of a rollback is that results entered while rolled back are not reconciled; the
    next boot of the new code absorbed exactly that (`2 moved (highest_elo,
    highest_scoring_match)`), silently.
  - **The scope is fixed**: `BADGE_MODE = "overall"` and `BADGE_SCOPE = "tournaments"` live in
    `record_holders.py` and nowhere else — every badge and every push, never friendlies.
  - **The empty-column rule**: a `table`/`elo` record is held only among rows with `played > 0`.
    That is not the floor Roli declined — it is "has an entry at all", so a newcomer sitting at the
    default Elo 1000 tops nothing and an empty database does not hand all six players every record.
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
- **A guestbook entry can be *about* the header image, the About text or the avatar, and what it is
  about is pinned** (K1). `PlayerSubjectSnapshot` is what one of those was at one moment
  (`player_id`, `kind`, `source_updated_at`, `text` for the About, `content_type`/`file_path`/
  `file_size` for an image, `captured_at`, unique on `(player_id, kind, source_updated_at)`) and
  `PlayerGuestbookEntrySubject` (`entry_id` PK → `snapshot_id`) is which one an entry names — the
  `PlayerGuestbookThreadLink` shape, and **no column on `PlayerGuestbookEntry`**, so a subject is
  optional on the wire, needs no default explained, and cannot move the "· edited" byline
  (`updated_at`) for something that is not an edit. Both additive, nothing altered, nothing in
  `_RUNTIME_COLUMNS`, **written and read by `services/guestbook_subjects.py` alone**.
  - **Copy-on-comment.** An avatar and a header image are one file per player, overwritten in place
    by `upsert_media_row`, and the About text is one `PlayerProfile.bio` column — so a comment about
    the old one would silently point at the new one. The **first** entry filed against the current
    version pins it: the bytes are copied once to `guestbook_subjects/{snapshot_id}.{ext}` — a *new*
    file in a *new* directory, so the overwriting writer and the two media `DELETE` endpoints never
    touch it — the About text is stored in `text` and needs no file at all, and later entries on the
    same version **share** that pin. **Nothing nobody commented on is kept** (Roli, 2026-09-19: the
    storage tracks the conversation, not the upload history).
  - **The version is the source row's `updated_at`** at capture time (`PlayerHeaderImageFile` /
    `PlayerAvatarFile` / `PlayerProfile`), which is what makes "one copy per version" a
    `UniqueConstraint` rather than a convention.
  - **`current` — "is this still what the profile shows" — is computed server-side** in
    `subjects_for_entries`; the frontend renders the flag and never re-derives the rule (the A10
    shape). For an image it is version equality; **for the About it is *text* equality**, because
    re-saving the same words is a new version but not a change and the chip must not call it one —
    it flips back to "About text" when the old words are typed again, measured in the browser.
  - **The pin dies with the last entry that names it.** `release_subjects` deletes the links of the
    whole subtree being deleted, then every snapshot left with no link, and returns the paths; the
    router unlinks the **files after `commit()`**, exactly as `comment_cleanup` does — a failed
    commit leaves no hole. Deleting the avatar or the header image leaves the pin alone: the entry
    still needs it.
  - **Pinning happens before the entry is inserted**, so a subject that is not on the profile right
    now costs a **409** and nothing else; one helper writes all three messages so they cannot drift
    (*"There is no header image / About text / avatar to comment on right now"*), and a metadata row
    whose file is missing on disk is the same 409 for the same reason `get_player_header_image` 404s
    it.
  - **`init_db()` sweeps orphans on every boot** — `sweep_orphan_subjects`, logged as
    `Guestbook subjects swept: N` **only when it removed something**, counting rows and stray files
    (a deleted link 1, a deleted snapshot 1 with its file riding along, a file with no row 1). It is
    not housekeeping: old code knows neither table, so an entry deleted while rolled back leaves its
    link and its copy, and `playerguestbookentry.id` has no AUTOINCREMENT (A9) — the next entry to
    take that id would silently inherit the dead subject. `attach_subject` **replaces** a stale row
    for its entry id rather than assuming there is none, for the same reason.
  - **Rule 3 was measured, not asserted.** `14e27db` extracted with `git archive` (so `.git` was
    never touched) booted against a database the new code had already written both tables and a
    pinned copy into: it boots clean, `GET /players/1/guestbook` answers **200** with **no `subject`
    key at all** (12 keys per row), and it posts and deletes entries. A9 was not theoretical there —
    the entry it posted came back as **the id a deleted entry had held**. The next boot of the new
    code logged exactly `Guestbook subjects swept: 2` and `guestbook_subjects/` was empty; a further
    boot logged nothing.
- **Media** are files on disk, metadata rows in DB: `uploads/avatars/{player_id}.{ext}`,
  `profile_headers/{player_id}.{ext}`, `comments/{comment_id}.{ext}`, `club_crests/{club_id}.{ext}`,
  `ideas/{request_id}.{ext}`, `guestbook_subjects/{snapshot_id}.{ext}` (the pinned copies, K1).
  Served by the backend with cache-busting `?v=<updated_at>` (`mediaUrl()`). A pinned copy is the
  one picture in the app the backend serves `public, max-age=31536000, immutable` — a snapshot never
  changes and its path already carries its id, so the `?v=<captured_at>` its client URL still gets
  from `mediaUrl` is belt and braces rather than the mechanism.
- **The smaller sizes are a cache of files, not data** (W1, 2026-09-20). Every media GET takes
  an optional `?w=` (§6) and the answer lives at
  `uploads/derived/{source relative path}/{token}-{width}.webp`, e.g.
  `derived/avatars/3.png/20260912132900123456-256.webp`. Keyed on the **source's own relative
  path**, so one `purge_derivatives(rel_path)` serves every family present and future and the
  boot sweep is a question about files rather than about the database. **No table, no column,
  no `_RUNTIME_COLUMNS` entry, no `create_all` change** — `app/models.py` was not touched at
  all: the only new persistent thing is a directory that is safe to delete at any moment, and
  the next request re-derives whatever was thrown away.
  - The `token` is the **row's own** `updated_at` (avatar, header image, comment image) or
    `captured_at` (a pinned snapshot) — never the caller's `?v=`, so a client cannot choose a
    path on our disk, and a replaced source lands on a path that has never been written. The
    chain `upload → new updated_at → new ?v= → browser refetches → new token → fresh
    derivative` holds end to end.
  - **At most seven files per source**, because the ladder is closed (§6), so the cache's
    ceiling is exact and knowable. Measured over the real dev media, which is production's plus
    this branch's own writes: **116 files, 2,684,334 bytes** for every rung of every file in all
    four families, built in 24 s. An avatar holds only four rungs — 768 and up are wider than a
    512 px source, and a request for one serves the original rather than an upscale.
  - **Two paths change the bytes under a relative path and both purge**: `upsert_media_row`
    (overwrite in place, where the path never moves and `delete_media` is never called) and
    `delete_media` (every DELETE endpoint, `release_subjects`, `sweep_orphan_subjects`, the
    extension-changed branch). No router has to remember it, and a path already under
    `derived/` is a no-op, which is what keeps the sweep's own deletes from recursing.
  - **`init_db()` sweeps** what is no longer worth keeping — a directory whose source file is
    gone, and any cached file **older than its own source**, which is exactly what a rollback
    leaves behind — and logs `Derived media swept: N` **only when it removed something**.
    Silence is the expected line on a healthy boot.
- Stats scopes: `tournaments | both | friendlies`, taken as a `scope` query param by **every**
  `/stats/*` endpoint that reads matches — `/stats/players` learned it last (A4), so no stats
  surface can show the Source filter and ignore it. Ratings are Elo-like per mode.
- Push: languages `steirisch` (default) | `deutsch` | `english`; modes `finished_only` (default)
  | `all` | `off`; personal events (pokes, guestbook, all four idea events — created, commented,
  voted, status — and a record moving) go only to the players that event is about, never to the
  actor (§6 names the audience per kind). **A record move is the one personal event that addresses
  *everybody*** (M2): every player hears about it, but each hears a different sentence depending on
  whether they gained it, lost it or watched it happen. Dispatcher is started in the FastAPI
  lifespan.

## 6. API & realtime contract (short map)

Prefixes: `/auth/login`, `/me`, `/me/notifications`, `/tournaments…` (list, `/live`, detail,
create, patch, `/date`, `/generate`, `/reorder`, `/second-leg`, `/stats`, `/decider`,
`/reassign` (+`/reassign-preview`), delete, comments), `/matches/{id}` (patch score/state/clubs,
`/swap-sides`),
`/clubs` (+`/leagues`, `/{id}/crest`, `/{id}/star-history` — public read, oldest first),
`/players…` (profiles, avatars, headers, guestbook (+`subject_kind` on POST),
`/guestbook-subjects/{sid}/image`, pokes, read-maps), `/cup?key=`, `/cup/defs`, `/stats/{overview,players,h2h,h2h-matches,streaks,
player-matches,ratings,ratings/history,odds,records}`, `/friendlies`, `/ideas` (+`/areas`, `/{id}`,
`/{id}/status`, `/{id}/vote`, `/{id}/voters`, `/{id}/image`, `/{id}/comments`, `/comments/{cid}`,
`/{id}/read`), `/push/{config,subscription,subscriptions/me,test}`, `/comments/…`, `/health`.
Roles: `reader` (no token) < `editor` < `admin`; deps `require_editor` / `require_admin`;
owner-only checks in `services/authorization.py`. Error helpers in `app/api_utils.py`
(400/403/404/409).
**`?w=` is the size the picture is drawn at, on four media GETs** (W1): `/players/{id}/avatar`,
`/players/{id}/header-image`, `/players/guestbook-subjects/{sid}/image` and
`/comments/{cid}/image`. It is optional, public like the GET it rides on, and it sits **beside**
`?v=`, which is still the client's cache-buster and is still ignored by the server. The ladder is
seven rungs — `64, 128, 256, 384, 768, 1152, 1536` — spelled once in
`services/media_derivatives.py::MediaWidth`, so anything else (`?w=137`, `?w=1920`, `?w=abc`,
`?w=0`, `?w=`) is a **422 from FastAPI before a line of our code runs**: there is no arbitrary
integer to snap, and therefore no way to fill the disk. A served rung is `image/webp` (LANCZOS,
quality 82) and carries **its source's own `Cache-Control` byte for byte**, `immutable`
included — a derivative is exactly as cacheable as its source, because `?w=` only ever makes a
URL *more* specific. **Every failure serves the original**, with the source's own content type
and a 200: a never-derived format (`image/svg+xml`, `image/gif`), a source already at most that
wide (a 512 px avatar at `w=768`), one Pillow cannot open, an encode that raises — and a source
file that is *gone* falls through to the same `read_media` and the same 404 it always gave. A
derivative is an optimisation and must never be able to turn a working picture into a 500. Omit `?w=` and the response is what it was before this batch, byte for byte.
`/ideas/{id}/image` and `/clubs/{id}/crest` deliberately have **no** `?w=` — the first was
outside the plan, the second is Roli's closed decision (§11).
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
**Comments on an idea (P1/P4) are flat and cannot be edited at all** — Roli's call: a typo is
fixed by deleting and reposting, so there is no PATCH endpoint, no inline editor and no `can_edit`
on a comment. **Delete is the comment's own author or an admin**, for as long as the comment exists
and with no time window; **the idea's author does not moderate** other people's comments on their
idea (the guestbook lets the wall owner, but a comment on an idea is a reply to a document, not a
note on a wall). `IdeaCommentOut.can_delete` carries the per-caller answer and the page renders it.
Comments **ride inside `IdeaOut`** (`comments: […]`, oldest first, a required field) rather than
behind a second endpoint or query key, so the board is one query and one invalidation
(`qk.ideasAll()`). Posting needs editor+, like posting an idea; reading needs no token.
`PUT /ideas/{id}/read` marks every event on that idea read for the caller — any token will do, and
the board calls it when the `?idea=` deep link is consumed and when a logged-in reader opens an
idea's comments, both idempotent server-side.
**Who hears about an idea event is participation, not permission** (Roli 2026-09-19): a **comment**
reaches the idea's author *plus every player who has already commented on that idea*, minus the
actor — once you have said something in a thread you hear the replies, and an admin who has not
commented on someone else's idea still hears nothing; a **vote** and a **status change** reach the
author alone; a **new idea** reaches the admins. **Never the actor**, in every case. One helper
answers this for both channels — `services/idea_events.py::idea_event_audience` addresses the
pushes, `idea_event_reaches` is the same call asked about one person and filters the bell — so the
two cannot disagree the first time a comment is deleted (a push for something the bell never shows
is exactly the kind of drift nobody notices). **Who counts as an admin is the caller's parameter**,
because push resolves it from `secrets.json` (`admin_player_ids`) and the bell from the token's
`role`; that module is not a third definition. `idea_commented`, `idea_voted` and `idea_status`
join `idea_created` in `PERSONAL_DEFAULT_EVENT_TYPES`, so they reach a default "Results & personal"
device and a device set to "Off" still gets nothing, and each carries its own OS tag
(`idea-comment-{id}`, `idea-vote-{id}`, `idea-status-{id}`) — a same-tag notification replaces the
previous one, and "Berni commented" must not be overwritten by "Flo wants it". All four deep-link
to `/ideas?idea=<id>`.
**`/me/notifications` has a response model** (`MyNotificationsOut` / `MyNotificationOut`, P1) — it
was the one endpoint typed by hand on the frontend — and it now builds **seven** kinds:
`comment_reply`, `guestbook`, `poke`, `idea_created` (admins only, decided from the token's
`role`), `idea_comment`, `idea_vote`, `idea_status`. The wire format did not move, with one nuance:
FastAPI now renders the optional keys an item does not use as explicit `null` where the key used to
be absent — `exclude_none` was deliberately **not** used, because it would also have removed the
meaningful `"author_player_id": null` a "General" comment carries. `created_at` stays a `str`. The
bell's copy for all seven lives in `ui/shell/notificationText.ts`, never inline in the component.

**A guestbook entry's subject rides inside the entry** (K1). `POST /players/{id}/guestbook` takes
`subject_kind` — `header_image` | `about` | `avatar`, **root entries only**, because a reply's
subject is its root's: a reply that carries one is a **400**, an unknown kind is a 400, and `""` is
simply "no subject" and answers 200. `GuestbookEntryOut.subject` carries it back
(`GuestbookSubjectOut`: `kind`, `snapshot_id`, `captured_at`, `text`, `has_image`, `current`) on the
list, on the POST and on the PATCH, so there is **no second endpoint and no second query key**, and
an untagged entry's `subject` is null. `GET /players/guestbook-subjects/{snapshot_id}/image` serves
the pinned copy: a public read like the avatar, immutable for a year (§5). **A subject changes
nothing else about the guestbook** — `push_guestbook_created` fires once per entry with the same
`text_context`, the bell's `guestbook` kind and its `path` are unchanged, so are
`PlayerGuestbookRead`, the edit window and `player:guestbook:update`, and a test
(`test_a_tagged_entry_notifies_exactly_once`) is what keeps that true. Whether the push should *say*
"about your header image" was asked and declined (Roli): a tagged entry still "left a new message".
**`GET /players/{id}/guestbook` is a public read that answers per caller** (G4). `can_edit`
(`guestbook_can_edit`: the author within `GUESTBOOK_EDIT_WINDOW`, or an admin) and `my_vote` are
computed from the bearer token, so the frontend sends it whenever there is one — the read itself
stays public and a logged-out reader gets the same list with an anonymous caller's flags. That
makes the viewer part of the query key, exactly as it is for comments, friendlies and ideas: see
the cache table below. **A per-caller flag is only as good as the request that asked for it** — the
gotcha in §10.

**Records are computed in one place, and the backend says where each one lives** (M1).
`GET /stats/records?mode&scope` is a public read like every `/stats/*`, with the same `mode`/`scope`
shapes `/streaks` has. It returns the sixteen records in `RECORD_DEFS` order, each with its
`holders`, its `value` and its **`path`** — where that record lives in Stats (`table`/`elo` →
`sub=table&sort=<col>`; `streak` → `sub=streaks&record=<key>`; `title`/`match` →
`sub=records&record=<key>`). **The legend row behind a badge, and the push deep link, both use
that `path`**, the way `/ideas?idea=<id>` is already emitted by the backend; the frontend never
builds one. The Records
page reads this same endpoint (M4), which is what makes "a badge claiming a record the Records page
does not show" impossible rather than merely unlikely, and the badge reads the same **cache entry**
at the page's defaults — `qk.stats.records(mode, scope)` lands under the existing `["stats"]` row of
the table below (30 s), no new row.
**One function is called by every path that changes a result** (M2).
`services/record_holders.py::after_result_change(request, s, *, tournament_id, reason)` —
reconcile, then push, then log. It **commits**: the documented exception to "routers own the
transaction", precedent `_bulk_delete_matches(autocommit=True)`. The callers, with the guard each
one carries, because a guard and not a comment is what keeps a list like this honest:

| path | called when |
|---|---|
| `PATCH /matches/{id}` | `old_state == "finished" or m.state == "finished"` — **a goal in a *playing* match is not yet a result**; finishing, un-finishing and correcting a finished score are |
| `PATCH /matches/{id}/swap-sides` | `m.state == "finished"` — it swaps who won |
| `POST /tournaments/{id}/generate` | `deletion.finished > 0` — regenerating a live tournament destroys finished matches |
| `POST /tournaments/{id}/reassign` | `deletion.finished > 0` — provably always 0, because it refuses before it deletes; the guard is the proof, and a test asserts it stays 0 |
| `PATCH /tournaments/{id}/second-leg` (disable) | `deletion.finished > 0` — likewise (`_leg2_started` refuses otherwise) |
| `DELETE /tournaments/{id}` | always — it destroys results |
| `PATCH /tournaments/{id}/decider` | always — it changes the tournament's winner, i.e. Most tournament wins |
| `PATCH /tournaments/{id}/date` | the tournament has ≥1 finished match — streaks, Elo and the upset are ordered by `tournament.date`, so a moved date reorders them |
| `manage.py add-match` | always, with `request=None` — the one write outside HTTP; no dispatcher, so it persists and logs and nobody is pushed |

`reorder` (it cannot move a finished match), friendlies (outside `BADGE_SCOPE`), `POST
/tournaments`, a name/settings `PATCH` and a player rename (holders are ids, not names) are
deliberately **not** in the list, and a test asserts each of them does not call it.
**A record that changes hands notifies every player** (M2, Roli's decision): one push **per player
per record moved**, with three texts chosen by the *recipient's* relationship to the move and never
by the actor — gained · lost · watching, in the vocabulary of the **kind** the paragraph below
defines — so the editor who types in their own win is told they gained it. **Roli was shown the
arithmetic — six players is six notifications per record moved, and a four-record night is four
per person — and chose to keep it**; nobody quietly turns this into a digest later. The only batching is the OS tag `record-{key}`, which
replaces the previous message about that same record. `record_moved` joins
`PERSONAL_DEFAULT_EVENT_TYPES`, so it reaches a default "Results & personal" device and a device set
to "Off" still gets nothing. The deep link is the record's own `path`, and a record's *name* is
translated per language (`notification_texts.py::_RECORD_LABELS`, one entry per key of
`RECORD_KEYS` in each language, guarded by a test that fails the moment the two disagree in either
direction) — so a push says "Bei meiste Punkt bist nimma vorn" while the English UI says
"Most points".
**Eight of the sixteen are not records at all — they are leads, and the push says so** (Roli,
2026-09-19). A record is a best-ever mark that stands: the longest streak anyone has run, the
biggest win ever played. A **lead** is whoever is top of a running tally *right now* — most points,
highest points per match, most played, most goals per match, the three Elo badges, and most
tournament wins, which is a cumulative count like points rather than a feat.
`services/stats/records.py::record_kind(key)` is the **one place** that decides which of the two a
key is (by `RecordDef.group`: `table`, `elo` and `title` are leads; `streak` and `match` are
records), and both the push key and the sentences follow it — `lead_gained` / `lead_lost` /
`lead_watch` beside `record_gained` / `record_lost` / `record_watch`, six keys per language, and
`_record_lines` takes the same `kind` so no line contradicts its own title. **A lead is taken and
overtaken; a record is snatched and lost**, and a lead is never called a Rekord: *"Jetzt bist du
vorn bei meiste Punkt"*, never *"Rekord! meiste Punkt is jetzt deins"*. Nothing else in the app
branches on the kind — the event type stays `record_moved`, the OS tag stays `record-{key}`, the
audience is unchanged, and `/stats/records`, the Records page and the badges treat all sixteen
alike; it is a copy decision, made once, server-side.

WebSocket channels (`app/main.py`, `app/ws.py`, `services/events.py`):
- `/ws/tournaments/{id}` → `tournament.sync` (full tournament payload), `tournament.deleted`,
  `comment.upsert|delete|meta`.
- `/ws/tournaments` → coarse `tournaments.changed {action, tournament_id?, status?}`. Actions:
  `created` · `updated` · `status` · `result` · `deleted` · `comment`. Writing or deleting a
  comment sends `action="comment"` — the only action that does **not** refetch the list, because
  it exists solely to move the unread badge (A5). `action="result"` is its opposite (Q9): a
  score or side correction on a tournament that is **already done**. It moves no status, so it
  used to be broadcast to nobody, and the list's winner, the cup owner and every stat could stay
  wrong on every other device. `services/events.py:global_action_for_match_change` is the only
  place that decides this, for both `PATCH /matches/{id}` and `/swap-sides`; a goal in a *live*
  match still sends nothing globally, so the channel stays as coarse as it was designed to be.
  **Regenerating a live tournament over finished matches, and changing a played tournament's date,
  send `result` too** (M2) — both used to announce themselves as a mere `updated` although they move
  Elo, streaks and the upset, and they were the last two holes a tournament result could slip
  through.
  `result`, `status` and `deleted` are the three actions that invalidate stats and cup.
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

### Channel coverage, and the cache timers that follow from it (Q9)

Two timers decide what a screen does when you come back to it, and only one of them shows:

- **`gcTime`** — how long data is *kept* after the last component using it unmounts. When it
  expires there is genuinely nothing to render, so the return is a fresh load with a loader.
  It is **30 minutes**, uniform, set once in `frontend/src/api/cachePolicy.ts`. (It was
  TanStack's default of 5 minutes since the initial commit — shorter than Roli's trip to the
  kitchen, which is the whole of "why is this screen loading again?".) Measured cost of keeping
  it: **1.58 MB of JS heap** for a 22-screen session (76 cached entries, 782 KB of JSON).
- **`staleTime`** — how long data may be *believed*. Inside the window a return renders from
  cache and asks nothing; outside it, the cache still renders instantly and a refetch lands
  behind it. Invisible; costs traffic. It is set **per domain**, by one question only:

> **How does a change reach a client that is already looking at this data?**

The table lives in `frontend/src/api/cachePolicy.ts` — one row per `qk` key prefix, carrying the
coverage, the number and the reason together, applied with `setQueryDefaults` so **a new query
inherits its domain's policy without opting in**. Keep this map and that table in step; the
guard in `src/test/cachePolicy.test.tsx` fails if a `qk` namespace has no row.

Coverage is not "is there a channel" but "is the channel open *while you are away*":

| Key prefix (`qk`) | Coverage | `staleTime` | Why |
|---|---|---|---|
| `["tournaments"]` (list + `/live`) | **global channel** — `/ws/tournaments` is mounted in `AppShell`, open all session | 5 min | Created / edited / finished / corrected / deleted all send `tournaments.changed`; reconnect and foreground resync it. It cannot change quietly. |
| `["tournament", id]` | **page channel** — `/ws/tournaments/{id}` | 5 s | The socket is closed when the page unmounts (`connection.ts` deletes the conn at refCount 0), and its *first* connect deliberately does not resync — the mount GET is the resync. So a return must revalidate. |
| `["comments", …]` | **page channel** (same socket) | 5 s | Same lifetime as the tournament it belongs to. |
| `["comments","summary"]` | **global channel** | 5 min | Every comment write sends `action="comment"` purely to move this badge (A5). |
| `["cup", …]` | **global channel** | 5 min | Ownership moves only when a tournament finishes (`status`), is deleted, or a done result is corrected (`result`) — all three announce themselves. |
| `["cup","defs"]` | none (static) | 30 min | `cups.json`, read once at backend startup. Only a deploy changes it. |
| `["stats", …]` | **partial** | 30 s | Tournament results announce themselves; **friendly results are broadcast by nothing at all**, and every `/stats/*` endpoint takes `scope=friendlies\|both`. `qk.stats.records(mode, scope)` (M1) inherits this row on purpose: the profile's badge band and the Records page share one entry, so tapping a badge into Stats is a cache hit of the payload the badge was drawn from. |
| `["match-h2h", …]` | **partial** | 30 s | The same numbers as `/stats`, but the key sits *outside* `["stats"]`, so no reducer ever invalidates it — only the window does. |
| `["me","notifications"]` | **partial** | 30 s | A reply to your comment invalidates it from the tournament channel; a poke, a guestbook entry or an idea event does not. `NotificationBell`'s own 60 s poll covers the rest. |
| `["players"]` (roster, profiles, avatars, headers) | **none** | 5 s | No channel: a rename or a new avatar reaches another device only by refetching. |
| `["players","pokes"]`, `["players","guestbook"]` | **page channel** — `/ws/players/{id}` | 5 s | Open only while that profile is on screen. The row did **not** move for K1 or G4: a subject rides inside this list payload, so `resyncPlayer` already carries it, and G4's `qk.playerGuestbookFull(id, token)` lands under this same prefix, so no row was added and `cachePolicy.test.tsx` needed none. The one thing the channel never announces is a change to the *subject itself* — a new upload or a bio save flips `current` — so the owner's own picture and bio mutations invalidate `qk.playerGuestbook` locally (K3) and any other device finds it in this window or on the focus refetch (measured: 6.8 s away and back, 2 refetches, no reload). |
| `["clubs", …]`, `["leagues"]` | **none** | 5 s | Nothing announces an added club or an edited star rating; the window is the only thing that finds it. The catalogue is also the biggest payload in the app (113 KB), which is why six call sites raise it to 60 s where the data is a lookup table rather than the subject. |
| `["friendlies", …]` | **none** | 5 s | Friendlies broadcast nothing — a result typed into another phone in the same session is invisible until this one asks again. |
| `["ideas", …]` | **none** | 5 s | R5 gave the board no channel on purpose, and P1's comments changed nothing: they ride in the same payload under the same key, so the writer's own mutation invalidates `qk.ideasAll()` and everyone else gets them on the next return or focus. `["ideas","areas"]` is a static list (1 h at its call site). |
| `["push", …]` | **none** | 30 s | This device's own subscriptions; nothing but this device changes them. |

**Call-site overrides that stand** (a `useQuery` option still beats the table, so each one is a
claim the table cannot make): `useLiveTournament` polls `["tournaments","live"]` at `staleTime: 0`
with `refetchOnMount: "always"` + a 60 s interval — "is something live right now" is the one
thing that must never be wrong; `StandingsTable`'s `stats.streaks` at 0 while a tournament is not
done, because the tournament channel pushes the tournament but never invalidates stats, so the
streak chips would lag the goals; `MatchDetailPage`'s `fetchQuery(…, staleTime: 0)` inside the
save mutation, a deliberate read-before-write; `tournamentReassignPreview` at 0, because the
dialog names what it is about to destroy; the odds query at 2 s, recomputed from the form; and the
club catalogue at 60 s in the pickers. Anything else that sets `staleTime` is fighting the table.

**`refetchOnWindowFocus` is on** (it was globally off). A PWA backgrounded for hours heard
nothing, and a long staleness window would have made that worse. It does not duplicate the
websocket's own resync: `useVisibilityResync` *invalidates* the channel-covered keys (ignoring
`staleTime`), while a focus refetch only touches queries that are **stale and active** — which,
after the table above, are exactly the keys no channel watches. The two cover disjoint sets.

**`placeholderData: keepPreviousData` belongs on a filter, not on a subject.** Changing Mode,
Source, Last-N, the Clubs page's game or the friendlies mode tabs re-asks the same question, so
the current rows stay on screen while the new ones load — Q9 added the last two for exactly that
reason. Changing *which* player or tournament is being shown is a different question, and holding
the previous subject's numbers under the new subject's name is wrong, not stale: never put it on
a query whose key names an entity the page is titled after (a tournament, a profile, a match).
The stats Player and H2H drill-ins sit on the line — their key carries `selectedId` — and keep it
deliberately (S3): their picker is a filter over one page and the mismatch lasts one round trip.
A 30 minute `gcTime` also makes it matter less than it did: a filter or a player you have already
looked at now comes back from cache with no placeholder at all, so `keepPreviousData` is left
doing only what it is for — the combination nobody has asked for yet.

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
  `vapid_private_key.pem`,
  `uploads/{avatars,profile_headers,comments,club_crests,ideas,guestbook_subjects}`) plus the
  git-ignored `backend/secrets.json`. Nothing else is stateful. `uploads/derived/` lives in the
  same bind mount but is **not** data: it is the derived-size cache (§5), it has to be on the
  mount because it holds files a container rebuild would otherwise discard on every deploy, and
  deleting it costs one slow request per size and nothing else.
- **Standard deploy** (run on the server):
  ```bash
  ssh hetzner
  cd ~/projects/Lorbeer-Turnierplaner && git pull && docker compose up -d --build
  docker compose logs -f backend      # expect "Cup defs validated", "DB initialized"
  ```
  Only the frontend changed → `docker compose up -d --build frontend` (Vite env is baked in).
- **The media batch adds the project's first image dependency** (W1, 2026-09-20):
  `Pillow==12.3.0` in `backend/requirements.txt`, which makes that deploy a **full** one (the
  backend image is rebuilt with a new wheel in it) even though it changes no schema. **The one
  thing to watch in the build log is `pip install`**: expect a
  `pillow-12.3.0-cp311-cp311-manylinux…_x86_64.whl` **download** — 6.93 MB, a file that was
  looked up on PyPI rather than assumed — never a compile. If it starts building from source,
  stop and report: it means the wheel did not match and the image would need build tooling,
  which `backend/Dockerfile` deliberately does not have. The wheel costs ≈ 24 MB unpacked
  (`PIL/` 8.3 MB + `pillow.libs/` 16 MB) and nothing else about the image changes. The
  frontend's alpine/musl lockfile problem (§10) does not carry over: the backend image is
  Debian/glibc x86-64 and this dev Pi is arm64 glibc, and a wheel exists for both.
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
  **A rollback past the media batch costs nothing and was measured, not asserted** (W1): old
  code ignores an unknown `?w=` and serves the original, and it never reads or writes
  `uploads/derived/`, so the cache is simply left alone (a before/after manifest of 116 files
  was identical). The one consequence is a source replaced *while* rolled back, whose rungs are
  then older than their own file; the next boot of the new code removes exactly those
  (`Derived media swept: 4`, measured) and the next request re-derives them.
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
**Restart the backend after a sync** — `init_db()` runs at startup only, so a database swapped
underneath a running server keeps serving production's schema and 500s on every table added since
(§10).
**`uploads/derived/` rides along, harmlessly** (W1, 2026-09-20): `backup-deploy-data` pulls
`/uploads/***` recursively, so a prod snapshot now carries the derived-size cache too, and
`sync-local-from-deploy` mirrors it into the dev tree with `--delete` like the rest of
`uploads/`. Both are fine — it is a cache of the very files being copied beside it, and §5 says
why deleting it is always safe. It is written down only so nobody reports a snapshot that grew a
`derived/` directory as a bug.
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
  done on `feature/2026-09-batch`, see §11),
  `DESIGN_FIXES_2026-09.md` (C1–C15: the blind design audit's Parts 1, 2 and 4 plus the
  vocabulary sweeps, done on `feature/2026-09-design-fixes`, see §11),
  `FEATURES_2026-09-ideas.md` (P1–P6: comments on ideas, the author's notifications and the
  device that hears nothing, done on `feature/2026-09-ideas`, see §11),
  `FEATURES_2026-09-badges.md` (M1–M10: `/stats/records`, the stored holders, the push when one
  moves, the profile's badge band, done on `feature/2026-09-badges`, see §11),
  `FEATURES_2026-09-guestbook.md` (K1–K4: a guestbook entry can be about the header image, the
  About text or the avatar, pinned so it still makes sense later, done on
  `feature/2026-09-guestbook`, see §11 — **Q-A, Q-B and G1–G5 came from Roli living with that
  batch and have no section in the plan file**, so §11 and their commit messages are where they
  are written down). A new batch gets a
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
- **A conversation lives in one place, and an item never hosts its own thread** (K1–K3,
  2026-09-19). The profile's three items — the header image, the About text, the avatar — get a way
  to *start* a comment and a count of the ones about what is there now, and nothing else: the
  message itself is an ordinary guestbook entry carrying a **subject**, so it appears exactly once
  on the page, and the trigger arms the guestbook's own composer rather than opening a second one.
  That is what let the whole feature reuse the guestbook's push, bell, read state, realtime event
  and edit window **unchanged**. Before giving a new surface comments, ask whether an existing feed
  can carry them with one more field; a second comment surface would have duplicated five
  mechanisms to say the same thing. **And an entry *cites* what it was about rather than naming
  it** (Q-B): the pinned copy as a thumbnail or a quoted excerpt, with the word still beside it
  (`DESIGN.md` §7).
- **An owner's page is the visitor's page plus one action** (Q-A, 2026-09-19, Roli: *"about text on
  own profile should look exactly like other profiles, with edit button beside comments label"*).
  A block the owner may edit renders the **visitor's** read view until they open the editor from
  one action in the section head — never an always-open field where everyone else sees text, or the
  owner never sees their own wall the way the friend group sees it. It is M8's move on the profile
  header applied below it; the rule, the shared `SECTION_HEAD_ACTION_CLASS` and the
  close-after-`mutateAsync` detail are in `DESIGN.md` §9b and §6.
- **An avatar speaks in the present tense** (T15, 2026-09-13): every player avatar is
  `ui/primitives/AvatarCircle` and wears a ring — neutral hairline by default, the cup's colour
  when `cups` says that player holds it **today** (`hooks/useCupHolders`). A ring is never used for
  historic ownership, and **one tense per screen**: only surfaces about *now* pass `cups` (Players
  page, profiles, the stats leaderboards, the dashboard cups preview). Inside a tournament — its
  standings/results, What-if, match lists, Overview — and in the Positions grid of past
  tournaments, avatars keep the hairline alone; cup information there comes only from the
  standings' `CupOwnerBadge` crown ("owned it going into this tournament", Roli's call after
  seeing rings on old results). Comment authors, guestbook entries and pickers carry no cup
  marking at all. **The crown is never drawn beside a ringed avatar** (C12, 2026-09-17): it left
  the Players page and the profile header, where the ring already said "holds it today", so the
  standings is now its only site and its only meaning. A picker avatar's accent ring means
  "selected" and is the one audited exception to "a ring means a cup" — no picker passes `cups`,
  so the two can never meet. **The profile's badge band is the second present-tense mark on that
  screen, and is deliberately not a ring** (M5, 2026-09-19): `pages/profile/RecordBadges.tsx` shows
  the records that player holds *today* as grey `.chip`s with a lucide glyph each — **no `Crown`,
  no cup colour token**, because it sits a few pixels from the avatar's cup ring and must read as a
  different kind of mark (the duplication `C12` deleted once already). An ongoing streak record
  wears `border-accent`, the very signal `PlayerStreakChips` paints on the same profile — **never a
  dot**, and never the green one, because `C10` moved the streak chip off green for saying "a match
  is playing". **A chip is a `button`, not a link** (M8): a glyph cannot say what it stands for, so
  any chip opens one `Modal` legend — only the records this player holds, each row a fixed 28px
  glyph mark, the label and the explainer — and the **row** is what navigates, to the `path` the
  backend emits (`DESIGN.md` §7). The band carries no count: a tie is visible in Stats, one legend
  row away (`×N` already means three things, `DESIGN.md` §5b).
- **Icons: lucide-react only** (`DESIGN.md` §1.5). Font Awesome is gone (DS7, 2026-09-13) —
  the dependency, the CSS import and every `<i class="fa-…">` with it. Import the component
  (`import { Crown } from "lucide-react"`) and give it an explicit `size` in px; `aria-hidden`
  unless the icon carries meaning on its own, then `aria-label`/`title`.
  **A record's icon comes from one map** (M3): `pages/stats/recordIcons.ts::recordIcon(key)`, read
  by the Records page, the Streaks page, `StreakPatches`, `PlayerStreakChips` and the profile
  badges. It replaced four private copies, which is how `Goal` and `Flame` each came to mean two
  different records at once; the sixteen glyphs were approved by Roli on 2026-09-19 (the table at
  the top of `FEATURES_2026-09-badges.md`, mirrored in `DESIGN.md` §7). An unknown key still gets a
  glyph. Never spell a record's icon inline again.
- **A picture asks for the size it is drawn at, and the picture you *open* is a different URL**
  (W1–W3, 2026-09-20). Three shapes, one rule each: an **avatar** asks from **inside**
  `AvatarCircle`, which reads the `sizeClass` its 25 call sites already hand it — no call site
  spells a width, because a component with 25 chances to disagree with itself is the bug this
  avoids; a box whose width **follows the viewport** (the profile banner, a comment's picture)
  uses `srcset`/`sizes`, the platform's own answer, which needs no measurement in JS, no resize
  listener and survives a rotation; a box that is a **fixed size at every viewport** (the
  guestbook citation's 71×40 / 40×40 thumbnail) asks for one rung with `mediaWidthFor`. And the
  **lightbox and the crop editor always get the original, with no `w=` at all** — `ImageLightbox`
  zooms to 6×, which *is* the full-size use. Never feed one variable to both jobs: that the
  drawn banner and the lightbox were the same string in `ProfileHeader` is what made a 358 px
  picture download 2.66 MB. Widths come from `api/mediaSizes.ts` and nothing else spells one;
  `DESIGN.md` §7 carries the visual half.
- **Style:** match surrounding code; Tailwind + design tokens (no raw colors); compact-mobile
  idiom (`md:hidden` icon + `hidden md:inline` label, `text-xs` for dense text and `.text-micro`
  for markers — arbitrary `text-[Npx]` is banned, `DESIGN.md` §5);
  `qk` for every query key; generated types, no hand-written API mirrors; thin routers, logic in
  services; error helpers from `api_utils.py`. No new dependencies unless the plan says so —
  and the backend's first and so far only exception is **`Pillow==12.3.0`** (W1, 2026-09-20),
  which `FEATURES_2026-09-media.md` said in as many words and argued for in writing: there is no
  way to resize a JPEG in the standard library, Pillow ships a wheel for **both** of this
  project's targets so nothing is compiled anywhere (§7), and it is imported **inside**
  `media_derivatives._encode`, so no other part of the backend can come to depend on it by
  accident.
- **Words are canon too** (C10, 2026-09-17): `DESIGN.md` §5b is the app's word list — one word per
  quantity, `fmtCount` for a count in prose, `fmtAvg` for a per-match average, `joinNames` for two
  names on one line, sentence case, `…`. Read it before naming a label.
- **German and Styrian push texts carry their umlauts** (M2, 2026-09-19). Write real characters —
  ä ö ü ß — in every notification string, and repair any transliteration you find in the same
  sweep. The old convention was imitation, never a constraint: `services/webpush.py:173` has always
  serialised with `ensure_ascii=False` over UTF-8, and the only `ascii` in that module is the base64
  of the VAPID key, where it belongs. M2 repaired **27 strings across the catalogue** covering 14
  distinct words (`Oeffne`, `fuer`, `Anpoebeln`, `geaendert`, `laeuft`, `Spass`, … — plus a German
  string that said `Guestbook-Eintrag` where `Gästebuch-Eintrag` belongs), and
  `test_the_catalog_is_not_transliterated` keeps them out. **Do not re-impose "ASCII-safe" on
  German**, in the code, the plans or this file. The one thing nobody here can check: **iOS
  rendering a non-ASCII push body is unverified** — these are the first the app has ever sent, so if
  a real notification ever shows mojibake, that is where to look, not at the catalogue.
- **No call site spells a locale** (C1, 2026-09-17). `frontend/src/utils/format.ts` exports the
  two constants every date helper uses: **`APP_LOCALE_NUMERIC = "de-AT"`** for numeric dates and
  times (`12.09.2026`, `12.09.2026, 14:30`) and **`APP_LOCALE_MONTHS = "en-GB"`** for spelled and
  abbreviated months (`12 September 2026`, `12 Sept 2026`), so a German month name never appears
  in the English UI and both shapes are day-first. One helper per shape, no inline
  `toLocaleDateString`/`toLocaleTimeString` anywhere (`grep -rn 'toLocale' frontend/src | grep -v
  test/ | grep -v APP_LOCALE_` → 0). `en-GB` abbreviating September as the four-letter "Sept" is
  known and kept.
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
- **A per-caller flag is only as good as the request that asked for it** (G4, 2026-09-19 — found
  while verifying G2, which had reworked a control that had never once rendered in the app). A
  public read that carries `can_edit` / `can_delete` / `my_vote` answers for **whoever asked**, so
  a client that omits the token gets the anonymous answer and the A10 rule — "render the flags,
  never re-derive the rule" — silently renders nothing at all. `listPlayerGuestbook` did exactly
  that: `can_edit` was `false` for the author inside the window *and* for an admin, and `my_vote`
  was 0 for everybody, with the API demonstrably correct under `curl -H "Authorization: Bearer …"`.
  **Two halves, and the second is the one that gets forgotten:** send the token, *and* put it in
  the query key, or the logged-out payload already in the cache (fresh for 5 s, kept for 30 min) is
  handed to the account that just logged in — the same bug one step later, and it was reproduced in
  a browser before it was closed. The app has one mechanism for this and it is a **full key beside
  a prefix key**: `qk.playerGuestbookFull(id, token)` under `qk.playerGuestbook(id)`, the shape
  `commentsTournamentFull`, `friendliesList` and `ideas` already use, so every existing
  invalidation keeps working and the cache-policy row does not move. The flag is computed from the
  **account**, while "view as lower role" is frontend-only, so the effective role still gates the
  control (`canPostGuestbook && !!can_edit`, the app's `isEditorOrAdmin && !!row.can_edit` shape).
  When adding a per-caller field to a public read, check both halves.
- **Ideas sits below Clubs in the sidebar and the drawer and has no bottom-bar tab** (R5, Roli's
  call): five items are what fits a phone row. It is the only nav destination a reader can see
  that an editor also sees in the same place, because reading the board is public and only
  writing needs a login.
- **A PWA reinstall silently destroys the push subscription** (P5, 2026-09-19 — it cost Roli days
  of silence and he found out only by tapping Settings → Send test). Re-adding the app to the Home
  Screen throws away the service-worker registration and the subscription with it; the server still
  holds the old endpoint and only learns it is dead when the push service answers 404/410 to the
  *next* push. Worse, `upsert_push_subscription` cleared `disabled_at` on the next PUT of the same
  endpoint, so the client's auto-sync **resurrected the corpse on every launch** and it died again
  on the next push, for ever. Now `PUT /push/subscription` answers **410** for an endpoint whose row
  is disabled **and** whose `last_http_status` is 404/410 — the push service's own verdict, keyed on
  the endpoint string — and the client rotates (unsubscribe → subscribe → PUT) instead of
  re-enabling it. A row a *client* disabled carries no rejection status and is re-enabled exactly as
  before, and other failure classes (5xx, timeouts, a VAPID 401) never disable a row at all: a bad
  VAPID key is a server problem, not a dead device. `sw.js` re-subscribes on
  `pushsubscriptionchange` but **cannot PUT the new endpoint itself** (auth is a bearer token in
  `localStorage`; there is no cookie session), so the server learns it on the next launch through
  the auto-sync — which is why `usePushNotifications` is mounted app-wide (`AppShell` →
  `ui/shell/PushSetupNotice.tsx`) and no longer only in Settings. **A device that receives nothing
  now says so, unprompted**: one `warn` line under the top bar on whatever page the reader is on,
  shown only while nobody has decided on this install (`permission === "default"`) and no
  subscription exists — once per install, dismissible. `denied` is a decision and is respected;
  `granted` with no subscription is the browser having dropped it and is re-subscribed **silently**
  (no prompt is possible or needed) unless the person turned push off here on purpose. The
  dismissal lives in `localStorage` on purpose: a reinstall wipes it along with the subscription,
  which is exactly the case that must ask again. **The iOS half is unverified and only Roli's phone
  can close it** — that iOS resets `Notification.permission` to `default` on a reinstall is WebKit's
  documented behaviour, not something measured here; if it comes back `granted` instead, the device
  takes the silent re-subscribe path and the notice correctly stays away.
- **Headless Chromium cannot tell you what a permission prompt would do** (P5, two hours). It
  reports `Notification.permission === "denied"` no matter what, CDP `Browser.setPermission:
  "prompt"` included, so the "nobody has decided" case exists only in a **headed** browser under
  `xvfb-run`; and Playwright's `newContext({ permissions: [] })` is an *empty grant*, which denies
  notifications — omit the option entirely to leave the default alone. `pushManager.subscribe()`
  cannot succeed here either (no push service), so a test can assert the attempt and not the PUT.
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
  its stacks name real files and lines; a production stack is minified (measured: `at e
  (index-<hash>.js:22:292267)`), which is why `lorbeerkranz.xyz` would need `build.sourcemap`
  before a crash can be chased there — an open call, deliberately not taken.
- **Backgrounding a PWA is not a crash.** `lifecycle.ts` only reports a session whose last marker
  said `visible`; a `pagehide`/`visibilitychange` write (`hidden`) is an ordinary end and is
  silently dropped. Anything that makes the app write a `visible` marker on its way out would turn
  every app switch into a false "Ended unexpectedly". The **one** carve-out is a marker carrying
  `blank` (below): the screen was already dead when the app was backgrounded, and backgrounding a
  dead app is the reaction, not the cause.
- **A blank screen that leaves the document alive used to record nothing at all** (2026-09-16, after
  it happened to Roli twice). The diagnostics install before React and run independently of it, so
  the heartbeat kept writing `visible` while the root sat empty — nothing ever asked whether anything
  was on screen — and the only sensible reaction to a black screen, backgrounding or force-quitting
  it, rewrote the marker to `hidden`, which is never reported. Now every tick (3 s) asks two O(1)
  questions of the mount point — `isConnected`, `firstElementChild` — and a blank writes its own
  entry there and then, with the trail, **with nothing having thrown**. Rules that must not be
  loosened: it fires only after it has seen the app draw at least once in this document (so the
  window between `createRoot` and the first paint, and a boot that never rendered, are not it), only
  past `BOOT_GRACE_MS`, only once per document, and never on a root React *replaced* rather than
  emptied (the element is re-resolved by id first). **The look must stay free of geometry** —
  `offsetHeight`, `getBoundingClientRect`, `getComputedStyle` all force a reflow; the two property
  reads measure ~77 ns against ~19 µs for the marker write they sit next to. The storage cadence is
  unchanged: the marker is still written every 15 s (every fifth tick), never more.
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
- iOS PWA: push notifications need a Home-Screen install.
- **One navigation model, and `DESIGN.md` §10 is where it is written down** (Q6 + Q6b,
  2026-09-16). `ui/shell/routeHierarchy.ts` answers two questions about any location — is this
  somewhere you went *into* (`inside`), and what is one level up (`parent`) — and
  `backNavigation.ts` turns that into the app's single back action. The mobile top-bar chevron,
  `PageLayout`'s desktop chevron, the swipe gesture and the desktop title row all call `useBack()`;
  there is no per-page `back` prop, no route-pattern list, and no screen with a back control of its
  own (the stats matchup's in-view "← Head-to-head" button is gone — the chevron is its way out).
- **Back means "where you came from", except after a jump** (Q6b, Roli on his phone after testing
  Q6; it supersedes Q6's "back is always one level up"). On an `inside` page back **pops** whenever
  the entry behind is where the reader came from — the parent, or whatever drilled in here — so
  that page returns with its scroll, its open tab and its data. **Except after a jump**, where it
  navigates to the parent with **`replace`**: tapping a nav destination that lands on the page U6
  remembered must go up inside the destination that was asked for, not pop out into the one you
  were in before (N1), and a cold link, a push notification or an arrival we cannot vouch for are
  the same case. A destination has no "up" and does not consult the arrival at all: back there is
  the history step behind you, or home when there is none — it never leaves the app.
  **The distinction is recorded, never inferred.** A jump and a drill-in look identical afterwards
  (N1 and T11 are the same shape and want opposite answers), so every nav link carries
  `NAV_JUMP_STATE` (`useDestinationLinks` builds them for all three shells; "Live now", Settings,
  and the "Save and return"/"Cancel" buttons that *leave* a page carry it by hand) and
  `navStack` stores the kind against the history entry — where a `?tab=` replace, which wipes
  `location.state`, cannot reach it. A missing answer degrades to "up", never to a wrong page.
  Don't compare the two URLs to work out which case you are in; mark the navigation.
  The chevron appears only on `inside` pages and **no longer replaces the hamburger**. The desktop
  has no top bar, so its chevron lives in `PageLayout`'s title row — which is why every loading and
  empty state of an `inside` page goes through `PageLayout` and not a bare `<div className="page">`.
  Don't call `history.back()` blindly, and don't give a page a back button of its own.
- **The mobile top bar is a fixed frame around a centred title** (Q13, 2026-09-16). One row, three
  boxes: two side boxes of the same fixed width (`w-top-bar-side` = 84px, the left cluster: menu 40
  + gap 4 + back 40; the token lives in `tailwind.config.cjs`) with the title between them, so the
  title's centre is the **screen's** centre on every page and in every state — measured
  160 / 195 / 215 at 320 / 390 / 430 px on all 15 top-bar routes, with back and without it.
  The **menu owns the left screen edge** and never moves; **back appears inboard of it**
  (`[≡] [‹] · Title · [bell]`) in space reserved whether or not it is there. Back took the edge
  until this task and pushed the menu *and* the title a different distance on every page — that was
  Roli's complaint. The right box holds **one** 36px control: `NotificationBell`, or the connection
  marker while the socket is in trouble (`ui/shell/TopBarStatus.tsx`) — the marker **replaces** the
  bell, because the labelled chip that used to sit beside it was variable-width text and moved the
  title with it. *When* the app admits to trouble is `ui/shell/useConnectionTrouble.ts` alone
  (T10's 1.2s grace, now mirrored by a 1.2s settle so a wobbling socket cannot blink the slot); the
  bell keeps the slot while its popover is open; the desktop sidebar keeps the labelled chip
  (`ConnectionIndicator`), having room for it. The bar stays `h-14`: `useStickyTop` measures it
  (57px) and every sticky grid header in the app is docked to that number.
- **Swipe right is the only gesture** (Q6). It is not a copy of the chevron, it is the same call,
  so a tap and a swipe cannot land in different places. The forward gesture is **gone** — with it
  went `canGoForward`/`highestHistoryIndex` and every truncation rule in `navStack`, which now only
  answers two things about the past: "what URL was at `idx - 1`" and "how was this entry arrived
  at" (a wrong or missing answer to either degrades back to "navigate up", never to a wrong page). Any horizontally draggable element must carry `data-no-swipe-nav`,
  or a swipe past its scroll edge navigates. The listeners are `passive`, so the iOS system
  edge-swipe is never fought.
- **One rhythm above every tab strip** (T10): `ui/layout/PageLayout.tsx` owns the desktop title
  row (back · `h1` · meta · actions) and renders it **outside** `.page` — a `hidden lg:flex`
  element is still a `space-y-*` sibling, which is what used to push every phone page's first
  block down for nothing. Every tabbed page puts `SectionTabs` first inside `.page` and no page
  renders a header block above it; measured, the first tab sits 16px under the mobile top bar
  and 72px from the top on desktop, on all of dashboard/tournaments/live/done/profile/settings/
  friendlies/clubs/stats/match detail. The live tournament's mode+date pills live next to the
  desktop `h1` and at the top of its Overview tab (`pages/live/TournamentMetaPills.tsx`).
- **The on-screen keyboard hides the bottom tab bar, app-wide** (Q2). iOS does not resize the
  layout viewport for the keyboard — it shrinks the *visual* viewport and re-anchors fixed
  elements to it, so `BottomTabBar` used to land on top of the keyboard, over the composer.
  `ui/shell/keyboardOpen.ts` is the only thing in the app that listens to `visualViewport`, and it
  publishes one answer as `<html data-keyboard-open>`. **The rule is the caret, not the geometry:**
  a text field has the caret (`<input>`/`<textarea>`/`contenteditable`) and the scale is ~1.05 or
  less (a pinch shrinks the visual viewport the same way a keyboard does). **Do not re-introduce a
  covered-strip threshold** — `innerHeight − visualViewport.height ≥ max(120px, 20%)` was the rule
  twice, shipped green twice and did nothing on Roli's iPhone twice (the first version also
  subtracted `visualViewport.offsetTop`, which is how far Safari scrolled the page to reveal the
  field, not coverage). `innerHeight` and `offsetTop` are still read, and *only* reported in the
  Settings → Diagnostics readout. The one geometric question left is a negative one with no
  threshold: `visualViewport.height` is remembered as the caret arrives and if it has not moved
  **at all** 600ms later there is no on-screen keyboard (an iPad with a hardware keyboard, any
  desktop browser) and the bar comes back — any change, in either direction, at any size, means a
  keyboard. The height only counts when it was measured with no caret anywhere, and a blur+focus
  between two fields of the same composer keeps the episode (that hop is exactly what failed on
  the device). `styles.css` does the rest — `.hide-on-keyboard` (the tab bar, the filter pill) and
  `--bottom-nav-clearance: 0`, both only below `lg` or on a coarse pointer, so a desktop browser
  typing in a form keeps its filter pill. One spacing token, never a hand-written `4.5rem`:
  **`nav-clear`**, the room to leave above the bottom edge right now — it collapses with the bar
  for the three composers, the error toast, the pill **and the page's own end padding in
  `AppShell`** (Q14: `nav-h`, Q2's constant for that padding, is gone — holding 72px for a hidden
  bar is the dead space under a composer Roli reported). The page's end is the only one that is
  document height, so its flip goes through `ui/shell/bottomReservation.ts`: at the very end of a
  page the browser clamps the scroll when the document shortens, and that module records what the
  clamp took, pays it back when the room returns, voids it the moment the reader scrolls, and
  hands it to `useScrollRestoration` so N2 never stores a clamp as the reader's own offset.
  Mid-page and on a page shorter than the screen nothing moves at all. The error toast
  deliberately never hides.
  VisualViewport is the only mechanism iOS supports — `interactive-widget=resizes-content` and
  `env(keyboard-inset-height)` are Chromium-only, so don't reach for them.
- **One live indicator** (T10): the pulsing dot in the bottom tab bar (mobile) / sidebar
  "Live now" (desktop). `ui/shell/ConnectionIndicator.tsx` renders **nothing** while the socket
  is up and only says "Reconnecting"/"Offline" after a 1.2s grace period; the tournament page has
  no status chip, and the dashboard's "Live now" section label carries no dot. **And it is green**
  (C13, 2026-09-17): `--color-live` was red-500/red-600 while every in-page "playing" marker used
  the green `status-*` family, so the nav dot was the one place the app said red for "now". The
  token is `34 197 94` (green-500) dark and `21 128 61` (green-700) light — green-600 does not
  clear 3:1 on the tab bar, which paints `--color-bg-default` (`236 235 233`), not white.
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
  `ui/shell/lastLocation.ts`), `&sort=<column key>` + `&dir=asc` (M3: the Table's sort, owned by
  `statsNav.ts`'s `SORT_PARAM`/`DIR_PARAM`, parsed once in `StatsInsights`, with `StatsTable`
  controlled by props — the dashboard preview stays uncontrolled on its own state; descending is the
  default and is deleted from the URL, an unknown column falls back to Pts, and a sorted column that
  is not visible is made visible), and `&record=<key>` (M3/M4: a **one-shot** anchor in the exact
  shape of `?cup=` — the sub-view scrolls to `recordSectionId(key)` and drops the param with a
  `replace`, through `pages/stats/useOneShotSectionParam.ts`, which is the one hook all three of
  Records, Streaks and Cups call; it is listed in `lastLocation.ts`'s `ONE_SHOT_PARAMS`, so a
  destination is never *remembered* with it while `sort` and the filters survive).
  **`player` and `vs` carry one *or two* comma-separated ids**
  (T7): one per side is "this player vs that one, whatever the partners", two on both sides is
  the exact team matchup (`?player=1,4&vs=2,5` → `exact_teams` on `POST /stats/h2h-matches`).
  Outside the matchup only the first id counts, and leaving H2H collapses a team back to it.
  Every shortcut into a matchup is built by `statsMatchupHref()` (`pages/stats/statsNav.ts`) and
  defaults to **Source = Tournaments**. Every stats param is written with `replace` — except
  **opening the matchup, which is a push** (T11): the drill-in swaps the whole body, so it owns a
  history entry — which is what makes it a page you went *into*, with a back chevron of its own
  (Q6). `routeHierarchy` declares its parent as the same URL without `vs`/`rel` (a team collapsed
  to its first player), so the chevron, the swipe, the in-view "Head-to-head" button and the
  browser's own button all pop back onto the H2H list when that is the entry behind, and otherwise
  clear the param in place. Opened from a match page or a profile's rival card, back **returns
  there** (T11, which Q6 had briefly overruled and Q6b restored); only a cold link, a push or a
  nav-bar jump leaves it for the H2H list.
  All older shapes (`?view=table|stars`, `?section=…`, `#trends`, nav `state.statsTab`) are
  mapped once by `pages/stats/statsNav.ts` and rewritten — **never re-introduce `?section=`**.
- **A goal comment cannot rewrite a finished result — it is refused** (found by M2, decided and
  closed by Roli, 2026-09-19). `POST /tournaments/{id}/comments` with `event_type: "goal"` or
  `"score_update"` writes the match's real goals through `_set_match_score`, and neither branch ever
  looked at the match's **state**, so a goal comment filed against a *finished* match silently
  changed a recorded result. Two things made it worse than a stray edit: the envelope it broadcasts
  carries `reason="comment-score"` with **no `global_action`**, so no other device was ever told
  (the `Q9` shape), and it is the one result-writing path that never reaches `after_result_change`,
  so records and their badges did not move either. It was reachable from the UI, not theoretical —
  `pages/live/TournamentCommentsCard.tsx` posts `event_type: "goal"` against `composerScope`, which
  is any match in the tournament, not only the playing one (`score_update` has no UI caller today).
  Both branches now refuse with **409** through `_refuse_score_on_a_finished_match`
  (`routers/comments.py`), naming the way out: *"This match is finished — correct the score on the
  match page, not with a goal comment"*. The match page is where a finished score is corrected,
  because it confirms, it recomputes and it broadcasts `result`; the comment box was made to refuse
  rather than made to work. **A goal in a *playing* match is untouched** — that is the case that
  matters, and it is what the live composer is for.
- **A goal in a *playing* match is not a result** (M2). Only finishing a match, un-finishing it and
  correcting a *finished* score are — that distinction is the guard on `PATCH /matches/{id}` in §6's
  table, and it is why typing goals through a live tournament costs nothing: the guard runs before
  the fold. `MIN_LEN = 2` in `StandingsTable` is a different question again — it gates whether a
  *current run* is shown as a patch, never whether a record is held (M6).
- **A one-shot `?record=`/`?cup=` anchor on the *last* section of a page lands lower than the
  header, and that is the browser, not the hook** (M4, measured). `scrollToSectionById` asks for the
  section's top minus the sticky bar (61px at 390px = 57 + 4, which every other key hits exactly),
  but at the end of a short page the document has less scroll room than the request — at 390×844
  against the dev DB the Records page's `scrollHeight − innerHeight` is 781px, so `biggest_upset`,
  the last section, settles at `top: 384`. The param still drops from the URL. Pre-existing and
  identical for `?cup=` on the last cup; no one-shot anchor in the app pads its page's scroll room.
  Don't "fix" it inside `useOneShotSectionParam`.
- **The profile's identity block is narrower than it looks, and the badge band wraps inside it**
  (M5, measured at 390px against real data, not estimated; the numbers are M8's and M9's, which
  superseded M5's twice in one day — M5's 278 / 144 / 134px and "3 per row" describe a header that
  no longer exists). A band that wraps is clamped to the space left beside the avatar, so both
  numbers below are for a wrapping band: on **someone else's** profile that column is **254px**, on
  **your own** **218px**, and **both fit 6 badges per row**. The 36px difference is the owner's one
  ghost edit button — M8 replaced three of them, which took 144px between them — and both columns
  are 24px narrower than M8 measured, because M9 grew the avatar from 56px to 80px and the row's
  width is fixed. Six is where it stops in either case: seven *uniform* 32px chips would need 260px
  (`38n − 6 ≤ W`; six need 222), but the `1v1`/`2v2` Elo chip is **51px** and one wide chip is
  enough to push the seventh down, at 242px as at 218px. A band that does **not** wrap is sized to
  its content instead, so the avatar's 24px cost it nothing at all (measured unchanged at 182px
  owner / 113.6px visitor). Each extra row moves the tab strip by **~33px** (measured 31 / 66 /
  100px for 1 / 2 / 3 rows) — the accepted price of wrapping, bounded by two things: the band
  renders **nothing** when a player holds nothing (no empty 28px strip, confirmed in the DOM), and
  its query is cached under `["stats"]`, so a return visit paints the band with the first frame and
  nothing moves. At 1280px every case is one row. The header as a whole got **shorter** across the
  two tasks even so: deleting the "Public profile" / "This is your profile" line and un-wrapping the
  owner's band took **66px** off the tab strip's top (M8), and the taller avatar put back only
  4–9.5px of it (M9).
- **The banner's comment badge costs that header nothing, and it was measured four ways** (K3,
  2026-09-19). It is `absolute bottom-2 right-2 z-10` inside the banner's own `relative …
  overflow-hidden` box — a **sibling** of the banner's button, never inside it (a `<button>` in a
  `<button>` is invalid and the outer one swallows the tap) — so it takes no part in the flow: the
  tab strip stays at **451.3px** (390×844) and **779.9px** (1280×900), in `blue` and in `light`,
  with the badge, with it removed from the DOM, and against a pristine database where no tagged
  entry has ever existed. The measurement is not blind — a 20px block inserted as the tab strip's
  sibling moves it to 483.3px (+32 = 20 plus the page column's own 12px flow margin). The badge is
  41.9 × 28px and renders **nothing at zero, whoever is looking**; that rule lives inside
  `SubjectCommentTrigger` and not at the call site, so a future caller cannot lose Roli's
  constraint. The M9 baseline is intact in the same runs (avatar 80×80, 8 chips, 5 + 3 at 390px).
- **The About section head is 32px with its trigger and 16px without, and that is the component,
  not a mistake** (K3, measured at 390px and 1280px in both themes). A bare `.section-head` is its
  label's line; `SubjectCommentTrigger` is the Ideas board's comment toggle verbatim, an `h-8`
  button, so a head carrying one is exactly twice as tall. The app's other head with an action —
  "Recent matches", on the same tab — is 16px because its action is text-only. The plan asked for
  the shared component *and* for the head not to grow; those cannot both be true, and K3 shipped
  the shared look and wrote the number down rather than inventing a second, smaller "comment on
  this". The *hard* constraint is untouched: this head is inside the Overview tab, so the identity
  block and the tab strip did not move. **Whether 32px is what Roli wants there is open** — §11.
- Scroll position is app-managed (N2): `history.scrollRestoration` is `"manual"`, each history
  entry's offset lives in sessionStorage (`navStack`) and in-page view swaps (tabs, stats
  sections) keep their own offsets (`useReturnScroll`) — the H2H matchup rides on its own history
  entry instead (T11). A same-page `replace` deliberately never moves the scroll, so filters and
  `?tab=` deep links stay put.
- **After `sync-local-from-deploy`, restart the backend** (2026-09-19). `init_db()` runs once, in
  the FastAPI lifespan, so a database swapped underneath a running server never gets `create_all`:
  the dev API keeps serving **production's** schema and every table added since is simply missing.
  The symptom is a 500 with `no such table: featurerequestcomment` on `/ideas`, from code that is
  demonstrably correct, and no amount of reloading the page fixes it. Restart the server, not the
  browser.
- **`make dev` used to survive Ctrl+C** (2026-09-19). The recipe ran `set -m`, which turns job
  control on and puts each background job in its **own** process group; Ctrl+C signals only the
  *foreground* group, so neither server ever got it — both were reparented to init and kept holding
  8000 and 8001. That is where "Address already in use" came from, and it is why a vite left running
  for 22 hours served a white screen after a module it had cached was deleted on another branch.
  Without job control the children share make's process group, a terminal's Ctrl+C reaches them, and
  `trap "kill 0" INT TERM HUP` covers a `kill` and a closed terminal too (`kill 0` targets the
  *group* deliberately: killing `make backend-lan` alone leaves the `python run.py` grandchild on
  the port). **`EXIT` must not be added to that trap**: it fires on *any* exit, a `make -n` dry run
  included, and `kill 0` then takes down whatever process group make happens to be running in —
  harmless in a terminal, destructive under a script or a tool (measured: `make -n dev` exited
  **144** with `EXIT` trapped, 0 without it). The recipe itself is not verified end to end —
  reproducing a terminal's Ctrl+C needs a real foreground job on a tty, and a backgrounded harness
  inherits SIGINT ignored — so the next Ctrl+C is the real check.
- **`Optional[Literal[64, …]]` as a query parameter rejects every request** (W1, measured before
  anything was built on it). Pydantic v2 coerces a query string into an `int` but **not** into an
  int `Literal`, so `w: MediaWidth | None = Query(None)` answers **422** to `?w=128` with
  `{"type":"literal_error","input":"128"}` — the media plan specified exactly that shape, and it
  is a bug in the plan, not a preference. The fix is a `BeforeValidator` that turns digits into an
  int and does nothing else, inside the `Annotated` (`MediaWidthParam`, spelled once for all four
  endpoints), so the `Literal` still does every bit of the deciding and an off-ladder width is
  still the framework's 422. **`Query` must sit inside the `Annotated` too**: as a plain default
  (`w: MediaWidthParam = Query(None, …)`) it silently replaces the validator and every request is
  a 422 again — which looks exactly like the first bug and is a second one.
- **`performance.getEntriesByType("resource")` cannot measure media against the vite dev
  server** (W2 lost time to it, and the next visual-verification task would walk into it). Two
  things, both measured here: a media entry reports **`transferSize: 0`**, because the API is a
  different origin and sends no `Timing-Allow-Origin`; and the 250-entry resource-timing buffer is
  **full of ES modules** before an image is ever requested, so Stats → Table reported *zero*
  avatar entries while the screenshot plainly showed six. Measure bytes with Playwright's
  `page.on("response")` and each response's own `content-length` — the wire, not the timing API.
- **vitest loads `.env.local`** (W2), so during `npm run check` `import.meta.env.VITE_API_BASE_URL`
  is this Pi's LAN address and `API_BASE` is `http://192.168.178.78:8001`, not `/api`. A test that
  spells a whole URL therefore fails on this machine and nowhere else: build the expected string
  from `API_BASE` and pin everything after it.
- **The two `sizes` strings are measured, deliberately over-stated, and are what to re-read when
  the page column changes** (W3). The profile banner is `(min-width: 1024px) 1104px, (min-width:
  640px) calc(100vw - 40px), calc(100vw - 32px)` and a comment's picture `(min-width: 1024px)
  1040px, (min-width: 640px) calc(100vw - 104px), calc(100vw - 96px)`; the numbers come from
  `mx-auto w-full max-w-6xl page-x` with `--page-pad-x` 16/20/24 px and the `lg:` sidebar, which
  makes the banner **358 px** at a 390 px viewport and at most **1104 px** on any desktop.
  Measured `<img>` widths: the banner 286 / 356 / 396 at 320 / 390 / 430 (viewport − 34, not
  − 32 — the card has a 1 px border on each side) and 734 / 990 / 1102 at 1024 / 1280 / 1440+; a
  comment image 222 / 292 / 332 and 670 / 926 / 1038. **Over-state, never under-state**: a `sizes`
  that is too small picks a rung that is too small and the picture is blurry, while one that is
  too large costs exactly one rung on a narrow desktop. Both `<img>`s carry a `data-` attribute
  (`data-profile-banner`, `data-comment-image`) so a test — or a byte measurement — can tell the
  *drawn* picture from the lightbox's copy of the same file, which no selector could before.
- Frontend Docker build uses `npm install` (not `ci`) on purpose: the lockfile is generated on the
  arm64/glibc Pi, the image is alpine/musl on x86.
- Tests use a temp SQLite file + `UPLOADS_DIR` in tmp (`backend/tests/conftest.py`); accounts
  `Editor`/`Admin`. Frontend tests: vitest + jsdom, files in `frontend/src/test/`.
- **`make test` dies with `ModuleNotFoundError: No module named 'PIL'` until this machine's venv
  is re-installed** (W1, 2026-09-20): `backend/.venv/bin/python -m pip install -r
  backend/requirements.txt`. It is a venv change, not a tree change (`backend/.venv` is
  gitignored), and it is the **only** manual step the media batch costs anybody — production
  installs from the same file when the image is built. The same command also pulls in
  `cryptography`, which `requirements.txt` has always listed and this venv did not have; push
  still goes nowhere from here, since there is no VAPID key.
- `backend/app.db*`, `backend/data/app.db` are real (synced) data — never commit, never run
  destructive experiments on them; copy first.
- **A throwaway `secrets.json` for a verification stack must name the task's own DB copy.** The
  template these plans hand out carries `"db_url": "sqlite:///./app.db"` and relies on `--db-url`
  and `UPLOADS_DIR` arriving on the command line; a stack started without the flag points at
  `backend/app.db` and writes under `backend/data/uploads`, with no error, because that is a valid
  configuration. Spell the copy in the file
  (`"db_url": "sqlite:////abs/path/backend/data/verify-<task>.db"`) so a forgotten flag cannot
  reach the real data at all.

## 11. Current state (2026-09-20)

- **`f425961` (2026-09-16) is still the only thing that has ever run on the server.** `main` is
  `a0b1392` and carries **four** batches that are merged and undeployed: the 2026-09 design batch
  (frontend-only), the Ideas batch (`feature/2026-09-ideas`, merged as `a547193`), the badges
  batch (`feature/2026-09-badges`, merged as `14e27db`) and the guestbook batch
  (`feature/2026-09-guestbook`, merged 2026-09-19 as `87586f8`; `a0b1392` is the same branch's
  merge of the media batch's plan file and carries no code). In front of all four sits a fifth
  that is **not merged at all** — `feature/2026-09-media`, below. Ideas, badges and guestbook each
  touch the **backend and the schema**, and media touches the **backend and the requirements
  file**, so the next deploy is the **full** one — `git pull && docker compose up -d --build`,
  with the §7 step-2 data backup taken first — and it carries whatever is on `main` at that moment
  (Roli's call: one deploy, not one per batch). No manual step in any of them: every new table is
  created by `init_db()` at startup, the media batch creates none at all, and in each backend
  batch old code was run against a migrated database to prove it still boots.
  **Nothing in any of the five has run on iOS, and no push has ever gone over the wire from this
  machine** (dev has no VAPID and is not HTTPS), so production is the first real test of P2, P5 and
  the record push — **including whether iOS renders a non-ASCII push body**, which nothing here can
  check (§9).
- **`feature/2026-09-media` (W1–W4, `FEATURES_2026-09-media.md`) is complete and unmerged** —
  branched from `a0b1392`, five commits, 26 files, and **no new table, no new column and no
  `_RUNTIME_COLUMNS` entry**: what it adds to production is one wheel in the backend image and one
  cache directory inside the bind mount (§5, §7). Roli, verbatim: *"can you pre-compute smaller
  sizes on server -> then serve whats requested (needed)"* — scoped by him to avatars, header
  images and guestbook snapshots, and then, once the plan was written, to comment images as well
  (*"yeah comment images as well, go"*). Four families; **crests stay out**, his own 2026-09-16
  decision, and this batch did not reopen it. What landed: **W1** Pillow, `media_derivatives.py`
  and `?w=` on the four media GETs, where every failure path serves the original (§6); **W2**
  `api/mediaSizes.ts` and an avatar that asks for its own size from **inside** `AvatarCircle`,
  with not one of the 25 call sites edited; **W3** the two big pictures — the banner and a
  comment's picture through `srcset`/`sizes`, the guestbook citation through one fixed rung — and
  the lightbox split off onto its own URL; **W4** this documentation pass.
  **The saving, measured on the wire** (`page.on("response")` and `content-length`, a cold
  context per row, real dev media, both themes byte-identical): Stats → Table's six avatars
  **2,168,688 → 19,098 B** at 390/dpr 3 and **→ 7,420 B** at 1280/dpr 2; the profile's identity
  block (banner + 80 px avatar) **2,989,081 → 45,962 B**; one guestbook citation of a header
  snapshot **2,662,379 → 4,926 B**; a comments feed with three pictures **5,829,717 → 116,382 B**;
  the whole profile guestbook tab **6,492,268 → 59,694 B**. Nothing visual moved — identity block,
  avatar and tab-strip offsets and both document heights identical at 390 and 1280 in both themes,
  the numbers M8 and M9 spent two tasks on — and the lightbox still opens the true original.
  **The one accepted regression**: on a retina desktop both big pictures cap at the **1536** rung
  against a 1920 px original (55,868 B instead of 2,662,379), because 1536 is the top of the
  ladder. **Roli accepted that knowingly**, the lightbox being where the real file still is.
  Deploy shape: **no manual step**, and nothing pre-warms the cache — it is empty on the first
  boot and fills on demand, the worst first load paying ~275 ms once, ever, for a 1152 rung on
  this Pi (the VPS is faster). `curl -sI 'https://lorbeerkranz.xyz/api/players/1/avatar?w=128' |
  grep -i content-type` → `image/webp` proves the new code is up; `Derived media swept:` on the
  first boot would be a surprise rather than a confirmation, because a cache that has never
  existed has nothing to sweep. Two things nobody has measured yet, said plainly: the **17 MB**
  in `uploads/comments/` is six files and their drawn sizes were measured, but production's feed
  is not this dev corpus; and no rung has ever been served to a real phone.
- **`feature/2026-09-guestbook` (K1–K4, then Q-A/Q-B, G1–G3 and G4/G5) is merged** (`87586f8`,
  2026-09-19) and can be deleted — branched from `14e27db`, thirteen commits, 34 files, **two
  new tables and one new media directory**, part of the same full deploy. Roli asked to be able
  to comment on a profile's header image, About text and avatar, *"make sure the image and
  about texts persist so it is also clear what its about later when they
  change"* — and the answer is that **the guestbook absorbs it**: an entry gains a subject and
  nothing else is built, so the feed, the composer, the read state, the push, the bell kind and the
  realtime event are all the ones that already existed (§9). What landed: **K1** the two tables,
  `services/guestbook_subjects.py`, copy-on-comment with `current` computed server-side, the
  release-with-the-last-entry rule, the boot sweep and the API (§5, §6); **K2** the feed — one
  `.chip` button per tagged entry that opens the *snapshot*, the composer armed with a `ModeBadge`,
  and `pages/profile/guestbookSubjects.ts` as the one vocabulary; **K3** the items — one
  `SubjectCommentTrigger` on the banner, the avatar and the About head, `ImageLightbox`'s `footer`,
  the banner's count badge (Roli overruled the plan's "lightbox only") and the owner's own
  mutations invalidating `qk.playerGuestbook`; **K4** the first documentation pass. Then, from Roli
  living with it: **Q-A** the owner's About block became the visitor's — the same read view and the
  same "No profile text yet.", with one `h-8` **Edit** in the head's action slot beside the
  comments trigger, sharing `SECTION_HEAD_ACTION_CLASS` so the pair cannot drift into two heights,
  Edit inboard so the corner is the same for everyone, shown even on an empty About (where the
  trigger is absent by design), and the editor closing only once `mutateAsync` has resolved;
  **Q-B** an entry stopped *naming* its subject and started **citing** it — the pinned copy as a
  thumbnail in its source's own shape (71×40 banner, 40×40 avatar) or the About text as a quoted
  excerpt (`subjectExcerpt`: whitespace collapsed, cut at a word boundary at 140 chars), the word
  still beside it because a thumbnail cannot say *which* picture and it is what survives a failed
  image, all of it **one** tap target opening the same two viewers K2 built. Re-measured for G5 at
  390px in both themes: the citation is 48px for a picture and 42/58px for a one/two-line quote,
  taking a tagged entry from the untagged 124px to 180px and 174/190px; at 1280px the same
  two-line quote fits on one. **G4** is the fix for the bug G2 found (below) and **G5** is this
  documentation pass, the one K4 and G1–G3 could not give them. Two things a reader should know
  before the deploy: the sweep's log line `Guestbook subjects swept: N` appears **only when a boot
  removed something**, so silence on the first boot is the expected outcome, and
  `curl https://lorbeerkranz.xyz/api/players/1/guestbook | grep -c '"subject"'` > 0 proves the new
  code is up (the key is present and `null` on every untagged entry). Rollback to `14e27db` ignores
  both tables — measured, not assumed (§5) — and costs two things: tagged entries render as plain
  entries, and an entry deleted while rolled back leaves a link and a file that the next boot of the
  new code sweeps. Its `guestbook_subjects/` pinned copies are the third family the media batch
  learned to serve at a thumbnail's size, which is the fix Q-B asked for in writing.
- **G1–G3 answered a measured design audit of that tab, and one of the three changed the canon
  rather than the code** (`facdef5`, `b3a618c`, `57050e4`, then their docs pass `6de35f6`),
  frontend-only, no schema, no backend.
  - **G1 — the guestbook is flat.** It was the profile's only boxed tab: measured at 390px, the
    message text started at x=41 and was 308px wide, against x=16 / 358px on Overview, Stats and
    Matches, which carry **no** `.card` at all. **Roli was shown that the code was *obeying*
    `DESIGN.md` §9b ("a feed and its composer are one card", written when a feed was the whole
    page) and chose flat anyway**, knowing it makes the app's two feeds differ — so §9b now says a
    feed inside a tabbed page is flat and a feed that *is* its page keeps its card (the tournament
    comments card is 6950px tall; its edges are never on screen). After: x=16 / 358px at 390, and
    x=264 / 992px at 1280, identical to the three siblings.
  - **G2 — one height per control.** A message wore five (24 · 26 · 30/36 · 32 · 40); it now wears
    32 for every control on it and 40 for the chat row's send. Replying is `CommentSendRow` with a
    `ChevronUp` cancel (144 → 192px, against 180 → 354px for the form it replaced); editing keeps a
    real field with `Textarea`'s new `resizable={false}` and one Save filling the row; the
    unread-replies marker is a `.chip`; the byline prints `· edited <ts>`; the unread jump is a
    ghost `Button` with one tooltip instead of a classless `<button>` around a `Pill` with two.
  - **G3 — `min-h-[60svh]` is gone**, the app's only forced viewport height on content: it bought
    238px of dead space under a one-message wall, 338px under an empty one and 354px logged out,
    and made an empty wall scroll 216px over nothing. All three are 0 now.
  - **The one thing G2 deliberately did not change is the invisible click target**: tapping an
    unread message marks it read, from a bare `onClick` on the row `<div>`. It stays, because the
    honest answer is that it should not be a control at all — `role="button"` on a div is forbidden
    (§7/§11), a stretched overlay is wrong on a row with six controls and selectable text, and the
    row already has a labelled, focusable **Mark as read** button doing exactly this (the
    tournament feed has *only* that button and no such handler). **Whether the shortcut should
    exist is Roli's call**; the reasoning is written at the call site so the next audit does not
    re-report it as an oversight.
  - **Found while verifying G2, fixed by G4**: `listPlayerGuestbook` fetched the feed **without a
    token**, so `GuestbookEntryOut.can_edit` came back `false` for everybody and the pencil G2 had
    just reworked had never once rendered in the app — not for an author inside the window, not for
    an admin — while the API was right all along. Roli asked for it, and G4 sends the token *and*
    puts it in the key (§10 has the rule and why the second half matters). Verified in a browser at
    390 and 1280 in both themes: Berni sees the pencil on his fresh message and not on his
    backdated one, an admin on all nine, an editor who is neither author nor admin on none, a
    logged-out reader on none — and the whole G2 edit path round-trips, `resize: none`, one Save
    filling the row, the byline gaining `· edited <ts>`, the header toggle discarding the draft.
    `my_vote` was wrong in the same way and is fixed with it. One thing G4 did **not** touch,
    noted here so the next reader does not take it for a bug: the guestbook **POST** response still
    reports `can_edit: false` for the entry it just created (the router's `guestbook_entry_payload`
    call leaves the default), which is invisible because the mutation invalidates and the refetched
    list carries the right answer.
- **`feature/2026-09-badges` (M1–M10, `FEATURES_2026-09-badges.md`) is merged** (`14e27db`) and can
  be deleted — branched from `b8e741a`, twelve commits, 48 files, **two new tables**, part of the
  same full deploy. Ten tasks, because M8–M10 came out of Roli living with the batch on his phone
  on the day it was built. What landed: **M1** `GET /stats/records`, the one computation — sixteen
  records in `services/stats/records.py`, folded out of the services the pages already call and
  writing no ranking query of its own, with the deep-link `path` emitted per record (§6);
  **M2** `RecordHolder` + `RecordKeyState`, `after_result_change` on all nine result-changing paths,
  the `record_moved` push in three audiences × three languages, `result` for generate-over-results
  and a played tournament's date, and the umlaut sweep across the whole notification catalogue (§9);
  **M3** the stats URL learns `?sort=`/`?dir=`/`?record=` and the record icons become one map;
  **M4** the Records page reads `/stats/records` (one request where there were six) and Streaks,
  Records and Cups share one anchor hook; **M5** the badge band on the profile; **M6** the
  standings were evaluated and **nothing was added** — no file changed, the reasoning is in that
  task's Deviations; **M7** the first documentation pass; **M8** a badge stops navigating and opens
  a legend of what the badges mean, and the profile header loses its "Public profile" line and two
  of its three edit buttons (§10); **M9** the profile avatar grows to 80px with a `text-lg` name
  beside it; **M10** this second documentation pass, which corrected what M7 could not know.
  Two later fixes carry no task number of their own: **a lead is not a record** — eight of the
  sixteen are leads and the push says so, in its own words (§6) — and **the comment box can no
  longer rewrite a finished result**, which was M2's open hole and is now a 409 (§10).
  Expect `Record holders seeded: 16` on the first boot, which is the line that
  proves the diff base was written **silently**; `curl https://lorbeerkranz.xyz/api/stats/records |
  jq '.records | length'` → 16 proves the new code is up. Rollback to `f8a02b7` ignores both tables
  (measured, not assumed — §5).
- **`feature/2026-09-ideas` (P1–P6, `FEATURES_2026-09-ideas.md`) is merged** (`a547193`) and can be
  deleted — branched from `880a6fd`, seven commits, 38 files, three new tables, the first batch since
  the audit to touch the backend and the schema. **No manual step** — the three tables come from
  `create_all` with no log line of their own, nothing goes into `_RUNTIME_COLUMNS`, and
  `notification_texts.json` ships in the image;
  `curl https://lorbeerkranz.xyz/api/ideas | grep -c '"comments"'` > 0 proves the new code is up,
  and a rollback to `880a6fd` simply ignores the new tables (measured, not assumed — §5). What
  landed: **P5** a device that receives nothing says so (the shell notice, `usePushNotifications`
  app-wide, the 410 on a dead endpoint, `pushsubscriptionchange` in `sw.js` — §10); **P1** the three
  tables, the comment endpoints, `PUT /ideas/{id}/read`, the one audience helper both channels use,
  and a response model on `/me/notifications`, the last endpoint typed by hand; **P2** push for a
  comment, a vote and a status in all three languages; **P3** the bell's four idea kinds with read
  state that agrees with the push; **P4** the board's flat comment thread, where opening one marks
  it read. Beside them one unnumbered fix: Ctrl+C on `make dev` now stops the servers it started
  (§10).
- **`feature/2026-09-design-fixes` is merged** (`5a97fa9`) and can be deleted (branched from
  `2e23365`; six docs
  commits, then C1–C14 as fifteen implementation commits, then this doc pass). It answers
  `DESIGN_AUDIT_2026-09-17.md`, a blind design-consistency audit — eight parallel reviewers, four
  over `frontend/src` and four over 71 screenshots, working deliberately **without** `AGENTS.md`
  or `DESIGN.md` so the findings were not anchored by decisions already made; a finding counted
  only with counted evidence behind it (raw reports in `design-audit-2026-09-17/`).
  `DESIGN_FIXES_2026-09.md` is the plan, with Roli's decisions recorded at the top under "do not
  relitigate". **Frontend-only, merged, not yet deployed.** What landed:
  **C1** one locale constant per shape (numbers `de-AT`, months `en-GB`); **C2** the player
  palette takes its lightness from the theme (hue stays the player's identity); **C3** light
  hairlines, placeholders and the League select — a light page is now exactly as tall as the same
  page in a dark theme; **C4** the comments feed reads `match.state`, not the goals; **C5** the
  W/D/L badge follows the result in both densities; **C6** measured only — the floating pill's
  promised clearance holds, **no code changed**; **C7** eleven more irreversible actions ask first
  (24 `ConfirmDialog`s, red block iff something stored is deleted); **C8** six defined-and-never-
  reached branches deleted (`Modal.fullScreenOnMobile`, two `wrap` props, `CollapsibleCard`'s
  variants, `SegmentedSwitch.widthClass`, `shadow-card`/`shadow-focus`, `theme-legacy.ts`);
  **C9** a name in a pill opens the profile; **C10** the vocabulary sweep, 21 rows, ≈35 files —
  one word per quantity, `fmtCount`, `fmtAvg` (`fmtPct` gone), `joinNames`/`NAME_JOINER` and
  nothing parsing a joined name back into an array; **C11** `draw` moves off cup gold in both
  themes and the cup gold splits into a text and a mark value; **C12** the duplicate crown goes
  (the picker's selection ring stays, by decision); **C13** "live" is green everywhere;
  **C14** three accent text links become muted text + chevron. `DESIGN.md` and `AGENTS.md` were
  edited by **C15 alone**, at the end, from the canon lines the fourteen workers wrote down.
- `feature/2026-09-audit` was merged (`f425961`) and **deployed**
  on 2026-09-16, carrying Rounds 6, 7 and 8 and everything that came out of Roli testing on his
  phone — 110 commits, 234 files, seven new tables. **§7 step 6 was run on that deploy and is
  done**: the club star history is recovered in production and that step is now history, not a
  pending chore. Every *earlier* batch branch is merged and can be deleted whenever Roli wants;
  `feature/2026-09-design-fixes` is the one open branch.
- **Pushed and not yet deployed** — Q15/Q16/Q17 (`f1ea22b`) plus the Streaks/Club-stars swap
  (`2e23365`), **frontend and docs only** in themselves, which is why they were once queued as a
  short deploy; they have since been overtaken by three backend batches on `main`, so they simply
  ride along in the one **full** deploy the first bullet describes. Q15: the clubs list's row is the edit trigger, no buttons, delete inside
  the editor (which also un-truncated 3 of 16 club names on a phone and dropped 12 wrapped league
  lines). Q16: the club-stars ladder shows all ten rungs, and an unplayed rung prints **no digits**
  — "no matches" plus an em dash — because rows genuinely played for zero points already exist and
  would otherwise be indistinguishable. Q17: `ClubMark` moved into `ui/primitives/` and every
  score-only match row wears one, across all seven surfaces, not just the friendlies list.
  The design-fixes batch above is merged (`5a97fa9`) and is in that same queue; its
  smoke list is in that plan's "Deployment" section.
- Checks at the **media** branch head (code at `7da765f`, re-run on W4's documentation tree, which
  touches no code): `make test` **303 passed** in 15:28, `make lint` clean, `make gen-types`
  **no diff**, `cd frontend && npm run check` **806 tests in 85 files** in 82 s, `npm run build`
  green (`index-*.js` **735.23 kB**, the pre-existing >500 kB hint). That is the guestbook head's
  286 plus W1's 17 on the backend, and its 780/80 plus W2's 15 in 2 files and W3's 11 in 3 on the
  frontend; nothing pre-existing moved in either. W1 read the same 303 in 13:45 and this run
  took 15:28 with `npm run check` sharing the Pi for part of it — the machine's variance, not
  the suite's. **The suite needs `PIL`**, so run §10's one `pip install` line before
  `make test` on this machine or it dies before it starts.
- Checks at the **guestbook** branch head (code at `34a48e2`, G4's tree; G5 is documentation only
  and touches no code): `cd frontend && npm run check` **780 tests in 80 files** in 68 s,
  `npm run build` green (`index-*.js` 734.56 kB — the same pre-existing >500 kB hint). G4 added the
  7 between G1–G3's 773 and this: six in the new `src/test/guestbookIdentity.test.tsx` (which
  drives the real hook against the real `createAppQueryClient` — five of the six fail against the
  old code, checked) and one in `queryKeys.test.ts`. The backend was last run at K4's tree
  (`ad21035`): `make test` **286 passed** in 13:02, `make lint` clean, `make gen-types` **no diff**
  — that is the badges head's 273 plus K1's 13, and **nothing since K4 has touched `backend/` at
  all** (Q-A, Q-B, G1–G3 and G4 are frontend-only). At K4's tree the frontend read **757 tests in
  78 files** (735 plus 11 from K2 and 11 from K3); Q-A and Q-B added the 16 between that and 773.
- Checks at the badges branch head (code at `787fe71`, re-run on M10's documentation tree):
  `make test` **273 passed** in 11:23, `make lint` clean, `make gen-types` **no diff**,
  `cd frontend && npm run check` **735 tests in 74 files** in 72 s, `npm run build` green
  (`index-*.js` 734.05 kB, the pre-existing >500 kB hint). M7 read 272 and 734 at `9c3bc67`; the
  two fixes and M8 that came after it moved each count by one, and the same suite took 14:45 there
  and 11:23 here — the Pi's own variance, not the suite changing. It is minutes either way: `after_result_change` runs a full records fold on every result-changing path, and
  `tests/test_record_holders.py` walks all nine of them. At the Ideas branch head (`dedd6fa`),
  for comparison: `make test` **228 passed**, `npm run check` **717 tests in 71 files**; for the
  merged design batch at its own head: `npm run check` **688 tests in 68 files**, `npm run build`
  green (`index-*.js` 723.99 kB), and a backend untouched (`make test` **204 passed** at
  `f1ea22b`).
  **Push has never been delivered over the wire on this machine** — no `cryptography` in the venv,
  no VAPID — so every push test in the Ideas batch stops at the queued `PushMessage` or at the real
  `_deliver` with the HTTPS POST faked. The wire itself is the phone's to prove.

### Open, and each one is waiting on something specific

- **The About head doubled in height, and whether that is right is still Roli's call** (K3, §10;
  narrowed by Q-A). With an action it is 32.0px; a head with none — and every other section head
  whose action is text-only, "Recent matches" being the one on the same tab — is 16.0px (both
  re-measured for G5 at 390 and 1280 in both themes). **Q-A took one of the three options off the
  table**: Roli asked for the owner's Edit to sit *in that head beside the comments label*, and it
  is deliberately the same `h-8` button, so "give this one head a smaller text-only look" would now
  mean two looks for two buttons standing next to each other. What is left is keep it, or drop the
  About trigger and reach the About text only from a citation on an entry — and note that for the
  **owner** the head is 32px whatever is decided, because Edit is there even on an empty About.
  The banner and the avatar are unaffected, because their triggers live inside the lightbox and the
  banner's own box.
- **The armed composer's caret on iOS is unproven** (K3). Tapping a trigger switches to the
  Guestbook tab and the focus is placed by the composer nonce *after* that switch, outside the tap's
  own call stack, so Safari may show the field focused without raising the keyboard. Headless
  Chromium reports `document.activeElement === textarea` in all four verification runs, and the
  armed chip is visible either way, so the worst case is one extra tap. It is the same family as
  Q2 below and should be re-tested in the same session.
- **Whether iOS renders a non-ASCII push body is unverified, and only Roli's phone can close it.**
  The catalogue now carries its umlauts (§9, M2) and these are the first such bodies the app will
  have sent; nothing on this machine can check it, because push has never gone over the wire from
  here at all (no VAPID, no `cryptography` — every push assertion in every batch stops at the queued
  message). If a real notification shows mojibake, the place to look is the device, not the
  catalogue. The record push also wants his eye on the words themselves: the Styrian lines M2 wrote
  are listed one by one in that task's Deviations. Two of them he has since corrected himself —
  `gräßte` → `greßte` and `Siegsserie` → `Siegesserie` — and the six **lead** lines are newer than
  that reading, so they have not had his eye at all; `Grod hot'n kana.` (and its lead twin `Grod is
  kana vorn.`) is still the one to read aloud.
- **The PWA reinstall path is unverified and only Roli's phone can close it** (P5). On the phone:
  delete the PWA, re-add it, log in — the "This device gets no notifications." notice should be on
  the first screen, **Turn on** should lead to the iOS permission prompt, and Settings →
  Notifications should then say Enabled with **Send test** arriving. Everything else about P5 was
  measured (40/40 browser checks, the server's 410 live and in tests); what cannot be measured here
  is iOS resetting `Notification.permission` to `default` on a reinstall, and push delivery at all.
  If it comes back `granted` with no subscription instead, the device re-subscribes silently and
  the notice correctly never appears.
- **The push and bell copy for the four idea events is Roli's to correct** — three languages × four
  events (`backend/app/notification_texts.json`, `frontend/src/ui/shell/notificationText.ts`): his
  Styrian drafts transcribed as written, the German **spelled with its umlauts** (M2 repaired the
  whole catalogue and there was never a reason for the transliteration — §9; do not put it back),
  the English plain. One divergence to
  read with fresh eyes, because it is deliberate and not drift: the **bell** says "likes your idea"
  (his own word for it, decided on the second pass) while the English **push** still says "wants
  your idea too" (the board's own verb). Either is a one-line string edit with no code behind it.
- **Q2, the keyboard, is unticked and only Roli's phone can close it.** The rule is now the caret
  (§10); it shipped green twice on a threshold that measured geometry and did nothing on the
  device both times. What he should re-test: a tournament's comments, the Ideas composer
  **including the hop from the title into the details textarea** (the case that failed), and a
  profile's guestbook — in the standalone PWA *and* in Safari. If it fails again: Settings →
  Diagnostics → Copy.
- **The iOS 27 blur band over the top of installed PWAs is not ours and Roli is waiting for
  Apple.** `black-translucent` + `viewport-fit=cover` (`index.html`) put page pixels under the
  status bar, and iOS 27 fills that inset with its own glass. Making the bars opaque (Q12) did
  **not** stop it — verified on his phone after a reinstall, in the PWA only, never in Safari. The
  one lever left is `apple-mobile-web-app-status-bar-style: default`, which costs the edge-to-edge
  look and needs a delete-and-re-add because the tag is read at install time. **He has decided
  against it for now.** Do not re-propose it as a fix; the opaque bars stay on their own merits
  (one less compositing layer).
- **Club crests are 200px PNGs averaging 31 KB, 19.5 MB in total, and Q17 made the compact lists
  fetch them** (cold, at 390px: Stats → Player 47 crests ≈ 1.6 MB, profile Matches ≈ 2.4 MB;
  lazy, and cached a month behind `?v=`). Re-encoding them as **palette PNGs** — same format, same
  200px, same filenames — measures **6 KB average, 4.0 MB total** on 40 real crests; WebP is worse
  for this content (lossless 18 KB, lossy-90 9 KB) because flat badges are exactly what a 256-colour
  palette describes. **Do not shrink the dimensions**: 200px is barely enough for a 22px badge at
  dpr 3 and leaves room for a larger crest later. Offered and **declined** (2026-09-16) — raise it
  again only if crest weight becomes a real complaint. **The media batch's mechanism now exists
  and crests were deliberately left outside it** (W1, 2026-09-20): `?w=` could be given to
  `/clubs/{id}/crest` in an afternoon, but the measured answer for flat badge art was a palette
  re-encode and not a resize, and that is the offer Roli declined — so this is a standing
  decision, not an oversight, and folding 591 files into the derived cache would triple its
  footprint to settle a closed question.
- **The design-system half of the audit is deferred to a later batch, by Roli's decision** — the
  eight section-heading treatments, the eight `.inset` paddings and eleven `.card` overrides,
  adopting `Button.iconOnly` across the 43 hand-sized icon buttons, an avatar size scale, the nine
  filter/tab idioms, and the desktop width rework. The list is at the end of
  `DESIGN_FIXES_2026-09.md`; don't start any of it as a drive-by.
- **Three small things the design-fixes batch deliberately left**, each flagged by its own worker
  so the next audit does not re-report them as new: two cup surfaces still read the *text* token
  for a mark job (`TournamentsPage`'s `CupStakePill`, `CupDetail`'s header dot and the `cupColor`
  it shares) — readable, just a shade duller than the six consumers C11 moved; `themes/green.css`
  overrides `--color-cup-gold` but defines no `--color-cup-gold-mark`, so a mark there falls back
  to the dark baseline; and audit 2.8 is **partially** closed — `MatchDetailPage`'s "Back", the
  tournaments list's "Create one." and push settings' "Dismiss" are still accent text, left out as
  recovery paths and an error affordance.
- `npm run build` prints the pre-existing ">500 kB chunk" hint (≈724 kB `index-*.js`). Not a
  regression; nobody has split it.
- `frontend/src/utils/format.ts` keeps three exports with no app caller (`fmtMonthDate`,
  `parseDateSafe`, `wrapTwoLinesWords`) — generic formatters covered by tests, deliberately left (D1).
- `PATCH /tournaments/{id}/second-leg` can still revive a done tournament for any editor — the one
  documented back door left by A10.
- The manual smoke checklist in `REFACTORING_PLAN.md` is a reference list, not a TODO.

## 12. Where knowledge lives

| What | Where |
|---|---|
| Canonical project knowledge (this) | `AGENTS.md` — update it when you learn something |
| Visual language (surfaces, tokens, type, primitives) | `DESIGN.md` — the design canon, follow it for every UI change |
| Tool entry points | `CLAUDE.md` (imports this file), `GEMINI.md` (points here) |
| Human README / setup narrative | `README.md` |
| Batch trackers (history + decisions) | `REFACTORING_PLAN.md`, `FEATURES_2026-07.md`, `FEATURES_2026-08.md`, `FEATURES_2026-09.md`, `DESIGN_FIXES_2026-09.md`, `FEATURES_2026-09-ideas.md`, `FEATURES_2026-09-badges.md`, `FEATURES_2026-09-guestbook.md`, `FEATURES_2026-09-media.md` |
| The blind design audit behind the C-batch | `DESIGN_AUDIT_2026-09-17.md` + `design-audit-2026-09-17/` (eight raw reports) |
| Claude Code auto-memory (per-machine, not in git) | `~/.claude/projects/-home-roli-projects-turnierplaner-reloaded/memory/` |
| Production data snapshots (not in git) | `backup/deploy/<ts>/`, `backup/local/<ts>/` |
