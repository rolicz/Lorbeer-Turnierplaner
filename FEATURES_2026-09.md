# Feature Batch 2026-09 — H2H Matchups, Stats IA, Mobile Navigation, Local-first cleanup

> Branch `feature/2026-09-batch` off `main` (baseline `b56b1fb`). Created 2026-09-12.
> Symbol names are the source of truth; line numbers reference the baseline.
> Read `AGENTS.md` first (canonical project knowledge: commands, conventions, gotchas).
>
> Requested by Roli (2026-09-12): (1) a way to see all prior matches against one other
> player in Stats → H2H that works with Overall/1v1/2v2 and the source filter; (2) a better
> organised stats page **without losing information**; (3) more intuitive navigation
> app-wide; (4) serve Font Awesome locally instead of the CDN; (5) fix documentation drift
> and dead code; (6) keep the test suite green and check it is complete.
> **Not deployed** at the end of this batch — Roli tests locally first.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding
   code style (Tailwind + design tokens, `qk` query-key factory, generated API types,
   lucide-react icons for anything new — never add new Font Awesome usages).
2. Work on branch `feature/2026-09-batch` (already checked out). **Never switch branches,
   never touch `main`, never push.** One or more commits per task, message prefixed with the
   task ID, e.g. `feat(S2): …`, `fix(U3): …`, `chore(F1): …`, `docs(D1): …`.
3. Checks must be green before committing: backend touched → `make test` + `make lint`
   from repo root; backend response models / routes touched → `make gen-types` and commit
   the regenerated `frontend/src/api/generated/schema.d.ts` in the same commit; frontend
   touched → `cd frontend && npm run check` (and `npm run build` for anything structural:
   deleted files, new routes, dependency changes).
4. UI must work at mobile ~390px and desktop ≥1024px. Verify in a real browser with
   Playwright against an **isolated stack** (see "Runtime verification" below). Roli's own
   dev servers run on ports 8000/8001 (and 8010/5173 belong to other projects) — **never
   bind those ports** and never point verification at his DB.
5. Never read or print `backend/secrets.json`. Never run destructive commands on
   `backend/app.db` or `backend/data/app.db` — copy first.
6. Tick your task's checkbox here and note deviations under the task. Include that edit in
   your commit. If blocked or the code doesn't match this spec, stop, note it here, commit
   nothing broken, and report back.
7. Keep `AGENTS.md` truthful: if you change a command, a convention or a URL scheme, update
   the relevant line there in the same commit (D1 does the full pass at the end).

### Runtime verification (isolated stack)

```bash
# backend copy on :8003 (never :8001). --db-url overrides secrets.json.
cp backend/app.db backend/data/verify.db      # gitignored
cd backend && .venv/bin/python run.py --host 127.0.0.1 --port 8003 --db-url sqlite:///./data/verify.db &
# vite on :8020 pointing at the copy (env vars beat .env.local)
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:8003 VITE_WS_BASE_URL=ws://127.0.0.1:8003 npx vite --port 8020 --strictPort &
# Playwright (installed in the npx cache; chromium present in ~/.cache/ms-playwright)
node -e "const {chromium}=require('/home/roli/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');(async()=>{const b=await chromium.launch();const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();await p.goto('http://127.0.0.1:8020/stats',{waitUntil:'networkidle'});await p.screenshot({path:'/tmp/claude-1000/shot.png',fullPage:true});await b.close();})()"
```
Kill your servers when done. Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5,
Mike=6; tournament 19 is done (1v1), 17 is done (2v2). Reader role (no login) is enough for
all read-only checks; editor/admin flows can be checked by code + tests.

---

## Decisions (approved by Roli 2026-09-12 — do not relitigate)

- **One stats layout.** The "Classic" layout is retired; every Classic-only capability is
  folded into the "New" layout first (S1–S3), then Classic is deleted (S4). No information
  is removed, only reorganised.
- **Stats information architecture:** four top-level sections that fit a phone —
  **Overview** (sub-views Table · Positions · Streaks · Records · Cups), **Trends**,
  **H2H** (sub-views Players · Duos, plus the Matchup drill-in), **Player** (profile,
  key numbers, form, profile net, club stars, streaks, match history).
- **Matchup view** ("A vs B, every match") lives inside H2H, is URL-addressable
  (`/stats?view=h2h&player=<a>&vs=<b>`), and follows the global Mode and Source filters.
  Within `/stats`, param changes use `replace` (as today); an in-view back button clears
  `vs`. External deep links (profile, match detail) push a normal history entry.
- **Mobile navigation:** a fixed bottom tab bar with Dashboard, Tournaments, Friendlies,
  Stats, Players. Clubs (editor+) and Settings stay in the drawer; the drawer keeps all
  entries. Detail pages keep the back chevron in the top bar — the bottom bar makes the
  drawer dead-end irrelevant.
- **Font Awesome is bundled** (`@fortawesome/fontawesome-free`), not migrated to lucide in
  this batch. New code uses lucide.
- **Tab state** on every tabbed page is persisted in the URL as `?tab=` (one shared hook).
- **Backups stay manual** for now (Roli's call); nothing in this batch.
- Vite is aligned to 7.x (single Vite for build + vitest); the frontend image moves to
  `node:22-alpine`.

## Task overview & order (sequential, one worker per task)

| # | ID | Title | Touches |
|---|----|-------|---------|
| 1 | F1 | Font Awesome bundled locally + Vite 7 alignment | frontend tooling |
| 2 | F2 | Drift & dead code | backend + frontend |
| 3 | U1 | Shell consistency: tab overflow, `useTabParam`, 404, login redirect, profile header | frontend |
| 4 | U2 | Mobile bottom tab bar | frontend |
| 5 | U3 | Guestbook notification deep link | backend + frontend |
| 6 | U5 | Mount the error toast viewport (bug found during U2) | frontend |
| 7 | U4 | Clickable match rows + shared matchup summary helper | frontend |
| 8 | S1 | Stats IA: four sections, sub-views, filters, shared player, legacy URL mapping | frontend |
| 9 | S5 | Floating filter pill for Mode/Source (native selects) | frontend |
| 10 | S2 | Matchup view + all entry points | frontend |
| 11 | S3 | Player section completion + Elo/positions explainers | frontend |
| 12 | S4 | Retire the Classic layout | frontend |
| 13 | U6 | Per-destination last page memory (bottom bar / sidebar / drawer) | frontend |
| 14 | T1 | Test-suite audit and gap filling | backend + frontend |
| 15 | S6 | Cups page reorganised: reigns, streak lengths, records | frontend |
| 16 | S7 | Filter pill v2: compact, icon-forward, popover | frontend |
| 17 | DS1 | Design foundations: tokens, surface canon, ScoreLine/StatTile/Chip/Stars, dead CSS | frontend |
| 18 | DS2 | Score display: one ScoreLine, hero panel redesign | frontend |
| 19 | DS5 | Semantic colours replace raw palette classes | frontend |
| 20 | DS7 | Lucide only: migrate 35 Font Awesome files, drop the dependency | frontend |
| 21 | DS6 | Selection controls & buttons on the canon | frontend |
| 22 | DS3 | Surface & radius migration, retire old classes | frontend |
| 23 | DS4 | Typography & section headers on the scale | frontend |
| 24 | D1 | Documentation pass (README, frontend/README, AGENTS.md, DESIGN.md) | docs |

---

## F1 — Font Awesome bundled locally + Vite 7 alignment  ☑

**Why:** `frontend/index.html:15` loads Font Awesome 6.6 from cdnjs — the only remaining
runtime CDN dependency (local-first rule, offline PWA). vitest 4 pulls its own Vite 8
because the project pins Vite 5 (`frontend/package.json`), which causes the
`esbuild → oxc` deprecation warnings in `npm run check`.

- `cd frontend && npm install @fortawesome/fontawesome-free@^6.7.2` (runtime dependency).
- `frontend/src/main.tsx`: add `import "@fortawesome/fontawesome-free/css/all.min.css";`
  directly above the existing `flag-icons` import, with a one-line comment like the
  flag-icons one. Remove the `<link rel="stylesheet" href="https://cdnjs…">` line from
  `frontend/index.html`. No brands icons are used (verified), but `all.min.css` is fine:
  browsers only fetch font files that are actually referenced.
- `npm install -D vite@^7.3 @vitejs/plugin-react@^5.2` (keep `vitest@^4.1`). Confirm
  `npm ls vite` shows exactly one Vite version and `npm run check` prints no
  `esbuild`/`oxc`/`rolldownOptions` deprecation warnings. `vite.config.ts` needs no change
  (the `assetsInlineLimit` callback is supported); fix anything Vite 7 complains about.
- `frontend/Dockerfile`: `FROM node:20-alpine` → `FROM node:22-alpine` (Vite 7 needs
  Node ≥ 20.19 / 22.12). Keep the `npm install` (not `ci`) comment and behaviour.
- `AGENTS.md` §10: delete the "Font Awesome … cdnjs" gotcha bullet (D1 will re-check).

**DoD:** `grep -rn "cdnjs\|https://" frontend/index.html frontend/dist/index.html` → no
external hosts; `ls frontend/dist/assets | grep -c "fa-solid"` ≥ 1 after `npm run build`;
`npm run check` green and warning-free; a Playwright screenshot of `/tournaments` at 390px
shows the crown/trophy icons (they are FA glyphs) rendering.

**Deviations:** (implemented 2026-09-12)

- Installed versions: `@fortawesome/fontawesome-free@6.7.2`, `vite@7.3.6`,
  `@vitejs/plugin-react@5.2.0`; `vitest@4.1.8` unchanged. `npm ls vite` now shows a single
  `vite@7.3.6` (vitest/@vitest/mocker dedupe onto it). `vite.config.ts` needed no change.
- Three extra one-line truthfulness fixes in `AGENTS.md` beyond the §10 bullet the task named
  (rule 7): §2 stack table `Vite 5` → `Vite 7`, §7 compose description `node:20 build` →
  `node:22 build`, §11 open follow-ups drops "bundle Font Awesome locally". D1 re-checks.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint for
  `index-*.js` (624 kB); unrelated to F1, not addressed.
- Bundle cost: `all.min.css` adds ~70 kB to `dist/assets/index-*.css` (170 kB total, 42 kB
  gzip) and emits 8 webfont files; a browser only fetches the faces actually referenced —
  verified in Playwright: only `fa-solid-900.woff2` is requested on `/tournaments`,
  `fa-regular-400.woff2` only once a `fa-regular` glyph exists on the page.

---

## F2 — Drift & dead code  ☑

- Backend: delete the duplicate route `GET /comments/tournaments-summary`
  (`backend/app/routers/comments.py:252-255`, function `comments_summary`). The frontend
  only calls `/tournaments/comments-summary` (`frontend/src/api/comments.api.ts:23`).
  Update `backend/tests/test_comments_current.py:80-…` (the `s2` request) to assert the old
  path now returns 404, or drop that assertion. Run `make gen-types`; commit `schema.d.ts`.
- Backend: delete `backend/app/stats.py` (legacy compat module, nothing imports it).
- `frontend/.env.example`: API/WS URLs must use port **8001** (backend), not 8000.
- Delete `frontend/public/original.jpg` and `frontend/public/index-html-snippet.txt`
  (unreferenced, shipped in every build). Keep `icon-512.png` (used by the shell).
- Delete dead UI code: `frontend/src/pages/live/PlayerLiveStatsModal.tsx`,
  `frontend/src/ui/primitives/Sheet.tsx`, `frontend/src/ui/primitives/Panel.tsx`
  (verify with `grep -rn` that nothing imports them; the inventory says nothing does).
- Do **not** delete git branches, DB copies in `backend/`, or anything under `backup/`.

**DoD:** `make test`, `make lint`, `npm run check`, `npm run build` green; `git grep` finds
no reference to the deleted symbols/paths (except `README.md`, which D1 fixes).

**Deviations:** (implemented 2026-09-12)

- `backend/app/stats.py` was **not** fully dead: `compute_tournament_stats` is imported by
  `backend/app/routers/tournaments.py` and serves `GET /tournaments/{id}/stats` (covered by
  `tests/test_stats_endpoints.py:266`). Only `compute_stats` was dead. Instead of deleting the
  route's helper, `compute_tournament_stats` moved verbatim into new
  `backend/app/services/stats/tournament_stats.py` (thin-router convention, `AGENTS.md` §2),
  the dead `compute_stats` is gone and `backend/app/stats.py` is deleted as planned.
- The removed `GET /comments/tournaments-summary` now answers **405**, not 404: the path still
  matches `PATCH`/`DELETE /comments/{comment_id}`, so FastAPI rejects the method. The `s2`
  assertion in `backend/tests/test_comments_current.py` asserts `in (404, 405)`.
- Dropping the route also made `CommentSummaryOut` and `tournament_comments_summary` unused in
  `backend/app/routers/comments.py`; both imports were removed (ruff F401 would fail otherwise).
- Rule 7 truthfulness fixes in `AGENTS.md`: §2 drops the `app/stats.py` bullet and adds
  `tournament_stats` to the `stats/` service list, §2 primitives list drops `Sheet`, §10 drops
  the `frontend/public` leftovers gotcha, §11 drops the now-done open follow-up. D1 re-checks.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (624 kB
  `index-*.js`); unrelated to F2, as already noted under F1.

---

## U1 — Shell consistency  ☑

Five small, independent fixes in one task (one commit each is fine).

**a) Tab strip overflow affordance** — `frontend/src/ui/SectionTabs.tsx`. Today the strip
is `overflow-x-auto no-scrollbar`: on a phone, Stats shows 4 of 9 tabs, the live page cuts
off "Comments", the profile cuts off "Guestbook", with no hint that more exist.
- Wrap the scroller in a `relative` container; track `canScrollLeft`/`canScrollRight`
  (`scrollLeft`, `scrollWidth`, `clientWidth`) on scroll and on resize (`ResizeObserver`
  guarded for jsdom); render pointer-events-none gradient overlays on the sides that can
  still scroll (`bg-gradient-to-l from-bg-default to-transparent`, width ~2rem).
- When `active` changes, scroll the active button into view:
  `el.scrollIntoView?.({ inline: "nearest", block: "nearest" })`.
- Add `frontend/src/test/sectionTabs.test.tsx`: renders tabs, `aria-selected` on the active
  one, click calls `onChange`.

**b) One tab-state hook** — new `frontend/src/ui/shell/useTabParam.ts`:
```ts
export function useTabParam<K extends string>(keys: readonly K[], fallback: K, param = "tab"): [K, (k: K) => void]
```
Reads `searchParams.get(param)`; unknown/missing → `fallback`. Setter deletes the param
when `k === fallback`, otherwise sets it; `setSearchParams(next, { replace: true })`.
Adopt it (keeping each page's key names and defaults):
- `pages/live/MatchDetailPage.tsx:56` (`h2h | comments | edit`, fallback `h2h`; if the param
  says `edit` but `canEditResult` is false, treat as `h2h`).
- `pages/FriendliesPage.tsx:18` (`all | new`), `pages/SettingsPage.tsx:81`
  (`account | appearance | notifications`), `pages/PlayersAdminPage.tsx:51`
  (`players | add`, admin-only tab falls back to `players`), `pages/ClubsPage.tsx:112`
  (`clubs | new`), `pages/dashboard/DashboardPage.tsx:29-36` (`overview | cups`),
  `pages/TournamentsPage.tsx:59-65` (`all | new`, guarded by `canWrite`).
- `pages/ProfilePage.tsx:49-63`: rename the param from `pt` to `tab`
  (`overview | stats | matches | guestbook`) and update
  `pages/profile/useGuestbookUnreadJump.ts:37` (`next.set("tab", "guestbook")`).
- Leave `LiveTournamentPage` alone (it already uses `?tab=` with extra logic).
- Add `frontend/src/test/useTabParam.test.tsx` (MemoryRouter; fallback, set, delete).

**c) 404 route** — new `frontend/src/pages/NotFoundPage.tsx` (`PageLayout title="Not found"`,
one sentence, a `Link` to `/dashboard`); `frontend/src/app/App.tsx`: `<Route path="*" …>`.

**d) Login returns you where you were** — `frontend/src/auth/RequireRole.tsx`: navigate to
`/login` with `state={{ from: location.pathname + location.search }}`.
`frontend/src/pages/LoginPage.tsx:25`: after login `nav(from, { replace: true })` where
`from` is the state value if it starts with `/` and is not `/login`, else `/dashboard`.
`App.tsx:69-78`: the `/profile` route becomes `minRole="reader"` (ProfilePage already renders
"Login to open your profile." when there is no player), so a viewer in reader mode is not
bounced to login from Settings → "My profile".

**e) Profile desktop header** — `pages/ProfilePage.tsx`: above `ProfileHeader`, render the
same desktop-only block as `pages/live/LiveTournamentPage.tsx:516-521` (`InlineBack` +
`<h1>` with the player's name). Render `InlineBack` only when `useContextualBack().isDetail`
(i.e. on `/profiles/:id`, not on `/profile`).

**DoD:** `npm run check` + `npm run build` green; Playwright at 390px: `/stats` and
`/live/19` show a right-edge fade on the tab strip and none on the left; switching to the
last tab scrolls it into view; `/settings?tab=notifications` opens Notifications;
`/nope` renders the not-found page; unknown `?tab=` values fall back.

**Deviations:** (implemented 2026-09-12)

- Tab key names in the plan did not all match the code; the existing keys were kept as
  instructed: FriendliesPage is `all | create` (not `all | new`), ClubsPage is
  `browse | new` (not `clubs | new`). Defaults unchanged everywhere.
- `SectionTabs` ignores 24px of scroll slack on each edge before showing a fade: the
  scroller's own end padding (`px-4` + the last button's `mr-1`) is scrollable but hides
  nothing, so without the slack the last — usually active — tab sat under a fade and looked
  cut off. Committed separately as `fix(U1): keep the last tab clear of the edge fade`.
- The overlays carry `data-tabs-fade="left|right"` so tests/Playwright can assert them.
- `useTabParam` also guards the role-gated tabs on ClubsPage (`new` → `browse`) and
  TournamentsPage (`new` → `all`), not just PlayersAdminPage and MatchDetailPage: a
  `?tab=new` deep link is now reachable for a reader and must fall back.
- `LoginPage` additionally rejects a `from` starting with `//` (protocol-relative URL)
  before navigating.
- `ProfilePage` lost its now-unused `useCallback` import, `SettingsPage` its `useState`
  import, `TournamentsPage` and `DashboardPage` their `useSearchParams` import.
- The desktop title row on `/profiles/:id` uses no `mb-1` (unlike the live page): the
  surrounding container already has `space-y-4`.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy
  of `app.db`, vite :8020) — 43 checks green at 390px and 1280px, including `/stats` and
  `/live/19` fades, last-tab scroll-into-view, every `?tab=` deep link and its fallback,
  `/nope`, the `/clubs` → `/login` redirect carrying `state.from`, and `/profile` no longer
  bouncing a reader. Deep-linked stats tabs use `?view=` (not `?tab=`) — S1 owns that page.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint; unrelated,
  as already noted under F1/F2.

---

## U2 — Mobile bottom tab bar  ☑

- New `frontend/src/ui/shell/BottomTabBar.tsx` (`lg:hidden`, `fixed inset-x-0 bottom-0
  z-30`, `nav-shell` look with a top border, `pb-[env(safe-area-inset-bottom,0px)]`,
  `role="navigation" aria-label="Primary"`). Items = `visibleDests(role)` minus `clubs`
  (`ui/shell/navConfig.tsx`) → Dashboard, Tournaments, Friendlies, Stats, Players. Each item
  is a `Link` with the lucide icon (`h-5 w-5`) above a `text-[10px]` label, min height
  56px, `aria-current="page"` + accent colour when `activeDest(pathname)` matches. The
  Tournaments item shows the live dot/ping (copy the spans from `Sidebar.tsx:60-63`) while
  `useLiveTournament().data` is non-null; tapping it while a tournament is live goes to
  `/live/{id}` instead of `/tournaments` (the drawer's "Live now" entry stays as is).
  Tapping the already-active item scrolls to top.
- `frontend/src/ui/shell/AppShell.tsx`: render `<BottomTabBar />` after `<main>`; give
  `<main>` bottom padding `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-6` so
  nothing hides behind the bar.
- `frontend/src/ui/primitives/ErrorToast.tsx:87`: `bottom-4` →
  `bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-4`.
- The drawer (`MobileChrome.tsx`) keeps all entries. Modals are `z-50` and already cover
  the bar; `useSwipeNav`, pull-to-refresh and hide-on-scroll are untouched (the bar itself
  never hides).
- Add `frontend/src/test/bottomTabBar.test.tsx`: reader sees exactly 5 links, no Clubs; the
  link matching the current path has `aria-current="page"`.

**DoD:** Playwright 390px screenshots of `/dashboard`, `/live/19`, `/profiles/1`,
`/tournaments` (scrolled to the bottom): bar visible, last list row fully visible above it,
active item highlighted, back chevron still in the top bar on detail pages. Desktop
(1280px): no bar. `npm run check` + `npm run build` green.

**Deviations:** (implemented 2026-09-12)

- The live indicator is an **overlay badge** on the Tournaments icon (the two spans from
  `Sidebar.tsx:60-63`, wrapped in an absolutely positioned span at the icon's top-right), not a
  replacement for the Trophy icon: a bottom tab has to keep its icon+label identity.
- `nav-shell` carries `@apply border-b`, so the bar adds `border-b-0 border-t` (utilities beat the
  components layer) to get the top border the task asks for.
- "Scroll to top on the active tab" uses `prefersReducedMotion()` from `ui/scroll.ts` to choose
  `auto` vs `smooth`, like the rest of the app's programmatic scrolling.
- `<main>` keeps `py-4 lg:py-6` and appends `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]
  lg:pb-6`; Tailwind emits `pb-*` after `py-*`, so the override wins (verified at runtime:
  padding-bottom 72px at 390px, 24px at 1280px).
- **Finding (not fixed here, out of U2's scope):** `ErrorToastViewport` is defined in
  `ui/primitives/ErrorToast.tsx` but **mounted nowhere** in the app — `showErrorToast` currently
  renders no toast at all. The `bottom-*` change is correct but has no runtime effect until the
  viewport is mounted; the offset was verified with a DOM probe using the exact class string
  (computed `bottom: 72px` at 390px → 15px clear of the bar, `16px` at ≥lg). Worth a line in
  T1/D1.
- `bottomTabBar.test.tsx` covers two cases beyond the ones named: the owning destination stays
  active on detail routes (`/profiles/2` → Players) and the live shortcut (href `/live/19` + dot).
  It stubs `useLiveTournament` with `vi.mock`, so no QueryClient/network is needed; `AuthProvider`
  supplies the reader role.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): 24 checks at 390px/1280px, plus 5 more after flipping one match of
  tournament 19 to `playing` in the copy to exercise the live state.

---

## U3 — Guestbook notification deep link  ☑

**Bug:** `backend/app/routers/me.py:156` emits `/profiles/{me}#guestbook-entry-{id}`, but
nothing on the profile reads `location.hash` and the guestbook only mounts on its tab, so
the bell's guestbook item lands on the Overview tab.

- Backend: path → `f"/profiles/{me_id}?tab=guestbook&entry={int(e.id)}"`. Extend
  `backend/tests/test_me_notifications.py` to assert the guestbook item's `path`.
- Frontend: extend `frontend/src/pages/profile/useGuestbookUnreadJump.ts` to also handle
  `?entry=<id>`: once `ready`, ensure `tab=guestbook`, strip `entry` (replace), and call
  `focusGuestbookEntry(id, { blink: true, behavior: "smooth" })` (it polls for the element,
  so it survives the tab switch). Handle each id once (same `handledRef` pattern).
- `README.md` API section: nothing to change (D1 covers docs).

**DoD:** `make test` green; manual: open `/profiles/1?tab=guestbook&entry=<existing id>` in
the isolated stack → guestbook tab, entry scrolled into view and flashed, URL cleaned.

**Deviations:** (implemented 2026-09-12)

- `?entry=` is handled by a **second effect** inside `useGuestbookUnreadJump.ts` with its own
  `handledEntryRef`, next to the existing `?unread=1` effect (same pattern, independent ids).
  The file name stays `useGuestbookUnreadJump.ts`; its doc comment now names both deep links.
- A non-numeric or non-positive `entry` value is ignored and left in the URL (no navigation,
  no focus call) instead of being treated as an error.
- `make gen-types` produced **no diff**: the notification `path` is a plain string field, so
  no `schema.d.ts` is part of this commit.
- `test_notifications_collect_reply_guestbook_and_poke` now also asserts the guestbook item's
  `author_name` and the poke item's `path` (both were untested) besides the new `path`.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): 18 checks green — `/profiles/1?tab=guestbook&entry=1` at 390px and
  1280px and `/profiles/1?entry=4` (no `tab` param) all land on the Guestbook tab, mount the
  entry, scroll it fully into view, flash it (`comment-attn`) and clean the URL to
  `/profiles/1?tab=guestbook`.

---

## U5 — Mount the error toast viewport (found during U2)  ☑

**Bug:** `frontend/src/ui/primitives/ErrorToast.tsx` exports `ErrorToastViewport`, and
~40 call sites use `showErrorToast` / `ErrorToastOnError` (profile, guestbook, comments,
friendlies, players admin, the central 401 "session expired" handler …), but **nothing
mounts the viewport**, so every error toast is dispatched into the void. Users never see
API errors.

- Mount `<ErrorToastViewport />` once in `frontend/src/ui/shell/AppShell.tsx` (inside
  `ShellInner`, after `<main>`/`<BottomTabBar />`, so it renders on every route including
  `/login`).
- Confirm the U2 offset works for real: at 390px a toast sits above the bottom tab bar
  (`bottom` ≈ 4.5rem + safe area), at ≥1024px at `bottom-4`. Trigger one in the isolated
  stack by e.g. calling `showErrorToast("Test")` via `page.evaluate` after importing —
  simplest: temporarily dispatch the `app:error-toast` CustomEvent from Playwright with a
  payload `{ id: 1, title: "Test", message: "Hello", level: "error" }` and screenshot.
- Add `frontend/src/test/errorToast.test.tsx`: render `ErrorToastViewport`, call
  `showErrorToast("boom", "Oops")`, assert the text appears; a second identical call
  within the dedupe window does not add a second toast.

**DoD:** toast visible on mobile and desktop in the isolated stack; `npm run check` green.

**Deviations:** (implemented 2026-09-12)

- `<ErrorToastViewport />` is mounted inside `ShellInner` but **outside** the inner flex
  column (as the last child of the `min-h-screen lg:flex` root, after the column that holds
  `<main>`/`<BottomTabBar />`): the viewport is `position: fixed`, so nesting it in the
  scrolling column would only add a stray flex item. Still one mount, still on every route
  including `/login`. This closes the U2 finding.
- `errorToast.test.tsx` has 6 cases, not 2: besides "shows a toast" and "dedupes an identical
  repeat", it covers the empty viewport before any toast, distinct toasts stacking, empty/
  whitespace messages being dropped, and the dismiss button. `showErrorToast` dispatches a
  window event, so each call is wrapped in `act()` and every case uses a distinct message
  (the 1100 ms dedupe map is module-level and shared across the file).
- Runtime DoD verified with Playwright against the isolated stack: 14 checks green —
  `app:error-toast` dispatched on `/dashboard` and `/login` at 390px renders the toast with
  computed `bottom: 72px`, its box ending 15px above the bottom tab bar (`barTop` 787,
  toast bottom 772); at 1280px `bottom: 16px`, bottom-right (16px from both edges) and no
  bottom bar.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (629 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1.

---

## U4 — Clickable match rows + shared matchup summary helper  ☑

**a) Match rows navigate to the match page.** `frontend/src/pages/stats/MatchHistoryList.tsx`:
- `MatchRowWithClubs` gains `href?: string | null`. When set, the row's main block (not the
  `action` slot) is rendered as a react-router `Link` (`to={href}`,
  `state={{ fromTab: "matches" }}`) with `row-tap`-style hover/active feedback and
  `aria-label="Open match"`; otherwise unchanged markup.
- `MatchHistoryTournamentBlock` / `MatchHistoryList` gain `matchHref?: (t, m) => string | null`.
- Export `tournamentMatchHref(t, m)` → `` t.id > 0 && t.status !== "friendly" ? `/live/${t.id}/match/${m.id}` : null ``
  (friendlies have synthetic negative ids and no detail page).
- Apply `matchHref={tournamentMatchHref}` in `pages/profile/MatchHistorySection.tsx`,
  `pages/profile/ProfileOverviewTab.tsx` (recent matches), `pages/stats/PlayerProfile.tsx:149`,
  and the H2H duo history modal in `pages/stats/H2HView.tsx` (the `MatchHistoryList` inside
  the `Modal`). Leave `pages/tools/FriendlyMatchesListCard.tsx` alone (own actions).
- Extend `frontend/src/test/matchHistoryList.test.tsx`: with `matchHref` the row renders a
  link to `/live/<t>/match/<m>`; friendly rows render none.

**b) Shared matchup summary.** Move the pure helpers out of
`frontend/src/pages/live/MatchH2HPanel.tsx` into new
`frontend/src/pages/stats/h2h/matchupSummary.ts`: `Summary`, `playerIds`, `playerNames`,
`hasAllPlayers`, `matchPerspective`, `summarizeMatches`, `flattenRecentMatches`
(behaviour identical; `MatchH2HPanel` imports them). Add:
- `resultsTimeline(tournaments, leftIds, rightIds = [])` → `Array<"W" | "D" | "L">` in the
  order the API returns (newest first) using `matchPerspective`.
- `currentRun(results)` → `{ kind: "W" | "D" | "L"; length: number } | null` counting equal
  results from the newest.
Add `frontend/src/test/matchupSummary.test.ts` (perspective flip, 2v2 subset, timeline, run).

**DoD:** `npm run check` green; profile "Matches" rows open the match page in the isolated
stack; `MatchH2HPanel` output unchanged (compare a screenshot of `/live/19/match/<id>`).

**Deviations:** (implemented 2026-09-12, two commits: `feat(U4)` row links, `refactor(U4)` helpers)

- `MatchHistoryList.tsx` now carries `/* eslint-disable react-refresh/only-export-components */`
  at the top (the file exports `tournamentMatchHref` next to components) — the same pattern as
  `ui/clubControls.tsx`, `ui/primitives/Pill.tsx`, `ui/primitives/ErrorToast.tsx`. Without it
  `npm run check` prints a new eslint warning.
- The linked block keeps the original markup: only the wrapper changes from
  `<div className="min-w-0 flex-1">` to `<Link className="row-tap focus-ring block min-w-0 flex-1">`,
  the row body is shared between both branches. Verified that the `MatchH2HPanel` DOM and a
  full-page screenshot of `/live/19/match/105` are **byte-identical** to the pre-U4 baseline at
  390px and 1280px (both after commit a and after commit b).
- `matchupSummary.ts` exports two names beyond the list in the task: the `RecentMatch` type
  (return type of `flattenRecentMatches`, previously private to `MatchH2HPanel`) and
  `MatchResult` = `"W" | "D" | "L"` (the element type used by `resultsTimeline`/`currentRun`).
- `resultsTimeline` mirrors `summarizeMatches` exactly and does **not** filter on match state:
  `POST /stats/h2h-matches` only returns finished matches (`h2h_matches.py:152,163`).
- Tests: `matchHistoryList.test.tsx` gained 3 cases (link present, friendly row unlinked, no
  link without `matchHref`) — 7 in the file; new `matchupSummary.test.ts` has 10 cases
  (perspective flip, "any opponent" mode, 2v2 subset + same-team exclusion, W-D-L/goals/ppm,
  teammates summary, flatten order, timeline, current run, id/name helpers).
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): 25 checks green at 390px and 1280px — profile Matches rows are links
  (`/live/19/match/106`), clicking opens the match page and the back chevron returns to
  `/profiles/1?tab=matches` with the Matches tab selected; friendly blocks (6 blocks, 16 rows)
  render no link; profile Overview recent matches, stats Player match history and the H2H duo
  history modal (2v2 → Duos → a duo rivalry) all link out.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (630 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U5.

---

## S1 — Stats IA: four sections, sub-views, filters, shared player, legacy URLs  ☑

All in the "New" layout (`frontend/src/pages/stats/StatsInsights.tsx` and friends). Classic
(`StatsPage.tsx` classic branch) is untouched until S4.

**Sections & URL.** `?view=` ∈ `overview | trends | h2h | player`; `?sub=` ∈
`table | positions | streaks | records | cups` (overview, default `table`) or
`players | duos` (h2h, default `players`). Tabs (lucide icons): Overview `LayoutGrid`,
Trends `LineChart`, H2H `Swords`, Player `UserRound`. Sub-views render as a `ChipGroup`
(`pages/stats/charts.tsx`) row directly under the `SectionTabs` — wrapping, so every
sub-view is visible on a phone. For H2H the chip row is shown only in 2v2 mode (Duos is
2v2-only); in other modes the effective sub is `players` and the URL is left alone.
Default view when nothing is given: `player` if `?player=` is set (existing rule), else
`overview`.

**Legacy mapping** — new pure module `frontend/src/pages/stats/statsNav.ts` with
`resolveStatsView(search: URLSearchParams, hash: string, state: unknown): { view; sub; legacy: boolean }`:
old `view` values `table|positions|streaks|records|cups` → `overview` + that sub; `stars` →
`player`; old classic `section` values `players|ratings` → overview/table, `trends` →
trends, `h2h` → h2h, `streaks` → overview/streaks, `stars|matches` → player; hash
`#trends|#stats-trends` or `state.focus === "trends"` → trends; `state.statsTab` as today.
When `legacy` is true, `StatsInsights` rewrites the URL once (`replace`) to the canonical
form. Unit-test it in `frontend/src/test/statsNav.test.ts`.

**Bodies.**
- Overview/table → `StatsTable` (unchanged). Overview/positions → `PositionsView`.
  Overview/streaks → `StreaksView`. Overview/records → `RecordsView`. Overview/cups →
  `CupsView`.
- Trends → `TrendsExplorer` (unchanged).
- H2H → `H2HView` with `subView` controlled from the URL (`sub`), default `players`
  (today `H2HView.tsx:53` defaults to `duos` — change it). Remove its internal `subView`
  state; it receives `sub` + `onSubChange`.
- Player → `PlayerProfile` followed by the club-stars block: refactor
  `pages/stats/StarsView.tsx` to export `StarsSection({ mode, scope, playerId })` (the rows
  and caption without the picker) and render it under a `section-head` "Club stars" inside
  the Player view. (S3 adds streak chips and the history toggle.)

**Filters per section.** `FILTERS` table in `StatsInsights.tsx`: overview/table
{mode, scope}; positions {mode}; streaks {mode, scope}; records {mode, scope}; cups {};
trends {mode, scope}; h2h {mode, scope}; player {mode, scope}. Render only the enabled chip
groups; when both are disabled render nothing (no empty label row).

**Shared player.** `H2HView.tsx` drops its local `selected` state (`:52`) and takes
`selectedId` / `onSelect` like `StarsView`/`PlayerProfile` (fallback chain stays: URL
`player` → self → first row, computed once in `StatsInsights`). Its `PlayerPicker`, matrix
row labels and opponent rows call `onSelect`. Result: picking a player in H2H and switching
to Player keeps the same player, and the URL carries it.

**Dashboard links.** `pages/dashboard/StandingsPreviewCard.tsx:16-17` →
`/stats?view=overview&sub=table` (drop `section=players`).
`pages/dashboard/TrendsPreviewCard.tsx:319` → `/stats?view=trends` with the same `state`
(drop the hash).

**DoD:** every former view is reachable: Table, Positions, Streaks, Records, Cups under
Overview; Stars under Player; `/stats?view=table` and `/stats?section=h2h` redirect to the
new URLs; filter chips hidden on Positions (Source) and Cups (both); player selection
survives H2H ↔ Player; `npm run check` green; 390px screenshots of each section.

**Deviations:** (implemented 2026-09-12, four commits: resolver, sections/sub-views,
filters, dashboard links)

- **Per planner instruction:** the Mode/Source chip groups moved into one new component
  `frontend/src/pages/stats/StatsFilters.tsx` (`{ mode, scope, onModeChange, onScopeChange,
  showMode, showScope }`) with a single render site in `StatsInsights`, positioned as before
  (above the `SectionTabs`). Encapsulating them makes the move that was still being decided a
  small follow-up — now approved and enqueued as **S5** (floating pill with native selects),
  which replaces this strip and reuses the `FILTERS` table. No pill was built here.
- `H2HView` receives `subView` but **no** `onSubChange`: the Players | Duos chips are that
  section's sub-view chip row and are rendered once by `StatsInsights` under the tabs (as the
  IA decision requires), so both internal `ChipGroup`s were deleted. `H2HView` keeps a local
  `mode === "2v2" ? subView : "players"` guard so it stays correct standalone. Its `myId` prop
  is gone (the fallback chain now lives in `StatsInsights`).
- `statsNav.ts` exports more than `resolveStatsView`: `subsFor` / `defaultSubFor` /
  `subForSection` (which sub a section opens with — a fitting one survives a section switch) and
  `canonicalStatsParams(search, view, sub)`, used by the legacy rewrite **and** by every tab/chip
  click, so `section` can never come back. The canonical URL always carries `sub` for sections
  that have sub-views, e.g. `/stats?view=overview&sub=table`.
- The legacy tables are `Map`s, not object literals, so `?view=toString` cannot resolve through
  the object prototype. An unknown `?section=` value still counts as legacy (it has to be
  stripped) and falls back to Overview.
- `legacy` is also true when a stale `section` param or a trends hash sits next to a canonical
  `?view=` — the rewrite has to strip them. `setSearchParams` drops the hash and the nav state by
  design; `TrendsExplorer` has already captured `trendsMetric`/`trendsView`/`trendsPerMatch` on
  mount, verified from the dashboard trends card.
- `StarsView.tsx` now exports **only** `StarsSection({ mode, scope, playerId })`; the default
  export (picker + rows) had `StatsInsights` as its single caller and would have been dead code.
- Row taps in Table/Records write `player` **and** `view` in one `setSearchParams` call
  (`goPlayer`): the old `onSelectPlayer(id); setTab("player")` pair issued two navigations from
  the same `searchParams` snapshot in one tick, so the second silently dropped the player.
- Club stars renders *after* `PlayerProfile` (i.e. below the match history), which is what this
  task specifies; S3's DoD order puts it above the history — S3 owns that move, together with the
  match-history toggle.
- `StandingsPreviewCard` also drops its now-redundant `state={{ statsTab: "table" }}`; the
  `TrendsPreviewCard` state is unchanged (only the hash became `?view=trends`), so the classic
  layout's `focus === "trends"` rule keeps working.
- Classic is untouched and still verified: `/stats`, `/stats?section=h2h|streaks`, the two new
  dashboard links and the trends state all land on the right classic tab (5 checks).
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): 54 checks at 390px and 1280px — every section and sub-view reachable,
  18 legacy URLs redirecting (incl. `#trends`, `?section=…`, param preservation) with Back
  leaving `/stats` for `/dashboard`, the filter matrix per section, and the player surviving
  H2H → Player → H2H; plus 4 dashboard-link checks.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (630 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5.

---

## S5 — Floating filter pill for Mode/Source, native selects (approved 2026-09-12)  ☑

**Why:** Roli wants the Mode/Source filters off the top of the section tabs and reachable
while scrolled down. Decision: a floating pill, built from **native `<select>` elements**
(iOS shows its wheel picker, desktop its dropdown — same idea as the shots entry,
`pages/live/TournamentCommentParts.tsx:393` with the `.select-field` class in
`frontend/src/styles.css:286`). No bottom sheet needed.

- New `frontend/src/pages/stats/StatsFilterPill.tsx`, the single render site is
  `StatsInsights.tsx`; it **replaces** S1's top-of-page `StatsFilters` strip (delete that
  component; no duplication).
- Placement: `fixed z-40` (above content, below modals `z-50` and toasts `z-[70]`),
  bottom-right: `right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]` on mobile
  (clear of the U2 bottom tab bar, same offset the toast uses) and `lg:right-6 lg:bottom-6`
  on desktop. Give the `StatsInsights` root `pb-16` so the pill never hides the last row.
- Look: capsule (`rounded-full border border-border-card-chip/60 bg-bg-card-outer/85
  backdrop-blur-md shadow-pop`), a lucide `SlidersHorizontal` icon (14px, muted) on the
  left, then one or two native selects styled as pill segments (transparent background,
  no border, `appearance-none`, `text-sm font-medium`, a tiny `ChevronDown` after each,
  a 1px vertical divider between them). `aria-label="Mode"` / `"Source"`. Options: Mode →
  Overall / 1v1 / 2v2; Source → Tournaments / Both / Friendlies. Add a `.select-pill`
  class in `styles.css` next to `.select-field` rather than inline styling.
- Visibility follows S1's per-section `FILTERS` table: only applicable selects render;
  when none apply (Cups) the pill is not rendered at all.
- Changing a select updates the URL exactly as the chips did (`mode`, `source` params).
- Add `frontend/src/test/statsFilterPill.test.tsx`: renders current values; `change`
  events call the handlers; per-config hiding; not rendered when nothing applies.

**DoD (isolated stack):** 390px — pill visible above the bottom bar on `/stats` showing
"Overall" and "Tournaments"; only Mode on Overview/Positions; absent on Overview/Cups;
`selectOption("1v1")` → URL gains `mode=1v1` and the table re-renders; still visible after
scrolling to the bottom of Positions; the old top strip is gone. 1280px — pill
bottom-right, content not covered. `npm run check` + `npm run build` green. Screenshots.

**Deviations:** (implemented 2026-09-12)

- `frontend/src/pages/stats/StatsFilters.tsx` is **deleted**; `StatsFilterPill.tsx` takes the
  same props (`mode`, `scope`, `onModeChange`, `onScopeChange`, `showMode`, `showScope`) and the
  same `FILTERS`-driven render site in `StatsInsights`, only moved to the end of the root element
  (it is `fixed`, so tree position is cosmetic). No S1 test referenced `StatsFilters`.
- The pill carries `role="group" aria-label="Stats filters"` so tests and Playwright can address
  the capsule itself; the two selects keep `aria-label="Mode"` / `"Source"`.
- Each select sits in a `relative` wrapper with the `ChevronDown` absolutely positioned over the
  select's right padding (`pointer-events-none`), so a tap anywhere on the segment — chevron
  included — opens the native picker. `.select-pill` reserves that space with `pr-5`.
- `.select-pill` also styles `option` (explicit `--color-text-normal` on `--color-bg-card-outer`):
  the transparent segment background would otherwise be inherited by the OS dropdown list. Focus
  is a 2px accent ring on `:focus-visible` only (a permanent ring on the always-visible pill would
  be noise); the themes' `color-scheme` keeps the native picker dark/light per theme.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **112 checks green**, the full matrix of `blue`/`light` × 390px/1280px —
  pill showing "Overall"/"Tournaments" on Overview·Table, Mode-only on Positions, absent on Cups,
  both selects on Trends/H2H/Player/Streaks, `selectOption("1v1")` → `mode=1v1` in the URL plus a
  changed table (same for `source=both`), the pill still fully in the viewport after scrolling
  Positions to the bottom with the last content line 26px above it (the new `pb-16`), no Mode/
  Source chip group left anywhere, 16px right gutter above the bottom bar at 390px and 24px/24px
  bottom-right with no bottom bar at 1280px, wrapper `position: fixed; z-index: 40`.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (630 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1.

---

## S2 — Matchup view + entry points  ☑

**The feature Roli asked for.** Backend needs no change: `POST /stats/h2h-matches`
(`backend/app/services/stats/h2h_matches.py`) already filters by `mode`, `scope`, and
`relation` with subset matching (`exact_teams: false` = "A and B on opposite sides,
whatever the partners").

**URL & state.** `frontend/src/pages/StatsPage.tsx`: add the `vs` param (positive int,
`""` clears) to the shared state and pass `vsId` / `setVs` down through `StatsInsights` to
`H2HView`. The matchup renders when `view=h2h`, `player` is set, `vs` is set and
`vs !== player`. Setting `vs` also sets `player` if the caller passes both. Clearing is
`patchParams({ vs: null })`. All `replace`, like every other stats param.

**Component** — new `frontend/src/pages/stats/h2h/MatchupView.tsx`
`({ mode, scope, leftId, rightId, rows, onBack })`:
- Header: ghost `Button` "← Head-to-head" (`onBack`), then a row with `AvatarCircle` +
  name, a muted "vs", `AvatarCircle` + name (names from `rows`; avatars via
  `usePlayerAvatarMap`).
- Relation chips (only when `mode !== "1v1"`): `ChipGroup` **Against** | **Together**
  (local state, default Against). Against → `getStatsH2HMatches({ mode, relation:
  "opposed", left_player_ids: [left], right_player_ids: [right], exact_teams: false,
  scope })`; Together → `{ mode, relation: "teammates", left_player_ids: [left, right],
  right_player_ids: [], scope }`. Query keys via `qk.stats.h2hMatches(...)`.
- Summary strip (helpers from U4; perspective `[left]` vs `[right]` for Against,
  `[left, right]` as a team for Together): tiles **Played**, **W-D-L** (green/amber/red
  like `HeadToHeadRows`), **Goals** `gf:ga`, **PPM**, **Win %**, **Current run**
  (`W3` / `D1` / `L2` / `—`), and a **Last 5** row of small result chips (oldest → newest).
- Matches: `section-head` "Matches · N", `ChipGroup` Compact | Details (local, default
  Compact), then `MatchHistoryList` with `focusId={left}`, `nameColorByResult`,
  `hideModePill={mode !== "overall"}`, `showMeta={details}`, `matchHref={tournamentMatchHref}`,
  clubs from `listClubs()`. Empty: "No matches between X and Y yet (mode · source)."
  Loading: `InlineLoading`; errors: `ErrorToastOnError`.

**Entry points.**
- `H2HView.tsx` Players sub-view: matrix cell click (`:345`) → open matchup (row player,
  column player) instead of just selecting; opponent rows (`:387`) → matchup (selected,
  opponent); Favorite / Nemesis cards → matchup; Top rivalries rows (`:436`) → matchup
  (`p.a`, `p.b`). Keep the row-label buttons as "select player".
- Top rivalries: add `ChipGroup` **Rivalry** | **Played** ordering (client-side sort of
  `pairs`) and a "Show all" / "Top 8" toggle (`Button variant="ghost" size="sm"`).
- `pages/profile/ProfileOverviewTab.tsx:74-…`: the Favorite and Nemesis cards become
  `Link`s to `/stats?view=h2h&player=<profile player>&vs=<opponent>` (pass the profile
  player id as a prop if not already available).
- `pages/live/MatchH2HPanel.tsx`: when `mode === "1v1"`, a small `Link` "All meetings →"
  under the summary card to `/stats?view=h2h&mode=1v1&source=both&player=<a>&vs=<b>`.
- The Duos sub-view keeps its existing duo-level history modal.

**Tests:** `frontend/src/test/matchupView.test.tsx` — render `MatchupView` with a mocked
`getStatsH2HMatches` (vi.mock of `../api/stats.api`) returning two tournaments; assert the
summary numbers and that the rows render; assert the Together request shape when toggled.

**DoD:** In the isolated stack at 390px and 1280px: H2H → tap the Roli/Flo matrix cell →
"Roli vs Flo" shows the same W-D-L as the matrix tooltip (Overall/Tournaments); switching
Mode to 1v1 and Source to Both changes the list and the summary consistently; back button
returns to the matrix with the same selected player; `/profiles/1` Rivals → matchup;
`/live/19/match/<1v1 match>` → "All meetings" → matchup with `source=both`.
`npm run check` green.

**Deviations:** (implemented 2026-09-12, three commits: view + H2H entry points,
profile/match-detail links, tests)

- `MatchupView` is rendered by **`StatsInsights`**, not from inside `H2HView`: it replaces the
  whole H2H body (and its Players | Duos chip row) while `?vs=` names another player, so
  `H2HView` only receives one new prop, `onOpenMatchup(leftId, rightId)`. `vsId` / `setVs` stop
  at `StatsInsights`, which owns the `{ leftId, rightId }` decision (`view=h2h`, a resolved
  player, `vs` set and different).
- `setVs(id, withPlayer?)` writes `vs` **and** `player` in one `setSearchParams` call — the same
  reason S1's `goPlayer` exists: two writes in one tick from the same `searchParams` snapshot
  silently drop one. Every entry point uses it (`onSetVs(rightId, leftId)`).
- Leaving the H2H section clears `vs` (`setView` and `goPlayer` delete it), so H2H → Player →
  H2H returns to the matrix instead of re-opening a stale matchup. In-view changes stay
  `replace`, so the in-view back button is the way back (browser Back leaves `/stats`), exactly
  as the Decisions section specifies.
- Header polish beyond the task text: the separator reads "vs" for Against and **"and"** for
  Together, and a muted caption under the names spells out the active filters
  ("Overall · Tournaments", "· as a team" when Together) — inside the matchup the Mode/Source
  values are otherwise only visible in the floating pill. The back button is a ghost `Button`
  with the lucide `ArrowLeft` icon + "Head-to-head" (no literal "←" glyph; lucide-only rule).
- Tiles are labelled **"Pts / match"** (not "PPM") to match `PlayerProfile`'s key numbers, and
  the Last-5 row renders only when there are results, showing however many exist (≤ 5,
  oldest → newest). "Matches · N" uses the summary's `played`, i.e. the same helper the tiles
  use — verified equal to the number of rows in the list.
- Favorite / Nemesis: both call sites got a local `RivalCard` (one in `H2HView`, one in
  `ProfileOverviewTab`) rather than a shared component — the markup differs (button vs `Link`)
  and so does the ppm formatting already in place (`pts_per_match.toFixed(2)` vs `fmtPct`).
  Without an opponent they stay non-interactive chips.
- Top rivalries: the Rivalry | Played chips sort client-side (Played falls back to the rivalry
  score on a tie); the Show all / Top 8 button only renders when there are more than 8 pairs
  (15 in the dev DB).
- The empty state also covers Together ("No matches with X and Y on the same team yet (mode ·
  source).").
- `MatchH2HPanel`'s "All meetings →" sits at the end of the summary card (right-aligned,
  `text-xs font-medium text-accent`, like the profile's "View all →") and is rendered only in
  1v1, as specified. The Duos sub-view modal is untouched.
- `matchupView.test.tsx` has 6 cases (not 3): opposed request shape, summary tiles + Last-5
  order, the grouped list with `/live/<t>/match/<m>` links, the teammates request shape after
  switching to Together, the hidden relation chips in 1v1, and the empty state + back button.
  It mocks `stats.api`, `clubs.api` and `playerAvatars.api`, so no network and no fetch stubs.
  Suite: 26 files / 224 tests green.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **98 checks green**, the whole list at 390px and 1280px — the Roli/Flo
  matrix cell (tooltip `19-7-5`) opening "Roli vs Flo" with an identical W-D-L (31 played,
  95:61, 2.06 ppm, 61%); Mode 1v1 + Source Both moving list *and* summary to 30 / 16-9-5 /
  107:71 / 1.90 / 53% with the list rows summing to 30 and friendly blocks appearing; the back
  button clearing `vs` and keeping `player=1` on the matrix; the Favorite chip and an opponent
  row opening their matchups; Rivalry|Played chips and Show all (8 → 15 rows); `/profiles/1`
  Rivals linking to `/stats?view=h2h&player=1&vs=2` with browser Back returning to the profile;
  `/live/19/match/104` → "All meetings →" (`…&mode=1v1&source=both&player=1&vs=2`) landing on
  the same 30 matches the panel summarises; the 2v2 Against (17, 11-4-2) / Together (8, 2-2-4,
  16:22, 1.00) toggle; the relation chips hidden in 1v1; the Players|Duos chips hidden in the
  matchup; the filter pill still floating over the matchup and no horizontal overflow.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (630 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1/S5.

---

## S3 — Player section completion + explainers  ☑

Folds the last Classic-only capabilities into the New layout so S4 can delete Classic.

- **Personal streak chips.** Extract the "Streaks · current / record" grid from
  `pages/profile/ProfileStatsSection.tsx:142-165` into
  `frontend/src/pages/stats/PlayerStreakChips.tsx` (`{ categories, globalCategories }`,
  lucide icons `Flame`/`Shield`/`Goal`/`Lock` like `StreaksView.tsx:15-20` — no new FA)
  and use it in both `ProfileStatsSection` and `PlayerProfile`. In `PlayerProfile` fetch
  `getStatsStreaks({ mode, playerId, scope, limit: 3 })` and
  `getStatsStreaks({ mode, scope, limit: 1 })` (mirror `pages/ProfilePage.tsx:72-122`).
- **Match history toggle.** `PlayerProfile.tsx:146-151`: `section-head` "Match history"
  gains a `ChipGroup` Compact | Details (local, default Compact) → `showMeta`; rows use
  `matchHref={tournamentMatchHref}` (U4).
- **Elo explainer.** `pages/stats/StatsTable.tsx`: an `Info` (lucide, 12px) icon button
  next to the Elo column header toggles a `panel-subtle text-[11px]` note under the
  controls with the text from `pages/stats/RatingsCard.tsx:68-74` (verbatim). Also show the
  same note under the chart in `trends/TrendsExplorer.tsx` when `metric === "elo"`.
- **Positions legend.** Port `InfoLegend` from `pages/stats/PlayersStatsCard.tsx:116-163`
  into `pages/stats/PositionsView.tsx` (lucide `Flag`/`Clock` instead of FA), toggled by an
  `Info` icon button in the "Tournament positions" section head.
- **Profile → full stats.** `pages/profile/ProfileStatsSection.tsx`: a `Link` "Full stats →"
  in the section head to `/stats?view=player&player=<targetPlayerId>`.

**DoD:** Player section shows, top to bottom: picker, header card, key numbers, profile
net + compare, club stars, streak chips, match history with toggle and clickable rows;
Elo note toggles in Table and appears for the Elo metric in Trends; Positions legend
toggles; `npm run check` green; 390px screenshot of the Player section.

**Deviations:** (implemented 2026-09-12, four commits: streak chips, player section,
explainers, profile link + plan)

- **Club stars moved into `PlayerProfile`** (S1 had rendered it from `StatsInsights` below
  the match history). `StatsInsights`' player branch is now a single `<PlayerProfile …/>`,
  and both new blocks (Club stars, Streaks) use the `card-outer` + `h2` shape of the
  section's other blocks instead of S1's `section-head`, so the Player section is one
  consistent stack of cards.
- `PlayerStreakChips` is a default export taking `{ categories, globalCategories }`; the
  markup, the category order and the "record right now" highlight (`border-accent`) are the
  Classic ones, with FA glyphs swapped for lucide `Flame`/`Shield`/`Goal`/`Lock` and a new
  `data-streak="<key>"` hook per chip so tests and Playwright can address one chip.
- In `PlayerProfile` the two streak requests follow the section's Mode/Source filters (the
  profile tab is fixed to overall/tournaments): keys `qk.stats.streaks(mode, "player-<id>",
  scope)` and `qk.stats.streaks(mode, 1, scope)`, distinct from `StreaksView`'s
  `(mode, 200, scope)`.
- The Elo note is **not** duplicated: new `frontend/src/pages/stats/explainers.tsx` exports
  `EloNote` (text copied verbatim from `RatingsCard.tsx:68-74`, which S4 deletes) and
  `InfoButton` (lucide `Info`, 12px, `aria-expanded`), used by the table, the trends chart
  and the positions legend.
- The Elo info button renders only in the full table (`showControls && !controlled`), not in
  the dashboard standings preview — that preview also shows the Elo column but has no
  controls area to open a note in.
- In `TrendsExplorer` the note sits under the chart and its "Pinch to zoom" hint and above
  the player legend, only while `metric === "elo"` (verified: note top 509 vs chart bottom
  471 at 390px).
- `PositionsView`'s legend is the Classic `InfoLegend` ported as-is (FA → lucide
  `Flag`/`Clock`), so it keeps its leading "Tournament positions" caption even though the
  section head above says the same thing; nothing was dropped from the legend.
- `PlayerProfile` has no `section-head` for the match history (it never had one): the `h2`
  became a `flex … justify-between` row carrying the `ChipGroup` (`aria-label="Match
  details"`, Compact default), the same chips the matchup view uses.
- `ProfileStatsSection` had no section head above the tiles; the "Full stats →" `Link` sits
  in a new head row labelled **Key numbers** (the label the stats Player section uses for the
  same grid) and is hidden when there is no target player.
- Tests: new `frontend/src/test/playerStreakChips.test.tsx` (3 cases — the four chips with
  current/record, the highlight when the current run equals the global record, no highlight
  for a zero run). Suite: 27 files / 227 tests green.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **71 checks green** at 390px and 1280px — the Player section in the
  required order (picker 138 → header 213 → key numbers 315 → profile net 527 → compare 811 →
  club stars 930 → streak chips 1494 → match history 1686 at 390px), 4 lucide streak chips
  with no FA glyph, Compact | Details switching 34 rows from 50px to 123px and adding 56 club
  crests plus the league lines, history rows linking to `/live/20/match/113` and opening it,
  the Elo note toggling above the table with the Classic wording and under the Elo trend
  (gone again for another metric), the positions legend toggling with best/worst, "not
  played", "winner" and the old→new bar, `/profiles/1?tab=stats` → "Full stats →" pointing at
  `/stats?view=player&player=1` and landing on the complete Player section, and no horizontal
  overflow.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint; unrelated,
  as already noted under F1/F2/U1/U4/U5/S1/S5/S2.

---

## S4 — Retire the Classic layout  ☑

Everything Classic-only now exists in the New layout (S1–S3). Delete:
- `frontend/src/pages/stats/PlayersStatsCard.tsx`, `TrendsCard.tsx`, `TrendsChart.tsx`,
  `charts/chartSvg.ts`, `charts/useChartScaling.ts` (only `TrendsChart` uses them) and
  `frontend/src/test/chartSvg.test.ts`; `HeadToHeadCard.tsx`, `StreaksCard.tsx`,
  `RatingsCard.tsx`, `StarsPerformanceCard.tsx`, `PlayerMatchesCard.tsx`,
  `TournamentPositionsGrid.tsx`, `StatsFilterBar.tsx`, `frontend/src/ui/layout/useStatsMode.ts`.
- `pages/stats/StatsControls.tsx`: every remaining importer only needs the `StatsMode`
  type. Create `frontend/src/pages/stats/statsMode.ts` exporting it, update all imports
  (`grep -rn "StatsControls"`), delete the file.
- `pages/stats/HeadToHeadRows.tsx`: delete exports no longer imported (`PairRow`,
  `OpponentRow` unless S2 reused them); keep `DuoRow`, `TeamRivalryRow`.
- `pages/StatsPage.tsx`: remove the experience switch, the classic branch, `FILTER_CONFIG`,
  `StatsFilterBar`, `section`/hash handling (legacy URLs are handled by `statsNav.ts`);
  it keeps owning `mode`, `source`, `player`, `vs` and renders `StatsInsights`.
- `pages/SettingsPage.tsx:235-258`: remove the "Stats layout" section and the
  `useStatsMode` import. `localStorage["stats-experience"]` is simply ignored from now on.
- `trendsMath.ts`, `usePlayerColors.ts`, `TournamentLaurelMarkers.tsx`, `PlayerPicker.tsx`
  stay (still used).
- `frontend/src/styles.css`: leave as is (position colour classes are still used by the
  legend/positions view).

**DoD:** `git grep -n "stats-experience\|StatsControls\|PlayersStatsCard\|HeadToHeadCard\|TrendsChart"` →
no hits in `frontend/src`; `npm run check` + `npm run build` green; `/stats?section=h2h`
still lands on H2H; 390px screenshot of `/settings?tab=appearance` shows only Theme.

**Deviations:** (implemented 2026-09-12, three commits: type move, deletion, cleanup)

- `StatsControls.tsx` kept a one-commit transitional `export type { StatsMode }` re-export so the
  Classic cards still compiled between the type move and the deletion; both are gone now. The 14
  surviving files import the type from the new `pages/stats/statsMode.ts`.
- `HeadToHeadRows.tsx`: `PairRow` and `OpponentRow` are deleted — S2 did **not** reuse them
  (`H2HView` has its own `RivalCard` and renders opponent rows itself). `RowShell`, `DuoRow` and
  `TeamRivalryRow` stay; the `StatsH2HPair` / `StatsH2HOpponentRow` type imports went with the two
  rows, `pct` / `normalizeTeamRivalryForFocus` / `fmtInt` are all still used.
- `StatsPage.tsx` lost more than the task named, all of it Classic-only: `useLocation` + the
  hash/`state.focus` trends handling (`statsNav.ts` owns it), the `listPlayers` query,
  `usePlayerAvatarMap` and `useMemo` (fed the Classic filter bar's avatar row), `useAuth` +
  `effPlayerId` (the self-fallback lives in `StatsInsights` since S1), `SectionTabs` / `TABS` /
  `TabKey` and the lucide icon imports. `MODE_VALUES`, `SCOPE_VALUES`, `patchParams` and the four
  setters (`mode`, `source`, `player`, `vs`) are unchanged, so the page is 67 lines instead of 166.
- `SettingsPage.tsx` also dropped its now-unused `SegmentedSwitch` import (the Stats layout switch
  was its only user on that page).
- Rule 7 truthfulness fix in `AGENTS.md` §2: the `src/pages/` bullet still listed the Classic tab
  names ("stats (tabs: players, trends, h2h, streaks, ratings, stars, matches)"); it now names the
  one layout and its four sections. D1 re-checks.
- **Finding for T1/D1:** `trendsMath.ts` stays as the task says (`pooledPpm`,
  `buildPlayerColorMap`, `colorForIdx`, `pointsForPlayerInMatch` are live), but with
  `TrendsChart`/`TrendsCard`/`chartSvg` gone, `avgLast`, `clampWindow`, `dist2`,
  `monthTicksBetween` and the `SeriesPoint` type are only referenced by
  `src/test/trendsMath.test.ts`. Left in place — removing them would delete passing tests — but
  they are app-dead and worth a decision in T1/D1.
- `styles.css` untouched as instructed; no primitive became orphaned (`CollapsibleCard`,
  `AvatarButton`, `StarsFA`, `CupOwnerBadge`, `SegmentedSwitch`, `TournamentLaurelMarkers`,
  `usePlayerColors`, `PlayerPicker`, `matchHistory.ts` all keep other callers — checked with
  `git grep` before each deletion).
- 15 files deleted (4,502 lines) plus 79 lines from `HeadToHeadRows.tsx` and the 28-line
  settings section; one file added (`statsMode.ts`). Suite: 27 files / 227 tests → **26 files / 207 tests**, i.e.
  exactly the 20 cases of the deleted `chartSvg.test.ts`. `npx tsc -p tsconfig.json --noEmit`,
  `npm run check` and `npm run build` green; both DoD greps return nothing in `frontend/src`.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **50 checks green** at 390px and 1280px — `/stats?section=h2h` rewritten
  to `/stats?view=h2h&sub=players` with the H2H tab active and the matrix rendered, `/stats`
  landing on Overview · Table, `/settings?tab=appearance` showing exactly one section head
  ("Theme") and no "Stats layout" string, the other legacy URLs (`?view=table`, `?view=stars`,
  `?section=streaks`, `#trends`) still mapped, every section/sub-view rendering a body, only the
  four new tabs in the strip, no horizontal overflow and no console errors. A stale
  `localStorage["stats-experience"] = "classic"` is ignored, as planned.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (629 kB
  `index-*.js`); the `StatsPage` chunk itself is now 73 kB / 20.6 kB gzip.

---

## U6 — Per-destination last page memory (enqueued 2026-09-12 from parked idea 1)  ☑

**Goal:** tapping a top-level destination (bottom bar, desktop sidebar, mobile drawer)
returns to the last page the user had open inside that destination — not its root. Works in
every direction and for every subpage: `/live/:id?tab=…`, `/live/:id/match/:mid`,
`/profiles/:id?tab=…`, `/stats?view=…&sub=…&player=…&vs=…`, `/friendlies?tab=…`,
`/dashboard?tab=cups`, `/clubs?tab=…`.

- New `frontend/src/ui/shell/lastLocation.ts` (pure, unit-tested):
  - `rememberLocation(pathname, search)` → finds `activeDest(pathname)`
    (`ui/shell/navConfig.tsx`); if none (login, 404, settings) do nothing; strip one-shot
    params (`unread`, `comment`, `entry`) from `search`; store
    `{ [destKey]: { path: pathname+search, ts } }` under `localStorage["lk:dest-last"]`
    (same 12h TTL idea as `useLocationRestore.ts`; localStorage so the installed PWA keeps
    it across relaunches). Wrap storage access in try/catch.
  - `resolveDestination(dest, currentPathname)` → if the destination is the active one
    (`activeDest(currentPathname)?.key === dest.key`) return `dest.to` (second tap = root);
    else the remembered path if present and not expired; else `dest.to`.
  - `forgetDestination(destKey)` and `forgetLocation(pathname)` (clears the entry whose
    stored path equals the given one).
- `frontend/src/ui/shell/AppShell.tsx`: a `useRememberLocation()` hook (next to
  `useLocationRestore()`) calling `rememberLocation` on every location change.
- Consumers: `BottomTabBar.tsx`, `Sidebar.tsx`, `MobileChrome.tsx` (drawer) compute each
  link's `to` via `resolveDestination`. Tournaments item precedence: remembered path →
  live shortcut (U2 behaviour) → `/tournaments`. The drawer's separate "Live now" entry is
  unchanged. Tapping the active destination while already at its root keeps U2's
  scroll-to-top.
- Foolproofing: `NotFoundPage` calls `forgetLocation(location.pathname + location.search)`
  on mount; `LiveTournamentPage` (tournament not found / deleted → it already navigates to
  `/tournaments`) and `ProfilePage` (player not found) call `forgetLocation` for their
  current URL too, so a deleted tournament or player never traps a tab. A remembered path
  is always validated by `activeDest` before use.
- Tests: `frontend/src/test/lastLocation.test.ts` (remember/resolve/strip/TTL/forget);
  extend `bottomTabBar.test.tsx` (href uses the remembered path; the active item links to
  its root).

**DoD (isolated stack, 390px and 1280px):** `/live/19?tab=matches` → tap Stats → tap
Tournaments → back on `/live/19?tab=matches`; `/profiles/1?tab=guestbook` → Dashboard →
Players → same profile and tab; `/stats?view=h2h&player=1&vs=2` → Friendlies → Stats →
same matchup; on `/live/19` tapping the active Tournaments item goes to `/tournaments`;
reload keeps the memory; `/live/99999` (404 / not found) → tap Tournaments → root, not
the dead URL. `npm run check` + `npm run build` green.

**Deviations:** (implemented 2026-09-12, three commits: store, shell wiring, foolproofing)

- The three shells share one hook, new `frontend/src/ui/shell/useDestinationLinks.ts`
  (`{ dest, to, isActive }[]`), so bottom bar, sidebar and drawer cannot drift. Its
  `hasLiveEntry` option carries the only real difference: shells with their own "Live now"
  entry (sidebar, drawer) let that entry own the active state on the live page and keep the
  plain `/tournaments` fallback, while the bottom bar keeps U2's live shortcut as the
  fallback *behind* the remembered page. `rememberLocation` is mounted through a second
  small hook, `useRememberLocation.ts`, next to `useLocationRestore` (keeps `lastLocation.ts`
  pure and React-free).
- `forgetLocation(url)` also blocks that URL from being remembered again for the rest of the
  session (module-level set, `resetForgottenPaths()` as the test seam): React runs a page's
  effects *before* the shell's remember effect, so a plain delete would be undone by the very
  navigation that revealed the dead page.
- `forgetLocation` normalises the URL it is given (same one-shot stripping as
  `rememberLocation`) before comparing it with the stored path, otherwise
  `/profiles/1?tab=guestbook&entry=7` would never match its stored form.
- The "not found" hooks fire only on a real **404** (`ApiError.status === 404` from
  `tQ.error` / `profileQ.error`): a transient 5xx or an offline blip must not wipe the memory.
  `LiveTournamentPage` also forgets the current URL in `deleteMut.onSuccess`, just before it
  navigates to `/tournaments`.
- Stored paths are validated twice: `activeDest` must still own them and they must start with
  a single `/` (no protocol-relative `//host`), as `LoginPage` does for its `from` state.
- `BottomTabBar` scrolls to top only when the active item's target *is* the current pathname;
  tapping the active destination from a subpage (e.g. `/live/19`) now navigates to its root
  instead. The sidebar/drawer never had scroll-to-top and still don't.
- `lastLocation.ts` exports `normalizePath` and `resetForgottenPaths` beyond the four functions
  the task names (URL normalisation is worth testing on its own; the reset keeps the
  session-level blocklist out of test cross-talk).
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **53 checks green** at 390px and 1280px — all three round trips
  (`/live/19?tab=matches`, `/profiles/1?tab=guestbook`, `/stats?view=h2h&player=1&vs=2`),
  second-tap-to-root on `/live/19`, memory surviving a reload, `/live/99999` and
  `/tournaments/nope-404` and `/profiles/99999` falling back to the destination root, the
  drawer at 390px and the sidebar at 1280px resolving the same remembered URLs, and the
  bottom bar still scrolling to top at a destination root. Note: tournament 20 was live in the
  DB copy, so the bottom bar's fallback after forgetting a dead URL is `/live/20` (the U2
  shortcut) — re-checked with the live endpoint stubbed to `null`, where it is `/tournaments`.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (631 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1/S5.

---

## Design audit findings (Fable, 2026-09-12 — basis for S6/S7/DS1–DS7)

Roli: "the app has no clear design idea but rather scattered styles for similar things"; the score
field "looks super cheap"; the filter pill is "ugly". Audit of `styles.css` (780 lines),
`themes/*.css`, all primitives and every page at 390/1280px in blue + light:

- **Three generations of surface classes coexist** — "Cards and Panels" (`card-outer/inner/
  inner-flat/chip`, `panel/panel-subtle/panel-inner/card-subtle`), "Sleek-minimal" (`surface`,
  `surface-2`, `hairline`, `eyebrow`) and "Flat list-first" (`section-label`, `row`,
  `list-divided`). 12 surface classes, `card-chip` used 122× — mostly as a *box* (score, stat
  tile), not a chip. Radii: `rounded-full` 67, `xl` 41, `lg` 19, `2xl` 9, plus `sm/md/[2px]`;
  nested radii mismatch (chip `lg` inside panel `xl` inside card `2xl`).
- **Typography:** 111× `text-[11px]`, 15× `[10px]`, plus `[15px] [13px] [12px] [9px] [8px] [7px]`.
  No scale.
- **Raw palette colours bypass the themes:** `text-amber-300` ×14, `text-red-300` ×9,
  `bg-red-500/15`, `bg-amber-500/15`, emerald/yellow one-offs across 14 files (W-D-L strings,
  score result boxes). In the light theme these are light-on-light. No win/draw/loss tokens exist.
- **Four different score renderings:** `MatchOverviewPanel` (boxed `0 : 0`, muted colon,
  `border-y` rules, three pills `leg 1 · 1v1 · playing`, names pushed to the panel edges — on
  desktop 900px apart), `MatchRowWithClubs` (green/red/amber tinted chip box), `MatchList`
  (`card-chip` box, `text-base`/`text-lg`), `OverviewSection` mini. Empty clubs show five hollow
  stars.
- **Selection idioms:** `ChipGroup` (charts.tsx), `ToggleChip` (controls.tsx), `SegmentedSwitch`
  (FA icon strings), `SectionTabs`, raw `icon-button`/`btn-base` classes, `FilterSelect`.
- **Icons:** 35 files still use Font Awesome next to lucide.
- **Dead CSS:** ≥ 20 unused classes (`subnav-*` morph animations, `nav-link*`, `main-nav-*`,
  `eyebrow`, `surface-2`, `hairline-b`, `sheet-shell`, `page-slide-*`, `card-subtle`,
  `pill-green`, `accent-text`, `symbol-margin-to-text`, `page-x-bleed`, `no-scroll-anchor`).
- **Section headers:** `section-label` (11px uppercase) vs `Card` `h2` vs `CardSection` div vs
  `card-outer + h2` (S3) — four ways.

Decisions are written in `DESIGN.md` (canon). The DS tasks migrate the code to it, mechanically.

---

## S6 — Cups page reorganised: reigns, streak lengths, records  ☑

**Why:** Roli: "not a big fan of the cups stats page… reorganise. also, streak lengths and
longest cup streak should be visible."

Data: `GET /cup?key=` (`api/cup.api.ts`) gives `owner`, `streak.tournaments_participated`
(current reign incl. the winning tournament), `streak.since`, and `history[]` in chronological
order, each `{tournament_id, tournament_name, date, from, to, streak_duration}` where
`streak_duration` is the **outgoing** holder's reign length (tournaments held, incl. the win).
No backend change needed.

- New pure module `frontend/src/pages/stats/cupReigns.ts` (+ `test/cupReigns.test.ts`):
  `buildReigns(cup: CupResponse): Reign[]` → `{ holder: PlayerRef, startTournamentId, startName,
  startDate, endTournamentId|null, endDate|null, tournaments: number, current: boolean,
  tookFrom: PlayerRef|null, lostTo: PlayerRef|null }` (past reign length = the *next* history
  item's `streak_duration`; current reign = `streak.tournaments_participated`; days held =
  end (or today) − start). `cupRecords(reigns)` → `{ longest: Reign|null, mostTitles:
  {player, count}[], mostTournamentsHeld: {player, count}[], currentIsRecord: boolean }`.
  `perPlayer(reigns)` → rows `{player, titles, tournamentsHeld, longestReign, daysHeld}`.
- New `frontend/src/pages/stats/CupDetail.tsx` rendered by `CupsView.tsx` per cup (dashboard
  `CupCard` stays for the dashboard):
  1. **Holder card** (`card`): cup colour dot + name + era pill right; avatar + holder name +
     `Holding since <date> · N tournaments · M defended` + a `Current reign` `StatTile`-style
     number with `record` chip when it equals the longest reign.
  2. **Records** row of three `StatTile`s: *Longest reign* (N tournaments · holder · from–to),
     *Most titles* (player · count), *Most tournaments held* (player · count). Ties: list
     names comma-separated.
  3. **Reign timeline**: one horizontal bar (`h-3 rounded-full overflow-hidden`), segments
     proportional to `tournaments`, coloured with `usePlayerColors().colorOf(holder.id)`,
     current reign segment with a subtle pulse ring; legend below (avatar chips with the
     player's colour dot); tap a segment → scroll to that reign in the list.
  4. **Reigns list** (`list-divided`, newest first): each row: avatar, `Holder` (colour), `×N`
     reign chip (tournaments held), `took it from X` / `claimed it`, `tournament · date`,
     `ended by Y` when lost; `Link` to `/live/{startTournamentId}`. "Show all" after 8.
  5. **Per player** table: Player · Titles · Tournaments held · Longest reign (sortable by
     tapping headers, default tournaments held desc). Rows → `/stats?view=player&player=`.
- Dashboard `CupCard`: add the `×N` reign chip to each history row (same helper), nothing else.
- Follow `DESIGN.md` (surfaces `card`/`inset`, `StatTile` — if DS1 has not landed yet, create
  `StatTile` in `ui/primitives/StatTile.tsx` exactly as §7 describes and DS1 will reuse it).

**DoD:** `npm run check` + build green; 390px + 1280px screenshots of the Cups sub-view in
blue and light; numbers cross-checked against the history text (e.g. "ended Roli's
2-tournament reign" → Roli's reign row shows ×2).

**Deviations:** (implemented 2026-09-12, three commits: helper + tests, `CupDetail`,
dashboard chip)

- Reign semantics were verified against `backend/app/services/cup.py` before the helper was
  written: `streak_duration` on a transfer is the **outgoing** holder's count, the running
  reign is `streak.tournaments_participated`. `buildReigns` therefore reads a past reign's
  length from the **next** history item. Cross-checked at runtime: the Bauernkranz history
  line "ended Roli's 2-tournament reign" sits next to Roli's `×2` reign row.
- `CupsView` no longer renders its own `section-head` (cup dot + name) around a `CupCard`:
  the dot, the name and the era pill are part of `CupDetail`'s holder card, as the task's
  item 1 specifies, so each cup has exactly one title. The dashboard keeps `CupCard`.
- The holder line is split instead of repeating itself: "Holding since <date>" stays on the
  identity line, the reign length is the `Current reign` tile's value (`×N`) and the defenses
  are its hint ("M defended").
- `cupRecords().longest` stays a single `Reign` (earliest wins a tie, as specified), but the
  *Longest reign* tile names **every** holder tied for it and shows "N reigns tied" instead of
  a date span when more than one reign shares the record (dev data: Atzi and Roli, ×2 each).
- Reign rows carry the holder's stable colour as a **dot** before the name (the convention the
  rest of stats uses — Trends/Player legends) instead of tinting the name text: at 390px in the
  light theme a 56%-lightness hue on white is unreadable. The timeline, its legend and the row
  dots all share the same colour, so the association still reads.
- The `×N` chip uses the accent chip style for the **running** reign (in `CupDetail` and on
  the dashboard row) and the neutral `bg-bg-card-chip` style otherwise; it is the same
  `buildReigns` output in both places (dashboard rows look their reign up by
  `startTournamentId`).
- Per player table: the four sortable columns of the spec (headers `Player · Titles · Held ·
  Longest`, with a legend line under the table because "Tournaments held" does not fit a
  phone header). `daysHeld` — which `perPlayer` computes anyway — is a muted second line in
  the player cell, so no information is dropped. Column ties fall back to the helper's own
  order (held, then titles, then name) so the default view equals `perPlayer`'s. A row click
  navigates with `useNavigate()` (the `StatsTable` idiom) and pushes
  `/stats?view=player&player=<id>`.
- Timeline segments are `flex-grow` proportional to `tournaments` with a 6px floor; the
  running segment's "pulse ring" is an `animate-pulse` inset box-shadow overlay (no new
  keyframes, no new CSS classes). Tapping a segment expands "Show all" first when the reign
  is below the 8-row fold, then centres the row.
- `reignDays` and `perPlayer` take an injectable `today` so day counts are unit-testable;
  `test/cupReigns.test.ts` has 13 cases over the dev DB's Bauernkranz fold plus the empty and
  single-reign edge cases.
- New `ui/primitives/StatTile.tsx` per `DESIGN.md` §7 (`{label, value, hint, accessory,
  className}`; the label row wraps so a narrow tile drops the accessory chip to its own
  line). As instructed, surfaces use the pre-DS1 class names — `card-outer` for the level-1
  card, `panel-subtle p-3` for insets — so DS3 can migrate them mechanically; no new CSS
  classes and no `text-[Npx]` were added.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **108 checks** on the Cups sub-view over the full `blue`/`light` ×
  390px/1280px matrix (holder card, era pill, all five Bauernkranz reign rows with their ×N
  and took-from/ended-by text, the three record tiles, 5 proportional timeline segments with
  the pulse ring on the current one, the per-player table and its default order, the
  Lorbeerkranz cross-check, no horizontal overflow, segment tap → row centred, row tap →
  `view=player&player=3`, and the `record` chip with the running streak stubbed to 2), plus
  **28 checks** on `/dashboard?tab=cups` (every history row carries a ×N chip, exactly one
  accent chip, `×2` next to "ended Rumpi's 1-tournament reign").
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (633 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1/S5.

---

## S7 — Filter pill v2: compact, icon-forward, popover (no native selects)  ☐

**Why:** Roli: "the pill for stats filtering is ugly af… make it smaller (icons?). you don't have
to use native selectors but make sure it fits well to the rest of the app."

Replace `StatsFilterPill.tsx` internals per `DESIGN.md` §9:
- Capsule `h-9 rounded-full pl-2.5 pr-3` on `card`-style surface with `backdrop-blur-md
  shadow-pop`; content: `SlidersHorizontal` 14px muted → mode token (`All`/`1v1`/`2v2`,
  `text-xs font-semibold`) → hairline dot separator → source icon 14px (`Trophy` / `Layers` /
  `Handshake`, with `sr-only` text). Whole capsule is one `button` (`aria-haspopup="dialog"`,
  `aria-expanded`). Target width ≈ 100px.
- Popover: rendered in a body portal (pattern: `ui/FilterSelect.tsx`), anchored above the pill
  (`bottom = viewportHeight − pillTop + 8`, right-aligned), `card` surface `p-3 w-64
  space-y-3`, two labelled `ChipGroup`s ("Mode": All/1v1/2v2 — label the overall option
  "All" in the UI, the URL value stays `overall`; "Source": Tournaments/Both/Friendlies); only
  the groups that apply to the section are shown. Selecting a chip updates the URL
  immediately; the popover stays open until tap-outside/Escape/re-tap. Enter/Space open it;
  focus moves into the popover; Escape returns focus to the pill. `framer-motion` fade/scale
  in (app already uses it, see `ui/motion/motion.ts`).
- Remove the `.select-pill` CSS and the native selects. Keep the S5 placement, z-index and
  the `pb-16` on the stats root.
- Update `test/statsFilterPill.test.tsx` (button label reflects values; opening shows the
  groups; chip click calls the handler; hidden groups per config; Escape closes).

**DoD:** 390px + 1280px screenshots in blue and light (closed and open); `npm run check` +
build green; keyboard flow verified in Playwright.

**Deviations:**

---

## DS1 — Design foundations: tokens, surface canon, primitives, dead CSS  ☐

Everything later DS tasks build on. Follow `DESIGN.md` exactly.
- Tokens: add `--color-win/draw/loss/live` to `themes/defaults.css` (+ `light.css` overrides,
  and check `dark.css`, `red.css`, `green.css` inherit sensibly); map in `tailwind.config.cjs`
  (`win`, `draw`, `loss`, `live` via the `cssVar` helper).
- `styles.css`: add `.card`, `.inset`, `.chip`, `.text-micro` per `DESIGN.md` §3/§5 (keep the
  old classes for now — DS3 migrates and deletes them); delete the dead classes listed in the
  audit (verify each with `git grep` first); remove the `select-pill` block if S7 already did
  not. Keep `pos-*`, `stepper*`, `input-*`, `select-field`, `focus-ring`, `no-scrollbar`,
  `comment-attn`, `live-*`, `delta-*`, `pull-refresh-indicator`, `skeleton`.
- New primitives: `ui/primitives/ScoreLine.tsx` (§8, all three sizes, `result`/`resultBadge`,
  scheduled rendering, leader emphasis, 2v2 stacked names), `ui/primitives/StatTile.tsx`
  (§7; reuse S6's if it exists), `ui/primitives/Chip.tsx` (move `ChipGroup` from
  `pages/stats/charts.tsx` here + a single `Chip`; re-export from charts.tsx for now),
  `ui/primitives/Stars.tsx` (lucide, same props as `StarsFA`). Tests: `scoreLine.test.tsx`
  (numerals, scheduled dash, leader emphasis, result colouring, badge), `statTile.test.tsx`.
- `AGENTS.md` §9 conventions: add "Follow `DESIGN.md`" and the §12 table row for it.

**DoD:** `npm run check` + build green; a Storybook-style scratch page is NOT needed — verify
`ScoreLine` visually by temporarily rendering it in the isolated stack via Playwright
`page.evaluate` is impractical; instead DS2 is the visual gate. Nothing user-visible changes
in DS1 except deleted dead CSS.

**Deviations:**

---

## DS2 — Score display: one `ScoreLine`, hero panel redesign  ☐

Roli's top complaint. Replace every score rendering with `ScoreLine` and rebuild the hero.
- `ui/primitives/MatchOverviewPanel.tsx` → structure from `DESIGN.md` §8 (meta line + status
  pill, `ScoreLine hero`, odds line, two side columns; no `border-y`; stars only with a club;
  `surface` prop becomes `"card" | "inset" | "none"`). Callers: `CurrentMatchPreviewCard`
  (dashboard → `card`), `OverviewSection`, `CurrentGameSection`, `MatchDetailPage` edit
  preview, `FriendlyMatchCard` preview, `matchOverviewPanel.test.tsx` (update).
- `pages/stats/MatchHistoryList.tsx` `MatchRowWithClubs` → `ScoreLine md` (compact) /
  details layout unchanged below it; result via the focus side numeral colour; drop the tinted
  chip box and raw palette classes.
- `pages/live/MatchList.tsx` compact + details rows → `ScoreLine md`/`sm`; keep the status dot,
  `#n`, leg, reorder/swap actions and odds.
- `OverviewSection` "Next matches" and the standings mini table: `ScoreLine sm` where a score
  is shown; `MatchH2HPanel` recent meetings, `h2h/MatchupView` list and `RecordsView` rows use
  the same list row.
- Dashboard: the current-match card gets `card` surface and the tournament name as its
  `h2`; "Tap to open live tournament." becomes a trailing chevron row.

**DoD:** Playwright at 390px + 1280px, blue + light: dashboard live card, `/live/<live>?tab=
current|overview|matches` (compact + details), `/live/<id>/match/<mid>` (H2H + edit preview),
`/friendlies`, `/profiles/1?tab=matches`, matchup, records — screenshot each; names hug the
score; no boxed scores anywhere (`git grep "card-chip" pages/stats/MatchHistoryList.tsx
pages/live/MatchList.tsx ui/primitives/MatchOverviewPanel.tsx` → 0). `npm run check` + build.

**Deviations:**

---

## DS5 — Semantic colours: replace raw palette usages  ☐

- `git grep -nE "(text|bg|border|ring)-(amber|red|emerald|green|yellow|zinc)-[0-9]+" frontend/src`
  → every hit in components becomes a token class (`text-win/draw/loss`, `bg-win/15`, `text-live`,
  `text-delta-up/down`, or a `status-*` token). W-D-L strings everywhere (`HeadToHeadRows`,
  `H2HView`, `MatchupView`, `StandingsTable`, `PlayerProfile`, `RecordsView`, `StreaksView`,
  `ProfileOverviewTab`, dashboard) use `text-win`/`text-draw`/`text-loss`.
- Position buckets `pos-best…pos-worst`/`pos-winner` keep their hue logic but move to tokens or
  to `--pos-*` variables with light overrides in one place (no raw palette in `styles.css`
  either, except the `pos-tile` hsl formula).
- `CupOwnerBadge`, `StreakPatches`, `TournamentLaurelMarkers`: colours through tokens/cup vars.

**DoD:** the grep returns 0 hits under `frontend/src` (excluding `themes/`); light-theme
screenshots of H2H, matchup, standings, profile overview show readable W/D/L; `npm run check`.

**Deviations:**

---

## DS7 — Lucide only: migrate the 35 Font Awesome files, drop the dependency  ☐

- Replace every `<i class="fa-…">` with the lucide equivalent (size 14/16/18 per context):
  `fa-crown`→`Crown`, `fa-trophy`→`Trophy`, `fa-star*`→`Stars` primitive (DS1),
  `fa-circle-notch fa-spin`→`Loader2 className="animate-spin"`, `fa-comment(s)`→
  `MessageSquare`/`MessagesSquare`, `fa-futbol`→`Goal`, `fa-bullseye`→`Target`, `fa-bell`→`Bell`,
  `fa-envelope`→`Mail`, `fa-xmark`→`X`, `fa-pen`→`Pencil`, `fa-trash`→`Trash2`, `fa-sign-in`→
  `LogIn`, `fa-arrow-rotate-right`→`RotateCw`, `fa-face-smile`→`Smile`, `fa-heart-crack`→
  `HeartCrack`, `fa-layer-group`→`Layers`, `fa-thumbs-up/down`→`ThumbsUp/Down`, `fa-image`→
  `Image`, `fa-flag`→`Flag`, `fa-clock`→`Clock`, `fa-fire-flame-curved`→`Flame`, `fa-shield`→
  `Shield`, `fa-lock`→`Lock`, `fa-dice`→`Dices`, `fa-hashtag`→`Hash`, `fa-handshake`→`Handshake`,
  `fa-user*`→`User`/`Users`, `fa-check`→`Check`, `fa-chevron-*`→`Chevron*`, `fa-plus/minus`→
  `Plus`/`Minus`, `fa-magnifying-glass`→`Search`, `fa-filter`→`Filter`, `fa-database`→
  `Database`, `fa-list`→`List`, `fa-table-cells`→`Grid3x3`, `fa-object-group`→`Layers`.
  Anything not in this list: pick the closest lucide icon and note it in Deviations.
- `SegmentedSwitch` `icon?: string` → `icon?: ReactNode`; `AvatarButton`/`StatsAvatarSelector`
  `fallbackIconClass` → `fallbackIcon?: ReactNode`.
- Remove `import "@fortawesome/fontawesome-free/css/all.min.css"` from `main.tsx` and
  `npm uninstall @fortawesome/fontawesome-free`; `AGENTS.md` §9/§10 updated.

**DoD:** `git grep -n "fa-" frontend/src` → 0; `npm ls @fortawesome/fontawesome-free` → empty;
`npm run check` + build; 390px screenshots of tournaments list (crowns), live comments (action
icons), players page, profile header, clubs page (editor UI verified by reading code).

**Deviations:**

---

## DS6 — Selection controls & buttons on the canon  ☐

- `ToggleChip` (`pages/stats/controls.tsx`) → `Chip` from DS1; `ChipGroup` imports switch to
  `ui/primitives/Chip.tsx`; delete the re-export in `charts.tsx` and `controls.tsx`'s copy.
- `SegmentedSwitch`: track `rounded-xl` (not 2xl), segment `rounded-lg`→`rounded-[10px]` is NOT
  allowed — use `rounded-lg` inside only via the primitive's own class (documented exception)
  or make the indicator `rounded-xl` with `inset-y-0.5`; heights `h-8`; selected style identical
  to `Chip` (accent/15 + ring).
- Raw `icon-button`, `btn-base`, `btn-ghost`, `btn-solid` class usages in pages → `Button`
  (`iconOnly` where applicable). Delete the classes only if `git grep` is 0 afterwards
  (`Button` itself may keep using `btn-*` internally — that is fine).
- `FilterSelect` stays (menus), restyled to `inset`/`card` surfaces.

**DoD:** `git grep -nE "icon-button|btn-base|btn-ghost|btn-solid" frontend/src/pages frontend/src/ui --exclude Button.tsx` → 0; screenshots of live Current tab actions, comments composer, friendlies editor; `npm run check` + build.

**Deviations:**

---

## DS3 — Surface & radius migration  ☐

Mechanical, page by page (one commit per page group): `card-outer`→`card`; `card-inner`,
`card-inner-flat`, `CardSection`, `panel*`, `card-subtle`, `surface` (as a box)→`inset`;
`card-chip` as a box→`inset`, as a tag→`chip`; `rounded-lg`/`rounded-sm`/`rounded-md` (except
positions tiles)→per §4; nested card-in-card flattened to `card` + `inset` or to a flat
`section-label` block. `Card`/`CardSection` primitives updated to emit the new classes;
`Modal` uses `card`. At the end delete the retired classes from `styles.css` (grep 0).

**DoD:** `git grep -nE "card-outer|card-inner|card-inner-flat|card-subtle|panel-subtle|panel-inner|\bpanel\b|surface-2|\bsurface\b" frontend/src` → 0 (except the class definitions being deleted in the same commit); all pages screenshotted at 390px in blue + light with no visual regressions beyond the intended flattening; `npm run check` + build.

**Deviations:**

---

## DS4 — Typography & section headers on the scale  ☐

- Replace every `text-[Npx]`: `[11px]`/`[12px]`/`[13px]`→`text-xs` or `text-sm` by context,
  `[15px]`→`text-base`, `[10px]`/`[9px]`/`[8px]`/`[7px]`→`text-micro` (badges) or `text-xs`;
  `section-label` becomes `text-xs`. `Meta` primitive loses the `"11"` size.
- Section headers: every block uses exactly one of the two canon patterns (§6); `PlayerProfile`,
  `MatchupView`, `CupDetail`, `RecordsView`, `StreaksView`, profile sections audited.
- Stat tiles everywhere (`PlayerProfile` key numbers, `ProfileStatsSection`, `MatchupView`,
  `CupDetail`, `RecordsView` numbers) → `StatTile`.

**DoD:** `git grep -nE "text-\[[0-9]+px\]" frontend/src` → 0; screenshots of stats Player,
matchup, profile Stats, records, cups at 390px; `npm run check` + build.

**Deviations:**

---

## T1 — Test-suite audit and gap filling  ☑

**Backend** (`backend/tests/`, use `conftest.py` helpers). Routes with no test today
(measured 2026-09-12: 7 of 95): add small tests for
- `GET /cup/defs` (bundled config → keys `default` + `bauernkranz`, eras present),
- `PATCH /matches/{id}/swap-sides` (editor swaps sides; reader 401/403),
- `GET /players/profiles`, `GET /players/avatars` (shape on an empty DB),
- `GET /tournaments/live` (`null` when nothing is live; the id once a match is `playing`),
- `PATCH /tournaments/{id}/date` (admin only; invalid date → 400/422),
- `POST /tournaments/{id}/reassign` (2v2 draft reassigns; non-draft → 4xx).
And extend `test_stats_endpoints.py::test_stats_h2h_matches_endpoint_basic` (or add
tests) for: subset vs `exact_teams` in 2v2, `relation: "teammates"`, `mode: "1v1"`
excluding 2v2 games, `scope: "both"` including a friendly.
Run `make test` twice (flakiness check) and record the final count below.

**Frontend.** Confirm the tests introduced by U1/U2/U4/S1/S2 exist and pass; add
`frontend/src/test/navConfig.test.ts` (`visibleDests` per role; `activeDest` for `/live/3`
→ tournaments, `/profiles/2` → players). Run `npx vitest run --coverage` once and paste the
summary line (statements %) below — informational only, no threshold.

**Record here:** backend **130 passed** (`make test` run three times — 206.60s / 220.30s /
206.37s — same count every time, no flakiness; 115 → 130); frontend **233 tests in 28 files** (231 in 27 before: +8 `navConfig`,
−6 from the deleted `trendsMath` cases); `npx vitest run --coverage` (v8):
`Statements : 63.42% ( 1283/2023 )`, `Branches : 53.77% ( 933/1735 )`,
`Functions : 59.77% ( 315/527 )`, `Lines : 65.14% ( 1058/1624 )`.
Route coverage (plan heuristic, re-measured): **8 of 95 uncovered → 0 of 95**.

**Deviations:** (implemented 2026-09-12, two commits: backend, frontend)

- Re-measuring found **8** uncovered routes, not 7: the plan's list plus `GET /health`
  (`app/main.py`, the only non-router route). It is tested too, so the heuristic now reports
  95/95. The script lives only in the scratchpad; it parses `@router.<verb>("…")` per router
  prefix (+ `@app.<verb>` in `main.py`) and greps `backend/tests/*.py` for the path with
  `{param}` → `{anything}|digits|identifier`.
- New backend files (4, not one per route): `test_config_endpoints.py` (`/health`, `/cup/defs`),
  `test_match_swap_sides.py`, `test_player_meta_endpoints.py`,
  `test_tournament_endpoints_current.py` (`/live`, `/date`, `/reassign` — one file, they are all
  tournament-level endpoints). 15 new backend test cases.
- The tests go a little past the bullet text where the endpoint's contract invited it:
  swap-sides also covers the "done tournament → admin only" rule and 404; `/players/profiles`
  and `/players/avatars` assert the empty-DB shape **and** one populated row (the profile via
  `PATCH /players/{id}/profile` as the Editor, the avatar via `PUT …/avatar`, as
  `test_player_profiles_auth.py` does); `/date` and `/reassign` also assert 404 and the
  reader/editor split.
- `POST /tournaments/{id}/reassign` cannot be asserted by match ids: SQLite reuses the ids of
  the deleted schedule, so the test asserts the persisted `settings_json.labels` mapping, the
  recreated `order_index` sequence and that every match is scheduled/clean instead.
- Two endpoint facts the tests had to work around (not bugs, just constraints): a 1v1
  tournament needs ≥ 3 players (`/generate` → 400 with two), and only one tournament may be
  live at a time, so the mode-filter test finishes the 2v2 tournament completely before
  starting the 1v1 one.
- h2h-matches: two new tests next to the existing basic one, not an extension of it —
  `test_stats_h2h_matches_exact_teams_and_teammates` (2v2 subset vs `exact_teams`, one-per-side
  `exact_teams` matching nothing, `relation: "teammates"`) and
  `test_stats_h2h_matches_mode_and_scope_filters` (`overall` vs `1v1` vs `2v2`, `scope`
  `tournaments`/`both`/`friendlies` with a friendly). The expected match sets are derived from
  the tournament payload rather than hard-coded, because `/generate` randomises 2v2 pairings.
- Frontend: all eleven test files introduced by U1/U2/U4/U5/S1/S2/S3/S5/U6 exist and pass
  (`sectionTabs`, `useTabParam`, `bottomTabBar`, `errorToast`, `matchHistoryList`,
  `matchupSummary`, `statsNav`, `statsFilterPill`, `matchupView`, `playerStreakChips`,
  `lastLocation`). New `navConfig.test.ts` has 8 cases (the two the task names plus the
  destination roots, `/live/:id/match/:mid`, `/tournaments/new`, `/profile`, non-destination
  paths → `null`, and same-prefix paths like `/statsomething` not matching).
- S4's finding acted on: `avgLast`, `clampWindow`, `dist2`, `monthTicksBetween` and the
  `SeriesPoint` type are gone from `pages/stats/trendsMath.ts` together with their 6 test cases
  (`git grep` confirmed `src/test/trendsMath.test.ts` was their only reader; `dist2` and
  `SeriesPoint` had no reader at all). The now-unused `fmtMonthDate` import went with them.
  **Finding for D1:** that leaves `fmtMonthDate` in `utils/format.ts` referenced only by
  `src/test/format.test.ts` — left in place (it is a generic formatter in a utils module and
  was not part of the approved deletion list). Everything
  `TrendsPreviewCard.tsx` / `useChartData.ts` / `usePlayerColors.ts` use (`pooledPpm`,
  `buildPlayerColorMap`, `colorForIdx`, `pointsForPlayerInMatch`, `PlayerColor`) is untouched;
  `trendsMath.ts` is at 100% statement coverage.
- `npx vitest run --coverage` writes an untracked `frontend/coverage/` directory (not in
  `.gitignore`); it was deleted after reading the summary rather than committed or ignored.
- `make test` ran a third time because a readability-only refactor of a local helper in the new
  h2h test landed while run 2 was in flight; run 3 is the final tree.
- `make gen-types` produced no diff. `npm run build` still prints the pre-existing
  "chunks larger than 500 kB" hint (630 kB `index-*.js`); unrelated, as noted under F1…U6.
- No runtime verification for this task: it adds no UI and changes no behaviour.

---

## D1 — Documentation pass (runs LAST, after DS4)  ☐

- `README.md`: remove the "Tournament status" section with `PATCH /tournaments/{id}/status`
  (no such endpoint; status is derived from match states — say so in one sentence); make
  the Caddyfile example identical to `deploy/Caddyfile`; in "Useful API endpoints" fix the
  comments-summary path and add `POST /stats/h2h-matches` and `GET /me/notifications`;
  update the "Features" list for the new stats structure (Overview: Table/Positions/
  Streaks/Records/Cups · Trends · H2H with Players/Duos/Matchup · Player), the mobile
  bottom tab bar, and "Font Awesome bundled locally (no runtime CDN)"; add a line near the
  top pointing to `AGENTS.md` as the canonical project knowledge; frontend image is
  `node:22-alpine`.
- `frontend/README.md`: replace the stale pages list with the real routes
  (`/dashboard`, `/tournaments`, `/live/:id`, `/live/:id/match/:mid`, `/friendlies`,
  `/stats`, `/players`, `/profile(s)`, `/clubs`, `/settings`, `/login`), correct ports.
- `AGENTS.md`: §2 frontend modules (BottomTabBar, useTabParam, statsNav, h2h/MatchupView,
  matchupSummary); §3 baseline test counts from T1; §10 gotchas (drop the FA-CDN item; add
  the stats URL scheme `view/sub/player/vs`, and that tab state is `?tab=` everywhere);
  §11 current state (this batch on `feature/2026-09-batch`, not deployed; deploy notes:
  frontend image rebuild, no DB change, no manual server step); bump the "Last full
  review" date.
- `DESIGN.md`: re-check every statement against the migrated code; `AGENTS.md` §12 lists it.
- Tick every task box above that is done and fill in the Verification section below.

**Deviations:**

---

## Verification gates (after all tasks)

1. `make test`, `make lint` from repo root.
2. `make gen-types` produces no diff.
3. `cd frontend && npm run check && npm run build`; `grep -rn "https://" frontend/dist/index.html` → nothing.
4. Runtime on the isolated stack (390px + 1280px): every stats section and the Matchup
   flow (Overall/1v1/2v2 × Tournaments/Both); bottom bar on every page; `/live/19`,
   `/profiles/1?tab=guestbook&entry=<id>`; 404 page; login redirect.
5. DB safety: nothing in this batch touches the schema.

## Deployment (later, on Roli's go)

`git pull && docker compose up -d --build` — the frontend image changes (node:22, new
dependency), the backend only loses a duplicate route. No DB migration, no manual server
step. Old clients keep working (stats legacy URLs are mapped).

---

## Parked ideas (from Roli while testing the WIP, 2026-09-12 — NOT planned yet)

Recorded so they are not forgotten. Do not implement without an explicit go.

1. **Per-destination "last page" memory.** → *enqueued as U6 (2026-09-12).* Tapping a top-level destination (bottom bar,
   sidebar, drawer) should return to the last page the user had open *inside* that
   destination, not its root — e.g. Tournaments → the live tournament that was open (with
   its tab), Players → the profile that was open, Stats → the section/sub-view/player that
   was open. Must work in all directions and for every subpage (`/live/:id`,
   `/live/:id/match/:mid`, `/profiles/:id?tab=…`, `/stats?view=…&sub=…&player=…&vs=…`).
   Sketch for later: a small store `destinationKey → last pathname+search`, updated on every
   location change via `activeDest(pathname)` (`ui/shell/navConfig.tsx`), persisted in
   `sessionStorage` (per tab) with a `localStorage` fallback for the PWA; nav links resolve
   to the remembered location; tapping the already-active destination goes to its root
   (standard "second tap resets" behaviour); the 404 page clears the entry for its
   destination so a deleted tournament never traps a tab. Not covered by the current queue
   (`useLocationRestore` only restores the last location on a PWA cold start).
2. **Stats Mode/Source filter placement.** → *approved as a floating pill with native selects, enqueued as S5 (2026-09-12).* The filters must not sit above the section tabs
   (Overview/Trends/H2H/Player). Roli floated a "floating thing on the bottom". Fable's
   take: a second bottom bar competes with the new bottom tab bar; the common app pattern is
   either a compact filter row *below* the tabs/sub-chips (contextual, sticky while
   scrolling) or a "Filters" pill that opens a bottom sheet. Recommendation: the row below
   the tabs first, sheet only if the row proves too tall on phones. Natural place to do it
   is S1 (it owns that strip) or a follow-up after S1.
