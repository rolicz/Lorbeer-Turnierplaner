# Redesign Plan 3 — from TODO-3.md

Living plan — third feedback round. Work top-to-bottom, **check items off as they
land**, keep going until every box is checked. Each phase: `npm run check` + build
green, verified at 390/430px + 1366px (zero console errors). Commit per step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase A — Stats: trends + table + H2H  (model: **Opus xhigh**)

- [ ] **Trends — labels don't shrink the plot**: showing tournament names must
      *add* height below the plot, not reduce the plotting area. Keep `innerH`
      constant; grow the SVG total height when labels are on.
- [ ] **Trends — pinch-zoom + scroll in the plot**: two-finger horizontal pinch
      inside the plot changes the horizontal scale (px/month); one-finger drag pans
      (native horizontal scroll). Clamp zoom; keep `data-no-swipe-nav`.
- [ ] **Table — GF/GA/GD = one toggle**: collapse GF, GA, GD into a single
      "GF-GA-GD" chip; collapse the per-match goals (G/M, GA/M, GD/M) into a single
      "per-match" chip.
- [ ] **H2H matrix — add W-D-L metric**: matrix metric switch gains a "W-D-L"
      option (cell shows the row's record vs column).

## Phase B — Stats: positions + stars + player  (model: **Opus high**)

- [ ] **Positions — gold cup line**: the main cup uses key `default` (gold) and was
      being filtered out → include it so the gold lineage line + gold crown show.
- [ ] **Positions — cup lineage always on**: remove the toggle; always draw the
      per-cup lineage lines.
- [ ] **Positions — narrower names / save space**: shrink the name column and rely
      on 2-line wrapping for long names; keep all row heights equal.
- [ ] **Positions — relocate cup indicators**: move the crown(s) out of the
      tournament-name cell into their own tidy spot (e.g. a slim leading marker
      column) so names get the width.
- [ ] **Stars** — restyle to the flat list language (consistent with the rest).
- [ ] **Player** — players are clickable through to the full profile
      (`/profiles/:id`) and back returns to stats (verify the hardened back path).

## Phase C — Dashboard + Tournaments + Clubs  (model: **Opus high**)

- [ ] **Dashboard back-to-tab**: persist the dashboard tab in the URL (`?tab=cups`)
      so opening a tournament and going back lands on the same dashboard tab.
- [ ] **Dashboard trends → stats deep-link**: show a meaningful stat that's also a
      stats option (cumulative **Points**); clicking opens the stats **Trends** tab
      pre-set to that metric/view (pass via URL; `StatsInsights` reads initial
      trends config).
- [ ] **Tournaments list — group by month**: month subheaders (e.g. "May 2026")
      over the flat rows.
- [ ] **Clubs list** — bring the grouped list fully in line with the flat design
      (section-label group headers + `list-divided` rows; lighter group chrome).

## Phase D — Live tournament  (model: **Opus high**)

- [ ] **Select Clubs + match comments**: the collapsible toggle is too small —
      give these a clear, properly-sized header (full-width, obvious tap target);
      tidy the Select Clubs layout. Fix in the shared components so every reuse
      (`TournamentCommentsCard`, `SelectClubsPanel`) updates everywhere.
- [ ] **Standings fit on screen**: the wide table scrolls off even on big phones.
      Redesign to fit the viewport with **no horizontal scroll** — stack the player
      details on the left over multiple lines (rank/name on line 1, secondary
      figures on line 2) and keep only the essential right-aligned columns.

## Phase E — Verification  (model: **Sonnet high**)

- [ ] Playwright sweep 390 + 430 + 1366 across all routes × both stats modes — zero
      console errors; confirm standings fit (no horizontal scroll) at 430px; confirm
      gold lineage line visible; `npm run check` + build green.

---

## Interpretations (proceeding unless you say otherwise)
- **"collapsible too small"** (Phase D) → the match-comments / select-clubs section
  header I flattened is too subtle to tap; I'll make it a clear full-width header
  with a visible chevron. If you instead meant "don't make them collapsible at all,"
  say so and I'll keep them always-expanded.
- **Dashboard meaningful stat** → cumulative total **Points** (the league-table
  metric). Tell me if you'd rather it default to PPM or Win %.
- **Players clickable** (Phase B) → the stats Player view + table/H2H names link to
  the full `/profiles/:id` page (not just the in-stats Player tab).

## Notes
- Frontend-only; classic stats stays available via Settings → Experiments.
- Shared components touched (`MatchHistoryList` already done; `SelectClubsPanel`,
  `TournamentCommentsCard`, `StandingsTable`) update everywhere they're used.
