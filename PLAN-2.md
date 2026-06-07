# Redesign Plan 2 — from TODO-2.md

Living plan — second feedback round on the rehaul. Work top-to-bottom, **check
items off as they land**, keep going until every box is checked. Each phase:
`npm run check` + build green, verified at 390px (mobile-first) + 1366px with the
Playwright sweep (zero console errors). Commit per coherent step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase A — Quick wins & the back-nav crash  ✅

- [x] **Sidebar / drawer brand icon** → real app icon (`/icon-512.png`).
- [x] **Live tournament**: removed the top Refresh button (pull-to-refresh only).
- [x] **Profile → Players back crash**: couldn't reproduce (0 errors); added a
      route-level `RouteErrorBoundary` (recoverable, resets on nav) + a swipe-nav
      debounce so it can't double-pop with native edge-swipe.

## Phase B — Dashboard + Live consistency  ✅

- [x] **Dashboard "Live now"** → single flat `MatchOverviewPanel` under a label
      (same as the live Current tab); Trends preview also de-carded.
- [x] **Dashboard cups** → flat holder row + title-history list (matches Cups view).
- [x] **Live → Select Clubs** → flat always-visible "Select clubs" section
      (dropped the collapsible card; searchable comboboxes + compact filters).
- [x] **Live → Match comments** → flattened collapsible header to section-label.
- [x] **Live → Standings** → stats-table visual (one table, sticky player column,
      fixed columns P/W/D/L/GF/GA/GD/Pts, rank+delta+badges, horizontal scroll).

## Phase C — Stats refinements  ✅

- [x] **Trends labels**: full tournament names, no `…` truncation.
- [x] **Trends non-participation**: greyed dashed segment across skipped tournaments
      (instead of a hard gap).
- [x] **Trends metric modifier**: single **Per match** toggle (dropped the separate
      Pts/match metric; disabled for Win %).
- [x] **Trends no zoom control**: removed the slider; fixed plot density, scroll the
      plot horizontally.
- [x] **Table**: one **W-D-L** toggle; added **GD/M** column.
- [x] **Positions flip**: tournaments rows / players columns; full 2-line names,
      equal row height.
- [x] **Positions laurel line**: "Cup lineage" toggle — one line per cup (cup
      colour) connecting the cup owner's cells across at-stake tournaments.
- [x] **Positions cup-at-stake icons**: real cup-coloured crown(s), multiple.
- [x] **H2H matrix metric switch**: Win % / Played / Goal diff (colour = win rate).
- [x] **H2H "Top rivalries"** explained inline.
- [x] **Streaks**: flat section/list language.
- [x] **Player**: labelled the recent-form sparkline.

## Phase D — Friendlies + verification  ✅

- [x] **Friendlies list**: `MatchHistoryList` flattened (group header + hairline-
      divided match rows; no card-in-card) — also lifts profile/stats match lists.
- [x] Playwright sweep 390 + 1366 across all 11 routes × both stats modes — **zero
      console errors**; `npm run check` (typecheck + eslint + 71 tests) + build green.

---

## Interpretations (proceeding unless you say otherwise)
- **Positions laurel line "correct tournament colours"** → tournaments have no
  intrinsic colour, so I'll colour each connecting line by the **cup** at stake
  (one line per cup, using `cupColors`); a tournament with no cup isn't connected.
- **Standings non-selectable** → fixed column set (unlike the stats Table), all
  columns always shown.
- **"Per match" + Win %** → the Per-match toggle is ignored/disabled while Win % is
  selected (it's already a rate).

## Notes
- Frontend-only; classic stats stays available via Settings → Experiments.
- Shared components (`MatchHistoryList`, `SelectClubsPanel`, `StandingsTable`) are
  used in several places — restyling them lands consistently everywhere.
