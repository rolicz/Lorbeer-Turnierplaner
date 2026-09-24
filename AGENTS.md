# Lorbeerkranz Tournament Planner — Project Knowledge (canonical)

> **This file is the single source of truth for agents and humans working on this repo.**
> It is tool-agnostic: `CLAUDE.md` and `GEMINI.md` only point here. When you learn something
> non-obvious about the project (deploy quirks, data semantics, decisions), **update this file**
> so the knowledge survives model/tool switches. Keep the "Current state" section dated.
>
> Last full review: **2026-09-23** (L15, branch `feature/2026-09-auth`, code at `7e7d54b`) — the
> auth batch's one documentation pass (`FEATURES_2026-09-auth.md`, L0–L13 + L16; L14 was dropped
> when Roli chose one deploy). **§1, §4, §6 and §7 were rewritten at their core**: the app is no
> longer public. Every route is default-deny behind `app/auth_gate.py`, a login is a row in
> `AuthSession` carried by an `HttpOnly` cookie, passkeys exist, new people register with an invite
> code, there is an admin page, and every in-app URL lives under `/g/altherren/`. **None of that is
> deployed yet**: production runs `ce55a53` (`main` = `cfc1669` + Roli's `deploy other sites`), and
> the branch waits for Roli's go (§7 is written for that one deploy, §11 says what only his phone
> can prove). Until the merge, every sentence below that describes the auth batch describes the
> branch, not the server; the sections this pass did not touch (the media, badges, guestbook and
> composer batches) still describe both.
> Touched since by **Q-G** (2026-09-24, same branch): media responses say `private`, not `public`
> (§5, §11).
> The pass before it was Q-E (2026-09-23, `fix/2026-09-bell-denied`, merged as `17ca1f4` and
> deployed with `ce55a53`): §10's denied-permission bullet. Before that, the last full review was
> 2026-09-20 at `f8ff0a4`. The header block is the first thing to distrust when it disagrees with
> `git log`.

---

## 1. What this is

A private, mobile-first web app for a small friend group's **EA FC (FIFA) nights**. It plans
1v1 / 2v2 round-robin tournaments, records live results, tracks two rotating "cups"
(Lorbeerkranz = 2v2, Bauernkranz = 1v1, since 2026-07-11), keeps history, stats, ratings, odds,
comments/guestbook/pokes, and sends push notifications to installed PWAs. UI language is English,
notification texts are Styrian dialect / German / English (user-selectable). It lives at
`https://lorbeerkranz.xyz` and — since the auth batch (`FEATURES_2026-09-auth.md`, on the branch
until Roli deploys it, §11) — **nothing in it is readable without a login**: no page, no picture,
no stat, no websocket. There is no "reader" any more. A person logs in with their display name and a
password, or with a passkey; a login is a revocable session row carried by an `HttpOnly` cookie;
new people join by redeeming a one-hour invite code an owner or the site admin hands out; and an
admin page shows who is logged in from which device.

**Groups are prepared, not built.** Every player belongs to one friend group, `Altherren` (slug
`altherren`), and every in-app URL carries it (`/g/altherren/dashboard`). The tables, roles and URL
are shaped so a second group is later a filter rather than a migration — "part 2", deliberately not
in this batch. Roles: **site admin** (Roli) › **group owner** (may invite, promote members) ›
**member** (= the old editor; every write the app had) › `none` (logged in, in no group yet).

Owner/maintainer: Roli (site admin, knows the frontend better than the backend).
Players are a fixed small set (six on production: Roli, Flo, Rumpi, Berni, Atzi, Mike).

## 2. Stack & repo layout

| Part | Tech | Entry |
|---|---|---|
| `backend/` | Python 3.11, FastAPI 0.115, SQLModel 0.0.22 (SQLite), argon2-cffi (passwords), webauthn 2.7.1 (passkeys), PyJWT (the one-release JWT exchange only), httpx (web push), Pillow, uvicorn | `backend/run.py` → `app/main.py:create_app()` |
| `frontend/` | React 18, Vite 7, TypeScript 5 (strict), Tailwind 3, TanStack Query 5, react-router 6, framer-motion, lucide-react, flag-icons, `@simplewebauthn/browser` 13.3.0 (passkeys) | `frontend/src/main.tsx` → `src/app/App.tsx` |
| `deploy/` | Caddy 2 reverse proxy + auto-HTTPS | `deploy/Caddyfile` |
| root | `docker-compose.yml` (backend + frontend/nginx + caddy), `Makefile`, `scripts/gen_types.sh`, `scripts/auth_rehearsal.sh` (+`_checks.py`, `_browser.mjs` — the deploy's dress rehearsal, §7), `scripts/passkey_e2e.mjs` | |
| `backup/` | git-ignored local + prod data snapshots (see §8) | |

Size (2026-09-13): backend ≈ 13.3k LOC Python (`app/` + `manage.py` + `run.py`), frontend
≈ 27.2k LOC TS/TSX (excl. `api/generated/` and `src/test/`; tests are another ≈ 4.7k).

### Backend modules
- `app/routers/*.py` — HTTP endpoints (auth, admin, me, tournaments, matches, clubs, players, cup,
  stats, comments, friendlies, ideas, push). Routers should stay thin; bodies live in
  `app/services/`.
- **The auth batch's modules** (L1–L10, §5/§6 carry the rules). `app/auth_gate.py` — `AuthGate`,
  the pure-ASGI middleware in front of **everything**, and the three path tuples; the **only** code
  that reads the session cookie. `app/auth.py` — `ROLE_ORDER` and the `require_*` dependencies,
  reading the claims the gate wrote (no JWT any more). `app/settings.py` —
  `assert_auth_config_safe`, the boot guard. In `app/services/`: `sessions.py` (mint, resolve,
  touch, list, revoke, the cookie, `me_payload`), `groups.py` (`current_group`, `effective_role`,
  `build_claims` — the one claims builder — `roster_for`, `ensure_shared_group`, owner roles, the
  push prefix), `passwords.py` (argon2id, `MIN_PASSWORD_LENGTH = 10`), `accounts.py` (register,
  password, `ensure_name_free`, `session_out`), `invites.py`, `reset_links.py`, `device_label.py`,
  `rate_limit.py` (`RateLimiter` + `LIMITS`), `passkeys.py` (`relying_party_for` — the one place
  rpID and origin are decided — and the two ceremonies), `auth_migration.py`
  (`migrate_from_settings`, the boot migration, and the only reader of `player_accounts[]` besides
  `auth-preflight`), `legacy_jwt.py` (the one JWT reader left, for `/auth/exchange`) and
  `paths.py` (`group_path` — every path the backend emits). `app/routers/admin.py` is the admin
  surface; `app/config.py` and `CORSMiddleware` are gone.
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
- `app/cup_defs.py` — cups live in the `Cup`/`CupEra` tables since L12; `cups.json` is the **seed**, validated every boot (`read_cups_file`) and imported once (`seed_cups_from_file`).
- `app/feature_areas.py` — the Ideas board's area catalog (R5). Areas are stored as plain
  strings, never a foreign key: **a key is never deleted from `AREA_DEFS`, only marked
  `retired=True`**, so a destination the app drops still labels the old ideas that name it.
- `app/scheduling.py` — fixture generation (1v1 all pairs; 2v2 circle-method partnerships).
- `app/tournament_status.py` — **status is derived from match states** (see §5).
- `app/seed.py`, `app/league_nations.py`, `app/validation.py`, `app/tools/sync_club_crests.py`,
  `app/tools/recover_club_star_history.py` (diffs the deploy snapshots, §8).
- `manage.py` — CLI: seed, add-match, vacuum-db, generate-vapid, recover-club-star-history,
  backups/sync, `auth-preflight` and the five escape-hatch commands (`reset-link`, `set-password`,
  `make-admin`, `invite`, `sessions`) (§8).

### Frontend modules
- `src/api/` — `client.ts` (`apiFetch`, `apiUpload`, `mediaUrl`, central 401 → `api:unauthorized`
  event; **no token option anywhere** — the session cookie rides on same-origin requests by itself,
  and a 429 surfaces as `ApiError.retryAfter`), one `*.api.ts` per resource (`auth`, `account`,
  `registration`, `admin` and `passkeys` are the auth batch's; `passkeys.api.ts` is the only
  importer of `@simplewebauthn/browser`), `queryKeys.ts` (`qk` factory — **always use it**),
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
  `ideaMeta.ts`, `useIdeaMutations.ts`), settings (`settings/SecuritySection.tsx` — Devices,
  Passkeys, Password, Groups — and `settings/SettingsSection.tsx`, the card every settings group
  wears), `auth/` (rendered **outside** `AppShell`: `AuthScreen` — the bare logo-and-one-card
  layout — `LoginPage`, `RegisterPage`, `ResetPage`, `NoGroupPage`, `RetryCountdown` (the one 429
  line), `PasswordField` (the one password input with its eye toggle and 10-character hint),
  `InviteCodeField` + `inviteCode.ts` (the one code input and its formatter), `password.ts`,
  `formError.ts`), `admin/` (`AdminPage` with `AccountsTab`, `InvitesTab`, `SessionsSheet` and
  `ShownOnce` — the one "secret shown once" box), `NotFoundPage` (the `*` route).
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
  (`DESIGN.md` §9b). `useProfileGuestbook.ts` holds all of its state and **keys the feed on the
  viewer** (G4; since L4 the key names the viewer's `playerId`, not a token — §6: the rows carry
  per-caller answers, so the viewer is part of the key).
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
  — `navConfig` has eight, and the bar excludes Clubs, Ideas and Admin],
  navConfig, useDestinationLinks + lastLocation [per-destination last-page memory],
  routeHierarchy [the app's one hierarchy] + backNavigation [the one back decision, shared by both
  chevrons and the swipe, plus `NAV_JUMP_STATE`, the mark a nav link puts on its navigation],
  navStack [the entry behind us, how this one was arrived at, and each entry's scroll offset],
  useScrollRestoration + useReturnScroll for scroll memory, useTabParam [`?tab=` for every
  tabbed page], keyboardOpen [the on-screen keyboard's one answer: `<html data-keyboard-open>`,
  Q2], NotificationBell + notificationText [the bell's copy for all seven kinds, in one module],
  PushSetupNotice ["this device gets no notifications", P5], SecureAccountNotice ["secure your
  account — add a passkey", L9], RouteErrorBoundary [the *page*
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
- `src/auth/` — four files. `AuthContext.ts` (the context object, `useAuth`, `ROLE_RANK` and
  `atLeast` — the one role ranking), `AuthProvider.tsx` (boots from `GET /me`, caches the answer as
  `ea_fc_me`, exchanges a legacy `ea_fc_token` once, and **moves to `anonymous` only on a 401** —
  §10's offline rule), `RequireAuth.tsx` (anonymous → `/login`; unknown → the boot screen; a member
  → the shell; a login in no group → `NoGroupPage`) and `RequireRole.tsx` (too low → `/dashboard`).
  "View as lower role" and admin "act as player" stay frontend-only conveniences: authorization is
  the server's, always.
- `src/app/basename.ts` (L10) — the group segment in the URL, decided before the router exists:
  `APP_BASENAME`, `ORIGINAL_ENTRY_PATH`, the legacy redirect, `toRouterPath` / `routerPathOf` /
  `toAbsolutePath`. **The only file in `src/` that spells `/g/`.**
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

# dev servers (repo root). Backend 127.0.0.1:8001, frontend :8000 (LAN variants bind 0.0.0.0).
# The browser talks to vite ONLY: vite proxies /api (prefix stripped) and /ws to the backend.
make backend        # or: make backend-lan   (both run with AUTH_DEV_ORIGIN=1 APP_ENV=development)
make frontend       # or: make frontend-lan  (BACKEND_ORIGIN=http://127.0.0.1:8001 by default)
make dev            # both, LAN

# checks — run before every commit
make test           # backend pytest   (baseline 504 passed, ≈27 min on the Pi, 2026-09-23 at the auth branch head; §11 is the authority)
make lint           # ruff (E/W/F/I; line-length 150)
make gen-types      # regenerate frontend/src/api/generated/schema.d.ts after ANY response-model change
cd frontend && npm run check   # tsc + eslint + vitest (baseline 932 tests in 96 files, ~106 s)
cd frontend && npm run build   # tsc -b + vite build (run for structural changes)
```

- **Node ≥ 20.19 / ≥ 22.12 is required** (Vite 7). `.nvmrc` pins 24; the frontend make targets
  source `scripts/node-env.sh`, which loads nvm when present, so `make dev`/`make frontend` work
  from any shell (login bash on this Pi does not load nvm and would otherwise pick system Node 18).
- **eslint is a dependency of `frontend/`, and only became one on 2026-09-20** (`f8ff0a4`).
  `npm run lint` is `eslint .`, but eslint was in neither `frontend/package.json` nor
  `frontend/node_modules`: it resolved only because **a stray `node_modules/` sits at the repo
  root with no `package.json` beside it**, and Node walks up. So the lint gate passed on this
  machine and would have found nothing in a fresh clone or in CI. The five packages the flat
  config imports are now declared at the versions that were actually running — eslint 9.39.2,
  `@eslint/js` 9.39.2, typescript-eslint 8.51.0, `eslint-plugin-react-hooks` 7.0.1,
  `eslint-plugin-react-refresh` 0.4.26 — proven by hiding the root install and re-running the gate
  against a planted error. **The stray root `node_modules/` still exists and was deliberately not
  deleted**: it is orphaned, not load-bearing, so treat it as clutter to ignore rather than
  something to repair or depend on.
- `make format` = ruff format. Frontend has no prettier; match surrounding style.
- Backend API docs: `http://127.0.0.1:8001/docs`.
- Dev machine is a Raspberry Pi 5 (arm64, LAN IP 192.168.178.78). **Dev is one origin, like
  production** (L0): `frontend/vite.config.ts` proxies `"/api/"` (prefix stripped, Caddy's
  `handle_path`) and `"/ws/"` (not stripped, Caddy's `handle`) to `BACKEND_ORIGIN`, so the phone's
  one URL is the **vite** port (`http://192.168.178.78:8000`) and the backend's port is never typed
  into a browser. CORS is gone (L2), and a cookie set by `:8001` would be invisible to a page on
  `:8000` anyway. **`frontend/.env.local` must therefore be relative** — exactly
  `VITE_API_BASE_URL=/api` and an empty `VITE_WS_BASE_URL=` — and **the main checkout's still holds
  the two absolute `http://192.168.178.78:8001` lines**: switch it the day Roli's dev servers move
  onto the auth code, or the dev app on the phone logs in and immediately forgets it. (The §10
  vitest note flips with it: with a relative `.env.local`, `API_BASE` in tests is `/api` here too.)
- **`make backend` / `make backend-lan` run with `AUTH_DEV_ORIGIN=1 APP_ENV=development`** (L8).
  Two consequences, both intended: the WebAuthn relying party is derived from the request's
  `Origin` (never `Host` — vite keeps `Host` as the browser sent it), and the session cookie's
  `Secure` flag follows the request's scheme, which is what lets the phone on plain
  `http://192.168.178.78:8000` keep a session at all. **Passkeys cannot appear on the phone against
  dev**: that URL is plain HTTP off `localhost`, not a secure context, so the browser hides WebAuthn
  and the app correctly hides "Use a passkey" and the "secure your account" strip. Passkeys are
  exercised here only in Chromium on `http://localhost:<vite port>` (a secure context) with the CDP
  virtual authenticator (`scripts/passkey_e2e.mjs`), and on the phone only against production.
- **A verification stack is backend + vite, on spare ports, against copies outside the repo.**
  The recipe is `FEATURES_2026-09-auth.md` § "Runtime verification"; four rules it learned the hard
  way (§10): delete `pushsubscription` + `pushsubscriptionpreference` rows from the copy before the
  first boot and never put a VAPID key in a throwaway secrets file; give the throwaway vite a
  **private `cacheDir`** (a wrapper config), or it writes its dependency cache through a symlinked
  `node_modules` into the main checkout; name the DB copy inside the throwaway secrets file; and
  restart the backend to empty the in-memory rate-limit buckets when a test run hits one.
  Playwright is **not** in `frontend/node_modules`: the batch borrowed `playwright-core` from
  `/home/roli/projects/racer/node_modules` (`PLAYWRIGHT=…` for the two `.mjs` scripts).
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
| `player_accounts[]` | `{name, password, admin}`. **Migrated on the first boot of the auth code and never used for authentication again** (L1): each entry whose `name` matches a `Player` case-insensitively becomes an `Account` with its password hashed (argon2id, `password_origin="migrated"`), `admin: true` → site admin and owner of `altherren`; an entry that matches no player is logged and skipped, never created. Read by exactly two things, `services/auth_migration.py` and `manage.py auth-preflight`. **It stays in the file until the deploy has been proven on Roli's phone** — it is the old code's login, i.e. the rollback's (§7) — and a later, separate step deletes it (§11). |
| `jwt_secret` / `JWT_SECRET` | Survives **only** for `POST /auth/exchange`, which trades a pre-batch JWT from a phone's `localStorage` for one cookie session (§6). Default `""`; empty → the exchange answers **410**, which is how the transition ends. Deleted later together with `player_accounts[]`, PyJWT and the endpoint. |
| `APP_ENV` (env; `app_env`) | `production` \| `development` \| `test`, default `development`. `docker-compose.yml` sets `production`, which arms the boot guard. |
| `AUTH_ORIGIN`, `AUTH_RP_ID`, `AUTH_RP_NAME` | The pinned WebAuthn relying party and the origin reset links point at. Defaults `https://lorbeerkranz.xyz` / `lorbeerkranz.xyz` / `Lorbeerkranz` — production needs none of them set. |
| `AUTH_DEV_ORIGIN` (env; `auth_dev_origin`) | Default off. On (the `Makefile`'s backend recipes): the relying party is derived from the request's `Origin` (`http` allowed only for `localhost` / `127.0.0.1`), and the cookie's `Secure` follows the request scheme. |
| `TRUSTED_PROXY_HOPS` (env) | How many proxies stand in front: the client IP is the entry that many from the **right** of `X-Forwarded-For` (§6). Default 0; `docker-compose.yml` sets **1** (Caddy). A loopback peer always counts as one hop. |
| `PASSWORD_HASH_PROFILE` (env) | `default` (argon2id RFC 9106 low-memory: t=3, m=64 MiB, p=4 — ≈114–124 ms per hash on the Pi) \| `test` (≈7 ms, the test suite's). |
| `SESSION_TTL_DAYS` (env) | Default 90 — the rolling session lifetime. |
| `ws_require_auth` | **Gone** (L2). A websocket is authenticated by the cookie, always; an unknown key in `secrets.json` is ignored, so an old file still loads. |
| `push_vapid_public_key`, `push_vapid_private_key_file`, `push_vapid_subject`, `push_ttl_seconds` | Web push (VAPID). Private key PEM lives in `backend/data/vapid_private_key.pem` (dev) / `/data/vapid_private_key.pem` (prod). |
| `CUPS_CONFIG_PATH` (env) | Cup definitions JSON; falls back to bundled `backend/app/cups.json`. Prod: `/data/cups.json`. **Since L12 it is the seed, not the runtime source**: validated on every boot (**malformed config = backend refuses to boot**, still), imported into `Cup`/`CupEra` once while that table is empty (`Cups imported: 2`), and after that the database wins — a file that differs from the rows logs a warning ("the file is only a seed now") and changes nothing. |
| `UPLOADS_DIR` (env) | Media root. Docker `/data/uploads`; local fallback `./data/uploads`. Also holds the derived-size cache at `<root>/derived` (W1, §5) — files, not data, safe to delete. |

**The boot guard** (`settings.py::assert_auth_config_safe`, the first thing `create_app` runs, so
a refused boot names the setting in its last log line as `AuthConfigError: …`) refuses: an
`APP_ENV` or `PASSWORD_HASH_PROFILE` outside its list (a typo such as `prod` must not switch the
production guards off); `AUTH_DEV_ORIGIN` on with `APP_ENV=production`; a pinned `AUTH_ORIGIN`
that is not `https://`; and any profile but `default` in production. `TRUSTED_PROXY_HOPS < 1` in
production only **warns** (everyone shares one rate-limit bucket) — a wrong count degrades
accuracy, never safety, and a crash there would be a lock-out. Every setting it can name lives in
`docker-compose.yml` or has a production default in code: **there is no new key `secrets.json`
must carry.** `CORS_ALLOW_ORIGINS` is gone with the middleware (dev is same-origin, §3).

**Frontend** (Vite, build-time only): `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`.
`frontend/.env.production` (committed) = `/api` and empty WS base (derived from `window.location`
→ `wss://host/ws`), and `frontend/.env.local` (dev, untracked) is **the same two relative lines**
(§3). `vite.config.ts` reads `BACKEND_ORIGIN` from the environment (default
`http://127.0.0.1:8001`) for its proxy. Never use `0.0.0.0` in browser URLs.

**Cups** (`Cup` + `CupEra` rows since L12, seeded from `cups.json`): list of `{key, name, since_date?, eras?}`; era =
`{since: YYYY-MM-DD, mode: 1v1|2v2|any}`; the last era with `since <= tournament.date` applies.
Current prod config (mirrored in `backend/app/cups.json` and `backend/data/cups.json`, and what
the first boot of the auth code imports — after that a change is a database write through
`cup_defs.replace_cup_defs`, which no command and no screen wraps yet; editing the file does
nothing but log the drift warning):
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
  `PushSubscription`, `PushSubscriptionPreference`, and the auth batch's ten — `Group`,
  `GroupMembership`, `Account`, `AuthSession`, `Passkey`, `WebAuthnChallenge`, `InviteCode`,
  `PasswordResetToken`, `Cup`, `CupEra` (next bullet).
- **Who may log in, from where, and in which group** (L1, `FEATURES_2026-09-auth.md` "Decided by
  this plan" §1). Ten additive tables and four nullable columns; nothing renamed, nothing dropped.
  - `Group` (`slug` unique, `name`) — one row, `altherren` / `Altherren`. `GroupMembership`
    (`group_id`, `player_id`, `role` `owner` | `member`) is the roster. `Account` (PK `player_id`)
    is a player who can log in: `name_key` (the casefolded display name, **unique** — this is where
    "login names are unique app-wide, case-insensitive" lives, because SQLite's `UNIQUE` on
    `display_name` is case-sensitive and cannot be re-collated without a rebuild), `password_hash`
    (nullable), `password_origin` `none` | `migrated` | `set`, `site_admin`,
    `webauthn_user_handle`. **The display name is the login name**: `PATCH /players/{id}` moves
    `name_key` with a rename in the same transaction, and `ensure_name_free` checks every
    `Account.name_key` *and* every `Player`, so nothing can write a pair the migration would refuse.
  - `AuthSession` — one row per logged-in device (`token_hash` = sha256 of the cookie value, never
    the value; `kind` `password` | `passkey` | `register` | `reset` | `exchange`; `device_label`,
    `ip`, `last_seen_at`, `expires_at`). **Revocation is `DELETE`.** `Passkey` (`credential_id`,
    `public_key`, `sign_count`, `backed_up`, `label`, …) and `WebAuthnChallenge` (single use:
    **consumed by a conditional `DELETE` + commit before verification runs**, so a replay finds
    nothing; five minutes). `InviteCode` and `PasswordResetToken` store only a **sha256**; the
    clear code or token exists once, in the response that created it. `Cup` + `CupEra` (L12) are
    the cups, per group.
  - `_RUNTIME_COLUMNS` gained `group_id INTEGER` on `tournament`, `friendlymatch`, `featurerequest`
    and `clubstarrating`, and a new `_RUNTIME_INDEXES` tuple gives a migrated database the four
    `ix_<table>_group_id` indexes `create_all` would have made. New tournaments, friendlies and
    ideas are stamped `group_id = current_group(s).id` (three call sites, tested); **reads stay
    unfiltered** in part 1 and carry a `# part 2: filter by group` comment. `RecordHolder` /
    `RecordKeyState` have no `group_id` — their key is the primary key; part 2 recreates them.
  - **The boot migration** (`services/auth_migration.py::migrate_from_settings`, run by
    `init_db(settings)` after the runtime columns and **on every boot**, idempotent): the group if
    none exists → a membership for every player with **no `Account` and no membership** (a
    registrant waiting for an invite has an account, so a restart never pulls them in) → one
    `Account` per matching `player_accounts[]` entry, **hashed eagerly** (argon2id; a password
    shorter than 10 is hashed as it is — refusing it would lock its owner out), `admin` → site
    admin and owner → a passwordless `Account` for every other player (so `name_key` is unique
    across everyone from day one; such a player gets in through an admin's reset link) → the
    `group_id` backfill, **NULL rows only**. One log line, only when something was written:
    `Auth migrated: 6 accounts, 1 group, 6 memberships — 0 players without a password, 1 owner,
    backfilled tournament=17, friendlymatch=23, featurerequest=1` (production's snapshot, L13).
    **Two players whose names casefold equal refuse the boot** (`AuthMigrationError`, naming
    them) — on every boot, which is why `POST /players` now answers 409 for a taken name instead of
    returning the existing row. `manage.py auth-preflight` runs the same steps as a dry run first.
  - **`clubstarrating.group_id` NULL means *global* and is never backfilled** (L12 took the table
    out of L1's backfill: filling it would have turned the whole recovered history into
    `altherren`'s rows and undone every promotion on the next restart). Production's 657 rows stay
    NULL, measured on its snapshot.
  - **Rule 3 was measured, not asserted — twice.** L1 on the dev DB and L13 on the 2026-09-20
    production snapshot: `ce55a53` extracted with `git archive` booted the file the new code had
    migrated, logged in all six with the old JWT flow (Berni's non-ASCII password included), read
    everything, wrote a tournament (`group_id NULL`) and a comment, and left the ten tables alone;
    the next boot of the new code logged `backfilled tournament=1` and nothing else, the old code's
    JWT exchanged, the first boot's cookie was still live and the passkey registered before the
    rollback still signed in. What a rollback costs: a session, passkey, invite or password written
    under the new code is inert to the old code (a password **set** on the new code does not carry
    back — the old code logs in from `secrets.json`), and a row the old code writes waits for the
    next new-code boot for its `group_id`.
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
- **Cups are rows** (L12): `Cup` (`group_id`, `key`, `name`, `since_date`, `sort_order`) + `CupEra`,
  read by `cup_defs.load_cup_defs(s)` with its old signature; the synthesized `default` cup is
  added at read time and never stored. Proven on copies of the dev DB and the 2026-09-20 snapshot:
  `/cup/defs` byte-identical, both cups' owners and full reign histories, every tournament's
  `cup_stakes`, all nine `/stats/records` shapes and the `club_stars` of all 234 finished match
  sides unchanged by the import.
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
  - **A group may overlay its own rating on the global one** (L12). `ClubStarRating.group_id` NULL
    is the **global** row (the seeder, the backfill, the recovered history, a promotion); a live
    edit (`POST`/`PATCH /clubs`, the picker's inline editor) writes the **current group's** row.
    `StarRatingResolver.as_of(club_id, on, group_id)`: the latest row with `valid_from ≤ on` across
    the group's rows and the global rows wins; on the same day the group's row wins; nothing on or
    before → the oldest row, group first. The three stats callers go through
    `StarRatingResolver.for_current_group(s)`. `POST /clubs/{id}/stars/promote` (site admin) makes
    today's group value global, **forward-only** — it never rewrites a past row; when today's row is
    the group's own it *becomes* the global row. R4's `UNIQUE(club_id, valid_from)` still holds
    across scopes (widening it needs a table rebuild), so a group edit on a day that already holds a
    global row, and a promotion on a day another group holds the row, are each a **409 "tomorrow"**
    (`StarDayTaken`). `GET /clubs/{id}/star-history` carries `scope` per row and
    `current_is_global`, and the Clubs page's "Make this rating global" control renders from that
    flag rather than re-deriving the rule.
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
  one picture in the app the backend serves `private, max-age=31536000, immutable` — a snapshot never
  changes and its path already carries its id, so the `?v=<captured_at>` its client URL still gets
  from `mediaUrl` is belt and braces rather than the mechanism.
- **Every media response is `Cache-Control: private`, never `public`** (Q-G, 2026-09-24). All six
  media GETs — avatar and header image (`max-age=604800`), the pinned snapshot (`max-age=31536000,
  immutable`), comment and idea images (`604800`) and crests (`2592000`) — sit behind the gate
  (L2), so a *shared* cache (a CDN, a proxy, anything ever put in front of Caddy) must not keep
  them; `private` leaves the browser's own cache exactly as it was (measured, §11). Only the word
  changed, never a `max-age` or the `immutable`, and a `?w=` derivative still carries its source's
  header byte for byte (§6). `tests/test_media_cache_private.py` walks `app.routes` for every GET
  with no `response_model`, so a media route added later is checked without being listed.
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

Prefixes: `/auth/…` (below), `/admin/…` (below), `/me`, `/me/notifications`, `/tournaments…` (list, `/live`, detail,
create, patch, `/date`, `/generate`, `/reorder`, `/second-leg`, `/stats`, `/decider`,
`/reassign` (+`/reassign-preview`), delete, comments), `/matches/{id}` (patch score/state/clubs,
`/swap-sides`),
`/clubs` (+`/leagues`, `/{id}/crest`, `/{id}/star-history` — oldest first, `/{id}/stars/promote`),
`/players…` (profiles, avatars, headers, guestbook (+`subject_kind` on POST),
`/guestbook-subjects/{sid}/image`, pokes, read-maps), `/cup?key=`, `/cup/defs`, `/stats/{overview,players,h2h,h2h-matches,streaks,
player-matches,ratings,ratings/history,odds,records}`, `/friendlies`, `/ideas` (+`/areas`, `/{id}`,
`/{id}/status`, `/{id}/vote`, `/{id}/voters`, `/{id}/image`, `/{id}/comments`, `/comments/{cid}`,
`/{id}/read`), `/push/{config,subscription,subscriptions/me,test}`, `/comments/…`, `/health`.
Error helpers in `app/api_utils.py` (400/403/404/409).

**Nothing answers a stranger: the gate is a default-deny middleware** (L2). `app/auth_gate.py::
AuthGate` wraps the whole app, `http` and `websocket` scopes alike, and decides by path before any
route runs — **three tuples in one file**, an entry ending in `/` a prefix, any other exact, exact
winning (which is how `/auth/login` is public under the `/auth/` account prefix):
- `LOOPBACK_ONLY_PATHS` — `/health`, `/docs`, `/docs/oauth2-redirect`, `/openapi.json`, `/redoc`:
  answered **only to a loopback peer**, 401 to anyone else. Docker's healthcheck calls
  `http://127.0.0.1:8001/health` from inside the container; Caddy's forwarded request comes from
  its bridge address, never loopback. So **`https://lorbeerkranz.xyz/api/health` answers 401 by
  design**, and in dev `:8000/api/health` answers 200 (vite connects from 127.0.0.1).
- `PUBLIC_PATHS` — `/auth/login`, `/auth/exchange`, `/auth/register`, `/auth/reset`,
  `/auth/passkeys/login/options`, `/auth/passkeys/login/verify`: no session needed.
- `ACCOUNT_PATHS` — `/auth/` (prefix), `/me`, `/me/notifications`, `/push/` (prefix): a session,
  **no membership** needed (logout, my sessions, my password, my passkeys, redeem a code, this
  device's push). `/auth/redeem` is deliberately here and not public: an existing account redeems.
- **Everything else**, unknown paths included — a session **and** a membership in the current group,
  else **401 "Not logged in"** / **403 "Not a member of this group"** (the two refusals are spelled
  once, `NOT_LOGGED_IN` / `NOT_A_MEMBER`, so a test can tell the gate's 401 from a route's own).
  A stranger cannot tell a route from a 404. A websocket refusal is `websocket.close(1008)` before
  any accept; the three endpoints in `main.py` keep a one-line claims check as defence in depth.
**The proof is a test that walks `app.routes`**: `tests/test_auth_gate.py::
test_every_route_is_gated_or_listed` calls every route × method anonymously and with a
no-membership session and asserts the answer, and asserts the three tuples name **only paths that
exist**. A route added later is gated by construction and *listed* only by editing a tuple the
test walks. Both sabotages were tried (L2): an unguarded `@app.get("/probe")` → still passes (the
gate covers it); `"/probe"` appended to `PUBLIC_PATHS` → fails (`'/probe' is listed but is not a
route`). The walk covered 118 API route × method pairs + the 4 docs routes at L2, and every later
route (L3's fourteen, L8's six) went through it unchanged.

**Who the caller is.** The gate reads `lk_session` from the `Cookie` header — **nothing else in the
backend parses the cookie** — hashes it, loads the live `AuthSession`, the account, the memberships
and the current group in three queries, and writes `scope["state"]["claims"]` through
`services/groups.py::build_claims`, the **one** claims builder that login, register, reset, the
exchange and passkey sign-in also answer with: `{player_id, player_name, role, site_admin,
session_id, groups: [{id, slug, name, role}]}`. `role` is the **effective** role —
`effective_role`: site admin → `admin`, owner of the current group → `owner`, member → `editor`,
else `none` — and `groups[].role` the raw membership role. `auth.py::ROLE_ORDER = {none: 0,
editor: 1, owner: 2, admin: 3}`; `require_editor` (≥1), `require_owner` (≥2), `require_admin`
(≥3 — **site admin, exactly the old meaning**; no admin route became an owner route in part 1).
`decode_token`, `HTTPBearer` and `CORSMiddleware` are gone. The gate's cost, measured on the Pi:
`GET /tournaments` p50 **35.5 ms** with the cookie against 30.9 ms anonymous before the batch
(≈2.7 ms of resolve).

**Sessions are rows, the cookie is `HttpOnly`** (L2). `lk_session` = 32 random bytes
(`secrets.token_urlsafe`), the row stores its sha256; `Path=/; HttpOnly; SameSite=Lax;
Max-Age=7776000` (90 days) + `Secure` when the auth origin is https (pinned mode — i.e. always in
production) or, in dev-origin mode, when the request's own `Origin` / scheme is. **Lax, not
Strict**: a shared link must not show a logged-in person the login screen; Lax blocks cross-site
writes, which is the CSRF defence, and every GET stays side-effect free. **The touch**: when a
session's `last_seen_at` is more than **5 minutes** old the gate writes `last_seen_at = now`,
`expires_at = now + 90 d` and re-sends the cookie with the same value and a fresh `Max-Age` — so a
session used once a month never ends — and otherwise writes nothing; a websocket scope is read,
never touched. A route that sets `lk_session` itself (login, logout) wins over the touch. Login,
register, reset, the exchange and passkey sign-in all mint through one `create_session` and one
`set_session_cookie`; a login that **presents** a live session revokes that one first (the browser
is about to overwrite it). **No cookie is ever set before an identity is proven**, so there is no
fixation. `POST /auth/logout {push_endpoint?}` deletes the row, disables that device's push
subscription in the same request and clears the cookie. There is **no token rotation** (declined:
every added state is a way to log someone out by mistake).

**Slowing an attacker down** (`services/rate_limit.py`, in-process, sliding window, never a
lockout, never a row written): a refusal is **429** with `Retry-After` and `{"detail":
{"retry_after": n}}`, and the browser counts it down (`RetryCountdown`).

| family | endpoints | per account | per IP | global |
|---|---|---|---|---|
| `login` | `POST /auth/login`, `/auth/exchange`; also wrong *current* passwords on `POST /auth/password` | 10 / 10 min | 30 / 10 min | 150 / 10 min |
| `redeem` | `POST /auth/register`, `/auth/redeem` (one shared bucket) | — | 10 / h | 40 / h |
| `reset` | `POST /auth/reset` | — | 10 / h | 40 / h |
| `passkey` | the public sign-in pair — **every minted challenge counts** | — | 30 / 10 min | 300 / 10 min |

Every 4xx from these endpoints counts, a success clears the account key, a 429 itself does not
count. The IP is `auth_gate.client_ip(scope, hops)`: the `X-Forwarded-For` entry `hops` from the
**right** (the one the outermost trusted proxy wrote — correct whether Caddy appends or replaces),
the socket peer when the chain is shorter, `hops = TRUSTED_PROXY_HOPS`, a loopback peer counting as
one. **Reading the first entry is the bug** — it is client-supplied. A wrong name, a wrong password
and a passwordless account are the same 401 *"Wrong username or password"*, and the unknown name
is verified against a dummy argon2 hash so it costs the same time. The buckets live in memory:
**restarting the backend empties them** (useful on a test stack, §3).

**The login surface** (`routers/auth.py`, thin, over `services/accounts.py`, `invites.py`,
`reset_links.py`, `passkeys.py`). Every way in answers `MeOut` (`{role, player_id, player_name,
site_admin, groups, has_password, has_passkey, password_migrated, session_id}`) and sets the cookie.
- `POST /auth/login {username, password}` — the display name, case-insensitive. A parameter change
  re-hashes on the next login.
- `POST /auth/exchange` — `Authorization: Bearer <pre-batch JWT>` → a `kind="exchange"` session.
  **This is how nobody is logged out by the deploy**: the new frontend finds `ea_fc_token` in
  `localStorage`, exchanges it once and deletes it. The JWT's `role` is ignored — the account
  decides. 401 on a bad token, **410 once `jwt_secret` is empty** (the transition's end).
- `POST /auth/register {code, display_name, password}` — the code is checked **first** (a caller
  without one cannot learn whether a name is taken) and **spent last**, in one transaction with
  `Player` + `Account(password_origin="set")` + `GroupMembership(member)` + the session; the spend
  is a conditional `UPDATE … WHERE redeemed_at IS NULL`, so two racing requests cannot both win, and
  a 409 name or 400 password leaves the code usable. `POST /auth/redeem {code}` joins the code's
  group as a member (409 if already one). **Every bad code is one message**, *"That code is not
  valid"* — unknown, expired and spent are told apart only in the server log. Codes: 8 characters
  from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `O/0/I/1`), shown `ABCD-EFGH`, single use, one hour,
  carry their group, grant membership never ownership, stored as sha256 and **readable only in the
  response that created them**; the defence is the global `redeem` cap (P(hit within a code's hour)
  ≈ 3.6×10⁻¹¹).
- `POST /auth/reset {token, password}` — an admin-issued link, `{origin}/g/altherren/reset#<token>`
  (32 random bytes, one hour, single use, the token in the **fragment**; a `?token=` is accepted too
  because chat clients mangle fragments). The password is validated **before** the token is spent,
  the reset **ends every other session** of that player, and a newer link kills the older unused
  ones. Every bad token is *"That reset link is not valid"*. No email, no recovery codes.
- `POST /auth/password {current_password?, new_password}` (the current one whenever the account has
  a password; does **not** end other sessions) and `DELETE /auth/password` (409 without a passkey).
  Passwords: argon2id with the library's own per-hash random salt — **no salt parameter anywhere,
  no pepper** (the DB and `secrets.json` sit in one directory, so a pepper protects nothing and adds
  a way to fail every password at once); minimum 10 characters, no composition rule, maximum 200.
- `GET /auth/sessions`, `DELETE /auth/sessions/{id}` (the id is looked up **in the caller's own
  list** — 404 otherwise), `POST /auth/sessions/revoke-others`.
- **Passkeys** (L8, `services/passkeys.py` over `webauthn` 2.7.1): `POST
  /auth/passkeys/register/{options,verify}`, `GET /auth/passkeys`, `DELETE /auth/passkeys/{id}`
  (account paths), and the public sign-in pair `POST /auth/passkeys/login/{options,verify}`.
  `relying_party_for(settings, origin=…)` is the **one** place rpID and origin are decided: pinned
  (`lorbeerkranz.xyz` / `https://lorbeerkranz.xyz`, refusing a request whose `Origin` is present and
  different), or, under `AUTH_DEV_ORIGIN`, the request's `Origin` — never `Host` — with `http` only
  on `localhost` / `127.0.0.1`. Registration requires a **resident key and user verification**;
  sign-in sends **no `allowCredentials`** and asks for no identifier (no account enumeration). The
  library checks origin, rpID hash, the UP/UV flags, the signature and the counter — **a counter
  that does not increase is refused whenever either side is above zero**, while an authenticator
  that always reports 0 (iCloud Keychain) signs in every time; the code around it owns the
  challenge (deleted before verification, refused when expired, of the other ceremony or minted
  for another account), the lookup by `rawId`, the user-handle cross-check and the stored
  `sign_count`/`backed_up`/`last_used_at`. **Every sign-in refusal is one 401**, *"That passkey
  could not be used to log in"*, with the reason in the log only. **Always one way in**: removing
  the last passkey of an account with no password is 409, removing the password without a passkey
  is 409. **Removing a passkey ends every session of that member**, the caller's included (the
  response clears the cookie; the UI goes to `/login`). Revocation is by ownership: the id must be
  in the caller's own list, an admin's included. All eighteen negatives were proven to bite with a
  hand-rolled software authenticator (`tests/soft_authenticator.py`).

**The admin surface** (`routers/admin.py`, `require_owner` on the router). **Owner+**: `GET
/admin/accounts` (a site admin sees every player, uninvited registrants included; an owner the
members of their groups; `role` is effective), `POST /admin/invites {note}` → the code, **once**,
`GET /admin/invites` (live ones, never the code), `DELETE /admin/invites/{id}`, `PUT
/admin/groups/{slug}/members/{pid}/role {role: owner|member}` (**the last owner of a group cannot be
demoted by anyone**, the site admin included — 409). **Site admin only** (an owner gets 403): `GET
/admin/accounts/{pid}/sessions`, `DELETE /admin/sessions/{sid}`, `POST
/admin/accounts/{pid}/revoke-sessions`, `POST /admin/reset-links {player_id}` → the URL, once (a
reset takes an account over). In dev-origin mode the link points at the admin's own request
`Origin`; `manage.py reset-link` uses `AUTH_ORIGIN` or `--origin`. There is **no delete-account
endpoint**: a stray registration is removed by SQL for now (part 2).

**Who sees whom** (L3/L11). `GET /players` is `groups.roster_for(claims)` — the members of every
group the caller is in, everyone for the site admin — which is what makes a registered-but-uninvited
account invisible to every picker, stat and roster. `GET /players/avatars` and `/players/headers`
follow the same roster, so a stranger's picture is never *announced* (it would 403 and draw a
broken image). **A profile is readable only by someone who shares a group** with its player:
`services/groups.py::ensure_shared_group` (403 *"Not in your group"*, site admin and your own id
excepted, a missing player falling through to the endpoint's own 404) guards the profile, the
guestbook, the pokes, the avatar and header image, the pinned subject copies, and the read / vote /
voters endpoints of a stranger's wall — sixteen call sites in `routers/players.py`. An author's own
`PATCH`/`DELETE` of their entry is not guarded: someone who left a group can still take back what
they wrote. The browser half is `PlayerLink` (§9). **Not yet filtered**, and part 2's to do the same
way: `/players/profiles`, `/guestbook-summary`, `/pokes-summary` and the read maps (metadata only).

**Every path the backend emits is absolute and group-prefixed** (L10): `services/paths.py::
group_path("/live/3?comment=9")` → `/g/altherren/live/3?comment=9`, and every push `path`, every bell
item's `path` and every record's `path` goes through it (`tests/test_paths.py` greps the package for
a literal that does not). The frontend turns one into a router path with `basename.ts::
toRouterPath` / `routerPathOf` and **never builds one**. A push names its group — `Altherren · …`
in front of the title — **only when the recipient is in several** (`group_prefix_for_push`, applied
per recipient in `NotificationDispatcher._payload_for`); in part 1 nobody is.
**`PUT /push/subscription` takes `replaces_endpoint`** (L10): when the endpoint is the caller's own,
the old row is disabled and its language and mode carry over. `sw.js` uses it: on
`pushsubscriptionchange` it re-subscribes and, **only when it knows the old endpoint**, reports the
new one itself — the cookie now rides on a same-origin service-worker fetch, which the bearer token
never could. Without an old endpoint it deliberately does not (the server would create the row with
the default language and the page would adopt it), and a 401 (a revoked install) is swallowed; the
page's auto-sync covers both on the next launch, as before.

**`?w=` is the size the picture is drawn at, on four media GETs** (W1): `/players/{id}/avatar`,
`/players/{id}/header-image`, `/players/guestbook-subjects/{sid}/image` and
`/comments/{cid}/image`. It is optional, gated exactly like the GET it rides on (the cookie, and
`ensure_shared_group` for a player's pictures), and it sits **beside**
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
`can_delete` / `can_set_status`. Reading and writing both need a member's session (the gate).
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
(`qk.ideasAll()`). Posting needs editor+, like posting an idea.
`PUT /ideas/{id}/read` marks every event on that idea read for the caller, and
the board calls it when the `?idea=` deep link is consumed and when a member opens an
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
because push resolves it from `Account.site_admin` (`admin_player_ids` — no longer `secrets.json`,
since L2) and the bell from the claims'
`role`; that module is not a third definition. `idea_commented`, `idea_voted` and `idea_status`
join `idea_created` in `PERSONAL_DEFAULT_EVENT_TYPES`, so they reach a default "Results & personal"
device and a device set to "Off" still gets nothing, and each carries its own OS tag
(`idea-comment-{id}`, `idea-vote-{id}`, `idea-status-{id}`) — a same-tag notification replaces the
previous one, and "Berni commented" must not be overwritten by "Flo wants it". All four deep-link
to `/ideas?idea=<id>`.
**`/me/notifications` has a response model** (`MyNotificationsOut` / `MyNotificationOut`, P1) — it
was the one endpoint typed by hand on the frontend — and it now builds **seven** kinds:
`comment_reply`, `guestbook`, `poke`, `idea_created` (site admins only, decided from the claims'
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
the pinned copy: read like the avatar (a shared group, L11), immutable for a year (§5). **A subject changes
nothing else about the guestbook** — `push_guestbook_created` fires once per entry with the same
`text_context`, the bell's `guestbook` kind and its `path` are unchanged, so are
`PlayerGuestbookRead`, the edit window and `player:guestbook:update`, and a test
(`test_a_tagged_entry_notifies_exactly_once`) is what keeps that true. Whether the push should *say*
"about your header image" was asked and declined (Roli): a tagged entry still "left a new message".
**`GET /players/{id}/guestbook` answers per caller** (G4). `can_edit`
(`guestbook_can_edit`: the author within `GUESTBOOK_EDIT_WINDOW`, or an admin) and `my_vote` are
computed from the caller's session (G4 fixed a client that sent no token; since L4 the cookie
rides on every request by itself, so that half of the bug can no longer happen). The viewer is
still part of the query key — `qk.playerGuestbookFull(id, viewerId)` — exactly as it is for comments, friendlies and ideas: see
the cache table below. **A per-caller flag is only as good as the request that asked for it** — the
gotcha in §10.

**Records are computed in one place, and the backend says where each one lives** (M1).
`GET /stats/records?mode&scope` is a member's read like every `/stats/*`, with the same `mode`/`scope`
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

WebSocket channels (`app/main.py`, `app/ws.py`, `services/events.py`) — each handshake is
authenticated by the session cookie through the gate, exactly like an HTTP request (a member's
session, else a 1008 close before accept); the `?token=` the old client appended is gone:
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
| `["players","pokes"]`, `["players","guestbook"]` | **page channel** — `/ws/players/{id}` | 5 s | Open only while that profile is on screen. The row did **not** move for K1 or G4: a subject rides inside this list payload, so `resyncPlayer` already carries it, and G4's `qk.playerGuestbookFull(id, viewerId)` lands under this same prefix, so no row was added and `cachePolicy.test.tsx` needed none. The one thing the channel never announces is a change to the *subject itself* — a new upload or a bio save flips `current` — so the owner's own picture and bio mutations invalidate `qk.playerGuestbook` locally (K3) and any other device finds it in this window or on the focus refetch (measured: 6.8 s away and back, 2 refetches, no reload). |
| `["clubs", …]`, `["leagues"]` | **none** | 5 s | Nothing announces an added club or an edited star rating; the window is the only thing that finds it. The catalogue is also the biggest payload in the app (113 KB), which is why six call sites raise it to 60 s where the data is a lookup table rather than the subject. |
| `["friendlies", …]` | **none** | 5 s | Friendlies broadcast nothing — a result typed into another phone in the same session is invisible until this one asks again. |
| `["ideas", …]` | **none** | 5 s | R5 gave the board no channel on purpose, and P1's comments changed nothing: they ride in the same payload under the same key, so the writer's own mutation invalidates `qk.ideasAll()` and everyone else gets them on the next return or focus. `["ideas","areas"]` is a static list (1 h at its call site). |
| `["push", …]` | **none** | 30 s | This device's own subscriptions; nothing but this device changes them. |
| `["auth", …]` (my sessions, my passkeys — L4/L7/L9) | **none** | 5 s | Another device logging in, or being revoked from the admin page, announces nothing; the list is right only when it is re-asked. |
| `["admin", …]` (accounts, a player's sessions, live invite codes — L6) | **none** | 5 s | A login, a logout or a redeemed code on any device is found only by refetching — nothing broadcasts them. |

**Call-site overrides that stand** (a `useQuery` option still beats the table, so each one is a
claim the table cannot make): `useLiveTournament` polls `["tournaments","live"]` at `staleTime: 0`
with `refetchOnMount: "always"` + a 60 s interval — "is something live right now" is the one
thing that must never be wrong; `StandingsTable`'s `stats.streaks` at 0 while a tournament is not
done, because the tournament channel pushes the tournament but never invalidates stats, so the
streak chips would lag the goals; `MatchDetailPage`'s `fetchQuery(…, staleTime: 0)` inside the
save mutation, a deliberate read-before-write; `tournamentReassignPreview` at 0, because the
dialog names what it is about to destroy; the odds query at 2 s, recomputed from the form; and the
club catalogue at 60 s in the pickers. Anything else that sets `staleTime` is fighting the table.

**A new identity starts with an empty cache** (L4). `setSession` — login, register, reset, the
exchange, passkey sign-in — calls `queryClient.clear()` before the shell mounts, because
`["tournaments"]` carries per-caller `can_edit` flags under a key that names no viewer; clearing on
the way *out* would race the still-mounted shell. A password change or a redeem is **not** a new
identity and calls `refresh()` instead, which keeps the cache and the admin's "view as".

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
- **This repo's Caddy fronts Roli's other apps too** (`ce55a53`, "deploy other sites", 2026-09-23):
  `deploy/Caddyfile` starts with `import /etc/caddy/sites/*.caddy`, and `docker-compose.yml` mounts
  `${CADDY_SITES_DIR:-./deploy/sites}` at `/etc/caddy/sites`. Two consequences for every deploy
  and every rollback: **any recreate of the `caddy` container blips every site on the box**, and
  **a checkout of anything older than `ce55a53` strips that import and takes the other sites
  down** — so a rollback target is never older than `ce55a53`. `caddy` also `depends_on` the
  backend being **healthy**, and the healthcheck is `/health` over loopback (the one path the gate
  answers there, §6).
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
  cd ~/projects/Lorbeer-Turnierplaner && git pull && docker compose up -d --build backend frontend
  docker compose logs -f backend      # expect "Cup defs validated", "DB initialized"
  ```
  Naming `backend frontend` keeps `caddy` out of the target set, so a deploy that does not change
  Caddy's config cannot recreate it (a plain `up -d --build` leaves it alone too when its image
  and config are unchanged — naming the services makes that a fact rather than an expectation).
  Only the frontend changed → `docker compose up -d --build frontend` (Vite env is baked in).
- **The media batch added the project's first image dependency, and it shipped on 2026-09-20**
  (W1): `Pillow==12.3.0` in `backend/requirements.txt`, which made that deploy a **full** one (the
  backend image is rebuilt with a new wheel in it) even though it changed no schema. The rule
  below still applies to **every future rebuild**. **The one
  thing to watch in the build log is `pip install`**: expect a
  `pillow-12.3.0-cp311-cp311-manylinux…_x86_64.whl` **download** — 6.93 MB, a file that was
  looked up on PyPI rather than assumed — never a compile. If it starts building from source,
  stop and report: it means the wheel did not match and the image would need build tooling,
  which `backend/Dockerfile` deliberately does not have. The wheel costs ≈ 24 MB unpacked
  (`PIL/` 8.3 MB + `pillow.libs/` 16 MB) and nothing else about the image changes. The
  frontend's alpine/musl lockfile problem (§10) does not carry over: the backend image is
  Debian/glibc x86-64 and this dev Pi is arm64 glibc, and a wheel exists for both.
- **The auth deploy — one deploy, on Roli's go** (`FEATURES_2026-09-auth.md`, L0–L13 + L16; Roli:
  *"one deploy, why would i want 2?"*). It is the full deploy — backend, schema (ten tables, four
  columns), three new backend dependencies and one frontend one — and the one deploy that can lock
  Roli out of his own app, which is why it has a rehearsal before it and an escape hatch after it.
  **`secrets.json` is not edited by it**: `player_accounts[]` and `jwt_secret` stay, because they
  are the old code's login and therefore the rollback's.
  **Before, on the dev machine:**
  1. Gates green on the branch head (§11 has the numbers), `make gen-types` no diff, the branch
     merged to `main` and pushed.
  2. `python3 backend/manage.py backup-deploy-data` → `backup/deploy/<ts>/` — the way back for data.
  3. **Rehearse against that fresh snapshot** and require **`ALL PASSED`** on the last line:
     `scripts/auth_rehearsal.sh backup/deploy/<ts> ~/.local/share/turnierplaner-rehearsal/secrets.rehearsal.json`
     (the second argument is Roli's own copy of the secrets' *shape* — the six real names, the admin
     flag, throwaway passwords, a throwaway `jwt_secret` — never the real file). It works in a
     `mktemp -d`, never writes to `backup/` (it checks the snapshot's sha256 before and after),
     deletes the copy's push subscriptions before anything boots and never sets a VAPID key, and
     walks: the old code's baseline, the preflight, the first boot (log lines, all six logins,
     identical answers, the exchange, a passkey in Chromium, old deep links), a rollback to
     `ce55a53` on the same file, a roll forward, a third boot, the five escape-hatch commands, one
     boot with `docker-compose.yml`'s production environment, and the timing. On 2026-09-20's
     snapshot it gave **131 PASS, 0 FAIL**, twice. Ports 8244 / 8245 / 8264; the browser step needs
     Playwright (`PLAYWRIGHT=…`, default the racer checkout's `playwright-core`) or `--no-browser`.
     Anything but `ALL PASSED` → stop; nothing on the server has changed yet.
  **On the server, in this order:**
  4. `ssh hetzner && cd ~/projects/Lorbeer-Turnierplaner && git pull` — **do not `up` yet**.
  5. `docker compose build backend frontend` — the old containers keep serving meanwhile, so a
     failure here costs nothing. **Watch `pip install` for wheels, never a compile**: expect
     `argon2_cffi_bindings-26.1.0-cp310-abi3-manylinux_2_26_x86_64.manylinux_2_28_x86_64.whl` and
     `cbor2-6.1.4-cp311-cp311-manylinux_2_28_x86_64.whl` (the two binary ones, both fetched for
     that exact platform with `pip download --only-binary=:all:` by L1/L8) beside the pure
     `argon2_cffi-25.1.0`, `webauthn-2.7.1`, `pyOpenSSL-25.1.0` and `pyasn1` `py3-none-any`
     wheels; `cryptography` stays at 45.x inside the `<46` pin. A `Building wheel for …` line means
     the image would need build tooling it deliberately lacks — stop and report. The frontend
     build pulls `@simplewebauthn/browser` 13.3.0 (pure JS).
  6. **The preflight, against the live database, read-only**:
     `docker compose run --rm --no-deps backend python manage.py auth-preflight --secrets /app/secrets.json --db-url sqlite:////data/app.db`.
     **Success is `RESULT: OK` with no `PROBLEM:` line** — an unmatched name or a case collision
     prints as `PROBLEM: …` and the result as `FAIL`; the report has no literal
     `unmatched_names: []` line to look for. It must also read `group to create: altherren`,
     `accounts with a password: 6 (Roli, Flo, Rumpi, Berni, Atzi, Mike)`, `accounts without a
     password: 0`, `owners (site admins): 1 (Roli)`, and a `group_id backfill:` line whose counts
     match the rehearsal's (17 / 23 / 1 on the 2026-09-20 snapshot). A non-zero exit → stop.
  7. `docker compose up -d --build backend frontend`, then `docker compose logs -f backend`. **The
     first boot logs exactly these four lines, in this order:** `Cup defs validated` ·
     `Auth migrated: 6 accounts, 1 group, 6 memberships — 0 players without a password, 1 owner,
     backfilled tournament=N, friendlymatch=M, featurerequest=K` · `Cups imported: 2` ·
     `DB initialized`. **No `Record holders seeded` line** is expected (production already holds
     its records) and no `swept` line. A boot that stops with `AuthConfigError: …` names the
     setting; the ones it can name are `APP_ENV`, `TRUSTED_PROXY_HOPS`, `AUTH_ORIGIN`,
     `AUTH_DEV_ORIGIN`, `PASSWORD_HASH_PROFILE` — all in `docker-compose.yml` or defaulted in
     code, none in `secrets.json`.
  8. `docker compose ps` → backend **healthy**. If it flaps to unhealthy, `/health` is being
     refused over loopback (`auth_gate.is_loopback`) — roll back (step 12).
  9. **Smoke, from the dev machine — GETs, never HEAD** (the API answers 405 to HEAD, §10):
     `curl -s -o /dev/null -w '%{http_code}\n' https://lorbeerkranz.xyz/api/tournaments` → **401**
     (the gate is up; the body is `{"detail":"Not logged in"}`);
     `…/api/health` → **401 as well, by design** (loopback only — the healthy container in step 8
     is the health check now);
     `curl -s -X POST https://lorbeerkranz.xyz/api/auth/passkeys/login/options` → 200 with a
     `challenge`, `"rpId":"lorbeerkranz.xyz"` and **no `allowCredentials`**;
     `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://lorbeerkranz.xyz/api/auth/login -H 'Content-Type: application/json' -d '{"username":"x","password":"y"}'`
     → 401; `curl -s -o /dev/null -w '%{http_code}\n' https://lorbeerkranz.xyz/` → 200 (nginx's
     shell). Every check that reads data now needs a session, so the old anonymous smoke lines
     (`/stats/records | jq`, `/ideas`, `?w=137` → 422) answer 401 — run them from a logged-in
     browser, or with a cookie jar (`curl -c jar -X POST …/api/auth/login …` with your own
     password typed at a prompt, then `-b jar`).
  10. **The phone** (the part nothing here can prove — §11): open the installed PWA. It still holds
      the old JWT, so it **exchanges it and lands on the dashboard with no login screen** — that is
      the "nobody is logged out" check. Settings → Account → Devices lists this phone. Settings →
      Account → Passkeys → **Add a passkey** → Face ID → the row appears (with "synced" if iCloud
      Keychain reports it backed up) and the "secure your account" strip is gone. Log out → **Use a
      passkey** → Face ID → in, nothing typed. Settings → Notifications → **Send test** → it arrives
      → tap it → **does it open the installed app or Safari?** — write the answer into §11. On a
      laptop, log in with the old password → `/g/altherren/admin` → Roli has two devices → revoke
      the laptop → its next click lands on the login screen. Create an invite code and **revoke**
      it rather than registering a throwaway (there is no delete-account command or endpoint; a
      stray registration is removed only by SQL).
  11. A link tapped in WhatsApp opens **Safari**, not the PWA, and Safari has its own cookie jar: the
      first such tap shows the login screen once. Expected; `README.md` says so.
  **If login is broken — the escape hatch, in the order to try it:**
  12. **Roll back to `ce55a53`, never `cfc1669`**: `git checkout ce55a53 && docker compose up -d
      --build backend frontend`. It restores the JWT login at once — old code ignores every new
      table and column (measured in L1 and L13) and `secrets.json` still holds its accounts. It
      leaves the server on a **detached HEAD**: `git checkout main` before any later `git pull`.
      `cfc1669` is the last commit of the app itself, but production runs `ce55a53` (= `cfc1669` +
      the multi-site Caddy commit), and checking out `cfc1669` would strip the `import` and take
      Roli's other sites down. What a rollback costs: a phone that already opened the new app has
      had its JWT deleted by the exchange, so it meets the **old** login screen once and logs in
      with its `secrets.json` password (measured for all six); a password **set or reset on the new
      code does not carry back**; sessions, passkeys and codes written on the new code are inert.
      Roll forward later with the same `git checkout main && git pull && docker compose up -d
      --build backend frontend` — the next boot backfills whatever the old code wrote.
  13. The new code stays up but *one* login is wrong: the five `manage.py` commands, inside the
      running container. The four that only print take `-T`: `docker compose exec -T backend python
      manage.py reset-link --player Roli` (a one-hour link — open it on the phone and set a
      password), `… make-admin --player Roli` (`--revoke` to undo), `… invite --group altherren
      --note …` (a code), `… sessions --player Roli` (`--revoke-all` to end them). `set-password
      --player Roli` prompts twice with no echo when run **without** `-T`; with `-T` it reads the two
      entries as two stdin lines (for a script — never type a password into shell history). Each
      resolves the player by login name, case-insensitively, prints one line and exits 0, or says
      why on stderr and exits 1.
  14. The data is wrong: rsync `backup/deploy/<ts>/data/` back (§8) and restart the backend.
  15. **After the deploy has been proven on Roli's phone** — not before — a later, separate step
      deletes `player_accounts[]` from `secrets.json`, then `jwt_secret`, PyJWT,
      `/auth/exchange` and `services/legacy_jwt.py` (§11's first open item).
- **Deploy checklist** (every deploy; the auth deploy's own steps are above):
  1. Local: `make test && make lint && cd frontend && npm run check && npm run build` green,
     `make gen-types` yields no diff, work merged to `main` and pushed.
  2. Take a prod data backup first: `python3 backend/manage.py backup-deploy-data` (rsync over SSH
     into `backup/deploy/<ts>/`). Cheap insurance; SQLite + uploads are small.
  3. Cups: **once the auth code has booted, `/data/cups.json` is only the seed** (L12) — the rows
     it was imported into are what the app reads, and editing the file changes nothing but a drift
     warning in the log. It is still validated on every boot, so a typo still makes the backend
     exit at startup (`docker compose logs backend`). Hand-editing it matters only before the
     first boot of the auth code.
  4. After a schema/backfill change: confirm the one-time log line (e.g.
     `League nations backfilled: 39`) and that the app loads.
  5. After changes that need new media (e.g. club crests): run the tool inside the container,
     e.g. `docker compose exec backend python -m app.tools.sync_club_crests` (done on prod
     already; 591/597 crests present as of the 2026-08-20 snapshot).
  6. **DONE — do not run this again.** This was the one-time club star history load (R4), and it
     was carried out on the 2026-09-16 deploy; production's `ClubStarRating` is recovered (§11).
     **`--apply` writes to production data, so re-running it now would be a destructive action
     against a job already finished.** The procedure is kept below only as the record of what was
     done and as the shape for any future one-time recovery. Roli asked for
     this to be written down rather than remembered (2026-09-15). `ClubStarRating` is created
     empty and `init_db()` seeds one row per club dated **that day**, so until the recovery ran,
     production believed every club had always had the rating it has now — which is the bug R4
     existed to fix. The reconstruction reads the deploy snapshots, and those live on
     the dev machine, not on the server, so they had to travel:
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
     **It was run without `--apply` first and the report read**, which is the rule for any
     command of this shape. On the 2026-09-15 dev data it found
     626 opening ratings and 31 changes across 31 clubs, and moved 3 of 218 finished match sides;
     prod numbers were close. If they had not been, the rule was to stop — step 2's backup is the
     way back.
     `snapshot.json`'s `"kind"` is what selects a snapshot, never the directory name, which is why
     that file has to be copied alongside each `app.db`.
  7. Smoke: `curl -I https://lorbeerkranz.xyz` (the site root is nginx and does answer HEAD),
     `docker compose ps` → backend healthy, open the PWA on a phone, check cup owners on the
     dashboard and one live/done tournament. **Every `/api` check must be a GET** — the API
     answers **405 to HEAD**, so `curl -I` on an endpoint proves nothing (§10). **Since the auth
     batch every `/api` read answers 401 without a session**, `/api/health` included (loopback
     only), so an anonymous `curl …/api/tournaments` → **401** is the proof that the gate is up,
     and anything that reads data is checked from a logged-in browser or with a cookie jar
     (step 9 of the auth deploy above). With a session, the checks that prove the deployed code is
     the current code: `/api/stats/records | jq '.records | length'` → 16, `/api/ideas` carries
     `"comments"`, `/api/players/1/avatar?w=137` → 422 (the media ladder), and every `path` in
     `/api/me/notifications` or `/api/stats/records` starts `/g/altherren/`.
- **Rollback:** `git checkout <previous-sha> && docker compose up -d --build backend frontend`,
  then `git checkout main` before the next pull (detached HEAD). **Never a sha older than
  `ce55a53`** (the Caddy import above); for the auth deploy the target is exactly `ce55a53`
  (step 12). Schema changes are additive, so old code boots on the new DB. If data must be restored, rsync the desired
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

**The auth commands** (L1/L3). Every one takes `--secrets` / `--db-url` before or after the
subcommand; the five escape hatches configure the engine **without** `init_db` (no seeding, no
migration, no sweeps against a live server's database).
```bash
python3 backend/manage.py auth-preflight [--secrets …] [--db-url …]   # dry-run the boot migration, DB opened mode=ro
backend/.venv/bin/python backend/manage.py reset-link   --player <name> [--origin …]   # one-hour, single-use link
backend/.venv/bin/python backend/manage.py set-password --player <name>                # prompts twice, no echo
backend/.venv/bin/python backend/manage.py make-admin   --player <name> [--revoke]
backend/.venv/bin/python backend/manage.py invite       --group altherren [--note …]    # one-hour, single-use code
backend/.venv/bin/python backend/manage.py sessions     --player <name> [--revoke-all]
```
`auth-preflight` prints what the first boot would do — group, memberships, accounts with and
without a password (named), owners, unmatched names, case collisions, the `group_id` backfill
counts — ends with `RESULT: OK` or `RESULT: FAIL`, prints each problem as a `PROBLEM:` line and
exits 1 on one; the database file's sha256 is unchanged afterwards. A **WARNING** (not a failure)
says so when nobody would end up with a password. On production the escape hatches run inside the
container (§7, step 13). **`scripts/auth_rehearsal.sh <deploy-snapshot> <secrets-shape.json>`** is the
deploy's dress rehearsal (§7, step 3): it reads a snapshot selected by `snapshot.json`'s `"kind":
"deploy"` and never writes under `backup/`.
**Syncing production into dev after the auth deploy** copies a database that is already migrated,
with production's argon2 hashes, sessions and passkeys — the dev backend then logs in with
production's passwords, not with the dev `secrets.json`'s, and a passkey minted for
`lorbeerkranz.xyz` is useless against `localhost`. Before the deploy, the first dev boot of the
auth code migrates whatever `player_accounts[]` the dev `secrets.json` holds.

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
  are written down), `FEATURES_2026-09-media.md` (W1–W4), and `FEATURES_2026-09-auth.md` (L0–L16:
  the app behind a login, sessions, passkeys, invites, the admin page and the ground for groups,
  on `feature/2026-09-auth`, see §11 — its "Roli's answers, 2026-09-23" section at the top
  supersedes anything below it that disagrees, L14 was dropped, and L16 was added mid-batch).
  A new batch gets a
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
  `<a>`**; `document.querySelectorAll("a a").length` must stay 0 (measured across 30 routes × 2
  viewports × 2 themes at Q-F).
  - **An author's byline is an identity, and all four feeds now agree** (Q-F, 2026-09-23). The
    Ideas board linked its idea and comment authors from the start; `pages/profile/
    GuestbookEntryCard.tsx` and `pages/live/TournamentCommentParts.tsx` (the tournament comments
    feed *and* the match page's, one component) did not, and `pages/stats/CupDetail.tsx` linked a
    reign's holder while spelling the same two people as plain text one line lower ("took it from
    Berni", "ended by Flo"). All of them are `PlayerLink` now. The avatar beside a linked name is
    `decorative`, so one name reaches the accessibility tree and not two, and its wrapper carries
    **`inline-flex`**: an `<a>` around an inline-level `AvatarCircle` otherwise opens a line box
    and charges the row the font's descender space, and both feeds are measured to the pixel.
    Verified unchanged at 390 and 1280 in both themes — a guestbook entry is **124px**, a comment
    card **128 / 148px**, a cup reign row **60 / 77px**, before and after.
  - **An unattributed author is not a name.** A "General" comment has no profile to open, so it
    stays a quiet `<div>` — which is also what keeps the bylines that *are* names reading as names.
  - **Where a tap already means something more specific, it wins and nothing was linked** (Roli's
    own question on Q-F): a match row opens that match, a duo/rivalry row and a profile's rival
    card open the matchup, a bell row opens the thing that happened, a picker avatar *selects*
    (`AvatarButton`, `SelectClubsPanel`, `PlayerPicker`, the friendly form's slots, the new
    tournament form) and the Settings "View as" list switches who you are acting as. None of those
    became links. Names inside a `ScoreLine` are the large case: `leftNames`/`rightNames` are
    plain `ReactNode` and every caller throws the player id away, so linking them is a shared-
    primitive change across ~8 files whose rows all already have an action — deliberately not done.
    The What-if tab is the one identity block left unlinked on purpose: its projected table sits
    beside a `PlayerPicker` where an avatar already means "focus this player", and its scenario is
    unsaved component state that a stray tap would throw away.
  - **The guestbook row has two meanings, and `PlayerLink` is what keeps them apart.** Tapping an
    unread message marks it read (a pointer shortcut over the labelled `Mail` button; Roli kept it
    on 2026-09-23 when it was raised as an invisible target). `PlayerLink` stops click and Enter
    from reaching that handler, so tapping the **name or avatar opens the profile and leaves the
    message unread** — you navigated, you did not read it — while every other pixel of the row
    still marks it read. Neither half is visible on screen, so both are asserted in
    `src/test/authorIdentityLinks.test.tsx`.
  - **Who may open a profile is decided inside `PlayerLink`, and nowhere else in the browser**
    (L11). `PlayerLink` asks `hooks/useProfileAccess.ts` — `{canOpen, foreign}` — which answers from
    the roster the client already holds (`qk.players()`, i.e. the server's `roster_for`): in it → a
    door; not in it → **plain text titled *Not in your group***, with a 12px muted `Users` mark after
    the name (never on the decorative avatar beside it). **The site admin is the refinement**: the
    roster gives him everyone, so for him alone the hook reads `qk.admin.accounts()` and marks a
    player whose role in the current group is `none` — still a door, because a site admin may open
    anything. Your own name is always a door; a roster that has not arrived yet is answered
    optimistically (a name must not flash to text and back on every cold load). **The server
    refuses independently** (`ensure_shared_group`, §6), into the profile page's own empty state,
    *"This profile is in another group."*, inside `PageLayout` so the back chevron survives. The
    part-2 answer is a `shares_group` flag on the roster — a response-model change — and is written
    at the top of the hook.
  - **The three surfaces that reached a profile without a link are closed** (L11). The standings
    row (the last `div role="button"` in the app — `[role="button"]` on a live tournament went 4 → 0),
    the stats Player identity card and the Players admin row all go through `PlayerLink` now: the
    first and last as `PlayerLink stretched` (the row's whole-area overlay, rendered into
    `ListRow`'s new `overlay` slot with the shared `LIST_ROW_OVERLAY_CLASS`), the card as a plain
    `PlayerLink` around its children. All three have a real `href` — middle-click, open in a new
    tab, `Tab` + `Enter` — and every row height was measured identical before and after. On the
    standings the crown and the streak patches keep `pointer-events-auto` for their tooltips, so a
    tap exactly on a 24px badge no longer opens the profile; the rest of the row does.
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
  services; error helpers from `api_utils.py`. No new dependencies unless the plan says so. The
  auth batch named four, each with its reason: **`argon2-cffi==25.1.0`** (argon2id; no hashing of
  that kind in the standard library), **`webauthn==2.7.1`** + **`pyOpenSSL==25.1.0`** (pinned there
  — not 2.8/3.0 — because later versions require `cryptography>=46` against this repo's
  `cryptography>=44,<46` pin, which predates the batch and was deliberately not lifted; `cbor2`
  and `pyasn1` come with it), and **`@simplewebauthn/browser` 13.3.0**, exact, the one new frontend
  dependency (the value is its accumulated browser quirks; imported by `api/passkeys.api.ts`
  only). PyJWT stays until the exchange goes. Before that the backend's first exception was
  **`Pillow==12.3.0`** (W1, 2026-09-20),
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
  11.07. Owners *immediately* after that date were Lorbeerkranz → Berni, Bauernkranz → Roli.
  **Don't use that pair as a smoke check any more** — ownership is a fold over every qualifying
  tournament since (§5), so it moves whenever one is played. Live on production on 2026-09-20:
  Lorbeerkranz → **Berni**, Bauernkranz → **Rumpi**. Read the current answer from
  `curl -s 'https://lorbeerkranz.xyz/api/cup?key=default'` and `…?key=bauernkranz` rather than
  from this file.
- **Nothing is a public read any more** (the auth batch, §6). Every page, picture, stat and
  websocket needs a member's session; `/clubs`, its pickers and every write need at least a member
  (= editor). Sentences elsewhere in this file or in older plans that say "public read" describe
  the app before the batch.
- **A per-caller flag is only as good as the request that asked for it** (G4, 2026-09-19 — found
  while verifying G2, which had reworked a control that had never once rendered in the app; the
  token half is history since L4 — the cookie rides on every request by itself — and the key half
  is not). A read that carries `can_edit` / `can_delete` / `my_vote` answers for **whoever asked**,
  so a client that omitted the token got the anonymous answer and the A10 rule — "render the flags,
  never re-derive the rule" — silently renders nothing at all. `listPlayerGuestbook` did exactly
  that: `can_edit` was `false` for the author inside the window *and* for an admin, and `my_vote`
  was 0 for everybody, with the API demonstrably correct under `curl -H "Authorization: Bearer …"`.
  **Two halves, and the second is the one that gets forgotten:** send the token, *and* put it in
  the query key, or the logged-out payload already in the cache (fresh for 5 s, kept for 30 min) is
  handed to the account that just logged in — the same bug one step later, and it was reproduced in
  a browser before it was closed. The app has one mechanism for this and it is a **full key beside
  a prefix key**: `qk.playerGuestbookFull(id, viewerId)` under `qk.playerGuestbook(id)`, the shape
  `commentsTournamentFull`, `friendliesList` and `ideas` already use, so every existing
  invalidation keeps working and the cache-policy row does not move. The flag is computed from the
  **account**, while "view as lower role" is frontend-only, so the effective role still gates the
  control (`canPostGuestbook && !!can_edit`, the app's `isEditorOrAdmin && !!row.can_edit` shape).
  When adding a per-caller field to a read, put the viewer in the key (`viewerId ?? "anon"`, L4);
  and a new identity clears the whole cache on the way in (`setSession`, §6), which is the other
  half of the same promise.
- **Ideas sits below Clubs in the sidebar and the drawer and has no bottom-bar tab** (R5, Roli's
  call): five items are what fits a phone row. **Admin sits below Ideas** (L6, `ShieldCheck`,
  `min: "owner"`) and is excluded from the bar for the same reason — `navConfig` has eight
  destinations and the bar still five. A member who types `/admin` lands on `/dashboard`
  (`RequireRole` sends a too-low role home — it used to send it to `/login`, whose "already
  logged in" bounce sent it straight back: a blank page).
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
  `pushsubscriptionchange`, and **since L10 it PUTs the new endpoint itself** when it knows the old
  one (`replaces_endpoint`, §6 — the session cookie rides on a same-origin worker fetch, which the
  old bearer token in `localStorage` never could); without an old endpoint, or on a 401, the server
  still learns it on the next launch through the auto-sync — which is why `usePushNotifications` is
  mounted app-wide (`AppShell` →
  `ui/shell/PushSetupNotice.tsx`) and no longer only in Settings. **A device that receives nothing
  now says so, unprompted**: one `warn` line under the top bar on whatever page the reader is on,
  shown only while nobody has decided on this install (`permission === "default"`) and no
  subscription exists — once per install, dismissible. `denied` **used to be** "a decision, and it
  is respected", i.e. silence for ever; **Roli overruled that on 2026-09-23** and it is now its own
  state, shown in the bell (next bullet);
  `granted` with no subscription is the browser having dropped it and is re-subscribed **silently**
  (no prompt is possible or needed) unless the person turned push off here on purpose. The
  dismissal lives in `localStorage` on purpose: a reinstall wipes it along with the subscription,
  which is exactly the case that must ask again. **The iOS half is confirmed** (Roli, 2026-09-23):
  on his phone the notice appeared after a reinstall, exactly as designed — so iOS does reset
  `Notification.permission` to `default` there, the notice is not theoretical, and the whole P5
  path is closed. Push itself now works over the wire on iOS, **umlauts included** (§11).
- **A denied permission is said in the bell, and nowhere else** (Q-E, 2026-09-23). Roli, after
  confirming push on his phone: *"if someone denies notifications, indicate that still in the bell
  on top right."* `pushSetupState` gained a fifth answer, `"blocked"`, and it is the one state the
  app **cannot act on** — once a permission is denied `Notification.requestPermission()` resolves
  `denied` without showing anything, so nothing may offer a button that would silently do nothing.
  All the app can do is say so and name where to go, which is why `pushSetup.ts` also owns the two
  sentences (`PUSH_BLOCKED_TITLE` / `PUSH_BLOCKED_HINT`) that the bell's popover and the Settings
  panel both read.
  - **It is a glyph swap inside the existing button, not a second control.** `Bell` becomes
    `BellOff` in `warn` inside the same 36px box, because the mobile top bar's right box holds one
    control and its fixed width is what keeps the title centred on the screen (Q13). Measured on
    all nine top-bar routes at 320 / 390 / 430px, with back and without: the title centre is
    **160.0 / 195.0 / 215.0** with the mark and **160.0 / 195.0 / 215.0** without it — identical to
    the tenth of a pixel, and the bell box is 36×36 in both states.
  - **It cannot be read as the unread count**, which is an accent pill in the opposite corner of
    the same button: `BellOff` + "3" is the ordinary state and says exactly the right two things,
    because the bell's items come from the server and keep arriving whether or not this device may
    be pushed to.
  - **`warn`, not `error`** (`DESIGN.md` §2): nothing failed and nothing is about to be destroyed —
    the reader chose this. The Settings panel's "Blocked" line moved from `text-error` to `text-warn`
    in the same change, so one state has one colour, and that panel gained the same two sentences
    plus one thing the bell has no equivalent of: **"Enable on this device" is disabled while the
    permission is denied**, because pressing it could only fail. It re-enables by itself — permission
    is re-read on focus and on `visibilitychange`, so coming back from iOS Settings is enough.
  - **A box that carries a tone is not an `.inset`** — `[data-theme="light"] .inset` repaints the
    background at a higher specificity than `bg-warn/10`, so the tone showed in `blue` and vanished
    in `light`. Found here, written down in `DESIGN.md` §3.
  - **Not dismissible, and deliberately not a banner.** `PushSetupNotice` nags once per install
    about the device that can still be fixed from inside the app; this one cannot be, so a
    dismissal that came back would be nagging and one that never came back would hide a permanent
    fact. A mark on a control that is already there costs no space and interrupts nothing.
  - P5's other rules survive untouched: `granted` with no subscription is still re-subscribed
    silently, and a device that turned push off in Settings on purpose (`PUSH_USER_DISABLED_KEY`)
    is told nothing at all — even when the browser permission is denied as well.
  - The mark is invisible while the connection marker owns the top bar's slot (`TopBarStatus`,
    Q13). One control at a time; a socket that is down is the more urgent of the two, and the mark
    comes back with the bell. The desktop sidebar renders the same component and needs no
    second treatment.
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
  typing in a form keeps its filter pill. Spacing tokens, never a hand-written `4.5rem`:
  **`nav-clear`**, the room to leave above the bottom edge right now — it collapses with the bar
  for the error toast, the pill **and the page's own end padding in
  `AppShell`** (Q14: `nav-h`, Q2's constant for that padding, is gone — holding 72px for a hidden
  bar is the dead space under a composer Roli reported) — and **`pin-clear`** beside it for the
  three composers, which is the next bullet and is not the same number. The page's end is the only one that is
  document height, so its flip goes through `ui/shell/bottomReservation.ts`: at the very end of a
  page the browser clamps the scroll when the document shortens, and that module records what the
  clamp took, pays it back when the room returns, voids it the moment the reader scrolls, and
  hands it to `useScrollRestoration` so N2 never stores a clamp as the reader's own offset.
  Mid-page and on a page shorter than the screen nothing moves at all. The error toast
  deliberately never hides.
  VisualViewport is the only mechanism iOS supports — `interactive-widget=resizes-content` and
  `env(keyboard-inset-height)` are Chromium-only, so don't reach for them.
- **iOS re-anchors `fixed` to the keyboard and leaves `sticky` behind, so there are two bottom
  tokens** (Q-D, 2026-09-20; `DESIGN.md` §9b and §7 carry the same rule). Q2 hides the tab bar and
  collapses `--bottom-nav-clearance` to 0, and for a **`fixed`** box — the error toast, the filter
  pill — that is exactly right, because iOS has already lifted it onto the shrunken **visual**
  viewport. A **`sticky`** box is pinned to the **layout** viewport, which does **not** shrink, so
  the very same collapse pushed all three pinned composers the last 72px *into* the keys. Roli
  photographed it: at 390×844 with a 336px keyboard (top edge y=508) the guestbook row sat at
  **787–844**, showing only its focus ring under iOS's own accessory bar. One token was answering
  two opposite questions. Now: **`nav-clear` for a `fixed` box, `pin-clear` for a `sticky` one** —
  identical while the bar is there; while the keyboard is up `pin-clear` is **the strip the
  keyboard actually covers**, `innerHeight − (visualViewport.height + visualViewport.offsetTop)`,
  measured in `keyboardOpen.ts` (still the only module in the app that touches `visualViewport`)
  and published as `--keyboard-inset-bottom`, which `styles.css` maps onto the token inside the
  media query that already gates Q2. The three rows now sit at 451–508, 365–508 and 47–508.
  **This is a position, not a detection, and the ban above stands**: the covered strip is measured
  only *after* the caret has already said a keyboard is up, and is never compared with a floor or
  a ratio — the two rules do not conflict, and `offsetTop` is in the *sum* for precisely the
  reason it must never be in a *decision* (it is how far iOS scrolled the layout viewport to
  reveal the field, so the visible window occupies `[offsetTop, offsetTop + height]`). Where it
  reads 0, every row sits exactly where it did. **Reply and edit rows are in flow, not pinned**,
  so none of this reaches them and it must not: the platform scrolls a focused field into view,
  and a sticky row is the one thing scrolling cannot rescue. Settings → Diagnostics shows a
  `covered` row and `lift <n>` beside the verdict, in the copied report too — **behind the
  keyboard with `lift 0` is the measurement failing; with the right lift it is the CSS.** Two
  known limits, both deliberate: at ≥1024px with a coarse pointer `lg:bottom-0` still wins, and a
  *short* Ideas board cannot lift its open 461px form all the way. **Unverified on iOS** —
  `visualViewport` was replaced at the source in a real browser, which proves the wiring and
  nothing about the device.
- **A sticky composer can only be as reachable as its containing block** (Q-C, 2026-09-20).
  `position: sticky` lifts a box no higher than the top of its **own** containing block, so a
  composer written as the feed's last child is pinned only while the *feed's* top is far enough up
  the screen — it needs roughly `composer height + pin-clear` of room above the fold. The
  tournament feed starts at y=130 and never noticed; a profile's guestbook starts under a ~490px
  header, and the lift was clamped: 375×667 put **11px of the row behind the bottom tab bar** on a
  profile with a header image and was fine on one without, 31px of header apart — the whole of
  Roli's "not always though". The row is now a **sibling** of the feed, sticking to
  `#profile-section-main`. When a pinned row misbehaves, look at what box it is allowed to float
  inside before you touch its own classes.
- **`curl -I` does not work against this API — every `/api` route answers 405 to HEAD**
  (measured 2026-09-20 on production: `/api/health`, `/api/stats/records`, `/api/clubs/{id}/crest`
  and `/api/players/{id}/avatar` all 405). The FastAPI routes declare `GET` and nothing
  auto-implements `HEAD`. Only `curl -I https://lorbeerkranz.xyz` works, because that is nginx
  serving `index.html`. **Smoke commands in a plan or in §7/§11 must therefore be GETs** — use
  `curl -s -o /dev/null -w '%{http_code} %{size_download} %{content_type}\n' <url>`, or
  `curl -s -D - -o /dev/null <url>` when the headers are the point. W4 shipped a `curl -sI …?w=128`
  smoke line that could never have passed; it is corrected in §11, and it is the reason to run a
  documented check once before writing it down.
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
  is whatever that file says — the Pi's absolute `http://192.168.178.78:8001` in the main checkout
  until it is switched to the relative lines (§3), `/api` afterwards and in the worktree. A test
  that spells a whole URL therefore passes or fails depending on the machine: build the expected
  string from `API_BASE` and pin everything after it.
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
  `Editor`, `Editor2`, `Admin`, migrated at boot under the **`test` argon2 profile** (≈7 ms a hash;
  the `default` profile cost ~0.4 s per test at L1). Frontend tests: vitest + jsdom, files in
  `frontend/src/test/`.
- **An explicit `Cookie` header beats the `TestClient` jar, and the fixtures depend on it**
  (measured with httpx 0.27 / Starlette 0.41). `editor_headers` / `editor2_headers` /
  `admin_headers` are `{"Cookie": "lk_session=…"}`, so every call that passes `headers=` is who it
  says; the shared `client` fixture is **logged in as Editor** (its jar holds the cookie), so a call
  with no headers is a member's — the old anonymous "public read" became an editor call. "Nobody"
  is the `anon` fixture (an empty jar); "logged in, in no group" is `nogroup_headers`. `login()`
  sends an **empty** `Cookie` header and reads the token from `Set-Cookie`: a login that presents
  a live session revokes it (§6), and reading the jar after a login meets two same-named cookies
  (`CookieConflict`).
- **The gate's audit walks every route; a new route needs no test to be gated, only one to be
  listed** (`tests/test_auth_gate.py`). If it fails with `unclassifiable route object`, FastAPI
  mounted a plain `Route` the walk does not know — name it in a tuple (that is how `/redoc` got
  there).
- **`make test` dies with `ModuleNotFoundError: No module named 'PIL'` until this machine's venv
  is re-installed** (W1, 2026-09-20): `backend/.venv/bin/python -m pip install -r
  backend/requirements.txt`. It is a venv change, not a tree change (`backend/.venv` is
  gitignored), and it is the **only** manual step the media batch costs anybody — production
  installs from the same file when the image is built. The same command also pulls in
  `cryptography`, which `requirements.txt` has always listed and this venv did not have; push
  still goes nowhere from here, since there is no VAPID key. **The auth batch's `argon2-cffi`,
  `webauthn`, `pyOpenSSL` and `cbor2` are already in this machine's venv** — the batch's worktree
  symlinked `backend/.venv` and installed them through it — so the main checkout needs no second
  install when it moves onto the auth code.
- `backend/app.db*`, `backend/data/app.db` are real (synced) data — never commit, never run
  destructive experiments on them; copy first.
- **A throwaway `secrets.json` for a verification stack must name the task's own DB copy.** The
  template these plans hand out carries `"db_url": "sqlite:///./app.db"` and relies on `--db-url`
  and `UPLOADS_DIR` arriving on the command line; a stack started without the flag points at
  `backend/app.db` and writes under `backend/data/uploads`, with no error, because that is a valid
  configuration. Spell the copy in the file — and since the auth batch keep both **outside the
  repo** (`mktemp -d`; `"db_url": "sqlite:////tmp/…/verify.db"`) — so a forgotten flag cannot
  reach the real data at all.
- **A copy of real data carries real push subscriptions, and a VAPID key makes them live**
  (L10, 2026-09-23). A verification stack was given a throwaway VAPID key so the worker's PUT could
  be exercised, and the dispatcher then **pushed to the real subscriptions in the copied dev DB** —
  two to `web.push.apple.com`, two to Mozilla — on the next guestbook entry. All four were refused
  (401/403: not the key those devices subscribed with), so nothing reached a phone. The rule for
  every stack built from a DB copy or a deploy snapshot: `DELETE FROM pushsubscription; DELETE FROM
  pushsubscriptionpreference;` on the copy **before the first boot**, and **never** a VAPID key in a
  throwaway secrets file. The rehearsal script does both (production's snapshot held eight).
- **The push dispatcher must never hold a database transaction across a network await** (L16,
  2026-09-23). `NotificationDispatcher._deliver` used to keep one `Session` open across a fan-out;
  from the second device on, its reads autoflushed the previous row's `UPDATE`, which took SQLite's
  write lock (no WAL here), and the lock then rode across every remaining HTTPS call to the push
  service until one commit at the end. Any other writer waited out pysqlite's 5 s busy timeout and
  failed — and since L2 **every login writes an `AuthSession` row**, so a login during a finished
  match's fan-out answered **500 "database is locked"** (seen on a stack). Now `_deliver` is three
  phases: `_plan_deliveries` reads everything in one short session and closes it, `_deliver_one`
  sends with **no session open**, and `_record_delivery_result` writes each result to a fresh read of
  the row in its own short transaction. One deliberate behaviour change: a failure *writing down* a
  result is logged and the fan-out continues. A row deleted mid-fan-out stays deleted (it used to
  raise `StaleDataError` and lose the whole fan-out's bookkeeping).
  `tests/test_push_dispatcher_lock.py` fails against the old code with the exact `database is
  locked` on `INSERT INTO authsession`. **Do not "fix" this with WAL**: `backup-deploy-data` rsyncs
  `app.db` alone, and a WAL file left behind is a backup that is missing its last writes.
- **A throwaway vite writes its dependency cache wherever `node_modules` really is** (L11). Started
  in a worktree whose `frontend/node_modules` is a symlink to the main checkout's, `npx vite`
  re-optimised **the main checkout's `node_modules/.vite/deps`** — the directory Roli's running dev
  server serves from. Give a throwaway stack a wrapper config with its own `cacheDir` in a scratch
  directory. And **`npm install` in a worktree replaces a symlinked `node_modules` with a real
  directory** (L9: 242 MB, a full reinstall from the lockfile) — the worktree then stands on its own,
  which is fine, but it is not what the symlink promised.
- **The login screen appears only when the server says the session is over** (L4, the offline
  rule). `AuthProvider` is `unknown | authed | anonymous`, and **only a 401 moves it to
  `anonymous`**: a 403 is the gate's "not a member" and never ends a session, a 5xx, an abort or a
  network error keep whatever is on screen. A relaunch paints the shell from `ea_fc_me` at once and
  refreshes it with `GET /me`; with nothing cached and no answer the app shows a boot screen with the
  connection marker's own "Offline" / "Cannot reach the server — retrying" line and **asks again**
  on `online`, on `visibilitychange` and every 15 s. So a PWA on flaky wifi shows cached pages under
  the Reconnecting marker, never a login screen. Measured with the backend killed: cached pages
  still draw, the only traffic is a 500 from vite's proxy (not 502 — vite answers 500 on
  `ECONNREFUSED`), no 401; restarted, the marker clears by itself. "Your session has ended — log in
  again." is a line **on the login screen** (the toast viewport lives in the shell, which is gone by
  then), set only when a 401 ends a session that was authed, decided by the *first* 401 — later ones
  from the sidebar's prefetches must not erase it.
- **The exchange runs once per install, and only then** (L4). A pre-batch install has `ea_fc_token`
  in `localStorage`; the provider starts `unknown` whenever it is present (so the shell cannot fire
  requests on a cookie the exchange is about to replace), posts it to `/auth/exchange`, and deletes
  it with `ea_fc_role` / `ea_fc_player_id` / `ea_fc_player_name` on 200, 401, 403 or 410 — a network
  error keeps it for the next boot. Under StrictMode the exchange and the boot's `/me` are
  module-level in-flight singletons, because a second POST would present the cookie the first one
  just set and be revoked by it. `logout()` needs the server: a request that never arrived changes
  nothing locally ("Could not reach the server — you are still logged in."), because clearing a
  device whose cookie is alive would be a lie the next boot corrects.
- **The iOS home-screen app has its own cookie jar, separate from Safari's.** A session made in the
  installed PWA is not Safari's and the other way round, so a link opened from WhatsApp (Safari)
  meets the login screen once even when the PWA is logged in, and a passkey sign-in has to happen
  in the context that should hold the session. Nothing here can test it: it is the phone's (§11).
- **The group segment is react-router's `basename`, decided before the router exists** (L10).
  `src/app/basename.ts` is the first import in `main.tsx`: a path that starts `/g/<slug>/` sets the
  basename; anything else — `/`, a pre-batch bookmark, an old push like `/live/3?comment=9` — is
  `history.replaceState`d under `/g/altherren` before the router is created, search and hash kept.
  So `useLocation().pathname` is **basename-relative** and not one of the ≈737 literal route
  strings changed: `routeHierarchy`, `navConfig`, `lastLocation`, `navStack`, `useTabParam`, every
  `<Link to="/…">` are untouched, and `grep -rn '"/g/' frontend/src | grep -v test/` finds
  `basename.ts` alone. `/` goes to `/g/altherren/` (the group's root, not `…/dashboard`), because
  the router's own `/` → `/dashboard` redirect is what lets `useLocationRestore` resume a cold
  launch — measured on a production build; **in the vite dev server the resume does not stick**
  (StrictMode runs the redirect twice), with or without this batch. `site.webmanifest` keeps
  `start_url`/`scope`/`id` at `/`: changing `id` would make iOS treat the install as a new app.
  `AppCrashBoundary` and `diagnostics/blankNotice.ts` still spell un-prefixed paths — full page
  loads the redirect fixes; `toAbsolutePath` is their one-line fix when part 2 needs it.
- **A reset link's token stays in one place: the browser's own navigation entry** (L5). The reset
  page reads the fragment (or a `?token=`) once and strips it with the router's `replaceState` in a
  layout effect, before the first paint and long before the only request; a reload then finds no
  token, by design. But `performance.getEntriesByType("navigation")[0].name` is the document URL
  **with its fragment**, so the token is still readable there — it is not a request (a fragment
  never goes over the network, and none of the 240 requests per test run carried it in a URL or a
  `Referer`), which is the only sense in which "no request carries the token" is true. A `?token=`
  link *is* sent with the page load; the server only ever mints `#` links.
- **`device_label` calls headless Chromium "Linux · Safari"** (L7). `HeadlessChrome/…` is not
  matched as Chrome, so the `Safari/` token wins. Cosmetic — a real desktop Chrome reads `Chrome`
  and the installed iOS PWA (no `Safari/` token) still reads `iPhone · Safari` — noted for whoever
  next touches `services/device_label.py`.
- **The rate limiter is real on a test stack** (L5). Register and redeem share one 10-per-hour IP
  bucket, and behind vite every dev caller is one IP (the proxy connects from 127.0.0.1 and sends no
  `X-Forwarded-For`). A run that hits it shows "Too many attempts — try again in 3521s"; the
  buckets live in memory, so restart the backend (by PID) to empty them.

## 11. Current state (2026-09-23)

- **`feature/2026-09-auth` (`FEATURES_2026-09-auth.md`, L0–L13 + L16, documented by L15) is the one
  open branch, and it is not deployed.** It is worked in the git worktree
  `/home/roli/projects/turnierplaner-auth`, branched from `cfc1669`, with `ce55a53` merged in
  (`0e1f174`) so it carries Roli's multi-site Caddy commit. It waits for Roli's go and ships as
  **one deploy** (§7 — his answer: *"one deploy, why would i want 2?"*; L14, the first of two
  documentation passes, was dropped with the second deploy). Roli asked for the app to be closed —
  no page, picture or stat without a login — with a login that can be revoked, passkeys so a phone
  opens it with Face ID, new people let in by a code he hands out, an admin page showing who is in
  from which device, and the URL, tables and roles shaped for a second friend group later. What
  landed, one line each (the rules are in §1, §4–§6, §9, §10):
  - **L0** (`698ee4c`) dev is one origin: vite proxies `/api/` and `/ws/`; **L1** (`c7e1945`) the ten
    tables, the four `group_id` columns, the boot guard, argon2id, the boot migration and
    `auth-preflight`; **L2** (`db63bb9`) the default-deny gate and its route-walking audit, cookie
    sessions, the exchange, the rate limiter, CORS and JWT auth deleted, every test fixture on
    cookies; **L3** (`8b207e1`, `17cc71d`) register, redeem, reset, password, my sessions, the admin
    API, owner roles, `group_id` on writes, the roster rule, the push group prefix and the five
    escape-hatch commands.
  - **L4** (`456e51c`) the frontend switch: no token anywhere, `AuthProvider` on `/me` and the
    offline rule, `RequireAuth`, the bare login screen; **L7** (`b1b8d93`) Settings → Account;
    **L10** (`2109e1b`) `/g/altherren/` via `basename`, `paths.group_path` for every backend path,
    the service worker's own `PUT`; **L5** (`b7cd2d6`) register, reset and "not in a group yet";
    **L6** (`5c77313`) the admin page; **L12** (`d699892`) cups in the database, the per-group star
    overlay and promotion.
  - **L8** (`f14f269`) passkeys, server side, eighteen negatives proven to bite with a hand-rolled
    software authenticator; **L11** (`3928204`) `PlayerLink` decides who may open a profile, the three
    link-less surfaces closed, `ensure_shared_group` on the server; **L9** (`9b2cf8c`) passkeys in the
    browser and the "secure your account" strip; **L16** (`3801260`, added mid-batch, approved by
    Roli) the push dispatcher no longer holds SQLite's write lock across network calls — found when
    a login answered 500 "database is locked" during a fan-out; **L13** (`7e7d54b`) the dress
    rehearsal against production's 2026-09-20 snapshot: **131 PASS, 0 FAIL**, twice, identical.
  - **L15** is this documentation pass, plus the final gates below and one comment-only
    `schema.d.ts` regeneration (L11's `routers/players.py` docstrings, which L8 had deliberately
    kept out of its own commit) so that `make gen-types` yields no diff.
  **Checks at the branch head** (measured by L15 on the finished tree): `make test` **504 passed** in 27:05 on the Pi (sharing it with `npm run check` for three minutes; L16 read the same 504 in 27:36);
  `make lint` clean; `make gen-types` **no diff** after the comment-only commit above;
  `cd frontend && npm run check` **932 tests in 96 files** (vitest 106 s, 3:10 all in, sharing the Pi
  with `make test`); `npm run build` green, `index-*.js` **774.28 kB** (the pre-existing >500 kB
  hint; 737.84 kB at Q-E — the batch's code, `@simplewebauthn/browser` being 8.8 kB of it) and the
  admin page its own lazy chunk (`AdminPage-*.js` 12.60 kB). Before the batch (`cfc1669`) the
  numbers were 303 backend tests and 839 frontend tests in 88 files.
  **What only Roli's iPhone can prove**, on production over HTTPS after the deploy — none of it is
  reachable from here, because the phone reaches dev over plain-http LAN, which is not a secure
  context: that Safari on `https://lorbeerkranz.xyz` offers "Use a passkey" at all; that **Face ID
  sets the UV flag the server requires** (a device that did not would be refused, not let in); that
  **iCloud Keychain syncs the credential** and reports it backed up (the "synced" pill) with a
  counter that stays 0 (accepted by the rule, unverified on the device); that **the installed PWA's
  own cookie jar keeps the session** `login/verify` or the exchange sets, and that a passkey made in
  Safari signs in from the PWA; that a closed Face ID sheet arrives as `NotAllowedError` (silence);
  that **`pushsubscriptionchange` fires for real** and the worker's own `PUT` lands; that a tapped
  notification opens the installed app rather than Safari; that the exchange takes the old JWT on
  the first launch with no login screen; and how the strip reads at his width. §7 step 10 is that
  walk; write each answer here.
- **Q-E and Q-F are merged and deployed — production runs `ce55a53`.** `main` is `cfc1669` (Q-F,
  "an author's name is a door to their profile", merged from `fix/2026-09-identity-links`) on top of
  `17ca1f4` (Q-E, "a blocked device says so in the bell", from `fix/2026-09-bell-denied`), plus
  Roli's own `ce55a53` "deploy other sites", which makes this repo's Caddy front his other apps
  (§7). Before those, on **2026-09-20 Roli deployed twice** and emptied a five-batch queue; both
  were the **full** deploy (`git pull && docker compose up -d --build`, §7 step-2 backup first) and
  **neither needed a manual step** — every new table comes from `init_db()` at startup and the media
  batch adds no table at all. A reader arriving here should check `git log origin/main` against the
  server before believing any of this.
  - **Deploy 1 — `87586f8`**, the four batches this file spent a week calling undeployed: the
    2026-09 design batch (frontend-only), Ideas (`a547193`), badges (`14e27db`) and guestbook
    (`87586f8`), the last three each carrying schema. Verified from here against production:
    `/api/stats/records` returns **16** records, every one with holders and a `path`;
    `/api/ideas` carries `comments`; `/api/players/1/guestbook` carries `subject`; and
    `/players/guestbook-subjects/{snapshot_id}/image` is present in the served `openapi.json`
    (a GET against it answers 404 for lack of a snapshot, not for lack of a route — which is the
    check to use, since a missing route 404s identically). Roli read the boot log himself and
    confirmed **`Record holders seeded: 16`** — the line that proves the badge diff base was
    written **silently**, to nobody's phone (§5). Cup owners on the deployed app read
    Lorbeerkranz → Berni, Bauernkranz → Rumpi.
  - **Deploy 2 — `bb831c1`** (the tree `f8ff0a4` then added eslint to `package.json`, no runtime
    code): the media batch (W1–W4) and the composer batch (Q-C/Q-D), merged as `fa24c0a` and
    `bb831c1`. Verified from here **with GET, because every `/api` route answers 405 to HEAD**
    (§10): avatar player 1 is **492,806 B** `image/png` raw, **1,064 B** `image/webp` at `?w=64`,
    2,974 at `?w=128`, 9,242 at `?w=256`, and **the original PNG again at `?w=768`** — the ladder
    never upscales; the header image goes 3,834,705 → 19,896 / 138,674 / 204,062 at 384 / 1152 /
    1536; comment 79's picture 4,412,874 → 10,784 / 29,488 / 50,892 at 384 / 768 / 1152.
    **`?w=137` answers 422**, which alone proves the new code is up, and a derivative carries
    `Cache-Control: public, max-age=604800`, matching its source (that was the value then; since
    Q-G on the auth branch every media response says `private` — §5). The **guestbook-snapshot**
    family is the one thing with nothing to show: production has no tagged entries yet, so
    nothing is served from it — an absence of data, not a failure.
  **What production still has not proven is iOS.** No push has ever gone over the wire from this
  machine (dev has no VAPID and is not HTTPS), so P2, P5, the record push and **whether iOS
  renders a non-ASCII push body** are now testable for the first time but still untested (§9);
  and no rung of the media ladder, and no lifted composer, has been seen on a real phone beyond
  Roli's own "ok better" on Q-D.
- **The composer batch (Q-C, Q-D) is merged (`bb831c1`) and deployed, and it has no plan file** —
  two fixes written straight onto `feature/2026-09-composer` from Roli's own phone, 13 files,
  frontend-only, no schema, no backend. It is the answer to *"the input field for guestbook
  entries (also comments on header etc) is super awkward on mobile. it scrolls weirdly and is not
  nice at all"* — and, crucially, *"not always though"*.
  - **Q-C (`4e8bff4`) — a chat row is pinned to the page, not to the feed.** `position: sticky`
    lifts a box no higher than the top of its **own containing block**, and the composer was
    written as the feed's last child. The tournament feed starts at y=130 and never noticed; a
    profile's guestbook starts under a ~490px header, so the lift was clamped and the row landed
    wherever the clamp left it. That is the whole of "not always": measured at 375×667, a profile
    **with** a header image put **11px of the row behind the bottom tab bar** while the same
    screen on a profile **without** one was fine — 31px of header apart. 1280×900 left **3px** of
    it on screen and 1209px of scrolling to reach it; 1280×700 put it off-screen entirely.
    `GuestbookSection` now returns the feed and the chat row as two **siblings** and the row
    sticks to `#profile-section-main`, which starts at 72–73px on every screen: scroll distance
    to reach it at 1280 went **1209px → 0**. Two more fixed in the same pass: a pinned composer
    sat **on top of** the reply field it should clear (28 of a 40px field at 390 in the guestbook,
    23 of 40 in the tournament feed), so **only one composer floats at a time** now; and
    `AutoTextarea` capped itself **twice** (`maxRows = 6` = 136px against `max-h-32` = 128px), so
    the sixth line was asked for and refused, caret 8px below the field's own bottom edge.
  - **Q-D (`6a996d1`) — a sticky composer clears the keyboard, not the bar.** From two
    photographs and a screen recording off Roli's iPhone. **The keyboard detector was working** —
    the tab bar is hidden in all of them, so `keyboardOpen.ts` had correctly said yes; the bug was
    purely positional. iOS re-anchors `position: fixed` to the shrunken **visual** viewport (that
    is Q2, the tab bar riding onto the keys) but does **not** re-anchor `sticky`, which stays on
    the **layout** viewport, which does not shrink — so Q2's collapse of the clearance to 0, right
    for the two fixed surfaces, pushed all three pinned composers the last 72px **further into the
    keys**. One token was answering two opposite questions; there are two now (§10, `DESIGN.md`
    §9b). Measured at 390×844 with a 336px keyboard (top edge y=508): the guestbook row
    **787–844 → 451–508**, tournament comments 700–843 → 365–508, ideas 383–844 → 47–508.
    Settings → Diagnostics now prints a `covered` row and `lift <n>` beside the verdict, in the
    copied report too — **behind the keyboard with `lift 0` is the measurement failing; with the
    right lift it is the CSS.** Two deliberate limits: at ≥1024px with a coarse pointer
    `lg:bottom-0` still wins, and a *short* Ideas board cannot lift its open 461px form all the
    way (Q-C's condition). **Unverified on iOS** — `visualViewport` was replaced at the source in
    a real browser, which proves the wiring and nothing about the device. Roli's verdict after
    testing the merged tree on his phone: **"ok better"**.
- **`feature/2026-09-media` (W1–W4, `FEATURES_2026-09-media.md`) is merged (`fa24c0a`) and
  deployed** — branched from `a0b1392`, five commits, 26 files, and **no new table, no new column
  and no `_RUNTIME_COLUMNS` entry**: what it added to production is one wheel in the backend image
  and one cache directory inside the bind mount (§5, §7). Roli, verbatim: *"can you pre-compute smaller
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
  Deploy shape: **no manual step**, and nothing pre-warms the cache — it was empty on the first
  boot and fills on demand, the worst first load paying ~275 ms once, ever, for a 1152 rung on
  this Pi (the VPS is faster); `Derived media swept:` on that first boot would have been a
  surprise rather than a confirmation, because a cache that has never existed has nothing to
  sweep. **W4 wrote the smoke command as `curl -sI …?w=128`, and that command does not work** —
  every `/api` route answers **405 to HEAD** (§10), so it was never run before the deploy. The
  working check is a GET: `curl -s -o /dev/null -w '%{size_download} %{content_type}\n'
  'https://lorbeerkranz.xyz/api/players/1/avatar?w=128'` → `2974 image/webp`, and `?w=137` → 422
  is the sharper proof. Both are recorded against production in the first bullet. One thing
  nobody has measured still stands: the **17 MB** in `uploads/comments/` is six dev files whose
  drawn sizes were measured, and production's feed is not that corpus.
- **`feature/2026-09-guestbook` (K1–K4, then Q-A/Q-B, G1–G3 and G4/G5) is merged** (`87586f8`,
  2026-09-19) **and deployed** in deploy 1 — branched from `14e27db`, thirteen commits, 34 files,
  **two new tables and one new media directory**; the branch is deleted. Roli asked to be able
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
  documentation pass, the one K4 and G1–G3 could not give them. Two things the deploy confirmed:
  the sweep's log line `Guestbook subjects swept: N` appears **only when a boot removed
  something**, so the silence on the first boot was the expected outcome, and
  `curl https://lorbeerkranz.xyz/api/players/1/guestbook | grep -c '"subject"'` > 0 — run against
  production, it returns 1 (the key is present and `null` on every untagged entry, and **no
  production entry is tagged yet**, which is why the media batch's snapshot rung has nothing to
  serve there). Rollback to `14e27db` ignores
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
- **`feature/2026-09-badges` (M1–M10, `FEATURES_2026-09-badges.md`) is merged** (`14e27db`) **and
  deployed** in deploy 1 — branched from `b8e741a`, twelve commits, 48 files, **two new tables**;
  the branch is deleted. Ten tasks, because M8–M10 came out of Roli living with the batch on his phone
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
  Both smoke checks came back as written: **Roli read `Record holders seeded: 16` in the boot
  log** — the line that proves the diff base was written **silently**, so nobody was buzzed with a
  backlog — and `curl https://lorbeerkranz.xyz/api/stats/records | jq '.records | length'` → 16
  against production, every record carrying holders and a `path`. Rollback to `f8a02b7` ignores
  both tables (measured, not assumed — §5).
- **`feature/2026-09-ideas` (P1–P6, `FEATURES_2026-09-ideas.md`) is merged** (`a547193`) **and
  deployed** in deploy 1 — branched from `880a6fd`, seven commits, 38 files, three new tables, the
  first batch since the audit to touch the backend and the schema; the branch is deleted. **No
  manual step** — the three tables come from `create_all` with no log line of their own, nothing
  goes into `_RUNTIME_COLUMNS`, and `notification_texts.json` ships in the image;
  `curl https://lorbeerkranz.xyz/api/ideas | grep -c '"comments"'` > 0 came back 1 against
  production, and a rollback to `880a6fd` simply ignores the new tables (measured, not
  assumed — §5). What
  landed: **P5** a device that receives nothing says so (the shell notice, `usePushNotifications`
  app-wide, the 410 on a dead endpoint, `pushsubscriptionchange` in `sw.js` — §10); **P1** the three
  tables, the comment endpoints, `PUT /ideas/{id}/read`, the one audience helper both channels use,
  and a response model on `/me/notifications`, the last endpoint typed by hand; **P2** push for a
  comment, a vote and a status in all three languages; **P3** the bell's four idea kinds with read
  state that agrees with the push; **P4** the board's flat comment thread, where opening one marks
  it read. Beside them one unnumbered fix: Ctrl+C on `make dev` now stops the servers it started
  (§10).
- **`feature/2026-09-design-fixes` is merged** (`5a97fa9`) **and deployed** in deploy 1; the
  branch is deleted (branched from
  `2e23365`; six docs
  commits, then C1–C14 as fifteen implementation commits, then this doc pass). It answers
  `DESIGN_AUDIT_2026-09-17.md`, a blind design-consistency audit — eight parallel reviewers, four
  over `frontend/src` and four over 71 screenshots, working deliberately **without** `AGENTS.md`
  or `DESIGN.md` so the findings were not anchored by decisions already made; a finding counted
  only with counted evidence behind it (raw reports in `design-audit-2026-09-17/`).
  `DESIGN_FIXES_2026-09.md` is the plan, with Roli's decisions recorded at the top under "do not
  relitigate". **Frontend-only; merged and deployed.** What landed:
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
  pending chore.
- **Every merged branch has been deleted** on 2026-09-20 (reported as 18; the per-branch reflogs
  went with them, so the count is not independently checkable — what *is* verifiable is the
  result). Locally only `main` and
  the unmerged `feat/todo-md-full-implementation` remain, so a §11 sentence of the form "this
  branch is merged and can be deleted" is now history rather than a chore; the batch bullets above
  keep their merge SHAs, which is the part that still answers questions. **Four stale branches
  survive on `origin`** — `feat/pwa-push-and-stats-player-tiles`, `feature/player-profiles-auth`,
  `gemini-colors`, `refactor/maintainability-cleanup` — and **Roli has not been asked about
  them**, so don't delete them on your own initiative.
- **Q15/Q16/Q17 (`f1ea22b`) plus the Streaks/Club-stars swap (`2e23365`) are deployed**, having
  ridden along in deploy 1 — **frontend and docs only** in themselves, which is why they were once
  queued as a short deploy before three backend batches overtook them. Q15: the clubs list's row is the edit trigger, no buttons, delete inside
  the editor (which also un-truncated 3 of 16 club names on a phone and dropped 12 wrapped league
  lines). Q16: the club-stars ladder shows all ten rungs, and an unplayed rung prints **no digits**
  — "no matches" plus an em dash — because rows genuinely played for zero points already exist and
  would otherwise be indistinguishable. Q17: `ClubMark` moved into `ui/primitives/` and every
  score-only match row wears one, across all seven surfaces, not just the friendlies list.
  The design-fixes batch above went out on the same deploy; its smoke list is in that plan's
  "Deployment" section.
- **Checks at `f8ff0a4`, the tree deployed on 2026-09-20** (re-run for W4's documentation pass):
  `cd frontend && npm run check` **826 tests in 86 files** green in 74 s. That is the media head's
  806/85 plus Q-C's 7 in the new `src/test/composerPinning.test.tsx` and Q-D's 13 in
  `keyboardOpen.test.ts` (23 → 36); nothing pre-existing moved. The backend was **not re-run here and does
  not need to be** — the composer batch is frontend-only, so the media head's **303 passed**
  stands as the current backend number.
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

- **First, once the auth deploy has been proven on Roli's phone — and not before:** a later,
  separate step deletes `player_accounts[]` from the server's `secrets.json`, then `jwt_secret`,
  `PyJWT` from `requirements.txt`, `POST /auth/exchange` (and its `PUBLIC_PATHS` entry) and
  `services/legacy_jwt.py`, together. Until then they are the rollback's login (§7 step 12) and the
  exchange that keeps every phone logged in across the deploy. Removing `jwt_secret` alone already
  ends the transition: the exchange answers 410.
- **The "secure your account" strip's condition is awaiting Roli's answer.** It is written in
  exactly one place — `DESIGN.md` §7, the `SecureAccountNotice` row — and deliberately nowhere
  else, so that changing it is a one-line code edit in `ui/shell/SecureAccountNotice.tsx` plus a
  one-line edit of that row. The question (asked 2026-09-23, after L9): he had said the strip should
  stay "until they have a passkey"; whether the shipped condition matches that, or should become
  "no passkey" alone, is his to say — the row names both and what each would show.
- **The auth deploy itself** (§7), on Roli's go, and after it the iPhone walk listed in the first
  bullet above. The frontend it ships was rehearsed only as the vite dev server; the production
  build's resume was measured separately (L10), and `docker compose build` was never run here (an
  arm64 build proves nothing about the x86 image — the wheels were proven by `pip download` for
  that platform instead). Step 5 of the deploy is where that is finally seen.
- **The main checkout's `frontend/.env.local` must become relative** (§3) the day Roli's dev
  servers move onto the auth code — `VITE_API_BASE_URL=/api` and an empty `VITE_WS_BASE_URL=` —
  or the dev app on his phone logs in and forgets it at once. Nobody in the batch was allowed to
  touch that file.
- **Part 2 (real groups) — prepared, deliberately not built.** What is waiting for it, each already
  marked in the code: reads filtered by group (the three `# part 2: filter by group` list queries);
  `/players/profiles`, `/guestbook-summary`, `/pokes-summary` and the read maps filtered by the
  roster like `/players/avatars` already is; a `shares_group` flag on the roster so
  `useProfileAccess` stops needing `qk.admin.accounts()` for the site admin (a response-model
  change); `AppCrashBoundary` / `blankNotice` through `toAbsolutePath`; `group_id` on
  `RecordHolder` / `RecordKeyState` (recreated per group); a group switcher, a cups UI, which admin
  routes become owner routes, and a no-group account's basename. Also deferred, not part-2-bound: a
  real delete for an account or a player behind the red `ConfirmDialog` (a stray registration is
  removed by SQL today), showing a session's stored IP in the admin sheet (a privacy call), email
  (nothing makes it harder: `Account` has no email column on purpose), and session-token rotation
  (declined for now — every added state is a way to log someone out by mistake).
- **Closed 2026-09-24 (Q-G): gated media say `Cache-Control: private`, not `public`.** L15 found
  it; Roli's call was *"set it to private, make sure it does not break stuff"*. Six call sites in
  `routers/players.py` (avatar, header image, pinned snapshot), `comments.py`, `ideas.py` and
  `clubs.py`, one word each, every `max-age` and the snapshot's `immutable` kept (§5). Proof that
  the browser still caches, in headless Chromium against an isolated stack at 390 (dpr 3, `blue`)
  and 1280 (dpr 2, `light`): profile, guestbook, a tournament's comments and the Ideas board —
  all six families, 14 of 17 requests a `?w=` derivative — were loaded, left for the dashboard and
  revisited, then reloaded; CDP counted **0** media requests reaching the network on either the
  revisit or the reload (every one `fromDiskCache` or `requestServedFromCache`), the backend's
  access log showed each media URL exactly once per browser context, and every `<img>` rendered
  (`naturalWidth > 0`) in every phase. `frontend/public/sw.js` has no `fetch` handler, so no service
  worker caches media and nothing there changed. Nothing was found that should stay `public`.
- **Two notices stacked were not measured** (L9). The "secure your account" strip costs the tab
  strip +78px at 390 and +70px at 1280; with P5's push notice above it the arithmetic says
  ≈+140–156px, but headless Chromium always reports `Notification.permission === "denied"`, so
  P5's notice never renders there. A phone shows both only while it has neither decided about push
  nor added a passkey.
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
- **Closed 2026-09-23: push works over the wire on iOS, umlauts and all.** Roli's words, after
  testing on his phone: *"push umlauts work."* That closes the oldest open question in this file —
  M2 wrote the catalogue's real `ä ö ü ß` (§9) and nothing on this machine could ever check them,
  because push has never gone over the wire from here at all (no VAPID, no `cryptography`; every
  push assertion in every batch stops at the queued message). There is no mojibake. **Do not
  re-impose "ASCII-safe" on German**, and do not reopen this. What is *still* his to read is the
  **wording**: the Styrian lines M2 wrote are listed one by one in that task's Deviations, he has
  already corrected two himself (`gräßte` → `greßte`, `Siegsserie` → `Siegesserie`), and the six
  **lead** lines are newer than that reading, so they have not had his eye at all; `Grod hot'n
  kana.` (and its lead twin `Grod is kana vorn.`) is still the one to read aloud.
- **Closed 2026-09-23: the PWA reinstall path works** (P5). Roli, in the same session: *"'device
  gets no notifications' is also shown"* — so a reinstalled PWA does come back with
  `Notification.permission === "default"`, the shell notice does appear unprompted on whatever page
  he was on, and the one half of P5 that no amount of measuring here could reach is confirmed on
  the device. Everything else about P5 was already measured (40/40 browser checks, the server's 410
  live and in tests). **What his testing also produced is Q-E**: a *denied* device said nothing at
  all, for ever, and now says so in the bell (§10).
- **The push and bell copy for the four idea events is Roli's to correct** — three languages × four
  events (`backend/app/notification_texts.json`, `frontend/src/ui/shell/notificationText.ts`): his
  Styrian drafts transcribed as written, the German **spelled with its umlauts** (M2 repaired the
  whole catalogue and there was never a reason for the transliteration — §9; do not put it back),
  the English plain. One divergence to
  read with fresh eyes, because it is deliberate and not drift: the **bell** says "likes your idea"
  (his own word for it, decided on the second pass) while the English **push** still says "wants
  your idea too" (the board's own verb). Either is a one-line string edit with no code behind it.
- **Q2, the keyboard, is now addressed and partially confirmed — but not verified on iOS.** The
  history matters, because it shipped green twice on a threshold that measured geometry and did
  nothing on the device both times; the rule is the caret (§10). Q-D then found that the
  **detection had been right all along** — the tab bar is hidden in every photograph Roli sent —
  and that what remained was purely positional, a `sticky` box collapsing its room as though it
  were `fixed`. His verdict on the merged, deployed tree is **"ok better"**, which is the first
  time this family has been reported working on the device at all. It is *not* a tick: "better"
  is not a measurement, `visualViewport` was only replaced at the source in a desktop browser, and
  the two known limits (≥1024px with a coarse pointer, and a short Ideas board with its 461px form
  open) are unexercised on a phone. Worth re-testing in one session: a tournament's comments, the
  Ideas composer **including the hop from the title into the details textarea** (the case that
  failed twice), and a profile's guestbook — in the standalone PWA *and* in Safari. If it fails:
  Settings → Diagnostics → Copy, and read `lift` first — **`lift 0` behind the keyboard is the
  measurement failing; the right lift with the row still covered is the CSS.**
- **The profile header eats the Guestbook tab, and it is Roli's call how much** (2026-09-20, from
  his own use of the deployed app). At **390px** the header leaves roughly **150px** of reading
  room above the fold on that tab; at **1280px** there is effectively none of this problem. It is
  M8/M9 territory — those two tasks already took 66px off the tab strip's top and then put 4–9.5px
  back for the taller avatar (§10) — and it interacts with Q-C, since the header's height is
  exactly what used to clamp the composer's lift. **Nothing has been designed for it**: the
  options (a shorter header on this tab, a collapsing header, or leaving it) have not been
  costed, and nobody should start one as a drive-by.
- **Closed 2026-09-23: tapping an unread guestbook message still marks it read** (G2's deliberate
  non-change, listed here as undecided until Q-F). Roli kept the shortcut when it was raised as an
  invisible target; §9's identity bullet records it and what `PlayerLink` does to it (the name
  navigates and leaves the message unread). Not a question any more.
- **An empty Matches tab, seen once and never reproduced.** In Roli's screen recording at 13:48 on
  2026-09-20 the profile's Matches tab rendered **black from the tab strip to the bottom bar** —
  no rows, no empty state, no loader. It has not happened again, nothing was captured from
  Settings → Diagnostics at the time, and the recording is the only evidence, so there is no
  theory here worth writing down: it is **not** the blank-screen detector's case (the app was
  drawing, the shell and the tab strip were on screen), which is the one thing that can be said
  for certain. If it recurs, the first move is Diagnostics → Copy all **while it is on screen**,
  and the second is whether the tab's query is empty or errored — `RouteErrorBoundary` would have
  shown a page-failed state, and it did not.
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
| Batch trackers (history + decisions) | `REFACTORING_PLAN.md`, `FEATURES_2026-07.md`, `FEATURES_2026-08.md`, `FEATURES_2026-09.md`, `DESIGN_FIXES_2026-09.md`, `FEATURES_2026-09-ideas.md`, `FEATURES_2026-09-badges.md`, `FEATURES_2026-09-guestbook.md`, `FEATURES_2026-09-media.md`, `FEATURES_2026-09-auth.md` |
| The blind design audit behind the C-batch | `DESIGN_AUDIT_2026-09-17.md` + `design-audit-2026-09-17/` (eight raw reports) |
| Claude Code auto-memory (per-machine, not in git) | `~/.claude/projects/-home-roli-projects-turnierplaner-reloaded/memory/` |
| Production data snapshots (not in git) | `backup/deploy/<ts>/`, `backup/local/<ts>/` |
| The deploy rehearsal's secrets *shape* (not in git, not the real file) | `~/.local/share/turnierplaner-rehearsal/secrets.rehearsal.json` (§7 step 3) |
