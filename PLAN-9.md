# PLAN-9 — TODO-9 fixes

Living plan. Work phase-by-phase, commit per phase, tick boxes as we go. Keep going over
this file until **every** box is checked (per TODO-9 Remarks). Verify each phase with
`npm run check` + build (+ `make test` for backend phases). Commit trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Never** commit `TODO-9.md`.
Push/deploy only on explicit request.

Model plan: **plan on Opus** (this). Implementation — **all phases on Sonnet** (mechanical /
moderate; no deep cross-cutting design). I'll say "switch to Sonnet" once the plan is approved.

---

## Diagnoses already done (live-probed lorbeerkranz.xyz)
- **WS reconnect — FIXED & verified**: handshake now returns `101`. Root cause was the running Caddy stripping `/ws` (stale live config), not auth.
- **"elo says no data in range"** + **"on local I can't see the [participant] names"** = **same cause: your local dev backend is running stale code.** The deployed `/api/stats/ratings/history` returns 200 with data, the deployed bundle has the ELO code, and the deployed list returns `participants`. → **Operational fix: restart the local backend** (`make backend`). No code change. (Tracked in Phase E; will re-verify.)

## Phase A — Tournaments overview (items: finishing order, left bar height) — Sonnet
- [ ] **A1 — participants in finishing order** (`backend/app/routers/tournaments.py` `list_tournaments`): replace the alphabetical participant sort with finishing order. Use `compute_player_standings(matches, players)` + `positions_from_standings(...)` from `stats_core` to order participant ids by final position; for tournaments with no finished matches, fall back to registration order (or alpha). Switch the participant source to `t.players` (selectinload) so it's robust even before matches are generated — this also makes the field populate for tournaments the match-side derivation missed. Re-run `make test` (extend the tournament-list test if one asserts participants).
- [ ] **A2 — left status bar height** (`ui/primitives/List.tsx` + `pages/TournamentsPage.tsx`): the rows grew a third line (participants) so the fixed `h-10` bar looks too small. Make the leading wrapper stretch — `List.tsx` leading `<span className="shrink-0 self-stretch flex items-center">` (only 2 `leading=` callers: TournamentsPage + PlayersAdminPage, both centered children stay centered → safe), and change the TournamentsPage bar from `h-10` to `self-stretch` so it fills the row height.

## Phase B — Dashboard "Last 5" = per-tournament PPM (match stats) (item: Dashboard) — Sonnet
**Decision (confirmed):** dashboard "Last 5" must show the **same metric as stats Trends "Last N" with Per-match on** = rolling average, over the last N **tournaments** the player played, of each tournament's **PPM** (points ÷ matches that tournament).
- [ ] **B1** (`pages/dashboard/TrendsPreviewCard.tsx`): the "Last 5" (lastN) view currently rolls per-tournament **totals** (PLAN-8 A2). Change the per-tournament value fed into the rolling average from `sum` (total points) to `sum / matchesPlayedThisTournament` (per-tournament PPM), then `avgLast(tPpmTimeline, formN)`. Keep "Total" = cumulative points. Keep PLAN-8 styling (border, labels). yMax ≈ 3 (dynamic).
- [ ] **B2 — deep-link consistency**: the dashboard "open full trends" nav currently passes `trendsView: rolling, trendsMetric: points`. Add `trendsPerMatch: true` to the nav state and have `TrendsExplorer` read it into the initial `perMatch` so clicking through lands on the identical metric (rolling + per-match). (Stats "Last N" already rolls over tournaments, so with per-match on the two now match.)

## Phase C — Stats / Positions scroll trap (item: Positions) — Sonnet
- [ ] **C1** (`pages/stats/StatsInsights.tsx` `PositionsView`): the `overflow-x-auto` container is a 2-axis scroll container that traps vertical touch (the window is the page scroller). Add `touch-action: pan-x` (`touch-pan-x`) so vertical gestures pass to the page while horizontal table scroll still works. Header cells keep their `touch-none` (column drag) — verify drag-reorder still works. **Verify on mobile** (I can't screenshot); if the sticky header misbehaves we iterate.

## Phase D — Stats / H2H matrix per-metric colors (item: H2H) — Sonnet
- [ ] **D1** (`pages/stats/StatsInsights.tsx` `H2HView`): the cell background is always win%-based (`h2hTone(pct)`). Color by the selected metric for **played**, **goal diff**, **rivalry**; keep win%-tone for **win% / W-D-L / PPM** (correlated with win%). Implement a `cellColor(v, matrixMetric, ranges)`:
  - winrate / wdl / ppm → `h2hTone(v.pct)` (unchanged)
  - played → sequential intensity normalized by max played across cells
  - gd → diverging (negative red → positive green) centered at 0
  - rivalry → sequential intensity normalized by max rivalry across cells
  - Precompute min/max (played, |gd|, rivalry) over all cells once per render for normalization.

## Phase E — Verification + operational notes
- [ ] `npm run typecheck` + `npm run lint` + `npm run build` green; `npm run check` (vitest).
- [ ] Backend `make test` green.
- [ ] **Restart local dev backend**, then confirm locally: ELO trend shows data, and tournament participant names render. (Resolves the two "local" TODO-9 items — no code.)
- [ ] Manual/mobile sanity: Positions scrolls to the bottom over the grid; H2H colors change per metric; dashboard shows PPM; tournament names in finishing order with full-height bar.

---

## Notes
- Items "elo no data" and "local can't see names" need **no code** — just a local backend restart (deploy already works). Phase A2/A1 still improve the participants feature regardless.
- After all phases: same deploy flow as before (push → on deploy host `git pull` → `docker compose build` → `up -d`). Nothing pushed without explicit request.
