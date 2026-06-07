# Redesign Plan 2 — from TODO-2.md

Living plan — second feedback round on the rehaul. Work top-to-bottom, **check
items off as they land**, keep going until every box is checked. Each phase:
`npm run check` + build green, verified at 390px (mobile-first) + 1366px with the
Playwright sweep (zero console errors). Commit per coherent step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase A — Quick wins & the back-nav crash  (model: **Opus high**)

- [ ] **Sidebar / drawer brand icon**: replace the generic `fa-trophy` badge with
      the real app icon (`/icon-512.png`) in `Sidebar.tsx` + `MobileChrome` drawer
      header (rounded `<img>`).
- [ ] **Live tournament**: remove the top **Refresh** button — rely on pull-to-
      refresh only (keep the mark-all-read button).
- [ ] **Profile → Players back crash**: couldn't reproduce headless (players →
      profile → back = 0 errors), so it was likely transient HMR. Harden anyway:
      add a route-level **ErrorBoundary** so a render error shows a recoverable
      message instead of a white screen; double-check the swipe gesture can't fire
      `nav(-1)` twice; verify the `?unread=1` history-replace doesn't strand back.

## Phase B — Dashboard + Live consistency  (model: **Opus high**)

- [ ] **Dashboard "Live now"**: stop nesting it in cards — render the live match
      with the same flat treatment as the live **Current** tab (reuse
      `MatchOverviewPanel` as the single surface; drop the `card-outer`/`card-inner`
      wrapping).
- [ ] **Dashboard cups**: flatten the cup-ownership block to a clean holder row
      (avatar + name + reign), consistent with the new **Cups** stats view.
- [ ] **Live → Select Clubs**: redesign `SelectClubsPanel` chrome — drop the heavy
      collapsible card; lay the two `ClubCombobox`es out cleanly with compact
      star/league filters + randomize, on-brand and flat. (Combobox itself stays.)
- [ ] **Live → Match comments**: rework the match-comments section in
      `CurrentGameSection` for a cleaner look and an obvious **Add comment** action.
- [ ] **Live → Standings**: render standings with the **stats-table** visual
      (sticky player column, flat rows) — **fixed (non-selectable) columns**, all
      info visible (pos, P, W, D, L, GF, GA, GD, Pts; horizontal scroll if needed).

## Phase C — Stats refinements  (model: **Opus xhigh**)

- [ ] **Trends — labels**: tournament-name labels must be fully readable (no `…`
      truncation) — wrap to two lines / angle so they fit.
- [ ] **Trends — non-participation**: restore the *greyed line* (connect across a
      skipped tournament but render that segment muted) instead of a hard gap.
- [ ] **Trends — metric modifier**: one set of metrics (Points / Goals / Conceded /
      Goal diff / Win %) **+ a single "Per match" toggle** that divides absolute
      metrics by matches played — remove the separate "Pts/match" metric.
- [ ] **Trends — no zoom control**: drop the zoom slider; fixed plot density,
      **scroll directly inside the fixed-size plot**.
- [ ] **Table**: collapse W / D / L into **one "W-D-L" toggle**; add a **GD/M**
      (goal-diff per match) column option.
- [ ] **Positions — flip axis**: tournaments in **rows**, players in **columns**;
      show the **full tournament name** (wrap to 2 lines if long, equal row height).
- [ ] **Positions — laurel line**: toggle a line connecting the **laurel winners**
      across tournament rows (one line per cup, drawn in that cup's colour).
- [ ] **Positions — cup-at-stake icons**: show the actual cup icon(s) of the cups
      at stake (can be multiple) instead of a generic crown.
- [ ] **H2H matrix — metric switch**: chip to choose the cell metric (Win % default,
      plus e.g. Played / Goal diff); recolour accordingly.
- [ ] **H2H — clarify "Top rivalries"**: add a one-line explanation of the rivalry
      score (balance × volume), or rename, so its meaning is obvious.
- [ ] **Streaks**: re-present with the flat section/list language (section labels +
      `list-divided` rows) consistent with the rest of the app.
- [ ] **Player**: label the sparkline next to the name (e.g. "recent form") so its
      meaning is clear.

## Phase D — Friendlies + verification  (model: **Sonnet high**)

- [ ] **Friendlies list**: streamline `MatchHistoryList`'s group/match styling to
      the flat language (this also lifts profile/stats match lists consistently).
- [ ] Playwright sweep 390 + 1366 across all routes × both stats modes — zero
      console errors; spot-check light theme; `npm run check` + build green.

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
