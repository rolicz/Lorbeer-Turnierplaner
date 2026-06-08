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

- [x] **Tournament-name labels**: replaced the two-direction fan with **one uniform
      rotation** (end-anchored, rotate −45, reading bottom-left → top-right) so they
      no longer cross/overlap and the most recent is never clipped; widened the left
      gutter (padL 68) when labels are on so the oldest is fully visible when panned
      to the start. (verified: 14 labels, all anchor=end / rotate −45.)
- [x] **Greyed-out line in Last-N**: the rolling line now emits a value only at
      tournaments the player actually played, so non-participation renders as a
      greyed/dashed gap (matching the dashboard).

## Phase D — Cups streak clarity  (model: **Opus high**)

- [x] **Whose streak?**: reworded `CupCard` history — "Rumpi took it from Atzi ·
      **ended Atzi's 2-tournament reign**" instead of a floating "streak N" (the
      number is now clearly the outgoing owner's reign). Initial "claimed it" rows
      show no reign. Same component → dashboard Cups + stats Cups both updated.

## Phase E — Verification  (model: **Sonnet high**)

- [x] Playwright sweep 390 + 430 + 1366 × both stats modes — **30/30 clean** (0
      console errors, no horizontal scroll). DOM-verified collapse states, uniform
      trend labels, and cups wording; best-case math covered by unit tests (3 pass).
      `npm run check` (76 tests) + build green.

**All phases complete.**

> Note: the live screenshot image budget was exhausted this session, so the trend
> labels / greyed Last-N line / best-case picker were verified via DOM + unit tests
> rather than visual diff — worth a quick eyeball on your end.

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
