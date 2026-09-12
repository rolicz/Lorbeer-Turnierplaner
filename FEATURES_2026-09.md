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
| 9 | S2 | Matchup view + all entry points | frontend |
| 10 | S3 | Player section completion + Elo/positions explainers | frontend |
| 11 | S4 | Retire the Classic layout | frontend |
| 12 | U6 | Per-destination last page memory (bottom bar / sidebar / drawer) | frontend |
| 13 | T1 | Test-suite audit and gap filling | backend + frontend |
| 14 | D1 | Documentation pass (README, frontend/README, AGENTS.md) | docs |

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

## U4 — Clickable match rows + shared matchup summary helper  ☐

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

**Deviations:**

---

## S1 — Stats IA: four sections, sub-views, filters, shared player, legacy URLs  ☐

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

**Deviations:**

---

## S2 — Matchup view + entry points  ☐

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

**Deviations:**

---

## S3 — Player section completion + explainers  ☐

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

**Deviations:**

---

## S4 — Retire the Classic layout  ☐

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

**Deviations:**

---

## U6 — Per-destination last page memory (enqueued 2026-09-12 from parked idea 1)  ☐

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

**Deviations:**

---

## T1 — Test-suite audit and gap filling  ☐

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

**Record here:** backend `N passed`, frontend `N tests in M files`, coverage summary.

**Deviations:**

---

## D1 — Documentation pass  ☐

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
2. **Stats Mode/Source filter placement.** The filters must not sit above the section tabs
   (Overview/Trends/H2H/Player). Roli floated a "floating thing on the bottom". Fable's
   take: a second bottom bar competes with the new bottom tab bar; the common app pattern is
   either a compact filter row *below* the tabs/sub-chips (contextual, sticky while
   scrolling) or a "Filters" pill that opens a bottom sheet. Recommendation: the row below
   the tabs first, sheet only if the row proves too tall on phones. Natural place to do it
   is S1 (it owns that strip) or a follow-up after S1.
