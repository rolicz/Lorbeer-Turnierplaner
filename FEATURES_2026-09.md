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
| 22 | N1 | Back from a detail page goes up (U6 regression) ☑ | frontend |
| 23 | N2 | Return to exactly where you were (scroll restoration) ☑ | frontend |
| 24 | N4 | Useful links everywhere (cross-navigation sweep) ☑ | frontend |
| 25 | S8 | H2H matrix: W-D-L default, obviously clickable | frontend |
| 26 | S9 | Filter pill must not be overlookable | frontend |
| 27 | N3 | Swipe back/forward always makes sense ☑ | frontend |
| 28 | DS3 | Surface & radius migration, retire old classes ☑ | frontend |
| 29 | DS4 | Typography & section headers on the scale ☑ | frontend |
| 30 | DS8 | Stats sub-pages made of the same stone (+ drop redundant mode pill) ☑ | frontend |
| 31 | S10 | Match comments & club selection reworked ☑ | frontend |
| 32 | D1 | Documentation pass (README, frontend/README, AGENTS.md, DESIGN.md) ☑ | docs |

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

## S7 — Filter pill v2: compact, icon-forward, popover (no native selects)  ☑

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

**Deviations:** (implemented 2026-09-13)

- The capsule's accessible name is one `aria-label` on the button (`"Mode: All, Source:
  Tournaments"`, only the parts that apply) instead of per-token `sr-only` spans: inside a
  single button the name computation concatenates sr-only text without separators
  (`"Mode:AllSource: Tournaments"`), which is neither readable nor testable. The sliders glyph,
  the separator dot and the source icon are `aria-hidden`; the visible mode token stays.
- Animation is the entry only, as the task words it ("fade/scale **in**"): local `popUp`
  variants built on `ease.out` from `ui/motion/motion.ts` (`y 6 → 0`, `scale 0.96 → 1`,
  `transformOrigin: bottom right`, 160 ms) instead of the shared `popover` variant, which drops
  in from above and reads wrong for a popover that opens upwards. No `AnimatePresence`: closing
  unmounts immediately, so tap-outside/Escape/re-tap need no timers in tests.
- Popover surface = `card-outer w-64 space-y-3 shadow-pop backdrop-blur-md` and the capsule
  keeps the S5 classes (`bg-bg-card-outer/85 border-border-card-chip/60 backdrop-blur-md
  shadow-pop`) — `.card` does not exist yet; DS1/DS3 migrate both mechanically.
- `place()` (the `getBoundingClientRect` anchor) runs in the pill's click handler *before*
  `setOpen(true)` so the portal mounts in the same commit and the focus effect finds it in the
  DOM; it keeps the previous `DOMRect` object when nothing moved, so re-anchoring on
  scroll/resize doesn't re-render the popover. Anchoring is
  `bottom = innerHeight − pillTop + 8`, `right = innerWidth − pillRight` (right edges flush).
- `.select-pill` (3 rules + comments in `styles.css`) is deleted with the native selects.
  `StatsInsights` is untouched: same props, same render site, same `pb-16`, same `z-40`.
- `test/statsFilterPill.test.tsx` rewritten to 12 cases (closed-pill label incl. "All" for
  `overall`, opens on tap, both groups with the current chips pressed, focus moves to the
  selected chip, mode/source handlers + popover stays open, Escape closes and returns focus,
  outside click and re-tap close, per-config hidden groups, nothing rendered for Cups).
- Measured closed pill: **95×36 px** with both filters, **61×36 px** on Positions (mode only) —
  S5's was ~210×36. Target was ≈100×36.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **180 checks green**, the full matrix `blue`/`light` × 390px/1280px —
  closed size/right gutter (16px mobile, 24px desktop), `position: fixed; z-index: 40`, no
  `<select>` left, popover 8px above the pill with right edges flush and inside the viewport,
  focus into the popover and back to the pill on Escape, Enter/Space open, chip taps writing
  `mode=1v1` / `source=friendlies` while the popover stays open, Mode-only on Positions (pill
  and popover), no pill on Cups, both filters on Trends/H2H/Player/Streaks/Records, and the
  pill still fully visible after scrolling Positions to the bottom.
- **Finding for DS1/DS6 (not fixed here):** in the `light` theme the unselected `ChipGroup`
  chips (`bg-bg-card-chip/50`) are nearly invisible on the white `card-outer` popover — they
  read fine on the page background everywhere else. `ChipGroup` is shared (and moves to a
  primitive in DS1), so its surface is out of S7's scope.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (633 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1/S5.

---

## DS1 — Design foundations: tokens, surface canon, primitives, dead CSS  ☑

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

**Deviations:** (implemented 2026-09-13, four commits: tokens, CSS canon + dead CSS,
primitives + tests, docs)

- Tokens are exactly `DESIGN.md` §2. `dark.css`, `red.css`, `green.css` and `blue.css` need
  **no** override — measured against each theme's `--color-bg-card-chip`, the dark defaults
  give win 6.1:1 (green theme, the worst case, where win-green sits next to the green accent),
  draw 6.4:1 and loss 5.5:1 (red theme). Light: win 5.0:1, draw 5.1:1, loss 6.5:1 on white.
  `--color-live` stays red-500 in light as specified — as *text* on white that is only 3.7:1,
  so it must stay a dot/marker colour there (it is today); if DS5 ever wants live as small
  text, light needs its own `--color-live`.
- `.inset` is `bg-card-chip/50` + `border: 0` in dark and full `bg-card-chip` + a
  `border-card-chip/35` hairline in light — the same pair `panel-subtle` used, so DS3's
  migration is a pure rename.
- `.text-micro` is plain CSS (`font-size: 10px; line-height: 1; font-weight: 600`) rather than
  `@apply text-[10px]`, so it does not itself introduce the arbitrary-size syntax §5 bans.
- Dead CSS: all 24 audit classes verified with `git grep -n "<class>" frontend` (0 hits outside
  `styles.css`) and deleted — `nav-link`, `nav-link-active`, `nav-link-current`, `main-nav-row`,
  `main-nav-indicator`, `surface-2`, `hairline-b`, `eyebrow`, `sheet-shell`, `card-subtle`
  (+ light override), `pill-green`, `accent-text`, `symbol-margin-to-text`, `page-x-bleed`,
  `no-scroll-anchor`, `page-slide-in-right/-left`, `subnav-click-blink`, `subnav-active-glow`,
  `subnav-slide-in-right/-left`, `subnav-slide-out-left/-right` and the whole subnav morph
  block (the four `--subnav-*` vars, 10 keyframes and 12 `[data-subnav-key]` selectors —
  nothing renders that attribute any more), plus their `prefers-reduced-motion` entries.
  `select-pill` was already gone (S7). `styles.css`: 764 → 495 lines.
  Found dead but **not** deleted (not on the audit list, one-line duplicates of classes DS3
  still has to migrate): `.accent` (0 uses; `.accent-text` was its twin) and `.text-subtle`
  (2 uses, so not dead). DS3 should sweep both.
- `ScoreLine` props: `size`, `leftNames`/`rightNames` (a node, or an array that stacks for
  2v2), `leftGoals`/`rightGoals`, `state` (`MatchState`), `focus` (`"left" | "right"`),
  `result` (`W`/`D`/`L`), `resultBadge`, `status`, `className`. `focus` is separate from
  `result` because §8 colours *the focus side's* numeral — a result alone cannot say which
  side it belongs to. The badge renders at the outer edge of the focus side (left when no
  focus is given). Scheduled renders `–  |  –` at hero/md and `vs` at sm. Test hooks:
  `data-score-line`, `data-score-numeral`, `data-score-result-badge`.
- `Chip`/`ChipGroup`: `ChipGroup` keeps its exact old API (`value`/`onChange`/`options`/
  `ariaLabel`, plus an optional `className`) and `pages/stats/charts.tsx` re-exports both, so
  no stats call site changed. The S7 light-theme finding is fixed by giving an unselected chip
  a `border-border-card-chip/40` hairline on top of `bg-bg-card-chip/50`; to keep both states
  the same height the selected state's `ring-1 ring-inset ring-accent/40` became an equivalent
  `border-accent/40`. **This is the one intended visual change in DS1**: chips grow 2 px
  (32 → 34 px tall) and unselected chips are outlined instead of invisible on the light
  theme's white popover.
- `StatTile` (S6's file) now uses the real `inset` class instead of the `panel-subtle p-3`
  stand-in; props, markup and `CupDetail` are untouched (dark alpha 0.65 → 0.5, light
  identical — imperceptible in the before/after screenshots).
- `Stars` takes StarsFA's props minus the already-deprecated `textZinc`, plus `size` (px,
  default 14): lucide icons are SVGs and do not scale with the surrounding font the way the
  FA glyphs did, so DS7's swap must pass a size where the text is larger than `text-sm`.
  A half star is an outline `Star` with a filled `StarHalf` on top (lucide's `StarHalf` alone
  has no right-hand edge).
- Runtime no-regression evidence (isolated stack: backend :8003 on a copy of `app.db`, vite
  :8020 for this branch and :8021 for a detached `45f1e22` worktree, removed afterwards):
  8 routes × blue/light × 390/1280 px = 32 screenshot pairs, pixel-diffed. Dashboard,
  `/live/19`, `/live/19?tab=matches`, `/tournaments`, `/friendlies` are **pixel-identical**
  (0–66 px of the live-dot pulse animation, which also differs between two runs of the same
  build). The only diffs are on the three pages with `ChipGroup`s (`/stats`, its Cups
  sub-view, H2H: +2/+4/+6 px page height), and cropping them shows exactly the chip hairline
  described above. Also: 0 console/page errors, 0 elements carrying any deleted class, and no
  horizontal overflow anywhere. Baseline note for future runs — a worktree with a *symlinked*
  `node_modules` needs `server.fs.allow`, otherwise Vite 403s the Font Awesome/flag-icons
  font files and every icon renders as tofu (it silently invalidated the first diff run).
- `npm run check` green before every commit (275 tests, +24 new); `npm run build` green with
  the pre-existing "chunks larger than 500 kB" hint, as noted under every earlier task.

---

## DS2 — Score display: one `ScoreLine`, hero panel redesign  ☑

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

**Deviations:** (implemented 2026-09-13, three commits: hero panel + callers, list rows +
`MatchSides`, tests + plan/canon)

- `MatchOverviewPanel` props follow the canon: `surface` is `"card" | "inset" | "none"`
  (default `inset`), `showModePill` became **`showMode`** (the mode is a text token on the
  meta line now, not a pill), and `scoreBoxStyle` / `scheduledScoreStyle` are **deleted** —
  there is no box any more and `ScoreLine` renders the scheduled dash pair itself, so
  `"dash"` and `"emdash-zero"` collapsed into one rendering.
- Dashboard card: the tappable `button` **is** the `card` and the panel inside it uses
  `surface="none"` (a `card` panel inside a card would break `DESIGN.md` §1.1). The
  tournament name is the card's `h2` in a `flex justify-between` row (§6) with a lucide
  `ChevronRight` as the trailing affordance, replacing "Tap to open live tournament." —
  i.e. the chevron sits on the title row rather than in a row of its own.
- **New shared primitive `ui/primitives/MatchSides.tsx`** (club badge + name, flag +
  league, stars — nothing but a muted "No club" for a clubless side). The same three-row
  block was duplicated in `MatchOverviewPanel`, `MatchList` and `MatchRowWithClubs`; all
  three now render it, so the DS2 layout exists once. This *does* change the list details
  layout, which the task said to leave alone: with the score hugging the centre, the old
  edge-aligned club/league/stars lines sat ~1500 px apart at 1280 px while the score sat in
  the middle — visibly two different layouts in one row. `MatchSides` hugs the centre gap
  the same way the names do, with the symbols next to their text.
- "Stars only when a club is set" is applied in the list rows too (not only the hero): the
  audit's "empty clubs show five hollow stars" was a symptom everywhere, and after
  `MatchSides` it is one rule in one place. A clubless side also drops its (empty) league
  line.
- `nameColorByResult` is **removed** from `MatchHistoryList` / `MatchHistoryTournamentBlock`
  / `MatchRowWithClubs` and its four call sites (`PlayerProfile`, `MatchupView`,
  `FriendlyMatchesListCard`, `MatchH2HPanel`). Colouring both of the winner's names green
  is exactly the "tint the row" idiom §8 replaces: the focus side's numeral carries the
  result and `ScoreLine`'s leader emphasis shows who won when there is no focus player.
  `matchPalette` is no longer imported there; the `StatsMatch` note in `api/types.ts` now
  names `ScoreLine`'s `state` prop as the single narrowing boundary.
- **`ScoreLine` tweak (primitive + test, as instructed):** the `resultBadge` now renders
  *inside* the focus side's names cell, on that side's outer edge, instead of at the row's
  outer edge. At 390 px the two are the same; on a 1280 px row the old placement put the
  badge ~250–750 px away from the numerals it describes (screenshots
  `peek-profile-1280.png` vs `peek-profile-1280c.png`). Nothing else about the primitive
  changed. `test/scoreLine.test.tsx`: the placement case now asserts the badge is the last
  child of the right side's cell, and `DESIGN.md` §8 records the new placement (plus the
  `MatchSides` row in the §7 table) so the canon and the code still agree. (An experiment that capped the whole line at `max-w-lg`
  was reverted — with the badge attached to the names it had no visual effect.)
- Sizes read as `md` = details row, `sm` = compact row in **both** lists (the task's
  "`ScoreLine md` (compact)" for `MatchRowWithClubs` vs "`md`/`sm`" for `MatchList`): with
  `md` names at `text-base`/numerals `text-2xl` and `sm` at `text-sm`/`text-lg`, this keeps
  the existing compact-vs-details size relationship. `resultBadge` is on for the compact
  rows only — the dense lists §8 means (profile matches, matchup, H2H recent meetings) —
  since the details rows are tall enough for the coloured numeral to be obvious.
- `MatchList` compact rows: `ScoreLine` owns the middle column, so the club badges that
  used to flank the score now travel **with the names** (inner edge, right next to the
  score) as a single name node per side. Nothing else moved: status dot, `#n`, state, leg,
  reorder/swap buttons and the odds line are untouched.
- Odds are one quiet mono line (`1 4.88 · X 4.14 · 2 1.60`, `font-mono text-xs
  text-text-muted`) in the hero panel *and* in `MatchList`'s details rows, replacing the
  two different `1 | X | 2` inline renderings. In the hero it moved from above the score
  (where it split the meta line from the score) to below it, as §8 prescribes.
- `RecordsView`'s superlative rows were the fourth score rendering (`{ag}:{bg}` in accent
  mono, names left / score right). They now use `ScoreLine sm` with the tournament · date
  line centred underneath.
- `OverviewSection`: "Next matches" rows use `ScoreLine sm`, whose scheduled state renders
  `vs` — the same text those rows hand-rolled before. The standings mini table shows no
  score at all (rank/P/GD/Pts), so there was nothing to move onto `ScoreLine` there.
- Light theme got the `--color-live: 220 38 38` override (`DESIGN.md` §2, amended after
  DS1). No other token changed.
- **DoD grep** `git grep "card-chip" pages/stats/MatchHistoryList.tsx pages/live/MatchList.tsx
  ui/primitives/MatchOverviewPanel.tsx` returns **one** line, not zero:
  `border-b border-border-card-chip/35` on the tournament block header — the *border token*,
  not the retired `.card-chip` box. Filtering the token families
  (`grep -v "border-card-chip\|bg-card-chip"`) gives 0 hits, i.e. no boxed scores remain.
- Tests: `matchOverviewPanel.test.tsx` +6 cases (ScoreLine instead of a box, no colon, one
  pill on the meta line, odds line only while unfinished, stars only with a club, scheduled
  dash pair, surface prop), `matchHistoryList.test.tsx` +5 (one `ScoreLine` and no tinted
  box, focus-side numeral colouring for W/D/L, plain numerals without a focus player, badge
  in compact rows only, scheduled dash). `matchupView.test.tsx` needed **no** change — it
  asserts the summary tiles, the relation switch and the match links, none of which DS2
  touches; it passes as-is against the new rows. 286 frontend tests green (+5).
- Runtime verification (isolated stack: backend :8003 on a copy of `app.db`, vite :8020;
  live tournament 20 with clubs/score set on the copy so the hero shows a real matchup, one
  side deliberately left clubless): 11 surfaces × blue/light × 390/1280 px = 44 full-page
  screenshots, all with **0 console/page errors and no horizontal overflow** — dashboard
  live card, `/live/20?tab=current|overview|matches` (compact **and** details),
  `/live/20/match/108` H2H and Edit result, `/friendlies`, `/profiles/1?tab=matches`, the
  H2H matchup and Records. The editor-only edit preview was reached without touching
  `backend/secrets.json`: Playwright stubs `/me` as `editor` and softens other 401s, so the
  role lives only in the browser.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (625 kB
  `index-*.js`), as noted under every earlier task.

---

## DS5 — Semantic colours: replace raw palette usages  ☑

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

**Deviations:** (implemented 2026-09-13, three commits: components, rival-card W-D-L,
position ramp + plan)

- Grep run with the widened pattern (`from|to` and `sky|orange|lime|slate` added):
  **41 hits in 17 files → 0** outside `themes/`. 12 of the 41 were the `styles.css` position
  buckets; the rest were components.
- A W-D-L string mixed *three* colour idioms, only one of which the grep caught: wins were
  `text-status-text-green` (a status-pill token) and losses the arbitrary
  `text-[color:rgb(var(--delta-down)/1)]`. All three numerals now use `text-win`/`text-draw`/
  `text-loss`, in `HeadToHeadRows` (both row kinds), `H2HView`, `MatchupView`, `StandingsTable`,
  `PlayerProfile`, `StarsView`, `DuoDetail`, `DuoLeaderboard`, `ProfileStatsSection`,
  `MatchH2HPanel` and the `standings.ts` `TABLE_COLS` W/D/L columns.
- `MatchupView`'s Last-5 chips and "Current run" go from three different palettes to
  `bg-win/15 text-win ring-win/30` (+ draw/loss) — the same shape as `ScoreLine`'s result badge.
- Two W-D-L strings the task names were **not** raw palette but plain muted text; they are
  coloured too (second commit): the profile overview's Favorite/Nemesis and Favorite-teammates
  cards (`ProfileOverviewTab`) and H2H's own rival cards (`H2HView`), so a card matches the
  opponent rows under it. `RecordsView`, `StreaksView` and the dashboard have no W-D-L string
  (Records renders scores through `ScoreLine` since DS2, Streaks renders lengths).
- `StandingsTable`'s "could finish as high as **#N**" keeps `text-status-text-green`: it is a
  projected *position*, not a result. (It was swept into the first pass and reverted.)
- Non-W-D-L hits, and the token chosen for each:
  - `ConnectionIndicator`: **Live** → `bg-live` / `text-live` — the same red as the shell's
    `live-dot`/`live-ping`, which mark the same thing (`DESIGN.md` §2). This is a deliberate
    hue change (emerald → red) so the app has one live marker. Reconnecting → `bg-draw`/
    `text-draw` (amber is the only warning-ish token), Offline → `bg-status-bar-default`,
    Connected → `bg-status-bar-green/80`.
  - `TournamentsPage`: the "Live" meta label → `text-status-text-green`, **not** `text-live` —
    it sits next to the row's `bg-status-bar-green` leading bar and follows the live `Pill`
    convention; a red label next to a green bar reads as a mistake. The winner trophy
    (`text-yellow-400`) → `text-gradient-gold-from`, the app's cup gold (`cupColors.ts`).
  - Error / permission-denied surfaces have no token of their own in `DESIGN.md` §2, so they
    use the loss token: push settings error box (`border-loss/40 bg-loss/10 text-loss`) and its
    denied status text, `MatchH2HPanel`'s error line, `VoteVotersModal`'s thumbs-down icon.
- `styles.css` positions: `.pos-best/good/mid/bad/worst/winner` no longer `@apply` palette
  classes — they set `--pos-p` (0 best … 1 worst) and share `.pos-tile`'s hsl ramp, so there is
  **one** dark rule and **one** `[data-theme="light"]` rule for all seven classes, plus optional
  `--pos-border-a` / `--pos-bg-a` (only `.pos-winner` overrides one: a 0.75 border). `.pos-none`
  stays off the ramp on surface tokens. Side effect worth knowing: the legend swatches now show
  the exact colours of the tiles they explain — they used to be an emerald/lime/amber/orange/red
  ramp next to the tiles' 120°→0° hsl ramp. `.pos-good` is still unused (the legend shows four
  steps); it is kept as the ramp's 0.25 point.
- `CupOwnerBadge`, `StreakPatches` and `TournamentLaurelMarkers` needed **no** change: they
  already colour through `--color-cup-*` / `--color-accent` / surface tokens (their Font Awesome
  glyphs are DS7's, their `text-[Npx]` sizes DS4's).
- Contrast measured at runtime (computed styles, all five themes): light `text-win` 4.21:1,
  `text-draw` 4.21:1, `text-loss` 5.43:1, `text-live` 4.05:1 against the light **page backdrop**
  — higher on the white cards where nearly all of them sit (DS1 measured 5.0/5.1/6.5 on white);
  dark themes are 5.0–11.9:1. `text-gradient-gold-from` is a 1.90:1 *icon* colour in light
  (decorative, beside the winner's name in `text-text-normal`); the `text-yellow-400` it replaces
  was worse. No token value was changed — DS1 owns `themes/*.css`.
- Runtime verification (isolated stack: backend :8003 on a copy of `app.db`, vite :8020):
  11 routes × `light`/`blue` × 390/1280 px = **44 full-page screenshots**, 0 console/page errors
  and no horizontal overflow anywhere — H2H (players + duos), the matchup, live standings
  (`/live/19?tab=standings`), profile overview, positions (+ a crop of the opened legend),
  streaks, stats table, Player, tournaments list and `/live/19/match/106`.
- `npm run check` green before every commit (286 tests); `npm run build` green with the
  pre-existing "chunks larger than 500 kB" hint (625 kB `index-*.js`), as under every earlier task.

---

## DS7 — Lucide only: migrate the 35 Font Awesome files, drop the dependency  ☑

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

**Deviations:** (implemented 2026-09-13, five commits: primitives + shared ui, stats pages,
live/comments, profile/players/clubs/tools, dependency + docs)

- **Scope was 41 files, not 35.** The 35 the task's grep finds, plus six that referenced Font
  Awesome only indirectly: `AvatarButton.tsx` / `AvatarCircle.tsx` (`fallbackIconClass`) and
  `pages/dashboard/TrendsPreviewCard.tsx` (`SegmentedSwitch` icon strings), and the three
  `StarsFA` callers that never write `fa-` themselves (`ui/primitives/MatchSides.tsx`,
  `ui/ClubCombobox.tsx`, `pages/stats/StarsView.tsx`). 40 files migrated, `StarsFA.tsx` deleted.
  `git grep -n "fa-" frontend/src` → **0 hits**.
- **`StatsAvatarSelector` does not exist** (gone before this batch). The `fallbackIconClass`
  prop lived on `AvatarButton` *and* on `AvatarCircle` (which is what actually rendered it);
  both are now `fallbackIcon?: ReactNode`. Single call site: `FriendlyMatchCard`'s "None"
  avatar (`fa-ban` → `Ban`).
- **Icons chosen that are not in the task's mapping table:** `fa-eraser`→`Eraser`,
  `fa-rotate-right`→`RotateCw` (same as `fa-arrow-rotate-right`), `fa-rotate-left`→`RotateCcw`,
  `fa-paper-plane`→`Send`, `fa-reply`→`Reply`, `fa-thumbtack`→`Pin`, `fa-thumbtack-slash`→
  `PinOff`, `fa-floppy-disk`→`Save`, `fa-spinner fa-spin`→`Loader2 animate-spin` (like
  `fa-circle-notch`), `fa-circle-check`→`CircleCheck`, `fa-circle-exclamation`→`CircleAlert`,
  `fa-arrow-up`/`fa-arrow-down`→`ArrowUp`/`ArrowDown`, `fa-arrow-right-arrow-left`→
  `ArrowRightLeft`, `fa-play`→`Play`, `fa-shuffle`→`Shuffle`, `fa-shield-halved`→`ShieldHalf`,
  `fa-user-pen`→`UserPen`, `fa-trash-can`→`Trash2`, `fa-envelope-open`→`MailOpen`,
  `fa-hand-fist`→`HandFist`, `fa-bolt`→`Zap`, `fa-arrow-trend-up`→`TrendingUp`, `fa-ban`→`Ban`.
  Three that have no faithful lucide counterpart: **`fa-flag-checkered`→`Flag`** (the "Finish
  match" button — lucide has no chequered flag), **`fa-compress`→`Shrink`** (the Compact/Details
  switch; `Shrink`'s inward arrows are FA's compress glyph) and **`fa-fire`→`Flame`**, which
  makes `fa-fire` and `fa-fire-flame-curved` the same icon (Records "Most goals by one side" and
  the win-streak patch never appear together).
- `Image` is imported as **`ImageIcon`**: `CommentImageCropper` and `PlayerAvatarEditor` both
  call `new Image()`, which a plain `Image` import would shadow.
- **Sizing rule applied** (lucide SVGs do not inherit `font-size`): 14 in `text-xs`/`text-sm`
  context (buttons, list rows, tabs) · 16 where the context is `text-base` (modal close, the
  goal steppers, the friendly-editor toolbar) · 12 inside 10–11px text runs and inside `Pill`
  (profile header lines, unread pills, the winner trophy in the tournaments meta line, thread
  chevrons) · 9/8 for the two micro crowns. `strokeWidth={2.25}` where a stroked icon looked
  thin next to bold text: `CupOwnerBadge`, the tournaments cup-stake pill, `StreakPatches`, the
  `+`/`−` steppers.
- **The two micro crowns render filled** (`fill="currentColor"`): the positions grid (9px, was
  `text-[8px]`) and `TournamentLaurelMarkers` (8px). An outline crown at that size is a smudge;
  filled it reads like the FA glyph it replaces. `CupOwnerBadge` and the cup-stake pill (12–14px)
  stay stroked.
- Five `text-[Npx]` classes existed **only** to size an FA glyph and are gone with it
  (`CupOwnerBadge` `text-[13px]`/`text-[11px]`, `TournamentLaurelMarkers` `text-[7px]`,
  `PositionsView` `text-[8px]`, `StarsView`'s `className="text-[11px]"`, `StreakPatches`
  `text-[10px]`/`text-[11px]`) — a small head start for DS4, no other type change.
- `StarsFA.tsx` is deleted; its six call sites (`MatchSides`, `ClubCombobox`, `SelectClubsPanel`
  ×2, `CommentList` ×2, `StarsView`) render `Stars`. Only `StarsView` needed an explicit
  `size` (12, it used to shrink the glyphs with `text-[11px]`); everything else sits in
  `text-xs`/`text-sm`, where the primitive's default 14 is right. The deprecated `textZinc`
  prop died with the file (0 users).
- Commit grouping follows the task, with one unavoidable spill: the `SegmentedSwitch`
  `icon?: ReactNode` and `fallbackIcon?: ReactNode` type changes and the `StarsFA` deletion
  force their call sites (in `ClubsPage`, `TrendsPreviewCard`, `MatchList`, both friendlies
  cards, `StarsView`, `CommentList`) into the **primitives** commit; those files are finished in
  their own group commit.
- **Lockfile:** `npm uninstall` also pruned 12 unrelated optional entries (`lightningcss-*` for
  every platform + `detect-libc`, none of them installed on this arm64 Pi). They were restored
  by hand, so `frontend/package-lock.json` loses exactly the `@fortawesome/fontawesome-free`
  block and its `dependencies` line. `npm ls @fortawesome/fontawesome-free` → `(empty)`.
- **Bundle** (same tree, only the CSS import differs): `dist/assets/index-*.css`
  **164,562 → 94,599 B** (−69,963 B, −42.5%; gzip 41.38 → 19.37 kB) and **8 webfont files gone**
  (`fa-solid-900` woff2+ttf, `fa-regular-400` woff2+ttf, `fa-brands-400` woff2+ttf,
  `fa-v4compatibility` woff2+ttf = **1,023,976 B**). `dist/` 6.4 → 5.4 MB. `index-*.js` is
  unchanged at 632,443 B — both builds already contain the lucide migration, so this number does
  not include the (small) JS the extra lucide imports add; they are tree-shaken single-path SVG
  components.
- `AGENTS.md`: §2 lists the new primitives and says every icon is lucide; §9 gains an
  "**Icons: lucide-react only**" bullet; §10 gains the non-obvious bit (lucide ignores
  `font-size`, so every icon needs an explicit `size` — with the house sizes). §10 had **no** FA
  note to remove: F1 bundled the dependency but never wrote a gotcha for it.
- Runtime verification (isolated stack: backend :8003 on a copy of `app.db`, vite :8020;
  Playwright at 390px, blue + light, plus 1280px spot checks): tournaments list (+ a crown/
  trophy crop), players, profile header, stats positions with the legend open (+ a crown crop),
  live matches, live comments feed and the opened composer, clubs (incl. the editor's Clear/
  Refresh with a filter active), friendlies list and the friendly **editor** — **0 console/page
  errors, no horizontal overflow anywhere**. The editor-only UI was reached the DS2 way:
  Playwright stubs `/me` as `editor` and answers the six token-only read endpoints
  (`/me/notifications`, the comment/guestbook/poke read-maps) empty, so nothing but the browser
  believes in the role and no write is ever issued.
- `npm run check` green before every commit (286 tests, unchanged — no test asserts on icons);
  `npm run build` green with the pre-existing "chunks larger than 500 kB" hint.

---

## DS6 — Selection controls & buttons on the canon  ☑

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

**Deviations:** (implemented 2026-09-13, three commits: chips, segmented switch, buttons +
`FilterSelect`)

- **Radius, as clarified by the planner:** the `SegmentedSwitch` track is `rounded-xl` (12px),
  its segments *and* the sliding indicator are `rounded-lg` (8px) — `rounded-[10px]` was never
  used. This is the one documented exception to `DESIGN.md` §4 (a control nested in a 12px box
  with 4px of padding cannot repeat that radius without cutting the track's corners); §4 and the
  §7 table row now say so, and the component carries the same note as its file comment.
- `SegmentedSwitch` sizing: `h-8` sits on the **segments** (where the height class already
  lived), so with the track's `p-1` the control is 40px tall (was 44). Selected state is now
  `Chip`'s verbatim — `bg-accent/15` + `ring-1 ring-inset ring-accent/40` on the indicator and
  `font-medium text-accent` on the label (was `accent/0.16` + an `accent/0.45` inset shadow and
  `font-semibold`). Two inline `style` objects became token classes (`bg-bg-card-chip/35` on the
  track); only `left`/`width` stay inline, since they are measured.
- **One chip extra:** `StatsTable`'s "Columns" buttons were an inline copy of `ToggleChip`'s
  class string (plus a disabled variant). Left alone they would have sat 2px shorter and one
  type step smaller than the "Last N" `Chip` directly above them, so they render `Chip` too —
  `disabled` keeps its `line-through`/`cursor-not-allowed` via `className`. Visible effect: all
  stats chips are now 34px tall `text-sm` (`ToggleChip` was 26px `text-xs`), so the Columns row
  wraps to two lines at 390px.
- **`buttonClass()` is a new named export of `ui/primitives/Button.tsx`.** Three call sites
  cannot render a `<button>`: two react-router `<Link>`s (the 404 page's "Back to dashboard",
  Settings' "My profile" / "Login") and `ClubStarsEditor`'s decorative box, which sits *under* a
  transparent native `<select>` and must stay non-interactive. They take the class string instead,
  so `btn-base`/`btn-solid`/`btn-ghost` still occur in exactly one file. The file gains
  `/* eslint-disable react-refresh/only-export-components */`, the same pattern as
  `ui/clubControls.tsx` / `ui/primitives/Pill.tsx`.
- **`.icon-button` is deleted** from `styles.css` (0 usages left); the `btn-*` block stays,
  because `Button` is built on it, and now carries a comment saying it is that file's private
  API. Its 12 former users are `Button variant="ghost"`: Settings "Switch role", the
  `SelectClubsPanel` dice, the push-settings refresh, the error-toast dismiss, the `Modal`
  close, the notification bell, and MobileChrome's back / menu / drawer-close.
  Two consequences, both intended: the ghost surface is a touch stronger
  (`bg-card-chip/0.35` vs `icon-button`'s `/0.25`, hover `/0.55` vs `/0.45`) and icon buttons
  now share `btn-base`'s `active:scale-[0.98]` press feedback.
- Every icon-only migration adds an explicit **`p-0`** next to its `h-*`/`w-*`: `.icon-button`
  had `p-2`, while `btn-base` has `px-4 py-2`, which inside a fixed 28–40px box would squeeze the
  lucide SVG (`flex-shrink` on an `h-4 w-4` icon). `RouteErrorBoundary`'s two text buttons keep
  the default padding (no size prop), exactly as before.
- `FilterSelect`: the trigger is the `inset` surface with `px-3 py-2` overriding its `p-3`, and
  the **open** state is `ring-1 ring-inset ring-accent` instead of a border colour swap — `.inset`
  has no border in the dark themes, so a border-based open state would shift the row by 2px.
  The menu is `card` + `px-0 py-1` (the options bring their own padding) and therefore goes
  `rounded-xl` → `rounded-2xl`, per §3/§4.
- `pages/stats/charts.tsx` loses the `Chip`/`ChipGroup` re-export and `test/chip.test.tsx` its
  "still re-exported" case; `pages/stats/controls.tsx` is down to `Slider`. Seven files import
  `ChipGroup` from `ui/primitives/Chip` directly now.
- **Not touched** (not in DS6's bullets, flagged for DS3/DS4): `TrendsExplorer`'s series-legend
  pills (a colour-dot visibility toggle, inverse semantics) and the fact that `btn-ghost` is
  nearly invisible on the light theme's white `card` — that is a surface-token question and
  predates this task (the Settings "My profile"/"Logout" pair already looked like that).
- Runtime verification (isolated stack: backend :8003 on a copy of `app.db`, vite :8020;
  editor-only UI via a stubbed `/me`, every other token-only read answered empty instead of 401,
  as DS2/DS7 did): **128 checks green** over `blue`/`light` × 390/1280 px — stats Table and
  Trends controls (chip geometry 34px, accent wash on toggle), the segmented switch measured at
  12px track / 8px segments / 8px indicator / 32px segment / 40px track with the accent inset
  ring, live Current-tab actions, the comments composer with its `FilterSelect` open (trigger
  carries `inset`, menu carries `card`, 16px radius, no card padding), the friendlies editor,
  Settings, the H2H history modal's 40×40 close button, the 404 link, plus "no element carries
  `.icon-button`", no horizontal overflow and 0 console/page errors on every page.
- `npm run check` green before every commit (292 tests); `npm run build` green with the
  pre-existing "chunks larger than 500 kB" hint (633 kB `index-*.js`), as under every earlier task.

---

## DS3 — Surface & radius migration  ☑

Mechanical, page by page (one commit per page group): `card-outer`→`card`; `card-inner`,
`card-inner-flat`, `CardSection`, `panel*`, `card-subtle`, `surface` (as a box)→`inset`;
`card-chip` as a box→`inset`, as a tag→`chip`; `rounded-lg`/`rounded-sm`/`rounded-md` (except
positions tiles)→per §4; nested card-in-card flattened to `card` + `inset` or to a flat
`section-label` block. `Card`/`CardSection` primitives updated to emit the new classes;
`Modal` uses `card`. At the end delete the retired classes from `styles.css` (grep 0).

**DoD:** `git grep -nE "card-outer|card-inner|card-inner-flat|card-subtle|panel-subtle|panel-inner|\bpanel\b|surface-2|\bsurface\b" frontend/src` → 0 (except the class definitions being deleted in the same commit); all pages screenshotted at 390px in blue + light with no visual regressions beyond the intended flattening; `npm run check` + build.

**Deviations:** (implemented 2026-09-13, five commits: shell + primitives, dashboard/tournaments/
live, stats, profile/players/clubs/tools/settings, CSS deletions + canon)

- **DoD grep.** Run verbatim it returns 114 lines, all of them prose, identifiers or token
  classes — `MatchOverviewPanel`'s `surface` prop (DS2), `CommentList`'s `surface` parameter,
  `StatsFilterPill`'s `panel` local, `bg-bg-card-inner` / `border-border-card-outer` token
  classes, vitest `it("…surface…")` titles and the `styles.css` comment that records the
  deletion. A token-exact scan (every quoted string in all 252 tracked frontend files, split
  into class tokens, matched against the 24 retired names) returns **0 class usages**, and
  `git grep -nE '^\s*\.(card-outer|card-inner|…)' frontend/src/styles.css` returns nothing:
  the definitions are gone. `styles.css` 499 → **429 lines**; `dist/assets/index-*.css`
  94.6 → **92.3 kB**.
- **Class map used throughout:** `card-outer`→`card` (identical geometry, pure rename) ·
  `card-inner`, `card-inner-flat`, `panel`, `panel-subtle`, `panel-inner`, `surface`-as-a-box,
  `card-chip`-as-a-box → `inset` · `card-chip`-as-a-tag → `chip` · `modal-shell` → `card p-4` ·
  `hairline` → `border border-border-card-chip/40` · `stack`/`stack-tight` →
  `flex flex-col gap-5`/`gap-3` · `text-subtle` → `text-text-muted/80`.
  `card`/`inset` carry their own `p-3`, which the old `panel*`/`surface` classes did not, so
  every site that brought its own padding keeps it (`inset px-3 py-2` — utilities beat the
  component layer) and every site that wanted none gets **`inset p-0`** (`AvatarCircle`, the
  `SelectClubsPanel` wrapper, the image croppers). `DESIGN.md` §3 now records that idiom.
- **Primitive APIs renamed to the canon** (the old values *were* the retired vocabulary):
  `Card` / `CollapsibleCard` take `variant="card" | "inset" | "none"` and `bodyVariant="inset"`,
  matching `MatchOverviewPanel`'s DS2 `surface` prop. `Modal`'s `variant="card" | "panel"` is
  **deleted** — §3 says a modal is a `card` on a scrim — which changes the two image croppers
  (avatar, comment image) from the `panel` surface to `card`. The forced one-line call-site
  updates (`LoginPage`, `StandingsTable`, `TournamentCommentsCard`, both friendlies cards,
  `PlayerAvatarEditor`) ride in the primitives commit, like DS7's spill; those files are
  otherwise finished in their own group commit.
- **`btn-ghost` on the light theme (the DS6 hand-off).** `--color-bg-card-chip` *is* white in
  `light.css`, so `bg-card-chip/0.35` was literally invisible on a white `card` — Settings'
  "My profile"/"Logout", the stats "Show all", every icon button on a card. Fixed once in
  `styles.css`: in `[data-theme="light"]` a ghost button gets the full chip fill **plus a
  hairline**, drawn as `box-shadow: inset 0 0 0 1px …` rather than a border so the button keeps
  its exact box in every theme (a border would have grown every ghost button by 2px, or made
  ghost and solid different sizes). Because that is the same CSS property as Tailwind's focus
  ring, `[data-theme="light"] .btn-ghost:focus-visible` restates both. Hover moves to
  `--color-hover-default` (the theme's "subtle darken"). Dark themes are untouched. This is the
  single largest visible change in DS3 and it is an improvement everywhere: Cancel/Edit/Delete/
  Send test/dice/refresh/vote buttons all have a resting edge now.
- **Comments feed flattened** (`CommentList`): it used four surface families three levels deep
  (`card-inner-flat` block → `panel-subtle`/`panel` comment → `panel-inner` reply). It is now
  page → `card` (a match block or the General block) → `inset` (every comment, replies
  included); thread depth is carried by the indent and the left rule that were already there.
  The same decision is applied to the profile guestbook: a root entry is a `card`, a reply the
  `inset` indented under it (it used `panel-subtle`/`panel-inner` at every depth).
- **The match-block header's score lost its box.** `CommentList` rendered the block header score
  inside a `card-chip` — a fifth score rendering that DS2 never saw. Since `card-chip` is
  retired, the choice was `inset` (a box around numbers, which §10 forbids) or no box; it is now
  unboxed. It still renders `4 : 0` with a literal colon instead of `ScoreLine`; converting it is
  a §8 job, not a surface job, so it is **left for DS8** and noted here.
- **`rounded-lg`/`rounded-sm` are gone from the rendered DOM** except `SegmentedSwitch`'s
  segments and indicator (§4's documented exception): a Playwright sweep of 38 routes ×
  blue/light × 390/1280 px (152 page loads) finds **116 such elements, all inside a
  SegmentedSwitch, 0 anywhere else**. Stretched-link focus overlays, row hovers, icon buttons,
  image previews, Settings' theme/"View as" buttons and `InlineBack` are `rounded-xl`.
- **Positions grid:** the task allows `rounded-md` for the micro tiles, but the grid actually
  used four values (`rounded` tiles, `rounded-sm` legend swatches, `rounded-lg` legend example
  tiles). All four are now `rounded-md`, so the legend shows exactly the shape it explains.
  The `MatchupView` Last-5 result chips go `rounded-md` → `rounded-full`, matching `ScoreLine`'s
  result badge (DS5 already gave them its colours).
- **`TrendsExplorer`'s series legend** (the DS6 hand-off): a legend key is not a selection chip,
  so it does not get the accent wash. Drawn series wear the `chip` surface (§3 level 3); a
  hidden series keeps the same pill but hollowed out — `bg-transparent`, `border-dashed`,
  muted, struck through. Both states were invisible on the light theme before.
- **One extra, related change:** `PlayerProfile`'s "Compare with" overlay pills were an inline
  copy of the same hand-rolled pill (`bg-bg-card-chip/70` vs `/30`, i.e. white-on-white in
  light) sitting three lines from a real `ChipGroup`. They are genuine `aria-pressed`
  multi-select toggles, so they now render `chipClass` from `ui/primitives/Chip`. Visible
  effect: they grow from 26px/`text-xs` to 34px/`text-sm`, like every other stats chip since
  DS6. Not named in DS3's bullets — flagged here as a judgement call.
- **Not done here** (out of DS3's scope, listed so the next task can pick them up): the
  `text-[Npx]` sizes and `section-label`'s 11px are DS4's; `PlayerProfile`/`ProfileStatsSection`/
  `MatchupView`/`RecordsView` still hand-roll their own stat tile instead of the `StatTile`
  primitive (DS4 owns that) — DS3 only moved those tiles onto the `inset` surface; `rounded-t`
  on the positions sticky header is not in §4's vocabulary and was left alone.
- **Honest note on what looks flatter.** In the light theme `.inset` is white + a hairline while
  `surface`/`panel-inner`/`card-inner-flat` were a light grey fill. So stat tiles, records
  groups, rival cards and the H2H rivalry rows changed from "grey box on a white card" to
  "white box with a hairline on a white card" — correct per §3, but one notch less separation
  where a tile sits *inside* a card (stats Player "Key numbers", profile Stats, matchup
  summary). On the grey page backdrop the same boxes read stronger than before. In the dark
  themes the difference is imperceptible (chip/0.5 vs card-inner). Second: the comments and
  guestbook threads lost the fill difference between a comment and its replies; the indent and
  the left rule are now the only depth cue. Both are deliberate per §1/§3 and are the only
  regressions I can find.
- **Tests:** `matchupView.test.tsx` selected tiles by `.surface`, `matchHistoryList.test.tsx` and
  `matchOverviewPanel.test.tsx` asserted "no `.card-chip` box". They now select `.inset` and
  assert that the `ScoreLine` itself carries no `.chip`/`.inset` — the same intent against the
  canon's names. 349 frontend tests green (no new tests: DS3 adds no behaviour).
- **Runtime verification** (isolated stack: backend :8003 on a copy of `app.db` with match 109
  set to `playing` so the live pages show a real match, vite :8020 for this branch and :8021 for
  a detached `76964ec` worktree that produced the "before" shots; editor/admin UI via a stubbed
  `/me` as DS2/DS7 did, with the token-only read endpoints answered empty):
  **38 routes × blue/light × 390 px, plus a full 1280 px pass and the 152-load audit** —
  0 console/page errors, 0 horizontal overflow, 0 nested `<a>`, **0 elements carrying any of the
  20 deleted classes**, on every route in both themes at both widths. Before/after pairs were
  taken for every route (`before-*-390.png` / `after-*-390.png` in the session scratchpad) plus
  interaction shots for the trends legend toggled off, the clubs inline edit form, the match
  "Edit result" tab, the friendlies editor and the Settings appearance/notifications tabs.
- `npm run check` green before every commit (349 tests); `npm run build` green with the
  pre-existing "chunks larger than 500 kB" hint (640 kB `index-*.js`).
- `DESIGN.md` updated so the canon stays truthful: §3's "retired (delete after migration)" list
  now says retired **and deleted**, records the renamed `variant` props and the `inset p-0`
  idiom, and §7's Button row records the light-theme ghost hairline.

---

## DS4 — Typography & section headers on the scale  ☑

- Replace every `text-[Npx]`: `[11px]`/`[12px]`/`[13px]`→`text-xs` or `text-sm` by context,
  `[15px]`→`text-base`, `[10px]`/`[9px]`/`[8px]`/`[7px]`→`text-micro` (badges) or `text-xs`;
  `section-label` becomes `text-xs`. `Meta` primitive loses the `"11"` size.
- Section headers: every block uses exactly one of the two canon patterns (§6); `PlayerProfile`,
  `MatchupView`, `CupDetail`, `RecordsView`, `StreaksView`, profile sections audited.
- Stat tiles everywhere (`PlayerProfile` key numbers, `ProfileStatsSection`, `MatchupView`,
  `CupDetail`, `RecordsView` numbers) → `StatTile`.

**DoD:** `git grep -nE "text-\[[0-9]+px\]" frontend/src` → 0; screenshots of stats Player,
matchup, profile Stats, records, cups at 390px; `npm run check` + build.

**Deviations:** (implemented 2026-09-13, four commits: type scale, section headers, `StatTile`,
light-theme inset fix)

- **Sweep result.** 122 `text-[Npx]` occurrences in 44 files → **0**
  (`git grep -nE "text-\[[0-9]+px\]" frontend/src`). Mapping by context per §5:
  `[11px]`×100 + `[12px]`×3 → `text-xs`; `[15px]`×4 (the drawer's three nav rows, the
  tournaments-list title) → `text-base`; `[10px]`×13 / `[9px]`×2 / `[8px]`×1 → `.text-micro`
  where the text is a badge/counter/micro-caption, `text-xs` where it is a label
  (the live mini-standings column header, the profile stat-tile label). `section-label` is
  `text-xs`; `Meta`/`MetaRow` lost the `"11"` size. No `[13px]`/`[7px]` existed.
- **Proposed §5 amendment (NOT applied to `DESIGN.md` — Roli's call).** §5 restricts
  `.text-micro` to "badges and superscript counters only", but three kinds of 10px text are
  neither, and 12px measurably breaks them: a unit caption under a number (`pts` under the
  standings points), a fixed-width marker (the ▲/▼ delta glyph in a 12px-wide column, the
  "best case" tag) and the **bottom tab bar's labels** (at 12px "Tournaments" needs 76px of a
  78px item). They use `.text-micro` today. Suggested wording: *"One extra utility
  `.text-micro` (10px, semibold) for badges, counters and micro-captions — text that annotates
  something rather than being read as content. Never body text, never a section label."*
- **`NationFlag`'s `text-[10.5px]`/`text-[13.5px]` stay.** They are not typography: the
  `flag-icons` `.fi` span is sized in `em`, so the font size *is* the flag's 14×10.5 / 18×13.5
  geometry. They fall outside the DoD grep by construction (decimal point). Flagged so a later
  reader does not mistake them for a miss.
- **Density calls (the planner asked for these to be named, not hidden):**
  1. `StandingsTable`'s row meta line (`3P · 1-1-1 · 11:13 · GD -2`) drops `font-mono` and
     keeps `tabular-nums`: at 12px the mono string measures exactly the 187px available and
     wrapped onto a second line, so every standings row had a different height. Proportional
     needs 149px. §5 permits mono there, it does not require it.
  2. `ClubBadge` `sm` goes 8px → 10px (`text-micro`) — two initials in a 16px disc are tighter
     than before but do not clip (measured 16/16px, no overflow). Only the six crest-less clubs
     render a monogram at all.
  3. The comment "pinned"/"editing" badges drop `text-[10px] py-1 px-2` and render the plain
     `chip` (§3: a chip is `text-xs`), so they grow 2px.
  4. The three 6-tile stat grids (`PlayerProfile` key numbers, `ProfileStatsSection`,
     `MatchupView` summary) go `grid-cols-2 sm:grid-cols-3` — see the `StatTile` note below.
  Everything else the scale touched fits: the H2H matrix, the stats table header, the
  positions grid and its legend, the live mini-standings header (`# Player P GD Pts`) and the
  five bottom-bar labels were all measured at 390px with no overflow and no new wrapping.
- **Section headers — what actually deviated.** `PlayerProfile`, `CupDetail`, `PositionsView`,
  `StatsTable`, `StreaksView`, `H2HView`, `SettingsPage`, `AdminPanel` and the live tournament
  sections were already on one of the two patterns. Fixed:
  - flat sections whose header carried a trailing action used a bare `flex justify-between`
    with no `section-head` (so no hairline): profile "Key numbers" + "Full stats →", profile
    overview "Recent matches" + "View all →", `MatchList`'s "N matches" + view switch,
    `FriendlyMatchCard`'s "Setup" + mode switch. They use `section-head` now, with `order-1`
    on the action so the `::after` hairline runs *between* label and action.
  - headers inside an `inset` were a third pattern (`text-xs uppercase tracking-wide`):
    `RecordsView`'s record/titles/streak groups and `MatchH2HPanel`'s `SummaryCard`. They are
    `<h3 class="text-sm font-semibold text-text-normal">` now. `SummaryCard`'s pairing line
    ("Roli vs Flo") drops to a muted caption under the heading — the same names already head
    the card two rows above.
  - uppercase mini-labels inside a card: `PlayerProfile`'s "Compare with" and "Form (last N)",
    `StreaksView`'s "Current" — now plain muted `text-xs`.
  - `TrendsExplorer`'s `Field` and `controls.tsx`'s `Slider` hand-rolled `section-label`'s
    exact class string; they use the class.
- **`DESIGN.md` §6 was edited** (not only §3). It still allows exactly two header patterns; the
  additions are mechanical clarifications the task needed: where a trailing action sits, that a
  header inside an `inset` follows the in-card rule, that a card which *is* one entity may keep
  the `text-lg` title §5 allows (this resolved a §5/§6 contradiction — §5 says `text-lg` "card
  titles", §6 said `text-sm`; `CupDetail`'s cup name keeps `text-lg`, everything nested under it
  is `text-sm`), and that a bare `section-label` next to a control is the app's field-label
  idiom (`ClubsPage` Group/Stars/League, the friendlies Mode/View filters,
  `SelectClubsPanel`) — those were left alone deliberately.
- **`StatTile` adoption.** `PlayerProfile`, `ProfileStatsSection` and `MatchupView` each had a
  private copy of the same tile (centred, `text-base` value *above* a `text-xs` label); all
  three now render the primitive, so the label sits above a `text-2xl font-bold` value per §7.
  `RecordsView`'s "Longest runs" cards are `StatTile`s too (label = the streak name,
  `accessory` = the ×N tie count, value = the record length in `text-accent`, `hint` = the
  holders). `CupDetail` already used it.
  - **Not converted:** `RecordsView`'s `RecordGroup` (a list of matches under a heading) and
    `TitlesGroup` (a ranked list of players). Their numbers are per-row values in a list, not
    one key number per box — forcing them into `StatTile` would have restructured the page.
  - **The grids go 2 columns at 390px** (`grid-cols-2 sm:grid-cols-3`, which `CupDetail`'s
    records grid already used): at three columns a tile has 83px of content, and a 24px
    `19-7-5` or a one-line "Conceded / match" does not fit — both wrapped. Cost: one extra
    tile row per grid; gain: §1.3's "numbers are the hero" actually holds on a phone.
  - `StatTile` gains an optional `title` (native tooltip) — `MatchupView`'s W-D-L and Goals
    tiles carried one on their box.
  - `matchupView.test.tsx` asserted tile text in value-then-label order; it now asserts the
    canon's label-then-value order (same six tiles, same values).
- **Planner instruction — the light-theme `inset` fix (DS3 hand-off).** In `light.css`
  `--color-bg-card-chip` is pure white, so DS3's `.inset` (full chip fill + hairline) was white
  on a white `card`. Light insets now take `--color-bg-card-inner` (247 246 245) with a
  `--color-border-card-inner` hairline; `chip`, `.input-field` and `.select-field` keep white,
  dark themes are untouched. Verified in light at 390px on stats Player "Key numbers", profile
  Stats tiles, the matchup summary tiles, the Cups record + "Current reign" tiles and the live
  standings/current-match panels — separated on a white card *and* on the grey page.
  `DESIGN.md` §3 states the rule. One honest note: on the grey page backdrop these boxes are
  now a touch quieter than DS3's white-on-grey; the hairline carries the edge.
- **Finding for D1:** `frontend/src/ui/primitives/Meta.tsx` (`Meta`, `MetaRow`) has **no
  importers anywhere** — it is dead code. The task asked to drop its `"11"` size, so that is
  what this task did; deleting the file is a dead-code call, not a typography one.
- **Runtime verification** (isolated stack: backend :8003 on a copy of `app.db`, vite :8020;
  editor/admin UI via a stubbed `/me` with token-only 401/403 reads answered empty, as
  DS2/DS3/DS6 did): **29 routes × blue/light × 390px and 1280px** — 0 console/page errors,
  0 horizontal overflow, **0 elements carrying any `text-[Npx]` class**, 0 nested `<a>`, plus
  4 editor-only routes (clubs, the friendlies editor, live Admin controls, match Edit result)
  in both themes. Before/after pairs for every route are in the session scratchpad
  (`before-<route>-<theme>-390.png` / `ds4after-<route>-<theme>-<width>.png`).
- `npm run check` green before every commit (349 tests); `npm run build` green with the
  pre-existing "chunks larger than 500 kB" hint (640 kB `index-*.js`), as under every earlier
  task.

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

## Round-3 feedback (Roli, 2026-09-13, while testing the WIP)

Verbatim asks → tasks: (1) back from match details is broken → **N1, done** · (2) match-detail
H2H needs a shortcut into the stats matchup → **N4** · (3) dashboard cup links → **N4** ·
(4) stats sub-pages must look "made from the same stone" (Records vs Streaks; Records should
use the shared match element) → **DS8** · (5) match comments + club selection are cumbersome,
rework with fewer clicks, feature-equivalent, friendlies included → **S10** · (6) match card
need not show 1v1/2v2 → **DS8** · (7) player icons link to profiles; sweep for useful links →
**N4** · (8) H2H matrix: W-D-L default, make cells look clickable → **S8** · (9) back from a
drill-in must return to the exact scroll position → **N2** · (10) swipe back/forward must always
make sense → **N3** · (11) the stats filter pill is easy to overlook → **S9**.

---

## N1 — Back from a detail page goes up, not "wherever you came from"  ☑

*Done 2026-09-13 by the planner (commit `9e2b20d`) — a regression introduced by U6.*
U6 made the nav bar open a destination's remembered page, so a match page is often entered
straight from Stats; the chevron popped history and landed there. New behaviour: back navigates
**up** (match → its tournament, keeping `?tab=` from `location.state.fromTab`; tournament →
list; profile → players), and pops only when the entry behind really is that parent (so the
parent keeps its scroll and open tab). `ui/shell/navStack.ts` mirrors `history idx → url` in
sessionStorage to tell the two cases apart; `resolveBackTarget()` is exported for reuse.
Tests: `test/contextualBack.test.tsx`.

---

## N2 — Return to exactly where you were (scroll + in-view state)  ☑

**Why (Roli #9):** "when I go back from detailed h2h, I get to top of h2h page and I want to go
back to exactly where I was — check everywhere for similar stuff."

Two distinct cases, both in scope:
1. **Route-level back** (`nav(-1)` and the contextual chevron). React Router does not restore
   scroll. Add `ui/shell/useScrollRestoration.ts`, mounted once in `AppShell`: on every location
   change, save `window.scrollY` for the *outgoing* entry keyed by its history index (reuse
   `navStack.ts`, add `saveScroll(idx, y)` / `scrollFor(idx)`); on a POP navigation
   (`useNavigationType() === "POP"`) restore it after paint (`requestAnimationFrame`, retry once
   after 120ms for late content), otherwise scroll to top. Respect `prefers-reduced-motion` by
   using `behavior: "auto"` throughout.
2. **In-view drill-ins that only change query params** (all `replace: true`, so there is no
   history entry to pop): the stats **matchup** (`?vs=`), and any other place where a sub-view
   swaps the page body. Save the scroll position when opening the drill-in, restore it when the
   in-view back button clears it. Implement as `useReturnScroll(key: string)` in
   `pages/stats/useReturnScroll.ts` (sessionStorage, keyed by the URL being left) and use it in
   `StatsInsights` (matchup open/close), `H2HView` (players ↔ duos), `CupDetail` (timeline
   segment → reign row already scrolls, leave it) and the profile tabs.

**Sweep:** grep for `setSearchParams(..., { replace: true })` and for components that swap a
body without a route change; list every hit in Deviations with "restored / not applicable".

**DoD:** on the isolated stack at 390px: scroll the H2H players view half-way, open a matchup,
press the in-view back → same scroll offset (±8px); same for a matchup opened from Top rivalries
after scrolling; `/live/19?tab=matches` scrolled → open a match → chevron back → same offset;
profile Matches scrolled → open a match → back → same offset; a fresh deep link still lands at
the top. `npm run check` + build.

**Deviations:** (implemented 2026-09-13, three commits: route level, in-view drill-ins, tests)

- **Module layout.** The in-view hook is `frontend/src/ui/shell/useReturnScroll.ts`, not
  `pages/stats/useReturnScroll.ts`: its best single wiring point is `ui/shell/useTabParam.ts`
  (one choke point for eight tabbed pages), and a `ui/shell` → `pages/stats` import would invert
  the layering. It exports the hook plus `saveReturnScroll` / `readReturnScroll` /
  `resetReturnScroll` (store + test seam). Its API is `{ save, restore, swap }` keyed by a
  caller-chosen **view key** rather than `useReturnScroll(key)`: a call site needs two keys at
  once (the body it leaves and the one it opens), and the URL "being left" is not stable — the
  param that opens a drill-in is part of it.
- `saveScroll(idx, y, pathname)` / `scrollFor(idx, pathname)` carry the pathname next to the
  offset. A push after a back reuses a history index for a different page; without the pathname
  the new page would inherit the old one's offset.
- **REPLACE is not "otherwise → top".** The task says restore on POP, top otherwise. Taken
  literally that would scroll to the top on every stats filter change and every `?tab=` switch
  (all of which `replace`). The rule implemented is: POP → the saved offset (or top), PUSH →
  top, REPLACE → top only when the pathname changed (`/` → `/dashboard`, the login redirect),
  and a same-page REPLACE keeps its place, leaving those swaps to `useReturnScroll`.
- **Retries.** One retry at 120ms was not enough: after a reload the profile page needs its lazy
  chunk, the ~140ms route-entry skeleton and its queries before the document is tall enough. The
  shared helper `restoreWindowScroll(top, onApplied?)` in `ui/scroll.ts` (used by both hooks)
  re-applies every 80ms for at most 1.5s and stops the moment the offset is reached, when the
  user scrolls (`wheel`/`touchstart`/`keydown` — their scrolling always wins) or on cancel. It
  never scrolls when already within 4px of the target, so it cannot fight a page's own
  scroll-into-view. Always `behavior: "auto"`.
- `window.history.scrollRestoration` is set to `"manual"`: the browser's own restore fires
  against the not-yet-rendered page. As a consequence **a reload now returns to where you were**
  too (the initial render is a POP and the offset is in sessionStorage).
- **Finding — React StrictMode wiped every offset in dev.** The mount effect's cleanup runs
  immediately (StrictMode's remount) and persisted a fresh `0` over the stored offset. The hook
  now only writes an offset it has actually observed (a scroll event or an applied restore); the
  same guard stops a page that rewrites its URL right after mounting from overwriting an offset
  that is still being restored — such a same-entry `replace` now *continues* the restore instead
  of cancelling it (`pendingRef`, given up after 1.7s).
- **Finding (not fixed here):** tapping a player row in Overview · Records jumps to the Player
  section and drops `?sub=`, so the Overview tab afterwards opens on Table, not Records. The
  scroll memory is per body and correct either way; the lost sub-view belongs to N4/DS8.
- Note on tab strips: `SectionTabs` sits at the top of a page, so the offset a tab keeps is
  whatever it was when the strip was tapped (you have to scroll up to reach it). The large
  offsets come from drill-ins that can be triggered anywhere in a list — the matchup, match rows,
  record rows — and those are exact.

**Sweep** — every place that swaps a body without a route change (`setSearchParams(…, { replace:
true })`, local view state, in-body back affordances), plus the programmatic scrolls it has to
coexist with:

| Site | What changes | Result |
|---|---|---|
| `StatsInsights.tsx` `openMatchup` (matrix cell, opponent row, Favorite/Nemesis, Top rivalries, duo rivalry) | H2H body → `MatchupView` | **restored** — the list's offset is saved, the matchup opens at the top |
| `h2h/MatchupView.tsx` "← Head-to-head" (`closeMatchup`) | back to the H2H list | **restored** (Δ0px measured) |
| `StatsInsights.tsx` `setView` (Overview/Trends/H2H/Player tabs) | body swap | **restored** per section |
| `StatsInsights.tsx` `setSub` (Table/Positions/Streaks/Records/Cups, Players/Duos) | body swap | **restored** per sub-view |
| `StatsInsights.tsx` `goPlayer` (Table + Records row tap) | jumps to the Player section | **restored** — the list keeps its offset, Player opens at the top |
| `ui/shell/useTabParam.ts` → ProfilePage, MatchDetailPage, SettingsPage, FriendliesPage, ClubsPage, PlayersAdminPage, DashboardPage, TournamentsPage | body swap | **restored** per tab (one implementation) |
| `pages/profile/ProfileOverviewTab.tsx` "View all →" | → Matches tab | **restored** (through `useTabParam`) |
| `LiveTournamentPage.tsx` `setActiveTab` (6 tabs; also OverviewSection's "standings"/"matches" buttons) | body swap | **restored** per tab |
| `LiveTournamentPage.tsx` `?comment=` / `?unread=1` deep links | force the Comments tab | restored to that tab's offset, then `TournamentCommentsCard`'s own scroll-to-comment wins (checked: no fight) |
| `pages/profile/useGuestbookUnreadJump.ts` `?unread=1` / `?entry=` | forces the Guestbook tab, then focuses the entry | not applicable — bypasses the tab setter on purpose; it owns the scroll |
| `StatsFilterPill` mode/source change | same body, refiltered | not applicable — keeping the position is the point (verified) |
| `H2HView` `PlayerPicker`, `DuoPicker`, `onSelectPlayer` | same body, other player | not applicable — the picker sits at the top of that body |
| `H2HView` duo selection → `DuoDetail` | section inserted inline | not applicable — no body swap, nothing scrolls away |
| `H2HView` "Show all"/"Top 8", matrix metric chips | list grows / cells re-render | not applicable |
| `H2HView` duo + teammates history `Modal` | overlay | not applicable (modal) |
| `CupDetail.tsx` `showAll` + `jumpToReign` | list expand + deliberate `scrollIntoView` | not applicable (the plan says leave it) |
| `dashboard/CupCard.tsx` `showAll` | list expand | not applicable |
| `tools/FriendlyMatchesListCard.tsx` `expandedFriendlyId`, editor view toggle | in-row accordion | not applicable |
| `ProfilePage` `VoteVotersModal`, `ProfileHeader` editor/lightbox, comment crop/lightbox, filter popover | overlays | not applicable (modals) |
| `ui/SectionTabs.tsx` `scrollIntoView` | scrolls the tab strip itself | not applicable (strip-internal) |
| `ui/shell/BottomTabBar.tsx` tap-the-active-destination → top | deliberate, unchanged | not applicable |
| `ui/primitives/CollapsibleCard.tsx`, `live/CurrentGameSection.tsx`, `PlayersAdminPage` `scrollToSectionById` | in-page anchors after an expand / a route push | not applicable |
| `StatsInsights.tsx` legacy URL rewrite, `useLocationRestore` (PWA resume), `LoginPage` redirect, `NotFoundPage` | URL cleanup / real navigations | handled by the route-level hook (a same-page replace keeps its place, a page change goes to the top) |

- Tests: `test/navScroll.test.ts` (9), `test/returnScroll.test.tsx` (11, incl. the `useTabParam`
  wiring), `test/restoreWindowScroll.test.ts` (5) — 25 new cases, suite at 317.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **25 checks green at 390×844 and 25 at 1280×900**, offsets measured
  before/after (every Δ = 0px, tolerance ±8px) — H2H list at 1007 → matchup (0) → in-view back
  (1007); opponent-row matchup from 700 → back (700); `/live/19?tab=matches` at 200 → match 106
  (0) → browser back (200), and at 180 → chevron back (180); `/profiles/1?tab=matches` at 1150 →
  match 99 (0) → back (1150); profile tabs holding 300 (Matches) and 399 (Overview)
  independently; a fresh deep link at 0; a `mode=1v1` filter change not moving the page; a reload
  returning to 900; a Records row at 150 → Player (0) → Overview · Table (0) → Records chip (150).

---

## N3 — Swipe back/forward always makes sense  ☑

**Why (Roli #10).** `ui/shell/useSwipeNav.ts` fires raw `nav(-1)` / `nav(1)`.
- Swipe right (back) must use the **same resolution as the chevron** on detail pages: call the
  shared helper from N1 (`resolveBackTarget` + the pop-vs-up decision, extracted into
  `ui/shell/backNavigation.ts` so the hook and `useContextualBack` share one implementation).
  On a non-detail page keep the plain history pop, and do nothing when there is nothing to pop
  (never navigate to `/dashboard` from a gesture — a silent no-op is better than a surprise).
- Swipe left (forward) only when `history.state.idx` is below the highest index seen this session
  (`navStack` knows it) — today it fires into nothing.
- Keep every existing guard (horizontal scrollers, `data-no-swipe-nav`, range inputs, the 700ms
  debounce). Add `data-no-swipe-nav` to the stats matrix and the trends chart if missing.
- Tests: extend a hook test or add `test/swipeNav.test.ts` for the decision function only.

**DoD:** on the isolated stack (touch emulation): swipe right on `/live/19/match/<id>` entered
from Stats lands on `/live/19?tab=matches`; swipe right on `/stats` with no history does nothing;
swipe left after a back returns forward; swiping a horizontally scrolled matrix never navigates.

**Deviations:** (implemented 2026-09-13, two commits: `refactor(N3)` extract, `feat(N3)` gesture)

- **Module layout.** `ui/shell/backNavigation.ts` holds the decision as data — `BackAction`
  (`pop` | `up` | `none`), the pure `resolveBackAction({ pathname, state, canPop, previousPath,
  fallback })`, `backActionFor()` (the same against the live browser/session state) and
  `swipeAction(dir, pathname, state)`. `resolveBackTarget` **and** `useContextualBack` moved
  there with it: the decision has to read `routeMeta()` and `historyCanPop()`, so leaving the
  hook in `routeMeta.ts` would have made the two modules import each other. `routeMeta.ts` is now
  pure route facts and imports nothing. Import sites updated: `ui/shell/InlineBack.tsx`,
  `ui/shell/MobileChrome.tsx`, `pages/ProfilePage.tsx`, `test/contextualBack.test.tsx`.
- **Button vs gesture is one argument.** `fallback` is where back goes on a top-level page with
  nothing to pop: `"/dashboard"` for the chevron, `null` for the gesture → `{ kind: "none" }`.
  Everything else — including "up" from a deep-linked detail page — is identical by construction.
- **Forward detection.** `navStack.recordNavigation(pathname, search, kind)` now takes the
  navigation kind and truncates the entries in front of the current one **only on a PUSH** (which
  is what the browser does; a pop or a replace keeps them). That makes `highestHistoryIndex()` /
  `canGoForward()` answerable, which is what gates the swipe-left. `useRememberLocation` feeds
  `useNavigationType()` in and keys its effect on `location.key`, so pushing the same URL twice
  is recorded at its new index too.
- **A no-op does not spend the debounce.** `lastNavAt` is now written only when a navigation
  really happens, so an ignored gesture (nothing to pop, nothing in front) does not swallow the
  next one for 700 ms.
- **Guards.** The stats matrix (`H2HView.tsx`) and the trends chart (`trends/TrendsExplorer.tsx`)
  already carried `data-no-swipe-nav` — verified, nothing to add. But three horizontal scrollers
  did **not**, and a swipe that reaches their scroll edge mid-gesture then navigates (the guard
  re-reads `scrollLeft`, which the native scroll has meanwhile driven to 0). Reproduced on
  `ui/SectionTabs.tsx` — the app-wide tab strip, 406 px of content in 390 px, so a swipe right on
  the tabs of *any* page navigated back. Added `data-no-swipe-nav` there and to the two other
  drag rows of the same kind, `pages/live/comments/CommentFilterBar.tsx` and
  `pages/tools/FriendlyMatchCard.tsx` — `PlayerPicker`/`DuoPicker`, the identical affordance,
  already opted out. This is one attribute per file and is exactly what "swipe always makes
  sense" means; flagged here because the task text only named the matrix and the chart.
- **Finding (not fixed here):** the last unguarded `overflow-x-auto` is `Heatmap` in
  `pages/stats/charts.tsx`, which is **dead code** (`git grep Heatmap` finds no importer). D1/F2
  territory, left alone.
- Scroll restoration (N2) is unchanged and still right: a gesture that pops restores the parent's
  offset (measured 200 → 200 px), a gesture that navigates *up* is a PUSH and opens the parent at
  the top (measured 0).
- Tests: `frontend/src/test/swipeNav.test.ts`, 14 cases over the decision functions only
  (`resolveBackAction` pop/up/fallback/no-fallback/path-vs-query comparison, `swipeAction` for
  the four DoD situations, `canGoForward` incl. "a push after a back drops what it destroyed" and
  "a replace keeps the forward entries"). Suite 335 → 349 in 39 files.
- **Finding — Playwright only.** Chromium's touch adjustment snaps a dispatched touch to a nearby
  button/link, so a verification swipe started next to a guarded element (the tab strip) is
  blocked even though `elementFromPoint` says otherwise. The DoD script therefore picks a start
  point whose whole neighbourhood is free of interactive elements; no app change.
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020) with touch emulation (`isMobile`/`hasTouch`, CDP `Input.dispatchTouchEvent`):
  **30 checks green** at 390×844 (plus one at 320×844) — a match page opened from the Stats H2H
  matchup swipes right to `/live/19?tab=matches` at the top; `/stats` with `idx=0` swipes right to
  nothing at all; `/dashboard` → `/players` → swipe right pops → swipe left returns forward;
  swiping the matrix (and, at 320 px, the genuinely scrolled matrix), the trends chart and the
  section-tab strip never navigates; a match opened from its own tournament pops and the parent
  keeps its 200 px offset; a deep-linked `/profiles/2` swipes up to `/players`.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (641 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1/S5.

---

## N4 — Useful links everywhere (cross-navigation sweep)  ☑

**Why (Roli #2, #3, #7).** Make every identity and every summary a door to its detail page.

Required:
- **Match detail → stats matchup** (`pages/live/MatchH2HPanel.tsx`): the "All meetings →" link
  exists for 1v1 only. Extend: 2v2 → `/stats?view=h2h&mode=2v2&source=both&player=<a1>&vs=<b1>`
  for the opposed matchup, and give each "Team A/B together" card a link to that duo's matches
  (`?view=h2h&sub=duos` with the duo preselected if S2's URL supports it, else the teammates
  modal equivalent). Label them clearly ("All meetings", "All games together").
- **Dashboard cup card → cups** (`pages/dashboard/CupCard.tsx`): the card's header links to
  `/stats?view=overview&sub=cups`; the holder row links to `/profiles/<owner>`.
- **Player identity → profile, everywhere**: avatar+name in `CupDetail` (holder, reign rows,
  per-player table), `CupCard` history rows (the player names inside the row — nest carefully,
  the row itself links to the tournament: use a non-nested layout with two separate links),
  `StatsTable` rows (currently → Player tab; add a chevron/secondary link to `/profiles/<id>`),
  `RecordsView` names, `StreaksView` names, `H2HView` opponent rows, `PositionsView` column
  headers, standings rows (already link), `MatchupView` header avatars.
- **Summary → stats**: profile "Full stats →" exists (S3); add profile Rivals → matchup (S2 did),
  and from a tournament's standings row → `/stats?view=player&player=<id>`.
- Rule to apply and record: a row already carrying a primary link must not nest a second one —
  either split the row into two adjacent links or make the secondary target a small icon button.

**DoD:** a table in Deviations listing every element made clickable and its target; Playwright
clicks through: dashboard cup → cups, cup holder → profile, reign row player → profile,
match H2H (1v1 and 2v2) → matchup, records row name → profile. No nested anchors
(`document.querySelectorAll("a a").length === 0` on every stats page). `npm run check` + build.

**Deviations:** (implemented 2026-09-13, three commits: match detail + dashboard cup,
identity sweep, summary → stats links + the `?sub=` fix)

**Every element made clickable and its target**

| Where | Element | Target |
|---|---|---|
| Match detail · H2H (`MatchH2HPanel`) | "All meetings" under the head-to-head summary — **new for 2v2 and mixed sides**, was 1v1-only | `/stats?view=h2h&mode=<mode>&source=both&player=<a>&vs=<b>` |
| Match detail · H2H | "All games together" under each "Team A/B together" card (2v2) | `/stats?view=h2h&mode=2v2&source=both&player=<p1>&vs=<p2>&rel=together` |
| Dashboard · Cups | cup section header (`DashboardPage`) | `/stats?view=overview&sub=cups` |
| Dashboard · Cups (`CupCard`) | current holder (avatar + name + "holding since") | `/profiles/<owner>` |
| Dashboard · Cups (`CupCard`) | title-history row: the winner's name | `/profiles/<winner>` |
| Dashboard · Cups (`CupCard`) | title-history row: the rest of the row (unchanged target, now a stretched link) | `/live/<tournament>` |
| Dashboard · Overview | "Standings" section header (`StandingsPreviewCard`) | `/stats?view=overview&sub=table` |
| Dashboard · Overview | standings preview row (**changed**: was "open the full table") | `/stats?view=player&player=<id>` |
| Dashboard · Overview | standings preview row: avatar + name | `/profiles/<id>` |
| Dashboard · Overview | "Trends" section header (`TrendsPreviewCard`) | `/stats?view=trends` |
| Tournament page · Standings / Results (`StandingsTable`) | new trailing chart-icon button per row | `/stats?view=player&player=<id>` |
| Stats · Overview · Table (`StatsTable`) | row avatar + name (row body still opens the Player section) | `/profiles/<id>` |
| Stats · Overview · Records | "Most tournament wins" row: the name (row body still opens the Player section) | `/profiles/<id>` |
| Stats · Overview · Records | "Longest runs" player names | `/profiles/<id>` |
| Stats · Overview · Streaks | record row avatar + name | `/profiles/<id>` |
| Stats · Overview · Streaks | "Current" chips | `/profiles/<id>` |
| Stats · Overview · Positions | column header avatar + name (drag still works) | `/profiles/<id>` |
| Stats · Overview · Cups (`CupDetail`) | current holder | `/profiles/<owner>` |
| Stats · Overview · Cups (`CupDetail`) | reign row avatar + name (row body still opens the tournament) | `/profiles/<holder>` |
| Stats · Overview · Cups (`CupDetail`) | per-player table row identity (row body still opens the player's stats) | `/profiles/<id>` |
| Stats · H2H · Players | opponent row name (row body still opens the matchup) | `/profiles/<id>` |
| Stats · H2H · Matchup | both header identities (avatar + name) | `/profiles/<id>` |
| Profile · Overview | favorite-teammate card (was a dead card) | `/stats?view=h2h&mode=2v2&source=both&player=<me>&vs=<teammate>&rel=together` |

- **One primitive, one rule.** New `frontend/src/ui/primitives/PlayerLink.tsx` is the only way an
  identity becomes a link: `<a href="/profiles/<id>">` with `title="Open <name>'s profile"`, click
  and Enter kept from bubbling (so a row with its own `onClick` keeps that action), an optional
  `decorative` flag (an avatar that duplicates the name link next to it → `aria-hidden`,
  `tabIndex={-1}`) and an optional `onClick` for callers that must suppress navigation. Tested in
  `frontend/src/test/playerLink.test.tsx` (4 cases).
- **No nested anchors, two shapes.** Where a row already had a *link* (cup title history, cup
  reigns) the row link became a stretched overlay (`absolute inset-0 z-0`) with the content layer
  `pointer-events-none relative z-10` above it and the identity link `pointer-events-auto` — the
  `ListRow` pattern. Where the row's action was a *button* (Records titles, H2H opponents) the
  button became that overlay. Identity links inside such rows are `inline-block max-w-full` so they
  hug their text: a link stretched over the whole row would have swallowed the row's own action
  (caught in Playwright — the first attempt made the H2H matchup unreachable).
- **`?rel=together` is new.** S2's matchup URL could not address the "Together" relation, which the
  task's "link to that duo's matches" needs. `StatsPage` resets `rel` in `setVs` and `StatsInsights`
  deletes it wherever `vs` is dropped, so only a deep link can set it: an in-app matchup always
  opens on "Against". `MatchupView` takes it as `initialRelation` (seed for its existing local chip
  state) rather than becoming a controlled component — the chips stay a local, immediate toggle.
- **The N2 bug (Records row dropped `?sub=`) is fixed in `canonicalStatsParams`**: a section without
  sub-views (Trends, Player) now *keeps* the `sub` the URL already carries instead of deleting it.
  `resolveStatsView` ignores a sub that is foreign to the active section, so nothing else changes,
  and `subForSection` brings Overview back to Records. Verified end to end (Records row → Player →
  Overview tab → Records, same scroll offset). Known limitation, not fixed: Overview·Records → H2H →
  Overview lands on Table, because H2H overwrites `sub` with its own (`players`/`duos`) — a
  per-section memory would need a second param and is not worth it.
- **Positions column headers are a drag handle *and* a link.** `setPointerCapture` now happens on
  the first real pointer move (>6px) instead of on `pointerdown`: a captured pointer retargets the
  following `click` to the capturing element, which swallowed the tap on the link (verified in the
  browser, both before and after). A click after a drag is additionally suppressed via
  `e.preventDefault()`. Drag behaviour is unchanged (Playwright's synthetic mouse drag does not
  reorder the columns on this build either — identical before and after the change).
- **Not linked on purpose:** the H2H matrix cells and its row/column header names (S8 owns them),
  team names inside a `ScoreLine` (they sit inside the match link — nesting), `MatchHistoryList`
  rows (same reason), and `PlayerProfile`'s header (it already opens the profile).
- Tests: `playerLink.test.tsx` (4 new), `matchupView.test.tsx` +2 (profile links in the header, the
  `initialRelation` deep link), `statsNav.test.ts` rewritten around the kept `sub` +1 — suite at
  **324** (37 files).
- Runtime DoD verified with Playwright against the isolated stack (backend :8003 on a copy of
  `app.db`, vite :8020): **22 + 21 + 25 checks green at 390×844** and a 12-page sweep at 1280×900,
  `document.querySelectorAll("a a").length === 0` on every page touched (dashboard, cups,
  `/live/19`, match detail, all five Overview sub-views, H2H, matchup, profile). Every new link was
  clicked and its landing URL asserted; every row that had an action was re-clicked to prove the
  action survived. N2 re-checked after the sweep: H2H list → matchup → in-view back = same offset
  (424 → 424), profile Matches → match page → back = 700 → 700, Records list offset kept across
  Player → Overview (150 → 150).
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (640 kB
  `index-*.js`); unrelated, as already noted under F1/F2/U1/U4/U5/S1/S5.

---

## S8 — H2H matrix: W-D-L by default, obviously clickable  ☑

**Why (Roli #8).** `pages/stats/H2HView.tsx` defaults `matrixMetric` to `"winrate"`, and the
cells give no hint that they open the matchup (S2 made them do so).
- Default metric `"wdl"`; keep the chip order but put W-D-L first.
- Affordance: cells get `cursor-pointer`, a hover/active lift (`hover:brightness-110`,
  `active:scale-[0.97]`, `transition`), a focus ring, and `title="<A> vs <B> — open matches"`.
  Add one muted hint line under the metric chips: "Tap a cell for every match between two
  players." Cells with no matches stay inert (no pointer, no hint).
- The row/column header names keep selecting a player (unchanged), and get their own
  `cursor-pointer`.

**DoD:** 390px + 1280px screenshots (blue + light) with W-D-L showing by default; hover state
visible in a desktop screenshot; a tap opens the matchup. `npm run check` + build.

**Deviations:** (implemented 2026-09-13)

- **`hover:brightness-125`, not `-110`.** Measured on the real matrix, a 10 % lift on those
  mid-tone cells is invisible next to its neighbours (the DoD asks for a hover state that *shows*
  in a screenshot); 125 % reads clearly in both themes and still looks like the same cell.
  `active:scale-[0.97]` + `transition` + `focus-ring` + `cursor-pointer` are as specified.
- **Long W-D-L strings get `tracking-tight`** (only while the metric is `wdl`). `11-10-5` is
  44.1 px at `text-xs font-semibold` in a 44 px cell, so the widest real pairings wrapped to two
  lines ("11-10-/5"); `-0.025em` brings them to 42 px. No type-size or cell-size change, so the
  matrix still fits 6 players at 390 px without horizontal scrolling.
- **`title` per spec, record moved to `aria-label`.** The cell's title is
  `"<A> vs <B> — open matches"` as written; the W-D-L record the old title carried lives on in
  `aria-label="<A> vs <B>: 7-6-11 — open matches"`, so the accessible name stays informative for
  the metrics that don't show the record (Win %, PPM, …) instead of being just "29".
- **Column headers stay non-interactive.** The task says "the row/column header names keep
  selecting a player (unchanged)", but only the *row* headers ever were buttons — the rotated
  column labels are plain spans. They are left alone (making them selectable is new behaviour,
  not this task); the row header button gets `cursor-pointer` and a
  `title="Show <name>'s head-to-head"`.
- The hint line is `text-[11px] text-text-muted`, matching the other hint paragraphs in this
  file ("Per player across 2v2 matches.", "Strongest pairings…") rather than `DESIGN.md` §5's
  `text-xs`; DS4 sweeps all of them together. It is hidden when no pair has been played
  (`matrixRanges.anyPlayed`), so an empty matrix advertises nothing.
- New `test/h2hMatrix.test.tsx` (4 cases: W-D-L pressed and first, both mirrored cells labelled,
  hint + title + `onOpenMatchup(row, col)` on tap, unplayed pairs render no button and the row
  header still calls `onSelect`, no hint on an empty matrix). Suite 324 → 328.
- Runtime DoD on the isolated stack (backend :8003 on a copy of `app.db`, vite :8020):
  **54 checks green** over blue/light × 390/1280 px — W-D-L pressed by default and first in the
  chip row, the hint visible, every cell `cursor: pointer` with a transition and no wrapped text,
  titles/labels as above, the 6 diagonal/empty `<td>`s inert (`cursor: auto`, no button),
  `filter: brightness(1.1…)` on hover at 1280 px, and a cell tap landing on
  `/stats?view=h2h&vs=5&player=1` with the matchup's "← Head-to-head" back button rendered.
  0 console errors. N2's scroll restoration and N4's links are untouched (the opponent rows'
  `PlayerLink` and the stretched matchup button are not part of the matrix).

---

## S9 — The stats filter pill must not be overlookable  ☑

**Why (Roli #11):** "the pill in stats is easy to overlook." Keep S7's size and shape — increase
its presence:
- Give it an accent-tinted border and a stronger shadow when the filters are **non-default**
  (mode ≠ overall or source ≠ tournaments), plus a small accent dot on the icon — a filtered view
  should be obvious at a glance.
- On first arrival at `/stats` in a session (sessionStorage flag), animate it in with a short
  attention pulse (`framer-motion`, 2 pulses, respects `prefers-reduced-motion`).
- Raise the resting contrast: solid `bg-bg-card-outer` (not `/85`) with a `border-accent/30`
  hairline, and label the mode token even at rest (already) — verify against the page background
  in all five themes.
- Add a matching entry point that cannot be missed: the section's sub-chip row gets a trailing
  compact "Filters" chip on **mobile only** (`lg:hidden`) that opens the same popover; it sits
  inline with the sub-views so it is discoverable while scrolling the top of the page.

**DoD:** screenshots at 390px in blue + light of: default state, filtered state (accent border +
dot), popover open from the pill and from the sub-chip entry. `npm run check` + build.

**Deviations:** (implemented 2026-09-13)

- **"Filtered" counts only the filters the section uses.** On Positions (mode only) a left-over
  `source=friendlies` in the URL changes nothing on screen, so it must not light the pill up:
  `filtered = (showMode && mode !== "overall") || (showScope && scope !== "tournaments")`. The
  state is also exposed as `data-filtered` (and the pulse as `data-pulse`) — test hooks for
  vitest and Playwright, in the house style of `data-score-line`.
- **The "stronger shadow" when filtered is an accent halo**, `ring-2 ring-accent/20` on top of the
  unchanged `shadow-pop`: a bigger black shadow does not read as "filtered" on the dark themes,
  while a soft accent ring around the accent border does, in all five. Alongside it the border
  goes `border-accent/30` → `border-accent/60` and the *changed* token itself turns accent (the
  mode text, the source icon), so the pill says **which** filter is off default, not just that one
  is. At rest the border is `border-accent/30` with `hover:border-accent/60`.
- **Second entry point via a portal, not a second component.** `StatsFilterPill` takes an optional
  `inlineSlot` element and portals its "Filters" chip into it; `StatsInsights` only renders the
  slot (`<span ref={setFilterSlot} className="ml-auto flex shrink-0 lg:hidden" />`). One popover,
  one piece of state, one outside-click guard — the alternative (a second trigger component) would
  have duplicated all three. The popover now anchors to *whichever* trigger opened it: above the
  pill (as before), below the chip; Escape returns focus to that trigger.
- **The chip row became a flex row** (`flex items-start gap-1.5`) with the sub-view `ChipGroup` as
  `min-w-0 flex-1` and the slot trailing it. Right-aligned, the chip lands at the end of the
  *first* line (next to Table · Positions · Streaks) instead of orphaned on a new one, and the
  Overview row is one line shorter than before. Sections **without** sub-views (Trends, Player,
  H2H in 1v1/overall, and the open matchup) render the row too — otherwise exactly the sections
  Roli scrolls most would have had no inline trigger; there the whole row is `lg:hidden` so
  desktop gains no empty row. Cups (no filters) renders neither row nor pill.
- **`chipClass()` is a new named export of `ui/primitives/Chip.tsx`** (the pattern DS6 established
  with `buttonClass()`, same `eslint-disable react-refresh/only-export-components`): the inline
  trigger must carry `aria-haspopup="dialog"`/`aria-expanded`, not the `aria-pressed` every `Chip`
  emits, but it must look exactly like the sub-view chips next to it. It shows the accent style
  while the popover is open *or* a filter is non-default.
- The pulse is `scale: [1, 1.12, 1, 1.12, 1]` over 1.1 s after a 0.45 s delay, gated by
  `sessionStorage["lk:stats-filter-pulsed"]`; the flag is read in the `useState` initialiser (pure)
  and written in an effect, because the repo's `react-hooks/set-state-in-effect` rule forbids the
  obvious `setPulse(true)` in an effect. `MotionConfig reducedMotion="user"` (App root) drops the
  transform entirely under `prefers-reduced-motion`, so no extra guard is needed. Tapping either
  trigger cancels the pulse.
- The accessible name of the floating pill is unchanged (`"Mode: All, Source: Tournaments"`); the
  inline chip is `"Filters — <the same values>"`.
- Tests: `test/statsFilterPill.test.tsx` 12 → 19 cases (filtered flag incl. the
  section-doesn't-use-it case, pulse once per session, the slot trigger's name/haspopup, opening
  and closing from the chip with the popover staying open on a chip tap, focus returning to the
  trigger that opened it, no inline trigger without a slot). Suite 328 → 335.
- Runtime DoD on the isolated stack (backend :8003 on a copy of `app.db`, vite :8020):
  **106 checks green** over blue/light × 390/1280 px — pulse on the first visit and *not* after a
  reload in the same session, solid `bg-bg-card-outer` with the accent hairline, still 95×36 px
  (S7's size) fixed at z-40 with a 16/24 px gutter, popover 8 px above the pill and 8 px below the
  chip with right edges flush and on screen, chip hidden at `lg`, filtering from the chip's
  popover writing `?source=friendlies`, re-tap closing, Escape closing and restoring focus,
  Positions showing mode only, Cups showing nothing, Trends offering the chip without sub-views,
  plus no nested `<a>`, no horizontal overflow and 0 console errors. The resting contrast was
  checked in all five themes (dark/red/green crops too): solid surface, accent hairline visible
  against each page background.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint, as under every
  earlier task.

---

## DS8 — Stats sub-pages made of the same stone  ☑

**Why (Roli #4, #6).** "Records looks very different than Streaks even though it's very similar
information (I prefer like in Streaks). Records also does not use the match result element used
elsewhere. Check all subpages."

Canon for a stats sub-view (add to `DESIGN.md` §6 as "Stats sub-view skeleton"):
`section-head` + `section-label` per block → an optional one-line muted explainer → content
(`List`/`ListRow` rows, `StatTile` grids, or `ScoreLine` rows) → "Show all" as a ghost `Button`.
Category blocks (Streaks' four cards) are the reference look: a `card` per category with an icon,
a title, the explainer, then rows.

- **RecordsView** → rebuilt on that skeleton: "Titles", "Match superlatives" and "Longest runs"
  become category cards like Streaks'; every match row uses `ScoreLine sm` with the tournament +
  date as the row meta (it currently hand-rolls "A vs B  4:6"); ties keep the "+N more" line.
- **StreaksView** stays the reference; align only what differs from the canon (heading sizes,
  "Show all" button style).
- Audit and align **every** stats sub-view: Table, Positions, Streaks, Records, Cups, Trends,
  H2H (players + duos + matchup), Player. Same heading pattern, same explainer style, same row
  primitive, same empty state (`EmptyState`), same loading state (`InlineLoading`).
- **Mode pill (#6):** drop the redundant `1v1`/`2v2` token from the match meta line where the
  context already says it — `MatchOverviewPanel` inside a tournament (the header pill already
  shows the mode) and match rows inside a tournament block. Keep it where a list mixes modes
  (profile/player match history in Overall, matchup in Overall, friendlies list) — i.e. keep
  `hideModePill` logic but invert the default: show only when the surrounding list is mixed.

**DoD:** side-by-side 390px screenshots of Records and Streaks in blue + light showing the same
skeleton; Records match rows visibly use the shared score element; a tournament match card shows
no mode pill while a mixed-mode history list still does. `npm run check` + build.

**Deviations:** (implemented 2026-09-13, four commits: skeleton + canon + Streaks;
RecordsView rebuild; audit pass + the comments header; mode pill + plan/canon)

- **The skeleton is a component, not a convention.** `frontend/src/pages/stats/StatsSection.tsx`
  (`label`, `icon`, `explainer`, `action`, children) renders `section-head` + `section-label`
  (icon first) + the muted explainer + the rows, with the action at `order-1` so the hairline
  runs between label and action (§6). Every stats sub-view uses it; `git grep -n "section-head"
  frontend/src/pages/stats` returns **0**. `DESIGN.md` §6 gains "Stats sub-view skeleton".
- **Category blocks are flat, not cards.** The task says "a `card` per category with an icon";
  Streaks' four "cards" are in fact flat `section-head` blocks on the page surface, and the task
  also says Streaks "stays the reference". Boxing them would have contradicted that *and* §1.2
  ("flat and list-first") and §10 ("don't use a box for numbers"), so the canon records the
  reference as it is: flat `StatsSection`s in a `grid gap-6 lg:grid-cols-2`. Records lost its
  three `inset` boxes and now looks exactly like Streaks.
- **Records' group headings are gone, the categories keep theirs.** "Titles", "Match
  superlatives" and "Longest runs" were a second header level above the per-category headings;
  §6 forbids two header patterns for one block. Each category now heads itself ("Most tournament
  wins", "Biggest win", "Highest-scoring match", "Most goals by one side", "Biggest upset (by
  Elo)", "Longest win streak", "Longest unbeaten streak") — more informative than the group word
  it replaces. No information is lost: the "×N" tie counts moved to the header's action slot,
  "+N more" stays, and the "Across N finished matches." footer is untouched.
- **"Longest runs" stopped being `StatTile`s** (DS4 put them there) and became two category
  blocks with the same row Streaks renders: rank, avatar, name → profile, the date range, the
  "live" marker for an ongoing run and the record length in accent. The tile showed the holders
  as a `hint`; the rows show them as identities, so they are clickable and legible.
- **Records match rows: the `ScoreLine` was already there** (DS2 converted them), so this task's
  work on them was the *link*: they linked to `/live/<t>?match=<id>`, which for a friendly means
  a negative tournament id and a dead page. They use the shared `tournamentMatchHref` now (match
  detail page, `null` for a friendly → an inert row), plus `row-tap focus-ring` like every other
  match row. `RecMatch` drops `tId` for a precomputed `href`.
- **"Show all" as a ghost `Button`** applies where a list has somewhere to go (Cups' "Show all N"
  was bare accent text; H2H's already was a `Button` but sat *after* the hairline). Records'
  ties are not expandable — there is no "all" to show — so they keep the canon's other
  truncation marker, the muted `+N more` line, and Streaks gains that line too: it silently cut
  its records and current runs at five.
- **Empty and loading states.** 11 hand-rolled `<div className="text-sm text-text-muted">…` are
  `EmptyState` (Positions, Table, Player ×2, Club stars, H2H ×5, duo leaderboard/rivalries/
  detail, matchup, Records, Streaks ×2, the trend chart). Two are genuinely new: an empty
  roster in the Table sub-view rendered a header-only table, and an empty Streaks payload
  rendered nothing. Every sub-view already used `InlineLoading`, so loading needed no change.
- **Three small canon fixes found by the audit**, each noted because they are visible:
  `StatsTable`'s "Columns" drops its `section-head` (§6 names "Columns" as a *control* label, so
  it is a bare `section-label` next to its chips, like the friendlies filters); the H2H matrix
  cells go `rounded` → `rounded-md`, the radius §4 gives the positions grid's micro tiles (the
  two grids are the same thing and sat at 4px vs 6px); and the matchup header's separator drops
  `uppercase tracking-[0.14em]` (§6 bans uppercase inside a card) and reads like `ScoreLine`'s
  own lowercase "vs"/"and".
- **Two explainers are new**, not moved: the Cups reign timeline ("Each block is one reign — tap
  it to jump to that row.") had no hint that its blocks are buttons, and Records' seven
  categories needed one line each. Cups' "Held = … · Longest = …" moved from under the table to
  the header, where every other explainer lives.
- **Trends keeps its shape.** Its `Field` labels (Metric / View / Range) are already §6's
  control-label idiom and the chart is the content, so inventing "Chart"/"Controls" headers
  would have been noise; only its empty state changed. Recorded here so the next reader does not
  read it as a miss.
- **Mode pill.** `MatchHistoryList`/`MatchHistoryTournamentBlock`'s `hideModePill` became
  **`showModePill`, default off**. On: profile Overview "Recent matches" and the profile Matches
  tab (no mode filter there — always mixed), stats Player, the H2H matchup and the H2H history
  modal **when the global mode is Overall**. `MatchOverviewPanel`'s `showMode` is dropped from
  the live tournament's Current and Overview panels (the page header pill says the mode) and
  from the dashboard's live-match card (Roli: "match card doesnt have to show 1v1 or 2v2").
  `PositionsView`'s per-tournament mode marker already followed this rule (`mode === "overall"`)
  and is unchanged.
- **The friendlies list keeps the pill hidden** — a deliberate reading of "keep it where a list
  mixes modes". It is hidden *today* (`hideModePill` was set), so nothing is removed, and
  turning it on would print a lie: the list groups friendlies by **date**, and a group's mode is
  computed as `every(r => r.mode === "2v2") ? "2v2" : "1v1"`, i.e. a mixed day would be labelled
  `1v1`. The mode is stated by the list's own Mode filter above it and by the 1-vs-2 names in
  each row. Making day groups honest (splitting them per mode) is new behaviour, not DS8's.
  `showMode` therefore keeps exactly one caller, `FriendlyMatchCard`'s editor preview.
- **`DESIGN.md` updated so the canon stays truthful:** §6 gains the skeleton, §8 loses the `1v1`
  from the hero panel's meta-line example and gains "The mode is not part of a match" (which
  props are off by default and the four places that turn them on), §10 gains the matching
  Do/Don't.
- **The DS3 hand-off is done:** the comments match-block header rendered `4 : 0` with a literal
  colon and its own three-column grid. It is `ScoreLine sm` now (hairline separator, leader
  emphasis, `vs` for a scheduled match instead of `—`), and its club and stars rows hug the
  centre gap the way `MatchSides` does elsewhere. It does **not** adopt `MatchSides` itself:
  that would add a league + flag row to every collapsed block in the feed, and `CommentList`
  receives pre-computed club labels rather than club ids.
- **Known cosmetic point.** At `lg` the category grid's rows are as tall as their tallest block,
  so Records (a 5-row "Most tournament wins" next to a 1-row "Biggest win") leaves holes that
  Streaks, whose four blocks are near-equal, does not. A CSS-columns/masonry layout would pack
  them, but it needs an arbitrary-variant utility (`[&>*]:break-inside-avoid`) that the codebase
  does not use anywhere; the grid is what the canon specifies and what Streaks uses. At 390px —
  one column — it does not arise.
- **Finding for D1 (not fixed here, out of scope):** `pages/stats/charts.tsx` exports four
  components with **zero importers** — `Heatmap`, `WDLDonut`, `StatBar`, `MultiLine` (`Heatmap`
  is where the last `rounded` micro tiles live). `ui/primitives/EmptyState.tsx` still takes an
  `icon?: string` rendered as `<i className={icon}>`, a Font Awesome leftover with no callers.
- Tests: 349 green, unchanged (no behaviour added; the suite asserts on `ScoreLine`, links and
  tiles, none of which changed shape). `npm run check` green before every commit;
  `npm run build` green with the pre-existing "chunks larger than 500 kB" hint (640 kB
  `index-*.js`), as under every earlier task.
- **Runtime verification** (isolated stack: backend :8003 on a copy of `app.db` with match 109
  set to `playing` so the live pages show a real match, vite :8020): 18 routes × blue/light ×
  390/1280 px — the five Overview sub-views, Trends, H2H players + duos, the matchup, stats
  Player, the comments feed, the dashboard, `/live/20?tab=current|overview`, the match detail,
  `/friendlies` and `/profiles/1?tab=matches` — **0 console/page errors, 0 horizontal overflow,
  0 nested anchors** everywhere. Mode-pill assertions in the browser: stats Player in Overall
  renders 17 block pills and in 1v1 renders none, `/friendlies` renders none, and the live
  match card's meta line reads exactly `Match 2 · Leg 1`.

---

## S10 — Match comments & club selection reworked (fewer clicks)  ☑

**Why (Roli #5):** "match comments and select clubs need a rework, they are very cumbersome and
require many clicks. Make sure it's feature equivalent, you can be creative. Find good design
patterns for these (don't forget about friendlies!)."

Read first: `pages/live/TournamentCommentsCard.tsx`, `comments/CommentFilterBar.tsx`,
`comments/CommentList.tsx`, `CommentCreateComposer.tsx`, `TournamentCommentParts.tsx` (goal /
shots entry), `ui/SelectClubsPanel.tsx`, `ui/ClubCombobox.tsx`, `ui/clubControls.tsx`,
`pages/tools/FriendlyMatchCard.tsx`. **Feature inventory first** (write it into Deviations),
then rework. Nothing may be lost: comment/goal/shots entry, author "General" vs self, add-to
match selector, image attach + crop, reply, edit, delete, vote + voters, pin, read/unread jump,
realtime merge; club side A/B pick, per-side game, stars display, national teams, crests.

Direction (approved to be creative, keep it on the canon):
- **Comments composer:** one always-visible input row at the bottom of the feed (like a chat),
  with a single text field and inline icon actions (send, attach image, goal, shots). Choosing
  "goal"/"shots" swaps the row into the compact entry inline instead of opening a separate
  composer; the match/author selectors collapse into two small chips above the field, defaulted
  (current match, self) so the common path is: type → send (1 tap).
- **Club selection:** replace the two-step panel with one `ClubPicker` sheet per side, opened by
  tapping the club slot on the match card: search field focused on open, recent/most-used clubs
  first, league grouping, crest + stars in the row, single tap selects and closes. Same component
  in the live match, the match detail edit tab and the friendly form.
- Keep every write path on the existing API calls; no backend change.

**DoD:** a click-count table (before → after) for: post a comment, post a goal, attach an image,
set both clubs on a live match, set both clubs on a friendly. Playwright walkthroughs of each at
390px (editor stubbed as in DS2/DS7) with screenshots. `npm run check` + build; the comment and
friendly tests still pass.

**Deviations:**

### Feature inventory (written 2026-09-13 *before* any code change — the equivalence checklist)

Every control, path, permission rule and realtime/optimistic behaviour that exists today. The
rework must keep all of it; the checklist at the end of this section is ticked item by item.

#### A. Comments — where the card renders

| # | Site | Props | Notes |
|---|---|---|---|
| A1 | `LiveTournamentPage` Comments tab | all matches, `collapsible={false}`, `focusCommentRequest` | full feed: General + every match |
| A2 | `CurrentGameSection` (live Current tab) | `onlyMatchId={activeMatch.id}`, `showMatchHeader={false}`, `collapsibleHeader="Match comments"`, `collapsible={false}` | collapse state persisted in `localStorage["cmt-collapsed:<tid>:<mid|all>"]` |
| A3 | `MatchDetailPage` Comments tab | `onlyMatchId={matchId}`, all matches, `collapsible={false}` | tab state via `useTabParam` |

#### A. Comments — permissions

- `canWrite` = editor+ (live page `isEditorOrAdmin`, match detail `canEdit`) → composer, reply, pin.
- `canDelete` = **admin only** → the Delete button on every comment.
- `canAttachImage` = `role === "admin" || role === "editor"` (separate from `canWrite`).
- `c.can_edit` comes from the API (author inside the 1 h window, or admin) → Edit button.
- Pin: only a **tournament-scope root** comment, only with `canWrite`, and only when nothing is
  pinned yet or this comment *is* the pinned one (so unpinning stays possible).
- Vote / mark-as-read: any logged-in viewer (`token`), reader sees counts but no buttons.

#### A. Comments — controls (exhaustive)

1. **Scope filter bar** (`CommentFilterBar`, hidden when `onlyMatchId` is set): `All` (total
   count) · `General` (count + unseen dot) · one chip per match **that has comments**
   (`Match N`, count, unseen dot). Horizontally scrollable, `data-no-swipe-nav`.
2. **Entry points**: on a match scope three equal ghost buttons *Add comment · Enter goal ·
   Enter Shots*; on the general scope a single *Add comment*. They open the composer with that
   mode preset. Default scope = `onlyMatchId` → that match, else the active filter if it is a
   match, else General.
3. **Composer** (`CommentCreateComposer`, via `AddCommentDropdown`):
   - *Add to* `FilterSelect` — `General (tournament)` + `Match N — A vs B` for every match
     (only when `onlyMatchId` is null).
   - *Posted as* `FilterSelect` — self (`Me`/actor name) · `General` · `<name> (original)` when
     editing someone else's comment.
   - *Entry type* three buttons (Comment/Goal/Shots) — only when the scope is a match.
   - **Goal**: scoring-side buttons labelled `Goal for <side players>` + `Makes it <next
     scoreline>`; `Minute` number input (1–999, trimmed, truncated); `Player` free text with a
     `datalist` of that side's players, disabled until a side is chosen; optional note textarea.
   - **Shots**: two native `<select>`s 0–50 (plus an empty `–`), labelled with the team names.
   - **Comment**: textarea + (editors) image attach/replace/remove with a 4:3 preview.
   - *Cancel* and *Post* (label/`title` per mode: Post · Post goal · Post shots).
4. **Mode side effects**: switching to `comment` sets the author back to self; `goal`/`shots`
   force author `general`; leaving a mode clears its fields; leaving `comment` clears the image;
   changing the scope to General while in goal/shots falls back to `comment`; changing the goal
   side clears the scorer name.
5. **Validation** (`canSubmit` + a second guard in `upsertComment`): comment needs a non-empty
   body **or** an image; goal needs side + minute + scorer + a resolvable scoreline; shots needs
   both numbers (0–999 accepted, 0–50 offered); an edit needs a body (or a kept image) and must
   be *dirty* (author or body changed).
6. **Feed** (`CommentList`): General block (a `card`) and one `card` per match with a header
   (`ScoreLine sm` + both club names + both star rows), collapsible per block with an unseen dot
   and a count; *Collapse all / Expand all*; recursive reply trees with per-thread collapse and a
   child count; the pinned comment sorts first inside the General list; `EmptyState` per block
   and for the whole feed.
7. **Comment card** (`CommentCard`): avatar + author label · `pinned` / `editing` chips ·
   timestamp + `edited <ts>` · reply-count collapse toggle · mark-as-read (pulsing `Mail`) ·
   Reply · Pin/Unpin · Edit · Delete (with `window.confirm`) · body (`whitespace-pre-wrap`) ·
   image (tap → `ImageLightbox`) · up/down `VoteButton` with counts · voters modal
   (`VoteVotersModal`). Editing renders *Posted as* + a textarea + Save; replying renders a
   textarea + Cancel + Reply.
8. **Focus / flash**: `focusCommentRequest` (notification deep link) resets the filter to `all`,
   polls up to 240 animation frames for `#comment-<id>`, scrolls it to centre and flashes
   `comment-attn` for 1800 ms. The same path runs after create / edit / reply so the new comment
   is scrolled to. `scroll-mt-28 sm:scroll-mt-32` on every card and block.
9. **Realtime**: `comment.upsert` / `comment.delete` / `comment.meta` merge into every
   `qk.commentsTournament(tid)` cache (`applyEvent.ts`) and **preserve the viewer's own
   `upvotes`/`downvotes`/`my_vote`**; every mutation invalidates tournament + comments + read-ids
   + read-map. Read state comes from `useSeenSet(tournamentId)`.
10. **Image upload is two calls**: `POST …/comments` with `has_image: true`, then
    `putCommentImage`; a failed upload shows an error toast and leaves the comment.
11. **Reset**: all draft/edit/focus state resets when the tournament or the acting player changes;
    object URLs are revoked on replace and unmount.

#### B. Club selection — where the panel renders

| # | Site | Wrapper | Extras |
|---|---|---|---|
| B1 | `CurrentGameSection` (live current match, editor) | `inset p-0`, auto-open when a side has no club | autosaves each change (`queueAutosave`), uses `onChangeClubs` for the random pair |
| B2 | `MatchDetailPage` Edit-result tab | `card p-0`, `defaultOpen={false}`, `narrowLayout` | `extraTop` = Game input + "Loading clubs…", `extraBottom` = tip line; saved with the rest of the form |
| B3 | `FriendlyMatchCard` (new friendly) | `inset p-0`, `defaultOpen`, `showSelectedMeta` | labels are the team names, state persisted in `localStorage["friendly_match_state_v1"]` |
| B4 | `FriendlyMatchesListCard` editor (admin, stored friendly) | `inset p-0`, `defaultOpen={false}`, `narrowLayout` | `extraTop` = Game input |

#### B. Club selection — controls

1. Collapse header *Select clubs* (`ShieldHalf`), open by default only when a side is clubless.
2. Per side a `ClubCombobox`: trigger = crest badge + name + `4.5★`; portal panel with a search
   field (focused ~30 ms after open, searches name **and** league), a *Clear selection* row when
   a club is set, `ArrowUp`/`ArrowDown`/`Enter` keyboard control, mouse-enter highlight, rows with
   crest/flag badge + name + flag + league + `Stars` + a check on the selected one, "No clubs
   found" empty state, flip-above placement, outside-click/Escape close.
3. `ClubStarsEditor` per side (editor/admin only, renders `null` for readers): a ghost button with
   an overlaid native `<select>` that `PATCH /clubs/{id}` the club's `star_rating` (0.5–5 in half
   steps), optimistic local value, error toast, invalidates `qk.clubs()`.
4. *Random matchup* (`Shuffle`): crypto-random, **respects both filters**, never the same club and
   never a national team against a club team (`randomClubAssignmentOk`); prefers `onChangeClubs`
   so a call site can save both sides in one write.
5. Filters (narrow the comboboxes **and** the random pool): *Stars* (All + 0.5…5) with a dice
   button that animates ~700 ms and lands on a star step that actually exists in the current
   league selection; *League* (All + every league present in the club list).
6. `ensureSelectedClubVisible` keeps the selected club in the list even when the filters exclude it.
7. `showSelectedMeta` renders flag + league name + stars under each side.
8. Club list sorting: stars desc, then name (`sortClubsForDropdown`).
9. `disabled` propagates from the call site (saving, loading, no permission) to every control.
10. National teams render their nation flag instead of a crest (`nationalTeamNation`), crest
    precedence crest → flag → monogram (`ClubBadge`).

### What was built (implemented 2026-09-13, four commits: inventory, club picker, composer, polish)

**Club selection** — new `frontend/src/ui/ClubPicker.tsx` (`ClubPicker` sheet + `ClubSlot`), with
the star/league filter state lifted into `useClubFilters` in `ui/clubControls.tsx`.
`ui/SelectClubsPanel.tsx` is rewritten around them and keeps its name and its four call sites
(`CurrentGameSection`, `MatchDetailPage` edit tab, `FriendlyMatchCard`, `FriendlyMatchesListCard`).
`ui/ClubCombobox.tsx` had no other user and is **deleted** (its two symbol cases live on in
`test/clubPicker.test.tsx`).

**Comments** — new `frontend/src/pages/live/comments/CommentComposer.tsx` (the chat row +
`CommentSendRow`, which the reply box also uses). `TournamentCommentsCard` renders it at the
bottom of the feed; `pages/live/CommentCreateComposer.tsx` and `AddCommentDropdown` /
`ScopeActionButton` in `TournamentCommentParts.tsx` are **deleted** (no callers left). The shared
composer types moved into `pages/live/tournamentCommentTypes.ts`.

### Click counts (taps on screen, typing excluded; the tap that focuses a field counts)

| Task | Before | After |
|---|---|---|
| Post a comment (match detail / live Current) | **3** — Add comment → focus field → Post | **2** — focus field → Send · **1** for the next one (the caret stays in the field) |
| Post a comment on a specific match from the tournament feed | **5** — Add comment → open "Add to" → pick match → focus → Post | **4** — open "Post to" → pick match → focus → Send · **2** when the feed is already filtered to that match |
| Post a goal (1v1) | **5** — Enter goal → side → focus Minute → focus Player → Post goal | **3** — Goal → side (minute focused, scorer prefilled) → Send |
| Post a goal (2v2) | **5** | **4** (the scorer still has to be chosen) |
| Post shots | **5** — Enter Shots → select A → select B → Post shots (+ the entry tap) | **4** — Shots → select A → select B → Send |
| Attach an image | **5** — Add comment → Attach → Choose → Use image → Post | **4** — 🖼 → Choose → Use image → Send |
| Set both clubs on a live match (both empty) | **4** — combobox A → row → combobox B → row | **3** — slot A → row → row (the sheet moves to the empty side) |
| Set both clubs on a live match (replacing a set pair) | **5** (+1 to expand the collapsed panel) | **4** |
| Set both clubs in the match-detail edit tab | **5** (the panel starts collapsed there) | **3** |
| Set both clubs on a friendly (new friendly form) | **4** | **3** |
| Set both clubs on a stored friendly (admin editor) | **5** (collapsed panel) | **3** |

### Feature-equivalence checklist (every inventory item, verified at runtime unless marked)

**Comments** — ☑ all three render sites · ☑ `canWrite` / `canDelete` / `canAttachImage` /
`can_edit` / pin rule / vote+read need a token · ☑ scope filter bar (All · General · per-match
chips with counts and unseen dots) · ☑ post a comment · ☑ post a goal (side + next scoreline,
minute 1–999, free-text scorer with the side's players as suggestions, optional note) · ☑ post
shots (0–50 per side, 0 valid) · ☑ image attach / replace / remove / 4:3 preview · ☑ author
"General" vs self · ☑ "Add to" match selector (now "Post to") · ☑ every validation rule, incl.
"an image alone is enough" and "a goal needs side+minute+scorer" · ☑ goal/shots fall back to a
comment when the scope is not a match (now *derived*, so the feed's filter can't strand the row)
· ☑ reply · ☑ edit (incl. the "(original)" author option) with the dirty check · ☑ delete with
`window.confirm`, subtree included · ☑ vote up/down + voters modal · ☑ pin/unpin, pinned first ·
☑ mark-as-read + unseen dots · ☑ thread collapse with child count · ☑ match-block collapse +
Collapse all/Expand all · ☑ match-block header (ScoreLine + clubs + stars) · ☑ image lightbox ·
☑ notification deep link (`?comment=`) scrolls to and flashes the comment · ☑ empty and loading
states · ☑ the "Match comments" collapsible on the live Current tab (localStorage) · ☑ realtime
merge and cache invalidations (untouched; `applyEvent` still preserves the viewer's votes) ·
☑ reader sees the feed and the counts but no composer.

**Club selection** — ☑ all four render sites · ☑ per-side pick · ☑ clear ("No club") · ☑ search
over club **and** league name · ☑ crest / national flag / monogram precedence · ☑ stars in every
row · ☑ selected-club check mark · ☑ "No clubs found" · ☑ keyboard ArrowUp/ArrowDown/Enter ·
☑ Escape and the close button · ☑ star filter · ☑ league filter · ☑ the dice (animated star-tier
roll over the steps that exist) · ☑ Random matchup (crypto RNG, both filters, no duplicate club,
no national-vs-club) and its `onChangeClubs` single-write path · ☑ `ensureSelectedClubVisible` ·
☑ `ClubStarsEditor` per side (editor+ only) · ☑ league + stars shown for the selected club ·
☑ the Game field and the tip on the match-detail tab · ☑ `disabled` propagation · ☑ live-match
autosave still fires per change.

### Deviations and judgement calls

- **The collapse is gone.** `SelectClubsPanel` dropped `wrap` / `wrapClassName` / `defaultOpen` /
  `narrowLayout` / `showSelectedMeta`: the two slots *are* the panel now, always open, and the
  selected league/stars are always visible (what `showSelectedMeta` used to opt into). The
  match-detail tab wraps them in a `card` with a `Clubs` heading, the friendly form in a
  `section-head` "Clubs"; the live match and the stored-friendly editor render them bare, because
  a slot is already an `inset` and `DESIGN.md` §1 forbids a third nesting level.
- **The sheet advances instead of closing** when the side you just set was the only one filled —
  that is where the third tap is saved. It is visible (the two side chips at the top of the sheet
  switch, the subtitle names the side) and reversible (tap the other chip, or Escape). A pick
  that leaves nothing empty closes the sheet, as the plan asked.
- **Search is focused on open**, per the plan's direction. On a phone that opens the keyboard
  immediately and the list shrinks to ~4 rows until you type or dismiss it. The recents sit above
  the fold, so the "same clubs as last time" case still works; if Roli dislikes the keyboard,
  the fix is one line in `ClubPicker`.
- **League grouping only while browsing.** Groups are ordered by the league's best star rating
  (so Bundesliga/Premier League still lead, as the old stars-first sort did) and rows inside a
  group drop their league line. A search result is a flat list with the league in each row.
- **Recents are per browser** (`localStorage["club_picker_recent_v1"]`, 6 entries, written on
  every pick) — there is no API for "most used", and inventing one would have meant a backend
  change, which the task forbids.
- **The stars editor stays next to the slot**, not inside the sheet: it is a one-tap native
  control today and burying it behind the sheet would have cost a tap. The slot therefore shows
  the star *glyphs* only for viewers who cannot edit; editors see `ClubStarsEditor`'s
  `4.5★ ▾` button in the same spot, so the rating is visible either way.
- **The club filters moved into the sheet** (that is where the list is), but *Random matchup* and
  the dice stayed on the panel because they act on both sides at once. So the panel shows a
  "Club list filtered: 4.5★ ✕ · Bundesliga ✕" line whenever a filter narrows the random pool —
  the one thing that was implicit before.
- **The match card's own club rows are not the tap target.** The plan's direction says "opened by
  tapping the club slot on the match card"; `MatchOverviewPanel`/`MatchSides` is a read-only
  primitive used on ~8 read-only surfaces, and on the live page the whole panel is already a link
  to the match detail. The slots sit directly under the panel instead. The cost is that the club
  names appear twice on that screen (once in the score panel, once in the editable slots).
- **The composer is sticky, not fixed**: `sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))]
  lg:bottom-4`, so it floats above the bottom tab bar while the comment section is on screen and
  scrolls away with it — a fixed bar would have covered the page on every other tab.
- **There is no Cancel button any more** (the composer is never "open"): clearing the field is
  the cancel, and goal/shots entry carries an ✕ that returns the row to a comment.
- **The author control is a toggle chip**, not a select: after the edit form got its own state
  the composer only ever has two options (self / General), so a select would have been a menu
  with two entries. The third option, `<name> (original)`, still exists where it is reachable —
  the inline edit form in the comment card.
- **Two coupling bugs fixed on the way** (both would have been visible now that the composer is
  always on screen): starting an inline edit used to overwrite the composer's draft, because both
  shared `draftAuthor`/`draftBody`; and a comment image only appeared after some unrelated
  refetch, because `has_image` is derived from the stored file while the create call's
  invalidation ran *before* the upload. The edit now has `editAuthor`/`editBody`/`canSaveEdit`,
  and the upload goes through a new `putImageMut` in `useCommentMutations` that invalidates after
  itself. `CommentCardContextValue` renamed accordingly (`editingDirty`→`editDirty`,
  `canSubmit`→`canSaveEdit`, `upsertComment`→`saveEdit`).
- **Focus is returned to the field after posting** (`focusNonce`): clicking Send moves focus to
  the button, which then disables itself, so the caret would otherwise land on `<body>` and the
  second comment would cost an extra tap.
- **Thread depth cue (the DS3 hand-off).** A root comment is the boxed `inset`; a reply is a flat,
  tighter row (`px-3 py-2`) on the block's own surface, hanging off a 2px `border-accent/25` rule
  with a 8px indent. Fill, padding, indent and rule now all say "reply", and no fourth surface
  was needed. `CommentCard` no longer hardcodes `p-3` — the surface class brings its own padding
  (`.inset` already has `p-3`, so this also removes a double declaration).
- **Friendlies** use the same `SelectClubsPanel`/`ClubPicker` in both places (the new-friendly
  form and the admin editor of a stored friendly) and were walked through explicitly. They have
  no comments at all (comments are tournament-scoped), so the composer does not apply there.
- `DESIGN.md` §7 gains two rows (`ClubSlot` + `ClubPicker`, `CommentComposer`) and `AGENTS.md` §2
  replaces the deleted `ClubCombobox` in the `src/ui/` list — rule 7, D1 re-checks.

### Verification

- **Checks:** `npm run check` green before every commit — 40 test files, **369 tests** (349
  before; +11 `clubPicker.test.tsx`, +11 `commentComposer.test.tsx`, −2 with the deleted
  `clubCombobox.test.tsx`). `npm run build` green, with the pre-existing "chunks larger than
  500 kB" hint (639 kB `index-*.js`), as under every earlier task. No backend change, so no
  `make test` / `make gen-types` run was needed.
- **Runtime (isolated stack:** backend :8003 on a copy of `app.db` with a scratch secrets file
  giving a real admin login, vite :8020 — so every walkthrough below is a *real* write through
  the existing endpoints, not a stub): **six Playwright suites, 245 checks green**, blue + light,
  390 px throughout and 1280 px for three of them —
  club picker on the live match (28), on the match-detail edit tab and both friendly forms (44),
  the composer on the match detail (36) and on the live tournament tab (48), images/votes/edit/
  delete/pin (21), reader + notification deep link + sticky offsets (48), plus a 44-check
  feature-equivalence sweep and a 2-check screenshot gallery. Every suite also asserts 0 console
  errors, no horizontal overflow and (where relevant) no nested `<a>`.
- **Screenshots** (390 px, `blue` and `light`, in the session scratchpad):
  `s10-01-live-current`, `s10-02-club-picker`, `s10-03-club-picker-search`,
  `s10-04-club-picker-advanced`, `s10-05-composer`, `s10-06-goal-entry`, `s10-07-shots-entry`,
  `s10-08-thread-depth`, `s10-09-tournament-comments`, `s10-10-match-edit`,
  `s10-11-friendly-new`, `s10-12-friendly-picker` — plus the per-suite interaction shots
  (`cmt-*`, `club-*`, `final-filter-chip-*`).

---

## D1 — Documentation pass (runs LAST, after every other task)  ☑

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

**Deviations:** (implemented 2026-09-13, three commits: READMEs, `AGENTS.md`/`DESIGN.md`
re-check, dead code + bookkeeping)

**Three of the task's own bullets were already stale** — the code moved after the plan was
written, so they are recorded rather than followed blindly:

- *"fix the comments-summary path"* and *"add `POST /stats/h2h-matches`"*: both were **already
  correct** in `README.md` (`GET /tournaments/comments-summary`, `POST /stats/h2h-matches`).
  F2 deleted the *other* path, `GET /comments/tournaments-summary`, which the README never
  mentioned. Nothing to fix; the h2h-matches entry gained its real request body instead.
- *"Font Awesome bundled locally (no runtime CDN)"*: DS7 **removed Font Awesome entirely**
  (dependency, CSS import and all 41 files). Writing the bullet as given would have documented a
  dependency that no longer exists, so the README says "no runtime CDN: icons are bundled
  `lucide-react` components, flags come from `flag-icons`, crests from our backend".
- *"§10 gotchas (drop the FA-CDN item)"*: F1 already dropped it; §10 had no Font Awesome bullet
  left to remove.

**Every documentation claim that had to be corrected** (each verified against the code first):

| Where | Claim | Reality |
|---|---|---|
| `README.md` | a "Tournament status" section documenting `PATCH /tournaments/{id}/status` | no such route exists (full route dump of `app/routers/*.py` + `main.py`); status is derived in `app/tournament_status.py`. Section rewritten to say so |
| `README.md` | Caddyfile example with `encode gzip` and an `@api path /api/* /docs* /openapi.json /ws/*` matcher | `deploy/Caddyfile` is `encode gzip zstd` + `handle_path /api/*` (strips) + `handle /ws/*` (does not). Replaced verbatim, with a note about the asymmetry |
| `README.md` | Editor role does "status changes" | there is no status write; editors do results/clubs/reorder/swap-sides/second leg/comments |
| `README.md` | stats page = "trends, h2h, streaks, ratings, player match history, stars performance" | one layout, four sections + sub-views + the Matchup drill-in; the real Trends metrics are Points/Goals/Conceded/Goal diff/Win %/Elo/Form |
| `README.md` | three-container Docker list with no build details | the frontend image builds on `node:22-alpine` with `npm install` (not `ci`), backend on `python:3.11-slim` |
| `README.md` | "Backend tests: `cd backend && make test`" | `backend/Makefile` defaults `PY ?= python3`; only the root `make test` passes the venv interpreter. Also added the Node ≥ 20.19/22.12 requirement, `.nvmrc` and `scripts/node-env.sh` |
| `README.md` | maintenance commands `cd backend && python manage.py seed --file ./seed.json --secrets ./secrets.json` | `backend/seed.json` does not exist (`backend/data/seed.json` does) and `--secrets` already defaults to `backend/secrets.json`. Rewritten from the repo root, plus the three backup/sync commands |
| `README.md` | WebSocket list missing `/ws/players/{id}` | that channel exists (`app/main.py`) |
| `frontend/README.md` | pages list = `/tournaments`, `/live/:id`, `/clubs`, `/players`, `/login` | 13 routes + 2 legacy redirects + the `*` 404. Replaced with the real table incl. `?tab=` keys per page and the min role |
| `frontend/README.md` | `cp .env.example .env` | Vite reads `.env.local`; `.env.example` points at :8001 |
| `AGENTS.md` §2 | backend ≈ 14.7k LOC, frontend ≈ 29k | measured 13.3k / 27.2k (+4.7k tests) |
| `AGENTS.md` §2 | `stats/` service list missing `h2h_matches`; `comments_summary`/`guestbook_summary` unlisted | added |
| `AGENTS.md` §3 | "baseline 115 tests" / "158 tests in 18 files" | 130 backend, 369 in 40 files frontend |
| `AGENTS.md` §5 | "there is a `PATCH /tournaments/{id}/status` mention in the README" | there no longer is (D1 removed it) |
| `AGENTS.md` §9 | style idiom recommends `text-[11px]` | DS4 banned arbitrary `text-[Npx]`; the idiom is `text-xs` / `.text-micro`. Also: the phone width is 390px, not 375px, and both `blue` and `light` are checked |
| `DESIGN.md` §3 | "`Card`, `CardSection` and `CollapsibleCard` take `variant`" | `CardSection` has no `variant` — it *is* an `inset` and takes `padded` |
| `DESIGN.md` §4 | "`rounded-md` only for micro tiles (positions grid)" | DS8 moved the H2H matrix cells to `rounded-md` too; directional radii (`rounded-b-2xl`, `rounded-t`, `rounded-r`) exist and are now documented as partial edges |
| `DESIGN.md` §7 | `Chip` selected = "`ring-accent/40`" | DS1 made it `border-accent/40` (equal heights); `chipClass()` is an export now. `PlayerLink` (N4's rule) was missing from the table |
| `DESIGN.md` §8 | scheduled = dash pair "(hero)" or `vs` "(`sm`)" | the dash pair covers `hero` **and** `md`; only `sm` renders `vs` |
| `DESIGN.md` §9 | source icon carries an `sr-only` label; pill = capsule + popover | S7 replaced the per-token `sr-only` with one `aria-label` (concatenation made the name unreadable) and S9 added the filtered border/halo/dot, the once-per-session pulse and the inline "Filters" chip — none of which §9 described |
| `frontend/src/styles.css` | `.text-micro` comment "badges and superscript counters only" | §5 was widened to markers (unit captions, fixed-width indicators, the bottom-bar labels) in `4d2d11b` |
| `frontend/src/themes/defaults.css` | "`--color-live` … is invariant across themes" | `light.css` overrides it to red-600 (DS2) |

Statements that were **re-verified and left alone**: the ports (backend :8001, frontend dev
:8000), `frontend/.env.example` (:8001, fixed by F2), the cups-config semantics, the media
layout, the role model, the push setup, the `/api` vs `/ws` proxy rule, the deploy checklist,
`1v1 supports 3–6 / 2v2 supports 4–6` (enforced in `_generate_schedule_for_tournament`), and
every `DESIGN.md` §1/§2/§5/§6/§10 claim (checked by grep — see the canon's new header line).

### Dead code (the findings earlier workers left for D1)

Each was re-verified with `git grep` over `frontend/src` plus a scripted export sweep (every
`export` in every non-generated, non-test file, cross-referenced against every other file).

**Deleted:**

| What | Evidence | Note |
|---|---|---|
| `ui/primitives/Meta.tsx` (`Meta`, `MetaRow`) | `git grep "primitives/Meta"` → 0; no file imports either symbol | DS4's finding |
| `pages/stats/charts.tsx` → `Heatmap`, `WDLDonut`, `StatBar`, `MultiLine` | `git grep -n "Heatmap\|WDLDonut\|StatBar\|MultiLine" frontend/src` → only their own definitions | DS8's finding. `Heatmap` held the last unguarded `overflow-x-auto` (N3's finding), so that closes too. `Radar`, `Sparkline`, `TrendChart` stay (4 importers); `GREEN`/`AMBER`/`RED` are still used by `Sparkline`. 432 → 243 lines |
| `ui/primitives/EmptyState.tsx` → the `icon?: string` prop | the only `icon` hit in the whole repo was the prop's own declaration; it rendered `<i className={icon}>`, i.e. a Font Awesome glyph after DS7 deleted the dependency | DS8's finding — a trap, not just dead |
| `ui/primitives/SectionHeader.tsx` | `git grep "\bSectionHeader\b"` → 1 hit, its own `export default` | found by the sweep; same class as `Meta` (a pre-canon header helper §6 replaced) |
| `ui/primitives/SectionSeparator.tsx` | `git grep "\bSectionSeparator\b"` → 1 hit, its own `export default` | found by the sweep |
| `ui/theme.ts` → `matchPalette` | `git grep "\bmatchPalette\b"` → 1 hit, its own definition | DS2 removed its last caller (`MatchHistoryList`'s `nameColorByResult`) and §8 forbids tinting a row by result. `matchStatusPill` / `tournamentStatusPill` / `tournamentPalette` / `tournamentStatusUI` all keep callers |

**Kept, with the reason:**

- `utils/format.ts` → `fmtMonthDate` (T1's finding) **and**, found by the same sweep,
  `parseDateSafe` and `wrapTwoLinesWords`: all three are referenced only by
  `src/test/format.test.ts`. They are 5-line pure generic formatters in a utils module, fully
  tested, and deleting them only removes passing tests — so all three stay and are named in
  `AGENTS.md` §11 as a known, deliberate exception. Deleting `fmtMonthDate` alone (the only one
  the plan names) would have left the same situation twice over.
- `ui/motion/motion.ts` → `fadeUp`, `sheetUp`, `listStagger`: unused today, but this file is a
  small named *vocabulary* of framer-motion presets (`fade`, `drawerLeft`, `scrim`, `popover` are
  in use) and the three are 3–4 lines each. Recorded, not deleted.
- Unused API wrappers (`adminPatchMatch`, `generateSchedule`, `deleteCommentImage`,
  `listPlayerPokeAuthoredUnreadSummary`, `deleteCommentImage`) and the re-exported
  `useSeenGuestbookSet` / `useSeenPokesSet` / `useSeenPokesByProfileId`, `scrollElementToTop`,
  `Pill`'s `statusPill` alias: each is a one-line binding to a **live backend route or hook**, so
  they are API surface rather than dead logic. Left alone — removing them is a judgement call for
  Roli, not a documentation pass.
- Exported *types* with no cross-file importer (`CupEra`, `RecentMatch`, `ColDef`, …): they
  document their module's shape and cost nothing.

`npm run check` and `npm run build` were green after the deletions; the suite is unchanged at
**369 tests in 40 files** (nothing tested any of the deleted symbols) and `dist/assets/index-*.js`
is 640.59 kB (the four chart components were already tree-shaken out of the bundle — the win is
in the source, not the build).

---

## Verification gates (after all tasks)

Run on the branch head, 2026-09-13 (Raspberry Pi 5, Node v24.13.0):

1. `make test` → **130 passed**, 9 warnings (run twice on the final tree: 220.03s and 190.41s,
   same count — no flakiness). `make lint` → `All checks passed!`. ☑
2. `make gen-types` → no diff (`git status frontend/src/api/generated/` clean). ☑
3. `cd frontend && npm run check` → tsc clean, eslint clean, **369 tests in 40 files passed**
   (~31s). `npm run build` → green in 7.5s; `dist/assets/index-*.js` 640.59 kB (gzip 196.97 kB),
   `index-*.css` 91.78 kB (gzip 19.08 kB), with the long-standing "chunks larger than 500 kB"
   hint noted under every task since F1. `grep -c "https://" frontend/dist/index.html` → **0**.
   ☑
4. Runtime on the isolated stack: covered **per task** rather than once at the end — every
   UI task in this batch verified its own DoD with Playwright against backend :8003 (a copy of
   `app.db`) + vite :8020 at 390px and 1280px, in `blue` and `light`. The gate's list is covered
   by: S1 (54 checks: every stats section and sub-view, 18 legacy URLs), S2 (98 checks: the
   Matchup flow across Overall/1v1/2v2 × Tournaments/Both), U2 (24 + 5 checks: the bottom bar on
   every page incl. `/live/19`), U3 (18 checks: `/profiles/1?tab=guestbook&entry=<id>`), U1
   (43 checks incl. `/nope` and the login redirect carrying `state.from`), and later S7/S8/S9/
   DS2–DS8/S10 re-swept the same routes (245 checks in S10 alone). D1 itself changes no runtime
   behaviour, so it adds no browser run. ☑
5. DB safety: nothing in this batch touches the schema — no new table, no `_RUNTIME_COLUMNS`
   entry, no backfill. `git diff b56b1fb..HEAD -- backend/app/models.py backend/app/db.py` is
   empty. ☑

## Deployment (later, on Roli's go)

**Not deployed at the end of this batch** — Roli tests the branch locally first, and merging
`feature/2026-09-batch` into `main` is his call. `main` is still `b56b1fb` and that is what
production runs.

When it does go out, the standard `git pull && docker compose up -d --build` (`AGENTS.md` §7) is
all it needs:

- **The frontend image must be rebuilt.** Its base moved `node:20-alpine` → `node:22-alpine`
  (Vite 7 needs Node ≥ 20.19 / 22.12), Vite went 5 → 7, and the whole UI changed. Font Awesome was
  added by F1 and removed again by DS7, so the *net* dependency change is: `@fortawesome/
  fontawesome-free` gone, `vite`/`@vitejs/plugin-react` bumped — nothing new at runtime.
- **Backend changes are minimal:** the duplicate `GET /comments/tournaments-summary` route is gone
  (F2 — the frontend always used `GET /tournaments/comments-summary`), `app/stats.py` moved into
  `app/services/stats/tournament_stats.py`, and the guestbook notification `path` now deep-links
  to `?tab=guestbook&entry=<id>` (U3).
- **No DB migration and no manual server step**: `git diff b56b1fb..HEAD -- backend/app/models.py
  backend/app/db.py` is empty, no `/data/cups.json` edit, no crest sync, nothing to run inside the
  container.
- **Old clients keep working:** every legacy stats URL (`?view=table|stars`, `?section=…`,
  `#trends`) is mapped by `statsNav.ts`, `/tournaments/new` and `/tools` still redirect, and a
  stale `localStorage["stats-experience"]` is simply ignored.

---

## Parked ideas (from Roli while testing the WIP, 2026-09-12 — NOT planned yet)

Recorded so they are not forgotten. Do not implement without an explicit go.

3. **EA FC 27 / multiple games** (researched 2026-09-13, Roli: "not today"). FC 27 releases
   **25 Sept 2026**; EA reveals Club Star Ratings during Ratings Week. Decisions so far:
   - **`game` goes on `Tournament` and `FriendlyMatch`** (nullable, additive via `_RUNTIME_COLUMNS`),
     **not** on the match — a night is played on one game. Backfill every existing row to
     `"EA FC 26"`, **including matches with no club** (Roli confirmed those were all FC 26).
     `Club.game` already exists, is indexed and unique per `(name, game)`; `GET /clubs?game=`,
     `listClubs(game)` and `qk.clubs(game)` already filter.
   - **Stats gain a Game filter** (default Overall) in the filter pill, and the control **is not
     rendered while only one game exists in the data**. Same for the clubs page and the pickers:
     a tournament's picker offers only that game's clubs.
   - **FC 27 clubs exist in the clubs editor immediately but are not selectable until their stars
     are confirmed.** Needs a `stars_confirmed`-style additive flag (a star edit sets it; the
     editor shows a "needs stars" badge + filter). Do **not** solve this by withholding the club.
   - **Import path:** clone the FC 26 clubs (name + league), then set ratings from a published
     list. A complete FC 26 list of 661 clubs (name + star rating) exists at
     `fifagamenews.com/fc-26-team-star-ratings/`; `fcratings.com` is players only and `sofifa.com`
     403s bots. Reuse the fuzzy matcher in `backend/app/tools/sync_club_crests.py` (NFKD
     normalisation, FC/AFC stop tokens, alias map, difflib ≥ 0.85 — it matched 591/597 for crests).
   - **Known gaps in that source:** it is club-only, so the `National (Men)`/`National (Women)`
     teams are missing — carry their FC 26 ratings over instead. EA also adds and drops teams every
     edition and clubs change league (promotion/relegation), so the import must report new,
     missing and moved clubs rather than assume a 1:1 clone.
   - **Already possible today:** star ratings are editable by editors/admins in two places — the
     Clubs page edit panel and, since T2, the club picker's selected row (`ClubStarsEditor` →
     `PATCH /clubs/{id}`). That is how Roli set them last time.
   - **An import must never touch existing FC 26 ratings** (Roli, 2026-09-13) — those are his, set
     by hand. A star import writes only the clubs of the game being imported.
   - **Still open:** whether FC 27 ratings are imported automatically or typed in.

4. **Star-rating history (Roli, 2026-09-13):** "when it has 2 stars and then 3, it should still
   count as 2 stars for stats if played before the change."
   - **Today there is no history.** `Club.star_rating` is a single float (`models.py:168`), a
     `PATCH /clubs/{id}` overwrites it, and `MatchSide` stores only `club_id`. The stats "Club
     stars" view joins *today's* rating onto every historical match, so re-rating a club silently
     rewrites the past. `services/stats/odds.py` also reads the current rating — correct there,
     since odds are a prematch estimate.
   - **Proposal:** a new `ClubStarRating` table (`club_id`, `stars`, `valid_from`, `changed_at`) —
     a new table, not a column, per the project's schema rules. Every star write appends a row;
     `init_db()` seeds one row per club with its current rating. Stats resolve the rating *as of
     the match's date*; anything before the first recorded row uses that first value.
   - **History IS partly recoverable** (measured 2026-09-13, Roli asked): the 11 **production**
     snapshots in `backup/deploy/*/data/app.db` (2026-03-28 → 2026-09-12) contain the full `club`
     table, so diffing them yields **31 star changes across 31 clubs**. Seed the history table from
     those diffs, dating each change at the snapshot where it first appears (conservative: the
     rating changed *no later than* that), then continue live from `PATCH /clubs/{id}`.
     Use **deploy snapshots only** — `backup/local/*` are pre-sync dev copies and interleaving them
     with deploy fakes changes that revert.
   - **Limits of that recovery, state them plainly:** the oldest snapshot is 2026-03-28 while
     tournaments start 2025-10-18, so anything before March 2026 keeps the value recorded then; and
     inside a gap between two snapshots the exact day is unknown (the biggest gap, 2026-04-03 →
     2026-05-31, holds 25 of the 31 changes and contains three tournaments).
   - **Actual impact today is tiny:** only 2 of the 31 re-rated clubs were ever played before their
     change, so exactly **2 of 178 finished match sides** are currently misattributed
     (San Jose Earthquakes 2.0→2.5, Carrarese Calcio 3.0→2.5, both dated 2026-05-31). The value of
     this feature is protecting the *future*, not fixing the past — worth saying out loud before
     anyone spends a day on the recovery half.
   - Cheaper alternative if the history itself is not wanted: snapshot the rating onto
     `MatchSide`/`FriendlyMatchSide` when a match finishes. Exact per match, but it answers
     "what did this match count as", not "how did this club's rating move".

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

---

# Round 4 — Roli's tweaks after testing the finished batch (2026-09-13)

His items, verbatim where it matters, grouped into T2–T8. `DESIGN.md` §9b ("Editing in place")
is the shared decision behind T2 and T3 — read it first; it was written for these two tasks.
Rules for implementing agents, runtime verification and the hard constraints from the top of this
file all still apply. **Check every sibling location for each change** (Roli: "make sure to check
if a change should affect other locations as well").

## T2 — Club selection: show the club once, filters where they belong  ☑

Roli: "it shows the club twice close to each other now (in the score board *and* in the club
selection) … it should only be visible when i open the club selection. not sure if collapsible is
a good idea for that, come up with something nice. to filter leagues or chose stars filter, i need
to click on one players club now -> this is not intuitive. the stars modifier is awkwardly placed
below the club. the buttons for random star and random matchup are unbalanced."

- **The scoreboard is the trigger** (§9b). Delete the two `ClubSlot` rows from
  `ui/SelectClubsPanel.tsx`; the club names already live in `MatchSides` under the score. Make
  the club line of `MatchSides` tappable **when the panel is editable** — a new optional
  `onPickClub?: (side: "A" | "B") => void` on `MatchOverviewPanel`/`MatchSides` renders each club
  line as a button (focus ring, hover, `aria-label="<side players> — select club"`, and a "Select
  club" placeholder with a muted shield when empty). Read-only call sites pass nothing and are
  unchanged.
- What remains under the scoreboard is one controls row: the club filters and the two random
  actions, nothing that repeats a club.
- **Filters move out of the per-side sheet** to that row (they narrow the list for both sides and
  drive Random matchup): a "Filter clubs" `Chip` (accent when active) opens the star/league
  controls — a small popover or an inline row, your call, but reachable without opening a club.
  Keep the active-filter chips with their ✕. `ClubPicker` keeps applying `filters`, and may keep a
  compact read-only indicator of the active filter, but is no longer the only way to set it.
- **Stars modifier**: `ClubStarsEditor` moves out from under each slot into the `ClubPicker` row
  of the *selected* club (editors/admins only), where a star rating is a property of the club
  being chosen. Verify the write path and permissions are unchanged.
- **Balance the random buttons**: the dice (random star filter) and "Random matchup" become one
  row of equal-height controls that share the width sensibly (§9b last bullet).
- Sibling locations: live Current tab, match-detail Edit tab, new-friendly form, stored-friendly
  editor. All four must end up with the same interaction.

**DoD:** no club name appears twice on any of the four screens; tapping a club in the scoreboard
opens the picker on that side; filters reachable without opening a club; stars editable from the
picker; screenshots 390px + 1280px, blue + light, of all four screens; `npm run check` + build.

**Deviations:** (implemented 2026-09-13, three commits: trigger + controls row, runtime polish,
docs/plan)

- **The club line is the trigger, not the whole side column.** `MatchSides` gained
  `onPickClub` + `aLabel`/`bLabel`; only the *name + crest* row becomes a button (a
  `rounded-full` tap target with a quiet `bg-card-chip/40` fill, pulled back by `-mx-2 -my-1`
  so the cluster still hugs the centre gap). The league line and the stars stay read-only text
  under it — wrapping all three rows in one button would have meant restructuring the shared
  three-row grid that eight read-only surfaces depend on. Read-only callers pass nothing and
  render byte-identical (`matchOverviewPanel.test.tsx` asserts "no buttons without
  `onPickClub`"; a Playwright pass re-checked dashboard, live Overview, live Matches and the
  friendlies list in both themes).
- **The empty placeholder is a dashed slot**, not just a muted shield: `🛡 Select club` inside a
  `border-dashed` pill. Judgement call — a filled club reads as a *value* you can tap (solid
  quiet fill), an empty one as a *slot waiting to be filled* (dashed outline, no fill), and the
  two are told apart at a glance on the new-friendly form where both sides start empty.
- **Filters: chip + inline row, not a popover.** At 390px an anchored popover hanging off a
  small chip is a full-width sheet anyway, needs portal/flip code (`StatsFilterPill`'s 50 lines)
  and can be clipped inside the friendlies list editor. The chip (`chipClass`, accent while a
  filter is on, `aria-expanded` + `aria-controls`) toggles the two `FilterSelect`s in the flow
  right below it, with a "`N` of `M` clubs" line and a `Clear filters` ghost button. The
  active-filter ✕ chips sit next to the trigger while the row is *closed* — while it is open the
  selects already say what is on, and §9b's "never show one value twice" applies to filters too.
  The filter row is **not** an `inset`: `FilterSelect` already is one (§1, no surface inside a
  surface of its own level).
- **The controls row is two rows, not one.** `[⚙ Filter clubs] [4.5★ ✕] [Bundesliga ✕]` /
  `[🎲] [Random matchup ………]`. Measured: at 390px the three controls in one row need ~373px of
  the 334px a card leaves, so one of them would have had to shrink or wrap mid-row. Two rows
  also separate the two jobs — narrow the pool, then draw from it.
- **The random pair is balanced by making the dice explicitly secondary** (§9b's last bullet):
  both are `h-10` ghost buttons in one `flex items-stretch` row, the dice a 40×40 icon button
  with a 20px die (was 16px in a box that was already 40px tall next to a 36px button — that
  mismatch is what Roli saw), "Random matchup" `flex-1` with a 16px `Shuffle` + label, centred.
  Capped at `sm:max-w-md` so a 1280px card does not turn it into a 944px banner.
- **`ClubStarsEditor` moved into the sheet, and the sheet pins the selected club.** Burying the
  rating behind a scroll to wherever the club sits in its league group would have cost taps, so
  the picker now shows a `SELECTED` block on top (the club this side has, with its
  `4.5★ ▾` control and the check mark) followed by `No club`, and that club is *not* repeated
  in its league group below — it is listed once. While searching there is no pinned block and
  the editor rides along in the matching row. The row had to become a `<div>` with the tap
  target as an inner `<button role="option">`, because a `<select>` cannot live inside a button.
  Write path unchanged (`PATCH /clubs/{id}`, optimistic value, `qk.clubs()` invalidation) and
  verified at runtime against the DB copy: 1.5★ → 4★ → 1.5★ on a real club. Readers get the
  static `Stars` (the panel passes `starsEditor` only for editor/admin, so `ClubPicker` itself
  stays auth-free and testable).
- **`ClubSlot` is deleted**, not left unused — it had no other caller once the two slots went.
  Its two test cases were rewritten against the new trigger in `matchOverviewPanel.test.tsx`;
  `DESIGN.md` §7 and `AGENTS.md` §2 were updated in the same pass (rule 7).
- **The state is a hook** (`useClubSelection` in `ui/clubControls.tsx`): the trigger now lives in
  `MatchOverviewPanel` and the sheet in `SelectClubsPanel`, which are siblings, so a call site
  calls the hook once and hands the result to both (`selection` prop). `SelectClubsPanel` keeps
  its name, its four call sites and `extraTop`/`extraBottom`.
- **Live Current tab: the "open match details" affordance became a stretched overlay** behind
  the panel (`absolute inset-0`, the club triggers `relative z-10`) instead of a `<button>`
  wrapping the whole panel — a button inside a button is invalid HTML and the outer one would
  have swallowed the club taps. Verified both still work: tapping a club opens the sheet,
  tapping anywhere else opens `/live/21/match/114`.
- **New-friendly form: the club controls moved up**, from the bottom of the form to directly
  under the score preview, so all four surfaces read scoreboard → controls. The `Clubs`
  `section-head` and the "Loading clubs…" line moved with them.
- **`disabled` no longer greys the trigger.** The old slots were visibly disabled while a save
  was in flight; the scoreboard's club line would flicker on every 350 ms autosave, so the guard
  sits in `useClubSelection.openPicker` instead (a tap during a save is a no-op). Every control
  in the panel and the sheet still takes `disabled` as before.
- **Pre-existing, not fixed here (for T8):** in the friendlies list the inline editor is rendered
  into `MatchHistoryList`'s `action` slot, a `shrink-0 self-center` wrapper, so its content is
  ~449px wide inside a 358px row at 390px and gets clipped on the right. Measured on both sides
  of this task: **450px before T2, 449px after** — T2 neither caused nor worsened it, and T8
  already owns "the friendlies list rows".

**Verification**

- `cd frontend && npm run check`: **40 files, 375 tests** green (369 before: +6 net —
  `clubPicker.test.tsx` lost the two `ClubSlot` cases and gained five for the new panel/sheet,
  `matchOverviewPanel.test.tsx` gained three for the trigger). `npm run build` green with the
  pre-existing 500 kB chunk hint (642 kB `index-*.js`). No backend change.
- Runtime, isolated stack (backend :8003 on a **copy** of `app.db` + a scratch secrets file with
  a real admin account, vite :8020), Playwright, blue + light, 390px + 1280px:
  **152 layout checks** over the four surfaces (triggers, "no club name twice" on the surface
  text, filter reachability, the balanced random row, the sheet opening on the tapped side, no
  overflow, no nested `<a>`, no console errors), **20 write-path checks** (autosave on the live
  match, `Save result` on the match detail, the stars editor, the league filter narrowing the
  *random pool*, the dice, reader has no trigger and no stars editor) and **18 read-only
  regression checks**. Every write was made against the DB copy and restored afterwards.
- Screenshots (scratchpad `shots/`): `t2-live-current-{390,1280}-{blue,light}-{rest,filters,
  picker}`, `t2-match-edit-…`, `t2-friendly-new-…-{rest,picker,picked}`,
  `t2-friendly-stored-…-{rest,picker}`, plus `t2-write-{live-after-pick,stars-editor,
  filter-active,random,dice,match-edit-picked}`, `t2-reader-{live-current,picker}` and
  `t2-readonly-{dashboard,live-overview,live-matches,friendlies-list}-390-{blue,light}`.

---

## T3 — Comments: composer attached to the feed, real scorer, better goal buttons  ☑

Roli: "i dont like how the collapsible seems so disconnected to the input fields/comments and im
not sure if collapsible is a good idea here (similar to club selector). the scorer is not the
(human) player but the football player who scored the goal, so pre-filling e.g. 'Rumpi' does not
make sense. the buttons ('Rumpi 1-0') dont look nice."

- **Drop the `CollapsibleCard`** around the comments (`TournamentCommentsCard.tsx:916`) — the feed
  and its composer are the page's content (§9b). Keep the header (title + count + the collapse-all
  control for *threads*, which is a different thing) as a plain section head, and make sure the
  composer reads as one unit with the feed (shared card, composer attached to its bottom edge,
  hairline between feed and composer — not a floating island).
- **Scorer is the football player in the game**, not a human player: drop the human-player
  datalist/prefill (`CommentGoalPlayerOption`, `goalPlayers`) and any prefilling. Free text,
  placeholder naming a footballer (e.g. "Scorer, e.g. Haaland"), optional and forgettable. If you
  want a suggestion list, the only defensible source is *previously typed scorers* in this
  tournament (localStorage, last ~20) — implement that only if it stays simple.
- **Goal side buttons**: today they render the human team label plus the resulting scoreline as a
  chip pair ("Rumpi 1-0"). Redesign as a proper two-option control that shows *which side scores*
  and *the score it makes*, using the app's score vocabulary (`ScoreLine sm` or the same numerals),
  not a text chip. It must be obvious at a glance and work for 2v2 (two names per side).
- Sibling locations: live Current tab (match comments), match-detail Comments tab, tournament
  Comments tab, and the **profile guestbook composer** — check whether it should follow the same
  shape (it is the same "write into a feed" job). Also review the other `CollapsibleCard` users
  (`FriendlyMatchCard`, `FriendlyMatchesListCard`, `ClubsPage`): keep it where it groups a long
  browsable list, drop it where it wraps a page's own content.

**DoD:** no collapsible around a feed or an editor; posting a comment still 2 taps / 1 for the
next; goal entry never suggests a human player; screenshots of all three comment surfaces +
guestbook at 390px, blue + light; the S10 feature-equivalence list still holds; `npm run check`.

**Deviations:** (implemented 2026-09-13, four commits: one card, scorer, goal side control,
siblings; plus this one)

### What was built

- `TournamentCommentsCard` renders **one `card p-0`**: header row → scope filter bar → feed →
  hairline → composer. `CommentList`'s match/General blocks lost their own `card` and are
  hairline-separated `<section>`s of that card (`list-divided`). `CommentComposer` lost its card
  and shadow and is the card's last row.
- The goal entry: no human-player source at all, an optional free-text scorer with a club
  fallback, remembered scorers from `comments/recentScorers.ts`, and a new `GoalSideChoice`
  built on `ScoreNumerals` (newly exported from `ScoreLine`).
- Siblings: the guestbook composer moved to the end of its feed and became the shared
  `CommentSendRow`; the two friendlies cards lost their (unreachable) `CollapsibleCard`.

### Deviations and judgement calls

- **The collapsible Roli saw was not the one the task pointed at.** All three call sites already
  passed `collapsible={false}`, so `TournamentCommentsCard.tsx:916` was dead code; what
  disconnected the input fields from the comments was the **"Match comments" collapse header**
  on the live Current tab (`collapsibleHeader` + `localStorage["cmt-collapsed:<tid>:<mid>"]`).
  Both are gone, along with the `collapsible`/`defaultCollapsed` props; `collapsibleHeader`
  became `title`, a plain section head *inside* the card. Stale `cmt-collapsed:*` entries in a
  browser are simply never read again.
- **How the composer attaches (judgement point): a shared card, hairline, still sticky.** The
  alternative — leaving the feed as a stack of cards and only removing the composer's shadow —
  keeps the "floating island" the task rules out, so the whole feed became one card. That forces
  the match blocks down a level: a block is now a section with a header row and a hairline, not a
  card, which keeps the comment rows at level 2 (`inset`) and never reaches a fourth surface
  (DESIGN.md §1). It also reads better on the tournament feed: one continuous feed with block
  separators instead of 6 boxes. The composer stays `sticky` — inside the card it now floats
  *over* the feed while you read (the rows scroll behind it) and settles flush on the card's
  bottom edge when you reach the end. Measured at 390px: stuck bottom 783px with the bottom tab
  bar at 787px; settled bottom 771px, card bottom 772px.
- **The header is the section head the task asked for**, with the *threads* control kept as its
  one action: `[💬 Comments 37] [Collapse all]` (the block collapse, a different thing from the
  section collapse that was removed; it only shows on the full feed). Its count now counts what
  the feed shows — a match-scoped card says 4, not the tournament's 37, which the old collapse
  header got wrong.
- **The scorer is optional, and an unnamed goal is credited to the club.** The backend requires a
  name (`_goal_scorer_name_for_match`, 400 otherwise) and T3 forbids backend changes, so "leave
  it empty" had to resolve to *something*. The only in-game name the app knows is the club on
  that side, and `34' 1-0 Inter Miami FC` reads like a live ticker — never a human player. This
  is also what keeps a goal at **3 taps** now that nothing is prefilled. The composer says so in
  one quiet line while the field is empty (`No name: the goal goes to Inter Miami FC.`), and asks
  for a name when that side has no club yet (the only case where Send stays disabled).
- **Suggestions are per tournament, from what was typed.** `localStorage`
  `comment_scorers_v1:<tournamentId>`, last 20, offered as up to 4 chips while the field is
  empty — one tap for the second Mbeumo of the night. No `datalist`: on a phone its dropdown is
  inconsistent, and a chip is discoverable without focusing the field first.
- **Two S10 rules dropped with the human-player list**: the scorer field is no longer disabled
  until a side is picked (it is free text about the game, not about the side), and changing the
  side no longer clears a typed name (you corrected the side, not the scorer). Both were only
  there to serve the prefill.
- **The goal side control's shape (judgement point).** Two equal option boxes, `role="radiogroup"`
  / `role="radio"`, each with the side's names (stacked for a 2v2, like a `ScoreLine`) over the
  scoreline the goal would make; the numeral that goes up is emphasised, the other muted, and the
  picked option takes the canon's selected style. To keep the numerals *the same numerals* as
  every score in the app, `ScoreLine` now exports the block it is built from (`ScoreNumerals`) and
  uses it itself — so the control cannot drift from DESIGN.md §8. `CommentGoalTeamOption` carries
  `names` + `nextA`/`nextB` instead of the pre-rendered `nextScoreline` string.
- **The guestbook adopts the row, not the shell (judgement point).** It is the same "write into a
  feed" job, so the composer moved from *above* the feed to its end and became the same
  `CommentSendRow` (one growing line, Send icon, Ctrl+Enter, caret returned via a new
  `postedNonce`), sticky above the bottom tab bar. Its feed is **not** folded into one card: a
  guestbook is a tree of root cards with replies indented up to 8 levels, so a shared shell would
  push those replies to a fourth surface level — a bigger change than "the composer adopts the
  same shape", and the entry cards are not what Roli complained about. The composer is therefore
  the last card of a stack of cards, which is that feed's own language.
- **Other `CollapsibleCard` users**: `ClubsPage` keeps it (league groups are exactly the "long
  browsable list" §9b allows — and it is now the only user left). `FriendlyMatchCard` and
  `FriendlyMatchesListCard` wrapped a page's own content, and their wrapper was **unreachable**:
  `FriendliesPage` is the only caller and always passed `embedded`. The wrapper, the `embedded`
  prop and the `open` gate it fed (query `enabled`, `disabled` on half the controls) are gone;
  the rendered output is byte-identical.
- **Cost, accepted:** in goal entry at 390px with remembered scorers the composer is ~330px tall,
  taller than the sticky slot on the live Current tab, so the Send button sits below the fold
  until you flick once (the page keeps exactly that much scroll room). Trimming it would have
  meant dropping either the suggestions or the "what happens if I leave it empty" line; both earn
  their row.
- `DESIGN.md` §7 (composer + `ScoreNumerals`), §8 (a control that previews a score) and §9b
  (a feed and its composer are one card; only the value a control writes may be prefilled) were
  updated in the same pass (rule 7). `AGENTS.md` needed no change — nothing it claims moved.

### Click counts (taps on screen, typing excluded — S10's table, re-measured in the browser)

| Task | S10 | T3 |
|---|---|---|
| Post a comment | 2, then 1 | **2, then 1** (unchanged) |
| Post a goal (1v1 *and* 2v2) | 3 / 4 | **3** — Goal → side → Send (the minute takes the caret; 2v2 no longer costs more) |
| Post a goal naming the footballer | — | 4 — Goal → side → scorer field → Send (or the suggestion chip instead of typing) |
| Post shots | 4 | **4** (unchanged) |
| Attach an image | 4 | **4** (unchanged) |
| Post a guestbook message | 2, then 2 | **2, then 1** (the caret now stays in the field) |

### Verification

- **Checks:** `cd frontend && npm run check` green before every commit — 40 files, **378 tests**
  (375 before: `commentComposer.test.tsx` 11 → 14, covering "never suggests a human player", the
  remembered-scorer chips, the empty-scorer hint and the two-option side control with its
  numerals). `npm run build` green with the pre-existing 500 kB chunk hint (641 kB `index-*.js`).
  No backend change, so no `make test` / `make gen-types` run.
- **Runtime (isolated stack:** backend :8003 on a copy of `app.db` with a scratch secrets file
  giving a real admin login, vite :8020 — every post below is a real write through the existing
  endpoints): **209 checks green**.
  - *Layout matrix* (144): the four surfaces × 390/1280 × blue/light — the feed is one `card`,
    the composer is inside it, a ≥1px hairline separates them, it is `sticky` and clear of the
    bottom tab bar, no disclosure wrapper around any feed, no `▾/▸` chrome left on the page, the
    header reads "Comments"/"Match comments", the guestbook composer sits *after* the entries and
    is sticky, no horizontal overflow, no nested `<a>`, no console errors.
  - *Write paths + click counts* (30): comment 2 taps then 1 (caret verified on `activeElement`),
    goal 3 taps → `34' 1-0 Inter Miami FC` and the match score 0-0 → 1-0, named goal 4 taps →
    `50' 2-0 Haaland`, the remembered chip then offering exactly `["Haaland"]` and no human name,
    shots 4 taps → `Shots: 7-3`, guestbook 2 taps then 1 — all re-read from the API.
  - *S10 equivalence sweep* (35): filter chips (All/General/per match), block collapse, Collapse
    all/Expand all, "Post to" following the filter, goal/shots offered only on a match scope,
    image attach opening the cropper, author toggle, reply row, Edit/Delete/votes/voters on a
    card, the `?comment=` deep link scrolling and flashing, and a reader seeing every feed with
    no composer, no reply and the guestbook's login hint.
- **Screenshots** (scratchpad `shots/`): `t3-{live-current,tournament-comments,match-comments,
  guestbook}-{390,1280}-{blue,light}` (16), `t3-goal-entry-{390,1280}-{blue,light}` and
  `t3-shots-entry-…` (8), plus `t3-write-{comment,goal-entry,goal-recents,guestbook}`,
  `t3-equiv-{collapsed,deeplink}` and `t3-reader-{live-current,tournament-comments,guestbook}`.

---

## T4 — Stats filter pill: bigger, and the only entry point  ☑

Roli: "i dont like that you put the 'filters' on top again -> the pill alone is enough, but make
it bigger so it cant be overlooked (i like the accent border around it)."

- Remove S9's inline "Filters" chip from the sub-view row (`StatsInsights` slot + the
  `inlineSlot` prop on `StatsFilterPill`); the floating pill is the only trigger.
- Make the pill **bigger**: target ≈ `h-11` with the mode token at `text-sm` and a 16px icon, so
  it reads as a control from across the screen while staying a capsule. Keep the accent border,
  the filtered halo/dot and the session pulse.
- Re-check the bottom-bar clearance and the `pb-*` on the stats root after the size change.

**DoD:** screenshots 390px + 1280px, blue + light: rest, filtered, popover open; no inline entry
anywhere; pill clears the bottom tab bar and the last row; `npm run check` + build.

**Deviations:** (implemented 2026-09-13)

- **Size: 118×44 px** (`h-11`, `pl-3.5 pr-4`, `gap-2.5`, 16px glyphs, the mode token at
  `text-sm font-semibold`) — up from S7/S9's 95×36. Judgement call on "big enough": 44px is the
  platform tap-target size and makes the capsule as tall as a `Button md`, so it reads as a
  *control* rather than a badge, while the width stays ≈30% of the phone's 390px, i.e. still a
  capsule and not a bar. Mode-only sections (Positions) are 77×44.
- **The accent edge is 2px, not a hairline** (`border-2`, `border-accent/45` at rest →
  `border-accent/70` filtered, with S9's `ring-2 ring-accent/20` halo kept). Roli's "i like the
  accent border around it" is the thing that must not be overlookable; at 44px a 1px `accent/30`
  line looked thinner than before, not stronger. The filtered dot grew with the glyph
  (`h-2 w-2`, was `h-1.5 w-1.5`).
- **Everything the second trigger needed is gone, not just hidden:** the `inlineSlot` prop, the
  portalled chip, its `chipRef`, the `triggerRef` indirection, the `"above" | "below"` placement
  in `Anchor`/`popUp` and the `chipClass` import. The popover has one anchor again (above the
  pill, right edges flush). `chipClass` itself stays — `SelectClubsPanel` (T2) and
  `PlayerProfile` still use it.
- **`StatsInsights`' chip row is a plain `ChipGroup` again**: with the slot gone the flex row,
  the `min-w-0 flex-1` on the group, the `ml-auto` span, the `showFilterChip` flag and the
  `useState` import all went with it. Sections without sub-views (Trends, Player, H2H outside
  2v2, the open matchup) now render **no** row at all — S9 rendered an `lg:hidden` row there
  only to host the chip.
- **`pb-16` on the stats root is unchanged and still correct.** Measured at the bottom of the
  longest section (Positions, scrolled to the end): the last content row ends 20px above the
  capsule at 390px *and* at 1280px, and the capsule's bottom sits 15px above the bottom tab bar
  (mobile) — the extra 8px of height ate into a 28px gap, not into the content.
- Tests: `statsFilterPill.test.tsx` 19 → 16 cases — the four `inlineSlot` cases are replaced by
  "is the only trigger the filters have" (the whole tree has exactly one button, none named
  `Filters`) and "keeps the capsule a big, single tap target" (`h-11`, `rounded-full`). Suite
  378 → 376.
- Runtime DoD on the isolated stack (backend :8003 on a copy of `app.db`, vite :8020):
  **124 checks green** over blue/light × 390/1280 px — 118×44 rest / 125×44 filtered, capsule
  radius, `position: fixed; z-index: 40`, the 16/24px right gutter, no `Filters` trigger and
  exactly one pill in all six sections (none on Cups), the clearance measurements above, the
  popover 8px above the pill with flush right edges and on screen, Escape closing it and
  returning focus, no horizontal overflow and 0 console errors.
- Screenshots (scratchpad `shots/`): `t4-{rest,filtered,open,bottom}-{390,1280}-{blue,light}`.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint, as under every
  earlier task.

---

## T5 — Dashboard: cups preview instead of a Cups tab  ☑

Roli: "put the cups preview on the main dashboard page, above trends and below a potential live
tournament. it should show the current cup holders for both (or more) cups and the reign timeline.
make sure to re-use elements from stats cups page and that i can click in dashboard and get to
stats cups page" + "cups tab can go, preview replaces it. for dashboard, i then dont need the
subnavigation on top -> make sure its still consistent with the rest of the app".

- New `pages/dashboard/CupsPreviewCard.tsx`, rendered between `CurrentMatchPreviewCard` and
  `TrendsPreviewCard`: one compact block per cup — holder (avatar + name + "holding since", linked
  to the profile) and the **reign timeline reused from `pages/stats/CupDetail.tsx`** (extract the
  timeline into its own component both can render; do not copy it). The section header links to
  `/stats?view=overview&sub=cups`, and so does the whole block's trailing chevron.
- **Delete the dashboard Cups tab** and, with only one view left, the `SectionTabs` row on the
  dashboard entirely. The page keeps `PageLayout title="Dashboard"` and the section rhythm of the
  rest of the app (`section-head` per block) — check it still looks like a sibling of the other
  pages without a tab strip.
- `?tab=cups` must not land on a dead tab: redirect it (replace) to
  `/stats?view=overview&sub=cups`, and make sure a remembered dashboard URL with that param
  (U6/`lastLocation`) cannot trap the Dashboard tab.
- While you are there: `pages/dashboard/CupCard.tsx` and `CupDetail` now overlap. Keep exactly
  what each surface needs, share the rest, and say in Deviations what is rendered where.
- **Added by Roli while T5 was running:** "if i click on 'Lorbeerkranz' (or other cup) i want to
  get to this location in the stats page and not the top of the stats/cups page" — the preview's
  links carry `&cup=<key>`, the Cups sub-view scrolls to that cup's section and drops the param
  again (one-shot, like `?entry=`), and it must not fight N2's scroll restoration.

**DoD:** dashboard order = live tournament (when live) → cups preview → trends → standings; no tab
strip; both cups visible with holders + timeline; every link lands correctly (a cup's links land
*on that cup's section*, asserted by its bounding box, not just the URL); `?tab=cups` redirects;
screenshots 390px + 1280px, blue + light; `npm run check` + build.

**Deviations:** (implemented 2026-09-13, four commits: shared parts + preview card, tab removal +
redirect + `?cup=`, tests + docs, one visual fix found in the screenshots)

- **What is rendered where after the split.** `pages/dashboard/CupCard.tsx` is **deleted** — with
  the Cups tab gone it had no caller, and its two halves already existed elsewhere. The overlap
  now lives in one new file, `pages/stats/cupParts.tsx`, which both surfaces render:
  `CupHolder` (avatar + name in the cup's colour + "Holding since … · N defended" + a `trailing`
  slot), `CupReignTimeline` (the proportional bar, the pulse on the running reign, the colour
  legend) and `ReignChip` (`×N`, accent while the reign runs) plus the two chip classes.
  **Only on the Cups page** (`CupDetail`): the cup's `card` header, the `Current reign` tile, the
  three record tiles, the full reign list and the per-player table. **Only on the dashboard:** the
  `section-head` with the cup's name and the era pill, and the two links into Stats.
  `CupCard`'s old "Title history" list is *not* reproduced: the Cups page's Reigns list is the
  same data with more of it (took-from / ended-by, `×N`, avatars), so nothing was lost app-wide.
- **How compact the preview is** (the judgement the task left open): per cup one header line, one
  holder line (40px avatar, since-date, `×N` chip) and the timeline + legend — ~130px at 390px, so
  both cups together weigh about as much as the Standings preview. Everything that needs a table,
  a tile row or eight rows of history stayed on the Cups page. Deliberately *not* on the
  dashboard: the reign list, the record tiles, the per-player table, the timeline's "tap a segment
  to jump" (there is no row to jump to — without `onSelect` the bar renders as spans and is
  `aria-hidden`, with the block's link carrying the tap).
- **Two flat sections, not one "Cups" block.** Each cup is its own `section-head` (colour dot +
  name + chevron, era pill as the trailing item), so the dashboard reads *Live now · Bauernkranz ·
  Lorbeerkranz · Trends · Standings* — five siblings of the same shape (T8's rhythm) instead of a
  generic "Cups" label that would have to repeat both names underneath anyway. On desktop the two
  cups share a row (`grid gap-4 lg:grid-cols-2`, `DESIGN.md` §6 "category blocks"); on a phone
  they stack. The grid gap is `gap-4`, matching the page's `space-y-4`, so a cup is not further
  from its neighbour cup than from Trends.
- **Two doors per cup, no nested `<a>`:** the header link (with the chevron) and a stretched link
  behind the whole block (`row-tap -mx-2 px-2 py-2`, the idiom from `pages/live/MatchList.tsx`),
  with the holder's identity above it as its own `PlayerLink` — `document.querySelectorAll("a a")`
  stays 0. The block's content is `pointer-events-none` so the stretched link owns every pixel the
  identity does not; the price is that the segments' hover titles do not appear on the dashboard
  (they do on the Cups page, where the segments are buttons).
- **The `×N` chip stays the reign length** (the S6 idiom the dashboard already used on its history
  rows), not a word: it is accent-coloured exactly like the running segment in the timeline right
  under it, and the defenses are spelled out in the line next to it ("Holding since 11/07/2026 ·
  2 defended"). The `Current reign` tile that carries the same number on the Cups page would have
  doubled the block's height.
- **The dashboard without a tab strip.** `SectionTabs`, `useTabParam` and the `DashTab` type are
  gone from the page; `PageLayout title="Dashboard"` and `space-y-4` stay. Measured at 390px: the
  first section label now sits at y=89, where the tab strip used to start (y=85) — so the page
  begins exactly where its siblings begin and the content simply moved up by the strip's 41px.
  The 4px difference to every other page is the dashboard's pre-existing `space-y-4` (the others
  are `.page`'s `space-y-3`) collapsing through the desktop-only title; left for **T10**, which
  owns the header rhythm. `SectionTabs`/`PageLayout` were not touched.
- **`?tab=cups` redirects *and* un-traps the tab.** `DashboardPage` renders
  `<Navigate to="/stats?view=overview&sub=cups" replace />` and, in the same render, calls
  `forgetLocation("/dashboard?tab=cups")` — U6's own mechanism for a URL that turned out to be
  dead. Verified end to end: with the memory seeded, the Dashboard nav item points at
  `/dashboard?tab=cups`, one tap lands on the Cups page, and the *next* tap opens `/dashboard`.
  `useLocationRestore`'s standalone-PWA resume needs nothing: it overwrites its stored path with
  the new URL on the very next navigation.
- **`&cup=<key>` (Roli's mid-task addition) is owned by `statsNav.ts`**, next to the rest of the
  stats URL scheme (`CUP_PARAM`, `cupSectionId`, `cupSectionHref`), not by the Cups view — that
  also keeps the lazy `StatsPage` chunk out of the dashboard bundle (the preview imports one pure
  module, and `StatsPage-*.js` is still its own 80 kB chunk after the build).
  `CupsView` wraps each cup in `<div id="cup-<key>">` and jumps with the existing
  `scrollToSectionById` helper — but only once **every** cup's query has settled (it subscribes to
  the same `qk.cup()` keys through `useQueries`, so the cache answers and nothing is fetched
  twice). Without that gate the jump lands next to a still-loading first cup and is then 1 200px
  off when its content arrives. It then deletes the param with `replace`, so: it fires once, Back
  lands on a clean URL, and N2 keeps the offset (a `replace` on the same path never moves the
  scroll; the PUSH's restore-to-top is a single rAF that is already satisfied when the jump runs
  ~300ms later). Measured: a POP back to the Cups page restores 600 → 600 px and does not re-jump.
  `cup` is a one-shot param in `lastLocation.ts`, so the Stats tab remembers
  `/stats?view=overview&sub=cups` and never replays the jump.
- **Found, not fixed (for T10/D1):** `ui/scrollToSection.ts` (and the guestbook's
  `focusGuestbookEntry`) offset the sticky header by looking up `#app-top-nav` — **an id that no
  longer exists** anywhere in the app, so both compute a header height of 0. It is harmless today
  *because* the mobile top bar translates itself away on a downward scroll (`-translate-y-full`,
  measured) and is `lg:hidden` on desktop, which is why the cup sections land at y=4 with nothing
  over them. If T10 makes any header stay put, these jumps will land underneath it.
- Small shared-code notes: `orderCups()` (named cups first, `default` last) moved next to the cup
  API so the preview and the Cups page cannot drift apart; `reignSpan()` moved into the pure
  `cupReigns.ts` (keeping `cupParts.tsx` components-only for react-refresh); the timeline carries
  `data-reign-timeline` and each preview block `data-cup="<key>"` as test seams, the house style
  of `data-match-panel`/`data-streak`.
- Tests: new `test/cupsPreview.test.tsx` (9 cases — both cups with holder, since-line and reign
  chip; the two timelines and their legends; both links carrying `&cup=`; no nested `<a>`; the
  empty cup; the timeline decorative vs. selectable, reporting the chronological index; the
  `?tab=cups` redirect; and the remembered-URL trap), plus `?cup=` cases in `statsNav.test.ts`
  and a one-shot-param case in `lastLocation.test.ts`. `swipeNav.test.ts` lost its one reference
  to the now-dead `/dashboard?tab=cups` (it used it as an arbitrary same-path replace; it is
  `/tournaments?tab=new` now). Suite 378 → **389** in 41 files.
- Runtime on the isolated stack (backend :8003 on a copy of `app.db`, vite :8020): **144 checks**
  = 36 per cell over blue/light × 390/1280 px — the section order with and without a live
  tournament, no tab strip, both cups' holder/since/chip/era pill/timeline segments/legend, the
  header and block links, the holder opening `/profiles/3`, the live block still opening
  `/live/21`, `?tab=cups` → the Cups page, the seeded memory trap healing itself, both cups'
  deep links landing with the section's bounding box inside the viewport (390px: y=220 and
  y=1493; 1280px: y=163 and y=1318) and the param gone, Back restoring the offset, the Cups page
  still rendering two sections with selectable segments, no horizontal overflow and 0 console
  errors.
- Screenshots (scratchpad `shots/`): `t5-dashboard-{390,1280}-{blue,light}`,
  `t5-dashboard-nolive-…`, `t5-jump-{bauernkranz,default}-…`, `t5-cupspage-…`.
- **Housekeeping note:** the deletion of `frontend/src/pages/dashboard/CupCard.tsx` was staged by
  this task but committed by a *concurrent* session's `docs(plan)` commit (`92d538b`) — the repo's
  index is shared and that session committed while the deletion sat staged. The file is gone and
  the tree is correct; only the authorship of that one deletion is off.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (643 kB
  `index-*.js`).

---

## T6 — Records and Streaks: no duplicates  ☐

Roli: "make sure there are no duplicates in records that already exist in streaks."

- DS8 gave both views the same skeleton, which made the overlap obvious: the streak records
  ("Longest runs" / win + unbeaten streak categories) appear in **both**. Records keeps what is
  unique to it (titles, match superlatives) and **drops the streak categories**; Streaks stays the
  single home for runs. Add a one-line pointer in Records ("Longest runs live in Streaks") only if
  it does not become clutter.
- Check the reverse direction too, and the neighbours: does Streaks show anything that is really a
  "record" (then move it), and does the profile's streak chips or the Player section duplicate
  either? List the final ownership per fact in Deviations.

**DoD:** every fact appears in exactly one stats sub-view; screenshots of Records and Streaks at
390px; `npm run check` + build.

**Deviations:**

---

## T7 — H2H shortcuts: name them, target them correctly, default to Tournaments  ☐

Roli: "in match details, the 'All meetings' button is a bit weird.. not sure where we call it
'meeting' elsewhere. make it a prominent button so you know at a glance that this brings you to
the h2h details between those 2. in 2v2 case, exact matchup button brings me to first player of
teams matchups (its 2v2, but its not the exact matchup). for all shortcuts here to h2h stats ->
always use 'tournaments' and not both as default." + "in tournament standings, i dont like the
stats button/icon in the table."

- **Wording + prominence**: drop "meetings". The button says what it opens — e.g. "Head-to-head"
  with the two names, or "All matches: Roli vs Flo" — and is a real `Button` (solid or a full-width
  bordered row), not a text link, placed where it reads as the card's primary action.
- **2v2 targets the actual teams.** Today `player=<a1>&vs=<b1>` opens a *player* matchup. Extend
  the matchup URL so `player` and `vs` accept **one or two comma-separated ids**
  (`?view=h2h&player=1,5&vs=2,4`): two ids on both sides → `relation: "opposed"` with
  `exact_teams: true`; one id each → today's behaviour; `rel=together` keeps meaning "these two as
  teammates". Update `statsNav.ts` parsing/canonicalisation, `StatsPage`'s `vs` handling and
  `MatchupView` (header shows both team names; the Against/Together chips only make sense for a
  player pair — hide or adapt them for a team matchup). The backend already accepts
  `left_player_ids`/`right_player_ids` + `exact_teams`.
- **Default source = Tournaments** for every shortcut into H2H stats (match detail, profile rivals,
  profile teammates, anywhere N4 added `source=both`).
- **Remove the stats icon button** from the live standings rows (`pages/live/StandingsTable.tsx`);
  the row already opens the profile, which links on to full stats. Check the dashboard standings
  rows for the same smell and make the two consistent (say which behaviour you chose).

**DoD:** 1v1 and 2v2 buttons both open the right matchup (2v2 shows the team-vs-team record, and
its match list matches the panel's summary); no `source=both` shortcut remains; no icon button in
the standings table; screenshots 390px + 1280px; `npm run check` + build.

**Deviations:**

---

## T8 — One scoreboard surface everywhere  ☑

Roli: "why does the dashboard scoreboard use a different background color than in the tournament
view? consistency!"

- Cause: `CurrentMatchPreviewCard` renders the tappable wrapper as `card` and passes
  `surface="none"`, so the panel sits on the outer card colour, while the live Current/Overview
  tabs render `MatchOverviewPanel` with its default `inset`.
- Make the score panel look the same wherever it appears: the panel is an `inset` in every
  location, and the dashboard's tappable wrapper stays a `card` around it (card → inset is the
  canon) with the tournament name as its header row.
- Sweep every caller: dashboard preview, live Overview, live Current, match-detail edit preview,
  friendly form preview, and the friendlies list rows.

**DoD:** the same rendered background/border for the score panel on all six surfaces (assert the
computed `background-color` of the panel element is identical in a Playwright check); screenshots
390px, blue + light; `npm run check` + build.

**Deviations:** (implemented 2026-09-13)

- **The `surface` prop is gone, not re-pointed.** `MatchOverviewPanel` *is* an `inset`
  (`data-match-panel` marks it, house style of `data-score-line`); there is no longer a way for a
  caller to render the score panel differently, which is what "one scoreboard surface everywhere"
  means. `"card"` had no caller left and `"none"` had exactly one — the dashboard.
- **The dashboard's card wrapper disappears** (the judgement call the task left open). The plan's
  other option was `card` → `inset`, but then the dashboard panel would still *paint* differently
  from the live tabs in the dark themes: `.inset` is `bg-card-chip/50`, so it blends with whatever
  is behind it (measured in blue: 29,40,60 on the page vs 34,47,69 on a card). Dropping the
  wrapper makes the dashboard block and the live Overview "Current match" block the same thing
  pixel for pixel — which is exactly the comparison Roli made — *and* makes the live card a
  sibling of its own neighbours: `TrendsPreviewCard` and `StandingsPreviewCard` are flat
  `section-head` + content blocks, so the live card was the only card on the Overview tab.
  The tournament name moved from the card's `h2` into the `section-head` as its trailing action
  (`<Link>` + `ChevronRight`, the shape Trends/Standings already use), so nothing was lost: the
  name is still there, still a door into the tournament, and the panel itself stays tappable.
- **Five of six surfaces now paint identically; the sixth is the canon working as intended.**
  Computed `background-color`, border and radius are identical on all six in both themes (the
  DoD's assertion), and the *painted* colour is identical in `light` (opaque inset) and on five
  of six in `blue` — the match-detail edit preview sits inside the "Result" `card`, where a
  translucent level-2 box legitimately picks up the level-1 surface behind it (34,47,69 vs
  29,40,60, ~5/255). Flattening that card would have restructured a three-card form (Result /
  Clubs / Advanced) for a difference nobody can see without a colour picker, and making `.inset`
  opaque is a canon-wide DS1/DS3 decision, not T8's. `DESIGN.md` §8 now states both the rule and
  this one exception.
- **The friendlies-list editor is fixed here, as a row-layout bug** (T2 handed it over): it *is*
  one. `MatchRowWithClubs` gained an `expanded` slot (threaded through
  `MatchHistoryTournamentBlock` and `MatchHistoryList` as `renderMatchExpanded`) that renders a
  panel **after** the row at the row's full width; the `action` slot keeps only the two icon
  buttons it was sized for. Measured at 390px: the editor was **449px inside a 358px row**
  (clipped on the right), it is now **358px inside a 358px row**, in both Compact and Details
  view. The editor's own box (`rounded-xl border bg-bg-card-inner p-3`, an off-canon level-2
  surface) is replaced by an accent rail (`border-l-2 border-accent/30 pl-2 sm:pl-3`, the cue
  `CommentList` uses for thread replies), so the score panel inside it sits on the page like the
  others instead of on a third background (it painted 40,54,78 before).
- **Small alignments in the sweep:** live Overview's tap wrapper was `rounded-2xl` around a
  `rounded-xl` inset (a focus ring 4px off the box it framed) and now matches the dashboard's
  wrapper exactly (`focus-ring block w-full rounded-xl text-left transition`). Live Current's
  stretched overlay was already `rounded-xl`; the match-detail, friendly-form and friendlies-list
  panels needed no change beyond the ones above.
- **Not touched, deliberately:** in the friendlies list's *Details* view an expanded row shows the
  clubs twice — once in the row's own `MatchSides`, once in the editor's scoreboard. That is a
  list row next to an editor (not "one screen naming the same value twice", §9b, which T2 fixed
  inside the editor); collapsing the row while its editor is open is a separate decision.
  Also pre-existing and left alone: the new-friendly form offers its club triggers to readers too
  (the form is usable without a login, only saving is not — T2).
- Tests: `matchOverviewPanel.test.tsx`'s "carries the surface class the caller asks for" became
  "is always an inset, on every surface" (asserts `inset` + `data-match-panel`, and that a
  `className` cannot take the surface away); `matchHistoryList.test.tsx` gained two cases for the
  `expanded` slot (rendered after the row, outside the `shrink-0` action slot; nothing extra
  without it). Suite 376 → 378.
- Runtime on the isolated stack (backend :8003 on a copy of `app.db`, vite :8020), blue + light ×
  390 + 1280 px: **132 surface checks** — the six panels' computed `background-color`, border and
  radius identical per theme, `inset` on all six, the panel outside a `card` on five and inside
  the Result card on the sixth, the editor fitting its row, the dashboard header's link target and
  text, no horizontal overflow, no nested `<a>`, 0 console errors — plus **128 behaviour and
  reader checks**: the dashboard panel and its header link both opening `/live/21`, the Overview
  panel switching to the Current tab, the Current tab's club trigger opening the picker while the
  rest of the panel opens the match detail, the list editor opening under its row in both views
  with a working club picker and Cancel, and a reader seeing the same `inset` everywhere with no
  edit affordances. Painted-pixel samples (2×2 patch inside each panel) are quoted above.
- Screenshots (scratchpad `shots/`): `t8-before-…` and `t8-after-{dashboard,live-overview,
  live-current,match-edit,friendly-form,friendlies-list}-{390,1280}-{blue,light}`,
  `t8-list-{compact,details}-…` and `t8-reader-…`.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint.

---

## T9 — Club selection as one self-contained panel (Roli, after testing T2)  ☐

Roli: "im still not happy at all with the club selection. i dont want to see 'filter clubs',
'dice', 'random matchup' all the time -> when i do, i want to be able to select the club there,
and not in the score board. i know that i said i dont want it twice on screen, but i think here
its not avoidable. just make sure the club selection is integrated nice, with either collapsible
or something better -> it should be clear what belongs to it."

T2 got half of it right (one club on screen, filters out of the per-side sheet) and half wrong:
the tools now sit on the card permanently while the value they act on lives somewhere else.
`DESIGN.md` §9b has been amended for this — a *toolbox* may hide behind one named disclosure, and
when it is open it must contain **everything that job needs, including the values**.

- **Collapsed by default**, the match card shows the scoreboard only (clubs read-only, as before
  T2). One trigger — a row or button that names the job ("Clubs", with the two current clubs or
  "not set" as its summary) — opens the panel. Tapping a club in the scoreboard may open the panel
  too, but must not be the only way in.
- **Open**, the panel is one clearly bounded unit (`inset`, its own header, one visual block) that
  holds, in this order: the two club slots (tap → `ClubPicker` sheet, as T2 built), the filter
  controls, then the dice + "Random matchup" row. Repeating the club names here while the
  scoreboard shows them is accepted and expected.
- **Default open where setting clubs is the point**: the new-friendly form (and the stored-friendly
  editor) start expanded; the live Current tab and the match-detail Edit tab start collapsed and
  remember the user's last choice per surface (localStorage, same idiom as `match_list_view`).
- Keep everything T2 achieved: filters act on both sides and on the random pool, stars editing in
  the picker, balanced random row, the four surfaces behaving identically.
- Re-check §9b compliance afterwards: one trigger, one container, nothing about clubs outside it
  except the read-only scoreboard.

**DoD:** with the panel collapsed no filter/dice/random control is visible on any of the four
surfaces; opening it reveals a single bounded block where a club can be picked; the friendly forms
start open; the choice is remembered; screenshots 390px + 1280px, blue + light, collapsed and open,
for all four surfaces; `npm run check` + build.

**Deviations:**

---

## T10 — "Live" once, and a uniform page header rhythm (Roli, 2026-09-13)  ☐

Roli: "in live tournament (or done tournament view): i dont like the 'live' pill there. also not
on top of screen (beside bell) -> it is visible in the bottom row now with the red blinking dot ->
same info in three places, i only want it on the bottom thing." + "the subnavs have a lot of
vertical space above them that feels wasted. i also dont want it to be too cramped. come up with a
nice solution that does not waste space. also, the pills in live tournament/done tournament are
the only thing that uses that area, right? can you find another spot for them, so we can have
uniform subnav bars? (dashboard has none after your changes)"

**A. One live indicator.** Today it says "live" in three places: the tournament header's
`StatusChip` (`pages/live/LiveTournamentPage.tsx`), the top bar's `ui/shell/ConnectionIndicator.tsx`
next to the bell, and the bottom tab bar's pulsing dot (U2). Keep **only** the bottom-bar dot.
- Remove the status pill from the tournament header. Status is still readable from the content
  (a done tournament shows Results, a live one has the Current tab and the pulsing nav dot); if a
  tab body genuinely needs the word, put it there, not in the header.
- `ConnectionIndicator` must stop announcing the happy path: render **nothing while connected**
  and only appear when the realtime connection is reconnecting or offline (that is real
  information the user cannot get elsewhere). Keep it in both shells; check the desktop sidebar
  footer too, which shows the same thing.
- Sweep for other "live" repetitions: the tournaments list row, the dashboard's "Live now"
  section label, the drawer/sidebar "Live now" entry. One per surface is fine — three on one
  screen is not. Say in Deviations what each surface ends up showing.

**B. Uniform sub-navigation.** Every tabbed page should present its tab strip the same way, with
the space above it earning its place.
- Measure first (390px and 1280px, a few pages) and put the numbers in Deviations: today the live
  tournament page has title + a pill row above the tabs, most pages have an empty gap (the title
  lives in the mobile top bar), and the dashboard now has no strip at all after T5.
- Give the tournament pills (mode, date, and anything else that survives A) a new home so no page
  needs a header block above its tabs. Recommendation, yours to refine: fold them into the page's
  first content block — the Overview tab's own meta line — and keep them next to the desktop `h1`
  where there is room. They must stay reachable on a done tournament too.
- Then normalise the rhythm: the same top offset and the same spacing under the strip on every
  tabbed page (`SectionTabs` and `PageLayout` are the two places to change it, not each page), and
  a page without a strip (dashboard) must not look like it lost something. Not cramped: keep the
  tap targets at 44px and the strip's fade affordance from U1.

**DoD:** exactly one live indicator on screen at a time; `ConnectionIndicator` invisible while
connected and visible when the socket drops (force it in the browser to prove it); no page renders
a header block above its tab strip; the vertical offset from the top bar to the first tab is
identical on dashboard, tournaments, live tournament, profile, settings, friendlies, clubs, stats
(assert the measured offsets); screenshots 390px + 1280px, blue + light, of those pages plus a
done tournament; `npm run check` + build.

**Deviations:**
