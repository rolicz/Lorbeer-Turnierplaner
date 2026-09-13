# Lorbeerkranz Frontend

Responsive, mobile-first React + Vite + TypeScript PWA for the tournament backend.
See `../AGENTS.md` for project knowledge and `../DESIGN.md` for the visual canon.

## Run

Needs **Node ≥ 20.19 (or ≥ 22.12)** — Vite 7's floor. `../.nvmrc` pins 24; from the repo root
`make frontend` picks the right version automatically (via `../scripts/node-env.sh`).

```bash
npm install
cp .env.example .env.local     # or edit .env.local directly
npm run dev -- --port 8000     # or, from the repo root: make frontend
```

`.env.example` points at a local backend on `http://127.0.0.1:8001` (`VITE_API_BASE_URL`) and
`ws://127.0.0.1:8001` (`VITE_WS_BASE_URL`). Vite variables are **build-time**, so a change needs a
restart (dev) or a rebuild (Docker image). `.env.production` is committed and uses same-origin
routing (`/api`, WS derived from `window.location`).

## Scripts

```bash
npm run dev         # vite dev server (defaults to :8000, host true)
npm run build       # tsc -b && vite build → dist/
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest run
npm run check       # typecheck + lint + test — run this before every commit
```

## Routes (`src/app/App.tsx`)

| Path | Page | Min role |
|---|---|---|
| `/` | redirects to `/dashboard` | — |
| `/dashboard` | dashboard (overview / cups via `?tab=`) | reader |
| `/tournaments` | tournament list + create (`?tab=all\|new`) | reader (create: editor) |
| `/live/:id` | live tournament (`?tab=overview\|current\|standings\|matches\|comments\|controls`) | reader (controls: editor+) |
| `/live/:id/match/:mid` | match detail (`?tab=h2h\|comments\|edit`) | reader |
| `/friendlies` | friendly matches (`?tab=all\|create`) | reader |
| `/stats` | stats (see below) | reader |
| `/players` | players list / admin (`?tab=players\|add`) | reader (add: admin) |
| `/profile` | own profile | reader |
| `/profiles/:id` | a player's profile (`?tab=overview\|stats\|matches\|guestbook`) | reader |
| `/clubs` | club management (`?tab=browse\|new`) | editor |
| `/settings` | settings (`?tab=account\|appearance\|notifications`) | reader |
| `/login` | password login → JWT | — |
| anything else | `NotFoundPage` | — |

`/tournaments/new` and `/tools` are legacy redirects (`→ /tournaments?tab=new`, `→ /friendlies`).

**Tab state lives in the URL as `?tab=`** on every tabbed page, so every tab is deep-linkable and
an unknown or role-forbidden value falls back to the page's default. Eight pages share the
`ui/shell/useTabParam.ts` hook; `LiveTournamentPage` keeps its own `?tab=` state because its
default depends on the tournament's status.

### Stats URL scheme (`/stats`)

| Param | Values | Meaning |
|---|---|---|
| `view` | `overview` \| `trends` \| `h2h` \| `player` | top-level section |
| `sub` | overview: `table\|positions\|streaks\|records\|cups` · h2h: `players\|duos` | sub-view |
| `mode` | `overall` \| `1v1` \| `2v2` | global Mode filter (filter pill) |
| `source` | `tournaments` \| `both` \| `friendlies` | global Source filter (filter pill) |
| `player` | player id | the player the Player and H2H sections focus on |
| `vs` | player id | opens the **Matchup** drill-in (`player` vs `vs`) inside H2H |
| `rel` | `together` | deep links only: open the matchup on "Together" instead of "Against" |

Stats params are written with `replace`, so the browser Back button leaves `/stats` instead of
walking its filters; in-view back buttons undo the drill-ins. Older URL shapes (`?view=table`,
`?section=h2h`, `#trends`, …) are mapped onto the canonical pair once by
`pages/stats/statsNav.ts` and rewritten in place.

## Shell & navigation

- `ui/shell/AppShell.tsx` wraps everything: desktop `Sidebar`, mobile `MobileChrome` (top bar +
  drawer) and the mobile-only `BottomTabBar`. The five bottom-bar destinations are Dashboard ·
  Tournaments · Friendlies · Stats · Players; the editor-only Clubs destination and the Settings
  link live in the sidebar and the drawer only. All three shells read the same
  `ui/shell/navConfig.tsx`.
- Each top-level destination remembers the last page open inside it (`ui/shell/lastLocation.ts`),
  so tapping "Tournaments" returns to the live tournament and tab you were on; tapping the
  destination you are already in goes to its root.
- Back is **hierarchical**, not "wherever you came from": `ui/shell/backNavigation.ts` decides
  pop-vs-up once, and both the top-bar chevron and the swipe-right gesture (`useSwipeNav`) ask it.
  Any horizontally draggable element must carry `data-no-swipe-nav`.
- Scroll position is app-managed (`useScrollRestoration` for history entries, `useReturnScroll`
  for in-page view swaps like tabs and the stats matchup).

## Notes

- TanStack Query for caching; **always** build keys with the `qk` factory (`src/api/queryKeys.ts`).
- API types are generated from the backend OpenAPI schema into `src/api/generated/schema.d.ts`
  (`make gen-types` at the repo root) — never hand-edit them.
- WebSockets (`src/hooks/realtime/`) merge live tournament/comment events into the query cache.
- Icons are `lucide-react` components only; flags come from `flag-icons`. Nothing is fetched from
  a CDN at runtime.
- Tests are vitest + jsdom in `src/test/`.
