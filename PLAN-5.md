# Redesign Plan 5 — from TODO-5.md

Living plan — fifth feedback round. Work top-to-bottom, **check items off as they
land**, keep going until every box is checked. Each phase: `npm run check` + build
green, verified at 390/430/1366px (zero console errors, no horizontal scroll).
Commit per step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked on user

---

## Phase A — Consistent player colours everywhere (foundation)  (model: **Opus high**)

Cross-cutting and flagged "super important". Today colours come from
`colorForIdx(idx, total)` where `idx` = position in the *current* list and `total`
varies per view → the same player gets different colours on dashboard vs trends vs
radar.

- [x] **Stable per-player colour**: `buildPlayerColorMap(playerIds)` in
      `trendsMath.ts` + `usePlayerColors()` hook (queries the full roster via
      `listPlayers`) → each player gets a fixed hue from a stable ordering (id
      ascending), independent of subset/selection.
- [x] Replace `colorForIdx` usages with the stable mapping in: stats Trends
      (`StatsInsights` series + legend chips), classic `TrendsCard`, dashboard
      `TrendsPreviewCard`. (Positions lines are cup-coloured, not player-coloured;
      Player radar gets it in Phase F.)
- [x] Verified: a player keeps one colour across Dashboard ↔ Trends (Atzi blue,
      Roli red, Mike magenta, Berni cyan, Rumpi green, Flo yellow in both).

## Phase B — Header / navbar live indicator  (model: **Opus high**)

- [x] **Move the indicator to the right** of the top bar (`MobileChrome`; desktop
      `Sidebar` footer unchanged) — title takes the slack, indicator pinned right.
- [x] **Differentiate states** using `/tournaments/live` + `RealtimeStatusContext`:
      **Live** (a live tournament is running, pulsing) vs **Connected** (WS up, no
      live tournament, steady) vs **Reconnecting** / **Offline**.
- [x] **Clickable when live**: when a tournament is live the indicator is a button →
      navigates to `/live/{tid}` (current match); plain span otherwise. Verified the
      click lands on `/live/16`.

## Phase C — Dashboard trends  (model: **Opus high**)

- [x] **Full-width trends overview**: root cause was the preview's ResizeObserver
      bailing on a null ref (chart mounts conditionally after data) → width stuck at
      320. Switched to a callback ref that re-attaches on mount; chart now fills.
- [x] Player line colours use the Phase A mapping (consistency).
- [x] ~~Moving average~~ → per user: keep the existing Last-N average; no separate
      moving-average overlay. (Add a small "(last N tournaments)" clarifier on the
      Trends Last-N control so the unit is unambiguous.)

## Phase D — Live tournament  (model: **Opus high**)

- [x] **Current — cleaner inline entry**: reordered Select Clubs so the **club
      pickers lead** (primary task first), with a clear "Random matchup" action and
      the Stars/League controls demoted to a "Filter the club list" section instead
      of dominating the top. Comment composer already flattened in PLAN-4 (flat
      surface, on-brand selects, Cancel/Post footer).
- [x] **Standings — best-case potential positions**: "Best-case positions" section
      below standings — pick a player (FilterSelect) → projected table + their highest
      reachable rank (focus wins all remaining; rivals gain nothing; focus wins ties).
      Reuses the row/avatar elements; gated to live tournaments with remaining games.
- [x] **Matches — compact by default**: default the match list to Compact (was
      compact only < 640px).
- [x] **Admin — restyle**: flattened `AdminPanel` — single header (wrap={false}),
      status chips, section-label/divider sections (Actions / Date / Name / Decider),
      decider winner/loser use on-brand `FilterSelect`, type chips match the app.

## Phase E — Stats, part 1 (contained items)  (model: **Opus high**)

- [x] **Trends label cutoff**: right-half tournament labels now tuck down-LEFT
      (end-anchored, rotate −45) so the most-recent label stays on-plot; left half
      fans down-right as before.
- [x] **Records — consistent box colour**: record + longest-run boxes switched from
      the bright `card-chip` to the muted `.surface` used by the player-stats tiles.
- [x] **Records — show ties for longest runs**: streak records now collect every
      player tied at the record length (limit bumped to 20) and list them all with a
      ×N badge.
- [x] **Cups — fix "defended"**: show **defenses = participated − 1** (only when > 0)
      in `CupCard`, so a fresh win reads as 0 defended (verified: Rumpi/Mike show no
      suffix).
- [x] **H2H — drop matrix explanation**: removed the paragraph above the matrix.
- [x] **H2H — 2v2 teammate synergy**: 2v2 mode adds a "Teammate synergy" section —
      best partner / toughest pairing cards + a per-partner list (played · W-D-L ·
      ppm), computed from the selected player's 2v2 matches grouped by partner.
- [x] **Player — matches list consistency**: already uses the shared
      `MatchHistoryList` (both insights `PlayerProfile` and classic
      `PlayerMatchesCard`) — no change needed.

## Phase F — Stats, part 2 (interactive)  (model: **Opus high/xhigh**)

- [x] **Table — Last N toggle** *(unit = last **N tournaments**)*: Last-N toggle +
      slider (N=10, 2–20); recomputes all columns over each player's last N
      tournaments (fetched per player, shared cache). Elo chip/column is struck out &
      hidden when on. Verified the numbers + order change vs all-time.
- [ ] **Positions — drag to reorder**: let the user drag a player column to reorder
      it; the position lines update dynamically. Keep player **icons sticky** (column
      header stays visible) when scrolling down.
- [x] **Player — radar overlay**: `Radar` now takes a `series` array; the Player tab
      "Profile net" overlays the selected player + any toggled "Compare with" players,
      each in their consistent Phase-A colour (with colour-dot chips).

## Phase G — Verification  (model: **Sonnet high**)

- [ ] Playwright sweep 390 + 430 + 1366 × both stats modes — zero console errors, no
      horizontal scroll; verify colour consistency, header live/click, standings
      best-case, positions drag + sticky icons, radar overlay; `npm run check` +
      build green.

---

## Interpretations (proceeding unless you say otherwise)
- **Player colours** → fixed per player from the full roster ordering; subsets and
  selection order never change a player's colour. This is the single source of truth
  reused by trends, dashboard, positions, and radar.
- **Header "Live" vs "Connected"** → "Live" only when a tournament is actually live;
  otherwise "Connected" while the socket is up. Click target = `/live/{tid}` Current.
- **Standings best case** → confirmed: full best case (win out + rivals' results
  break the chosen player's way) = max reachable rank.
- **Select clubs / comments** → confirmed: cleaner **inline** redesign (no sheets).
- **Moving average** → confirmed dropped; keep Last-N (a moving average over N
  tournaments).

## Resolved
- **Table Last-N unit**: last **N tournaments** (same as Trends). ✓
- **Cups "defended"**: frontend-only relabel. ✓

## Notes
- Frontend-only except the optional/■ small Cups "defended" fix (frontend relabel of
  existing backend `streak.tournaments_participated`; no backend change needed).
- Classic stats stays available via Settings → Experiments; shared components
  (`MatchHistoryList`, `CupCard`, `Radar`, colour helper) update everywhere used.
