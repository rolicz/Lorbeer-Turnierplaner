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
   - **The season/year view ships here, not before** (R4b, Roli 2026-09-15: *"fold the 'season or
     year view' into the ea fc 27 changes -> i dont want them now, but when the game arrives i
     want the plan to be ready"*). The two filters answer different questions and must both
     exist, side by side in the filter pill:
     - **Game** ("which edition was this played on") is a property of the *night* — it comes off
       `Tournament.game` / `FriendlyMatch.game`, is exact, and is the filter that makes a club
       comparison honest, because a club is a different thing in FC 26 and FC 27 (different
       squad, often a different star rating).
     - **Season** ("which run of nights was this") is a property of the *calendar*, derived from
       the same `date` the cups and the as-of star ratings already use — nothing new is stored.
       Roli's nights run with the game's year, so the season is a **1 Aug → 31 Jul** window
       labelled by its release (`FC 26` = 2026-08-01 … 2027-07-31), not a calendar year: a
       January night belongs to the season it was played in, not to a new one. A tournament
       before the first release window (everything up to 2026-07-31) falls into one open-ended
       "Before FC 27" bucket rather than inventing seasons backwards.
     - **In practice the two coincide** the day FC 27 arrives, and they will drift apart the
       moment one night is played on the old game after the new one is out — which is exactly
       why Season is derived from the date and Game is stored on the row. Never compute one from
       the other.
     - **Where it applies:** the same surfaces `scope` already reaches — every `/stats/*`
       endpoint that reads matches takes a `season` (or `game`) query param the same way, plus
       the tournaments list and the friendlies list. It does **not** apply to the clubs page or
       the pickers (those are a catalogue of what exists now, and Game alone narrows them), nor
       to a single tournament's own pages.
     - **Cups are already date-scoped and stay that way.** A cup era (`cups.json`, `since`/`mode`)
       is its own timeline and must not be re-cut by a season filter: the Cups sub-view keeps
       showing the full lineage, and a season filter never hides a reign or splits one in two.
       Where a season and an era boundary disagree, the era wins — it is the rule the cup was
       actually played under. The one place they meet is the Overview's per-season summary, where
       "who held what at the end of this season" is a legitimate read of the same fold.
     - **Same rule as the Game control:** the control is **not rendered while the data holds only
       one season**, so nothing changes visually until the second season exists.
     - Default is **All seasons** (like Mode's Overall), and the param is written with `replace`
       like every other stats param (`&season=`, §10's URL scheme).

4. **Star-rating history (Roli, 2026-09-13):** → *implemented as R4 (2026-09-15); the research
   below is what it was built from and the numbers it predicted held.* "when it has 2 stars and
   then 3, it should still count as 2 stars for stats if played before the change."
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

## T6 — Records and Streaks: no duplicates  ☑

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

**Deviations:** (implemented 2026-09-13, one commit)

- **What was removed.** `RecordsView`'s two `LongestRunGroup` blocks ("Longest win streak",
  "Longest unbeaten streak") are gone, with the `getStatsStreaks` query that fed them. They were
  literally Streaks' first row plus every holder tied at it — same number, same date range, same
  `live` marker — so nothing is lost: Streaks shows all four categories, the top five per
  category, the `+N more` line and the current runs.
- **Records keeps a pointer, and the pointer works.** A muted line alone would have been a
  dead end, so the footer row is `Across N finished matches.` + a ghost `Button`
  ("Longest runs in Streaks", lucide `Flame`) that switches the sub-view in place through
  `StatsInsights`' existing `setSub("streaks")` — the same `replace` write and scroll swap the
  sub-view chips use, so Back still leaves `/stats`. `RecordsView` gained one prop,
  `onOpenStreaks`. Verified at 390px and 1280px that it does not collide with the floating filter
  pill (the stats root's `pb-16` keeps the pill 52px below it).
- **Ownership of every fact after the change** (checked in both directions):

  | Fact | Owner | Nothing else shows it |
  |---|---|---|
  | Most tournament wins (rank, count, latest title) | Overview · Records | Cups' "Most titles" is per cup and era/mode-filtered; Positions' laurel markers name one tournament's winner |
  | Biggest win · Highest-scoring match · Most goals by one side · Biggest upset (by Elo) | Overview · Records | — |
  | "Across N finished matches." | Overview · Records | — |
  | Longest win / unbeaten / scoring / clean-sheet run (record rows, ties, date range, `live`) | Overview · Streaks | **was duplicated in Records for two of the four — removed here** |
  | Current win / unbeaten / scoring / clean-sheet run (the "Current" chips) | Overview · Streaks | — |
  | One player's current / personal-record run per category | `PlayerStreakChips` (stats Player + profile Stats tab) | player-scoped, not the field leaderboard: it prints *that player's* best, and only borders the tile when the current run reaches the all-time record |
  | A player's ongoing run inside a tournament | `StreakPatches` in the live standings | a badge on a row, no record value printed |
  | Longest reign · Most titles · Most tournaments held | Overview · Cups (`CupDetail`) | cup-scoped reign facts, not tournament titles and not runs |

- **Reverse direction: nothing moved out of Streaks.** It shows runs only — no titles, no match
  superlatives — so there is no "record" living in the wrong sub-view. Table, Positions, Trends
  and H2H carry neither kind of fact.
- Verification (isolated stack, backend :8003 on a copy of `app.db`, vite :8020): Records and
  Streaks side by side at 390px and 1280px in blue and light — Records' `section-label`s are
  exactly `Most tournament wins · Biggest win · Highest-scoring match · Most goals by one side ·
  Biggest upset (by Elo)` and Streaks' are `Win streak · Unbeaten streak · Scoring streak ·
  Clean sheet streak`; tapping "Longest runs in Streaks" lands on
  `/stats?view=overview&sub=streaks`; 0 console errors, 0 horizontal overflow, 0 nested anchors.
  `npm run check` green (41 files / 389 tests).

---

## T7 — H2H shortcuts: name them, target them correctly, default to Tournaments  ☑

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

**Deviations:** (implemented 2026-09-13, one commit)

- **The button.** `MatchH2HPanel`'s summary card ends in a full-width `Link` carrying the solid
  button look (`buttonClass`, the primitive's escape hatch for a router link) with a lucide
  `Swords` icon: **"All matches: Roli vs Flo"** / **"All matches: Roli / Berni vs Flo / Atzi"** —
  Roli's own example wording, so the button says both *what* it opens and *for whom*. It fits at
  390px without truncating (measured; it `truncate`s if names ever get longer, and the `title`
  spells the whole thing out: "Head-to-head stats: every match … in exactly this pairing").
  The two "together" cards get the same shape one weight down — a **ghost** full-width button
  "All matches as a team" with the `Users` icon — so the exact matchup reads as the primary
  action and the two duo cards stay equal to each other (`DESIGN.md` §9b).
- **The card lost its names line.** With the button carrying the names, the matchup card printed
  them three times (panel header → card label → link). The `label` prop is now optional and the
  main card omits it; the two "together" cards keep theirs, because there the label is the only
  place the duo is named.
- **"Meeting" is gone from the app.** Not just the button: "Recent meetings" → "Recent matches",
  "No finished meetings for this matchup yet." → "…no finished matches…", and the internal
  `recentMeetings` → `recentMatches`. `git grep -in meeting frontend/src` now only hits one test
  name.
- **Two ids per side (the hard part).** `statsNav.ts` owns the shape: `parseMatchupSide` (one or
  two positive ints, junk/zero/duplicates/overflow dropped, URL order kept), `formatMatchupSide`,
  `collapseMatchupSide` and `statsMatchupHref`. `StatsPage` parses `player`/`vs` through it
  (memoised on the raw param so the matchup's request/summary memos stay stable) and passes
  `playerIds` / `vsIds` down; `setVs(ids, withPlayer?)` takes arrays. `StatsInsights` decides the
  matchup from `leftIds`/`vsIds` and **refuses a matchup whose sides share a player**
  (`?player=1,5&vs=1,2` is nonsense). Everything outside the matchup still works on one player:
  `playerIds[0]` feeds the H2H matrix and the Player section, and leaving H2H collapses
  `player=1,4` back to `player=1` — a team only means something inside the drill-in.
- **Single-id URLs are untouched**, by construction and by test: `player=1&vs=2` parses to
  `[1]`/`[2]`, produces the same request (`exact_teams: false`) and the same header as before.
  Verified in the browser with the exact URL shape N4 used to write, `source=both` and all
  (`/stats?view=h2h&mode=1v1&source=both&player=1&vs=2` still opens Roli vs Flo on "Both").
- **What a team matchup looks like.** The header's side component renders each side as one
  identity (`h-10` avatar, `text-base`) or two stacked ones (`h-8`, `text-sm`), every name still a
  `PlayerLink` to its profile (N4) — four links for a 2v2. The caption under it gains a third
  token, `2v2 · Tournaments · exact teams`, because "exact" is the whole difference between this
  list and the subset one. The **Against/Together chips are hidden for a team matchup**: the
  question "were these two on the same side?" only exists for a pair of players, and two teams
  are never teammates (`relation` is forced to Against there, as it already was in 1v1).
- **Names join with " / "** (`Roli / Berni`), the separator `matchupSummary.playerNames` already
  uses in the match page's H2H panel, so the panel and the matchup it opens read the same. The
  score lines keep `teamName`'s `Roli + Berni` — that is `ScoreLine`'s own idiom and untouched.
- **The panel itself moved to Tournaments, not just its links.** The three queries behind the
  match page's H2H numbers asked for `scope: "both"`. Sending the reader to a Tournaments-only
  matchup from a card that counts friendlies would have shown *different numbers on both sides of
  one tap* — and the DoD asks for exactly the opposite. So `SCOPE = "tournaments"` is one constant
  for the panel and its shortcuts, and the explainer says "H2H across tournaments". A tournament
  match is read in its tournament context; the matchup's own filter pill is one tap from "Both"
  if Roli wants friendlies included. (Alternative, rejected: keep the panel on "both" and let the
  link disagree with the card above it.)
- **Profile shortcuts** (rivals, favorite teammates) go through `statsMatchupHref` too, so they
  state `source=tournaments` instead of `source=both`. The rival cards' data is already
  tournaments-only, so those numbers now match their destination. **Known residual:** the
  *favorite teammates* card is computed from the profile's `scope: "both"` match history, so its
  W-D-L can count friendlies the Tournaments matchup does not list. Making that card
  tournaments-only changes the profile's own numbers (and the same query feeds "Recent matches"),
  which is S3/N4 territory, not T7's.
- **Standings icon removed, and the two tables stay honest about their difference.**
  `StandingsTable`'s trailing chart-icon `Link` (added by N4) is gone — that row of the N4 table
  is superseded. The rule the two standings now follow: **one row, one door, chosen by the page
  the row lives on.** In a tournament the row opens the player's *profile* (that is what a
  tournament is about — people), and on the dashboard the preview row opens the player's *stats*
  with the name linking on to the profile (N4's split, unchanged, because that preview **is** the
  stats table and shares `StatsTable` with the Overview sub-view). Neither has an icon button any
  more.
- **Cosmetic note:** in-app writes go through `URLSearchParams`, which percent-encodes the comma
  (`?player=1%2C4`), while the hand-built shortcut hrefs keep it literal (`?player=1,4`). Both
  parse identically; the literal form is what Roli sees when he follows a link.
- Tests: `statsNav.test.ts` +9 cases (side parsing, formatting, collapsing, and the four
  `statsMatchupHref` shapes incl. "defaults to Tournaments"), `matchupView.test.tsx` +3 (the
  `exact_teams: true` request, the four linked identities with no relation chips, both team names
  in the empty state) and its fixtures gained an exact-team tournament. Suite **401 tests in 41
  files** (was 389), `npm run check` green, `npm run build` green with the pre-existing
  "chunks larger than 500 kB" hint (644 kB `index-*.js`).
- Runtime verification (isolated stack: backend :8003 on a copy of `app.db`, vite :8020),
  **36/36 checks green at 390px/blue and 1280px/light**: the 2v2 match 93 (Roli + Berni vs
  Flo + Atzi) → button target `…&mode=2v2&source=tournaments&player=1,4&vs=2,5` → a matchup whose
  header names all four, says "exact teams", hides the relation chips, shows Played 1 · W-D-L
  0-0-1 · Goals 1:2 — the same numbers as the "Exact matchup" card — and whose list holds exactly
  1 row; "All matches as a team" → `…&player=1&vs=4&rel=together` with Played 4 = the Team A card;
  the 1v1 match 104 → `…&mode=1v1&source=tournaments&player=1&vs=2` with 14 · 8-3-3 · 48:33 =
  the panel's summary and `Matches · 14`; `/profiles/1`'s H2H links all carry
  `source=tournaments`; **no `source=both` href on any of six pages**; `/live/17` has 0 links to
  `?view=player` and its rows still open the profile; the legacy single-id URL still resolves;
  0 console/page errors, 0 horizontal overflow, 0 nested anchors.
- `AGENTS.md` §10's stats URL scheme documents the two-id sides, the collapse rule and
  `statsMatchupHref`'s Tournaments default (rule 7 of this file).

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

## T9 — Club selection as one self-contained panel (Roli, after testing T2)  ☑

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

**Deviations:** (implemented 2026-09-13, three commits: `2a3330f` panel + trigger + tests,
`83c6903` defaults/persistence, and this docs/plan pass)

- **The scoreboard's club line is not a second way in — it is read-only again, everywhere.**
  The task left this open ("allowed, not required"); Roli's words were "i want to be able to
  select the club there, and *not in the score board*", and §9b's own re-check line asks for
  "one trigger, one container, nothing about clubs outside it except the read-only scoreboard".
  A club line that opens the panel while collapsed and is dead while open would also be the same
  pixel meaning two different things. So `onPickClub` (and the `aLabel`/`bLabel` that only fed its
  aria-label) are **deleted** from `MatchOverviewPanel`/`MatchSides` together with the
  `ClubTrigger` button — leaving them would have been a dead second implementation of the job.
  `MatchSides` is a plain read-only primitive again on every surface that shows a score, and the
  live Current tab's stretched "open match details" overlay no longer needs anything below it to
  stay clickable. The panel's own header carries the discoverability instead: it *shows* both
  club names, so the trigger still names what it edits (§9b, first bullet).
- **The container is a `card`, not an `inset`** (the task's parenthetical suggested `inset`).
  Everything the panel holds is a level-2 control — the two `ClubSlot`s and, when the filter row
  is open, two `FilterSelect` triggers, which *are* `inset`s. An `inset` container would have
  nested level 2 inside level 2 (§1), which is exactly the rule T2 had to bend around when it
  refused to make the filter row an inset. `card` → `inset` is the canon, it is the strongest
  "this is one unit" boundary the design has (own background, hairline, radius, soft shadow),
  and it is the same box the neighbouring Comments card and Result/Advanced cards already use, so
  the club panel reads as a sibling block rather than a floating fragment. On all four surfaces
  the card sits at page level (or in the friendlies list's accent rail) — no card inside a card.
- **The trigger is a row, not a chip:** `🛡 Clubs` in `text-sm font-semibold` with the summary
  under it (`Inter Miami FC · Doncaster`, `Leverkusen · not set`, or `Not set` when neither side
  has one) and a rotating chevron. Two lines rather than one: at 390px "Clubs" plus two club
  names on one line truncates the second name away, and the summary is the reason the collapsed
  state is honest about what is inside. The whole row is the tap target (44px+).
- **Order inside, top to bottom: values → filters → randomisers**, as the task asked, all in one
  `sm:max-w-md` column. The cap is §1.7: at 1280px an uncapped grid stretched the two slots to
  ~740px each, which made the panel look like a page section instead of a tool. `extraTop`
  (the Game field) and `extraBottom` (the match-detail tip) moved *inside* that column too, so
  the open body is one visually aligned stack.
- **`ClubSlot` is back** (T2 had deleted it), now local to `SelectClubsPanel` and richer than the
  S10 version: side players · crest + club name · flag + league · stars, `items-stretch` so both
  slots are the same height. The stars are read-only glyphs here; editing a rating stays in the
  picker sheet where T2 put it (the club being chosen owns its rating), so the panel has no
  second stars control.
- **Remembered per surface, not per match:** `localStorage["club_panel_open:<surface>"]` with
  `live-current`, `match-detail`, `friendly-new`, `friendly-edit` (the `match_list_view` idiom,
  values `"1"`/`"0"`, written on toggle only — a first visit never writes). Per match would have
  meant a key per tournament/match id and a "why is it closed again" surprise on the next match.
  The stored value beats the surface default, so a Roli who closes the friendly form's panel
  keeps it closed; the two friendly forms still *start* open, the live/match-detail ones closed.
- **Collapsing also closes the picker sheet** (`selection.closePicker()` in the toggle) — the
  sheet's values would otherwise outlive the panel that owns them.
- **A collapsed panel says nothing about active filters.** A filter only narrows things that live
  inside the panel (the sheet's list, the random pool), so a "filtered" badge on the collapsed row
  would be exactly the kind of always-on tool chatter Roli objected to. The chips are right there
  the moment it opens.
- **The match-detail "Clubs" card is gone** — the panel *is* that card now (its header replaced
  the `<h2>Clubs</h2>`), so the Edit tab still reads Result / Clubs / Advanced. The tip lost its
  first half ("tap a club in the scoreboard above to change it") and is now just "Tip: nothing is
  saved until you press Save.". On the new-friendly form the `section-head` "Clubs" was dropped
  for the same reason (the card's header is the heading) and the "Loading clubs…" line moved into
  `extraTop`.
- **Click cost, measured in the browser** (taps, panel collapsed as it now starts): setting both
  clubs on the live match is 4 (Clubs → slot A → row → row, the sheet still advances to the empty
  side) against T2's 3, and on the friendly forms it stays 3 because they start open. That one tap
  is the price of Roli's request; it is paid once per surface per browser, because the panel then
  stays open until he closes it.
- Tests: `clubPicker.test.tsx`'s "T2 controls row" block became "T9 — one self-contained panel"
  (collapsed hides every tool, the summary text, one container the trigger owns, pick-inside-the-
  panel, remembered state, plus the filter/random cases it already had);
  `matchOverviewPanel.test.tsx`'s trigger block became "is read-only (T9)" (no buttons at all, and
  "No club" instead of a "Select club" slot). 400 → **403** tests.
- `DESIGN.md` §7 (the "Picking a club" row), §9b's first and toolbox bullets and `AGENTS.md` §2
  were updated in the same pass (rule 7).

**Verification**

- `cd frontend && npm run check`: **41 files, 403 tests** green (400 before). `npm run build`
  green with the pre-existing "chunks larger than 500 kB" hint. No backend change.
- Runtime, isolated stack (backend :8003 on a **copy** of `app.db` + a scratch secrets file with a
  real admin account, vite :8020), Playwright, blue + light × 390px + 1280px:
  **372 layout checks** — collapsed shows the one trigger and *no* "Filter clubs" / dice /
  "Random matchup" / club list, the score panel has 0 buttons, the open panel is one card that
  contains both slots and all three tools, a club is picked inside it (slot → sheet on that side →
  row → the slot carries the new club), the random row stays balanced, no overflow, no nested
  `<a>`, 0 console errors — over all four surfaces, collapsed and open.
- **20 write-path / persistence / reader checks** against the DB copy: the live match autosaves a
  pick made in the panel (`A 32 → 19`), the stars editor in the sheet still writes
  (`PATCH /clubs/{id}`, 4.5 → 4 → 4.5), the league filter narrows *Random matchup* (both draws
  from Bundesliga) and the dice sets a star tier, the match-detail tab writes nothing before
  `Save result` and the right club after it, the stored friendly likewise, `club_panel_open:*`
  survives a reload per surface (open stays open, collapsed stays collapsed, the two surfaces are
  independent), and a reader sees no panel, no randomisers and a plain-text scoreboard. Every
  write was made against the copy and restored afterwards.
- Screenshots (scratchpad `shots/`): `t9-{live-current,match-edit,friendly-new,friendly-stored}-
  {390,1280}-{blue,light}-{collapsed,open,picked}` plus `t9-write-{live-after-pick,stars-editor,
  random-filtered,dice,match-edit-saved,friendly-stored-saved}` and `t9-reader-live-current`.

---

## T10 — "Live" once, and a uniform page header rhythm (Roli, 2026-09-13)  ☑

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

**Deviations:** (implemented 2026-09-13, four commits: the live indicator, the pills' new home,
the dashboard's dot, the shared rhythm)

- **A. What each surface says about "live" now.**
  - *Live/done tournament page:* nothing. `StatusChip` is deleted, not moved — a live tournament
    has the **Current** tab and the match panel's own `playing` pill (`DESIGN.md` §8), a done one
    opens on **Results**, and both carry the nav's pulsing dot.
  - *Top bar / sidebar footer:* `ConnectionIndicator` renders **nothing** while the socket is up.
    It shows "Reconnecting" (draw/amber) or "Offline" (muted) only after a **1.2s grace period** —
    every page load passes through `reconnecting` for a moment while the two sockets handshake,
    and without the delay the one state that is supposed to mean trouble would flash on every
    navigation. The component also lost its double life as the "open the live tournament" button
    (and the `GET /tournaments/live` query behind it): that shortcut exists twice over in the
    sidebar/drawer "Live now" entry and the bottom bar's Tournaments tab. Its unused `compact`
    prop went with it.
  - *Bottom tab bar (mobile) / sidebar "Live now" (desktop):* the pulsing dot — the one live
    indicator, as Roli asked. The drawer's "Live now" entry keeps its dot too; it is only on
    screen while the drawer covers everything else.
  - *Dashboard:* the "Live now" section head **lost its pulsing dot** (the words stay, so does the
    tournament-name link). Otherwise the dashboard showed two pulsing dots half a screen apart —
    the section label and the bottom bar on a phone, the section label and the sidebar on desktop.
  - *Tournaments list:* unchanged. The row keeps the word "Live" in its meta line and its green
    rail — that is *that row's status* among draft/live/done, not a second global indicator, and
    at most one row can have it.
  - Asserted at runtime: the number of visible `.live-dot` elements is **≤ 1** on every one of the
    ten pages, in both themes, at both widths.
- **B. Where the pills went (the judgement the task left open).** `pages/live/TournamentMetaPills.tsx`
  renders mode + date **next to the desktop `h1`** (through `PageLayout`'s new `meta` slot, where
  the title row has room to spare) and, `lg:hidden`, as the **first row of the Overview tab** on a
  phone. One visible copy per breakpoint, never two — the plan's recommendation, split by
  breakpoint instead of duplicated. On a done tournament, which opens on Results, they are one tab
  away; the Overview tab exists for done tournaments and both pills were verified there at 390px
  and 1280px in both themes. Rejected alternatives: a trailing slot inside the tab strip (at 390px
  the tournament page already scrolls six tabs — the pills would eat a third of the strip); a meta
  row under the strip on every tab (always visible, but it puts a per-page block back exactly where
  the rhythm has to be identical); desktop-only (a phone would lose the date entirely).
  The header's other inhabitant, **"mark all unread comments as read"**, moved into the comments
  feed's own header row (`TournamentCommentsCard`'s new `headerAction`, next to "Collapse all") —
  the action now sits on the thing it acts on (`DESIGN.md` §9b) instead of in a page header.
- **C. `PageLayout` owns the band, and what the "wasted space" actually was.** It was Tailwind's
  `space-y-*`: the title row is `hidden lg:flex`, and a `display:none` child is **still** a
  `space-y` sibling (the selector is `:not([hidden])` — the *attribute*, not the class), so on a
  phone every page's first block carried a stray 12px (16px on the dashboard's `space-y-4`) on top
  of `main`'s own 16px, for an element nobody could see. `PageLayout` now renders the title row
  **outside** `.page` (back chevron · `h1` · `meta` · `actions`), which fixes it for every page at
  once — `SectionTabs` was left to own only itself.
  - **390px, measured (top bar ends at y=57).** Before: strip at **y=85** on tournaments, settings,
    friendlies, clubs, stats (28px band); **y=113** on the live and the done tournament (56px —
    title row + pills + `mb-3`); dashboard's first section label at **y=89** (32px) and the
    profile's hero at y=89; match detail at y=113. After: **y=73 on all ten pages** — a 16px band
    that is exactly `main`'s `py-4` and nothing else. That is 12px back on every page, 40px on a
    tournament page, and T5's leftover 4px dashboard difference is gone.
  - **1280px, measured.** Before: 68px on the `PageLayout` pages, **96px** on the tournament and
    match pages (their `h1` was `sm:text-2xl` and the 32px `InlineBack` chevron made the row taller
    than the plain 28px title rows). After: **72px everywhere** — the title row is a fixed
    `min-h-8` (32px) whether or not it carries a back chevron, and every page's `h1` is `text-xl`
    (the live page's and the profile's `sm:text-2xl` is gone).
  - **Under the strip: 12px on every tabbed page.** The `className="mb-4"` that five pages passed
    was already dead code — `space-y-3` sets `margin-bottom: 0` on the same element with higher
    specificity — so the `className` prop is gone from `SectionTabs` altogether: a page can no
    longer set the strip's rhythm at all.
  - **Not cramped.** Tabs are now a full **44px** tap target (`h-11`; they were 40px), so the strip
    grew 4px while the band above it shrank 12px. U1's edge fades are untouched and were
    re-asserted (the six-tab strip still fades on the right at 390px).
  - **Profile** is the one page whose strip is not the page's first block, and deliberately so: its
    hero (avatar, cups, guestbook counters, poke) belongs to all four tabs, and Roli's own words
    ("the pills … are the only thing that uses that area") never counted it as a header. Its *page*
    starts at the same 73px/72px as every other page; its column went `space-y-4` → `space-y-3` so
    the gap under its strip is the same 12px as everywhere else. Its strip sits 356px below the top
    bar at 390px, under the hero.
  - **Dashboard** keeps `space-y-4` *between* its four preview blocks (T5 tuned the cups grid's
    `gap-4` to it); only the top offset was T10's business, and it now matches every tab strip to
    the pixel, so the page reads as a sibling that simply has no strip.
  - **Match detail** is not in the DoD list but had the same smell (a desktop `h1` plus an
    always-visible "A vs B" line above its strip). It adopted `PageLayout` too: the names moved
    next to the desktop `h1`; on a phone the H2H tab's first line already names both teams
    ("Roli / Atzi vs Flo / Rumpi"), so nothing was lost.
  - `#app-top-nav` was not touched (the header's markup is unchanged), so `scrollToSection`'s
    offset still works — re-verified with the `?cup=` deep link and the profile's guestbook tab.
- **Tests:** new `src/test/pageRhythm.test.tsx` (7 cases: the title row is outside `.page`,
  `back`/`meta`/`actions` land in it, no title → no row; the indicator is silent while connected,
  silent during the handshake, and speaks after the grace period in both trouble states) plus a
  44px-tap-target case in `sectionTabs.test.tsx`. Suite **403 → 411** in 42 files.
- `npm run build` still prints the pre-existing "chunks larger than 500 kB" hint (644 kB
  `index-*.js`).

**Verification**

- `cd frontend && npm run check`: **42 files, 411 tests** green. `npm run build` green. No backend
  change.
- Runtime, isolated stack (backend :8003 on a **copy** of `app.db` + a scratch secrets file with an
  admin account, vite :8020), Playwright, blue + light × 390px + 1280px: **292 checks** over ten
  pages (dashboard, tournaments, live tournament 21, done tournament 19, profile, settings,
  friendlies, clubs, stats, match detail) — ≤1 visible live dot, the connection indicator absent
  while connected, nothing above the strip in the content column, 44px tabs, 12px under the strip,
  one identical band per page, no nested `<a>`, no horizontal overflow, 0 console errors — **plus
  48 checks** in a second pass: both pills on the live *and* the done tournament's Overview, the
  `?cup=` deep link still landing below the sticky header with the one-shot param dropped, the
  guestbook tab, the tab-strip fade, and the match page's teams still named.
- **The socket drop was forced in the browser** (the page's `WebSocket` constructor is wrapped so
  the test can close every `/ws/` socket and point reconnects at a dead port; Vite's HMR socket is
  left alone, since closing it reloads the page): before the drop `[data-connection-status]` is
  absent, ~2s after it exactly **one** visible indicator says "Reconnecting" — in the top bar at
  390px, in the sidebar footer at 1280px.
- Screenshots (scratchpad `shots/`): `t10-{dashboard,tournaments,live,done,profile,settings,
  friendlies,clubs,stats,matchdetail}-{390,1280}-{blue,light}`, plus
  `t10-{live-overview,done-overview,cupjump,guestbook,socketdrop}-{390,1280}-{blue,light}`.

---

## T11 — Back out of the matchup returns where you came from (Roli, 2026-09-13)  ☑

Roli: "if i get to h2h from stats page (eg clicking on matrix cell) i want swipe back to go back
to stats h2h page. if i get there from eg match details, i want swipe back to go to match details
again."

**Cause.** S2 opens the matchup by writing `?vs=` with `replace: true`, so entering it creates no
history entry. Arriving from the H2H matrix, a swipe (or the browser back) therefore pops past the
whole stats page to whatever preceded it; arriving from a match page it happens to work, because
that link is a real push. The in-view "← Head-to-head" button clears the param, which is a third
behaviour again.

- **Opening a matchup from inside stats becomes a push**, not a replace — it changes what the page
  shows, so it deserves a history step. Deep links from outside (match detail, profile) already
  push and must keep working unchanged.
- **The in-view back button and the gesture must agree.** Reuse the N1/N3 decision helper
  (`ui/shell/backNavigation.ts`, `previousEntryPath()`): if the entry behind us is the same stats
  page without `vs`, pop (N2 then restores the matrix's scroll offset); otherwise clear the param
  in place, which is the right thing for a deep link with no stats page behind it.
- Check the neighbours for the same smell now that the rule is "a drill-in that changes the page
  is a history step": the Cups deep link (`?cup=`, one-shot, correctly a replace), the stats
  section/sub-view chips (replace — switching tabs is not a drill-in), `goPlayer` row taps, and the
  profile's tab param. Say in Deviations which ones stay replace and why.
- Keep every param the matchup carries (`player`, `vs`, `rel`, `mode`, `source`) intact through the
  push, and do not break `collapseMatchupSide` when H2H is left.

**DoD:** from `/stats?view=h2h` tap a matrix cell → swipe right → back on the matrix at the same
scroll offset (±8px), `vs` gone; from `/live/<t>/match/<m>` tap "All matches: A vs B" → swipe right
→ back on the match page; the in-view back button does exactly what the gesture does in both cases;
Playwright with touch emulation at 390px plus a desktop check; `npm run check` + build.

**Deviations:** (implemented 2026-09-13, two commits: the fix + tests, this note)

- **One rule, three affordances.** `StatsPage.patchParams` gained an opts argument, so
  `setVs(ids, withPlayer?, { push: true })` is the *only* stats write that pushes; everything
  else still replaces. `StatsInsights.openMatchup` passes it, and that single change is what makes
  the swipe gesture and the browser's back button correct — both already pop on a non-detail page
  (`resolveBackAction`: no `backTo`, `canPop` → `pop`), they were just popping past a stats page
  that had never recorded the drill-in. No change to `useSwipeNav`, `routeMeta` or the chevron.
- **The in-view button is the only one that needs a decision**, and it is the new pure
  `resolveDrillInBackAction({ pathname, param, canPop, previousPath })` in
  `ui/shell/backNavigation.ts` (+ `drillInBackActionFor()`, the live-state wrapper), sitting next
  to N1/N3's `resolveBackAction` and reading the same `previousEntryPath()`/`historyCanPop()`.
  `{ kind: "pop" }` when the entry behind is this very page without `vs`, `{ kind: "clear" }`
  otherwise — including the case where *another* matchup sits behind us.
- **Reading of the DoD line "the in-view back button does exactly what the gesture does in both
  cases":** it takes the same decision, not always the same destination. Drilled in from the
  matrix both pop, identically. After a deep link the task text is explicit ("otherwise clear the
  param in place, which is the right thing for a deep link with no stats page behind it") and the
  button is labelled **"Head-to-head"** — it must open the H2H list it names, not the match page.
  The gesture there returns to the match page, which is exactly what Roli asked for. Verified as
  two separate checks (B4, B4d) rather than blurred into one.
- **Scroll bookkeeping: `swap(currentKey, null)` → `save(currentKey)`.** `swap` also starts a
  `restoreWindowScroll(0)`, and with a *push* that loop races N2's `useScrollRestoration`, which
  saves the outgoing entry's offset from the last observed `scroll` event: if the rAF landed
  first, the matrix's history entry would have been stamped with `0` and the way back would have
  dropped the reader at the top. The push already means "open at the top" (N2's PUSH rule), so the
  hook does the scrolling and `openMatchup` only *records* the H2H body's offset — which is still
  needed for the other way back into H2H, through the section tabs. Measured 700 → 0 → 700 px on
  all three affordances.
- **Neighbouring drill-ins — what stays `replace`, and why.** The rule is "a drill-in that
  *replaces the body* is a history step"; a lateral move between things that are all on screen is
  not.
  - `?cup=` (T5) — **replace**, correctly: it is a one-shot param that opens the Cups sub-view and
    then *deletes itself*. A push would leave a URL in the stack that no longer exists after the
    page has cleaned it up, and pressing back would re-trigger the jump.
  - Section tabs `setView` and sub-view chips `setSub` — **replace**: the four sections and their
    chips are visible at all times, so the way back is one obvious tap. Pushing them would make
    browser back walk the reader's tab history instead of leaving `/stats`, which the Decisions
    section explicitly chose against. (Tapping another section *from inside* the matchup still
    replaces, i.e. it consumes the matchup's own entry — back then lands on the matrix, which is
    the entry that was behind it all along.)
  - `goPlayer` (Table / Records row tap) — **replace**: it switches to the Player section, one of
    the four always-visible tabs, and pre-selects a player. It swaps the body, but the return trip
    is the "Overview" tab, not "back"; a push would add an entry per row tap while browsing the
    table. N2 restores the list's offset either way (verified there).
  - `useTabParam` (profile and the other seven tabbed pages) — **replace**, same argument as the
    section tabs; `LiveTournamentPage`'s own `?tab=` likewise.
  - `H2HView`'s duo / teammates history `Modal` — not a URL at all, and a modal's Escape/backdrop
    is its own back. Left alone.
- **Consequence, deliberate:** a Mode/Source change made *inside* the matchup does not survive the
  way back any more — the pop returns to the matrix entry as it was left (`mode=overall` after
  switching the matchup to `1v1`; check F). That is what "back returns you where you came from"
  means with a real history entry, and the filter pill is one tap away on the list. Before T11 the
  filter leaked backwards because there was only ever one entry.
- **T7 is intact:** the push carries `player`, `vs`, `rel`, `mode` and `source` unchanged
  (`/live/17/match/93` → `?…&player=1,4&vs=2,5`), and clearing still collapses a team to its first
  player (`?…&player=1`). The pop path needs no collapsing at all — the entry behind the matchup
  is the list URL, which never held a team.
- Tests: `frontend/src/test/matchupBack.test.tsx`, 9 cases — 5 over `resolveDrillInBackAction`
  (pop / deep link / nothing to pop / another matchup behind / empty param + trailing slash), 2
  over `drillInBackActionFor` against a live `navStack`, and 2 rendering `StatsPage` with
  `StatsInsights` mocked, asserting that opening the matchup *pushes* (a probe's `nav(-1)` returns
  to the H2H list) and that clearing it does not (`nav(-1)` leaves for `/dashboard`). Suite
  **420 tests in 43 files** (was 411/42), `npm run check` green, `npm run build` green with the
  pre-existing "chunks larger than 500 kB" hint (644 kB `index-*.js`).
- Runtime verification (isolated stack: backend :8003 on a copy of `app.db`, vite :8020) with
  touch emulation (`isMobile`/`hasTouch`, CDP `Input.dispatchTouchEvent`): **54/54 checks green**,
  27 at 390×844 and 27 at 1280×900 — the matrix cell and an opponent row each pushing one entry
  and opening at `y=0`; from a list left at **700 px**, swipe right / browser back / the in-view
  button all returning to it at **700 px** (Δ0, tolerance ±8) with `history.state.idx` back to its
  old value; `/live/19/match/104` → "All matches: Roli vs Flo" → swipe right *and* browser back
  → `/live/19/match/104`, while the in-view button opens the matrix in place (idx unchanged) and a
  swipe from *there* still returns to the match page; the same for `/profiles/1`'s rival link; the
  2v2 `/live/17/match/93` exact-team matchup and its collapse back to one player; no horizontal
  overflow and no console/page errors.
- `AGENTS.md` §10 updated (rule 7): the stats-URL bullet now says the matchup is the one pushed
  param and names `resolveDrillInBackAction`, and the N2 scroll bullet says the matchup rides on
  its history entry instead of `useReturnScroll`.

---

# Round 5 — Roli, 2026-09-13 (planned, not started)

## T12 — The Overview earns its place on a finished tournament  ☑

Roli: "when a tournament is done and i click on it, it does not make much sense to have the
current match (=last match) in the overview. make the overview page also show done matches at the
bottom (figure out how to handle this nicely with a live tournament as well)."

`pages/live/OverviewSection.tsx` always leads with `pickPreviewMatch(matches)`, which on a finished
tournament is simply the last match played — presented as if it were happening now.

- **Done tournament:** drop the "current match" block. Lead with the outcome instead — the winner
  (the standings' top row, with the decider taken into account like `services/cup.py` does) and the
  compact standings, then every match played, newest first, at the bottom.
- **Live tournament:** keep the current match and the next-matches block exactly as they are, and
  add the same played-matches block underneath. Both states then share one layout, the top of which
  differs.
- Use the shared row primitives (`ScoreLine sm`, `MatchHistoryList`'s row where it fits) so these
  rows look like every other match row, and make them open the match page (`tournamentMatchHref`).
  Long tournaments should not dump 30 rows: show the last few with a "Show all" like the rest of
  the app, or link to the Matches tab — your call, defend it.
- Check the neighbours: the Matches tab still owns the full ordered list, and the dashboard's live
  card is unaffected.

**DoD:** a done tournament's Overview shows winner → standings → played matches and no "current
match"; a live one shows current → standings → next → played; rows open the match page;
screenshots 390px + 1280px, blue + light, of both states; `npm run check` + build.

**Deviations:** (implemented 2026-09-13 on `feature/2026-09-round5`, one commit)

Files: `pages/live/OverviewSection.tsx` (the tab), `pages/live/tournamentStandings.ts`
(`resolveTournamentOutcome`), `pages/live/LiveTournamentPage.tsx` (three new props),
`test/overviewSection.test.tsx` (new, 6 cases), `test/tournamentStandings.test.ts` (+5 cases).
No backend change, no new dependency.

**What leads a done tournament: the winner, resolved the way the cup is.**
`resolveTournamentOutcome(rows, decider)` mirrors `services/cup.py` →
`stats/core.resolve_tournament_winner_player_id` line for line: the unique top of the table
(pts, then GD, then goals — `computeTopDraw` already encodes that key), and when the top is tied,
the tournament's decider winner, *if* that player actually played. So the Overview, the tournaments
list's trophy line and cup ownership can never disagree about who won. Three renderings:
- **a winner** — trophy, avatar, name and points in one `inset`, with `6 matches · GD +3` under the
  name, or `Tied at the top · won penalties` when the decider settled it (so the block explains
  itself instead of leaving the reader to wonder why #1 in the table below is somebody else);
- **a tie nobody resolved** — "No winner — it ended level at the top." plus the tied names. The
  standings block below still emphasises row 1, exactly as the Results tab still draws its green
  leader rail there; the sentence above it is what says the position is not a win;
- **no players** — one muted line, so the block can never render empty.
The name (and the avatar, `decorative`) is a `PlayerLink` — identity is a link (N4); nothing else
in the block is clickable, so there is no nested `<a>` anywhere in the tab (asserted).

**How many played matches: the last 5, then hand over to Matches.** Rows are newest first, each
one a link to `/live/{tid}/match/{mid}`. Past five, the section head grows a ghost
`Show all N →` that **switches to the Matches tab** rather than expanding in place. That is the
"check the neighbours" call: the Matches tab already owns the full ordered list *with* its
Compact/Details toggle, the reorder arrows and swap-sides, so an in-place expander would be a
second, worse copy of it inside a summary tab. Five is the app's existing "Last 5" dose, it is
~5 rows of air under the standings at 390px, and it is enough that a 6-match tournament shows all
but one. The `#N` marker is kept on every row (like the Next-matches rows and the Matches tab),
so the reader can see at a glance that they are looking at the tail of the list.

**Newest first = reverse `order_index`**, not `finished_at`: the Matches tab lists the playing
order, so this block is literally that list read upwards, and the `#N` markers count down. Sorting
by `finished_at` could interleave them whenever an editor fills a result in late, and the two tabs
would then disagree about "the last match".

**One skeleton, one lead block.** Both states are the same component and the same block order —
lead → standings → (next) → played — and the only branch is the lead: `Winner` on a done
tournament, `Current match` otherwise. `Next matches` is live-only because a finished tournament
has none (the block already hid itself when empty), and the standings block is shared, with its
label switching to `Final standings` and its `aria-label` to "Open results". `pickPreviewMatch` is
simply not asked on a done tournament — it and the dashboard's live card are untouched.

**`MatchHistoryList`'s row was not reused, `ScoreLine sm` was.** `MatchRowWithClubs` (and
`tournamentMatchHref` with it) is built on the *stats* wire types
(`StatsMatch`/`StatsPlayerMatchesTournament`), which the live page does not have; it carries no
`#N`, and it hardcodes `state={{ fromTab: "matches" }}`, while a row opened from here must carry
`fromTab: "overview"` so the match page's back chevron returns to *this* tab (verified in the
browser, and the pop path keeps the scroll). The rows are therefore the same
`ScoreLine size="sm"` the block above them uses, in a `row-tap` link, and the href is the exact
string `tournamentMatchHref` builds.

**One change outside the strict diff, in the same file:** both match blocks now stack a 2v2 side's
two names (`sideNames`) instead of joining them with `+`. `DESIGN.md` §8 says a 2v2 score stacks
two names per side, the Matches tab and every stats history row do, and the Current-match panel
directly above does — the old `teamName()` join in "Next matches" was the one place that did not,
and leaving it would have put two differently-shaped match lists in one tab.

**Small things.** The avatar metadata query is only enabled on a done tournament
(`usePlayerAvatarMap({ enabled: isDone })`), so a live Overview fetches nothing new. The
`isDone` branch in `LiveTournamentPage`'s `onOpenCurrentMatch` is now unreachable (the block it
served is gone on a done tournament) and was left as-is rather than rewired.

**Verification**

- `cd frontend && npm run check` → typecheck + eslint clean, **45 files / 444 tests passed**
  (~37 s; 44/433 before). `npm run build` green, same pre-existing 500 kB chunk hint.
- Isolated stack: backend `:8003` on a copy of the dev DB (`backend/data/verify.db`), vite `:8020`.
  States used: **done 1v1** t19 (6 played), **done 2v2** t17 (9 played), **live 1v1** t18 rewound
  (3 finished · 1 playing · 2 scheduled), **live 2v2** t21 as it stands (2 · 1 · 2), plus t12
  (a genuine three-way tie at the top) with and without a penalties decider, and t20 (draft).
- Playwright, blue + light × 390px + 1280px on all six tournament states: the section labels are
  exactly `Winner · Final standings · Played matches` when done and `Current match · Standings ·
  Next matches · Played matches` when live, no `[data-match-panel]` on a done Overview, the played
  rows' hrefs are the match pages in reverse order, `a a` = 0, no horizontal overflow, 0 console
  errors. Interaction: `Show all 6` lands on the Matches tab with its 6 rows; a played row opens
  `/live/19/match/107` and both browser-back and the in-app chevron return to
  `/live/19?tab=overview`; a draft tournament shows no played block.
- Screenshots (scratchpad `shots/`): `t12-{done1v1,done2v2,live1v1,live2v2,tie1v1,decider1v1}-{390,1280}-{blue,light}.png`
  plus `t12-{draft,backfromMatch}-{390,1280}-blue.png`.

---

## T13 — A "what if" tab: the best case, shown as the matches that produce it  ☑

Roli: "for standings, best-case positions: can you remove that from the current standings and add
another tab right of comments that has the best-positions simulation/computation and also shows how
the matches for others have to play out (ie every match, if its done, or what the best case result
for one person would be and then let me modify that as well) -> also check if the best-case really
does compute the best case in every case."

**Move.** Delete the "Best-case positions" block from `pages/live/StandingsTable.tsx` (the
`PlayerPicker` + projection, `showBestCase`). Add a new tab **right of Comments** and left of
Controls in `pages/live/LiveTournamentPage.tsx` (`LiveTab`, `TAB_KEYS`, the `tabs` array and the
body switch). It exists only while the tournament has unplayed matches. Name it for what it does —
"What if" is the planner's suggestion, settle it against `DESIGN.md`.

**The tab.** A player picker at the top (same `PlayerPicker` as today), then two halves that stay
in sync:
- **The matches**, in playing order: a finished match shows its real result as a fact and cannot be
  edited; every remaining match shows the outcome the computation chose (focus win, rival result or
  draw) as an editable control — three states, home / draw / away — defaulting to the best case and
  marked as "assumed". Changing one recomputes the table immediately. A "Reset to best case"
  action returns every match to the computed assignment.
- **The projected table**, with each player's projected points, the focus player's position, and a
  clear line saying what it takes ("if X wins their 3 remaining matches and these results hold,
  they finish #2").

**Correctness — the part Roli explicitly doubts.** `pages/live/bestCase.ts` today:
brute-forces `3^k` rival-vs-rival outcomes with `CAP = 13`, and **above the cap it draws every
rival game**, which is merely a valid scenario, not the best one; it ranks by points only, using
*finished-only* goal difference as the tie-break, so the focus player's own assumed wins never
affect their GD; and it treats a `playing` match as unplayed, so a side losing 0:5 right now is
still assumed to win. Fix, in this order:
1. **Write down the semantics** at the top of the file: best case = the focus player (and, in 2v2,
   whoever is on their side in a given match) wins every remaining match they play; every other
   remaining match resolves to whatever minimises the number of players finishing above them;
   ties are resolved in the focus player's favour. State how a `playing` match is treated — the
   honest choice is to keep its current goals as the floor for the side that is already ahead, or
   to say plainly that it is treated as unplayed.
2. **Make it exact, with no cap.** This is the classic "can team X still finish first" problem;
   a branch-and-bound over rival matches (order by the rivals closest to the focus player's
   projected points, prune a branch as soon as more players are already above them than the best
   found) is exact and fast at this size, and a draw-only fallback stops being needed.
3. **Prove it**: a test that brute-forces every outcome for randomised small fixtures (≤ 8 rival
   matches) and asserts the algorithm's position equals the true optimum, plus the existing cases
   in `test/bestCase.test.ts`. Keep the 2v2 partner cases — points go to both players on a side.
4. Tie-breaks: use the projected goal difference (finished + assumed) if GD is used at all, or
   state that only points decide and ties favour the focus player.

**2v2 must work as well as 1v1** (Roli, explicitly). Points go to *both* players on a side, and
in 2v2 the focus player partners with different people through the tournament, so their own wins
also lift whoever they play with:
- The projection stays **per player**, never per duo — the table and the position line are about
  one person.
- "The focus wins all their remaining matches" is still optimal in 2v2, and the code should say
  why so nobody second-guesses it: against a partner a win and a draw move both by the same
  amount, so their gap is untouched, while a win always gives the opponents less. It is therefore
  never better for the focus player's rank to drop points.
- Every remaining match's three-way control shows both names per side (the score primitive already
  stacks them), and a match where the focus player's *partner* plays without them is an ordinary
  rival match.
- The brute-force proof test must cover 2v2 fixtures too, including the case where a rival is the
  focus player's partner in a later match — that is exactly where a naive implementation goes
  wrong.

**DoD:** Standings has no best-case block; the new tab sits right of Comments and disappears once
every match is played; editing a match's outcome updates the table and the position line; "reset to
best case" restores the computed scenario; the brute-force test passes; screenshots 390px + 1280px,
blue + light; `npm run check` + build.

**Deviations:**

Implemented 2026-09-13 on `feature/2026-09-round5`, three commits: the algorithm + proof, the tab,
the move out of Standings. Files: `pages/live/bestCase.ts` (rewritten), `pages/live/WhatIfSection.tsx`
(new), `pages/live/LiveTournamentPage.tsx`, `pages/live/StandingsTable.tsx`, `test/bestCase.test.ts`,
`test/whatIfSection.test.tsx` (new).

**The semantics, as written at the top of `bestCase.ts`**

- A **finished** match is a fact — goals and points fixed, not editable.
- A match **being played counts as it stands**: the goals are on the board and the side that is
  ahead takes the three points (level = one each), exactly as the live Standings table counts it.
  This is the judgement call the task left open, and it is the one that answers Roli's complaint:
  a side 0:5 down is no longer assumed to win. Because the game is genuinely not over, the row is
  still *editable* — the honest default, the reader's call — so nothing is lost, only assumed
  sensibly. The row says "live" and its marker says "as it stands".
- **Best case for F:** F's side wins every remaining match F plays (+3 to both players on the side
  in 2v2); every other remaining match resolves to whatever minimises the number of players
  finishing strictly above F; **ties go to F**, so `position = 1 + #{p : pts(p) > pts(F)}`.
- **Goals:** an assumed result has no scoreline, so the projection does not invent goal difference.
  Only points decide the position (the second option the task offered). The other players are
  ordered among themselves by points, then by the goal difference actually played out, then goals
  for, then name — purely for a stable list; that order can never move F. The tab says so in one
  line under the table.
- **Why "F wins everything they play" is optimal, 2v2 included** (spelled out in the file so nobody
  second-guesses it): for one of F's matches and every other player p, look at `pts(p) − pts(F)`. A
  partner moves exactly with F (+3/+1/0 both), so the difference to one's own partner is untouched;
  an opponent gains 0/1/3 while F gains 3/1/0; anyone outside the match gains nothing while F gains
  3/1/0. "F's side wins" minimises that difference simultaneously for every p, in every match, so
  the search only has to explore the rival matches.

**Exactness — and where the old code was actually wrong**

The cap is gone. F's total is fixed, so every other player is measured by `slack = pts(F) − fixed(p)`
and `reach = 3 × rival matches they play`: `slack < 0` = above whatever happens, `slack ≥ reach` =
can never catch up, the rest are *contenders* and only they are searched over. Branch and bound over
the rival matches containing a contender, ordered most dangerous first, pruned by (a) contenders
already above — points only go up, so that count can never fall — and (b) a capacity bound: a match
with a still-below contender on both sides must hand each of them at least a point (a draw is its
cheapest outcome), so if the forced total no longer fits in the room those players have left, one
more of them must go above; if it does not fit for any single player dropped either, two more must.
The incumbent is seeded with one greedy run per "sacrifice set" of contenders, which is what finds
the shape of the optimum ("one rival runs away with it, the rest stay level") that a plain
cheapest-outcome greedy never sees. A rival match with no contender cannot change the position at
all: it is shown as a draw and marked "any result". A `NODE_BUDGET` (2M nodes) exists only as a
safety valve — it cannot trigger at this app's sizes; if it ever did, `exact: false` is surfaced in
the verdict line rather than silently pretending.

Two fixtures where the old implementation gave the **wrong answer**, measured by running
`5b4af31:bestCase.ts` and the new one side by side:

| Fixture | Old | New |
|---|---|---|
| Dev tournament 19 with match #3 in progress (Roli 3:4 Flo), focus **Roli** | **#1** — it treated the live match as unplayed and handed Roli the win he is currently losing | **#3** |
| 5 players, focus on 6 points, 18 scheduled rival matches (triple round-robin, past `CAP = 13`) | **#5** — above the cap it drew every rival game | **#2**, and #2 is provably the ceiling (18 matches hand out ≥ 36 points, the four rivals can absorb 4 × 6 = 24 while staying level, so at least one must pass; three of them drawing everything among themselves reaches it) |

The goal-difference flaw was display-only in the old code (the position itself was counted on points),
but it was misleading: it sorted the projection by a goal difference that could never reflect an
assumed result. It is now stated instead of implied, and the goals of a match in progress count as
the facts they are.

**The proof (`test/bestCase.test.ts`, 13 cases, ~0.3 s)**

240 randomised fixtures — 120 1v1 (3–6 players, full round-robin draw) and 120 2v2 (4–6 players,
randomly rotating duos, so a rival is regularly F's partner in another match) — each with up to 12
matches of which up to 8 are still open, randomly finished / in progress / scheduled with random
scores. Every fixture is brute-forced over all 3^k combinations by an evaluator written from the
semantics rather than from the implementation, and three things are asserted: the reported position
equals the true optimum, the scenario handed to the UI reproduces that position under the independent
evaluator (so search and projection cannot drift apart), and no single edit of one open match can
beat it. Half the fixtures focus the *trailing* player, which is where the race is contested: the
optimum is worse than #1 in ~36% of them (positions #1–#6 all occur). A third case filters the 2v2
generator down to fixtures where a rival really is F's partner elsewhere and proves 40 of those.
Alongside: the two original 1v1 cases and the 2v2 partner case, a tie-goes-to-F case, the live-match
cases, the 18-match cap case, and the hand-built partner trap (F wins with partner q, q then plays a
rival match — letting q *draw* it already puts F's own partner above them, so the best case is the
other side winning).

One existing assertion was relaxed: `flo.pts + roli.pts >= 3` became `>= 2`. Its intent ("the rival
game must distribute points, not leave both on 0") is unchanged; the 3 was incidental to the old
brute force picking a home win, while the exact search now shows the cheapest of several equally
optimal outcomes — a draw — because neither player can reach the focus player either way.

**Judgement calls in the UI**

- **Name: "What if"** (lucide `Signpost`). Roli's own words, and the only name that stays true once
  the reader has edited the scenario — "Best case" would be a lie the moment they touch a control,
  "Projection"/"Scenarios" is jargon this app does not speak. `DESIGN.md` has no tab-label rule
  beyond the strip's rhythm (one short label + a 14px lucide icon), which this keeps; with seven tabs
  the strip scrolls, which it already did at six.
- **The three-way control: `1 · X · 2`, three `Chip`s under the score.** The app already prints
  `1 2.10 · X 3.40 · 2 2.90` on exactly these matches (the odds line), so the vocabulary is on
  screen already; team names would not fit three ways at 390px with two names per side. Each chip is
  44px wide with a real `aria-label` ("Rumpi + Atzi win", "Draw"), the group is labelled
  "Result: <side> versus <side>", and one muted line under the section head spells the notation out.
  Not a `SegmentedSwitch`: that is the canon's *view mode* control (`DESIGN.md` §7), while this
  writes a value, which is `Chip`'s job — and `Chip` is the only one of the two that takes a
  per-option accessible name.
- **Assumed vs played.** A played match shows real numerals and *no control at all* — the strongest
  possible difference. An open one shows `vs` where the score would be (the canon's scheduled state,
  §8), the control under it, and the side assumed to *lose* quietened: the row says who has to win
  without inventing a scoreline. Every non-played row carries one `text-micro` marker naming where
  its result comes from: "as it stands" (live), "assumed" (the computation), "any result" (no outcome
  of this match can move the focus player) or "your call" in accent once edited. "any result" is the
  honest half of exactness: it stops the tab claiming a match "must" be drawn when the draw is only
  the cheapest of three equal choices.
- **How much of the table: all of it.** A tournament here has 4–6 players, so the whole projected
  table is 4–6 rows, and the question the tab answers *is* who finishes above you — cutting it to
  "you ± 1" would hide exactly that. Each row carries the projected points and, muted, what the
  scenario adds to today's total (`+6`); the focus row keeps the accent wash the old block used.
- **Layout.** Phone: picker → verdict → table → matches, so the two numbers that change (position,
  points) are above the fold while the long list scrolls. Desktop (`lg`): two columns, matches left,
  verdict + table right, so nothing is ever off-screen while editing. No sticky summary — it would
  need a hand-rolled opaque bar under the top bar, which `DESIGN.md` reserves for the floating pill,
  toasts and the tab bar.
- **The picker opens on the reader's own player** when they are in this tournament (`actorPlayerId`),
  otherwise on the current leader (what the old block did). Edits are kept per focus player: picking
  someone else asks a different question, so it starts from that player's best case.
- The page is live, so an edit to a match that finishes in the meantime drops itself and the row
  becomes a fact.

**Not done / rejected**

- No "this match decides your place" badge on the rows that *do* matter — the mirror image of
  "any result" would mark most rows in a tight tournament and cost a second marker column at 390px.
- The tab is shown on a **draft** tournament too (nothing played yet): the task's rule is "while the
  tournament has unplayed matches", and "what do I need" is exactly the question before the first
  kick-off. It disappears the moment the last match is finished (verified: tournament 18 shows
  Overview · Results · Matches · Comments, and `?tab=whatif` falls back to Overview there).

**Verification**

- `cd frontend && npm run check` → typecheck + eslint clean, **44 files / 433 tests passed** (~35 s);
  `npm run build` green.
- Isolated stack: backend `:8003` on a copy of the dev DB (`backend/data/verify.db`, tournaments 19
  and 17 rewound so each has finished + playing + scheduled matches), vite `:8020`. Playwright at
  390×844 and 1280×900, blue and light, for the 1v1 (t19) and the 2v2 (t17): default best case, an
  edited scenario, and reset — the verdict line, the position and the table follow every edit and
  come back on reset (1v1 Roli #3 → #4 edited → #3 reset; 2v2 Mike #2 → #4 edited → #2 reset). No
  console or page errors.

---

## T14 — The standings meta line lines up across rows  ☑

Roli: "for standings/results table: make sure the data in the lower row (e.g. 3P · 3-0-0 · 15:4
etc) is aligned so its in the same location in every row (the goals and played move it e.g. 9 vs
10). make sure to fix this everywhere a results table is shown."

Cause: `pages/live/StandingsTable.tsx:377-379` renders the line as flowing text with `·`
separators, so every segment's x position depends on the width of the digits before it — `9:4`
against `15:14` shifts everything to its right, and the whole line is proportional since T10 took
`font-mono` off it (it wrapped at 390px).

- Give the line **fixed columns**, not separators: a grid whose tracks are wide enough for the
  widest realistic value (played ≤ 2 digits, `W-D-L` ≤ 3 single digits, `GF:GA` ≤ 2+2, `GD` signed
  ≤ 3), `tabular-nums` throughout, so segment N starts at the same x in every row. Keep the win /
  draw / loss token colours. It must still fit 390px inside the row's remaining width — measure it
  (T10 recorded 187px available there) and drop the least useful segment into a second line or out
  entirely rather than let it wrap unevenly.
- Do it once, in a small shared component (`ui/primitives/` — a `StatLine`/`RecordLine` taking
  played, W-D-L, GF, GA, GD), then use it everywhere a results/standings row shows that data.
- **Everywhere it appears** — audit and list each in Deviations: the live standings rows and the
  best-case/projection rows in the same file, the compact standings in `OverviewSection`, the
  dashboard standings preview and the stats **Table** (both are real `<table>`s, so they are
  already column-aligned — confirm and say so rather than changing them), the H2H opponent rows and
  the matchup summary in `pages/stats/H2HView.tsx` and `h2h/MatchupView.tsx`, the duo rows in
  `pages/stats/HeadToHeadRows.tsx`, and the profile's rivals/teammates cards.
- Check both themes and both widths, and make sure the alignment survives a two-digit played count
  and a three-digit goal total.

**DoD:** in every listed surface, the x position of each segment is identical across all rows
(assert it in Playwright by measuring the bounding boxes of the segment elements per row, not by
eye); no wrapping at 390px; screenshots 390px + 1280px, blue + light; `npm run check` + build.

**Deviations:** (implemented 2026-09-13 on `feature/2026-09-round5`, two commits: the
shared component, then the call sites)

New: `ui/primitives/RecordLine.tsx`, the `.record-num` utility in `styles.css`, and
`test/recordLine.test.tsx` (8 cases). Call sites: `pages/live/StandingsTable.tsx`,
`pages/live/WhatIfSection.tsx`, `pages/stats/H2HView.tsx` (four lists),
`pages/stats/HeadToHeadRows.tsx` (both row components, plus `teamRivalryWidths`),
`pages/stats/h2h/{DuoRivalries,DuoDetail,DuoLeaderboard}.tsx`, `pages/stats/StarsView.tsx`,
`pages/profile/ProfileOverviewTab.tsx`, `pages/live/MatchH2HPanel.tsx`. Plus one canon row in
`DESIGN.md` §7 and the primitives list in `AGENTS.md`. No backend change, no new dependency.

**How a column is actually held — and why not `ch`.** The obvious spelling, `width: 2ch`,
is wrong here: `ch` is the advance of the font's *proportional* `0` (**7.48px** in Inter at
12px), while `tabular-nums` — which this line has always had — makes every digit **7.78px**.
A two-digit value would overhang its own track by 0.6px and take the next segment with it.
So `.record-num` sizes itself from an invisible pad of N zeros rendered as a zero-height
block (`::before { content: var(--record-pad) }`), measured in the element's own font with
its own variant settings. Being a pseudo element, the pad never reaches `textContent`, the
accessibility tree, or a copy-paste. A signed value pads with `"+00"` rather than `"000"`,
because `+` is 7.92px and a digit 7.78px — with a zero there, `+8` came out 0.14px wider
than its track (measured, then fixed; the test pins it).

**Track widths: per list, not per app (judgement 1).** `recordWidths(rows)` is called once
per list and takes the widest value *in that list*; every row of the list then asks for the
same tracks. A fixed app-wide "2 digits everywhere" would have stranded ~39px of whitespace
in a typical 4-player tournament row (1 digit for played, 3 for W-D-L, 1 for goals) out of
the 230.5px that row has — a sixth of the line, on the phone where it is tightest. Per-list
widths strand nothing: the dev tournaments render at **144.8px of 230.5px** and the inflated
worst case at **207px of 224.2px**. It also means the widths can never be *too small*: a
three-digit goal total simply makes that list's track three digits wide. `widths` is a
**required** prop (and on `DuoRow`/`TeamRivalryRow` too, which is why `DuoRivalries`,
`DuoDetail` and `H2HView` now compute and pass it) — a row cannot see its siblings, so only
the list can size the columns, and an optional prop would let a call site silently fall back
to per-row widths, which is the bug itself.

**The separators do not survive on screen — they survive for screen readers (judgement 2).**
Each `·` costs 10.06px (against the 8px `gap-2` that replaces it) and, once the segments are
columns, it is a separator drawn between two things that are already separated. Dropping all
three buys 30px, which is most of what the `GD` segment needs. But the line is still read
aloud and still copied, so every gap carries an `sr-only` `" · "`: `textContent` is character
for character what it was before (`3P · 3-0-0 · 14:6 · GD +8`), which is also why all 444
pre-existing tests passed untouched. The units stay glued to their numbers with a nbsp
(`GD +8`, `12 matches`).

**Nothing had to be dropped (judgement 3).** The task allowed losing the least useful segment
rather than wrapping. It was not needed, and here is the budget. In the live standings row at
390px the meta line has **230.5px** (measured; T10's 187px was a different row). The real
worst case for a tournament — two-digit played, two-digit W-D-L, three-digit goals both ways,
signed three-digit GD — measures **207px**: played 23.2 + W-D-L 57.8 + goals 50.0 + GD 52.2
+ three 8px gaps. It fits with 17px to spare, at one line, with no page overflow (asserted in
the browser on an inflated tournament 19: `12P 8-0-4 180:110 GD +70` next to
`12P 1-0-11 34:212 GD -178`, all four segments at x = 116 / 147.17 / 212.88 / 270.84 in every
row). Had it not fitted, `GD` was the segment to go — it is the only one derivable from
another (`GF:GA`) — but it is also the standings' first tie-break, so keeping it was worth
the 52px.

**W, D and L get one column each, not one for the group (judgement 4).** Where a list mixes
one- and two-digit counts the numerals are right-aligned in their own tracks, so the reader
gets `20- 7- 5` / `15- 4- 8` / ` 8- 6-11` — the wins line up under the wins. The alternative,
one fixed track for the whole `W-D-L` token, keeps the token tight but only lines up its last
digit. A tournament never notices the difference (three single digits either way, `3-0-0`);
the H2H lists, where the counts reach 20, are exactly where a reader wants to compare wins
down the list, so the columns earn the 7.8px of padding a shorter number leaves in front of
itself. The `:` in `GF:GA` follows the same logic — GF right-aligned, GA left-aligned, so the
colon is the fixed point (`14:6` over ` 5:8`).

**The audit — every surface that shows this data, and what happened to it**

| Surface | File | What was done |
|---|---|---|
| Live/done standings rows | `pages/live/StandingsTable.tsx` | **Converted.** The line Roli complained about: `played · W-D-L · GF:GA · GD`, one `recordWidths(liveRows)` for the table |
| What-if projected table | `pages/live/WhatIfSection.tsx` | **Converted** (`RecordNum`, no full line — the columns there are `+gained` and `pts`). Also fixed the focus row, below |
| H2H opponent rows ("Head-to-head by player") | `pages/stats/H2HView.tsx` | **Converted** (`played · W-D-L`), widths across the whole `vs` list |
| Favorite / Nemesis cards | `pages/stats/H2HView.tsx` | **Converted** (`W-D-L · ppm`); both cards share one set of widths so the two halves of the grid line up with each other |
| Teammate synergy rows | `pages/stats/HeadToHeadRows.tsx` `DuoRow` | **Converted**, both of its lines (`games · GF:GA · win%` on the left, `W-D-L` on the right) |
| Duo-vs-duo rivalry rows | `pages/stats/HeadToHeadRows.tsx` `TeamRivalryRow` | **Converted**, both lines. Widths come from `teamRivalryWidths`, which measures *both* orientations because the row flips to put the focus duo first |
| Top rivalries (players) | `pages/stats/H2HView.tsx` | **Converted** (`matches · W-D-L`). It gained the win/draw/loss colours it never had — the row is titled "A vs B", so green = A's wins is unambiguous, and every other W-D-L in the app is coloured |
| Best-duos leaderboard | `pages/stats/h2h/DuoLeaderboard.tsx` | **Converted** (`played · W-D-L · GD`, `gdLabel=""` — the row has no room for the word and the column is obvious next to W-D-L) |
| Club-stars buckets | `pages/stats/StarsView.tsx` | **Converted** (`played · W-D-L`) |
| Profile rivals + favorite teammates | `pages/profile/ProfileOverviewTab.tsx` | **Converted** (`W-D-L · ppm`), one set of widths per grid |
| Match detail → H2H summaries | `pages/live/MatchH2HPanel.tsx` | **Converted** (`matches · W-D-L · GF:GA · ppm`). In 2v2 two of the three cards sit side by side, so all three share widths. Same component in the friendlies row editor (editor-only, so checked through the match page) |
| Overview's compact standings | `pages/live/OverviewSection.tsx` | **Left alone, confirmed aligned.** It is already a column layout (`w-4`/`w-5`/`w-7`/`w-6` right-aligned spans with a header row); measured 5 columns at x = 28 / 52 / 274 / 302 / 338 in every row, and the tracks hold two digits (`w-5` = 20px > 15.6px) and a signed two-digit GD (`w-7` = 28px > 23.5px) |
| Dashboard standings preview | `pages/dashboard/StandingsPreviewCard.tsx` | **Left alone, confirmed aligned** — it *is* the stats table with `fixedColumns`; a real `<table>` with `text-right` cells, measured 6 columns identical across 6 rows |
| Stats → Overview → Table | `pages/stats/StatsTable.tsx` | **Left alone, confirmed aligned** — real `<table>`, 6 columns identical across 6 rows |
| H2H matrix | `pages/stats/H2HView.tsx` | **Left alone, confirmed aligned** — real `<table>`, 7 columns identical across 6 rows |
| Matchup summary | `pages/stats/h2h/MatchupView.tsx` | **Left alone, confirmed aligned** — it is not a line but a `StatTile` grid; measured, the tiles hold two grid columns at x = 29 / 199 |
| Duo detail summary | `pages/stats/h2h/DuoDetail.tsx` | **Left alone deliberately.** One summary at the top of its own view — it has no sibling row to line up with, and a lone line reads better with `·` separators than with gaps. (Its matchup rows below it *are* converted.) |
| Player hero line | `pages/stats/PlayerProfile.tsx` | **Left alone**, same reason: one line, and its W-D-L sits inside prose (`4.2★ · 3-0-0 · 12 pts · view profile`) |
| Profile "Record / Elo / Last 3" | `pages/profile/ProfileStatsSection.tsx` | **Left alone**, same reason: one wrapping line of three unlike facts, under a tile grid that already carries the numbers |
| Winner block's `6 matches · GD +3` | `pages/live/OverviewSection.tsx` | **Left alone**, same reason: one line inside the T12 winner inset |

The rule the last four follow: `RecordLine` is for a line that has siblings to line up with —
rows of a list, cards of a grid. A line that is alone on its surface keeps the flowing text,
because there is nothing to align and a separator carries more in isolation than a gap does.

**One fix outside the record line, in the same spirit.** The What-if projected table's focus
row was `-mx-2 rounded-xl bg-accent/10 px-2`. With `w-full` being border-box, the negative
margin made the row 16px wider than its content box allowed, so the focus row's points column
sat **16px left of every other row's** (measured: 283.75 vs 299.75). The wash now hugs the row
box, exactly like `.row-tap`'s hover wash everywhere else in the app.

**Verification**

- `cd frontend && npm run check` → typecheck + eslint clean, **46 files / 452 tests passed**
  (45/444 before). `npm run build` green, same pre-existing 500 kB chunk hint. No backend change.
- Isolated stack: backend `:8003` on a copy of the dev DB (`backend/data/verify.db`), vite `:8020`.
- Playwright, **16 surfaces × 2 widths (390 / 1280) × 2 themes (blue / light)**: for every list
  the x offset of every segment element is compared across all its rows (and for the real
  `<table>`s and the hand-built column rows, every cell's x). **480 column checks, 0 misaligned,
  0 wrapped lines, no horizontal overflow, 0 console errors** (119 checks at 390, 121 at 1280,
  per theme — 1280 adds a third tile column to the matchup summary). Grid surfaces (the rival
  cards, the teammate cards, the two "together" cards) are compared by offset within the card,
  with the card origins printed, since equal cards sit at different absolute x by design.
- The worst case was forced in the browser (`extreme.js`: tournament 19's payload rewritten on
  the wire, its 6 matches replayed 4× with big scores) — **two-digit played, two-digit losses
  and three-digit goal totals** — at both widths and in both themes: segments identical,
  no wrap, 207px of 224.2px.
- Screenshots (scratchpad `shots/`): `t14-{standings,standings2v2,whatif,h2hplayers,h2hduos,
  stars,profile,matchh2h,overview}-{390,1280}-{blue,light}.png` (clipped to the block that holds
  the rows) plus `t14-extreme-{390,1280}-{blue,light}.png`.

---

## T15 — Done tournaments open on the Overview; ringed avatars; standings gets its own "show all"  ☑

Three items from Roli after seeing T12, 2026-09-13.

**A. A done tournament opens on the Overview.** `pages/live/LiveTournamentPage.tsx:115` still sends
a finished tournament straight to Results (`chosenTab ?? (status === "done" ? "standings" :
"overview")`) — a rule from before the Overview led with the winner. Drop the special case: every
tournament opens on `overview` unless the URL says otherwise. Check the neighbours that assumed the
old default: the tournaments list rows, the dashboard, U6's remembered page, and the `?tab=` deep
links (all of which pass an explicit tab and are therefore unaffected — confirm rather than assume).

**B. Ringed player avatars everywhere — and one tense for the ring.** The Players page wraps its
avatars in a 2.5px ring (`pages/PlayersAdminPage.tsx:226-229`, `cupRingBackground`), which reads
better than the bare disc used elsewhere.

*Decisions (Roli, 2026-09-13 — settled, do not relitigate):*
- **Shape is decoration, colour is information.** Every player avatar gets the same neutral
  hairline ring; a cup's colour on a ring is reserved for meaning.
- **An avatar always speaks in the present tense**: a cup-coloured ring means that player holds
  that cup *today*. Never use the ring for historic ownership, anywhere.
- **…and it therefore has no place inside a tournament** (Roli's correction, after seeing it: "no
  i dont like that the ring is shown when i look at results of older tournaments"). A tournament
  view is about a past or ongoing event, so a present-tense ring there reads as though that player
  held the cup back then. Cup-coloured rings appear **only** on surfaces about now — Players,
  profiles, the stats leaderboards, the dashboard cups preview. Inside a tournament (standings /
  results, the What-if table, its match lists, the Overview blocks) avatars carry the neutral
  hairline only, and the standings crown badge is the single carrier of cup information there.
  One tense per screen, one carrier per fact.
- **The standings keep the crown badge exactly as it is** — that is where "who owned the cup going
  into this tournament" is shown, and Roli is happy with it. Do not restyle or move it.

*Work:*
- Put the ring in `ui/primitives/AvatarCircle.tsx` (a `ring` prop, or a small `PlayerAvatar`
  wrapper) so there is one implementation, and adopt it at every call site: standings rows, the
  what-if table, stats (Table, Records, Streaks, Cups, H2H, matchup header, Player), profile,
  dashboard cups preview, pickers, comment authors, guestbook.
- The neutral hairline and a cup ring must stay unmistakably different at 390px in both themes —
  screenshot a holder and a non-holder side by side in the standings, where they sit together.
- **No cup marking at all** on comment authors, guestbook entries or any picker: a crown beside
  every comment is noise.
- *From Roli's suggestion ("in match list it would be interesting to see the owner back then"),
  separable — drop it if it crowds the block:* the match-history **tournament block header** already
  carries the date pill and `TournamentLaurelMarkers`; add the stake owner there, e.g.
  "Bauernkranz at stake · Rumpi defending", read from the `cup_stakes` the payload already
  provides. Per block, never per row, and never as a ring — a cup cannot change hands mid
  tournament, so the block is the right grain, and together with the laurel it says who went in
  holding it and whether it changed hands.

**C. "Show all" for the final standings.** T12's played-matches block ends with a ghost
`Show all 6 →` into the Matches tab, which Roli likes. Give the Overview's standings block the same
affordance into the Results/Standings tab (same component, same wording pattern, same placement),
so both blocks on that page behave alike. Say in Deviations what the label reads for a live
tournament versus a done one.

**D. Played matches: all of them, in playing order** (Roli, after seeing T12). T12 shows the last
five newest-first behind a `Show all 6 →`. Change both halves:
- Render **every** played match, ordered by `order_index` ascending — the order they were played,
  the same order the Matches tab uses. (T12 chose reverse order deliberately; this overrides it.)
- The link then no longer reveals anything, so **relabel it** for what it does: it opens the
  Matches tab, where the rows also carry Compact/Details, reorder and swap-sides. Keep it a ghost
  link in the same slot.
- Do the same for **C**'s standings link: the Overview already lists every player, so its label must
  also say it opens the Results/Standings tab rather than promising more rows. Both blocks end up
  with the same shape: complete content, plus a quiet link to the tab that can act on it.

**DoD:** opening any done tournament lands on Overview; every player avatar carries the ring and a
cup holder's ring is still unmistakable (screenshot the standings with a holder and a non-holder
side by side, both themes); the standings block has its own link that switches tabs; the Overview lists every played match in playing order and neither link claims to reveal more;
screenshots 390px + 1280px, blue + light; `npm run check` + build.

**Deviations:**

Implemented 2026-09-13 on `feature/2026-09-round5`, five commits — one per part, plus Roli's
mid-task correction to B as its own commit: `253c9e6` (A), `9028dca` (B), `269451e` (D),
`cd0fe96` (C), `b52643e` (B, corrected). No backend change, no new dependency, no generated types.

Files: `pages/live/LiveTournamentPage.tsx`, `pages/live/OverviewSection.tsx`,
`ui/primitives/AvatarCircle.tsx`, `hooks/useCupHolders.ts` (new), `pages/stats/MatchHistoryList.tsx`,
plus the ring's call sites (`pages/PlayersAdminPage.tsx`, `pages/profile/ProfileHeader.tsx`,
`pages/stats/{StatsTable,RecordsView,StreaksView,PlayerProfile,CupDetail,cupParts}.tsx`,
`pages/stats/h2h/MatchupView.tsx`) and the four that were stripped again by the correction
(`pages/live/{StandingsTable,WhatIfSection,OverviewSection}.tsx`, `pages/stats/PositionsView.tsx`).
Tests: `test/avatarRing.test.tsx` (6, new), `test/cupStakeLine.test.tsx` (3, new),
`test/overviewSection.test.tsx` (6 → 8). Docs: `DESIGN.md` §7 identity row, `AGENTS.md` §2 + §9.

**A — every tournament opens on the Overview.** One line
(`chosenTab ?? (status === "done" ? "standings" : "overview")` → `chosenTab ?? "overview"`). The
neighbours were checked rather than assumed: the tournaments list rows, the dashboard's live card,
the sidebar/drawer "Live now" links, `NewTournamentForm` and U6's `lastLocation` all navigate to
`/live/{id}` with **no** `?tab=`, so they simply land on the Overview now; every caller that does
set one still wins, verified in the browser — `?tab=matches` opens Matches, the match page's back
chevron returns to the tab it came from, and the `?comment=` / `?unread=1` effects still force the
Comments tab. A remembered `/live/19?tab=standings` from before this change also still opens
Results, because U6 stores `pathname + search`.

**B — one ring, and (after Roli's correction) one tense per screen**

`AvatarCircle` is now the only avatar in the app and always wears a ring, drawn **inside** its own
box as padding + a background behind an inner disc:

- **neutral**, 1px, `rgb(var(--color-border-card-chip) / 0.55)` — decoration;
- **cup**, 2.5px, the cup's colour, or an evenly split `conic-gradient` when a player holds both.

*Judgement 1 — the hairline's treatment.* It had to read as deliberate in a dark theme *and* on the
light theme's white surfaces, without a second look in either. Three things make it one:
(a) it is the **same token the app already draws hairlines with** (`--color-border-card-chip`, at
the same 0.55 alpha `.chip` uses), so it is the same grey as every chip edge and pill border on the
screen rather than a new colour; (b) it is on **every** avatar, so a bare disc no longer exists to
compare it against — an edge that is universal reads as the shape of the component, while an edge on
half the avatars reads as a state; (c) it is drawn as an inset track rather than an outline, so the
photo sits *inside* the ring and the two form one object. In light (`t15b2-players-390-light.png`)
the hairline is plainly visible against the white row; in blue (`t15b-standings-390-blue.png`) it is
quiet but present at the disc's edge. Note it also replaces something: in the light theme the avatar
already carried `.inset`'s 1px `border-card-inner`, which no dark theme had — the ring is the first
time the disc has the same edge in every theme.

*Judgement 2 — a cup ring next to it at 390px.* Two signals, not one: **2.5× the width** and a
saturated hue against a muted grey. The smallest avatar that can wear one is 24px (`h-6`, Records
and Streaks) and at that size a 2.5px ring still leaves a 19px photo and reads as a coloured
annulus, not a thick border — see `t15b-streaks-390-blue.png`, where Rumpi (green) and Berni (gold)
sit three rows apart from three hairlined players. A proportional ring (`padding: 6%`) was rejected
for exactly this: at 24px it would have been 1.4px against the hairline's 1px, which is the case the
DoD warns about. One fixed width also keeps the rule sayable in a sentence.

*Judgement 3 — where the tooltip lives.* On a `title` + `aria-hidden` overlay span, not on the
avatar. A `title` on the avatar itself is pulled into the accessible name of the `PlayerLink` most
avatars sit inside, so `getByRole("link", { name: "Roli" })` would have become
"Holds Bauernkranz" — pinned by a test.

*Judgement 4 — a shared hook, not per-page plumbing.* `hooks/useCupHolders` answers "who holds each
cup right now" from the `qk.cupDefs` / `qk.cup` entries the dashboard, the Cups page and the Players
page already fetch, so adopting it costs no request and never blocks a render — an avatar simply
gains its ring when the answer arrives. The Players page's own `cupRingBackground` (the 2.5px
wrapper that was the prototype for all this) is deleted, along with its local `useQueries` fold.

**Roli's correction, mid-task: the ring has no place inside a tournament.** After seeing it —
*"ok no i dont like that the ring is shown when i look at results of older tournaments"* — the
present-tense rule kept its scope. A cup-coloured ring is now passed **only** on surfaces about now
(Players, profiles, the stats leaderboards, the dashboard cups preview); inside a tournament
(standings/results, What-if, match lists, the Overview's blocks) every avatar carries the hairline
alone, and cup information there has the single carrier Roli asked to leave untouched: the standings
crown badge. The rings were removed from those files, not hidden behind a flag — they pass no `cups`
and no longer call the hook. **The Positions grid went with them** (it was never on the task's list;
adding it was my own call, withdrawn): its body is a matrix of finished tournaments, which is the
same complaint. The comparison shot the correction asked for is
`t15b2-standings-{390,1280}-{blue,light}.png`: Rumpi holds the Bauernkranz today and wears the same
hairline as Flo and Atzi, while Roli — who went into *that* tournament holding it — wears the crown.

*The call-site audit (16 avatars, and what each says)*

| Surface | File | Ring |
|---|---|---|
| Players page rows | `pages/PlayersAdminPage.tsx` | **cup** (its own wrapper replaced by the shared prop) |
| Profile header | `pages/profile/ProfileHeader.tsx` | **cup**, from the `ownedCups` prop it already had |
| Stats → Table | `pages/stats/StatsTable.tsx` | **cup** (also the dashboard's standings preview, same component) |
| Stats → Records | `pages/stats/RecordsView.tsx` | **cup** |
| Stats → Streaks | `pages/stats/StreaksView.tsx` | **cup** |
| Stats → Cups: holder line | `pages/stats/cupParts.tsx` `CupHolder` | **cup** (also the dashboard cups preview, same component) |
| Stats → Cups: reigns + per-player table | `pages/stats/CupDetail.tsx` | **cup** — a *past* holder therefore shows a hairline, which is the rule working |
| Stats → H2H matchup header | `pages/stats/h2h/MatchupView.tsx` | **cup** |
| Stats → Player hero | `pages/stats/PlayerProfile.tsx` | **cup** |
| Live/done standings rows | `pages/live/StandingsTable.tsx` | **hairline** (correction) — the crown badge is untouched |
| What-if projected table | `pages/live/WhatIfSection.tsx` | **hairline** (correction) |
| Overview winner block | `pages/live/OverviewSection.tsx` | **hairline** (correction) |
| Stats → Positions column heads | `pages/stats/PositionsView.tsx` | **hairline** (correction) |
| Tournament comment authors | `pages/live/TournamentCommentParts.tsx` | **hairline**, by decision |
| Guestbook entries | `pages/profile/GuestbookEntryCard.tsx` | **hairline**, by decision |
| Pickers (`PlayerPicker`, `DuoPicker`, friendly + new-tournament forms) | `ui/primitives/AvatarButton.tsx` | **hairline**, by decision; the selection `ring-2 accent` still sits outside it |

Stats → H2H itself (`H2HView`, `HeadToHeadRows`) has **no avatars at all** — its rows are names and
records — so "H2H" in the task's list is the matchup header, which is done.

**The separable "defending" line: built, and made truthful.** A match-history tournament block now
says under its pills what the laurel on its date pill means:
`Lorbeerkranz at stake · Berni defending`. It sits well: the pill row stays one line (a stake
*pill* was tried first and pushed 5 of 12 blocks to a second pill line at 390px — `t15b-stake-*`
versus `t15b-stake2-*`), the line costs 19px on the blocks that have a stake, and unlike a crown
pill it cannot be misread as "Berni won this one".

One correctness catch worth recording: `cup_stakes` does **not** always name a defender. For the
single tournament that created each cup there was no holder, and `services/cup.py` fills the entry
with the *winner* instead (dev data: t2 "1. Lorbeerkranzturnier" → Atzi, t7 "Wundleckturnier" →
Berni). "Atzi defending" there is simply false, and no backend change was allowed, so
`useCupFirstClaims` reads the cup's own lineage — `history[…].from.id === 0` marks the first claim —
and those two blocks read `Bauernkranz at stake · nobody held it yet` instead. Verified in the
browser on Atzi's player history, where both first claims and eight real defences appear in one
list. The lineage query sits one component deeper than the line itself, so a list with no cup at
stake (every friendly, most tournaments) asks the server nothing and still needs no `QueryClient`
around it — which is why the five surfaces that render `MatchHistoryList`, and its existing tests,
were untouched.

**C + D — two blocks, one shape**

The played block lists **every** match in `order_index` order (T12's "last five, newest first" is
overridden, and the `#N` markers now count up, reading exactly like the Matches tab). The standings
block already listed every player. So neither link reveals anything and both were labelled for what
they do instead, naming the tab they land on so the word on the button is the word on the tab:

| Block | Live tournament | Done tournament |
|---|---|---|
| Standings | `Open Standings →` | `Open Results →` |
| Played matches | `Open Matches →` | `Open Matches →` |

The standings link also **replaces** the block-wide tap target that used to sit there, which was not
only redundant next to a labelled link but a real accessibility bug: a `<button
aria-label="Open results">` wrapped around the table means the label *replaces* its contents in the
accessibility tree, so the whole standings read as two words to a screen reader. The block is now
plain content with one labelled action beside its section label, and the rows are byte-for-byte the
ones T14 measured (columns still at x = 28 / 52 / 274 / 302 / 338 at 390px, identical in every row,
re-asserted after the change).

**Not done, deliberately.** The live-only **Next matches** block keeps its block-wide button and the
same `aria-label` swallowing — it is T12's block, T15 names only the two, and unlike them it *does*
truncate (3 of N), so relabelling it "Open Matches" without an in-place expander would be a
different decision than the one taken here. Flagged for Roli rather than fixed in this task.

**Verification**

- `cd frontend && npm run check` → typecheck + eslint clean, **48 files / 463 tests passed**
  (~39 s; 46/452 before). `npm run build` green, same pre-existing 500 kB chunk hint. No backend
  change, so no `make test` / `make gen-types`.
- Isolated stack: backend `:8003` on a copy of the dev DB (`backend/data/verify.db`), vite `:8020`.
  Dev data holders: Berni = Lorbeerkranz (gold), Rumpi = Bauernkranz (green), which is what puts a
  holder and a non-holder side by side in t19's standings.
- Playwright at **390×844 and 1280×900 in blue and light** (4 combos, 0 console/page errors, no
  horizontal overflow anywhere, `a a` = 0):
  - **A**: `/live/{19,17,18}` (done), `/live/21` (live), `/live/20` (draft) all land on Overview;
    `/live/19?tab=matches` still opens Matches.
  - **D**: t19 lists 6 rows `#1…#6`, t17 nine `#1…#9`, t21 two — every finished match, ascending,
    each href the match page.
  - **C**: section heads are exactly `Winner · Final standings [Open Results] · Played matches
    [Open Matches]` when done and `Current match · Standings [Open Standings] · Next matches ·
    Played matches [Open Matches]` when live; clicking them lands on `?tab=standings` /
    `?tab=matches` with the right tab selected.
  - **B**: a 17-surface sweep counting `[data-avatar-ring]` per page — the nine "now" surfaces all
    show cup rings (e.g. Streaks 8 of 20, Cups 9 of 19, dashboard 4 of 8) and the eight tournament /
    past / no-marking surfaces show **0 cup rings out of 44 avatars** (standings 4, 2v2 standings 6,
    What-if 10, Positions 6, comments 15, guestbook entries 1, Overview 1, plus the pickers). Comment
    authors were checked on t11 and t9 *specifically because* Berni and Rumpi wrote comments there.
    Every avatar's box measures exactly its call site's `sizeClass` (36×36 for `h-9` with and without
    a ring), so nothing moved.
- Screenshots (scratchpad `shots/`): `t15-final-t{19,17,21,20}-{390,1280}-{blue,light}.png` (the
  finished tabs), `t15b2-standings-{390,1280}-{blue,light}.png` (holder + non-holder + crown, the
  corrected treatment), `t15b2-players-{390,1280}-{blue,light}.png` (cup rings where they belong),
  `t15b-{standings,streaks,records,cups,statstable,positions,player,matchup,dashboard,players,profile,
  guestbook,whatif,overview,comments}-{390,1280}-{blue,light}.png` (the call-site sweep),
  `t15b-commentauthors-t{11,9}-*`, `t15b-picker-*`, and `t15b-stake{,2,3}-*` (the two "defending"
  renderings that were compared, and the final one).

---

# Round 6 — Audit findings (2026-09-13)

Three audits over `main` @ `cabda7c`: design-canon compliance, correctness/robustness, and a
runtime sweep (176 page loads, 44 route+tab combinations × 2 widths × 2 themes). The severe
backend claims were re-verified by the planner before being written down here. Baseline that
already holds and must not regress: zero console errors, zero failed requests, zero horizontal
overflow, zero nested anchors, no page hidden behind the bottom bar.

## A1 — Permissions: two endpoints trust "editor" too far  ☑

**A1a. A finished tournament's result can be rewritten by any editor — and that moves the cup.**
`backend/app/routers/tournaments.py:745-751`: `PATCH /tournaments/{id}/decider` is guarded by
`require_editor`, injects `role` and **never reads it**, and never calls
`ensure_not_done_or_admin(...)` — while its own docstring (`:766-770`) says "Editors: can set
decider while tournament is NOT done. Admin: can set/adjust anytime, even after done", and every
sibling (`:462`, `:531`, `:558`) does exactly that. The decider decides a tied tournament's winner,
which `services/cup.py` folds into cup ownership, so an editor can hand themselves a cup months
later. `frontend/src/pages/live/AdminPanel.tsx:145` computes `canEditDecider` with no `done` check
either, so the UI offers it. Fix both ends; mirror the sibling's exact status/detail string.
**A1b. Any editor can replace or delete the image on anyone else's comment.**
`backend/app/routers/comments.py:702` (`PUT .../image`) and `:744` (`DELETE .../image`) carry only
`dependencies=[Depends(require_editor)]`. The text route `PATCH /comments/{id}` (`:598`) correctly
enforces `comment_can_edit` (own comment inside the 1h window, or admin) and player media is
owner-guarded (`routers/players.py:377,411`), so this is an omission, not a policy. Apply the same
rule the text edit uses.
Tests: extend `backend/tests/test_authorization.py` / `test_comments_current.py` — an editor gets
403 on another author's comment image and on a done tournament's decider; an admin still succeeds.
`backend/tests/test_stats_endpoints.py:119` has a comment claiming the editor case is covered but
only ever calls with admin headers — fix that too.

**DoD:** `make test` green with the new cases; a reader/editor/admin matrix in Deviations.

**Deviations:** (implemented 2026-09-13 on `feature/2026-09-audit`)

Both findings reproduced exactly as written before anything was changed.

**A1a.** `patch_decider` now does what every sibling does, in the same two lines and the same
place (right after the `get_or_404`): `compute_status_for_tournament` + `ensure_not_done_or_admin(
status_now, role, action="set the decider")` — the previously unused `role` is what it reads.
Detail string: `Tournament is done (admin required to set the decider)`.

**A1b.** The rule was not re-invented: the block `patch_comment` already ran is now a helper,
`_ensure_can_edit_comment(s, c, claims)` in `routers/comments.py` (next to the other `_validate_*`
guards), which calls the same `comment_can_edit` and raises the same 403
(`You can only edit your own comment within an hour of posting`, now through `api_utils.forbidden`
instead of an inline `HTTPException` — same response, the documented convention). It returns
`(viewer_id, is_admin, real_author_id)` so `patch_comment` still recomputes `can_edit` after the
edit without loading the author link twice. Both image routes dropped
`dependencies=[Depends(require_editor)]` for `claims: dict = Depends(require_editor_claims)` and
call the helper — the shape `players.py` uses for owner-guarded media.

**Matrix** (verified by the new tests):

| Endpoint | reader (no token) | editor, not own / done | editor, own / not done | admin |
|---|---|---|---|---|
| `PATCH /tournaments/{id}/decider` | 401 `Missing token` | 403 `Tournament is done (admin required to set the decider)` | 200 (tournament draft/live) | 200 always |
| `PUT /comments/{id}/image` | 401 `Missing token` | 403 `You can only edit your own comment within an hour of posting` | 200 (own comment, <1h) | 200 always |
| `DELETE /comments/{id}/image` | 401 `Missing token` | 403 (same string) | 200 (own comment, <1h) | 200 always |

(Reader = no `Authorization` header → 401 from `require_auth_claims`; a token below `editor`
would be 403 `Insufficient privileges`. There is no such account.)

**Frontend.** `AdminPanel.tsx:145` mirrors the server rule the way `canReorder` (`:112`) already
did — `isAdmin || (role === "editor" && !done)` — and an editor on a done tournament now gets the
muted line *"Tournament is done — only an admin can set the decider."*, the same shape as the
existing *"Tournament is done."* under the reorder buttons (`:261`). **Consequence worth knowing:**
`LiveTournamentPage.tsx:258` only shows the decider editor at all when `isDone && isTopDraw`, so in
today's UI the decider is now effectively **admin-only**; the editor path exists on the API (a tie
at the top of a *live* tournament) but nothing renders it. That is what the docstring always said,
and it is exactly the hole A1a describes, so it was not softened.

**Tests.** `test_tournament_endpoints_current.py::test_decider_is_open_to_editors_only_until_the_
tournament_is_done` (reader/editor/admin, live *and* done, asserting the detail string);
`test_comments_current.py::test_comment_image_follows_the_text_edit_rule` (reader, non-author
editor on PUT and DELETE, author, admin override); one window case appended to
`test_comment_guestbook_edits.py::test_comment_edit_window_expires` (past 1h the author cannot
attach an image either, the admin can) — that file already owns the backdating helper.
`test_stats_endpoints.py:119` now actually calls the decider as editor (403) before the admin call
(200), so its comment is true.

**Noticed, reported, not fixed** (out of A1's scope):
- `tournaments.py:602` `PATCH /second-leg` also injects `role` and never reads it, and its own NOTE
  says it may revive a *done* tournament to "live" on purpose — an editor can therefore still
  re-open finished tournament data through it (and then edit matches, which the revival makes legal).
  Same class as A1a, but documented as intended, so it needs Roli's call, not a worker's.
- `tournaments.py:855` `POST /reassign` injects an unused `role` too, but its own preconditions
  (every match still `scheduled` and untouched) make a done tournament unreachable — harmless.
- `matches.py:94` and `:276` hand-write the `Tournament is done (admin required to …)` string
  instead of calling `ensure_not_done_or_admin` (`:94` has a deliberate last-match exception and
  cannot use it as-is; `:276` could).
- The reader hint under the decider still reads *"Login as editor/admin to set a decider."* — with
  the editor path unreachable in the UI (above) that is now imprecise; left alone deliberately.
- `deleteCommentImage` (`frontend/src/api/comments.api.ts:112`) has no call site — dead API surface.

**Verification:** `make test` → **132 passed** (130 before, +2 cases), `make lint` → *All checks passed!*,
`make gen-types` → no diff (no response model changed), `cd frontend && npm run check` → typecheck
+ eslint clean, **48 files / 463 tests passed**. No browser run: both changes are permission logic,
and the plan allows editor/admin flows to be checked by code + tests (Runtime verification note).

---

## A2 — The match page can silently overwrite another editor's result  ☑

`frontend/src/pages/live/MatchDetailPage.tsx` reads `qk.tournament(tid)` (`:63`) but subscribes to
**no** tournament channel — it is a sibling route (`app/App.tsx:35`), not nested under
`LiveTournamentPage`, and `applyTournamentsChanged` (`hooks/realtime/applyEvent.ts:105-116`) never
invalidates `qk.tournament`. The form seeds once on `[match?.id]` (`:96-102`) and `saveMut` posts
`state`, both clubs and both goals unconditionally (`:131-137`). Two editors on the same match: the
second save reverts the first.
- Subscribe the page to the tournament channel (`useTournamentWS`), the way `LiveTournamentPage`
  does, so the cache stays fresh.
- Re-seed the form when the server's match changes **and** the field is not dirty; never clobber
  what the user is typing.
- Decide and record what happens when the underlying match changed while the form was open —
  the cheapest honest answer is to compare against the last-seen values and warn before saving.

**DoD:** two browsers on one match; A saves 2:1 finished, B (stale) saves → B does not silently
revert A; realtime updates land on the match page; `npm run check` + build.

**Deviations:** (implemented 2026-09-13 on `feature/2026-09-audit`)

Reproduced first, two browser contexts on match 116 of the live tournament 21 (isolated stack,
DB copy): A saved 3:1 → B's page never moved, and B pressing **Save** *having touched nothing*
wrote 1:0 back. Also reproduced with disjoint fields (B only flipped the status → A's 4:2 became
1:0 finished) and with a real clash (B had typed 5, A saved 2:2 → B's save wrote 5:0, no warning).

**The decision.** The form no longer holds a copy of the match. It holds **only the fields this
editor changed** (`MatchEdits` in the new `pages/live/matchDraft.ts`), each with the value it
started from (`base`); every untouched field simply renders the server's current value. That
makes the two halves of the problem disappear rather than be managed:
- a realtime update *is* the form for untouched fields — there is no re-seed that could land
  under someone's hands, and no effect that writes state (see "lint" below),
- a touched field is this editor's until they save or drop it.

Three rules ride on that:
1. **`base` is captured when the field is first changed, not at page load.** The yardstick is
   "the value I was looking at when I touched this", so an update the editor has already watched
   arrive is not replayed as a conflict. Setting a field back to its base drops the override, so
   the field follows the server again.
2. **A save sends only the changed fields.** `PATCH /matches/{id}` already applies per field
   (`model_fields_set` on the body *and* on each side), so a narrow body is enough — no backend
   change. Disjoint edits now merge: B flipping the status keeps A's goals.
3. **A stale save cannot win quietly.** The save re-reads the tournament (`fetchQuery`,
   `staleTime: 0` — the global default is 5 s, and the socket can be dead on a backgrounded
   phone) *immediately before writing*. If a field both editors moved disagrees and this exact
   server state has not been acknowledged, **nothing is sent**: the amber banner names
   field / theirs / yours, an error toast says the save was not sent, and the button becomes
   **"Save my changes anyway"** — a second, deliberate press overwrites. "Use their values"
   drops this editor's edits instead. Acknowledgement is the *whole* match state, so another
   change arriving between the two presses re-arms the guard (deliberately strict).

Also: `useTournamentWS(tid)` is now mounted here (it is a sibling route, so it had no channel at
all — the comments tab on this page was equally frozen); pressing Save with nothing changed sends
no request at all and just goes back; `swap-sides` drops pending edits, because after a swap a
per-side edit means the opposite of what it meant; goals are numbers in state now (the string
state + `parseGoal` only existed for a text input this page no longer has).

**Rejected:** re-seeding the whole form on every `tournament.sync` (that *is* clobbering someone's
typing), and a `window.confirm` on every save (noise on the 99 % of saves where nobody else is
editing). A version/ETag on the match would be the real fix for two saves in the same second;
that is a backend contract change and Roli's call, not a worker's — the pre-save re-read closes
everything except a true sub-second race.

**Lint note worth keeping:** the first implementation synced state in a `useEffect` (the shape the
old code used). `react-hooks/set-state-in-effect` (React Compiler rules, on in this repo) rejects
it. That is what pushed the design to derived state — the rule was right.

**Two-browser proof** (A = admin Roli, desktop 1280; B = editor Flo, phone 390; same match,
`?tab=edit`; server state read back from `GET /tournaments/21`):

| # | What happened | Server before A2 | Server after A2 |
|---|---|---|---|
| 1 | A saves 3:1; B (untouched form) presses Save | **1:0** — A's result gone; B's page still showed 1:0 | **3:1** — B's page had followed to 3:1 live, B's Save sent nothing |
| 2 | B has typed 5; A saves 2:2; B presses Save | **5:0** — silently, and A's 2 reverted to 0 | **2:2** — refused, banner *"Goals Rumpi + Berni: now 2 on the server — you have 5"*; 2nd press ("Save my changes anyway") → **5:2**: B's 5 deliberately, A's 2 kept |
| 3 | B flips the status only; A saves 4:2; B presses Save | **1:0 finished** — A's goals gone | **4:2 finished** — both edits survive, no banner needed |

Checked in both widths and both themes (screenshots), plus one club run (random matchup → Save
wrote `aClub`/`bClub` only, goals and state untouched). Zero console errors in every run.

**Noticed, reported, not fixed** (outside A2):
- `pages/live/CurrentGameSection.tsx` (the live page's inline editor) autosaves a *full* body
  (`state` + both clubs + both goals) on a debounce — the same class of overwrite on a different
  surface. It sits inside a subscribed page, so its inputs do follow the server, but two editors
  there still fight field-by-field.
- `hooks/realtime/applyEvent.ts:105` `applyTournamentsChanged` still never invalidates
  `qk.tournament` — the coarse `/ws/tournaments` channel cannot refresh an open detail page.
  Irrelevant here now (this page has its own channel) but A5 should look at it.

---

## A3 — A club edit never reaches stats, profiles or friendlies  ☑

`frontend/src/pages/ClubsPage.tsx:188,221,231,422` invalidate `qk.clubs(game)` = `["clubs", game]`.
TanStack prefix matching is one-directional, so the **unfiltered** `["clubs"]` key is never
matched — and that is the key Stats, Profile and Friendlies use (`stats/H2HView.tsx:230`,
`h2h/MatchupView.tsx:148`, `stats/PlayerProfile.tsx:65`, `stats/StarsView.tsx:47`,
`ProfilePage.tsx:75`, `tools/FriendlyMatchesListCard.tsx:229`) with 60s–5min staleTimes.
`ui/ClubStarsEditor.tsx:57` already does it right (`qk.clubs()`), which shows the intent.
Fix the invalidations (and check every other key factory call site for the same one-way-prefix
trap — report what you find, `qk` was swept once in A1 of the June refactor and may have others).

**DoD:** rename a club / change its stars on the Clubs page → the new value is visible on Stats,
a profile and the friendlies list without a reload; `npm run check`.

**Deviations:** (implemented 2026-09-13 on `feature/2026-09-audit`)

All four invalidations in `ClubsPage.tsx` (create `:188`, patch `:221`, delete `:231` and the
manual **Refresh** button `:422`) now pass `qk.clubs()`; the page's own *query* keeps
`qk.clubs(game)` — the prefix has to be on the invalidation side, never on the query side. One
comment at the first site says why, so the trap does not grow back. `src/test/queryKeys.test.ts`
gained a regression test that asserts **both** directions against a real `QueryClient`:
`qk.clubs()` invalidates `["clubs"]` *and* `["clubs", game]`, while `qk.clubs(game)` leaves
`["clubs"]` untouched.

**Runtime proof** (isolated stack, DB copy, admin session, **one SPA session** — the only page
load is the first one; every later hop is a nav click). Club 7 `Paris Saint-Germain F.C.` →
`Paris A3 Renamed FC`, renamed on `/clubs`:

| Surface (after the rename, no reload) | before A3 | after A3 |
|---|---|---|
| `/friendlies` → *Details* | old name still shown | new name, old name gone |
| `/stats` → *Player* → *Details* (match history) | old name still shown | new name, old name gone |

Zero console errors. Every consumer listed in the finding shares the **same** cache entry
(`["clubs"]`), so the two surfaces above prove the invalidation for `H2HView`, `MatchupView`,
`PlayerProfile`, `StarsView` and `ProfilePage` as well.

**Where the DoD could not be checked as written:** `/profiles/:id` renders **no** club name or
rating today — both of its `MatchHistoryList`s hardcode `showMeta={false}`
(`profile/MatchHistorySection.tsx:31`, `profile/ProfileOverviewTab.tsx:189`), so its
`qk.clubs()` query (`ProfilePage.tsx:75`) feeds a prop nothing displays. The invalidation now
reaches it; there is simply nothing on that page to look at. Reported, not changed.

**Sweep of every key factory that takes an optional argument** (the one-way-prefix trap):

| Key | Query sites | Invalidated with | Verdict |
|---|---|---|---|
| `clubs(game?)` | `["clubs", game]` (Clubs page, live page, match page, friendly cards) **and** `["clubs"]` (stats, matchup, profile, stars, friendlies list) | was `clubs(game)` → now `clubs()` | **the bug — fixed** |
| `friendlies(mode?)` | `friendlies(mode)` (`FriendlyMatchesListCard:235`) | `friendlies()` (`FriendlyMatchCard:295`, `FriendlyMatchesListCard:130,278`) | right way round |
| `stats.players / h2h / streaks / ratings / playerMatches / playerTiles / starsPerformance` | always the full form | only ever `stats.all()` = `["stats"]` | safe; the zero-arg forms of these factories are used **nowhere** outside `queryKeys.test.ts` |
| `push.subscriptions(token)` | full key | `push.subscriptionsAll()` (prefix) *and* `push.subscriptions(token)` (exact) | both correct |

Correct prefix/full pairs elsewhere, checked and left alone: `commentsTournament(tid)` ⊂
`commentsTournamentFull(tid, token)`, `playerPokesReadPrefix(pid)` ⊂ `playerPokesReadIds(pid,
token)`, `notificationsAll()` ⊂ `notifications(token)`, `cupAll()` ⊂ `cup(key)`/`cupDefs()`,
`tournaments()` ⊂ `tournamentsLive()`.

**Noticed, reported, not fixed:**
- `qk.players()` = `["players"]` is a prefix of **every** player key — profiles, avatars,
  headers, guestbook, pokes and all their read-maps. `PlayersAdminPage:74,94` invalidates it
  after a create/rename, so all of those refetch too. A superset, not a bug, but worth knowing
  before anyone puts an expensive query under `["players"]`.
- `qk.tournament(id)` (singular) is deliberately **not** under `qk.tournaments()`, which is why
  the coarse `/ws/tournaments` channel cannot refresh an open detail page (see A2, A5).
- The `?? "none"` keys (`playerProfile`, `playerGuestbook`, `playerPokes`, `stats.*` on the
  profile) use the identical expression on both the query and the invalidation side, so they
  match; with a null id both sides address a placeholder key no query ever holds — a no-op.
- `qk.leagues()` is invalidated nowhere. Nothing in the UI creates a league (the Clubs page only
  picks from the existing list), so nothing goes stale today.
- There is no crest-upload UI (`PUT /clubs/{id}/crest` is API-only), so no invalidation is
  missing for crests.
- Club **names and star ratings are resolved client-side from the clubs list** on every surface
  (the stats endpoints return `club_id` only), so `["clubs"]` really is the single cache entry a
  club edit has to reach — no `stats.all()` invalidation is needed on top.

---

## A4 — The Source filter is offered where the endpoint ignores it  ☑

`GET /stats/players` takes no `scope` (`backend/app/routers/stats.py:59-65`) — it is
tournaments-only. Yet `pages/stats/StatsInsights.tsx:44,47` declares `scope: true` for
`overview:table` and `overview:records`, and `pages/stats/standings.ts:25-27` fetches
`getStatsPlayers({mode, lastN: 12})` with no scope while the rest of the same row comes from the
scope-aware ratings endpoint — so one row mixes friendlies-only W/D/L with tournaments-only form.
Two honest options; pick one and say why:
1. **Teach the endpoint the scope** (it already exists in `services/stats/scope.py` and every other
   stats service uses it) — the filter then means what it says everywhere.
2. **Stop offering it** on those sub-views, like Positions and Cups already do.
Option 1 is the better product answer if the service layer makes it cheap; option 2 is honest and
small. Whichever you choose, no surface may show a filter it ignores.

**DoD:** every stats sub-view either honours Source or does not display it; a screenshot per
sub-view with Source = Friendlies; `make test` if the backend changed; `npm run check`.

**Deviations:** (implemented 2026-09-14 on `feature/2026-09-audit`)

**Option 1 — the endpoint learned `scope`.** Option 2 was checked first and is the wrong answer
here, because *neither* sub-view actually ignores Source; each one mixes.

- `overview:table`: everything except one column comes from the **scope-aware** ratings endpoint
  (`standings.ts:19-23` — pts, P, W-D-L, Win%, GF/GA/GD, Elo). Only **Form** came from
  `/stats/players`. Hiding the filter would have hidden a control that thirteen of the fourteen
  columns obey — and the URL keeps `?source=` regardless, so the table would still have changed
  silently when the filter was set from another sub-view. A hidden filter that is honoured is a
  worse lie than a shown filter that is half honoured.
- `overview:records`: the four match superlatives already come from the scope-aware
  `/stats/player-matches`; only the "Most tournament wins" group came from `/stats/players`.

**What the service layer cost** (the thing the task said to look at): the two halves it needed
already existed. `services/stats/ratings.py` and `streaks.py` each load "finished tournament
matches + finished friendlies wrapped to look like matches" with `scope.py`'s
`include_tournaments` / `include_friendlies` / `friendlies_schema_ready` / `safe_exec_all`, and
`services/stats/core.py` — which does all of `/stats/players`' counting — is duck-typed
throughout (`getattr(m, "tournament", …)`, `m.state`, `m.sides`). So the change is one loader
(+25 lines in `players.py`), one query param, one echoed field. That is cheaper than the
frontend surgery option 2 would have needed, and it makes the filter mean one thing everywhere.

**The one judgement call: what a friendly does to the tournament half of the payload.** A
*position* only exists inside a tournament, so friendlies contribute none:
`finished_tournament_ids` is derived from `m.tournament_id`, which the wrapper sets to `None`, so
with `scope=friendlies` `tournaments` is `[]`, every `positions_by_tournament` is `{}` and the
Records "Most tournament wins" group therefore disappears — which is the truth ("no titles are
won in friendlies"), not a regression. With `scope=both` the totals and form span both sources
while the tournament block is still built from the tournament half alone. `cup_owner_player_id`
is cup state and stays scope-independent.

**One small consolidation, deliberate.** `_friendly_as_match_like` existed **twice**, byte for
byte, in `ratings.py` and `streaks.py`; `players.py` would have made three. It moved to
`services/stats/scope.py` as `friendly_as_match_like` (the module those three already import for
every other scope helper) and gained the two attributes `core.py` reads on whatever it is handed
— `state="finished"` (the loaders only ever wrap finished friendlies) and `tournament_id=None`
(a friendly belongs to no tournament). No behaviour change for ratings/streaks: both filter
`state == "finished"` in SQL already and never read either attribute. This removes duplication
rather than adding a fourth copy; nothing else in those two files was touched.

**Frontend.** `getStatsPlayers` takes `scope` (omitted when `tournaments`, like every sibling
fetcher); `qk.stats.players(mode, lastN, scope)` gained the optional third segment in the same
shape `qk.stats.streaks` already uses, so the cache splits per source. Two call sites pass it —
`standings.ts` (Form) and `RecordsView` (titles). The call sites that do **not** offer the filter
were deliberately left on the default: `PositionsView` (Positions declares `scope: false`),
`ProfilePage`, `TrendsPreviewCard` and `StandingsPreviewCard` (dashboard, always
`"tournaments"`). The `FILTERS` map in `StatsInsights.tsx` is unchanged — it was already telling
the truth about which sub-views *should* use Source; the endpoint was the part that lied.

**Runtime proof** (isolated stack: backend :8003 on a copy of the dev DB, vite :8020, scratch
secrets; 20 friendlies and 18 tournaments in the data). Every sub-view loaded at 390px and
1280px with `?source=friendlies`, **zero console errors and zero failed requests** in every run:

| Sub-view | Offers Source? | With Source = Friendlies |
|---|---|---|
| Overview · Table | yes | Roli P 16 (was 65), Form (last 12) redrawn from friendlies |
| Overview · Positions | **no** (pill shows Mode only) | unchanged, as before |
| Overview · Streaks | yes | friendly-only runs |
| Overview · Records | yes | the four superlatives are friendlies; "Most tournament wins" is **gone** |
| Overview · Cups | **no** (no pill at all) | unchanged, as before |
| Trends | yes | x-axis is Friendly #1…#21 |
| H2H | yes | matrix shows only friendly meetings |
| Player | yes | Played 16, Form sparkline redrawn |

The Form sparkline was read out of the DOM per source to prove it moves and is not a cache echo:
`tournaments` → `2,20,2,14,2,2,20,20,2,2,2`…, `friendlies` → `14,14,14,20,14,2,14,2,2,2,2`…,
`both` → a third series. `/stats/players?scope=…` at the API: Roli played 65 / 16 / 81.

**Noticed, reported, not fixed:** `/stats/players` still returns `cup_owner_player_id`, marked
"legacy" in its own comment since the frontend moved to `/cup`; nothing reads it
(`grep cup_owner_player_id frontend/src` → 0 hits outside the generated schema). Dead response
surface, out of A4's scope.

---

## A5 — Deep links and freshness: four smaller realtime/navigation bugs  ☑

1. **`?unread=1` never jumps.** `pages/live/LiveTournamentPage.tsx:199-210` deletes the param
   *outside* the `if (latestUnreadCommentId)` guard, but that id comes from a comments query still
   in flight on first render — so the flag is consumed before it can be used. Produced by
   `TournamentsPage.tsx:190`.
2. **Both comment deep links wipe their own `?tab=`.** The same effect and `:186-197` call
   `setActiveTab("comments")` and then `setSearchParams` built from the **stale** render-time
   `location.search`, so the tab param is dropped — a reload or a `lastLocation` replay lands on
   Overview.
3. **The guestbook has no realtime**, though `hooks/realtime/useRealtime.ts:108` names the channel
   "pokes / guestbook": `resyncPlayer` (`:99-107`) invalidates only poke keys, and
   `routers/players.py:607` broadcasts nothing on a new entry. Either wire it (broadcast + resync)
   or fix the comment and the docs.
4. **A new comment never updates the tournaments-list badge.** `applyEvent.ts:79-80` invalidates
   only `qk.notificationsAll()`, while its siblings (`:102`, `:111`) also invalidate
   `qk.commentsSummary()`; the backend sends no global event for a plain comment
   (`routers/comments.py:523-525`).

**DoD:** the unread pill jumps to the comment on a cold load; the tab survives a reload; a second
viewer sees a new guestbook entry and a moved comment badge without remounting; `npm run check`.

**Deviations:** (implemented 2026-09-14 on `feature/2026-09-audit`)

All four reproduced first, on this branch, before anything was changed (the "before" column
below is measured, not inferred).

**Items 1 + 2 — one cause, one fix.** Both deep links wrote the URL **twice in one render
pass**: `setActiveTab("comments")` first, then `setSearchParams(new URLSearchParams(
location.search) minus their own param)`. The second write starts from the render's snapshot of
the URL, which predates the first, so it reverted it. (Worth knowing: react-router 6.30's
functional `setSearchParams(prev => …)` is **not** a fix — `prev` is the same render-time
`searchParams` memo, `react-router-dom/dist/index.js:1031`.) Both effects now call one writer,
`openCommentsForDeepLink(consumedParam, focusCommentId)`, which builds a single
`URLSearchParams` from `window.location.search` — the live URL, the source `setActiveTab` in
this file already trusted — sets `tab=comments`, drops the spent param and writes **once**. It
deliberately does not `swapTabScroll`: a deep link is not a tab switch away from something, it
scrolls to the entry it named (`useTabParam`'s own docstring already says deep links are left
alone).

Item 1 needed one more thing: the flag was spent before the data that answers it existed. The
effect now waits for `commentsQ.isSuccess && seenCommentIdsLoaded`. **Both** queries matter —
until the read ids arrive the seen-set is empty and *every* comment looks unread, so acting on
`commentsQ` alone would have jumped to whatever is newest, read or not. `useSeenSet` therefore
returns `{ ids, loaded }` instead of a bare `Set` (two call sites); a query that never runs (a
reader has no read state) and a failed one both count as loaded, because their empty set is the
honest answer. When nothing is unread any more the link still opens the feed it pointed at
rather than silently doing nothing — checked as a reader: lands on Comments, param consumed,
`history.length` unchanged (no replace loop).

**Item 3 — wired, not documented away.** The evidence said wire it: the channel exists, the
profile page is already subscribed to it, `resyncPlayer` was already the right shape, and the
DoD asks for a second viewer to see the entry. Only two halves were missing, so it is 12 lines,
not a feature. Backend: `_broadcast_player_pokes_event` is now
`_broadcast_player_profile_event` (it was never poke-specific) plus a thin
`_broadcast_guestbook_event`, called on **create, patch, vote and delete** — every write that
changes what other viewers see. Frontend: `resyncPlayer` invalidates the guestbook keys next to
the poke ones (`playerGuestbook`, `playerGuestbookSummary`, `playerGuestbookReadIds`,
`playerGuestbookReadMap`), which is exactly the set `useProfileGuestbook` invalidates after its
own writes. **Read-marking is deliberately not broadcast**: unlike pokes (which show the author
an "unread" marker, `playerPokesAuthoredUnread`), the guestbook has no author-side read
indicator, so a broadcast would make every other viewer refetch their own private read state
for nothing.

**Item 4 — both halves, both directions.** The reducer half: `applyCommentUpsert` now
invalidates `qk.commentsSummary()` like its siblings. But that only helps a viewer already
inside the tournament — the tournaments **list** is subscribed to the coarse channel alone, and
the backend sent nothing there, so the backend half was required: `POST
/tournaments/{id}/comments` now also sends `tournaments.changed {action: "comment"}`. That
action is new and is the one action `applyTournamentsChanged` does **not** let refetch the
tournament list (a comment changes nothing about the tournament), so the coarse channel stays
coarse and cheap. **Deliberately beyond the literal finding:** the delete path got the same
treatment (`applyCommentDelete` + `notify_tournaments_changed` in `delete_comment`), because a
deleted comment otherwise leaves a phantom unread badge for every other viewer — the identical
bug in the other direction, two lines.

**Two-browser proof** (isolated stack: backend :8003 on a copy of the dev DB, vite :8020,
scratch secrets. A = Flo/editor, desktop 1280; B = Roli/admin, phone 390; separate browser
contexts, so separate storage and separate sockets. "before" = the same script against the
branch's previous commit, backend restarted on the old code):

| # | Measured | before | after |
|---|---|---|---|
| 1 | cold load of `/live/8?unread=1` (brand-new page, nothing cached) | URL `/live/8`, `scrollY 0`, nothing flashed, Overview | URL `/live/8?tab=comments`, **scrolled to y 854/6219 and flashed exactly `comment-269`**, the new unread one |
| 2 | then F5 | `/live/8`, tab **Overview** | `/live/8?tab=comments`, tab **Comments** |
| 2b | `/live/8?comment=<id>`, then F5 | `/live/8`, Overview | `/live/8?tab=comments`, Comments |
| 3 | A writes a guestbook entry on profile 3 through the UI; B sits on `/profiles/3?tab=guestbook` | **not seen after 12 s** | **seen in ~0.5 s**, B never navigated |
| 4 | A writes a comment on tournament 8; B sits on `/tournaments` | badge **7 → 7** after 12 s | badge **8 → 9** in ~0.5 s, B never navigated |

Items 1/2/2b re-run at 1280 with the same result. Zero console errors and zero failed requests
in every run.

**Noticed, reported, not fixed:**
- **A dev-only trap that cost an hour and will cost the next worker one too:** on a *cold full
  page load* of a route the Vite dev server has not optimised yet, Vite force-reloads the page,
  which aborts the in-flight `GET /me`; `AuthContext`'s validator treats any rejection as a bad
  token and calls `clearAuth()`, so the browser silently drops to **reader** and every
  token-gated query disappears. It reproduces identically on `HEAD` without any A5 change, and
  only with `vite dev` — but it means "log in, then open a deep link in a fresh page" measures
  a logged-out session unless the dev server is warmed first (the verification scripts now do).
  Worth a thought for production too: `clearAuth()` cannot tell "the token is invalid" (401)
  from "the request never finished" (abort/offline), and a PWA on a flaky phone connection hits
  the second case.
- `applyCommentMeta` invalidates `qk.commentsTournament(tid)` for *every* vote/pin/read event,
  which is a full comments refetch for a read-marking that only concerns one viewer.
- `qk.playerGuestbook(playerId)` and `qk.playerGuestbookSummary()` are `["players","guestbook",
  <id>]` and `["players","guestbook","summary"]` — a guestbook keyed by the literal player id
  `"summary"` would collide. Impossible today (ids are numbers); noted because A3 swept exactly
  this class of key hazard.
- `resyncPlayer` is not directly unit-testable (module-private, and the WS hook mounts a real
  socket); the guestbook broadcast is covered backend-side instead
  (`test_guestbook_writes_reach_the_profile_channel`), and the reducer half by the three new
  `applyEvent` cases.

---

## A6 — Accessibility and contrast: the runtime sweep's blocking finds  ☑

1. **The login submit button has no accessible name below 768px** —
   `pages/LoginPage.tsx:70-71` hides the label and the icon is `aria-hidden`, leaving an unnamed
   control as the only action on the page. It was the **only** unnamed control in the whole sweep.
2. **Light theme contrast, three failures:** white on the teal primary button = **2.49:1**
   (enabled "Save result", "Create tournament", "Back to dashboard"); accent `rgb(59,130,246)` on
   the light page ground = **3.09:1** for every active tab label, selected chip, inline link and
   the active bottom-bar label; the Lorbeerkranz holder's name (orange on the light ground) =
   **1.9:1** on the dashboard. Fix in `themes/light.css` / the cup colour mapping, not per call
   site, and re-check every theme afterwards — `blue`, `dark`, `red`, `green` must not regress.
3. **H2H matrix cells: white on mid-tone tiles = 2.47–2.84:1**, theme-independent. Fold this into
   the ramp fix (see A8's first item) rather than patching the text colour.
4. **Match rows are `role="button"` wrapping real buttons** (48 on a live Matches tab): swap sides
   and the reorder arrows sit inside the row's own click target, and the inner ones are 32×32.
   Restructure so the row's primary action is a stretched link/overlay (the `ListRow` pattern) and
   the buttons sit above it.
5. **Table sort headers are 16px tall** (`P` = 8×16, `Elo` = 18×16) on the dashboard standings and
   the stats Table — real controls, effectively untappable on a phone.

**DoD:** every control has an accessible name; the three light-theme contrast ratios are ≥ 4.5:1
for text (≥ 3:1 for large text), measured and listed; no interactive element nested inside another
interactive element on the Matches tab; sort headers ≥ 44px tall on mobile; screenshots per theme.

**Deviations:**

Everything was measured in the browser against the isolated stack (backend :8003 on a copy of the
dev DB, vite :8020, scratch secrets), *and* against the task's baseline `98d2690` served from a
second vite on :8022 — so every "before" below is a number the old code really produced, in that
theme, on that surface, not a recomputation.

- **Item 1 — the label came back, it did not become an `aria-label`.** A hidden name would have
  satisfied a scanner while the page's only action stayed a wordless icon on a phone. It is a
  full-width button on an otherwise empty card, so icon *and* label now show at every width.

- **Item 2 — exactly what moved (light theme only).** `blue`, `dark`, `red` and `green` resolve
  every one of these to the value they had before — checked token by token in the browser, and
  the cup gold in particular resolves to `251 191 36` (green: `245 208 90`), i.e. the same colour
  those themes already painted through `--color-gradient-gold-from`.

  | Token | from | to | on the light page ground |
  |---|---|---|---|
  | `--color-btn-text` | `255 255 255` | `12 10 9` | 2.49:1 → **7.94:1** |
  | `--color-accent` | `59 130 246` (blue-500) | `29 76 214` | 3.09:1 → **5.77:1**, and 2.64:1 → **4.60:1** under a selected chip's own `bg-accent/15` |
  | `--color-cup-gold` (new token) | `251 146 60` in light (`251 191 36` elsewhere) | `166 74 12` | 1.90:1 → **4.89:1** |
  | `--color-cup-green-dark` | `21 128 61` | `22 116 55` | 4.21:1 → **4.91:1** |

  - **The button keeps Roli's teal byte-for-byte.** White cannot reach 4.5:1 on `20 184 166`
    without replacing the colour (teal-700 *and* a darker hover, since the hover has to pass too);
    the page ink on the same teal is 7.94:1, and the green theme already pairs a bright button
    colour with dark ink, so this is the palette's own idiom rather than a new one. If Roli would
    rather keep white lettering, the alternative is `--color-btn-bg: 15 118 110` with
    `--color-hover-btn-bg: 17 94 89` (5.47:1 / 7.58:1) — a visibly darker button.
  - **The accent had to go two steps down, not one.** blue-600 is 4.34:1 on the ground and 3.57:1
    under a selected chip's tint; even blue-700 stops at 4.49:1 there. `29 76 214` is the first
    blue of the same family that clears 4.5:1 everywhere the accent is used *as text* — tab
    labels, chips, links, the bottom bar, the active sort header — and it lifts white-on-accent
    (the notification badge) from 3.68:1 to 6.87:1 on the way.
  - **Cups got their own tokens** instead of borrowing a medal gradient that light deliberately
    tints orange. `cupColors.ts` maps a cup key to `--color-cup-gold` / `--color-cup-green-dark`;
    `DESIGN.md` §2 now lists both, and says a cup's colour may never borrow a gradient again.
  - **The Bauernkranz's green was failing too** — 4.21:1 as the holder's name, same block, same
    cause. Fixed in the same breath; the plan names only the Lorbeerkranz because it is the worse
    of the two.

- **Item 3 — done here, and it is A8's breach 1.** A6.3 asked to fold the matrix into "A8's first
  item"; A8 has not started, so it was done here in full: the cells are off their hard-coded HSL
  and on `.h2h-cell`, the positions grid's mechanism (a hue + a 0..1 strength from the component,
  the tint and the ink from the stylesheet, one light-theme override). **A8's worker should tick
  breach 1 rather than redo it.** Measured cell by cell at 390px, every theme: the worst cell
  anywhere was **1.90:1** (light, Goal diff) and is now **5.01:1** (blue, Goal diff); in light
  alone 2.23:1 → **7.26:1**. The finding called the matrix "theme-independent" — it is not: the
  default W-D-L ramp was 3.31–3.35:1 in the dark themes too, while Played/Goal diff passed there.
  Hover changed from `brightness-125` to an edge in the cell's own ink, because a filter lifts the
  text with the tile and gives back the contrast the ramp just bought.

- **Item 4 — the whole row is the target, the buttons are above it.** `role="button"` + a
  hand-rolled keydown handler is gone: the row's action is a stretched `<button>` overlay
  (`ListRow`'s pattern), so Enter/Space are the platform's, and the aria-label names the fixture
  ("Open or edit match 1: Roli + Atzi vs Flo + Rumpi"). The reorder/swap buttons moved to
  32→**36px** — not 44: at 44 they own the meta line, and 36×36 is comfortably past WCAG 2.5.8's
  24×24 minimum. Re-measured on `/live/21?tab=matches` as admin: `a a`, `button button`,
  `a button`, `button a` and `[role="button"] *` are **all 0**, and no `role="button"` is left on
  the page (it was 5 rows with 9 buttons inside them).

- **Item 5 — 44px at every width, not only on mobile.** A sort header is now a button that fills
  its column and a 44px header row (the cell's padding moved into the button, so no column got
  wider). `P` went from 8×16 to **27×44** at 390px and 90×44 at 1280px; the dashboard preview and
  the stats Table share the component, so both are fixed at once. Desktop keeps the same 44px
  header — a second breakpoint for a header row nobody has complained about is complexity for its
  own sake.

- **Found while measuring, deliberately left (not A6, not a regression):**
  - **The primary button fails in the *dark* themes for the same reason.** The label colour is
    one shared token, so the sweep's light-theme finding is really a palette-wide one: white on
    `dark`'s teal is **2.49:1**, on `blue`'s blue-500 **3.68:1**, on `red`'s rose **4.32:1** —
    and `green`, the only theme that already uses dark ink on its bright button, is **6.54:1**.
    The fix is the same move this task made in light (ink instead of white, per theme, since ink
    on blue-500 is only 3.81:1 and that theme would need a darker button colour), but it changes
    four themes' primary buttons, which is Roli's call and not a contrast patch. Worth its own
    line in A8 or a follow-up.
  - `text-win` / `text-draw` as a bare number on the **light page ground** are 4.21:1 (they pass
    at 5.0:1 on a white card, which is where most of them sit). The cup green is likewise
    3.76–3.97:1 as the holder's name in the **dark** themes (it is the same green-700 there);
    only light was in scope here. Same family as A6.2, but not on its list.
  - `text-text-muted/40` separators (1.97:1) and the `/60` participant line on `/tournaments`
    (2.96:1) — an alpha applied to a token that is already the muted one. A7 territory.
  - The `red` theme's selected chip is 4.10:1 (its accent on its own 15% tint) — the same shape
    as the light-theme chip finding, in a theme the sweep did not cover.

---

## A7 — Runtime polish: the rough edges the sweep photographed  ☑

Each is small on its own; together they are what makes the app feel unfinished. Fix what is cheap,
and say plainly which you left and why.
1. **Trends x-axis labels overlap** — 46 overlapping pairs at 390px, 12 at 1280px, fully
   overprinted in places (dashboard preview *and* `?view=trends`). Thin the labels by available
   width, or rotate/stagger them, or label only the axis ends plus hovered points.
2. **The filter pill covers data** on Positions, Streaks and the matchup at 390px — reserve a
   gutter under the last row, or let the pill move out of the way on scroll.
3. **`?view=h2h&sub=duos` silently renders the Players view** in overall/1v1 mode
   (`H2HView.tsx:110`) with no control visible and the URL unchanged — a shared duos link lands
   somewhere else with no hint. Either switch the mode to 2v2 when the link demands duos, or say
   "Duos exist in 2v2" where the chips would be.
4. **215 of 265 comments read as authored by "General"** (`TournamentCommentsCard.tsx:458`), a word
   that also names the scope chip and the section header in the same feed. Pick a different label
   for an unattributed author, or omit the author line entirely for those.
5. **The comment composer uses the mobile sticky offset on desktop** — at 1280px it floats 16px
   above the viewport bottom and slices the card behind it.
6. **The profile header photo takes 62% of a 1280×900 viewport**, pushing the tab strip to y=756.
7. **Positions grid lines strike through the digits** and run across rows the player did not play.
8. **Player pickers show faces only** (new tournament, What-if, friendlies setup) — names are
   `sr-only`, so you pick teammates by photograph even at 1280px.
9. **"1 matches"** in friendlies group headers (no singular).
10. **W-D-L renders with detached hyphens** ("14- 5- 8") — T14's fixed columns glue the dash to the
    left number; give the separator its own track or right-align the whole token.
11. **The match page title shows the raw DB id** ("Match #105") while the panel below says
    "Match 1 · Leg 1".
12. **Match H2H "Recent matches" looks duplicated** — leg 1 and leg 2 of the same fixture render
    identically with nothing marking the leg.

**DoD:** each item fixed or explicitly declined with a reason; before/after screenshots for the
visual ones at the viewport/theme where the sweep caught them; `npm run check` + build.

**Deviations:** (implemented 2026-09-14 on `feature/2026-09-audit`)

All twelve fixed, nothing declined. Every item was reproduced in a real browser against an
isolated stack (backend :8003 on a **copy** of the DB, vite :8020) before it was written and
re-shot after, at 390px and 1280px in the `blue` and the `light` theme. A closing sweep of 23
routes × 2 widths × 2 themes kept Round 6's baseline: zero console errors, zero failed
requests, zero horizontal overflow, zero nested anchors/buttons.

**1 — thinned by width, and the picture is the argument.** Of the three approaches offered,
"label only the ends plus hovered points" is not available (a touch device has no hover, and
the chart has no tooltip — building one is a feature, not polish) and would drop 16 of 18
names; rotating/staggering is what the axis already does. So: the axis keeps the **newest**
label and walks left, dropping every tick that cannot clear the one already kept. Two labels
at the same angle are parallel strips whose distance apart is `dx · sin45°`, so the rule is one
number in px — `1.35 × line height ÷ sin45°` ≈ 15px — and it scales itself: 10 of 18 names at
390px, 15 of 18 at 1280px, on a 6-month dashboard window 7 of 11 and 8 of 11.

The plan's numbers come from a **bounding-box** metric, which for a -45° label measures a big
square that touches its neighbour's long before the glyphs do; measured both ways (blue theme,
before → after):

| surface | width | overlapping pairs, true strip geometry | the sweep's AABB metric |
|---|---|---|---|
| dashboard preview | 390 | 4 → **0** | 16 → 5 |
| dashboard preview | 1280 | 1 → **0** | 5 → 2 |
| `?view=trends` | 390 | 8 → **0** | 52 → 13 |
| `?view=trends` | 1280 | 1 → **0** | 12 → 10 |

Zero real overlaps everywhere, light theme included (the AABB residue is entirely the rotated
-box artefact — at 1280px the labels already had air between them and the metric still counted
12). **Fixed in the same breath:** a label runs down-**left** from its tick, so the oldest one
in view ran out of the SVG and printed as a fragment ("…zturnier") — it is now dropped rather
than half-printed.

**2 — the pill rides the scroll; the bottom gutter was already right.** Measured first: at the
end of Positions, Streaks and the matchup the last row clears the capsule by exactly the 20px
DESIGN.md §9 promises, so "reserve a gutter under the last row" was already done. What the
sweep photographed is mid-scroll, and it is not a coincidence: the capsule is bottom-**right**,
which is exactly the column those three sub-views right-align their values in. So the pill
hides the way a hiding app bar does — gone while you scroll *down* into content, back on any
upward scroll, at the top, at the very bottom (its own gutter), and whenever it is focused or
open. `data-tucked` is exposed for tests. S9's job is untouched: the pill is there on arrival,
still pulses once per session, and any flick up brings it back.

**3 — say it, and offer the switch; do not overrule the reader's Mode.** Both answers the item
offers are right for *half* the cases. A shared `?sub=duos` link means "show me duos", but the
same silent fallback happens when the reader switches Mode away from 2v2 while on Duos, and
there an automatic switch back would fight them. So the place the chips would be now says
*"Duos only exist in 2v2 — showing Players"* next to one **Switch to 2v2** button: the
explanation for the second case, the sender's intent one tap away in the first.

**4 — "Anonymous", and quietly.** "General" names the scope in the same feed three times over
(the filter chip, the group header, the composer's "General (tournament)" target), so it cannot
also be an author. The author is now **Anonymous** — including on the two controls that *write*
it (the composer's author chip, the "Posted as" select), so the reader can connect what they
posted with what they see; the scope keeps the word everywhere it means the scope. The byline
is muted instead of `font-semibold text-text-normal`: an unattributed author is a category, not
a name, and it should not compete with the bylines that are names.

**5 — flush, not floating.** `lg:bottom-4` left a 16px strip of the feed's own card under the
composer. At 1280×900: 16px → 0 while scrolling, 1px (the card's border) once the feed ends —
DESIGN.md §9b's "settles flush on the card's bottom edge". **Left deliberately:** the guestbook
composer (`profile/GuestbookSection.tsx:107`) carries the identical `lg:bottom-4`, but it is
still a second floating *card* over a feed of cards, which is A8's breach 7; flush against the
viewport with that shape would look worse, and A8 is about to fold it into the feed.

**6 — capped, not narrowed.** 557px → **256px** on a 1280×900 viewport (62% → 28% of it), tab
strip y=765 → **455**. `max-h-64` with `object-center` rather than a narrower column, because a
phone must not change and does not (16:9 of 390px is 200px, under the cap) and because a
full-bleed banner is the shape this header has; the uncropped image is one tap away in the
lightbox.

**7 — the lineage moved into the gutters.** It joined cell *centres*, which is why it struck
the digits and why it painted across cells of tournaments the holder never played. It is now a
2px rail in the 4px gutter left of the holder's column, stepping sideways in the gutter above
the row where the cup changed hands: same information, over no data at all. Each cup takes its
own lane inside that gutter, because one player can hold both at once and the two rails used to
paint over each other.

**8 — the name goes under the face, everywhere a player is assigned.** `AvatarButton` takes
`showName`; the label is one truncating `text-xs` line (`max-w-16`) and the `sr-only` span goes
away with it, so nothing is announced twice. **Turned on past the three the item names:** the
What-if picker *is* `stats/PlayerPicker`, so the stats Player and H2H pickers come with it, and
`h2h/DuoPicker` is the same defect one file over — a picker whose names are invisible is not
better for being in Stats. The layout cost is one line of text and it fits: at 390px the
friendly setup's row is seven slots (None + six players) **with** names in 314px of the 358px
available — one row, no scroll, no overflow.

**9 — and two more of the same.** `{n} matches` is `stats/MatchHistoryList`, which is also what
the H2H matchup renders, so the friendlies group headers and the matchup blocks are fixed
together. The identical string in `live/MatchList` and `live/OverviewSection` went with them,
through one new `fmtCount(n, singular, plural)` in `utils/format.ts`. **Left, with a reason:**
`HeadToHeadRows`'s duo rivalries say "1 games" through `RecordLine`'s `playedLabel="games"` —
that unit sits *outside* the fixed track, so shortening it for n=1 would move every segment
after it and undo exactly the alignment item 10 is told not to break. `stats/h2h/DuoDetail:47`
("1 games together") is A8's breach 6, which replaces that hand-rolled line with `RecordLine`.

**10 — one track for the whole word, and T14 still holds.** The hyphens were detached because
each of W, D and L held its *own* padded column, so every number sat at the right edge of its
track and the slack landed between a hyphen and the number after it. `W-D-L` is one word: it
now gets one track, sized to the widest whole token in the list (`recordWidths().wdl` changed
meaning from "digits in the widest of the three numbers" to "digits in the widest token", the
two hyphens added by the pad). The slack moves out of the middle of the word into the `gap-2`
that already separates the segments, so **every segment still starts at the same x in every row
of a list** — measured on the profile's rivals (two lines, both 42px wide) and teammates (three
lines, all 34px) — and no list is padded wider than its own data. `recordLine.test.tsx` updated
to the new pads; the `textContent` contract ("3P · 3-0-0 · 14:6 · GD +8") is unchanged.

**11 — "Match 4", the number the app uses.** `order_index + 1`, the same number the panel below
says, and the title was moved after the match loads so it is "Match" and never a stale id.
`usePageTitle` feeds the phone's top bar as well as the document title, so this was wrong at
both widths, not only on desktop. `order_index` runs across both legs of a tournament, so the
number is still unique on a two-leg tournament.

**12 — `Match 4 · Leg 2`, the app's own words.** Added to each row's meta line in Match H2H's
"Recent matches", the same phrasing `MatchOverviewPanel` uses. Shown on every row rather than
only on the ambiguous ones: a marker that appears and disappears with the data is harder to
read than one that is always there, and the panel above it prints the leg unconditionally too.
Verified on `/live/18/match/100`, where leg 1 and leg 2 of Flo vs Rumpi used to be two rows a
reader could only tell apart by the scoreline.

**Verification:** `cd frontend && npm run check` → typecheck + eslint clean, **52 files / 503
tests passed**; `npm run build` green. No backend change, so no `make test` / `make lint` /
`make gen-types`. Before/after screenshots for every visual item live in the session scratchpad.

---

## A8 — Design-canon breaches, and the canon's own rot  ☑

**Breaches** (each is `DESIGN.md` law, and each is one file):
1. **The H2H matrix paints itself with hard-coded HSL ramps** (`pages/stats/H2HView.tsx:33-47`,
   `text-white` at `:395`) with no light-theme override — while the positions grid does the same
   job through `--pos-p` with a `[data-theme="light"]` rule (`styles.css:301-325`). Move the matrix
   onto that mechanism; it also fixes A6.3.
2. **The stats Player sub-view ignores the §6 skeleton** (`stats/PlayerProfile.tsx:90,114,126,156,
   161,166`) while `profile/ProfileStatsSection.tsx:73,107,116` renders *the same three blocks* in
   the other header language.
3. **Hand-rolled box surfaces**: `dashboard/TrendsPreviewCard.tsx:340`,
   `stats/trends/TrendsExplorer.tsx:147`, `ui/shell/NotificationBell.tsx:110`.
4. **Uppercase group labels inside a card**: `ui/ClubPicker.tsx:107,384`;
   **uppercase pseudo-thead inside an inset**: `live/OverviewSection.tsx:229`.
5. **Five hand-rolled loading states** (`ClubsPage.tsx:428`, `live/MatchDetailPage.tsx:296`,
   `tools/FriendlyMatchCard.tsx:422,497`, `tournaments/NewTournamentForm.tsx:90`) and **four empty
   states** (`ui/ClubPicker.tsx:380`, `live/OverviewSection.tsx:173,197`,
   `ui/shell/NotificationBell.tsx:123`) bypass `InlineLoading` / `EmptyState`.
6. **A `·`-separated record line** in `stats/h2h/DuoDetail.tsx:46-48,58-62` where its sibling
   `DuoLeaderboard.tsx:34` uses `RecordLine` — the two duo views do not align.
7. **The guestbook composer is a second floating card** over a feed of cards
   (`profile/GuestbookSection.tsx:107,121`), which §9b forbids and which
   `TournamentCommentsCard.tsx:862` already does correctly.
8. **Result tokens used for non-results**: `text-loss` for errors
   (`live/MatchH2HPanel.tsx:189`, `ui/layout/PushNotificationsSettings.tsx:45,140`),
   `text-draw`/`bg-draw` for the connection state (`ui/shell/ConnectionIndicator.tsx:43,48`), and
   `ErrorToast.tsx:95` inventing a third answer (`--delta-down`). The canon has **no error token** —
   add one (§2) and use it, rather than bending win/draw/loss.
9. **Off-scale radius**: `ui/NationFlag.tsx:38` `rounded-[2px]`.

**Canon rot** — fix `DESIGN.md`, not the code:
- §2's `live` token has **zero** callers; every live marker uses `.live-dot`/`.live-ping` driven by
  `--live-indicator`, which `light.css` never overrides. Either point `.live-dot` at the token or
  delete the token (and then light-theme live dots are still red-500 — decide).
- §4's "`space-y-5` between page sections" is false: `.page` is `space-y-3`, the dashboard uses
  `space-y-4`, and only 5 sites use `space-y-5`.
- §7's "Lists → `List`/`ListRow`" is ignored by 13 files that use `list-divided` with their own
  rows; the primitive is too opinionated for rows carrying `ScoreLine`/`RecordLine`. Bless the
  pattern that won.
- §5's `font-mono` rule is far narrower than practice (ppm, ranks, positions legend, streak
  patches, explainer constants). The working rule is "fixed-width numeric tokens".
- Smaller: `CardSection` takes more than `padded`; the scale omits `text-xl` (the page `h1`) and
  documents `text-3xl` for hero scores that are always `text-4xl`; the header's "no `text-[Npx]`"
  claim is untrue (`NationFlag.tsx:17-18`); §7's avatar-ring list names H2H, which renders no
  avatars; `.pos-good` (`styles.css:329`) has no users.

**DoD:** every breach fixed or explicitly declined with a reason; `DESIGN.md` true again, with its
"last checked" line updated; `npm run check` + build; screenshots for the matrix ramp in both
themes.

**Deviations:** (implemented 2026-09-14 on `feature/2026-09-audit`)

Every breach was reproduced in a real browser before it was touched and re-shot after, against
an isolated stack (backend :8003 on a **copy** of the dev DB, vite :8020, scratch secrets), at
390px and 1280px in `blue` and `light`; the two token items were measured in **all five** themes.
One item changed sides — half of breach 4 is rot, not a breach — and it is argued below rather than
quietly converted; nothing else moved between the two halves in either direction.

**Breach 1 — verified, ticked, not touched.** A6 moved the matrix onto `.h2h-cell` exactly as the
item asks: the component passes a hue (`--h2h-h`) and a 0..1 strength (`--h2h-t`), the tint and the
ink that reads on it live in `styles.css` with one `[data-theme="light"]` override, and `text-white`
is gone. Re-shot at 390px in both themes (`h2h-blue-390.png`, `h2h-light-390.png`): light tiles take
dark ink, dark tiles light ink, and the ramp still reads red→green across the grid.

**Breach 2 — the Player view joins the page it lives on.** Five `card`s with their own `<h2>`
became five `StatsSection`s (Key numbers · Profile net · Club stars · Streaks · Match history), the
density switch became the section's `action`, and the identity block stays a `card` — the one card
§6 allows a sub-view, the same one the matchup header is. The profile's Stats tab was the *other*
half of the finding: its "Strengths relative to the field." moved from under the radar into the
explainer slot, so the two renderings of those three blocks are now identical rather than merely
similar, which is what the item was really complaining about.

**Breach 3 — three hand-rolled boxes.** The two trend plots are `inset p-2`; the notification
popover is `card p-0 shadow-pop backdrop-blur-md`, which is what §3/§4 already say a floating panel
is and what the stats filter popover already did.

**Breach 4 — one half fixed, one half reclassified as rot (argued).** `ClubPicker`'s two group
labels really were uppercase headings inside a card competing with nothing; they are sentence-case
`text-sm font-semibold text-text-normal` now, and the sheet gained the hierarchy it was missing.
`live/OverviewSection`'s `# PLAYER P GD PTS` line is **not** a breach: it is a row of *column
headers*, the same job the app's two real `<thead>`s (stats Table, a cup's per-player table) do in
exactly this style, and the only thing separating it from them is that its rows are `<div>`s rather
than `<td>`s. Lower-casing it would have made one job look two ways in two places — the defect
breach 2 exists to remove — so the code stands and §6's wording is what changed: uppercase is for
`section-label` and for a row of column headers, real `<thead>` or pseudo-`<thead>`, while a
*group* heading inside a card (a league, "Recent") is sentence case. Verified on the screen: the
`STANDINGS` label and the column line read as label + legend, not as two headings.

**Breach 5 — ten states, not nine.** The five loading states and four empty states the item lists
now go through `InlineLoading` / `EmptyState`, plus one the audit missed in a file already being
touched (`ClubsPage`'s "No clubs match the current filters."). The bell's single string switching
on `isLoading` became the two different components it always was.

**Breach 6 — one `RecordLine`, and "1 games together" with it.** `DuoDetail`'s two hand-rolled `·`
lines are one `RecordLine` (played · W-D-L · goals · GD · ppm) sized by `recordWidths([duo])` — the
primitive its sibling `DuoLeaderboard` uses six pixels above it. The wrong singular goes away
because a record line's unit is `P`, which has no plural to get wrong; A7 left the string here for
exactly this reason. Measured at 390px: 80px wide in a 334px column, no wrap, no overflow.

**Breach 7 — the guestbook became a feed.** One `card p-0`: header row (name + count + the unread
pill and "Read all", which used to float above the feed in a row of their own), messages as level-2
`inset` rows, `CommentSendRow` on the card's bottom edge behind a hairline, sticky. Measured at the
end of the feed: composer bottom to card bottom = **1px** (the border) at 390px *and* at 1280px —
A7's "settles flush" for the comments composer, now true here too. With the root message an `inset`,
a reply inside it would have been inset → inset, so a reply is flat and tighter on the card's own
surface behind a `border-l-2 border-accent/25` rule, the depth cue S10 gave comments; the inline
reply editor lost its own `inset` for the same reason. `guestbook-entry-<id>` anchors and their
`scroll-mt` are untouched, so U3's deep link and "jump to unread" still land.

**Breach 8 — the canon gets *two* state tokens, not one (judgement call).** `--color-error` and
`--color-warn`, in `defaults.css` + `light.css`, mapped in `tailwind.config.cjs`. One token could
not carry the item's own list honestly: painting "Reconnecting" red makes a transient state louder
than "Offline" (which is deliberately muted, T10) and puts a second red dot in the chrome that
already carries the live one. A reconnecting socket is not an error, it is a warning — and the
audit's own sibling task added a second caller for that meaning while A8 was unstarted: A2's
"someone else changed this match" banner, `border-draw/40 bg-draw/10 text-draw`, the identical bend
one file over. So: error = something failed or is about to be destroyed (the H2H panel's load
failure, the denied push permission, the push error box, the toast icon — which had invented a
third answer out of `--delta-down` — and `ConfirmDialog`'s danger block); warn = attention, nothing
failed (the connection indicator, the conflict banner).

`ConfirmDialog` was not on the item's list and is moved anyway: its own comment already called that
box "the app's danger idiom", it is pixel-identical to the push error box beside it, and leaving the
same red box written two ways is the drift this task exists to end. A deleted tournament is not a
defeat. Said plainly here because it is scope the plan did not name.

Contrast, measured in the browser per theme (text on the surface it actually sits on):

| theme | `--color-error` | on `card` | on `inset` | on `bg-error/10` | `--color-warn` | on `card` | on `inset` | on `bg-warn/10` |
|---|---|---|---|---|---|---|---|---|
| blue | `248 113 113` | 6.02:1 | 4.85:1 | 5.27:1 | `251 191 36` | 9.98:1 | 8.04:1 | 8.17:1 |
| dark | `248 113 113` | 6.70:1 | 5.86:1 | 5.91:1 | `251 191 36` | 11.10:1 | 9.71:1 | 9.22:1 |
| red | `248 113 113` | 6.74:1 | 6.10:1 | 5.90:1 | `251 191 36` | 11.18:1 | 10.11:1 | 9.21:1 |
| green | `248 113 113` | 6.06:1 | 4.89:1 | 5.30:1 | `251 191 36` | 10.04:1 | 8.10:1 | 8.14:1 |
| light | `185 28 28` | 6.47:1 | 5.99:1 | 5.45:1 | `146 64 14` | 7.09:1 | 6.57:1 | 6.08:1 |

(light also on the page ground: error 5.43:1, warn 5.95:1.) Light's warn is amber-**800**, one step
past `--color-draw`: draw's amber-700 is 4.21:1 on the ground and 4.39:1 on its own tint — enough
under a single numeral in a W-D-L run, not enough under the two-line paragraph a warning is. The
dark themes resolve error/warn to the same red and amber as loss/draw today, so **nothing moved
visually in four themes**; that is the point — the code now says what it means, and a theme can move
one family without the other. Shot in all five themes with the toast open and the socket stubbed
dead: the indicator reads `rgb(251,191,36)` in blue/dark/red/green and `rgb(146,64,14)` in light.

**Breach 9 — a flag is a rectangle.** `rounded-[2px]` is gone; the scale's smallest step (6px)
would round a 14×10.5px flag into a lozenge, so it takes no radius rather than a wrong one. It was
the last arbitrary radius in `src/` (`grep -r "rounded-\["` → 0).

**Canon rot — the `live` token: pointed, not deleted.** `.live-dot` / `.live-ping` read
`--color-live`, and `--live-indicator` is deleted. Deleting the token instead would have kept a
private variable that `light.css` was never going to learn about; pointing the class at the token
answers the light-theme question in the same move — **a light-theme live dot is now red-600
(`220 38 38`), not red-500** — because light already overrides `--color-live` for exactly this
reason (A6 set it to clear 4.5:1 as text on white). Verified per theme: `rgb(239,68,68)` in
blue/dark/red/green, `rgb(220,38,38)` in light.

**Canon rot — §7's `List`/`ListRow` rule: the pattern that won is blessed, with a line between
them.** The primitive is not wrong, its scope was: `ListRow` is leading · title · subtitle ·
trailing, and 13 files whose rows carry a `ScoreLine`, a `MatchSides` block or a `RecordLine` under
a name are right to build their own. §7 now has two rows instead of one, and the second one is
explicit that only the *shape* is free — the mechanic is not: `list-divided` container, `relative`
row, one stretched `<button>`/`<Link>` (`absolute inset-0 z-0 rounded-xl focus-ring`) with an
`aria-label` naming what it opens, content `pointer-events-none relative z-10`, real controls
`pointer-events-auto` above it; never `role="button"` on a `<div>`, never a button inside the row's
own hit area. That is A6's restructured match row described as it now stands, and `MatchList.tsx`
is named as the worked example. §10's "Do prefer `ListRow`" line was rewritten to match.

**The rest of the canon rot** — `DESIGN.md` changed, the code did not:
- §4 spacing: the "`space-y-5` between page sections" claim is replaced by what is actually there
  (`space-y-3` inside cards *and* between a page column's blocks — that is what `.page` is;
  `space-y-4` between the sections of a view that stacks several; `space-y-5` only in the five
  places whose sections are themselves long lists).
- §5 `font-mono`: "date pills, odds and compact W-D-L" → **fixed-width numeric tokens**, with the
  practice enumerated (ppm, ranks, the positions grid and its legend, streak patches, the constants
  inside an explainer) and the limit named (never a sentence, a name, or a value alone in prose).
- §5 scale: `text-xl` added as the page `h1` and only there; `text-3xl` removed — it has no callers
  and a hero score is `text-4xl` at every width.
- §3 `CardSection`: it takes `title`, `actions`, `padded` and `className`, not only `padded`.
- The header's "no `text-[Npx]`" line: corrected to name §5's own geometry exception
  (`NationFlag`'s two flag-glyph sizes), which is the only one left.
- §7's avatar-ring list: H2H dropped (its Players/Duos views render no avatars at all); the matchup
  header, which does, is named instead.
- §2: `--live-indicator` removed from the "existing families" line, with the reason; `--color-live`'s
  row now names `.live-dot` / `.live-ping` as its callers.
- §6: the uppercase rule (above), plus a line saying the identity `card` at the top of a sub-view is
  the one card allowed, so nobody "fixes" it away.
- §9b: the guestbook feed named alongside the comments feed, with the reply surface spelled out.
- §1.4 and `AGENTS.md`'s DESIGN.md line now say result-vs-state in one breath.
- `.pos-good`: **no change to either**, and nothing in `DESIGN.md` ever claimed otherwise. It is one
  of five discrete stops on a ramp whose legend happens to show four; a vocabulary that skips "good"
  between "best" and "mid" is worse than an unused class. `styles.css` now says so in a comment.

**Found while working, reported, not fixed** (none of them A8's list):
- **`window.confirm` for three destructive actions** — `ClubsPage:512` (delete club),
  `GuestbookEntryCard:201` (delete message and its replies), `TournamentCommentsCard:308` (delete
  comment) — plus six non-destructive ones. §7 says "**Never** `window.confirm` for a destructive
  action", so this is a real breach the audit missed, not rot: the rule is right and A10 reaffirmed
  it. It needs `ConfirmDialog` plumbing in three files (which row is pending) and is bigger than
  anything in A8; it wants its own task.
- `VoteVotersModal:68` paints a thumbs-**down** icon `text-loss`. Same family as breach 8, but a
  vote's up/down really is a two-sided verdict, so it is the least wrong of the borrowings; left.
- `MatchupView.tsx:51-52` keeps `bg-draw/15 … ring-draw/30` — those *are* results (W/D/L badges).

**Verification.** `cd frontend && npm run check` → typecheck + eslint clean, **52 files / 503 tests
passed**; `npm run build` green (the pre-existing >500 kB chunk hint unchanged). No backend change,
so no `make test` / `make lint` / `make gen-types`. Closing sweep of 21 routes × 2 widths × 2 themes
plus the five-theme token runs: zero console errors, zero page errors, zero failed requests, zero
horizontal overflow, zero nested anchors/buttons. Screenshots (matrix ramp in both themes, and
before/after for every visual item) live in the session scratchpad.

---

## A9 — Fragility worth hardening (lower priority)  ☑

1. **Unguarded `localStorage` on the boot path**: `main.tsx:13,19` at module scope and seven bare
   `getItem` calls in `auth/AuthContext.tsx:39-60`. Where storage access *throws* (Safari "block
   all cookies", blocked site data, some webviews) this is a white screen, not a degraded feature —
   everything in the nav/scroll layer is already wrapped, this is the one uncovered path.
2. **`seq` gap detection is documented but not implemented** (`backend/app/ws.py:8-11`, `AGENTS.md`
   §6): `connection.ts:52,205` parses `seq` and nothing reads it. And `ws.py:44-47` drops a failed
   socket from `_conns` **without closing it**, while `main.py:106-109` keeps answering its pings —
   so a half-dead client shows "live" forever and never resyncs. Note `_seq_counter` is one
   process-wide counter across all three managers and resets on restart, so it needs per-channel
   numbering before any gap check can use it.
3. **Realtime writes race in-flight refetches** (`applyEvent.ts:36`, `:88`): a bare `setQueryData`
   with no `cancelQueries` and no ordering guard, against ~12 mutation handlers that invalidate the
   same key — an older GET can overwrite a newer push, or resurrect a deleted comment.
4. **Form is divided by a fixed N** even when fewer matches exist (`services/stats/core.py`), and
   the two surfaces showing it disagree: `stats/PlayerProfile.tsx:44` uses `lastN: 12`,
   `profile/ProfileStatsSection.tsx:59` uses `lastN: 3`, while a comment at `:71` claims they
   match. Decide one definition of "Form" and use it in both places.
5. **Deleting a club ignores friendlies and orphans its crest**: `routers/clubs.py:293-297` checks
   only `MatchSide`, not `FriendlyMatchSide` (12 clubs in the real DB are referenced *only* by
   friendlies), there is no `PRAGMA foreign_keys=ON`, and the `ClubCrestFile` row and file survive
   — and `Club.id` has no AUTOINCREMENT, so a later club can inherit the crest.
6. **Three nav-stack seams**: the matchup's pop-vs-clear decision never checks the previous entry
   is the H2H body (`ui/shell/backNavigation.ts:116-123`); `navStack.ts:64-72,82-97` treats an
   initial load as POP so a cloned sessionStorage burns a swipe; `useTabParam.ts:31-33` never
   rewrites an unknown or role-forbidden `?tab=` out of the URL, so `lastLocation` replays it.
7. **`MatchDetailPage` "save and return" scrolls to the top** — its smooth `scrollIntoView`
   (`LiveTournamentPage.tsx:214-222`) is aborted by `useScrollRestoration`'s instant
   `restoreWindowScroll(0)` on the PUSH, so the `comment-attn` flash plays off-screen.

**Deviations:** (implemented 2026-09-14 on `feature/2026-09-audit`)

All seven items done. Every fix was reproduced before it was written, and the two that can only be
judged by watching the app (1 and 7) were A/B'd in a real browser against an isolated stack
(backend :8004 on a copy of the DB, vite :8021).

**1 — blocked storage, and a session that ended over nothing.** `utils/safeStorage.ts`
(read/write/remove that cannot throw) now covers `main.tsx`'s module-scope theme read and all seven
`AuthContext` keys. **Extended past the two files named:** `AppShell.tsx:44,49` (the sidebar-collapse
flag, in a `useState` initialiser) and `useThemeManager.ts:12,22` sit on the same boot path and
white-screen the same way — the item's "this is the one uncovered path" was not quite true.
**Plus the bug the previous worker left.** `AuthContext` called `clearAuth()` on *any* rejection of
`GET /me`. Reproduced on HEAD in Chromium with a **valid** admin token and a single aborted `/me`
(`route.abort('failed')`): the page finished loading with `ea_fc_token` and `ea_fc_role` gone — an
admin silently demoted to reader. (A first attempt with a *fake* token was a false positive: with a
bad token every other authenticated request legitimately 401s, so the isolated backend was restarted
with `--jwt-secret` and a real token minted.) After the fix the same run keeps `token: present,
role: admin`. Only an `ApiError` of 401/403 clears now — the server saying no, as opposed to us not
being able to ask. Five tests in `src/test/authSession.test.tsx` pin network failure, abort, 5xx,
401 and 403, plus a boot with `Storage.prototype.getItem` throwing.

**2 — all three parts, none left.**
- *Per-channel `seq`*, the prerequisite: `_seq_counter` is gone; `_Channels` holds the sockets **and**
  a counter per channel key, so `/ws/tournaments/17`, `/ws/tournaments/21`, `/ws/players/4` and the
  global channel each count 1, 2, 3… on their own. Verified live: two comments on tournament 21 and
  one on 20 gave `21 → [1, 2]`, `20 → [1]`, global `→ [1, 2, 3]`. Under the old shared counter those
  same five broadcasts would have handed tournament 21 the numbers 1 and 3.
- *The half-dead socket*: one that raises on `send_json` is now **closed** (1011) as well as dropped,
  so the endpoint's `receive_text` loop ends and the client reconnects — instead of being answered
  "pong" forever by a channel that no longer holds it.
- *The gap check*: `connection.ts` keeps `lastSeq` per pooled socket (re-baselined on every `onopen`,
  so a restarted server counting from 1 again is not a gap) and fires a new `onGap` handler when a
  number is skipped; `useRealtime.ts` wires it to the same resync the reconnect path uses. The
  per-player channel needs nothing — every message on it already resyncs.

**3 — the realtime/refetch race.** Not `cancelQueries`: its default `revert: true` restores the
pre-fetch data in a microtask *after* a synchronous `setQueryData`, so the reducers would have had to
become async for no gain. `overtakeInFlight()` invalidates immediately after the write with
`refetchType: "all"` and `predicate: q => q.state.fetchStatus === "fetching"`. That cancels the older
request (its answer is discarded, never applied) and puts a fresh one behind the push — and matches
nothing at all when no request is on the wire, so the zero-refetch path this layer exists for is
intact. `refetchType: "all"` because the default, `"active"`, leaves an unobserved query's stale
answer to land. Two new tests fail without it: a stale tournament answer overwriting a push, and a
deleted comment coming back.

**4 — one definition of Form.** Decided: **Form = points per match over the last 12 finished
matches, of the matches that surface is describing.** 12 because it is the sparkline Roli actually
reads on a player, and in this group's round-robins it is roughly the dashboard's "last 3
tournaments" counted in matches instead of nights. `FORM_LAST_N` in `pages/stats/standings.ts` is the
one definition; `ProfilePage` asks for it instead of 3. The divisor is fixed in
`compute_overall_and_lastN` (`sum / len(window)`), so two wins reads 3.00 rather than 6/12 = 0.50.
The odds model *wants* that shrinkage ("one played match is not a favourite"), so it now applies it
itself in `_player_aggs_from_overall(per, lastN)` — the numbers fed to the model are unchanged, and a
test pins both halves against each other. The comment that claimed the two surfaces matched is gone;
the profile's label is `Form (last N)` with N the matches that exist, the same idiom the stats page
already used. Verified in the browser: both surfaces now fetch `/stats/players?lastN=12` and both read
`Form (last 12)`.

**5 — club delete.** As specified, plus one decline: **`PRAGMA foreign_keys=ON` was not added.** It
is the right long-term answer to this whole class, but switching it on changes every delete in the
app at once (tournaments, players, comments and their link rows), which is not a change to make
inside this item without its own permission matrix and tests.

**6 — three nav seams.**
- The drill-in back decision takes `sameParams` now, and `StatsInsights` passes `["view"]`, so a
  matchup pushed from a *different* `/stats` body clears in place instead of popping onto a page the
  "Head-to-head" button never named. **Honest caveat:** every in-app way into the matchup today is
  the H2H matrix itself (same body) or a deep link from another path, so I could not trigger this
  live — a latent seam, closed, with a unit test.
- `navStack` truncates on the **first record of a page load** as well as on a push. A duplicated tab
  copies sessionStorage without the forward history it describes; believing it made `canGoForward()`
  promise a step the browser cannot take, and the swipe that asked for it did nothing at all. The
  cost is that swipe-forward is not offered after a reload — the browser's own forward button still
  works.
- `useTabParam` rewrites any value it did not honour out of the URL, and takes an `allowed` list so
  the same rewrite covers a role-forbidden tab. Wired on the three pages whose gate is a synchronous
  `role` (Tournaments, Clubs, Players Admin); their local narrowing was then provably dead and is
  gone. **Not wired on `MatchDetailPage`**: its `edit` tab depends on `tQ.data?.can_edit`, which is
  false while the tournament is still loading, so rewriting there would throw away a legitimate
  `?tab=edit` deep link a moment before it becomes valid. Verified in the browser: a reader's
  `/tournaments?tab=new` and any `?tab=nonsense` become the clean URL, while an admin keeps
  `?tab=new` and `?tab=add`.

**7 — save and return.** Real, but **only when the match page was scrolled**, which took finding: the
Edit tab does not scroll on its own (measured 0 at both 390px and 1280px), so `restoreWindowScroll(0)`
from `scrollY === 0` issues no `scrollTo` at all and the smooth scroll wins — the first traces showed
the flash playing perfectly in view on unfixed code. Open the Clubs disclosure, which is the normal
editing flow, and the page scrolls 282px; then it is exactly as the finding says. Without the fix the
return snaps to 0 and **stays** there, the row at `top: 1463` in an 844px viewport, flashing
off-screen for the full 1.6s; with it the page runs 282 → 865 and the row settles at `top: 598`,
flashing in view. The mechanism is a `state.ownsScroll` opt-out honoured only on a PUSH — the same
contract `location.hash` already had in this hook. `MatchDetailPage` claims it **only when it returns
to the Matches tab**: returning to any other tab nothing scrolls to anything, and a push belongs at
the top.

**Docs.** `AGENTS.md` §6 described the `seq` gap check as if it already existed. It now describes
what item 2 actually built: per-channel numbering, the client's per-connect baseline, and the
close-on-failure rule.

---

## A10 — Editors can finish what they started: a one-hour grace window  ☑

Roli, after A1 made the decider admin-only in practice: "make sure an editor can also set a decider
-> admin does not always participate in tournament. editors should be able to edit/set live
tournaments and delete accidentally created ones for a limited time (eg 1h). also friendlies!"

**Decisions (settled with Roli — do not relitigate):** window **1 hour**, the same constant comments
already use. **Only the creator** (and any admin) may delete. Deleting is allowed **even when
results exist**, and therefore **every delete asks for confirmation — for admins too**.

**Why the decider needed this.** A decider only resolves a tie at the *top*, which is only known
once every match is finished, and `LiveTournamentPage.tsx:258` only renders the editor on a done
tournament. So "editors may set it while not done" (the old docstring, and A1a's fix) was nearly
meaningless in practice. The window has to start **when the tournament finishes**, not when it is
created.

### What has to change

1. **Record who created a tournament and a friendly.** Neither row has a creator today. Add two
   link tables — `TournamentCreatorLink(tournament_id PK, creator_player_id)` and
   `FriendlyCreatorLink(friendly_match_id PK, creator_player_id)` — written in the create handlers.
   New tables, no `ALTER`, matching this project's schema rule and the `CommentAuthorLink`
   precedent (`models.py`). **Rows created before this ship have no creator and stay admin-only**;
   say so in the UI wording rather than showing a button that 403s.
2. **One policy module, one window.** Put the rules in `backend/app/services/authorization.py`
   next to `ensure_not_done_or_admin`, sharing the comments' 1h constant (find it, do not redefine
   it):
   - *edit / set decider*: admin always; editor while the tournament is **not done**, or within 1h
     of it finishing (finish time = the latest `Match.finished_at` of its matches; fall back to
     `updated_at` when a tournament is marked done with no finished match).
   - *delete*: admin always; editor only if they are the recorded creator **and** within 1h of
     `created_at`.
   - friendlies: admin always; editor only if recorded creator and within 1h of `created_at` — for
     **both** `PATCH /friendlies/{id}` and `DELETE /friendlies/{id}` (both are admin-only today,
     `routers/friendlies.py:182,200`).
3. **Return what the caller may do; stop re-deriving it in the client.** The frontend currently
   spells out its own copy of the rule (`AdminPanel.tsx` `canEditDecider`/`canReorder`,
   `LiveTournamentPage` `canEditMatch`, `FriendlyMatchesListCard` `canEdit`/`canDelete`) — that is
   exactly how the docstring, the server and the UI drifted apart before A1. Add per-caller
   capability flags to the payloads (`TournamentDetailOut`, `TournamentListItemOut`, `FriendlyOut`):
   `can_edit`, `can_delete`, `can_set_decider`. Computed server-side, so the window is measured
   against server time and no client clock can disagree. `make gen-types` and commit `schema.d.ts`.
   Render every one of those controls from the flags.
4. **Confirmation on every delete, including admin's** (Roli's explicit ask, because a delete may
   now take real results with it). Use the app's `Modal`, not `window.confirm` — the tournament
   delete at `AdminPanel.tsx:255-259` and the friendly delete both use the native dialog today,
   which §7 does not bless. The dialog must name what is lost: the tournament's name, its match
   count, and the cups it would move. For a friendly, its two sides and date.
5. **Wording.** Where a control is hidden because the window closed, say why in the same muted
   idiom the app already uses ("Tournament is done — only an admin can set the decider." exists
   from A1). An editor past the hour should read something true, e.g. "Only an admin can delete a
   tournament after the first hour."

### Care

- **Deleting a tournament moves cups** (ownership is a fold over finished tournaments). The
  confirmation must say so when the tournament is a cup stake, and the cup queries must be
  invalidated after the delete (`qk.cup*`, `qk.stats.all()`), the way the admin delete already does.
- A tournament with **no matches at all** has no finish time — the delete window uses `created_at`,
  which is the accidental-creation case this is for.
- Push notifications already fire on delete; nothing to change, but check an editor-triggered
  delete produces the same notification an admin's does.
- The **second-leg** endpoint (`routers/tournaments.py:602`) can still revive a done tournament to
  "live", which is a documented back door around the done rule. Out of scope here — but once the
  grace window exists, that endpoint should use it too. Note it in Deviations rather than fixing it.

**DoD:** a matrix test per endpoint (reader / editor-not-creator / editor-creator-in-window /
editor-creator-past-window / admin) for tournament edit, decider, delete, friendly patch and
friendly delete; flags present and correct in the three payloads; every delete confirms through a
`Modal` naming what is lost; the decider editor renders for an editor within the hour on a done
tournament; `make test`, `make lint`, `make gen-types` (schema committed), `npm run check`, build;
screenshots of the confirmation dialog and of the decider editor as an editor, 390px + 1280px.

**Deviations:** (implemented 2026-09-14 on `feature/2026-09-audit`)

**Shape.** One module answers "may this caller change this row right now?", the payloads carry
the answer, the UI renders it. `services/authorization.py` holds `GRACE_WINDOW`
(`= COMMENT_EDIT_WINDOW`, imported — the comments' 1h constant, not a second one), the `can_*`
predicates and the `ensure_can_*` guards; `tournament_capabilities()` / `friendly_capabilities()`
call the *same* predicates the guards call, so a flag and a 403 can never disagree.
`ensure_not_done_or_admin` had no callers left afterwards and was deleted with them.

**Judgement 1 — when the hour starts on a done tournament.** `tournament_grace_anchor()` =
the latest `Match.finished_at` of its matches, because that is when the tournament actually
ended (not when the row was last touched, which a rename would move). A tournament can be
"done" with no timestamp at all — matches finished before `finished_at` was recorded, or
backfilled history — and then `Tournament.updated_at` is the only evidence of when it last
changed, so it is the fallback rather than "no window at all". The alternative, treating a
missing timestamp as "window closed", would lock an editor out of exactly the old rows an
admin is least likely to be sitting next to. Covered by
`test_a_done_tournament_without_finish_timestamps_falls_back_to_updated_at`.

**Judgement 2 — what each dialog says.** All three name what is lost, in the `text-loss`
idiom, and end on "This cannot be undone.":
- *tournament, cup at stake* — `Delete "A10 grace check"?` / "The tournament and everything
  recorded in it are removed for good." / "3 matches and every result in them are deleted." /
  "Bauernkranz was at stake here — deleting this recalculates who holds it."
- *tournament, no cup* — the same, without the cup line. A tournament with no matches reads
  "No matches were played yet." instead of the match count (the accidental-creation case).
- *friendly* — "Delete this friendly?" / "It disappears from the friendlies list and from every
  stat built on it." / "Flo 3–1 Rumpi" / "Played on 2026-09-14."

**Judgement 3 — wording where a control is withheld.** Muted, in the panel's own idiom, and
true for *both* reasons a control can be missing (hour passed, or no creator recorded):
- actions, edit closed: *"Tournament is done — the hour an editor has to fix it has passed."*
- delete withheld: *"Only an admin can delete this tournament — an editor can delete one they
  created, within its first hour."* (covers the pre-A10 rows, which have no creator — the plan's
  "say so rather than showing a button that 403s")
- decider withheld: *"The hour to set a decider has passed — only an admin can change it now."*

**Scope calls.**
- `can_edit` had to cover **every** tournament edit, not just `PATCH /tournaments/{id}`:
  `canEditMatch` and `canReorder` render from it, so `generate`, `reorder`, `PATCH /matches/{id}`
  and `/swap-sides` went through the same policy. Otherwise A10's own complaint — a flag that
  does not match the guard — would be back on day one. The 403 string changed accordingly, from
  `Tournament is done (admin required to …)` to
  `Tournament finished more than an hour ago (admin required to …)`.
- `matches.py`'s "editor may still patch the *last* match" escape hatch is preserved and is now
  strictly wider: inside the hour any match, past it the last one, as before.
- **`MatchDetailPage.tsx:127` was a fourth copy of the rule** (`role === "editor" && !isDone`),
  not listed in the task. It reads the same payload, so it now reads the flag too; leaving it
  would have been immediate drift.
- `FriendlyOut` carries two flags, not three — `can_set_decider` is meaningless for a friendly.
- **`/second-leg` still revives a done tournament** for any editor (`tournaments.py:635`), the
  documented back door A1 already reported. Left alone, as the task says; it is now the only
  tournament write that does not ask this module.

**Frontend mechanics.**
- The role check stays as a *coarse* gate (`isEditorOrAdmin && caps.can_x`), so the admin-only
  "view as a lower role" preview still shows a reader a reader's page. Consequence worth knowing:
  an admin previewing *as editor* still has admin capabilities, because the flags come from the
  token's real role. That override is a frontend convenience and was never a real demotion.
- `applyTournamentSync` keeps the viewer's three flags instead of taking the broadcast's
  all-False ones — the `applyCommentUpsert` precedent for viewer-specific fields (unit-tested
  both ways). Accepted consequence: a page left open past the hour still shows the control until
  something refetches, and the save then 403s into the existing error toast. Polling the window
  down to the second was not worth a timer.
- `qk.tournament(tid)` deliberately keeps **no** token in the key — the websocket reducer writes
  that key and has no token — so instead every fetcher of it now passes the token
  (`LiveTournamentPage`, `MatchDetailPage`, `CurrentMatchPreviewCard`), and they agree.
  `qk.friendliesList(mode, token)` *is* keyed by viewer (no WS writer); the bare `qk.friendlies()`
  prefix still reaches it, which a test pins.
- The delete dialog's cup stakes come from the tournaments **list** query, fetched only when the
  dialog opens. `cup_stakes` is a fold over every tournament × every cup; putting it in
  `TournamentDetailOut` would run that on every realtime `tournament.sync`.
- `qk.stats.all()` joined `qk.tournaments()` / `qk.cupAll()` in the delete invalidation (Care).
- New primitive `ui/primitives/ConfirmDialog.tsx` (Modal + a "what is lost" block + Cancel/verb),
  because the two delete sites needed the same thing and `DESIGN.md` §7 blesses `Modal`, not
  `window.confirm`. §7 gained a row for it; `AGENTS.md` §5 (the two new tables) and §6 (the
  window, the flags, the "render from the flags" rule) were updated in the same pass. The five
  *non-destructive* `window.confirm` calls elsewhere (mark-as-read, swap sides, …) were left
  alone — out of scope.

**Permission matrix** (from `tests/test_grace_window.py`; "creator" = the editor who created the
row, "in window" = within `GRACE_WINDOW` of the anchor):

| Endpoint | reader | editor, not creator | editor, creator, in window | editor, past window | admin |
|---|---|---|---|---|---|
| `PATCH /tournaments/{id}` | 401 | 200 live · 200 done <1h · 403 after | 200 | 403 `Tournament finished more than an hour ago (admin required to edit)` | 200 |
| `POST /tournaments/{id}/generate` | 401 | same as edit | 200 | 403 (`…to regenerate`) | 200 |
| `PATCH /tournaments/{id}/reorder` | 401 | same as edit | 200 | 403 (`…to reorder`) | 200 |
| `PATCH /tournaments/{id}/decider` | 401 | 200 while ≤1h after the last match | 200 | 403 (`…to set the decider`) | 200 |
| `PATCH /matches/{id}` | 401 | same as edit | 200 | 403 (`…to edit`), **except** the last match, still 200 | 200 |
| `PATCH /matches/{id}/swap-sides` | 401 | same as edit | 200 | 403 (`…to swap sides`) | 200 |
| `DELETE /tournaments/{id}` | 401 | 403 `Only an admin, or the editor who created it within the last hour, can delete a tournament` | 204 (even with results) | 403 (same string) | 204 |
| `PATCH /friendlies/{id}` | 401 | 403 `…can edit a friendly` | 200 | 403 (same string) | 200 |
| `DELETE /friendlies/{id}` | 401 | 403 `…can delete a friendly` | 200 | 403 (same string) | 200 |

Reader = no `Authorization` header → 401 `Missing token` from `require_auth_claims`; there is no
account below `editor`. A tournament with **no creator row** (everything created before A10)
behaves as the "editor, not creator" column for delete, and is unaffected for edit.
Payload flags match the table exactly, including `(False, False, False)` for a reader and for the
websocket payload.

**Verification.** `make test` → **144 passed** (132 before: +12 A10 cases, 5 pre-existing tests
rewritten onto the window), `make lint` → *All checks passed!*, `make gen-types` → `schema.d.ts`
regenerated and committed with the payload change, `cd frontend && npm run check` → typecheck +
eslint clean, **49 files / 475 tests passed** (+6), `npm run build` → clean.
**Rollback safety:** `main` @ `356ada6` (the previous build) was checked out into a worktree and
run on :8004 against a *copy of the migrated DB* — booted with zero errors, served `/tournaments`,
`/tournaments/{id}`, `/friendlies`, `/stats/overview`, `/cup`, and still created *and* deleted a
tournament (200/204 throughout); its `create_all` left both new tables and their rows intact, and
its payloads simply carry no `can_*` fields.
**Runtime:** isolated stack (backend :8003 on `data/verify.db`, vite :8020, scratch secrets).
Editor = Flo, admin = Roli. Screenshots at 390px and 1280px, blue and light: the decider editor
rendering **for an editor** on a done, tied tournament (with the delete button next to it); the
three confirmation dialogs; and the same page once the hour is backdated away — delete button and
decider chips gone, the three muted lines in their place. Zero console errors on every run. Also
checked live: a reader gets no Controls tab and no row actions on `/friendlies`, and an editor
sees edit/delete on **only** the friendly they entered (1 of 7 rows).

---

# Round 6 — closed. What it found and deliberately did not fix (2026-09-14)

All ten items (A1–A10) are implemented on `feature/2026-09-audit` and the branch head is green:
`make test` → **154 passed** (3:38), `make lint` → *All checks passed!*, `make gen-types` → no
diff, `cd frontend && npm run check` → **52 files / 503 tests**, `npm run build` → clean (the
pre-existing ">500 kB chunk" hint only). Not pushed; `main` is untouched.

The list below is everything the four workers found and left. It is not a queue — nothing here is
agreed work — but none of it should have to be discovered twice.

**Needs a decision from Roli (design, not bugs):**
- **The primary button fails contrast in the four dark themes**, the same failure A6 fixed in
  light: white on the teal is **2.49:1** in `dark`, **3.68:1** in `blue`, **4.32:1** in `red`.
  `green` passes (6.54:1) because it already pairs a bright button with dark ink. One shared
  token, four themes, and it changes the app's main button everywhere — Roli's call, not an
  agent's. The same choice exists in light, where A6 took the ink route: the alternative there is
  `--color-btn-bg: 15 118 110` + hover `17 94 89` (5.47:1 / 7.58:1), a visibly darker teal that
  keeps white lettering.
- **Smaller light-theme contrast misses, all below 4.5:1 and all deliberate palette choices:**
  `text-win` / `text-draw` at **4.21:1** on the light page ground, the `text-text-muted/40`
  separators at **1.97:1** and the `/60` participant line at **2.96:1** on `/tournaments`, and
  `red`'s selected chip at **4.10:1**.

**A real breach the audit missed** (found by A8's worker while fixing §7):
- **`window.confirm` for three destructive actions** — `ClubsPage.tsx:512`,
  `GuestbookEntryCard.tsx:201`, `TournamentCommentsCard.tsx:308`. `DESIGN.md` §7 says never, and
  A10 built `ui/primitives/ConfirmDialog.tsx` for exactly this. It is three files of plumbing, not
  a one-liner, which is why it was not folded into A8. The five *non-destructive* `window.confirm`
  calls (mark-as-read, swap sides, …) are fine as they are.

**Declined inside a task, with the reason that stands:**
- **`PRAGMA foreign_keys=ON`** (A9.5) — the right answer, the wrong scope: it changes every delete
  in the app at once and deserves its own task with its own test pass.
- **`MatchDetailPage` keeps its permissive `?tab=`** (A9.6) — its `edit` tab depends on loaded
  data, so an `allowed` list would reject a valid deep link before the data arrives.
- **The matchup nav seam** (A9.6) — no path the app offers today can trigger it; closed as latent,
  pinned by a unit test.
- **"1 games" in the duo rivalries** (A7.9) — `RecordLine`'s `playedLabel` sits *outside* the
  fixed track, so shortening it for n=1 shifts every following segment and undoes T14's alignment.
- **`OverviewSection:229`'s uppercase pseudo-`<thead>`** (A8.4) — reclassified as canon rot, not a
  breach: it is a row of column headers doing the same job as the app's two real `<thead>`s, in the
  same style. §6 now covers it.
- **`VoteVotersModal:68` paints a thumbs-down `text-loss`** (A8.8 family) — a vote genuinely is a
  two-sided verdict, so the result token is the right one.
- **`.pos-good`** — one of five stops on a ramp whose legend shows four; `styles.css` now says so
  instead of the canon pretending it is dead.

**Known and accepted, unchanged:** `npm run build`'s ">500 kB chunk" hint (≈669 kB `index-*.js`),
and `PATCH /tournaments/{id}/second-leg` still reviving a done tournament for any editor (A10).

---

# Round 7 — Roli, 2026-09-15 (testing the audit branch)

Baseline `a1a2acc` on `feature/2026-09-audit`. Nine items collapsed into **five jobs**, run in three
waves. Wave 1 = R1 ‖ R2, wave 2 = R3 ‖ R4, wave 3 = R5. The pairing is by *file set*, not by
subject: R2 carries the What-if tab order because the tournament page holds one of the browser
confirms in the same file, and R3 waits for R2 because both touch `ClubsPage.tsx` and `MatchList.tsx`.

Rules for implementing agents are the ones at the top of this file. In addition: never `git add`
(commit with `git commit -o -m "…" -- <paths>`), never bind 8000/8001/8010/5173, never a broad
`pkill`, never read `backend/secrets.json`.

## R1 — The two micro-tile grids  ☑

`DESIGN.md` §4 calls the positions grid and the H2H matrix "the same thing at the same size", so
they are one job.

**R1a — the cup lineage is diagonals again, and they stop crossing the digits.**
Roli, on A7's replacement: *"huh, i expected it to be like before, with diagonal lines from cell to
cell??"* and *"yeah i want the diagonals back, fix the digit-crossing as well"*.
History: the original joined the holder's cell centres. A7.7 moved it into the gutters as a path
that stepped sideways at each handover — *"super ugly in some cases"*, because a jog reads as a
bracket drawn around a random block of cells. A follow-up (`a1a2acc`) removed the jogs, which left
straight rails and no movement at all.
The answer is the original polyline, painted **under** the tiles: `.pos-tile` is
`hsl(… / 0.22)`, so the line still reads through the tile while the digit and the crown sit on top
untouched. That also answers A7's second complaint — crossing a cell of a tournament the holder
never played is fine when the line passes behind it.
**This is already written into the working tree, uncommitted** (`pages/stats/PositionsView.tsx`):
the `<svg>` moved *before* the grid (both are positioned with `z-index:auto`, so DOM order decides),
`laurelPolylines` restored with the `cup_stakes` guard, a 3px lane per cup so one cannot hide the
other, and `InfoLegend` gained a line per cup. Verify it, keep it, commit it with the rest.

**R1b — the matrix uses the width it has.**
Roli: *"in h2h matrix, on mobile its a bit weird: it does not use the width fully (which it probably
should not if there are only 2-3 players), but in my case there are 6 and it should either be
centered or additionally use the full width. make sure this scales accordingly and also looks nice
on desktop"*.
Cause: `pages/stats/H2HView.tsx:361-412` draws fixed `h-11 w-11` cells with `borderSpacing: 3` in an
`overflow-x-auto` box. Six short names come to ~330px inside a 358px viewport, left-aligned, with a
dead strip on the right.
Do: cell size responsive, roughly `clamp(40px, (100% − name column) / n, 56px)`, square. Floor 40
(not 38 — the `wdl` metric renders three numbers and two hyphens in that cell). Ceiling so two or
three players do not become giant tiles. Centre the table once the ceiling caps it, which is every
realistic count on desktop. Below the floor it keeps scrolling sideways. The rotated column labels
and the `h-24` header must follow the cell width; the sticky first column keeps working.

**DoD:** both grids at 390px and 1280px in blue and light; the matrix additionally with 2, 3 and 6
players; zero console errors; `npm run check` + build.

**Deviations:**

- **R1a was kept as written**, with three corrections: the doc comment still said the two
  cups get "a half-pixel lane each" where the code gives each a 3px lane; `InfoLegend`'s
  header comment still said "cup rails"; and the removed `<svg>` left a blank line behind.
  The plan also says `InfoLegend` "gained a line per cup" — it already had one, from the
  rails work, but as a **vertical** bar, which promises the thing the lineage stopped
  being. It is now a diagonal at the grid's own stroke and cap.
- **The floor is 44px, not the 40 the plan proposed.** The plan's own reason for a floor is
  that the default metric renders three numbers and two hyphens; measured in the browser,
  40 is not enough — a real record (`11-10-5`, seven glyphs at `text-xs`) wraps onto a
  second line at 40 and fits on one at 44. 44 is also exactly the cell's old fixed size, so
  the change can only ever grow a tile, never shrink one.
- **A `<td>` carries 1px of user-agent padding**, which made every column two pixels wider
  than it asked to be — invisible at a fixed 44, fatal to arithmetic that must add up to
  the box's width (the first attempt overflowed a 358px phone by 11px). The body cells got
  `p-0`; the gutter is now `border-spacing` and nothing else, so it reads 3px instead of 5.
- **The measurement hangs off a callback ref, not a dependency array.** The matrix leaves
  the DOM whenever the Duos sub-view is up, and `rows` does not change when it comes back,
  so an effect keyed on the data handed the returning table a stale zero and left it at the
  floor until the next resize. Only the scroll box is observed, never the name column:
  nothing in that column depends on the cell size, so there is no loop to get into.
- `DESIGN.md` §4 said the two micro-tile grids are "the same thing at the same size", which
  stops being literally true once one of them is elastic. One clause added naming both
  sizes. No other canon change.
- **Not changed, and worth a look:** the header block above the matrix is `h-24` (96px) with
  the rotated names centred in it, so a short name like "Rumpi" floats with ~30px of dead
  space under it before the first tile — most visible with two or three players, where the
  matrix is now small and centred. It is pre-existing, it is not what Roli reported, and the
  plan asks only that the header follow the cell **width**, so it was left alone. If it
  should go: `writing-mode: vertical-rl` + `rotate-180` on the label makes its layout box
  the real rotated box, and `items-end` then parks short names on top of the tiles while
  long ones grow upward.
- Verified at 2 / 3 / 6 / 7 / 12 players by trimming and padding the live `/stats/ratings`
  payload in the browser — the component, the layout and the browser are real, only the data
  is resized. The dev data has exactly six players under every Mode/Source combination, so
  the small and large counts are unreachable through the filters. The arithmetic is also
  pinned in `src/test/h2hHelpers.test.ts` (6 unit tests).

---

## R2 — One dialog, one tab order, one banner  ☑

**R2a — the app's own dialog, everywhere.** Roli: *"use the own dialogs everywhere"*. `DESIGN.md`
§7 already says never `window.confirm`; A10 built `ui/primitives/ConfirmDialog.tsx` for it and A8
flagged three destructive sites it never reached. Roli's "everywhere" is all eight:

| File | Line | What it asks | Destroys? |
|---|---|---|---|
| `pages/ClubsPage.tsx` | 512 | delete a club | yes |
| `pages/profile/GuestbookEntryCard.tsx` | 203 | delete a message **and its replies** | yes |
| `pages/live/TournamentCommentsCard.tsx` | 308 | delete a comment | yes |
| `pages/profile/useProfileGuestbook.ts` | 427 | mark N unread as read | no |
| `pages/live/LiveTournamentPage.tsx` | 572 | mark N unread as read | no |
| `pages/live/MatchDetailPage.tsx` | 463 | swap sides A and B | no |
| `pages/live/CurrentGameSection.tsx` | 290, 309 | (read them) | read them |

The three destructive ones name **what is lost** in the dialog's red block — the club's name and
that it is used in matches, the reply count, the comment's author and whether it carries an image.
The rest get the same dialog without that block: a title, a sentence, Cancel and a verb. Never a
bare "OK". `useProfileGuestbook.ts` is a hook, not a component — the dialog belongs to its caller,
so the hook returns the intent and the page renders the dialog.

**R2b — What if moves.** Roli: *"move the 'what if' to the right of matches (left of comments)"*.
`pages/live/LiveTournamentPage.tsx:537-542` pushes overview · standings · matches · comments ·
whatif. It becomes overview · standings · matches · **whatif** · comments. `showWhatIf` stays
conditional; `?tab=` values do not change.

**R2c — the banner fills the width again.** Roli: *"its left aligned and does not uflly fill the
width"*. `a1a2acc` capped the banner's width so A7.6's height cap would stop cropping the 16:9 crop
the editor produces. Wrong trade. `pages/profile/ProfileHeader.tsx`: drop `md:max-w-xl`, keep
`w-full aspect-[16/9] object-cover`, no `max-h`, no `object-center`. Accepted consequence, stated to
Roli and waved through: at 1280×900 the banner is ~557px and the tab strip sits near the fold.

**DoD:** `grep -rn "window.confirm" frontend/src` returns nothing but the comment in
`ConfirmDialog.tsx`; every dialog tried at 390px and 1280px; the tab order checked on a draft, a
live and a done tournament; `npm run check` + build.

**Deviations:**

- **All eight replaced.** `grep -rn "window.confirm" frontend/src` → one hit, the sentence inside
  `ConfirmDialog.tsx` itself. Two of my own comments were reworded so they do not answer that grep.
- **`CurrentGameSection` classified, as asked.** **:290 Reset is destructive** — it throws a played
  result away — so it carries the red block and names the score: *"Flo 2–1 Atzi is wiped"*, plus
  "the clubs stay; the standings drop this match until it is played again". **:309 Finish is not**:
  it records a result that Reset undoes, so it is title + sentence + verb. Its title now states the
  score that would really be written (`Finish this match at 1:0?`) instead of the old hard-coded
  "(0:0)" — the dev DB has scheduled matches carrying goals, and Finish would have recorded them.
  Finishing a match that *is* being played still asks nothing, exactly as before.
- **The hook returns intent, the page renders the dialog.** `useProfileGuestbook` exposes
  `onRequestMarkAllRead` + `markAllAsked`/`markAllCount`/`onConfirm|onCancelMarkAllRead`, and
  `pendingDelete`/`pendingDeleteReplyCount`/`deletePending`/`onConfirm|onCancelDelete`;
  `GuestbookSection` renders both `ConfirmDialog`s. The recursive card's context callback
  `deleteEntry(id)` became `requestDelete(entry)` for the same reason — one dialog for the feed,
  not one Modal per card. Nothing in the hook's API now claims to act when it only asks.
- **Reply counts are the whole subtree**, because both deletes cascade transitively
  (`routers/players.py`, `routers/comments.py`): new tested helper `countGuestbookDescendants`
  in `guestbookTree.ts`, and a local walk over `childrenByParent` in `TournamentCommentsCard`.
  The native texts said "and all replies" / nothing at all.
- **What the three destructive dialogs name.** Club: `name · league · stars`, "its crest and its
  star rating go with it", then the rule A9 widened — used in a tournament match **or a friendly**,
  the delete is refused and nothing changes. (`ClubOut` carries no usage count and the plan forbids
  a round trip, so the dialog states the rule, not the answer.) Guestbook message: author + time as
  the subtitle, the N replies, its votes, "cannot be undone". Comment: author + time as the
  subtitle, *"Flo's comment is deleted, the attached image with it"*, the N replies, "cannot be
  undone" — every word of it from the comment the client already holds.
- **Two wordings were wrong and are fixed.** "Swap sides A and B? This cannot be undone" — the
  endpoint swaps the two side labels and is its own inverse, so it now says what moves and that
  swapping again puts it back. And both "mark N as read" dialogs now say the read marks are the
  viewer's own and nothing is deleted (singular sentence when N is 1).
- **Title style:** the club dialog is "Delete this club?" with the name in the red block, not
  `Delete "<name>"?` like the tournament one — `Modal` truncates a string title and club names run
  long on a phone.
- **Verification:** isolated stack (backend :8004 on a copy of `app.db` with a scratch secrets
  file, vite :8021), Playwright signed in as admin. 14 surfaces × blue/light × 390/1280 px = **56
  runs, 0 console/page errors, 0 horizontal overflow**, plus 8 more for the singular "Mark 1 as
  read" case; backend log clean (no 5xx). Tab order checked on draft (21), live (20) and done (19):
  Overview · Current · Standings · Matches · **What if** · Comments · Admin, and the done one has
  neither Current nor What if. `npm run check` green (52 files, 509 tests), `npm run build` green
  (only the pre-existing >500 kB chunk hint).

---

## R3 — The themes read  ☑

**R3a — the primary button, dark themes.** Roli, shown the rendered options: *"use darker color with
a white label for all dark themes"*. So **option B**: keep the white label, darken the colour.

| Theme | File | Now | Becomes | White label |
|---|---|---|---|---|
| dark (baseline) | `themes/defaults.css` | `20 184 166` | `15 118 110` | 2.49 → **5.47** |
| blue | `themes/blue.css` | `59 130 246` | `37 99 235` | 3.68 → **5.17** |
| red | `themes/red.css` | `225 56 74` | `200 35 50` | 4.32 → **5.61** |

`--color-hover-btn-bg` moves with each one (one further step down; teal's is `17 94 89`).
**`green` and `light` are not touched** — green already passes at 6.54 with its dark label and
option B would take it to 4.12; light keeps A6's dark label at 7.94. Decided with Roli.

**R3b — light theme, the rest.** Roli: *"also do the white theme fixes"*.
- `--color-win` `21 128 61` → `22 101 52` (4.21 → **5.98**), `--color-draw` `180 83 9` → `146 64 14`
  (4.21 → **5.95**), both on the light page ground `236 235 233`. `--color-loss` already passes at
  5.43; move it to `153 27 27` (6.98) **only** if the three look mismatched side by side, and say so.
- **Muted text drawn at alpha**: `text-text-muted/40` = 1.97:1 and `/60` = 2.96:1 on paper-white.
  Seven occurrences in six files (`TournamentsPage.tsx` ×2, `ui/primitives/List.tsx`,
  `ui/primitives/CollapsibleCard.tsx`, `ui/ClubStarsEditor.tsx`, `pages/live/MatchList.tsx`,
  `ClubsPage.tsx`). Alpha is being used as a hierarchy tool where the light theme has no room for
  it. Decide one answer and apply it to all seven: full-strength muted for text, and a real
  separator treatment (a border or a full-strength `·`) where the alpha was decorative.

**DoD:** every changed ratio measured in the browser in **all five** themes, before and after, in a
table; no non-light value moves except the three button colours; `npm run check` + build.

**Deviations:**

- **R3a was written by a worker that died on an infrastructure timeout before it could verify
  or commit anything.** Its edit to the three theme files and its `DESIGN.md` paragraph were
  sitting uncommitted in the tree; both were re-measured here from scratch and kept.
- **The inherited hover reasoning is right, and now has numbers.** It noticed what the plan did
  not: every old `--color-hover-btn-bg` stepped *up* into a brighter shade, so the white label
  got worse the instant a pointer touched it — measured in the browser, hovering dropped the
  label to **1.86:1** (teal), **2.54:1** (blue) and **3.67:1** (red), each *below* the resting
  fill it was already failing at. The three new hovers step down instead (7.58 / 6.70 / 7.29).
  The general rule is now in `DESIGN.md`: a hover moves *away* from the label's luminance, never
  toward it — which is also why `light`, whose label is dark ink and whose hover steps lighter
  (7.94 → 10.61), was right all along and is untouched.
- **The plan's "option B would take green to 4.12:1" is not reproducible.** Measured: green's
  dark label on green-500 is 6.54:1; keeping that label on a green-700 fill gives **2.97:1**;
  white on green-700 gives **5.02:1**. Every candidate is worse than 6.54, so the decision
  (leave green alone) stands — only its stated reason was wrong, and `DESIGN.md` now carries the
  measured one.
- **`--color-loss` moved after all**, to `153 27 27` — the plan allowed it "only if the three look
  mismatched, and say so". They did, and there is a harder reason than the eye: once `win` and
  `draw` were deepened, red-700 was the lightest of the three to look at, and on its own
  `bg-loss/15` badge (`ScoreLine`) it measured **4.25:1**, the only one of the three still under
  4.5:1 there. The badge is the case A6 and A8 never measured: before this change the light
  theme's W/D/L badges were **3.49 / 3.48 / 4.25**, and they are now **4.81 / 4.76 / 5.41**.
  Consequence recorded in `DESIGN.md`: `--color-draw` now shares amber-800 with `--color-warn`,
  and `--color-loss` no longer shares red-700 with `--color-error`.
- **The muted-alpha half: one answer, "opacity is not a tone".** No `text-text-muted/<n>` remains
  anywhere in `src/` (the seven were the only ones). Three were decorative `·` separators inside
  a line that is *already* `text-text-muted` (`TournamentsPage` meta, `ClubsPage` club meta) — the
  span now carries only its `mx-1.5` and inherits, because a separator is spacing, not a third
  tone; a fourth (`MatchList` meta) names the token because its line is not muted as a whole.
  One was real content — the participants line under a tournament name, at 2.96:1 on light — and
  simply goes full strength. The last three were affordances: the `ListRow` chevron and the two
  disclosure glyphs (`CollapsibleCard`, `ClubStarsEditor`). The hierarchy those alphas were
  faking is carried by the type scale and weight, which is what `DESIGN.md` §5 already says.
  A **border** was considered for the separators and rejected: a vertical rule between inline,
  wrapping meta parts is a layout change, and the codebase already writes the full-strength `·`
  in plain strings elsewhere (`MatchOverviewPanel`, `ClubPicker`, `SelectClubsPanel`) — the seven
  were the outliers, not the pattern.
- **Alpha *backgrounds* were deliberately left alone**, and `DESIGN.md` now says why they are a
  different thing: `bg-win/15` is a tint of a surface, and `MatchList`'s finished-state dot at
  `bg-text-muted/60` is a dot whose word ("finished") sits beside it. Taking that dot to full
  strength would make *finished* the loudest marker in a list where live and scheduled carry
  status colours. `WhatIfSection.tsx` has the same dot and is outside this task's file set.
- **"No non-light value moves except the three button colours" is read as being about theme
  *tokens*,** and holds: the only token values changed are light's `win`/`draw`/`loss` and the
  three dark `--color-btn-bg`/`--color-hover-btn-bg` pairs; every other measured ratio in
  blue/dark/red/green is identical before and after. The alpha repair is a *component* change to
  seven class attributes, so it necessarily lands in all five themes — where it also fixed a
  near-invisible separator (2.63–2.74:1 in the dark themes). Applying it to light alone would
  have meant keeping alpha-as-hierarchy in four themes and dropping it in one, i.e. two answers
  where the plan asked for one.
- **The `ListRow` chevron has no live call site today**: both callers (`TournamentsPage`, which
  passes `chevron={false}`, and `PlayersAdminPage`, which always passes `trailing`) suppress it,
  so it could not be measured on a real surface. It was measured by injecting a span with the
  same class into a real tournament row in the running app, so the theme variable and the
  compositing are the browser's own. Left in place and fixed like the rest — it is live code in
  the primitive.
- **`DESIGN.md` §2 had two claims that R3 falsified and that are now corrected**: the
  `--color-btn-text` table row still printed the dark teal's 2.49:1 as if current, and A8's
  paragraph said 4.21:1 "is enough under a single numeral in a `W-D-L` run" — the sentence this
  task exists to disprove.
- **Verification:** baseline `27b1078` extracted with `git archive` into a scratch tree and served
  by a second vite (`:8025`) against the same backend, so before/after are the same app, same
  data, same browser, differing only in the diff. Backend `:8003` on a copy of `app.db` with a
  throwaway `JWT_SECRET` env var and a self-minted admin token — `secrets.json` was never read.
  Five themes × two widths (390 / 1280) × six surfaces, contrast computed in-page from
  `getComputedStyle` with every translucent ancestor composited. Zero console errors in the after
  run. Stack and DB copy removed afterwards.
- Committed in two commits: the three dark theme files (R3a), then light's tokens, the seven
  class attributes, the `DESIGN.md` canon for both halves and this tracker (R3b). `DESIGN.md` is
  one file and documents both, so it rides with the second.

---

## R4 — A club's stars remember when they changed  ☑

Roli: *"i want club star-rating history. recover history as well."* Parked idea 4 of this file is the
research; read it before starting. The short version: `Club.star_rating` is one float, a
`PATCH /clubs/{id}` overwrites it, and the stats "Club stars" view joins **today's** rating onto
every historical match — so re-rating a club silently rewrites the past.

- **New table** `ClubStarRating` (`club_id`, `stars`, `valid_from` date, `changed_at`) — a new
  table, never a column, per §5. `init_db()` seeds one row per club at its current rating,
  idempotently.
- Every star write appends a row instead of only overwriting. Keep `Club.star_rating` as the
  current value so nothing else breaks.
- Stats resolve the rating **as of the match's date**; anything earlier than the first row uses that
  first row. `services/stats/odds.py` keeps reading the *current* rating — odds are a prematch
  estimate and that is correct.
- **Recovery**: a `backend/manage.py` command that diffs the production snapshots in
  `backup/deploy/*/data/app.db` (**deploy only** — `backup/local/*` are pre-sync dev copies and
  interleaving them fakes changes that revert), dating each change at the snapshot where it first
  appears, and reports what it found. Expect ~31 changes across 31 clubs; only 2 of 178 finished
  match sides are misattributed today, so the value is protecting the future, not fixing the past.
  State the limits in the output: nothing before 2026-03-28, and inside a gap the exact day is
  unknown.
- **Frontend**: where a rating is edited (`ClubsPage` panel and `ui/ClubStarsEditor.tsx`), show the
  history for that club. Small and read-only.

**R4b — a plan note, not code.** Roli: *"fold the 'season or year view' into the ea fc 27 changes ->
i dont want them now, but when the game arrives i want the plan to be ready"*. Write it into parked
idea 3 (EA FC 27 / multiple games) of this file: what a season/year filter means next to the Game
filter, which surfaces it applies to, and that it ships with FC 27, not before.

**DoD:** `make test` + `make lint` + `make gen-types`; new backend tests for the as-of resolution
and for the appending write; the recovery command run against the real snapshots **read-only** with
its report pasted into Deviations; `npm run check` + build.

**Deviations:**

- **The as-of rule, stated once** (`services/club_stars.StarRatingResolver.as_of`): the last row
  whose `valid_from` is on or before the match's **own date**; before the first row, that first
  row; with no date at all, the current rating; with no club, nothing. The "before the first row"
  edge is the important one — tournaments start 2025-10-18 and the record starts 2026-03-28, so
  falling back to *today's* rating there would have re-introduced the bug for every match of the
  first five months. A **friendly** resolves on `FriendlyMatch.date`, not on the tournament it is
  grouped under in the stats payload (it has none). `started_at`/`finished_at` are never used:
  they record when a score was typed in (the warning already on `services/stats/streaks.py`).
  `services/stats/odds.py` was left alone and a test pins that it stays on the current rating.
- **Every write path found** — three, not one: `POST /clubs` (opens a club's history),
  `PATCH /clubs/{id}` (the Clubs page panel **and** T2's inline `ClubStarsEditor` in the picker
  both go through this one endpoint, so one call site covers both editors) and
  `app/seed.py::upsert_clubs`, which silently changes `existing.star_rating` when a seed file
  disagrees. `app/tools/sync_club_crests.py` touches crests only. All three go through
  `record_star_rating()`, which writes **one row per club per day**: a second edit on the same day
  is that day's value, and re-saving a rating that is already in force writes nothing.
- **An extra column beyond the spec: `source`** (`live` | `seed` | `recovered`). Without it the UI
  cannot tell an exact day from a reconstructed one, and R4 explicitly requires the limits to be
  stated — the frontend says "since 12/09/2026" for a measured day and "by 31/05/2026" for a
  recovered one.
- **`init_db()` seeds at today's date**, not at a sentinel in the past. With only that one row
  every historical match resolves to the club's current rating — i.e. *exactly* today's behaviour,
  so a database that never runs the recovery is unchanged rather than subtly different. The
  recovery then inserts rows *before* it and prunes the seed row when it says nothing new (626
  pruned here).
- **A latent bug found and fixed on the way** (`fix(R4)` commit): `db.py` imports no model, so
  `SQLModel.metadata` is only populated once something pulls in `app.models`. Any entry point that
  called `configure_db()` + `init_db()` directly got a `create_all` over empty metadata. The
  service import now sits *above* `create_all`, where importing it is what registers the tables.
- **Response models changed**, so `make gen-types` ran and `schema.d.ts` is in the same commit:
  new `ClubStarHistoryOut`/`ClubStarHistoryEntryOut`, and a new `StatsMatchSideOut` (=
  `MatchSideOut` + optional `club_stars`) used by `StatsMatchOut` alone. `MatchOut` — the live
  tournament payload — is deliberately untouched: a live match asks "how good is this club now",
  the same question the picker and the odds ask.
- **Frontend reach, slightly wider than "show the history"**: `StarsView` buckets by `club_stars`,
  and the *detailed* match rows pass it to `MatchSides` as an override. Without the second half
  the same page would print "2.5★" under a score whose bucket counts it as 3★. Live surfaces pass
  nothing and still show today's rating. `ui/primitives/MatchOverviewPanel` (a single match's hero
  panel) was **not** changed — one screen, one tense, and that one is "this match, now".
- **Where the history is shown**: the Clubs page edit panel (full width, under the fields) and the
  club picker's "Selected" row. In the picker it is a block *under* the row rather than inside
  `ClubStarsEditor`, because that editor lives in the row's `trailing` slot — a list of dates does
  not fit in a right-aligned cell. `ClubStarHistory` brings no surface of its own; the caller owns
  the box (an `inset` in the picker's modal, plain rows inside the page's existing `inset`).
- **No `text-text-muted/<n>`** anywhere in the new component (R3's rule), no uppercase label inside
  the `inset` (the "now" marker is lowercase `.text-micro`, DESIGN.md §6), `rounded` only through
  `inset`/`list-divided`.
- **The recovery command is `python3 backend/manage.py recover-club-star-history [--path …]
  [--apply]`**, read-only by default. It never writes to `backup/` (every snapshot is opened
  `mode=ro`) and in a dry run it does not configure an engine at all — even the target database is
  read through a read-only connection, so the report costs nothing. Deploy snapshots are selected
  by `snapshot.json`'s `kind`, **not** by the directory name: two of the twelve real deploy
  snapshots (`20260328-022654`, `20260913-150024`) are named without the `-deploy` suffix and a
  name-based filter would have silently dropped them.
- **The research's numbers held.** 31 changes across 31 clubs, exactly as measured on 2026-09-13.
  The impact reads **3 of 218** finished match sides rather than "2 of 178": the 178 *tournament*
  sides and their 2 misattributions are confirmed to the row (San Jose Earthquakes and Carrarese
  Calcio, both dated 2026-05-31); the third is a **friendly** side (Grazer AK, 2026-07-24), which
  the original research did not count because it only looked at `matchside`. There are 12 usable
  snapshots now, not 11 — one more was taken on 2026-09-13 after the research was written.
- **Read-only run against the real snapshots** (target: the dev `backend/app.db`, which mirrors
  production):

```
Club star-rating recovery — deploy snapshots under /home/roli/projects/turnierplaner-reloaded/backup/deploy

Snapshots used (12):
  2026-03-28  20260328-022654  (626 clubs)
  2026-03-28  20260328-012722-deploy  (626 clubs)
  2026-04-03  20260403-150029-deploy  (626 clubs)
  2026-05-31  20260531-123205-deploy  (626 clubs)
  2026-06-08  20260608-072542-deploy  (626 clubs)
  2026-06-09  20260609-211825-deploy  (626 clubs)
  2026-07-12  20260712-010531-deploy  (626 clubs)
  2026-08-08  20260808-092732-deploy  (626 clubs)
  2026-08-20  20260820-182445-deploy  (626 clubs)
  2026-09-12  20260912-162149-deploy  (626 clubs)
  2026-09-12  20260912-162230-deploy  (626 clubs)
  2026-09-13  20260913-150024  (626 clubs)

Skipped (1):
  20260403-145834-deploy: no data/app.db

Recovered: 626 clubs get an opening rating, 31 rating changes across 31 clubs.

Changes (dated at the snapshot where the new value first appears):
  2026-04-03  FC Porto (#49)  4★ → 4.5★   [after 2026-03-28]
  2026-05-31  Huracán (#115)  3.5★ → 3★   [after 2026-04-03]
  2026-05-31  Blau-Weiss Linz (#267)  2★ → 2.5★   [after 2026-04-03]
  2026-05-31  San Jose Earthquakes (#295)  2★ → 2.5★   [after 2026-04-03]
  2026-05-31  Bryne FK (#307)  1.5★ → 1★   [after 2026-04-03]
  2026-05-31  FC Thun (#311)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  SCR Altach (#323)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  Yunnan Yukun (#355)  1.5★ → 1★   [after 2026-04-03]
  2026-05-31  AFC Wimbledon (#360)  1.5★ → 1★   [after 2026-04-03]
  2026-05-31  Derby County (#371)  3★ → 3.5★   [after 2026-04-03]
  2026-05-31  Huddersfield (#372)  2★ → 2.5★   [after 2026-04-03]
  2026-05-31  Lincoln City (#375)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  Port Vale (#382)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  Stockport (#387)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  Barrow (#397)  1.5★ → 1★   [after 2026-04-03]
  2026-05-31  Bristol Rovers (#399)  1.5★ → 1★   [after 2026-04-03]
  2026-05-31  Alemania Aachen (#449)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  FC Ingolstadt 04 (#453)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  MSV Duisburg (#456)  1.5★ → 2★   [after 2026-04-03]
  2026-05-31  Quatar (#485)  3★ → 2.5★   [after 2026-04-03]
  2026-05-31  Carrarese Calcio (#497)  3★ → 2.5★   [after 2026-04-03]
  2026-05-31  Daegu FC (#504)  2★ → 1.5★   [after 2026-04-03]
  2026-05-31  Jeju SK (#521)  2★ → 1.5★   [after 2026-04-03]
  2026-05-31  Suwon FC (#524)  2★ → 1.5★   [after 2026-04-03]
  2026-05-31  FC Annecy (#552)  1.5★ → 2.5★   [after 2026-04-03]
  2026-05-31  Macarthur FC (#618)  1.5★ → 2★   [after 2026-04-03]
  2026-07-12  Tigre (#259)  2.5★ → 3★   [after 2026-06-09]
  2026-08-08  Grazer AK (#314)  1.5★ → 2★   [after 2026-07-12]
  2026-09-12  Gimnasia y Esgrima La Plata (#169)  3★ → 2.5★   [after 2026-08-20]
  2026-09-12  San Diego FC (#206)  3★ → 2.5★   [after 2026-08-20]
  2026-09-12  Swansea City (#417)  3★ → 3.5★   [after 2026-08-20]

Impact on the target database: 3 of 218 finished match sides change value.
  2025-11-30  San Jose Earthquakes (#295)  tournament side 27: counted 2.5★ → 2★
  2026-04-17  Carrarese Calcio (#497)  tournament side 147: counted 2.5★ → 3★
  2026-07-24  Grazer AK (#314)  friendly side 25: counted 2★ → 1.5★

Limits of this recovery — read them before trusting a date:
  * Nothing is recoverable before 2026-03-28, the oldest snapshot. A match played
    earlier is counted at the oldest value on record, which is the best answer available,
    not a measured one.
  * Inside a gap between two snapshots the exact day is unknown. Each change is dated at the
    snapshot where the new value was first seen, so it is an upper bound: the rating changed
    somewhere in the window printed next to it.
    Gaps longer than a week:
      2026-04-03 → 2026-05-31 (58 days, 25 changes)
      2026-05-31 → 2026-06-08 (8 days, 0 changes)
      2026-06-09 → 2026-07-12 (33 days, 1 changes)
      2026-07-12 → 2026-08-08 (27 days, 1 changes)
      2026-08-08 → 2026-08-20 (12 days, 0 changes)
      2026-08-20 → 2026-09-12 (23 days, 3 changes)
  * Nothing after 2026-09-13 comes from a snapshot; from there on the history is
    written live by every star edit.
  * Rows written here are marked source=recovered, so the app can say the day is approximate.

Read-only run: nothing was written. Re-run with --apply to write these rows.
```

- **Verified in a real browser** against an isolated stack (backend :8003 on a copy of the DB with
  the recovery applied, vite :8020) at **390px and 1280px** in **blue and light**: the Clubs page
  edit panel, the club picker's Selected block, Stats → Player → Club stars, and the H2H matchup's
  detailed rows. **Zero console errors** in all of them, and `document.querySelectorAll("a a")`
  stayed 0. Checked end to end in the DOM: Carrarese Calcio renders **3★** under its 2026-04-17
  match while the club reads 2.5★ today.
- **Roli's own dev server picked the change up while this was being built.** His `backend/app.db`
  now carries the `clubstarrating` table with 626 seed rows, written by his own running backend's
  `init_db()` at 20:11 — additive, idempotent and exactly what a deploy does. Nothing else in that
  database changed, and the recovery was **not** applied to it.
- **Deploy note:** this adds a table and a startup seed. The expected one-time log line is
  `Club star history seeded: <n>` (626 against the current production data). The recovery is
  optional and manual — run it read-only first, then with `--apply`, from this dev machine against
  the server's database, or simply skip it: without it every past match keeps counting today's
  rating, exactly as it does now.

---

## R5 — Ideas and feature requests  ☑

Roli: *"add a page with ideas/feature requests (below clubs, no tab in bottom bar). make sure to
follow design of rest of page. the feature requests are recorded and admin can see them. make sure
to have relevant input fields, like text input, but also checkmarks which page they want to change
(or if its more general or affects multiple pages) etc. think about this hard."*

**Settled with Roli — do not relitigate:** a new nav entry **visually below Clubs** in the sidebar
and the drawer, **no bottom-bar tab**. **Posting requires login.** **Everyone can read every request
and vote on it.** **An editor may edit their own**; **an admin may do anything.** **Image upload**,
reusing what comments already do. **A push to the admin when a new one arrives.**

- **Tables** (all new): `FeatureRequest` (author player id, title, body, kind, status, timestamps),
  `FeatureRequestArea` (request id + area — a child table, so a request can name several),
  `FeatureRequestVote` (request id + player id, unique), `FeatureRequestImageFile` mirroring
  `CommentImageFile`.
- **Areas** are the app's own destinations — Dashboard, Tournaments, Friendlies, Stats, Players,
  Clubs, Profile, Settings, Match page — plus **General** and **Several pages**. Multi-select,
  because a complaint like Roli's about the banner spans a page *and* a viewport.
- **Kind**: feature · change · bug. **Status** (admin only): new · planned · doing · done · declined.
- **Endpoints** under `/ideas`: list (public read), create (editor+), patch (own, or admin), delete
  (own, or admin — through `ConfirmDialog`), vote/unvote, image upload, status (admin only).
- **Frontend**: the composer is **attached to the feed**, not a second floating card (§9b, the
  mistake A8 had to undo in the guestbook). `Chip`/`ChipGroup` for areas and kind, `EmptyState`,
  `InlineLoading`, the existing image lightbox, votes the way comments do them. Filter by status and
  area. Every icon lucide.

**DoD:** the full permission matrix tested backend-side (reader, editor, author-editor, admin);
`make test` + `make lint` + `make gen-types`; the page at 390px and 1280px in blue and light;
a push actually delivered to the admin on create; `npm run check` + build.

**Deviations:**

- **The area catalog is code, the stored area is a string** (`backend/app/feature_areas.py`).
  `FeatureRequestArea.area` is a plain column, never a foreign key, and the rule that goes with
  it is written at the top of that file: **a key is never deleted from `AREA_DEFS`, only marked
  `retired=True`**. A retired area is not offered when writing (`selectable: false` from
  `GET /ideas/areas`, and the server rejects it with a 400), still labels the old ideas that
  carry it, and still appears in the page's filter for as long as one idea names it. A key the
  catalog does not know at all — a hand-written row, or a deletion made against the rule — is
  rendered as the raw key rather than dropped: losing "which page was this about" is worse than
  an unpolished label. That is the answer to "the app grows a destination and an old request
  still names one that no longer exists", and it is covered by a backend test that retires
  `stats` at runtime and by three frontend ones.
- **Areas are required, and the two scope answers stand alone.** The plan lists General and
  Several pages *beside* the destinations, which would let an idea claim to be about the Stats
  page and about no page at the same time. So `general` / `several` are mutually exclusive with
  each other and with every page, the server enforces it (400 "cannot be combined"), and
  `toggleArea` in the composer mirrors it so the Post button never dies on an invisible 400.
  At least one area is required — the filter is the point of the checkmarks Roli asked for, and
  an unlabelled idea rots it. "General" is relabelled **"Not about one page"**, because next to
  ten page names "General" reads like an eleventh page.
- **A vote is a "+1", not a ±1.** `FeatureRequestVote` has no `value` column: the row's
  existence is the vote, `PUT /ideas/{id}/vote` takes `{"value": 0|1}` and answers a -1 with a
  400. A board of five friends asking "who else wants this" does not need a way to downvote a
  friend's idea. The shape stays `VoteResultOut` / `VotersOut` (with an always-empty
  `downvoters`) so the vote button and the voters modal are the ones comments already use.
- **`edited_at` is a column of its own, and only a PATCH stamps it.** Found in the browser: an
  idea said "edited" because the *admin* had set its status. `updated_at` moves for a status, an
  image and a vote, so it cannot answer "did the author rewrite this?" — `edited_at` can, and
  the byline reads that. It is a column on a **new** table, which §5 rule 1 allows; it also got
  a `_RUNTIME_COLUMNS` line, because a dev database that ran an in-progress build of R5 already
  has a `featurerequest` table without it and `create_all` never alters one (see the last note
  below).
- **An idea has no edit window.** A10's hour exists so an editor cannot quietly rewrite a
  *result*; an idea is a document the group answers, and its author owns it for as long as it
  exists. The rule lives beside A10's in `services/authorization.py`
  (`can_edit_feature_request` / `can_delete_feature_request` / `can_set_feature_request_status`,
  `feature_request_capabilities`, two `ensure_*` guards), and `IdeaOut` carries `can_edit` /
  `can_delete` / `can_set_status` so the page renders from the flags. Verified in the browser:
  a reader sees no Edit/Delete/status control on any row, an editor sees Edit and Delete on
  their own three rows and none on the other two, an admin sees all three on all five.
- **Status carries a note.** A status with no reason is what makes a feature board feel like a
  void, so `PUT /ideas/{id}/status` takes an optional `note` and the card prints
  *"Declined — works as designed since N3"* under the pill. Five statuses over the app's three
  status tokens (§2: blue = not started, green = happening, neutral = finished with), with a
  lucide icon inside each pill doing the rest; `declined` is **neutral, not `error`** — a
  decision is not a failure.
- **Two editors, two triggers, each naming what it edits** (§9b). Edit rewrites the author's
  text; tapping the **status pill** opens triage. They are different values with different
  owners, so folding the status into the edit form would have put the admin's answer inside the
  asker's paragraph.
- **The composer is the feed's last row and grows in place.** An idea needs a title, a kind,
  areas and optionally a screenshot, which is more than a chat row — so the row *becomes* the
  form when you reach for it, exactly as the comment composer swaps into goal entry (§9b, T3).
  Closed it is one field, `Share an idea…`, on the card's bottom edge. Focusing it opens the
  block above and hands the caret to the title, the way picking a scoring side hands it to the
  minute; the bottom field then becomes `Details (optional)`. Nothing hides behind a button that
  reveals a form, and there is no second card.
- **The push goes to the admins and to nobody else.** `notifications.admin_player_ids` resolves
  `player_accounts[].admin` against `Player.display_name` case-insensitively — the same match
  `auth.resolve_player_login` makes, so there is no second definition of "who is an admin" — and
  the author is skipped (an admin posting their own idea already knows). Delivery needed a new
  dispatcher method: `enqueue_for_player` narrows the audience but not the mode filter, and
  `enqueue_personal` lifts the filter but broadcasts, so `enqueue_personal_for_player` does both
  and `idea_created` joined `PERSONAL_DEFAULT_EVENT_TYPES`. A device set to "Off" still gets
  nothing. The message deep-links to `/ideas?idea=<id>` (a new one-shot param in
  `lastLocation.ts`; the page scrolls to the idea, flashes it and drops the param). Texts, all
  three languages: title + `{title}` / `Kind · Areas` / a closing line — English *"New idea from
  Flo"*, Deutsch *"Neue Idee von Flo"* (umlaut-free, like every other German text in that file),
  Steirisch *"A neiche Idee vo Flo"* / *"Schau eini und sog, wos draus wird."* The kind and the
  area names stay untranslated because they are the app's own English page names.
- **The push could not be delivered over the wire on this machine.** `cryptography` is in
  `backend/requirements.txt` but is **not installed in Roli's venv**, so
  `web_push_runtime_ready()` is False and the dispatcher is disabled for *every* notification
  locally. Installing it would have mutated his environment, so instead the chain is proven in
  two tests that stop only at the encryption: one asserts the router addresses exactly the admin
  ids (never the author) with the right path, tag and context and that all three languages
  render; the other runs the **real** `NotificationDispatcher._deliver` against four real
  subscription rows (three admin devices, one per language, plus an editor device) with only the
  HTTPS POST faked, and asserts the three admin endpoints receive it in their own language and
  the editor endpoint receives nothing.
- **No realtime, no unread badge.** The board has no WebSocket channel and no read table: it is
  a low-traffic list that the page refetches, and an unread count would have meant a fifth table
  and a fourth badge in the shell for something nobody reads twice a day. The in-app
  notification bell (`/me/notifications`) is likewise untouched — it is built from read tables.
- **Verification.** Isolated stack: backend :8004 on a copy of `app.db`
  (`backend/data/verify_r5.db`, deleted afterwards) with a scratch secrets file and its own
  `UPLOADS_DIR`, vite :8022. Playwright over 3 roles × 2 themes (blue, light) × 2 widths (390,
  1280) = 12 page runs plus the composer, the Closed tab, the image lightbox, the delete dialog,
  the edit form and the status editor in each: **0 console errors, 0 page errors, 0 horizontal
  overflow, 0 nested `<a>` and 0 nested interactive elements** in every state. The live
  permission matrix was also probed over HTTP against :8004 and matches the tests exactly.
- **A note on the dev database.** `backend/app.db` was found to already contain the four new
  tables (empty) before this task ever started a server — an in-progress build of R5 reached it
  from another process on this shared tree. Nothing was deleted or rewritten: the fix is the
  additive `_RUNTIME_COLUMNS` entry for `featurerequest.edited_at`, which is a no-op on any
  database that does not have the table yet (production included) and repairs the ones that do.

---

# Round 8 — queued, NOT started (Roli, 2026-09-15)

Five items Roli found while testing Round 7 on his phone. **Do not start any of these without an
explicit go** — he asked to be the one who says when ("only start when i tell you to"). The
decisions below were settled with him in conversation and must not be relitigated; what is left is
implementation. A sixth strand, the crash diagnostics, is already being built separately.

## Q1 — The Ideas composer's details field is a chat row  ☑

The composer reuses `CommentSendRow` (`pages/live/comments/CommentComposer.tsx`), which starts at
one line and grows to a cap. Right for a comment, wrong for a field that asks *what should happen,
and why*. The in-place edit form on an existing idea already uses a real textarea
(`pages/ideas/IdeaCard.tsx:167`, `min-h-[72px] resize-y`) — the composer, where the first draft is
actually written, got the chat row. Use the taller field in both, from one shared component in
`pages/ideas/IdeaFields.tsx` (which already exists for exactly this reason: "what an idea is,
written once").

**Deviations:**
- **The composer stopped reusing the chat row entirely**, rather than getting a taller variant of
  it. Two reasons. Mechanical: `CommentSendRow` hard-codes `min-h-[2.5rem] max-h-32` on its
  textarea and takes no prop for either, so a taller field is not reachable without editing
  `CommentComposer.tsx` — another worker's file this wave. Substantive: that row's send posts the
  *idea*, not the details, and `canSubmit` is title + areas, so the button was enabled while the
  field it was welded to sat empty. It is now the form's own last row — the screenshot button as
  the icon, "Post idea" filling the rest (`DESIGN.md` §9b, paired actions). The **closed** row is
  untouched: still one field and one button on the card's bottom edge.
- **Growth: a three-line minimum that auto-grows to eight, `resize-none`** — not the edit form's
  `min-h-[72px] resize-y`, and not a chat row's one-line start. The two cannot be combined:
  auto-grow writes `style.height` on every keystroke and would throw away whatever the reader had
  dragged to, and a drag handle does not exist under a thumb, which is where ideas get written.
  Measured at 390px, the old field was 56px empty (the two-line placeholder) and **shrank to 40px
  on the first keystroke**; it is 78px now at every length, up to a 178px cap.
- **`preventScroll` on the opening focus** (`IdeaComposer.tsx`). Not in the brief, but the taller
  field caused it: the composer grew past the point where the newly focused title is already in
  view, so the browser scrolled it to the top of the screen and left the send row 193px below the
  fold at 390x400 (measured: send visible 0px). The composer is pinned to the bottom of the
  viewport and needs no scrolling to reach. With it, opening leaves the page exactly where the
  pre-change build left it.
- **`DESIGN.md` §9b gained one bullet** — "a send button belongs to whatever it posts" — because
  the canon otherwise reads as "a field with its send button is always a chat row", which this
  composer now deliberately is not.
- **Not done, left for later:** `AutoTextarea` in `CommentComposer.tsx` has the same "shrinks when
  you start typing over a wrapped placeholder" behaviour; it is harmless for the comment and
  guestbook rows (one-line placeholders) and that file belongs to Q5 this wave. And
  `IdeaComposer`'s `focusNonce` is dead: it reaches the details field, but posting closes the
  composer and unmounts it, so the effect never runs. Pre-existing, left alone — focusing the
  closed title input instead would re-open the composer through its `onFocus`.
- **Verification:** an isolated stack (backend :8004 on a copy of `backend/app.db`, vite :8021),
  Playwright at 390x844, 390x400 and 1280x800 in blue and light; ideas composed, posted and
  edited end to end, including one long enough to hit the cap. **The 390x400 viewport is a
  stand-in for "the keyboard is up", not a real keyboard** — on iOS the layout viewport does not
  shrink, which is Q2's subject. Zero console errors.

## Q2 — The bottom tab bar rides up with the keyboard  ☐ REOPENED

App-wide, not an Ideas bug: **nothing in the app listens to the visual viewport**
(`grep -rn "visualViewport" frontend/src` → nothing). `BottomTabBar.tsx:27` is
`fixed inset-x-0 bottom-0`, and on iOS a fixed bottom element follows the shrinking viewport, so it
lands on top of the keyboard. Every composer is affected — comments, guestbook, Ideas.

**Decided with Roli:** the bar hides **whenever the keyboard is open, anywhere in the app** — one
rule, not a list of pages. The fix belongs in the shell, driven by the VisualViewport API (the only
mechanism iOS Safari supports: `interactive-widget` and `env(keyboard-inset-height)` are Chromium-
only). The composers' `bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0` offset
exists *only* to clear that bar, so it must collapse in the same moment.

**Verification warning:** an emulated 390px viewport does **not** reproduce the iOS keyboard. Build
it correctly, then say plainly in the report that only Roli's phone can confirm it.

**Deviations:**
- **One DOM flag drives everything, not a React context.** `ui/shell/keyboardOpen.ts` publishes a
  single answer as `<html data-keyboard-open>`; `styles.css` turns that into `.hide-on-keyboard`
  (the bar, the filter pill) and `--bottom-nav-clearance: 0px`. The six offsets became **two
  spacing tokens** in `tailwind.config.cjs`, which is where Q4 put this vocabulary: **`nav-clear`**
  = the clearance to leave above the bottom edge *right now* (the three composers, the error toast,
  the pill) and **`nav-h`** = the bar's height, a constant. A context would have re-rendered five
  components and let an offset trail the bar by a frame — which is the gap over the keyboard this
  task is about. The var carries the bar's full height as its own fallback, so a missing
  stylesheet, a missing flag or a missing API all land on today's behaviour.
- **"The keyboard is open" = a focused text field + scale ≈ 1 + a covered strip ≥ max(120px, 20% of
  the layout viewport).** The focus condition is the one that rules out scrolling, rotating and
  reading — a keyboard needs a caret — and it doubles as the fail-safe, because focus always ends.
  The ratio is what makes the threshold device- and orientation-independent: iOS Safari's own
  toolbars are ~115px in portrait and ~50px in landscape, an iPad's hardware-keyboard accessory bar
  ~55px, while a keyboard is 40–60% of the screen. **Measured, all four stay quiet:** a 115px
  toolbar collapse, a 200px viewport pan, a real 400px scroll and a portrait→landscape rotation all
  leave the flag unset with the caret in a field. **What it costs:** a pinch while typing brings the
  bar back (the harmless direction); an iPad's accessory bar alone never hides it; and a wheel
  picker (`date`, `time`) is not treated as a keyboard, so the bar stays under it.
- **The page's end padding deliberately does *not* collapse** (`AppShell` keeps `pb-nav-h`). It is
  the one offset of the six that is document height rather than a floating overlay, and it lives
  behind the keyboard anyway. **Measured on the guestbook at 390×844, scrolled to the end:** as
  shipped, `scrollY` 205 → 205, caret top 596 → 596, `scrollHeight` 1049 → 1049 when the keyboard
  opens; collapsing that padding too would have moved the caret **down 72px** and the scroll
  position by −72 in the same instant. That is why the tokens are a pair.
- **The filter pill hides, the error toast does not.** The pill sits in the same bottom-right corner
  as a composer's send button and filters nothing you are typing; the toast drops with the bar and
  ends up on the keyboard's top edge, where it is still readable — an error you cannot see is worse
  than a filter you cannot reach. Proven on the friendlies list, whose row editor has a real text
  field ("Game"): with it focused, pill and bar both `display: none`, the field itself does not move
  (top 597 → 597), and the page does not scroll.
- **The bar is `display: none`, not a slide-out.** It is `fixed`, so hiding it reflows nothing, and
  the keyboard's own animation already covers the moment; a transform would have left a focusable
  strip over the keys. Nothing else changed about the bar's behaviour — it still never hides on
  scroll.
- **Q4's landscape leftovers, folded in as promised:** `BottomTabBar` gained `pl-safe-l pr-safe-r`
  (background still full-bleed, the five tabs clear of the notch) and `pb-safe-b` in place of its
  hand-spelled `env()`; `ErrorToast` and `FilterPill` gained `pr-safe-r`. Measured at 844×390 with
  an asymmetric inset: notch left → the bar's box is still 0–844 while its first tab starts at 59;
  notch right → the last tab ends at 785, the toast card at 769 and the pill button at 769, all
  clear of the 59px inset.
- **Verified on an isolated stack** — backend :8003 on a copy of `backend/app.db` with a copy of
  `uploads/` and a scratch secrets file, vite :8020 — driven by Playwright at 390×844, 844×390
  (both notch sides) and 1280×800, in **blue and light**, as admin: all three composers (a live
  tournament's comments, a profile's guestbook, Ideas), the friendlies row editor, the stats and
  friendlies pills, and the error toast. Zero console errors in every run. At 1280 the flag changes
  nothing (every consumer has its own `lg:` offset and the bar is `lg:hidden`), which was measured
  with the flag forced on.
- **Proven here vs. left for the phone.** Proven: the whole chain against a **real, engine-level
  shrunken visual viewport** — Chromium's `Emulation.setPageScaleFactor` takes the visual viewport
  to 508px of an unchanged 844px layout viewport, a keyboard's exact geometry, and with the real
  scale (1.66) the code **keeps** the bar (the pinch guard) while with the scale read as 1 it hides
  it, the caret staying at 138px and the scroll at 0 throughout. Also proven: the flag→CSS→layout
  consequences on every surface, the four non-keyboard viewport changes, and the no-API fail-safe
  (bar visible, offsets at 72px). **Not proven, and only Roli's phone can:** that iOS reports the
  numbers this test expects (a shrunken `visualViewport.height` at scale 1 with `window.innerHeight`
  unchanged), and that hiding the bar actually clears the composer on a real iPhone PWA — the
  desktop engine never re-anchors fixed elements to the visual viewport, which is the symptom
  itself. Note for that test: iOS Safari ignores our `user-scalable=no`, so the pinch case is
  reachable there even though Chromium forbids it.
- **Not touched:** the app's `viewport` meta (no `interactive-widget`: Chromium-only, and the plan
  rules it out), `MobileChrome`'s top bar (iOS pins it to the visual viewport's top, where it is
  harmless), and `FilterSelect`'s anchored dropdown (it follows its trigger, not the screen edge).

## Q3 — The positions and H2H headers do not stay on top  ☑

Roli: *"scrolling stats/positions is weird. i want the player icons header to stay on top. it
somehow depends on where i scroll what it does"*.

**Cause:** `PositionsView.tsx:268,281` mark the header cells `sticky top-0`, but a sticky element
sticks inside its nearest *scrolling* ancestor, and that is the `overflow-x-auto` box at `:253`.
Setting overflow on one axis makes the box a scroll container in **both**, and it has no height
limit, so vertically it never scrolls: the header is pinned to the top of a box exactly as tall as
the grid, which is the same as not being pinned. The horizontal stickiness works, which is why one
axis behaves and the other silently does not.

**Decided with Roli (he was shown three options):** *fit the grid to the width* — scale the cells so
there is no horizontal scroll box at all, the same clamp R1 built for the matrix, and then the
header sticks to the **page** with no nested scrolling and no JS. **Write down the boundary rather
than leaving it a surprise:** cells keep a readable floor, so past a player count that no longer
fits at 390px the grid scrolls sideways again and the header stops pinning. Six players is nowhere
near it. **Both grids in the same pass** — the matrix's column headers are not sticky at all today,
and `DESIGN.md` §4 calls the two the same thing at the same size.

**Deviations:**

- **The tiles alone could not be scaled — the name column had to become elastic too.** The plan
  says "scale the cells"; measured, that is not enough. At 390px the box is 358 and the grid was
  **392** (a 128px name column plus six 40px tiles), so even tiles at a 32px floor next to a fixed
  128px column leave the grid 4px too wide at seven players. Width is now surrendered in a fixed
  order, cheapest first: the **name column** gives back everything above **104px** (a truncated
  tournament name still names its row — it keeps its `title` and is a link, and these names carry
  their number in the first characters), then the **tile** shrinks from 40 to **32** wide (never
  in height — rows are what you scroll past), then the box scrolls. At six players a phone gets
  `104 + 6×38` = **356px, no scroll box**; a desktop gets `176 + 6×40` = 440px **centred**, where
  176 untruncates every tournament name in the DB. That last part fixes a second thing nobody
  reported: the positions grid was a 392px ribbon in a 992px desktop column — the exact dead strip
  R1b removed from the matrix.
- **The boundary, written down.** Positions: **8 players at 390px** (`104 + 8×36 = 392 > 358`).
  Seven still fit (`104 + 7×36 = 356`), six are comfortable. The matrix's floor is 44, so its
  boundary is **7 players at 390px**. Past it the `overflow-x-auto` box comes back, the grid
  scrolls sideways from its first column, and **the header stops pinning** — measured: at eight
  players the header sits at **-6px** at the bottom of the grid instead of 0. To keep that state
  legible the tournament-name column is now `sticky left-0`, which it never was: it is inert while
  the grid fits (nothing scrolls it) and is what keeps the rows identifiable once it does not.
  Desktop is far from any of this: 20 players fit at full size in a 992px column.
- **The header does not pin at `top: 0`, and that is the whole judgement call.** The mobile top
  bar is `sticky top-0 z-30` **and auto-hides on scroll-down**. Pinning at 0 parks the header
  under the bar the moment you scroll back up; pinning at a fixed bar height leaves a 57px strip
  of moving rows above it for as long as the bar is away, which is most of the time you spend
  scrolling a long grid. So the header **follows the bar**: `ui/shell/useStickyTop.ts` returns the
  bar's **measured** `offsetHeight` while it is shown and 0 while it is hidden, from the same
  `useHideOnScroll` state the bar itself uses, and the sticky element carries the bar's own
  `transition-[top] duration-300 ease-out-expo` so the two move as one piece. Measured at the
  bottom of the grid: **0px** with the bar away, **57px** with it back — never behind it, never
  floating over a gap. The height is measured and not a `3.5rem` token because the bar is `h-14`
  **plus a 1px hairline plus `env(safe-area-inset-top)`** — 57 on this phone, more under a notch,
  and 0 on desktop, where `lg:hidden` makes `offsetHeight` 0 by itself. A `ResizeObserver` and a
  `resize` listener keep it true if that chrome ever changes height. The one thing it duplicates
  is `MobileChrome`'s `useHideOnScroll(72)` threshold; a drift there would only matter inside the
  first 72px of scroll, where nothing is pinned yet.
- **A pinned band has to be opaque, which cost two more fixes than the plan expected.** (1) The
  header's **`rounded-t`** left 4px notches at every top corner, and the cup-lineage SVG and the
  tiles showed through them as the rows passed behind — visible in the first render at both
  widths. The resting cell is now a rectangle and the radius moved onto the drag-over state,
  which is a surface of its own; `DESIGN.md` §4's directional-radii example moved with it.
  (2) The grid's **4px gutters** are holes in the same sense: every header cell now carries
  `marginLeft: -gap; paddingLeft: gap`, so the cells tile one unbroken band (measured: cells at
  121/163/205, width 42 — no gaps) while their content boxes stay exactly on their tracks. The
  name column got the same treatment one axis over (`height: cellH + gap`, `marginTop: -gap`,
  `paddingTop: gap`) for the scrolled-sideways case, where the lineage was visible through its
  row gaps. The tiles themselves never bleed: a grid item stays inside its track.
- **`data-no-swipe-nav` is conditional on the matrix and unconditional on the positions grid.**
  The matrix's only reason for it is the scroller, so it comes and goes with the box; the
  positions grid needs it whether or not anything scrolls, because a column **drag** is a
  horizontal pointer travel that would otherwise read as a swipe-back.
- **One helper, two grids.** `matrixCellSize` moved out of `h2hHelpers.ts` into a new
  `pages/stats/microGrid.ts` that owns the geometry of both grids over one shared `fitCell`, plus
  the `fits` predicates the two views switch their scroll box on. Its tests moved with it into
  `src/test/microGrid.test.ts` (**15 tests**, up from 6): the matrix's arithmetic unchanged, the
  positions widths, and the 8-player boundary pinned so it cannot move silently.
- **The matrix header has nothing to stick through at today's data.** Six players make a table
  ~405px tall, shorter than a 390×844 phone screen, so its new stickiness only shows when the
  player set grows or the window is short. Proven at **390×360** (six real players, pinned at 0
  and docked at 57) and at **12 / 16 players** on desktop (pinned at 0 at the bottom of a 759px
  and a 979px table). The positions grid, at 19 rows, pins on every screen.
- **Verification.** Isolated stack (backend :8004 on a copy of `backend/app.db`, vite :8022 —
  :8021 was taken by the parallel worker), Playwright at 390×844, 390×360/500, 1280×800 in blue
  and light; before/after header positions at the bottom of each grid; player counts of 2–16
  produced by rewriting the live `/stats/players` and `/stats/ratings` payloads in the browser
  (R1b's method — the component, the layout and the browser stay real). Zero console errors,
  `document.querySelectorAll("a a").length` 0, no horizontal document scroll at either width.
  **The column drag and the cup-lineage overlay were re-verified against the elastic geometry**:
  the drag reorders correctly at 390 and 1280 *including while the header is pinned*, and the
  polyline's points follow the computed `nameW`/`cellW` (they are in the `useMemo`'s deps now).
  Note for whoever tests this next: Playwright's synthetic **mouse** drag does not reorder a
  column — it does not on the pre-change code either (checked), so it is the harness, not the
  app; CDP touch events do.

## Q4 — Full-height surfaces ignore the bottom safe area  ☑

Roli, on the drawer: *"not super happy with how settings sits in the rounded bottom area on iphone.
make sure this looks nice on all devices"*.

`MobileChrome.tsx:114` gives the drawer `pt-[env(safe-area-inset-top,0px)]` and **no bottom inset**,
so its `mt-auto` footer (`:175`, `py-3`) puts Settings inside the home-indicator strip. Seven files
in the app account for the bottom inset and every one of them is pinned to the bottom of the *page*;
none of the full-height overlays do. So the same defect sits in **`Modal.tsx`'s `fullScreenOnMobile`
path** (which `ConfirmDialog`, `VoteVotersModal`, the `ClubPicker` sheet and both image croppers are
built on) and in **`ImageLightbox.tsx`**. Fix the containers, not ten call sites. Landscape deserves
the same treatment — the drawer hugs the left edge, which is where the notch goes. Where `env()`
resolves to 0 nothing moves, so this costs nothing on Android or desktop; give that footer more than
its current 12px regardless, because a bottom-most row reads as glued to the edge even with no inset.

**Deviations:**
- **The rule became vocabulary, not a spelling.** Four spacing tokens in
  `frontend/tailwind.config.cjs` — `safe-t/r/b/l` = `env(safe-area-inset-*, 0px)` — so every side has
  a name on every property Tailwind derives from `spacing`: `pt-safe-t`, `pb-safe-b`, `left-safe-l`,
  `bottom-safe-b`, and `theme(spacing.safe-b)` inside a `calc()`. The config is where `DESIGN.md` §2
  already says the vocabulary lives, and `styles.css` belonged to Q3 this wave, so no new CSS file
  was created. `MobileChrome`'s two hand-spelled `pt-[env(safe-area-inset-top,0px)]` are converted;
  the six `bottom-[calc(4.5rem+env(...))]` offsets are **not** — the 4.5rem is the bottom tab bar's
  height and Q2 is about to make that collapse with the keyboard, so rewriting them now is churn in
  the file Q2 will rewrite anyway.
- **The container owns the inset, the surface keeps its padding.** The insets are applied as
  `left/right/bottom/top` on the *positioning* box (Modal's sheet wrapper, the lightbox's pan box),
  never as padding on a box that already has some: a `padding-bottom` utility would have overridden
  the wrapper's `p-3` and made the no-inset gap **0** on Android. It also keeps the lightbox honest —
  its fit and pan limits read `clientWidth`/`clientHeight`, which padding would have inflated.
- **Landscape.** The drawer takes `pl-safe-l` (its background still reaches the screen edge — only
  the content clears the notch) and `Modal` takes `left-safe-l right-safe-r` (+ `sm:top-safe-t`).
  Verified with an **asymmetric** inset (left 59, right 0) so left and right are proven separately.
- **Footer air: `py-3` → `pt-3 pb-4`.** 16px is the next step on the scale and the asymmetry is the
  point — the hairline above still reads at 12px, a bottom-most row needs more under it than over it.
  With no inset at all this is the *only* pixel that changes anywhere: Settings 12px → 16px.
- **The lightbox takes the inset, not its chrome** — it has no chrome (a tap anywhere closes it), so
  "move only the controls" was not an option. The scrim stays full-bleed black; the pan/zoom box *is*
  the safe area, so the photo never sits under the notch or the home indicator.
- **Found while measuring, fixed here (1): an overlay inside a page column is 12px short.**
  `.page > :not([hidden]) ~ :not([hidden])` gives every non-first child a 12px top margin, and a
  `fixed inset-0` box honours it — both overlay roots measured 12..844 on an 844px screen, so the
  scrim missed the top 12px. `mt-0` cannot beat that selector and the codebase has no `!`-utility
  idiom, so `Modal` and `ImageLightbox` carry `style={{ margin: 0 }}`. Now 0..844.
- **Found while measuring, fixed here (2): a sheet taller than the screen hid its own buttons.**
  At 844x390 the avatar editor's Save/Delete row sat **99px below the viewport** with no way to
  scroll to it (pre-existing, and the insets make the box shorter still). A non-`scrollBody` card is
  now clamped to `max-h-sheet` (`100dvh` minus both insets and the wrapper's gutters) and scrolls
  itself; `scrollBody` consumers are untouched, they bring their own max-height. After: that row is
  at 328px of 390 and reachable. Portrait never hit the clamp.
- **Surfaces checked: all seven `Modal` consumers, driven and measured** — `ConfirmDialog`,
  `VoteVotersModal`, `ClubPicker`, `CommentImageCropper`, `PlayerAvatarEditor`, `ImageLightbox`, and
  `H2HView`'s "Match history" sheet (H2H → Duos → 2v2 → a team-rivalry row; its file belongs to Q3
  this wave, so it was opened through the UI and never edited). The last one moves like the rest:
  card 12 → 46px off the bottom in portrait, 24 → 83px off the left in landscape, and identical
  before/after with no inset.
- **Not touched, reported instead:** `BottomTabBar` (Q2's file next wave), `ErrorToast` and
  `StatsFilterPill` are `fixed` as well and take no left/right inset, so in landscape their content
  can sit under a notch. One token each when their owners get to them.
- **Verification:** an isolated stack (backend :8003 on a copy of `backend/app.db` **and** a copy of
  `uploads/`, vite :8020) driven by Playwright with **real `env()` values** — Chromium 151's CDP
  `Emulation.setSafeAreaInsetsOverride`, portrait 59/0/34/0, landscape 0/0/21/59 and 0/0/0/0 — at
  390x844, 844x390 and 1280x800 in blue and light, before/after per surface. Zero console errors.
  **Simulated, not real:** no iPhone was involved. The engine resolves `env()` for real, but it draws
  no notch and no home indicator, so how the strip *looks* is still Roli's to confirm on his phone.

## Q5 — Re-assign is permanently blocked by leftover goals and clubs  ☑

Roli: *"all games are scheduled but i cant re-assigne the 2v2 schedule as some results were stored
before"*. Measured on his dev DB: tournament 21 "test 2v2", 5 matches, **all scheduled, no
timestamps**, but **4 sides carry goals and 4 carry a club**.

`routers/tournaments.py:933-945` requires four things, not one: scheduled, no timestamps, every side
on 0 goals, every side with no club. Resetting a match puts it back to scheduled but leaves the
goals and the club behind, so the schedule is frozen for good and the only way out is deleting the
tournament. The refusal message says results were stored, which is true and useless: it names
neither how many matches nor that a club counts as "touched" exactly as much as a goal.

**Decided with Roli:**
- **Reset** (one match): keeps its single confirmation, clears the score **and the timestamps**,
  **keeps the club** (a club is a setup choice, not a result, and a replay is usually the same
  fixture with the same teams), and **keeps its comments** — same match row, same two teams, so they
  still describe the fixture they are filed under.
- **Re-assign** (whole tournament): **one confirmation**, then clears score, timestamps **and
  clubs** on every match, and **never refuses**. Today it refuses, and escaping the dead end by hand
  means five reset confirmations that still leave you blocked by the clubs.
- **Comments on re-assign: delete the match-tied ones, keep the tournament-wide ones.** Not a
  preference — **`_delete_schedule` destroys the match rows and builds new ones**, so every match id
  changes, `Comment.match_id` is left pointing at a dead id, there is no FK enforcement (A9.5) and
  `match.id` has **no AUTOINCREMENT**, so a stale comment can silently reattach itself to an
  unrelated future match. Same shape as the orphaned club crest A9 found. (Checked: the dev DB has
  **0** dangling comments today.)
- The confirmation **names the count** — "this deletes 7 comments" before you agree, not after.

**DoD for all five:** the usual gates (`npm run check` + build; `make test`/`lint`/`gen-types` if
the backend moves), 390px and 1280px in blue and light, zero console errors — plus, for Q2, an
explicit statement that the keyboard behaviour could not be proven off-device.

**Deviations:**
- **Re-assign still refuses one thing: a match that is not `scheduled`.** "Never refuses" was
  settled about *leftovers*; a playing or finished match is a real result, and rebuilding the
  schedule would throw a played evening away. Everything the plan names as a leftover — goals,
  clubs, timestamps — is cleared instead of refused. **Roli should say if he wants that last
  refusal gone too**; it is one `conflict()` call in `reassign_2v2`.
- **The comment cleanup went into the chokepoint, not into re-assign.** `_bulk_delete_matches`
  (`routers/tournaments.py`) is the only place that deletes `Match` rows, so it now also deletes
  the comments filed under them. Re-`POST /generate` and disabling the second leg destroy match
  ids exactly the same way and were leaving the same dangling rows behind; they are fixed by
  construction rather than one-by-one. Only re-assign asks first — the other two already destroy
  the matches those comments describe without a dialog. Proven on the verify DB: after a rebuild
  SQLite handed the **same ids (114–118) back out**, which is the hazard, not a theory.
- **Deleting a tournament now deletes its comments too** (all of them, plus the pin row). They
  were orphaned before, with `tournament.id` reusable in the same way — and the delete dialog
  already promised "everything recorded in it".
- **New endpoint `GET /tournaments/{id}/reassign-preview`** (editor+, `ReassignPreviewOut`:
  `matches`, `matches_with_score`, `matches_with_club`, `comments`). The confirmation names counts
  the backend computed; the frontend does not re-derive which comments a rebuild takes, the same
  split as A10's `can_edit` flags. `make gen-types` ran in the same commit.
- **The reset invariant is "a patch that says `scheduled` clears the score", not "a scheduled
  match can never carry goals".** The wider rule broke two existing tests that rely on
  goals-on-a-scheduled-match as "touched" (`_leg2_started` blocks removing a second leg on it),
  and that concept is deliberate. The narrow rule still covers every reset path, including the
  match page's status switch, which sends the state alone.
- The match page's `Scheduled` segment therefore clears the score on save with no dialog of its
  own. Its goal steppers are already disabled at `Scheduled`, so the state says as much.
- `DELETE /comments/{id}` now unlinks image files **after** its commit (rows first), so a failed
  transaction cannot leave a hole where a file was. Same cascade, shared in
  `services/comment_cleanup.py`.

---

## Q6 — Back, forward and the gestures: one model, applied everywhere  ☑

Roli (2026-09-15): *"a worker that reevaluates the back/forth sweeps and back buttons and where or
if they are shown on screen (consistency!). it should feel more natural. think hard about what a
user expects in each scenario. it's super important that it feels natural and makes sense
everywhere."*

**Sequencing — RESOLVED 2026-09-16, and the answer was "no".** The trail arrived (see Q10): the
crash is a React Fast Refresh artifact in `AuthContext.tsx`, development-only, with an **empty**
navigation trail — it fires during the first render after a hot update, before any navigation
happens. **The loop hypothesis is dead for that incident, and Q6 is no longer gated.** It now stands
entirely on the consistency findings below, which is where its value always was. The original
gating note follows, kept because the reasoning was right even though the answer was not the one
expected.

**Sequencing (historical).** Do not start this before the crash diagnostics have produced a trail
from Roli's phone. The open crash — unresponsive, then the whole tree unmounted above the error
boundary — has this layer as its prime suspect, and the trail will say whether a burst of POPs was
involved. If it was, that finding belongs *in* this task. If it was not, this task stays what it is:
a consistency pass. Refactoring first would destroy the evidence and risk fixing the wrong thing.

### What is there today (surveyed 2026-09-15, not guesses)

Seven files, 857 lines, all of it running on every navigation: `useSwipeNav.ts` (129),
`backNavigation.ts` (195), `navStack.ts` (178), `routeMeta.ts` (26), `useScrollRestoration.ts`
(149), `lastLocation.ts` (128), `useDestinationLinks.ts` (52). It mirrors the browser's history into
`sessionStorage`, keyed by the `history.state.idx` counter the browser owns, and decides pop-vs-up by
comparing the two. It has already needed four rounds of repair: N1 (back went to the last page
instead of up), T11 (leaving the matchup), A9.6 (three seams, one of which could not be triggered
from any path the app offers and was closed as latent), A9.7 (a restore fighting a save-and-return).

**There are two different sources of truth for "is this a detail page", and they agree only by
coincidence:**
- **Mobile** (`MobileChrome.tsx:70`): the top bar shows a back chevron **iff**
  `routeMeta(pathname).isDetail`, and `routeMeta.ts` is a hard-coded list of exactly three patterns —
  `/live/:id/match/:mid`, `/live/:id`, `/profiles/:id`. Everything else gets the hamburger.
- **Desktop** (`ui/layout/PageLayout.tsx`, prop `back`): **each page decides for itself**. Three
  pass `<InlineBack />`: `ProfilePage.tsx:276` (conditionally, on `isDetailRoute`),
  `LiveTournamentPage.tsx:586` and `MatchDetailPage.tsx:318` (both unconditionally).

### The inconsistencies that follow (each verified in the code)

1. **A pushed view with no back affordance.** The stats matchup (`?vs=`) is a deliberate history
   **push** (T11), and the swipe does return from it (`resolveDrillInBackAction`). But it lives at
   `/stats`, so `routeMeta` says `isDetail: false` and **the mobile top bar shows a hamburger**. The
   only visible way back is an in-view "Head-to-head" button inside the content. A gesture and a
   button that do the same thing, one of which is invisible in the chrome.
2. **The chevron *replaces* the hamburger.** On any detail page a phone user cannot reach the menu
   at all without going back first. That is a decision nobody wrote down; re-examine it.
3. **A forward gesture with no visible counterpart.** Swipe-left calls `nav(1)` whenever
   `canGoForward()` (`backNavigation.ts:175`, `useSwipeNav.ts:110`). Nothing anywhere indicates that
   forward exists, or that it is available right now. **Roli has explicitly delegated this one**
   (asked directly, 2026-09-15): keep it and make it visible, or drop it so back is the only gesture
   the way iOS itself works — argue it in the scenario table and let him rule on the proposal.
4. **Where a button falls back, the gesture does nothing** (documented at `useSwipeNav.ts:13`). The
   reasoning is sound in isolation, but it means the same intent produces two different outcomes
   depending on how it was expressed.
5. **Ideas, Clubs and Settings** are destinations reachable only from the drawer/sidebar. Decide
   what back means on them — today it is the hamburger and a history pop that may leave the app.

### Decided with Roli, from rendered options (2026-09-16) — do not relitigate

1. **A back affordance appears whenever you moved to get here** — not on a list of route patterns.
   A matchup, a match, a profile and a tournament all show it, because to the reader they are the
   same thing: somewhere you went into. This kills `routeMeta`'s three hard-coded patterns *and* the
   per-page `back` prop as sources of truth; the question becomes "did you go somewhere", asked once.
2. **The menu stays reachable.** Back and menu are both present on a page you drilled into; back
   stops replacing the hamburger. Two controls, always the same two.
3. **Back always means one level up**, identically whether you walked in, followed a deep link or
   opened a push notification. Match → tournament → list → dashboard. It never ejects you from the
   app, and it never depends on how you arrived.
4. **The bottom bar's second tap resets.** First tap returns to the remembered page inside that
   destination (U6), a second tap while already there goes to its root — the only escape from a
   remembered page you no longer want.

**What (3) means for the machinery, and the thing to think hardest about.** The nav-stack mirror
(`navStack.ts`) exists to answer one question: *is the entry behind me the parent, so I can pop
instead of navigating up?* Roli has now fixed the **destination** in every case — it is always the
parent — so the mirror is no longer needed to decide *where* back goes, only whether the cheaper
mechanism is available. Popping restores that page's scroll and state; navigating up pushes a new
entry and grows history forever. So: does the mirror still earn its keep as a pure optimisation, or
can scroll restoration key off the location instead and let the mirror go? Answer it explicitly —
that mirror is the thing that has produced four rounds of bugs, and (3) is the first constraint that
makes removing it conceivable.

### What the worker must produce, in this order

1. **A table of every scenario before touching code**: for each route and each entry path into it
   (nav bar, deep link, notification, in-page drill-in, browser reload), what the chevron shows,
   what the swipe does, what the browser's own back does, and **what a user would expect**. Roli's
   instruction is to think hard about the expectation, so the expectation column is the deliverable,
   not an afterthought.
2. **One model, written down in `DESIGN.md`**, that the chevron, the swipe, the desktop button and
   the browser button all read from. **One source of truth** — `routeMeta`'s three hard-coded
   patterns and the per-page `back` prop cannot both survive. A pushed in-page view (the matchup) is
   a first-class case, not an exception bolted on.
3. **Then** the implementation, with the seam count going **down**. If the answer is that the
   history mirror should go away entirely, say so and argue it: a mirror that can disagree with the
   real history is what has produced four rounds of bugs and is the standing crash suspect.

**Constraints.** Native feel on iOS matters more than cleverness: the system edge-swipe exists and
must not be fought. `data-no-swipe-nav` opt-outs and the horizontal-scroller guards must keep
working (the positions grid, the matrix, chip rows, sliders). Scroll restoration is coupled to this
layer and must not regress — N2's per-entry offsets and A9.7's save-and-return both live here.

**DoD:** the scenario table in the plan; the model in `DESIGN.md`; chevron, swipe, desktop button
and browser back provably agreeing on every row of that table; the existing nav tests still green
plus new ones per row; 390px and 1280px, blue and light; and an explicit list of anything that
**cannot** be verified off-device, for Roli to check on the phone.

### The model (written 2026-09-16, before any code change)

Roli's four answers fix the *rules*; the table below is where they meet every route the app has.
Two things fall out of it that the answers did not spell out, and both are argued in the rows they
come from: **what back means between two top-level destinations** (there is no "up" between
siblings, so it is the history step you took) and **what a page with no hierarchy above it does**
(the 404, `/login`: the same).

**One hierarchy, asked once.** Every location answers two questions, in `ui/shell/routeHierarchy.ts`:

```
placeOf(pathname, search, state) → { parent: string | null, inside: boolean }
```

| Place | `parent` | `inside` |
|---|---|---|
| `/dashboard` | `null` — the app's home | false |
| `/tournaments` `/friendlies` `/stats` `/players` `/clubs` `/ideas` `/settings` | `/dashboard` | false |
| `/login`, any unknown URL (404) | `/dashboard` | false |
| `/live/:id` | `/tournaments` | **true** |
| `/live/:id/match/:mid` | `/live/:id` + `?tab=` from `state.fromTab` | **true** |
| `/profiles/:id`, `/profile` | `/players` | **true** |
| `/stats?view=h2h…&vs=…` (the matchup) | the same URL without `vs`/`rel`, team collapsed | **true** |

- **`inside: true` means "you went into this".** It is the *only* thing that decides whether a back
  affordance is drawn — `routeMeta`'s three hard-coded patterns and `PageLayout`'s per-page `back`
  prop are both gone, and the matchup joins the set for free because it is declared here like
  everything else.
- **`parent` is where back goes**, and it never depends on how you arrived.

**One back, four affordances.** The mobile chevron, the desktop chevron in the title row, the
swipe and (wherever the history allows it) the browser's own button all read one function:

```
back = inside ? (previous entry IS the parent ? pop : go to parent)
              : (something behind ? pop : parent ? go to parent : nothing)
```

- **Pop when the entry behind us already is the parent.** It is free and it is better: the parent
  comes back with its scroll offset (N2), its open tab and its data.
- **Otherwise go to the parent, with `replace`.** Going up *consumes* the page you are leaving, the
  way popping a native stack does. Three consequences, all wanted: walking up a deep link never
  grows history, the ladder terminates instead of ping-ponging (`/settings` → home → `/settings`),
  and nothing can be "swiped forward" back into a page you deliberately left.
- **Between destinations there is no up**, so back is the history step you took to get here — what
  the browser, iOS and Android all do with siblings. With nothing behind it (a cold deep link) it
  goes home, which is Roli's "list → dashboard" rung and his "it never ejects you from the app".
- **No chevron on a destination.** A chevron there would read "the screen before" and mean "the
  dashboard"; the bar that is always on screen already holds every sibling, and no phone app puts
  back on a tab root. The gesture still works there, because a gesture promises nothing.
- **The menu stays.** On an `inside` page the top bar is `‹` · `☰` · title. Back takes the edge
  (that is where the thumb starts the same gesture); the menu keeps its icon and its drawer.

**The forward gesture is gone** (Roli delegated this one). Argued at row 31.

**The history mirror stays, halved.** Argued after the table.

### The scenario table — every route × every way in

Verified in a real browser on the isolated stack (backend :8003 on a copy of `app.db`, vite :8020),
390×844 with touch emulation and 1280×900, blue and light. "Swipe →" is a right swipe (back);
"Browser ←" is the browser's own back button. A **deep link** means the URL was loaded cold.

| # | Where you are · how you got there | What the reader expects, and why | Chevron | Swipe → | Browser ← | ✓ |
|---|---|---|---|---|---|---|
| 1 | `/dashboard` · cold load | Home. Nothing above it, and back must not leave the app on its own. | – | nothing | leaves the app (the browser's history, not ours) | ✓ |
| 2 | `/dashboard` · Dashboard tab from `/stats` | The screen I came from. | – | `/stats` (pop) | `/stats` | ✓ |
| 3 | `/tournaments` · Tournaments tab from `/dashboard` | The dashboard — it is both what I came from and what is above. | – | `/dashboard` (pop) | `/dashboard` | ✓ |
| 4 | `/tournaments` · second tap on Tournaments while on `/live/21` | The list itself: the second tap is the only escape from a remembered page (U6, decision 4). | – | `/live/21` (pop) | `/live/21` | ✓ |
| 5 | `/tournaments` · cold deep link | Home. Not out of the app. | – | `/dashboard` (up, replace) | leaves the app | ✓ |
| 6 | `/stats` · Stats tab from `/players` | Players. Between siblings there is no up. | – | `/players` (pop) | `/players` | ✓ |
| 7 | `/stats?view=h2h&sub=duos` · section + sub chips | Nothing: chips are `replace`, they are not history steps (T11). Back leaves `/stats` for the page before it. | – | the page before `/stats` | same | ✓ |
| 8 | `/friendlies` · drawer | The page I came from. | – | pop | pop | ✓ |
| 9 | `/clubs` · drawer (editor) | The page I came from. Clubs is a destination, not a detail page — the drawer is how you leave it. | – | pop | pop | ✓ |
| 10 | `/ideas` · push notification `?idea=<id>`, cold | Home; the one-shot param is never replayed (`lastLocation`). | – | `/dashboard` (up) | leaves the app | ✓ |
| 11 | `/settings` · drawer footer | The page I came from. | – | pop | pop | ✓ |
| 12 | `/live/:id` · tapped in the `/tournaments` list | The list, at the row I tapped. | `‹` + `☰` | `/tournaments` at its offset (pop) | same | ✓ |
| 13 | `/live/:id` · Tournaments tab's live shortcut, from `/stats` | The tournaments list — I asked for Tournaments, not for Stats (N1). | `‹` + `☰` | `/tournaments` (up) | `/stats` (the browser's trail) | ✓ |
| 14 | `/live/:id` · push notification / cold deep link | The tournaments list. Never out of the app. | `‹` + `☰` | `/tournaments` (up) | leaves the app | ✓ |
| 15 | `/live/:id` · reload while there | Exactly what it did before the reload — sessionStorage keeps the mirror. | `‹` + `☰` | as its row above | as its row above | ✓ |
| 16 | `/live/:id/match/:mid` · row in the tournament's Matches tab | The matches list, where I left it, on the tab I opened it from. | `‹` + `☰` | `/live/:id?tab=matches` at its offset (pop) | same | ✓ |
| 17 | `/live/:id/match/:mid` · Stats → Records row | Its tournament. Not the stats page I came from (N1's rule, now for every arrival). | `‹` + `☰` | `/live/:id?tab=matches` (up) | `/stats…` | ✓ |
| 18 | `/live/:id/match/:mid` · cold deep link | Its tournament. | `‹` + `☰` | `/live/:id` (up) | leaves the app | ✓ |
| 19 | `/live/:id/match/:mid` · Save and return (A9.7) | The Matches tab scrolled to the row I just edited, flashing. Not back, not the top. | – (page action) | n/a | n/a | ✓ |
| 20 | `/profiles/:id` · row on `/players` | The players list. | `‹` + `☰` | `/players` (pop) | same | ✓ |
| 21 | `/profiles/:id` · a `PlayerLink` inside a tournament's standings | The players page. One meaning per control, however I arrived. | `‹` + `☰` | `/players` (up) | the tournament | ✓ |
| 22 | `/profiles/:id` · guestbook push, cold (`?tab=guestbook&entry=`) | The players page. | `‹` + `☰` | `/players` (up) | leaves the app | ✓ |
| 23 | `/profile` (own) · Settings → My profile | The players page — the same page as row 20, so the same chrome. Today it shows a hamburger and no back, which is the two-sources-of-truth bug in one screenshot. | `‹` + `☰` | `/players` (up) | `/settings` | ✓ |
| 24 | matchup · H2H matrix cell | The matrix, exactly as I left it. | `‹` + `☰` | the H2H list at its offset (pop) | same | ✓ |
| 25 | matchup · "All matches: A vs B" on a match page | The H2H list it drills into. **Changed from T11** — see the note below the table. | `‹` + `☰` | the H2H list (up, in place) | the match page | ✓ |
| 26 | matchup · rival link on a profile | The H2H list. | `‹` + `☰` | the H2H list (up) | the profile | ✓ |
| 27 | matchup · cold deep link `?view=h2h&player=1&vs=2` | The H2H list — the thing it is a drill-in of. | `‹` + `☰` | the H2H list (up) | leaves the app | ✓ |
| 28 | matchup · another section tab tapped from inside it | Nothing to undo: leaving the section consumes the drill-in's entry (`replace`, T11). | – | the entry behind the matchup | same | ✓ |
| 29 | 404 (`/nope`) · a stale in-app link | Where I was. There is no hierarchy above an unknown URL, and the body already offers "Back to dashboard". | – | pop | pop | ✓ |
| 30 | 404 · cold | Home. | – | `/dashboard` (up) | leaves the app | ✓ |
| 31 | any page · swipe **left** | **Nothing, anywhere.** Argued below. | – | – | – | ✓ |
| 32 | any page · swipe → starting on a horizontal scroller or a slider | Nothing: the element scrolls. Positions grid, H2H matrix, chip rows, `SectionTabs`, trends chart, range inputs, `data-no-swipe-nav`. | – | – | – | ✓ |
| 33 | iOS standalone PWA · system edge swipe | The OS gesture, untouched. Our listener is passive and never calls `preventDefault`. | – | – | – | code |

**Row 25, the one decision that overrules an earlier one.** T11 (2026-09-13) asked for the opposite:
"if i get there from eg match details, i want swipe back to go to match details again." Q6's answer
3 — back is one level up, identically however you arrived — cannot hold *and* keep that exception,
and Q6's own DoD says the matchup must be "a first-class case, not an exception bolted on". So the
matchup now behaves like every other page you went into. What T11 wanted is still one tap away and
is now the *browser's* job on desktop (its back button pops to the match page, row 25) and the
**Tournaments tab's** job on a phone: `lastLocation` remembers the match page as that destination's
last page, so tapping Tournaments returns to it. Flagged here because it is a visible change to a
screen Roli asked about by name.

**Row 31 — the forward gesture is removed, not made visible.**
- Nothing in the OS this app imitates has one. iOS has no forward gesture inside an app; Android has
  none; a standalone PWA has no browser chrome to borrow one from. The gesture exists today only
  because `nav(1)` was easy to write next to `nav(-1)`.
- Making it visible would mean a forward chevron in the top bar — browser chrome inside an app,
  permanently occupying a slot to offer a step that is available a minority of the time.
- Under this model it is nearly always dead anyway: going up *replaces*, so there is no forward
  entry to take.
- It costs what an invisible gesture always costs. Every left-drag in the app is a candidate
  navigation, guarded only by opt-outs someone has to remember (`data-no-swipe-nav`); dropping it
  halves that surface at a stroke.
- And it is the only reason the history mirror ever had to reason about the future. Deleting it
  deletes `canGoForward`, `highestHistoryIndex`, the PUSH-truncation rule, the first-record-of-a-load
  rule (A9.6's duplicated-tab seam) and the `NavKind` plumbing through `useRememberLocation` — the
  single largest seam reduction available in this layer.

**The history mirror (`navStack.ts`): kept, halved — and here is the argument.**
Roli's answer 3 demotes it from decision-maker to optimisation, and that is exactly the right level
for it, so it does not all go. Split it in two and the two halves have opposite risk profiles.

- **The half that claims to know the future** — `canGoForward()`, `highestHistoryIndex()`, truncate-on-PUSH,
  truncate-on-first-record — can be *wrong in a way that is visible*: it promised a forward step the
  browser could not take, and a gesture that asks for it burns silently (A9.6). Every line of it
  exists for swipe-left. **Deleted with the gesture.**
- **The half that remembers the past** — `previousEntryPath()`, one string at `idx-1` — is the one
  question the browser refuses to answer and sessionStorage answers truthfully for the tab that wrote
  it. And it is *fail-degraded by construction*: if it is missing or stale, back does not misroute —
  it navigates up to the same page it would have popped to, and the only loss is the parent's scroll
  offset and open tab. **That property is what makes it safe to keep**, and it is the reason removing
  it entirely is the wrong trade: the alternative is to always navigate up, which throws away N2's
  restoration on the single most common back in the app (a match row 700 px down its list).
- The scroll half (`saveScroll`/`scrollFor`, N2) is not a mirror of the URL stack at all — it is
  `idx → offset` — and has to stay whatever happens to the rest.

Net (measured after implementing): `navStack.ts` 178 → 156 lines, 104 → 90 excluding comments, and
the module no longer has an opinion about anything but the entry behind the current one.


**Deviations:** (implemented 2026-09-16 on `feature/2026-09-audit`; the scenario table above was
written first and every row of it was then verified in a browser)

**What the four answers did not settle, and what I decided.**

1. **Back on a top-level destination.** Answer 3's ladder ends "list → dashboard", and answer 1 says
   the affordance appears "whenever you moved to get here" — read literally together, every page but
   the dashboard would carry a chevron meaning "go to the dashboard". That is wrong for the reader:
   a chevron is read as *the screen before*, and on `/stats` reached from `/players` it would point
   somewhere else entirely; no phone app puts back on a tab root. So: **the ladder is implemented in
   full, the chevron is not drawn on a destination.** Back there is the history step you took, and
   only when there is nothing behind it does it go home — which is precisely the rung answer 3 was
   protecting, "it never ejects you from the app", now reachable by the gesture and the browser
   button rather than by a chevron that would lie the rest of the time.
2. **Going up is a `replace`, not a push.** Not in the answers at all, and it matters: with a push,
   walking up out of a deep link grows history forever and "home" could be swiped straight back into
   the page you just left (`/settings` → home → `/settings` → …). Replacing consumes the page being
   left, the way popping a native stack does. Verified: a cold `/live/19/match/104` walks
   match → tournament → list → home and stays at `history.state.idx === 0` the whole way, and a
   further swipe at home does nothing.
3. **Row 25 overrules T11.** Coming out of the matchup now opens the H2H list even when a match page
   is behind it. Argued under the table; it is the price of answer 3, and it is flagged because Roli
   asked for the opposite by name three days earlier. The match page is one tap away on the
   Tournaments tab, and on the desktop the browser's own back button still returns to it (verified).
4. **The matchup lost its in-view "← Head-to-head" button.** With the chevron finally in the chrome
   (inconsistency 1), that button was a second back arrow 100px under the first. One back per screen,
   in the same place on every page. The label it carried is the only thing lost; the section tabs
   above still say H2H.
5. **The desktop chevron needed a home of its own.** It lives in `PageLayout`'s title row, and a page
   that returns early — still loading, "Login to open your profile", "Match not found" — used to
   render a bare `<div className="page">` with no row at all. On the desktop there is no top bar, so
   those screens had *no way back*. Found by the desktop verification run (row 23 failed on
   `/profile` as a reader). Fixed once, generally: the row now renders for the chevron alone when
   there is no title, and the five bare `.page` early returns plus `App`'s lazy-route fallback go
   through `PageLayout`.

**What was built.**

- **`ui/shell/routeHierarchy.ts` (new) replaces `routeMeta.ts`.** `placeOf(pathname, search, state)`
  → `{ parent, inside, drillParam?, sameParams? }`. It is the *only* place that knows the shape of
  the app. `parentOf()` is the convenience wrapper. `historyCanPop()` moved to `navStack.canPop()`,
  where the history index already lived.
- **`backNavigation.ts`: three decision functions became one.** `resolveBackAction` is all that is
  left — `resolveDrillInBackAction`/`drillInBackActionFor` are gone (the matchup is an ordinary
  parent relationship now), `swipeAction` is gone (the gesture calls `backActionFor` directly), and
  the `fallback` argument that made the button and the gesture differ is gone with them: there is no
  argument left for them to differ on. `useContextualBack()` → `useBack()`, returning `{ hasBack,
  goBack }`.
- **`navStack.ts` lost its future half.** `canGoForward`, `highestHistoryIndex`, `NavKind`, the
  truncate-on-PUSH rule and A9.6's truncate-on-first-record rule are all deleted with the forward
  gesture. `recordNavigation(pathname, search)` no longer takes a kind. What remains answers
  `idx - 1` and keeps the per-entry scroll offsets. `NavKind` moved to `diagnostics/breadcrumbs.ts`,
  which is the only thing that still cares how a navigation arrived.
- **`useSwipeNav.ts`**: right only. A left drag deactivates the gesture without spending the
  debounce. `consumesSwipe` lost its direction parameter with it. Every guard is untouched.
- **`MobileChrome.tsx`**: `‹` then `☰`, both present on an `inside` page, `☰` alone otherwise.
- **`PageLayout.tsx`**: no `back` prop; the row asks `useBack()` and renders for the chevron alone
  when a page has no title. `LiveTournamentPage`, `MatchDetailPage` and `ProfilePage` stopped
  passing `<InlineBack />` (and `ProfilePage` stopped computing its own "is this a detail route").
- **`statsNav.ts` gained `statsMatchupParent(search)`** — the matchup's parent URL, built by the
  module that owns the stats URL scheme, so the hierarchy does not learn a second copy of it. The
  shell imports it; nothing imports the shell from `pages`, so there is no cycle.
- **`StatsInsights.tsx`** no longer decides anything about back. It keeps one effect: when the
  matchup closes *in place* (a REPLACE on the same entry), the H2H list is restored to the offset it
  was left at. A pop deliberately does not reach it — `useScrollRestoration` owns that entry's own
  offset, and two restores racing each other is what T11 and A9.7 had to untangle.

**Seams.** The seven files go 857 → 834 lines, and **518 → 482** once comments and blanks are taken
out — 36 fewer lines of code and rather more explanation of the lines that are left. The numbers that
matter are not lines: **decision functions 3 → 1** (`resolveBackAction`; `resolveDrillInBackAction`
and `swipeAction` are gone), **sources of truth for "is this a page you went into" 2 → 1**
(`routeMeta`'s pattern list and `PageLayout`'s per-page prop both replaced by one question),
**exported entry points into the decision 10 → 7**, and the entire class of "the mirror disagrees
with the real history about what is *in front* of us" — four rounds of bugs' worth — deleted rather
than fixed again.

**Tests — three files replaced, four written, and why.** The old nav tests pinned the *old* model, so
they could not simply stay: `routeMeta.test.ts` tested the three hard-coded patterns that no longer
exist, and `contextualBack.test.tsx` tested `useContextualBack`/`resolveBackTarget`, both renamed and
re-shaped. `swipeAction`'s and `resolveDrillInBackAction`'s cases went with their functions. Every
behaviour they pinned is still pinned, by a test that names the table row it belongs to:

- `test/routeHierarchy.test.ts` (new, 10 cases) — `placeOf` for every route, both `inside` pages and
  destinations, including `/profile` vs `/profiles/:id` (the bug), the team collapse, and `?vs=`
  outside the H2H section.
- `test/backNavigation.test.ts` (new, 14 cases) — `resolveBackAction` per table row, and
  `backActionFor` against a live `navStack`, including "a mirror that lost its entry degrades to
  'up', never to a wrong page".
- `test/useBack.test.tsx` (new, 7 cases, replaces `contextualBack.test.tsx`) — where the affordance
  is drawn (five `inside` pages, six destinations) and what it does against a real router, pinning
  that up is a **REPLACE**.
- `test/mobileChrome.test.tsx` (new, 3 cases) — back and menu together on an `inside` page, menu
  alone on a destination, and back before the menu in the DOM order.
- `test/swipeNav.test.ts` (rewritten) — the gesture's rows, plus "the module exports nothing that
  claims to know what is in front of us" and the mirror's past-only behaviour.
- `test/matchupBack.test.tsx` (rewritten) — kept only what is still true: opening the matchup pushes,
  clearing it does not.
- `test/pageRhythm.test.tsx` — the `back` prop cases became "the row renders the chevron from the
  hierarchy" and "the row survives for the chevron alone while a page is still loading".
- `test/matchupView.test.tsx` — the "offers the way back" case became "carries no back control of
  its own".

**Verification** (isolated stack: backend :8003 on a copy of `app.db` with a scratch secrets file,
vite :8020; neither of Roli's ports touched; both stopped and the copies deleted afterwards).

- **Mobile 390×844, real touch events via CDP `Input.dispatchTouchEvent`: 53/53 checks green.**
  Every row of the table, one browser context per scenario so no per-destination memory leaks
  between them.
- **Desktop 1280×900 (the chevron instead of the gesture): 37/37 checks green.**
- **Extra entry paths (rows 13, 22, 26): 6/6 green on each width** — the Tournaments tab's
  live shortcut on the phone and the sidebar's own "Live now" entry on the desktop, a cold guestbook
  push link (`/profiles/4?tab=guestbook&entry=1`), and the matchup opened from a profile's rival card.
- **Row 19 (A9.7 save and return): 3/3 green**, logged in as an admin against the DB copy — the
  edit page was at y=277, "Save and return" landed on `/live/19?tab=matches` **at y=331**, not at the
  top, and back from there still goes up to the list.
- Chrome sweep at 390 and 1280 in **blue and light**: back + menu on `/live/19`,
  `/live/19/match/104`, the matchup and `/profiles/2`; menu alone on `/stats`; no horizontal
  overflow, no nested `<a>` (`document.querySelectorAll("a a").length === 0`), zero console or page
  errors on any of the twenty page loads.
- `cd frontend && npm run check`: typecheck, eslint and **608 tests in 61 files** green (59 files
  before: two deleted, four written). `npm run build` green in 8.4s, with the pre-existing
  "chunks larger than 500 kB" hint (705 kB `index-*.js`; the Round-6 close recorded ≈669 kB and
  Rounds 7–8 have added since). The one new eager import is `statsNav.ts`, whose only imports are
  erased types — `StatsPage` is still its own 77 kB lazy chunk.

**Could not be verified off-device — for Roli to check on the phone:**

1. **The iOS system edge-swipe.** Chromium on the Pi has no OS-level edge gesture, so "our listener
   does not fight it" is argued from the code (all four listeners are `{ passive: true }` and nothing
   calls `preventDefault`) and not measured. Worth one deliberate edge-swipe from the very left edge
   on a match page: it should do the *system* thing, and our own swipe from further in should go up.
2. **The installed PWA's cold launch.** `useLocationRestore` only runs in `display-mode: standalone`;
   a launch that resumes at, say, a match page should show the chevron and back should go to the
   tournament (it is row 18 by construction, but the restore path itself is device-only).
3. **A real push notification tap** while the app is backgrounded. The service worker calls
   `client.navigate()`, which starts a *new document* — so `history.state.idx` is 0 and back goes up,
   the same as row 14/18. Verified by simulating the URL cold; the actual notification tap is not
   reproducible headless.
4. **Thumb ergonomics of two buttons in the top-left.** The chevron sits at the edge and the
   hamburger beside it; on a 390px screenshot they read clearly, but whether the menu's new position
   (40px to the right, on detail pages only) feels right is a hand thing.
5. **Whether row 25 is the right call.** See deviation 3. It is a one-line change to restore T11's
   behaviour if he wants the matchup to be an exception.

---

# Round 7 — diagnostics: making the next crash legible (2026-09-15)

> Out of band. It came out of the same phone-testing session as R1–R5, so it is a Round 7 item,
> but it was implemented after Round 8 was already written down, which is why it sits at the end
> of this file. Commits: `feat(diag): …` on `feature/2026-09-audit`.
> **Nothing here tries to fix the crash.** The job was to make the next occurrence say what threw.

## The evidence (established frame by frame from Roli's recording — do not re-derive it)

- The app blanks to the **themed page background** with an empty body. Measured RGB **13,18,27**
  against the blue theme's `--color-bg-default` of **11,17,30**. So the bundle had loaded,
  `useThemeManager` had applied `data-theme`, and *then* the tree went empty. It is **not** a white
  screen, **not** the install splash, **not** a reload.
- The header **and** the bottom tab bar are gone too. `ui/shell/RouteErrorBoundary.tsx` exists, but
  `AppShell.tsx:105` wrapped only `{children}` with it, so a throw in the shell or in a provider was
  **above** the boundary and nothing caught it.
- Roli: *"when i swiped back, it was unresponsive and then i got the blue screen only."* Unresponsive
  first, then blank, roughly **2.6 s** after the gesture, with no further interaction. That signature
  fits a render/update loop hitting React's maximum-update-depth, which React throws and which
  unmounts the tree — **a hypothesis, not a finding.**
- It does **not** reproduce in Chromium. WebKit is not installed (Roli asked not to install it yet).
- **It no longer reproduces at all.** It is intermittent, so the recorder is the only route to it.

## What was built

| Piece | Where | What it does |
|---|---|---|
| Top-level boundary | `ui/shell/AppCrashBoundary.tsx`, mounted in `main.tsx` **outside every provider** | Catches a throw in the shell, a provider or the router. Names the failure, shows the message and the stack, offers Reload and a real navigation to `/dashboard`, and points at Settings → Diagnostics. No context, no query, no router hook — it is the last thing standing. `RouteErrorBoundary` keeps its own job (the *page* failed, the app is fine) and its own reset key. |
| Recorder | `diagnostics/crashLog.ts` | Ring buffer of the last **10** events through `utils/safeStorage.ts` (never bare `localStorage`). Fed by both boundaries, `window.onerror` and `unhandledrejection`. Each entry: timestamp, source, message, stack, component stack, URL, Vite mode, repeat count, trail. |
| Breadcrumbs | `diagnostics/breadcrumbs.ts`, fed from `ui/shell/useRememberLocation.ts` | Last **20** navigations in memory — timestamp, `pathname+search`, and the router's `PUSH`/`POP`/`REPLACE`. Attached to an error when one is recorded; never persisted on its own. |
| Liveness marker | `diagnostics/lifecycle.ts` | Answers the death that throws nothing (iOS jettisoning the web view). See below. |
| Install | `diagnostics/install.ts`, called from `main.tsx` before render | Boot check → global handlers → heartbeat, in that order. |
| The phone-readable view | `ui/layout/DiagnosticsSettings.tsx`, Settings tab `?tab=diagnostics` | Newest first, each expandable to stack + component stack + trail; Copy all (clipboard, with a select-and-copy fallback); Clear behind `ConfirmDialog`. |

## Decisions worth not re-litigating

- **The loop guard is three things.** (1) A repeat with the same signature (message + first stack
  frame) merges into the newest entry instead of appending. (2) A burst of *different* errors folds
  into the newest once **5** new entries have been appended in 10 s, counted in `suppressed`.
  (3) Storage is written at most **once a second** (leading write + trailing flush, plus a flush on
  `pagehide`). A 100/s loop therefore costs **one entry and one write per second**.
- **`count` is sampled at 400 ms**, and that is deliberate. One throw reaches the recorder two or
  three times — React re-renders a failed tree to build the component stack, and a **dev build**
  re-throws it to `window` as well — as *different* Error objects, which object identity cannot
  catch. Sampling makes a single crash read `1`. A loop still climbs, and `lastTs - ts` is the real
  measure of how long it ran. `suppressed` stays exact.
- **Backgrounding is not a death.** The marker's `phase` is the whole rule: `hidden` (a
  `pagehide`/`visibilitychange` ran, so the page *left* — backgrounded, reloaded or closed) is never
  reported; only `visible` (the last thing we saw was the heartbeat, in the foreground, and then the
  session stopped) becomes a synthetic entry. A real renderer kill was used to verify it, and an
  ordinary backgrounding was verified to record nothing.
- **The `pagehide` write is trail-free**, because iOS gives that handler very little time and a
  hidden marker is never reported anyway. The trail rides on the foreground heartbeat (15 s) and on
  every navigation (throttled to 1/s) — without the navigation refresh, a death in the first seconds
  of a document would carry an empty trail, which is precisely the case being hunted.
- **A synthetic entry is `warn`, not `error`** (`DESIGN.md` §2): nothing failed that we know of. The
  four real sources are `error`. The UI says "No error was thrown." above the message.
- **Known false positive, accepted:** two tabs of the app open at once on a desktop share the marker,
  so the second one's boot can read the first one's live `visible` marker and report a death that
  did not happen. On a one-window installed PWA this cannot happen, and the entry is labelled for
  what it is.

## Stack quality

Roli's phone loads the PWA from the **Pi's Vite dev server** over the LAN, so the stacks in his log
point at real source files and line numbers (`at ShellInner (…/src/ui/shell/AppShell.tsx:37:34)`),
and `Build: development` on each entry says so. Production stacks would be minified and far less
useful — if the crash ever has to be chased on `lorbeerkranz.xyz`, source maps are the follow-up.

## Verified (isolated stack: backend :8003 on a DB copy, vite :8020)

Four forced crashes, each producing exactly one correctly-labelled entry with its trail: a throw in
`ShellInner` (**App boundary**, with component stack), a throw in `DashboardPage` (**Page boundary**),
a bare `setTimeout` throw (**window.onerror**), a rejected promise (**Unhandled rejection**). Plus a
real renderer kill (`chrome://crash`) → **Ended unexpectedly** on the next boot carrying the trail,
and a plain `pagehide` → nothing recorded. 390px and 1280px, blue and light. `a a` count stayed 0.

## Deviations

- The brief asked for the Diagnostics section "on the Settings page"; it is a fourth **tab**
  (`?tab=diagnostics`, the U1 scheme) rather than a block appended to an existing tab.
- `SettingsSection` gained `min-w-0` — a grid item is `min-width: auto`, so the first unbreakable
  stack frame made the entire page scroll sideways. Latent for every tab, found by this one.

## Round 7b — the crash that still recorded nothing (2026-09-16)

Roli, 2026-09-16: *"i now just had a crash again (from a different scenario) but nothing
recorded...its annoying as these are hard to reproduce as they dont occur often/every time."*
Twice now. The instrument above was built to be *watching when it happens*; this is the change that
makes it *tell you afterwards*.

**Why nothing was recorded — diagnosed, not guessed.** The diagnostics install from `main.tsx`
*before* React and run independently of it. So when the app blanks — the React root emptied, the
document untouched — the heartbeat carries on writing `phase: "visible"` every 15 s: **nothing ever
asked whether anything was actually on screen**. And then Roli does the only sensible thing with a
black screen: he backgrounds it or force-quits it, which fires `pagehide`/`visibilitychange`,
rewrites the marker to `phase: "hidden"`, and `unexpectedEnd()` deliberately never reports a hidden
marker. *Reacting to the crash destroyed the evidence of it.* Between those two behaviours, a blank
screen whose document survives was exactly the case that left no trace — and it is the case he keeps
hitting. (The renderer-kill case the section above verified is a different death: there the document
dies too, and the stale `visible` marker is the whole point.)

**What now covers it.** Three things, all in `src/diagnostics/`.

| Piece | Where | What it does |
|---|---|---|
| The tick looks at the screen | `lifecycle.ts` | Every 3 s: is the mount point still holding a rendered tree? If it is not — and it once was — the entry is recorded **there and then** (source `blank-screen`, `warn` tone, "No error was thrown"), with the URL and the navigation trail, **with nothing having thrown**. The storage write stays where it was: the marker is written on every *fifth* tick, i.e. every 15 s, exactly as before. |
| A blank screen stops being blank | `blankNotice.ts` | Paints "The app stopped drawing", a Reload button and a real navigation to Settings → Diagnostics into the empty root. Plain `document.createElement` + `textContent` + inline styles reading the theme's own CSS variables with literal fallbacks — **no React, no router, no context, no stylesheet dependency**, because any of them may be what just failed. Every statement inside one `try`; it paints at most once. |
| Backgrounding stops destroying evidence | `lifecycle.ts` marker `blank`, `crashLog.recordBlankScreen` | The hide handler **looks before it rewrites the marker**, so a blank seen between two ticks is still caught on the way out; and once seen, the fact rides in the marker as `blank: <ts>`, which `unexpectedEnd` reports whatever the phase. The ordinary rule is untouched: a `hidden` marker *without* `blank` is still never a death. The two reports are one incident — a blank already in the log within 5 s of the one being recorded is left alone. |

**Decisions worth not re-litigating.**

- **What "still rendering" means is `root.firstElementChild != null`, and nothing richer.** Anything
  about *visibility* or size needs geometry, and `offsetHeight`/`getBoundingClientRect`/
  `getComputedStyle` force a reflow on every tick. Two O(1) property reads is the whole budget.
- **A false "your app died" is worse than none** — it trains the reader to ignore the log. So the
  detector fires only when all of these hold: it has seen a rendered tree at least once **in this
  document** (which kills the window between `createRoot` and the first paint, and a boot that never
  rendered at all — that is a different bug, and `window.onerror` has it); the document is older than
  `BOOT_GRACE_MS` (2.5 s); and it has not already fired. A root React **replaced** rather than
  emptied is re-resolved by `getElementById` before it counts as anything.
- **A legitimately empty render cannot happen here** and is not guessed at: the shell renders on
  every route, and the lazy routes have `Suspense` fallbacks *inside* it (`app/App.tsx`), so a chunk
  still loading leaves the root full. Verified by driving 21 route loads with nothing recorded.
- **The blank entry is `force`d past the loop guard** (`RecordInput.force`). It can fire once per
  document, so it needs no burst budget — and a render loop that *ends* in a blank screen is exactly
  the case where the burst fold would otherwise swallow the one line saying what was on screen.
- **A synthetic entry never calls `noteErrorRecorded`.** That flag exists to say "a real error
  already explains this death"; a blank screen explains nothing, and must not suppress the next
  boot's report.

**What the tick costs** (measured in the production build, on the Pi, 200k iterations):
the look is **~77 ns**; a single `offsetHeight` read — the layout-forcing alternative, in an already
settled document — is ~743 ns; the marker write it sits next to is **~18.6 µs**, i.e. 240× the look,
and its frequency is unchanged. Twenty ticks a minute add ~1.5 µs of work per minute. No new timer
(the existing interval got faster and writes on every fifth tick), no new storage write, no DOM walk.

**Verified** (isolated stack: backend :8003 on a copy of `app.db`, vite :8020, production build
served statically on :8031). Three forced blank screens, each recording exactly one `blank-screen`
entry with its trail and painting the notice: `root.unmount()` **from outside React**; a throw
**above** the app boundary (rendering a throwing element at the root — which also produced its own
`window.onerror` entry beside the blank one, the pair being the ideal report); and the hide path,
where the root is emptied and the page is backgrounded or reloaded before the next tick. The
renderer kill (`chrome://crash`) still produces the pre-existing **Ended unexpectedly** entry, not a
blank one. Recorded **nothing**: a normal boot (22 s), a route that renders little (`/no-such-page`),
a reload, a backgrounding with the app intact, and 21 route loads across the lazy chunks. In the
production build the entries carry `Build: production` and the same behaviour; at 390px and 1280px,
blue and light, `a a` count 0, no console errors beyond the WebSocket the static harness does not
proxy.

**Source maps: worth it, but it is Roli's call and the build config was not touched.** Measured
side by side, the same throw records `at Boom (…/src/main.tsx:39:11)` from the dev server and
`at e (…/assets/index-kRxnvNJS.js:22:292267)` from the production build — a production stack names
minified frames and is nearly useless for locating the failure. `build.sourcemap: true` in
`vite.config.ts` would fix that, at the cost of publishing ~2–3 MB of `.map` files next to the
bundle, which anyone can read as the original source (this is a private friends' app, so that is a
small matter, but it is a real one and it is his to decide). The cheaper half-measure is
`build.sourcemap: "hidden"`: maps are emitted but no `//# sourceMappingURL` comment is, so browsers
never fetch them and the stack stays minified — useful only if someone de-minifies the copy by hand
afterwards. **Nothing forces the decision today**: his phone loads the PWA from the Pi's dev server,
so his stacks already name real files, and `lorbeerkranz.xyz` has never had to be chased.

**Deviations.**

- **The tick is 3 s, not the heartbeat's 15 s** — the plan says "each beat"; a beat every 15 s would
  leave a reader in front of a black screen for up to fifteen seconds before the notice appears, and
  the look is cheap enough that the honest answer was to look more often and write no more often.
  One timer still, `HEARTBEAT_MS / RENDER_CHECK_MS` ticks per marker write.
- **The blank is a source of its own (`blank-screen`), not a `lifecycle` entry with a different
  message.** "Ended unexpectedly" is the wrong label for a page that is still open; the log now
  distinguishes *it was taken away* from *it stopped drawing*, which are different bugs. Both are
  `warn`, both say "No error was thrown", and `isSyntheticSource()` is the one place that knows.
- **`window.addEventListener("pageshow")`, restricted to `event.persisted`.** Not asked for: found
  while reading the hide path. The timer is stopped on the way out, and a bfcache restore does not
  always fire `visibilitychange` — without this the heartbeat (and now the detector) could stay dead
  for the rest of a restored document. Guarded so an ordinary load adds no write.
- **A real OS-level backgrounding could not be produced in this environment.** Headless Chromium
  reports `visibilityState: "visible"` regardless, and so does a headed one under Xvfb (no window
  manager: `bringToFront`, minimising via CDP and `Page.setWebLifecycleState` all leave it visible).
  So the `visibilitychange` half was driven by overriding that one property and firing the real
  event — exactly what the code reads and listens to — while the `pagehide` half was exercised for
  real by a reload. Unit tests cover both paths as well.
- **The verification needed `main.tsx` patched temporarily** (to expose the root for `unmount()` and
  a helper that renders a throwing element at the root). Applied, used for both the dev and the
  production runs, reverted; the committed tree has none of it.

---

## Q7 — The friendlies list has no layout of its own  ☑

Roli, on the Details and Compact views (2026-09-15): *"this does not look nice"*.

**Cause, and it is structural.** The page has no list of its own: `pages/tools/FriendlyMatchesListCard.tsx:273`
builds a **fake tournament per date** — `{ name: "Friendlies", date: dateKey, status: "friendly" }` —
and hands it to `pages/stats/MatchHistoryList.tsx`, the component written for *matches grouped by
tournament*. So the group title is the word "Friendlies", three times down one phone screen, while
the thing that actually names each group (its date) is demoted to a chip underneath it, and the
layout is one designed for a context this page does not have.

**What is wrong, itemised:**
1. **Two stacked filter rows on top of the content** (`:305-333`), each `section-label`
   (`text-xs font-semibold uppercase tracking-wider`) + a `SegmentedSwitch`. This is the pattern
   Roli rejected on stats in round 4; friendlies is the last page still using it.
2. **Nothing forms a column.** The score is centred in the row, the two action buttons are
   right-aligned, the club blocks float between them. T14 gave standings fixed columns for exactly
   this complaint; this list never got it, so no two rows line up.
3. **The rows sit on the bare page ground** with a hairline between them — no `card` (DESIGN.md §3).
4. **Two 44px buttons on every row** for actions used rarely, making them the loudest thing in the list.
5. **Details view is unbalanced**: long club names wrap to two lines ("Heart of Midlothian F.C.",
   "Inter Mailand (Lombardia FC)"), and five outlined stars per side spend a lot of pixels on one number.

**Decided with Roli (selected from rendered options — do not relitigate):**
- **Keep entry order, align the columns.** Whoever was entered first stays on the left, because the
  club is attached to a side and the row should stay honest about who was home. Fixed-width columns
  so every score sits at the same x down the page, the way T14 did it for standings. Winner-first
  ordering was offered and rejected.
- **The row is the only control: tapping it opens the editor, and delete lives inside it.**
  Confirmed with Roli from rendered options. The row carries **no buttons at all**; a tap opens the
  friendly's existing editor, and the delete sits in there behind `ConfirmDialog` (Q5's house
  style). Revealing the two buttons on the row instead was offered and rejected.
- **The filters move into the floating pill**, the control he approved for stats (S5/S7/T4). Both
  Mode and the Compact/Details choice go in it, and the two rows above the list disappear.
  **Note:** `pages/stats/StatsFilterPill.tsx` is stats-shaped today. Promoting it to a shared
  primitive is part of this task, not a side effect — and once it is shared, DESIGN.md §9 should
  describe it as the app's filter control rather than the stats page's.

**Also fix while in there:** the group header should be the date and the count
("28 August 2026 · 1 match"), not a repeated page name with the date demoted beneath it.

**Open, worth Roli's opinion when it is built rather than before:** whether the stars stay as five
glyphs per side or collapse to a compact token ("3.5★"), which is what the clubs page already does
and what would let a details row fit one line per club.

**DoD:** every row's score at the same x, measured; no control on a row but the row itself; the
filter pill on friendlies and stats from one shared component; `npm run check` + build; 390px and
1280px in blue and light; before/after screenshots of both views.

**Deviations:**
- **The fake tournament is gone and friendlies got a list of their own**
  (`pages/tools/FriendlyList.tsx`), rather than `MatchHistoryList` growing a mode. That component
  has **five** callers, not one — the profile overview, the profile's Matches tab, the H2H matchup,
  the Player view, plus the H2H panel's row — and four of them are *right* to show a group called
  "Friendlies": those lists genuinely mix tournaments and friendlies, and the **backend** sends
  `status: "friendly"` groups of its own (`services/stats/player_matches.py`, `h2h_matches.py`,
  merged by `pages/stats/matchHistory.ts`). The repeated title was never a bug in that component;
  it was a bug in borrowing it for a page where every group is a friendly. So the component keeps
  its shape and its callers are untouched.
- **The borrow's residue went with it.** `MatchRowWithClubs`'s `action` / `expanded` and
  `MatchHistoryList`'s `renderMatchActions` / `renderMatchExpanded` existed only for this page —
  their own doc comments say so — and had no caller left once it moved out. Removed, and the T8
  test that guarded "the editor is not in the action slot" was re-pointed at the row that now owns
  the rule (`src/test/friendlyList.test.tsx`, 8 new tests). `renderTournamentActions` is callerless
  too but predates this task and was left alone.
- **No card around the rows** — item 3 of the diagnosis, answered differently and on purpose. The
  editor a row opens contains `SelectClubsPanel`, which **is** a `card` by canon (§9b, T9): a card
  per day group would nest card-in-card the moment a row is tapped, which §1.1 and §10 forbid
  outright, and a surface that cannot survive its own expanded state is the wrong surface. The
  canon argues the same way unprompted — §1.2 is flat-and-list-first and §6 says in as many words
  that "a card per group would box every number on the page" — and every other match list in the
  app is flat, so boxing this one would make friendlies the odd page out. What item 3 was really
  about, rows with no structure around them, is answered by the group's header band and a real
  `row-tap` press state. Item 3 is a diagnosis, not one of the three settled decisions, and the DoD
  does not ask for a card.
- **The column rhythm is T14's mechanism moved into `ScoreLine`**, not a second one:
  `scoreDigits(goals)` once for the whole page → `digits` on every row → each numeral holds a
  `RecordNum` pad track. Both numerals hug the hairline and the slack goes outward, so the
  *separator* is the part that cannot move. Measured with 1v1 and 2v2, single- and double-digit
  rows mixed in one list: **before** 3 distinct separator x per view — spread **12.27px** compact,
  **16.36px** details, at both widths; **after** exactly one — **spread 0.00px**, x=**195.00** at
  390px and x=**760.00** at 1280px in both views, with every numeral track's own left and right
  edge identical across all 24 rows.
- **The pill is `ui/primitives/FilterPill`.** A page declares groups (`filterGroup`: label,
  options, value, the value that counts as unfiltered, and whether the capsule shows it as text or
  as an icon) and keeps the state where it already lived — stats in the URL, friendlies in
  component state plus `localStorage`. The pill owns the capsule, the popover, the placement, the
  outside/Escape close, the scroll tuck, the accent state and the pulse (`pulseKey` per surface, so
  friendlies pulses once even if Stats pulsed first). `pages/stats/StatsFilterPill.tsx` survives as
  the stats page's two groups and nothing else; its 17 tests pass unchanged.
- **Compact/Details is in the pill but declared `display`**, so it never turns the pill accent. It
  belongs in the control — it is part of "what this list shows", both rows above the list had to
  disappear, and a second floating control would be one too many — but it filters nothing, and the
  accent state means "the rows you are looking at are filtered". Verified at runtime: choosing
  Details leaves `data-filtered="false"`; Mode 2v2 sets it `"true"`.
- **The stars became a token** (`StarsToken` — one filled 12px glyph and the number) folded into
  the league line instead of owning a third line, so a details row is 2 lines per side instead of 3
  and the two ratings meet either side of the centre gap where they can be compared. It is
  `tabular-nums` but **not** `font-mono`: it follows a league name of any length rather than sitting
  in a column, and a mono `.` sets "3.5" a third wider than it needs to be. Long club names still
  wrap at 390px; what actually reduced the wrapping was deleting the two 44px buttons, which gave
  each side ~38px back. The Details page is **21% shorter** (7590 → 5986 device px at 390px,
  6668 → 5336 at 1280px).
- **Two small things the brief did not ask for**, both caused by the filter moving into the pill:
  the view choice is remembered (`friendly_list_view`, the `match_list_view` idiom of §9b) because a
  preference two taps away that resets every visit is worse than one on screen; and the empty state
  now distinguishes "No friendlies yet." from "No 2v2 friendlies." — with the filter hidden, the old
  wording is simply untrue.
- **Left for later:** the four `MatchHistoryList` surfaces could pass `digits` now and get the same
  aligned column for one line each. Out of scope here — five surfaces to re-verify.
- **Canon touched** (targeted edits; Q4 was in `Modal` / `ImageLightbox` / `MobileChrome` /
  `tailwind.config.cjs` and had not touched `DESIGN.md`): §7's `Filters`, `Clubs under a score` and
  `Stars` rows; §8 gained the fixed-numeral-column bullet; §9 was retitled "Floating filter pill"
  and rewritten as the *app's* control with the display-vs-filter rule. `AGENTS.md` §2's module map
  names `FriendlyList.tsx` and `FilterPill`.
- **Verified** on an isolated stack — backend :8004 on a copy of `backend/app.db` with a scratch
  secrets file, vite :8022. Four friendlies were added to the copy (two 2v2, a 12–3, a 2–10, a
  clubless row, the two longest club names in the DB) so the alignment claim is made against a list
  that really mixes modes and digit counts. Playwright at 390×844 and 1280×800, blue and light, both
  views, as admin and as a reader: zero console errors, `a a` = 0, `button button` = 0, `button a`
  = 0, one button per row (the stretched overlay) and none at all for a reader; the row opens the
  editor, Delete sits inside it behind `ConfirmDialog`. The stats pill was re-checked on all eight
  sub-views — right labels, absent on Cups, mode-only on Positions, URL and `data-filtered` both
  following a change. The DB copy and both servers are gone.


---

## Round 8 — running order

Seven tasks, five waves, paired by **file set** so two workers never share a file. Reasons, not
preferences:

| Wave | Runs | Why here |
|---|---|---|
| 1 | **Q5** ‖ **Q1** | Q5 is backend + the live-tournament pages, Q1 is `pages/ideas/`. Disjoint. |
| 2 | **Q3** ‖ **Q4** | Q3 is the two stats grids, Q4 is the drawer, `Modal` and the lightbox. Disjoint. |
| 3 | **Q2** alone | It edits the shell **and** all three composers **and** the filter pill. It has to follow Q1 (both touch `IdeaComposer.tsx`) and precede Q7 (both touch `StatsFilterPill.tsx`). |
| 4 | **Q7** alone | Promotes the filter pill to a shared control, so it must come after Q2 has finished moving offsets around inside it. Also rewrites `MatchHistoryList` usage, which Q3 reads. |
| 5 | **Q6** alone | **Gated on the crash trail from Roli's phone** (see Q6's Sequencing note). It touches every file the other six avoid. |

**Nothing in Round 8 starts without Roli saying so**, wave 1 included.


---

## Q2 (reopened) — the keyboard fix does not fire on the device  ☐

Roli tested `ec5165f` on his iPhone, 2026-09-16: *"it happens in both safari and standalone pwa
after re-opening (tabs group moves with keyboard)"*. Screenshot: keyboard up, **the bottom tab bar
still visible** between the composer and the keyboard, and **the composer still 72px above the bar**.

**What that rules out.** Not a stale bundle — he force-quit and reopened, and Q1's taller details
field (shipped hours earlier) is visible in the same screenshot while Q2's effect is not. Not
standalone-mode-specific — mobile Safari behaves identically. And **both halves failed together**
(bar not hidden *and* `--bottom-nav-clearance` not collapsed), so `html[data-keyboard-open]` is
never being set: this is the detection, not the CSS that hangs off it.

**Where to look, in order.** The three conditions in `ui/shell/keyboardOpen.ts` are focus on a text
field, `scale ≤ 1.05`, and `covered ≥ max(120px, 20% of innerHeight)` where
`covered = innerHeight − visualViewport.height − visualViewport.offsetTop`. On paper all three hold
on an iPhone. So one of the *inputs* is not what the code assumes — most likely `innerHeight`
shrinking with the keyboard (making `covered ≈ 0`), or `offsetTop` absorbing the difference. Roli's
words "tabs group moves with keyboard" say Safari **re-anchors the fixed bar to the visual
viewport**, which is consistent with a non-zero `offsetTop`.

**Do not guess a second time.** The next step is to *measure on his phone*: put a live readout of
`window.innerHeight`, `visualViewport.height`, `visualViewport.offsetTop`, `visualViewport.scale`,
the active element's tag and the current value of the flag into the Diagnostics section that already
exists (R7 diagnostics, `ui/layout/DiagnosticsSettings.tsx`), with its own text field to focus so the
keyboard can be raised while the numbers stay on screen. One screenshot from him then settles it.
Only after that, fix the condition.

**Deviations:**

---

## Q8 — A friendly's result should show which clubs played it  ☑

Roli, on the new list (2026-09-16): *"i like the new list, but can you show the club crest beside the
result?"* — which also settles Q7's open question: **the flat rows are right, no card.**

Compact view shows the score and nothing else, so the clubs are only visible by switching to Details
or opening the row. The crest is the compact way to say it: `ui/ClubBadge.tsx` already resolves
crest → nation flag → monogram (AGENTS.md §10), and the friendlies list already loads the clubs it
would need.

Judgement, for whoever builds it: where the crest sits without breaking what Q7 just fixed. Every
score now sits at exactly the same x (measured spread 0.00px across 24 mixed rows) because the two
numerals hug a fixed centre; a crest placed inside that track would move it. It belongs beside the
**player name** on each side, on the outside of the numeral track. Check it against a 2v2 row (two
names per side), a row with no club at all (they exist in the data), and the longest club names in
the DB. Details view already shows crest + name + league + rating and should not gain a second one.

**Deviations:**
- **The crest is a side *mark* on `ScoreLine`, not a new row shape.** `leftMark` / `rightMark` hang
  one small node off the outer edge of a side's names — the slot mechanism the result badge (§8)
  already used, so a side reads `badge → mark → names` and the trio stays one grid. The friendlies
  list passes a 16px `ClubBadge` (`ClubMark` in `pages/tools/FriendlyList.tsx`); nothing else in the
  app passes anything yet.
- **Nothing moved, and the reason is structural, not lucky.** The names *hug* the score
  (`justify-end` on the left side, `justify-start` on the right), so a symbol added on their far
  side grows outward into space that was empty anyway: it can move neither the numeral track nor the
  names. Measured on the same 24-row list Q7 used (20 real friendlies + four seeded: two 2v2, a
  12–3, a 2–10, a clubless row, the two longest club names in the DB), **before and after are
  identical to the pixel** — one distinct separator x per view, spread **0.00px**, x=**195.00** at
  390px and **760.00** at 1280px, every numeral track's own edges one value across all 24 rows
  (compact 161.95/186.50 · 203.50/228.05; details 153.77/186.50 · 203.50/236.23 at 390px), and the
  **names** likewise: left-names right edge 149.95, right-names left edge 240.05 at 390px, 714.95 /
  805.05 at 1280px, one value each, before **and** after.
- **Compact only, and Details is provably untouched.** Details already spells the club out in words
  with its own crest; a second symbol on the same row is the thing the brief forbade, and there is
  no arrangement where a row needs two. Proved rather than asserted: the full-page screenshots of
  Details at both widths in both themes are the same height before and after and differ in **zero**
  pixels (light/1280) or in exactly one 16px square — the bottom bar's *pulsing live dot*, which
  animates between captures.
- **A clubless side keeps an inert 16px slot.** Honest note: nothing on screen depends on it, since
  the names are pinned to the score either way — it exists so every row's geometry is literally
  identical rather than merely equivalent. It says nothing else: Compact is the dense view, and a
  visible "no club" marker would spend a symbol on the absence of one (Details has the words).
- **The symbol carries the club's name to screen readers** (`sr-only` next to the badge, which is
  `aria-hidden` by design): in Compact the symbol is the entire statement about the clubs, so
  leaving it silent would make the view worse for AT than the one it replaces. A `title` tooltip was
  rejected — the row content is `pointer-events-none` under the stretched edit button (A6/§7), so a
  tooltip would work for a reader and not for an editor.
- **Size: `ClubBadge size="sm"` (16px), the app's smallest, under the 18px `sm` numerals and beside
  14px names** — the same footprint the club line already uses in Details, so the crest never
  outweighs the score. No opacity fudge and no special case for the crestless clubs: checked live
  across all 48 sides of the list — 33 real crests, **8 national-team flags**, **4 monograms**
  (`AS` Al Shabab, `NF` Nottingham Forest ×3 — two of the six crestless clubs) and 3 empty slots.
- **No new request, and not one per row.** The page already loads `/clubs` once
  (`qk.clubs()` in `FriendlyMatchesListCard`) and hands the array down; `ClubMark` resolves through
  the same `clubLabelPartsById` Details uses. Counted at runtime: **1** `/clubs` call, **1**
  `/friendlies?limit=500`, and **25 crest images for 25 distinct URLs** — byte for byte what the
  Details view already fetched, because repeats come from the browser cache (`?v=<updated_at>`,
  `loading="lazy"`).
- **Canon touched** (targeted): `DESIGN.md` §7's `Any score` and `Clubs under a score` rows, and a
  new §8 bullet stating the rule — the club stands beside the name, never inside the score; one
  club, one symbol per row; the clubless slot; the 2v2 centring. `AGENTS.md` needed no change (crest
  precedence and the module map are still true as written).
- **Tests:** 5 new (`friendlyList.test.tsx` ×4 — the symbol beside its own side, the screen-reader
  name, the kept slot, Details getting no second symbol; `scoreLine.test.tsx` ×1 — a mark rides the
  outer edge, never the numeral cell, and a 2v2 side spends no extra line on it).
- **Verified** on an isolated stack — backend :8003 on a copy of `backend/app.db` with a scratch
  secrets file, vite :8020 — at 390×844 and 1280×800, in `blue` and `light`, both views, as admin
  and as a reader: **zero console errors** everywhere, `a a` / `button button` / `a button` /
  `button a` all **0**, 24 rows, one row button each as admin and none at all as a reader, and the
  row still opens its editor with Delete inside it. The DB copy and both servers are gone.

---

## Q9 — The cache is discarded faster than Roli moves around  ☑

Roli, 2026-09-16: *"i see that some screens are loading again after i move away from them and back ->
i thought we already have the data and only load it if something changed? is there a regression? or
was it always like this/is this ok?"*

**Not a regression.** `frontend/src/main.tsx:35-43` has held `retry: 1`,
`refetchOnWindowFocus: false`, `staleTime: 5000` since **the initial commit** (`d7101c9`), and
`gcTime`/`cacheTime` is set **nowhere**, so it is TanStack's default of **5 minutes**. Nothing in
rounds 6–8 touched either.

**What he is actually seeing.** Two different timers, only one of which is visible:
- `staleTime: 5000` — almost every return refetches, but the cached data renders immediately while
  it happens, so there is no loading state. Invisible; costs traffic.
- **`gcTime` 5 min** — once the last component using a key unmounts, the entry is dropped after five
  minutes. Return after that and there is nothing to render, so the loader is real and correct.
  This is the one he sees, and it fires exactly on the "went away and came back later" pattern.

The loaders themselves are **not** the bug: v5's `isLoading` is `isPending && isFetching`, true only
when there is no cached data, and the seven call sites using it are right. (`FriendlyMatchCard`'s
three `isFetching` uses are disabled-states on controls, not loaders — leave them.)

**Why the expectation is reachable.** The app pushes changes over the websocket and invalidates the
affected keys (`hooks/realtime/applyEvent.ts`, and A9 made the `seq` gap check real). Where realtime
covers a screen, a 5-second staleness window buys nothing: the data cannot go quietly stale, because
a change announces itself. Where it does not — **clubs, ideas, and anything else with no channel** —
the short window is doing real work and must stay.

**What to do, and the judgement it needs:** raise `gcTime` substantially so returning to a screen is
instant rather than a fresh load, and set `staleTime` **per domain** rather than globally — long
where a channel covers it, short where none does. Write down which keys are covered by which
channel; that map does not exist anywhere today and is the actual deliverable. Watch the memory cost
of a long `gcTime` on a phone, and check what `placeholderData: keepPreviousData` (already used on
the stats queries) should do once the numbers change.

**DoD:** the channel-coverage map written into `AGENTS.md` §6; navigating away for ten minutes and
back renders instantly on every realtime-covered screen; a screen with no channel still refreshes;
`npm run check` + build.

**Deviations:**

- **The map is code, not prose, and prose second.** The table lives in
  `frontend/src/api/cachePolicy.ts` — one row per `qk` key prefix carrying coverage, number and
  reason together — and is applied with `queryClient.setQueryDefaults`, so a query inherits its
  domain's policy **without any call site opting in**. That was the deciding argument between the
  three options in the brief: declaring at each `useQuery` cannot be enforced, and a table the
  queries *read* still needs every query to remember to read it. `AGENTS.md` §6 carries the same
  rows as the human-readable map, and `src/test/cachePolicy.test.tsx` fails if a `qk` namespace
  has no row — so the two cannot drift.
- **One backend change, not expected by the brief.** Writing the map exposed a hole it would
  otherwise have had to document as a known wrongness: a score correction (or a side swap) on an
  **already-done** tournament changes no status, so `PATCH /matches/{id}` broadcast it on the
  tournament's own channel and to the global channel **not at all** — the tournaments list's
  winner, the cup owner and every stat could stay wrong on every other device indefinitely. With
  that hole open, "covered by the always-on channel" could not honestly justify a long staleness
  window. Closed with `services/events.py:global_action_for_match_change`, a new coarse action
  `result` (only ever fired when the tournament is already done, so the "no refetch storm from a
  goal" design decision is untouched), and `applyTournamentsChanged` treating it like `status`.
  Three backend tests + two frontend ones. `make test` 204 passed, `make lint` clean,
  `make gen-types` no diff (no response model changed).
- **`gcTime` is 30 minutes and uniform**, not per domain. Measured cost on a realistic
  22-screen session: **1.58 MB of JS heap** (76 entries, 782 KB of JSON; heap 18.80 MB with the
  cache, 17.22 MB after clearing it, reproducible to ±3 KB). Nothing is retained that could
  render *wrong*: every key whose data can change unannounced keeps a 5 s staleness window, so a
  cached screen is repainted from a refetch within one round trip. The only long windows sit on
  data the always-open global channel announces.
- **`refetchOnWindowFocus` turned on globally** (it was off). It does not double up with the
  websocket resync: `useVisibilityResync` *invalidates* the channel-covered keys regardless of
  staleness, while a focus refetch only touches queries that are stale **and** active — which,
  after the table, are exactly the keys no channel watches.
- **`placeholderData: keepPreviousData` added to two queries, removed from none**: the Clubs
  page's game selector and the friendlies mode tabs, both filters over one list, the same shape
  as the stats filters. The rule written into §6 is "filters, not subjects"; the pre-existing
  player-keyed uses in the stats Player/H2H sections sit on that line and were left alone (S3's
  call, and one round trip long).
- **One call-site override removed** (`pages/dashboard/TrendsPreviewCard.tsx`): it forced
  `staleTime: 0` on `stats.players` **and** on one `stats.playerMatches` per player, so every
  visit to the dashboard re-downloaded all six players' full match histories (~180 KB). It now
  follows the table like the rest of `["stats"]`. In the measured session walk this is most of
  the traffic saving: **152 → 129 API requests** for the same 21 screens, with
  `/stats/player-matches` going 30 → 18 calls (≈365 KB). The overrides that stand are listed in
  §6 with the claim each of them makes.
- **Proof (isolated stack, backend :8003 on a copy of the DB, vite :8020, 300 ms simulated
  mobile latency, Playwright fake clock):** going to a tournament, leaving for ten simulated
  minutes and coming back with the history gesture — **before**, the cache fell from 33 entries /
  300 KB to 6 / 1.1 KB and the first frame read `7. Bauernkranzturnier | Loading` (the profile
  read `Player #4 · Angepöbelt: 0`); **after**, the cache holds at 36 entries / 301 KB,
  `["tournament",19]` survives with `observers=0`, and the first frame is the finished page
  (`WINNER · Rumpi · 9 pts · FINAL STANDINGS`), identical to the settled frame. A screen with no
  channel still refreshes: /ideas, six seconds away, returns with **no loader** and shows an idea
  a second client posted **2 ms** later, after exactly one refetch. And a change made in a second
  browser still arrives on a channel-covered screen with no navigation at all: a corrected result
  moved the tournaments list's winner in **216 ms** and the Cups page's holder in **925 ms**.
  Zero console errors on ten screens at 390 px and 1280 px, no horizontal overflow, `a a` = 0.


---

## Q10 — The blue screen is a Fast Refresh artifact, not an app bug  ☑

**Solved 2026-09-16 from the first captured trail.** Roli's Diagnostics report, iOS 18.7, Safari
26.6.1, development build, at `/live/21/match/118`:

```
App boundary — useAuth must be used within AuthProvider
  useAuth@/src/auth/AuthContext.tsx
  ShellInner@/src/ui/shell/AppShell.tsx:30
Navigation trail (0): (none recorded)
```

**The component stack contains `AuthProvider` as an ancestor of `ShellInner`** — the provider is
right there, and `useContext` still returned null. That can only mean **two different context
objects**: the mounted `<AuthProvider>` element is the *old* module's component, providing the old
`createContext` object, while `useAuth` — an ES live binding, updated by the hot update — reads the
*new* one. `AuthContext.tsx` exports a **component** (`AuthProvider`) alongside the context and the
hook, which is exactly the shape React Fast Refresh cannot update safely, and
**`AuthContext.tsx:1` is `/* eslint-disable react-refresh/only-export-components */`** — the lint
rule that exists to prevent this was switched off in the one file where it mattered most.

**Everything fits.** Development build. Only on Roli's phone, which loads from the Pi's dev server
while workers edit files. Never reproducible in a fresh browser — there is no hot update to
mis-apply. Intermittent and not tied to any user action, because the trigger is *us saving a file*,
not him tapping. The empty trail says it happened during the first render of a document, not after
navigating. And it lands above `RouteErrorBoundary` because the shell itself calls `useAuth`, which
is why it blanked the whole app rather than one page.

**Production is unaffected**: no HMR, no Fast Refresh, one module instance. This has never been a
user-facing bug and cannot become one on `lorbeerkranz.xyz`.

**Still worth fixing**, because it costs Roli real testing time and it re-teaches "the app crashes"
every time we touch a context file. Four files have the hazardous shape — `auth/AuthContext.tsx`,
`ui/RealtimeStatusContext.tsx`, `ui/layout/ThemeContext.tsx`, `ui/layout/PageTitleContext.tsx` — and
all four silence the rule. The fix is the one the rule asks for: the context object and its hook in a
module that exports **no** component, the provider in its own file. Then Fast Refresh updates each
correctly and the four `eslint-disable` lines come out. `pages/profile/GuestbookEntryCard.tsx` has
the same shape for a local context; judge it on its own.

**Do not "fix" `useAuth` by making it return a default instead of throwing.** The throw is correct
and is what made this findable; softening it would have hidden a broken provider tree instead.

**DoD:** the four context files split; no `react-refresh/only-export-components` disable left in any
of them; editing a context file with the app open no longer blanks it (test it by actually saving one
while a phone or a second browser has the app open); `npm run check` + build.

**Deviations:**

- **Reproduced first, on the unfixed code.** One save is not enough: vite answers a single edit of
  `AuthContext.tsx` with `Could not Fast Refresh ("useAuth" export is incompatible)` and a clean
  full page reload. The blue screen needs what actually happens on the Pi — *several* saves in a
  row, so the reload from save N races the re-timestamping of save N+1. Twelve rounds of that on
  `/dashboard` blanked the app on round 1: `useAuth must be used within AuthProvider`,
  an `app-boundary` entry in the crash log, "The app crashed" on screen. The captured stack names
  the mechanism outright — `useAuth` at `/src/auth/AuthContext.tsx?t=1789560989261` called from
  `useDestinationLinks.ts?t=1789560988402` and `BottomTabBar.tsx?t=1789560988402`: **two module
  graphs, 859 ms apart, in one document.** Exactly the two-context-objects diagnosis, measured.
- **Only `auth` reproduces the blank today**; the other three are the same shape, latent. `Theme`,
  `PageTitle` and `RealtimeStatus` are all provided by `AppShell`, which is itself a refresh
  boundary, so provider and consumer are re-timed together; storming `ThemeContext.tsx` at
  `/settings` (14 rounds, with and without `SettingsPage.tsx` alongside) never crashed. `auth` is
  the bad one because `AuthProvider` is mounted from `main.tsx`, which is *not* a boundary — the
  provider stays on the old graph while everything under it moves to the new one. All four were
  split anyway: same shape, same disable line, same trap for the next worker.
- **No barrel, and the hook's import specifier did not change.** The context object and the hook
  keep the file everyone already imports — `auth/AuthContext` — and only its *extension* changed,
  `.tsx` → `.ts`, which no importer can see. So the ~30 `useAuth` call sites are untouched, and the
  six `AuthProvider` importers (`main.tsx` + five tests) were updated by hand. A barrel was rejected
  in both forms: one that re-exports the provider would rebuild the exact hazard being removed, and
  one that re-exports only the hook would be indirection buying nothing.
- **The `.ts` extension is the structural half of the fix.** A `.ts` file cannot contain JSX, so the
  provider cannot drift back in later even if someone ignores the lint rule. Naming is
  `<Name>Context.ts` / `<Name>Provider.tsx` throughout, so which half is which is readable from the
  file list: `auth/{AuthContext.ts,AuthProvider.tsx}`, `ui/{RealtimeStatusContext.ts,
  RealtimeStatusProvider.tsx}`, `ui/layout/{ThemeContext.ts,ThemeProvider.tsx}`,
  `ui/layout/{PageTitleContext.ts,PageTitleProvider.tsx}`.
- **The rule is now enforced, not merely obeyed.** `react-refresh/only-export-components` was
  `"warn"`, and `npm run lint` is `eslint .`, which **exits 0 on warnings** — so the rule could
  never fail a gate even with the disable lines removed. It is now `"error"`, verified by linting a
  throwaway file with the hazardous shape: one error, exit 1. Rejected: `linterOptions.noInlineConfig`
  scoped to `**/*Context.*` (it would make the disable comment ineffective, but silently swallows
  every *other* inline directive in those files — a surprising failure mode for a guarantee the
  `.ts` extension already gives), and a new eslint plugin (no new dependencies).
- **`pages/profile/GuestbookEntryCard.tsx` was left alone, and it was right to.** It has a context
  but not the hazardous shape: the context object is module-private, the hook is *not* exported, and
  every value export is a component — so the module is already a valid Fast Refresh boundary, which
  is why it is the one context file that never needed the disable comment. Provider and its only
  consumer refresh together against the same new object. Verified: 14 rounds of saves on
  `/profiles/1?tab=guestbook`, every one a clean `hmr update`, no reload, no error. Splitting it
  would cost two files and the locality that makes the recursive card readable, for no safety.
- **Proof, not assertion.** Before: 34 × `Could not Fast Refresh` and 5 forced page reloads in the
  dev-server log, and the blank. After, on an isolated stack (backend :8003 on a DB copy, vite
  :8020): each of the eight files edited live with the app open on `/live/21/match/118` — **zero**
  `Could not Fast Refresh`, **zero** page reloads, every save a clean `hmr update`, the page still
  drawing after all eight, no page errors, and Settings → Diagnostics reading **"Nothing recorded"**
  where the same exercise previously left an App boundary entry. Storms of 12–14 rounds on each of
  the four pairs: no crash. Regression pass: 9 routes × {390 px, 1280 px} × {blue, light} = 36
  route loads, no crash, no console errors, `a a` = 0, no horizontal overflow, and theme switching
  (which runs through `useTheme`) works in both directions at both widths.
- **One edit outside this section**: the "What is left" queue row for Q10 is ticked
  `☑ Done 2026-09-16`, matching how Q8 and Q9 are marked in the same table. The sentence below it
  ("the Q10 crash keeps appearing until item 2 lands") is left as written — it records the decision
  Roli made at the time, and item 2 has now landed.

---

## What is left, and in what order (Roli, 2026-09-16)

Chosen by Roli from rendered options. **Biggest value first**, not easiest first:

| # | Task | Note |
|---|---|---|
| 1 | **Q6** — one model for back, forward and the gestures | Ungated by Q10. Runs on the consistency findings alone. |
| 2 | **Q10** — split the four context files | ☑ Done 2026-09-16. Stops the app appearing to crash whenever a worker saves one. |
| 3 | **Q2 (reopened)** — the keyboard does not hide the bar | Needs the readout below before the fix can be written. |
| 4 | **Q8** — club crests beside a friendly's result | ☑ Done 2026-09-16. |
| 5 | **Q9** — the cache is discarded faster than he navigates | ☑ Done 2026-09-16. Map in `AGENTS.md` §6. |

**Before Q2 can start**, build a live viewport readout into the Diagnostics section
(`ui/layout/DiagnosticsSettings.tsx`): `window.innerHeight`, `visualViewport.height`,
`visualViewport.offsetTop`, `visualViewport.scale`, the focused element's tag, and the current value
of the `data-keyboard-open` flag — updating live, with **its own text field** so the keyboard can be
raised while the numbers stay on screen. Roli screenshots it with the keyboard up; the fix is then
written against measured values instead of against documentation, which is how Q2 failed the first
time.

**Deploy: after the queue, not before.** Rounds 6, 7 and 8 stay on `feature/2026-09-audit`,
unpushed, and go out in one deploy when these five are done. Roli keeps testing the working tree via
the Pi's dev server until then — which means the Q10 crash keeps appearing until item 2 lands, and
that is understood.

**Remember at deploy time:** §7 step 6, the manual `recover-club-star-history` run. Roli asked twice
to be reminded.


---

## Q6b — Back means "where you came from", except after a jump  ☑

**This supersedes decision 3 of Q6** (`back always means one level up`), tested on Roli's phone and
changed by him on 2026-09-16 after seeing it. Q6's code, table and canon are otherwise correct and
stay; this changes the rule they implement, so the table is **re-verified**, not patched.

### What the device showed

Roli's recording, plus two follow-ups from him:
- **The app's swipe works on iOS** — a swipe from the *middle* of the screen goes up, as Q6 built it.
- **The left edge belongs to iOS.** An edge swipe is the system's own back gesture (with its own
  slide animation, which the app never draws), doing a plain history pop. So one flick landed in two
  different places depending on where his thumb started, and Q6's chevron and gesture — which agree
  with each other — both disagreed with the edge.
- **He reversed the rule itself:** *"although im not sure if im happy with h2h details going to
  matrix if i come from match details…"* — which is T11, his own round-4 request, by name.

### The rule, and the collision that shapes it

**Back returns you to the page you came from. If you arrived by tapping a nav destination, or you
did not arrive from anywhere (cold link, push, reload), back goes one level up instead.**

The second clause is not a nicety: without it this **re-breaks N1**, which Roli reported as a
regression in round 3. Tapping Tournaments, landing on the live tournament U6 remembered, then
pressing back must go **up to the tournaments list**, not pop to whatever destination he was in
before. That case and the matchup case are structurally identical — the previous entry is in another
part of the app — and he wants **opposite** outcomes in them. The thing that separates them is not
where he came from but **how he got there**: a nav-destination tap is a *jump* and must not be popped
back out of; an in-content link is a *drill-in* and must be.

So the history entry has to carry that distinction. Q6 already records navigations
(`useRememberLocation`, and the breadcrumb trail); marking a jump at the one place nav links are
built (`useDestinationLinks` / `navConfig`) is the natural seam. **Do not infer it** from comparing
destinations — that is exactly the test that gets these two cases wrong.

### Verified expectations (every one already argued with Roli)

| From | Arrived by | Back goes to |
|---|---|---|
| matchup | "All matches" on a match page | **the match page** (T11, restored) |
| matchup | a cell in the H2H matrix | the matrix |
| matchup | cold link / push | the H2H list (up) |
| live tournament | Tournaments tab, U6-remembered | **the tournaments list** (up) — N1 stays fixed |
| match page | a row in the Matches tab | that tab, at its offset |
| match page | a Records row in Stats | **the Records row** — was "up to the tournament" under Q6 |
| profile | a link inside a tournament | **the tournament** — was "up to Players" under Q6 |
| anything | reload | as if walked in |

### The edge stops mattering

Under this rule the system's edge gesture and the app's own do the **same thing** everywhere except
a nav-bar jump, so there is no case left worth suppressing a platform gesture for. Keep every
listener passive; do not fight iOS. State in the report what the two still do differently after a
jump, and whether that residue is worth anything further.

**DoD:** Q6's scenario table re-verified end to end against the new rule (not patched — re-run, with
the "arrived by" column made explicit), the N1 and T11 rows both passing in the same build, `DESIGN.md`
and `AGENTS.md` §10 updated to the new rule, `npm run check` + build, 390px and 1280px in blue and
light, and an explicit note of what still needs Roli's phone.

**Deviations:** (implemented 2026-09-16 on `feature/2026-09-audit`; Q6's table was
**re-run**, not patched — every row below was driven in a browser against the isolated stack, with
the arrival made the way the row says.)

### The re-verified scenario table — every route × **how you got there**

Mobile 390×844 with real touch events (CDP `Input.dispatchTouchEvent`, one fresh browser context per
row so no per-destination memory leaks between them); desktop 1280×900 clicking the chevron; blue and
light. "Back" is the one decision — chevron, swipe and desktop button all call it. "Browser ←" is the
browser's own button, which is also what the iOS edge gesture does.

| # | Where you are | **Arrived by** | What the reader expects, and why | Chevron | Back (chevron · swipe) | Browser ← | ✓ |
|---|---|---|---|---|---|---|---|
| 1 | `/dashboard` | cold load | Home. Nothing above it. | – | nothing | leaves the app | ✓ |
| 2 | `/dashboard` | Dashboard tab from `/stats` (jump) | The screen I came from. A destination has nothing deeper to leave, so the jump changes nothing here. | – | `/stats` (pop) | same | ✓ |
| 3 | `/tournaments` | Tournaments tab from `/dashboard` (jump) | The dashboard. | – | `/dashboard` (pop) | same | ✓ |
| 4 | `/tournaments` | second tap while on `/live/21` (jump) | Where I came from. The second tap was the escape from a remembered page (U6); back undoes the tap, not the escape. | – | `/live/21` (pop) | same | ✓ |
| 5 | `/tournaments` | cold deep link | Home. Not out of the app. | – | `/dashboard` (up) | leaves the app | ✓ |
| 6 | `/stats` | Stats tab from `/players` (jump) | Players. Between siblings there is no up. | – | `/players` (pop) | same | ✓ |
| 7 | `/stats?view=h2h&sub=…` | the section and sub chips (replace) | Nothing to undo: chips are not history steps. Back leaves `/stats` for the page before it. | – | `/players` | same | ✓ |
| 8 | `/friendlies` | the drawer (jump) | The page I came from. | – | `/dashboard` (pop) | same | ✓ |
| 9 | `/clubs` | the drawer, as an editor (jump) | The page I came from. | – | `/stats` (pop) | same | ✓ |
| 10 | `/ideas?idea=1` | push notification, cold | Home; the one-shot param is never replayed. | – | `/dashboard` (up) | leaves the app | ✓ |
| 11 | `/settings` | the drawer footer (jump) | The page I came from. | – | `/stats` (pop) | same | ✓ |
| 12 | `/live/19` | a row in the `/tournaments` list (drill) | The list, at the row I tapped. | `‹` + `☰` | `/tournaments` at **y=400** (pop) | `/tournaments` | ✓ |
| 13 | `/live/19` | **Tournaments tab, U6-remembered (jump)** — **N1** | The tournaments **list**: I asked for Tournaments, not for the destination I was in. | `‹` + `☰` | **`/tournaments` (up)** | `/stats` (the trail) | ✓ |
| 14 | `/live/19` | push notification / cold deep link | The tournaments list. Never out of the app. | `‹` + `☰` | `/tournaments` (up) | leaves the app | ✓ |
| 15 | `/live/19` | walked in from the list, then **reloaded** | Exactly what it did before the reload. | `‹` + `☰` | `/tournaments` (pop) | same | ✓ |
| 16 | `/live/19/match/104` | a row in the Matches tab (drill) | The matches list, where I left it, on the tab I opened it from. | `‹` + `☰` | `/live/19?tab=matches` at **y=211** (pop) | same | ✓ |
| 17 | `/live/5/match/19` | **a Records row in Stats (drill)** | The row I tapped. **Changed from Q6**, which went up to the tournament. | `‹` + `☰` | `/stats?view=overview&sub=records` (pop) | same | ✓ |
| 18 | `/live/5/match/19` | cold deep link | Its tournament. | `‹` + `☰` | `/live/5` (up) | leaves the app | ✓ |
| 19 | `/live/19?tab=matches` | **"Save result" → return (A9.7)** | The Matches tab scrolled to the row I just edited (landed at **y=88**, flashing), and back from there goes up — not into the editor I just left. | – (page action) | `/tournaments` (up) | the match page | ✓ |
| 20 | `/profiles/5` | a row on `/players` (drill) | The players list. | `‹` + `☰` | `/players` (pop) | same | ✓ |
| 21 | `/profiles/3` | **a `PlayerLink` in a tournament's results (drill)** | The tournament. **Changed from Q6**, which went up to `/players`. | `‹` + `☰` | `/live/19?tab=results` (pop) | same | ✓ |
| 22 | `/profiles/4?tab=guestbook&entry=1` | guestbook push, cold | The players page. | `‹` + `☰` | `/players` (up) | leaves the app | ✓ |
| 23 | `/profile` (own) | **Settings → My profile (drill)** | Settings. **Changed from Q6**, which went up to `/players`. | `‹` + `☰` | `/settings` (pop) | same | ✓ |
| 24 | the matchup | a cell in the H2H matrix (drill) | The matrix, exactly as I left it. | `‹` + `☰` | the H2H list (pop) | same | ✓ |
| 25 | the matchup | **"All matches" on a match page (drill)** — **T11** | **The match page.** T11 restored; Q6 had overruled it. | `‹` + `☰` | **`/live/19/match/104` (pop)** | same | ✓ |
| 26 | the matchup | **a rival link on a profile (drill)** | The profile. **Changed from Q6**, which went up to the H2H list. | `‹` + `☰` | `/profiles/1` (pop) | same | ✓ |
| 27 | the matchup | cold deep link | The H2H list — the thing it is a drill-in of. | `‹` + `☰` | the H2H list (up, in place) | leaves the app | ✓ |
| 28 | the matchup | another section tab tapped from inside it (replace) | Nothing to undo: leaving the section consumes the drill-in's entry. | – | the entry behind the matchup | same | ✓ |
| 29 | `/nope` (404) | a stale in-app link (drill) | Where I was. | – | `/stats` (pop) | same | ✓ |
| 30 | `/nope` (404) | cold | Home. | – | `/dashboard` (up) | leaves the app | ✓ |
| 31 | any page | swipe **left** | Nothing, anywhere (Q6 removed the forward gesture). | – | – | – | ✓ |
| 32 | `/stats` Overview | swipe right starting **on the table** | Nothing: the element owns the drag (`data-no-swipe-nav`). | – | – | – | ✓ |
| 33 | iOS standalone PWA | the system edge swipe | The OS gesture, untouched: all four listeners are `{ passive: true }` and nothing calls `preventDefault`. | – | – | – | code |
| 34 | `/live/21` | **a card on the dashboard (drill)** | The dashboard. **Changed from Q6**, which went up to `/tournaments`. | `‹` + `☰` | `/dashboard` (pop) | same | ✓ |
| 35 | `/live/19?tab=matches` | Tournaments tab (jump), **then the page's own `?tab=` replace** | Still the list. The replace wipes `location.state`; re-deriving the kind there would hand N1 straight back. | `‹` + `☰` | `/tournaments` (up) | `/stats` | ✓ |
| 36 | `/live/5/match/19` | a Records row (drill), **then a reload** | "As if walked in" — `sessionStorage` keeps the recorded kind across the reload. | `‹` + `☰` | `/stats?view=overview&sub=records` (pop) | same | ✓ |
| 37 | `/profiles/4?tab=guestbook&entry=…` | the in-app notification bell (drill) | Where I was: the bell is content, not a nav destination, so it carries no mark and back undoes the detour. | `‹` + `☰` | pop | same | code |

**Rows 17, 21, 23, 26 and 34 are the rule working**, not incidental: each is an in-content link whose
back used to climb the hierarchy and now returns to the page it was opened from. **Rows 13 and 35 are
N1** and **row 25 is T11** — the pair that had to pass in the same build, and did.

### Deviations, and the judgement calls

1. **A destination does not consult the arrival, and that is a deliberate reading of the rule.**
   Q6b's sentence — "if you arrived by tapping a nav destination … back goes one level up instead" —
   has one case it does not picture: a tab tap that lands on the destination's **own root**
   (`/players` → Stats tab → `/stats`). Read literally, back there would go *home*. It does not: it
   is the history step you took (rows 2, 3, 4, 6, 8, 9, 11).

   The jump rule exists to stop a jump from being popped **out of a page you were dropped into** —
   "Tournaments" landing on `/live/19` (N1). At a destination root there is nothing deeper to leave,
   the destination's siblings are all one tap away in a bar that is always on screen, and popping is
   both "the page you came from" (Q6b's headline sentence) and the only answer that agrees with the
   browser's own button and the iOS edge on the app's five busiest pages. Going home instead would
   have re-introduced exactly the complaint Q6b was written to fix — back handing you the parent when
   you came from somewhere — on the most common navigation in the app.
   **It is a one-line flip** if Roli wants the literal reading: drop the `place.inside` guard on the
   arrival test in `resolveBackAction`.

2. **Where the mark lives, and which way it fails.** Three homes were possible and each fails
   differently, so the choice is about the failure, not the mechanism:
   - `location.state` alone — **rejected**. `useTabParam` and every stats filter write
     `setSearchParams(…, { replace: true })`, which wipes `location.state`. A jump into `/live/19`
     would be relabelled the moment the page set `?tab=`, and N1 would come back (row 35 is the test
     that would fail).
   - a module-level record keyed by history index — **rejected**. It dies on reload, so
     "reload → as if walked in" (row 36) would silently become "up".
   - **chosen: the `navStack` mirror**, the module already keyed by `history.state.idx` and already
     in `sessionStorage`. The entry grows one optional field. No new module, no new storage key.

   **The mark is put on at the nav links** (`NAV_JUMP_STATE`, the seam Q6b names) but what is
   *stored* is the arrival kind of the entry, written **only on a PUSH** — the one moment
   `location.state` still belongs to that navigation. A REPLACE on the same page keeps the kind, a
   REPLACE onto a different page clears it, a POP reads it back.

   **Degradation is one-directional by construction.** Everything unknown is treated as a jump →
   back goes **up**, which is precisely what the app did under Q6: never a wrong page, only a lost
   scroll offset. Storage blocked or cleared, a session that started before this shipped (the reader
   tolerates the old bare-string entries), a new tab, an index the mirror never saw — all land on
   "up". The opposite polarity (record jumps, assume drill) would have degraded into *popping out of
   a jump*, i.e. straight back into N1, which is the regression Roli has already reported once.

3. **Two controls that are neither a nav tap nor a drill-in carry the mark by hand**: "Save and
   return" and "Cancel" on the match page. Both *leave* the page they sit on; popping straight back
   into an editor the reader just dismissed contradicts the button they pressed, and marking them
   keeps A9.7's verified behaviour (row 19) exactly as it was. They are the only two, and the rule
   for a future one is in `DESIGN.md` §10: mark a navigation that is not a drill-in when you write
   it; never work it out afterwards.

4. **When the page you came from no longer exists.** Back is a *history* operation — neither
   `navigate(-1)` nor the browser's button can ask whether the target still resolves — so the answer
   is not to avoid the pop but to make the landing survivable, and it already is: a deleted
   tournament renders its own "not found" body, calls `forgetLocation` so neither U6 nor the nav bar
   ever returns there, and carries a chevron whose parent (`/tournaments`) is one more back away. A
   404 URL is a destination with `/dashboard` above it. Nothing traps the reader.
   The one case the app *knows* in advance is its own deletion, and that one is now fixed:
   `deleteTournament`'s success navigates with **`replace`** instead of pushing, so the dead page is
   not left in a trail that Q6b pops back along more often than Q6 did. A tournament deleted by
   *someone else* while you are deeper in the app stays in your history and you can pop onto its
   empty state; rewriting history entries from a WebSocket event would be more dangerous than the
   symptom, so it is left.

5. **The edge residue, measured.** The browser's own back button — which is what the iOS edge
   gesture performs — was run against the rows where jump and drill differ:

   | Row | App back | Browser ← / iOS edge |
   |---|---|---|
   | 12 walked into `/live/19` | `/tournaments` | `/tournaments` — same |
   | 17 match from a Records row | `/stats…records` | `/stats…records` — same |
   | 21 profile from a tournament | `/live/19?tab=results` | same |
   | 25 matchup from a match page | `/live/19/match/104` | same |
   | 26 matchup from a profile | `/profiles/1` | same |
   | **13 tournament from the Tournaments tab** | **`/tournaments`** | **`/stats`** |

   So the residue is now exactly **one shape**: after a nav-bar jump, the app honours the destination
   you asked for and the system honours the trail. (Plus the unchanged cold-arrival case, where the
   system leaves the app and the app goes up.) **Nothing further is worth doing.** Removing it would
   mean either suppressing a platform gesture — `preventDefault` on a non-passive touch listener at
   the screen edge, which Q6's constraints forbid and which iOS users would feel immediately — or
   making a jump a `replace`, which would delete the sibling trail the bar depends on. Both places
   the reader can land are sane; the app's is the promise the nav bar made.

**Verification** (isolated stack: backend :8003 on a copy of `app.db` with a scratch secrets file and
its own uploads dir, vite :8020; neither of Roli's ports touched; both stopped and the copies deleted
afterwards).

- **Mobile 390×844, real touch events: 33/33 rows green in one run** — rows 1–34 of the table above,
  including row 19 logged in as an admin, plus the guard rows 31 and 32.
- **The two persistence rows (35, 36): 2/2 green** — the `?tab=` replace after a jump, and a reload
  after a drill-in. These are the rows that fail if the mark is kept anywhere but the mirror.
- **Desktop 1280×900, clicking the chevron: 17/17 green** — every `inside` row, landing exactly where
  the phone's gesture landed.
- **Browser-back probe: 6 rows**, table above.
- **Chrome sweep, 7 pages × {390, 1280} × {blue, light}: 28/28 green** — back+menu on every `inside`
  page and menu alone on every destination at 390, the desktop chevron and no drawer button at 1280,
  `document.querySelectorAll("a a").length === 0`, no horizontal overflow (0 px at both widths), and
  **zero console or page errors on all 28 loads**.
- `cd frontend && npm run check`: typecheck, eslint and **628 tests in 62 files** green (608 in 61
  before: `navJump.test.tsx` is new, `backNavigation.test.ts` and `useBack.test.tsx` gained the rows
  that changed). `npm run build` green.

**Could not be verified off-device — for Roli to check on the phone:**

1. **The edge gesture against the app's own, on a jump.** Deliberately tap Tournaments so it lands on
   the remembered tournament, then compare: the chevron (and a swipe from the middle) should go to
   the tournaments list, an edge swipe should go back to where he was. That is the residue above, and
   it is the one place the two disagree by design.
2. **T11 on the device.** From a match page → "All matches: A vs B" → back should land on the match
   page again. This is the row he named; it passes in Chromium here.
3. **The installed PWA's cold launch** (`useLocationRestore` only runs in `display-mode: standalone`):
   resuming at a match page should behave like row 18 — the restore replaces at index 0, so back goes
   up.
4. **A real push-notification tap** while the app is backgrounded: the service worker's
   `client.navigate()` starts a new document, so it is row 14/18 by construction — verified by
   simulating the URL cold, not by a real tap.
5. **Whether "Save and return" then back should go up** (row 19) or back into the editor. It goes up,
   which is what Q6 verified and what the button's wording promises; the mark on that one call is a
   one-line change either way.


### Q6b — the two flagged calls, ruled by Roli (2026-09-16)

The worker built both one way and flagged each as a one-line flip. Roli was shown both, chose the
built behaviour in both cases, and they are now **settled — do not flip them back**:

- **A top-level page does not consult the arrival.** `/players` → Stats tab → back goes to
  `/players`, not home. The jump rule exists to stop a pop *out of a page you were dropped into*;
  at a root there is nothing deeper to leave, popping *is* "the page you came from", and it is the
  only answer that agrees with the browser button and the iOS edge on the busiest pages in the app.
  The literal reading of Q6b's exception would send it home; rejected.
- **"Save and return" continues outwards.** Back from the matches list goes up to `/tournaments`,
  not into the editor just dismissed. The editor was deliberately finished with; re-opening it is
  the literal reading and reads as undoing the save. Rejected.

---

## Q11 — The sticky grid header pins under the status bar  ☐

Roli, 2026-09-16, with a screenshot of the positions grid scrolled down on his iPhone: *"the player
icons scroll all the way to the top where they are not really visible anymore"*.

**Cause, and it is Q3's.** `ui/shell/useStickyTop.ts` returns the mobile top bar's **measured**
height while it is shown and **0** while it is hidden, and the grid header sticks to that. The bar
auto-hides on scroll-down, so the header's offset becomes 0 — which is correct on a desktop, where 0
is the top of the window, and wrong on a notched iPhone, where the app declares
`apple-mobile-web-app-status-bar-style: black-translucent` and `viewport-fit=cover` (`index.html`)
and therefore **draws underneath the status bar**. The header pins into the strip the clock and the
battery occupy, which is exactly what his screenshot shows: avatars and names present, unreadable.

**The fix is a floor, not an offset.** The sticky top must never go below `env(safe-area-inset-top)`.
Q4 already added the vocabulary for this (`safe-t`/`safe-b`/`safe-l`/`safe-r` in
`tailwind.config.cjs`, documented in `DESIGN.md` §7's Overlay row and §10), so this is that rule
applied to one more surface. Check **every** sticky surface that follows the auto-hiding bar, not
just this one — the same zero is used wherever `useStickyTop` is consumed.

**Verification note:** a desktop browser reports `env(safe-area-inset-top)` as 0, so this bug is
invisible there. Q4's worker drove real inset values through Chromium's CDP
(`Emulation.setSafeAreaInsetsOverride`); read its deviations before claiming a measurement.

**Deviations:**

---

## Q12 — The translucent top bar: does Roli want it?  ☐ (a question, not a defect)

Roli, 2026-09-16: *"is this blurry area because of the ios 27 update or because of something you
did?"*

**Neither.** `.nav-shell` (`styles.css`) paints `rgb(var(--color-bg-default) / 0.8)`, dropping to
**0.55** where `backdrop-filter` is supported, and `MobileChrome`'s header adds `backdrop-blur-md`
(12px). So the bar is deliberately translucent and the page shows through it, blurred. Verified by
reproducing the same wash in Chromium at 390px on his own data, and it predates this session by many
commits (`3af70d3`, the shell rehaul; the `.nav-shell` values come from `f96b893`).

Three dials if he wants it calmer, in increasing order of change: raise the `@supports` opacity from
**0.55** toward the 0.8 non-blur value; increase the blur past 12px so the content behind becomes an
even wash instead of a recognisable shape; or drop translucency entirely and make the bar opaque,
which also removes a compositing layer on a phone. **Do not change it without his word** — it is a
look he has lived with since the shell was built, and the same treatment is on the bottom bar
(`nav-shell` again), so any change should be made to both or deliberately not.

**Deviations:**
