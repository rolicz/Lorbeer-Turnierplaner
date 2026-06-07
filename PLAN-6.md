# Redesign Plan 6 — from TODO-6.md

Living plan — sixth feedback round. Work top-to-bottom, **check items off as they
land**, keep going until every box is checked. Each phase: `npm run check` + build
green, verified at 390/430/1366px (zero console errors, no horizontal scroll).
Commit per step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked on user

---

## Phase A — Defaults + live-tab collapse states  (model: **Opus high**)

- [x] **Last-N default = 5**: stats Trends slider (`rollN`), Table slider (`nWin`),
      and the dashboard preview (`formN` + "Last 10"→"Last 5") all default to 5.
- [x] **Collapse Select Clubs when clubs already chosen**: `SelectClubsPanel` now
      opens collapsed when both sides already have a club, open otherwise; removed
      the hardcoded `defaultOpen={false}` in CurrentGameSection (verified: empty match
      → open).
- [x] **Expand Match comments by default**: already `defaultCollapsed=false`; verified
      the live "Match comments" starts expanded.
- [x] **Auto-comment investigation**: confirmed — `create_comment` is the only writer,
      no seed, nothing in the create-tournament path creates a comment. The stray
      "2' 0-1 A" is leftover data, not a bug. No code change.

## Phase B — Standings best-case fix  (model: **Opus high/xhigh**)

- [x] **Icon player picker**: best-case selector now uses the shared avatar
      `PlayerPicker` (click an icon) instead of a dropdown.
- [x] **Simulate rival games (realistic points, 1v1 + 2v2)**: extracted a pure,
      unit-tested `computeBestCase` (3 tests pass) — focus wins out, rival-vs-rival
      games are brute-forced (points conserved) to minimise the focus rank, 2v2
      teammates both gain, no impossible zeros. ~~the current projection assumes all
      rivals gain~~ nothing, which is impossible (rival-vs-rival games must
      hand out points). Fix:
      - Focus player wins **all** their remaining games; the remaining
        **rival-vs-rival** games are simulated (brute-force every win/draw/loss
        outcome, conserving points) to find the focus player's genuinely highest
        reachable rank.
      - The projected table shows **one consistent, realistic scenario** — every
        displayed total is the result of actual simulated results (no impossible 0s,
        e.g. Flo/Roli can't both stay on 0 if they still play each other).
      - **2v2-correct**: results apply to *both* players on a side — a win gives both
        teammates +3 (and the focus player's **partner** gains in focus matches), a
        draw gives all four +1. Sides are handled as player-id sets, not single ids.
      - Cap the brute force (≈ ≤12 remaining rival matches) with a points-conserving
        fallback beyond that (never the all-zero projection).

## Phase C — Stats Trends  (model: **Opus high**)

- [ ] **Tournament-name labels**: stop the center overlap (the two-direction fan was
      wrong). Use **one uniform rotation** reading bottom-left → top-right so the most
      recent label is never clipped, and make the labelled chart horizontally
      reachable (scroll/pan + padding) so the **first** tournament name can be seen
      fully.
- [ ] **Greyed-out line in Last-N**: the stats Trends Last-N (rolling) line should
      mark non-participation as a greyed/dashed segment like the dashboard does —
      emit the rolling value only at tournaments the player actually played, so gaps
      render dashed.

## Phase D — Cups streak clarity  (model: **Opus high**)

- [ ] **Whose streak?**: a title-change row's `streak_duration` is the **outgoing**
      owner's reign. Reword `CupCard` so it's unambiguous — e.g. "Atzi took it from
      Berni · **Berni's reign: 1**" instead of a floating "streak 1". Applies to the
      dashboard Cups page and the stats Cups tab (same `CupCard`).

## Phase E — Verification  (model: **Sonnet high**)

- [ ] Playwright sweep 390 + 430 + 1366 × both stats modes — zero console errors, no
      horizontal scroll; verify best-case rival math, icon picker, trend labels +
      greyed Last-N line, cups wording; `npm run check` + build green.

---

## Investigations (done during planning)
- **Auto-comment**: `create_comment` is the only path that writes a comment; the
  create-tournament router writes none and there is no comment seed. The stray
  "2' 0-1 A" is pre-existing data on that tournament, not auto-created.
- **Cup streak_duration**: in `services/cup.py`, a transfer entry stores the *old*
  owner's accumulated reign as `streak_duration`, then resets to 1 for the new
  owner — hence the confusing "took it from X · streak N" (N is X's ended reign).
- **PlayerPicker** (`pages/stats/PlayerPicker`) is the shared avatar/icon selector;
  reuse it in the live StandingsTable.

## Interpretations (proceeding unless you say otherwise)
- **Last-N default 5** applies everywhere a Last-N value exists, including relabeling
  the dashboard preset to "Last 5".
- **Collapse Select Clubs** = collapsed when *both* sides already have a club.
- **Best case** keeps the TODO-5 intent (focus wins out, ties to focus) but now
  honours that rival-vs-rival games distribute points, every projected total is
  realistic (no impossible zeros), and it works for **2v2** (points go to both
  teammates on a side, including the focus player's partner).

## Notes
- Frontend-only; shared components (`SelectClubsPanel`, `PlayerPicker`, `CupCard`,
  `TrendChart`) update everywhere they're used.
