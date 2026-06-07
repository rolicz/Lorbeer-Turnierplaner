# Redesign Plan 4 — from TODO-4.md

Living plan — fourth feedback round. Work top-to-bottom, **check items off as they
land**, keep going until every box is checked. Each phase: `npm run check` + build
green, verified at 390/430/1366px (zero console errors, no horizontal scroll).
Commit per step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase A — Trends zoom + Last-N + win% view  (model: **Opus xhigh**)

- [x] **Real horizontal zoom (plot stays fixed size)**: the current pinch widens the
      SVG/grows it. Rewrite to a **fixed-size plot** with a `[viewStart,viewEnd]`
      time window: **two-finger pinch zooms the x-axis** (narrows/widens the visible
      date window around the pinch midpoint), **one-finger drag pans** the window.
      No SVG resize, no vertical change, no scroll container. Month ticks recompute
      for the window.
- [x] **Bring back "Last N"**: stats Trends gets a clear **Last N** view (the
      rolling-window view, window slider = N, default 10) so it matches the
      dashboard's "Last 10"; dashboard "Last 10 / Total" deep-links to Last-N /
      Cumulative.
- [x] **Win % view highlight**: when Win % is selected (cumulative disabled), the
      currently-shown view must stay highlighted in the chip group (use the
      effective view, don't leave it blank).

## Phase B — Stats: positions, records, cups  (model: **Opus high**)

- [x] **Positions cup markers**: stop using the left gutter — render the cup
      crown(s) in the **top-right corner of the tournament winner's cell** (can be
      multiple); reclaim the name-column width.
- [x] **Positions**: remove the explanation paragraph.
- [x] **Records ties**: when several matches share a record value, show **all** of
      them (not just one).
- [x] **Cups tab reuse**: the stats Cups tab should reuse the dashboard cup
      component (`CupCard`) instead of its own bespoke rendering.

## Phase C — Player profile  (model: **Opus high**)

- [x] **"View all matches"**: move it out of the very bottom (into the section
      header as a right-aligned link) so it isn't clipped near the screen edge.
- [x] **Stats tab upper half**: replace the stat **pills** with a nicer
      representation reusing the stats **Player** look — **StatTiles** (key numbers)
      **+ the Radar "profile net"** (attack / defense / win% / form / activity).
      Keep the streaks block. Reuse `Radar` (already exported) + shared tiles.

## Phase D — Live tournament  (model: **Opus high**)

- [x] **Select Clubs header/body**: the clickable header and the section it opens
      have mismatched colours — unify into one consistent surface. Improve the
      **stars/league** filter UI (keep the random/dice options, but on-brand
      controls instead of raw selects). Update **everywhere** `SelectClubsPanel` is
      used.
- [x] **Comment composer**: restyle the "enter comment" form to match the flat app
      language (inputs/buttons/scope select).
- [x] **Matches tab**: streamline — the match rows use far too much space; make a
      denser, flat list consistent with the rest.

## Phase E — Verification  (model: **Sonnet high**)

- [x] Playwright sweep 390 + 430 + 1366 × both stats modes — zero console errors, no
      horizontal scroll; confirm pinch-zoom changes the x-axis only (plot fixed);
      `npm run check` + build green.
      → 30/30 checks clean (0 errors, no hscroll); CDP pinch kept the SVG at
        340×240 while narrowing the x-window (Reset zoom appeared); win% keeps
        the effective view (Last N) highlighted; `npm run check` + `npm run build`
        both green.

**All phases complete.**

---

## Interpretations (proceeding unless you say otherwise)
- **"Last N"** → I'll surface the existing rolling-window view as **"Last N"** (per
  the window slider) so it reads the same as the dashboard's "Last 10". (If you want
  a distinct per-match form line that differs from the per-event rolling avg, say so.)
- **Positions crown on "winner" cell** → the tournament winner = the #1-placed
  player's cell for that tournament; cups at stake stack in its top-right corner.
- **Profile radar axes** → same five as the stats Player radar (Attack / Defense /
  Win % / Form / Activity), computed relative to the field.

## Notes
- Frontend-only; classic stats stays available via Settings → Experiments.
- Shared components touched (`SelectClubsPanel`, `TournamentCommentsCard`,
  `MatchList`, `CupCard`, `Radar`) update everywhere they're used.
