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

- [ ] **Move the indicator to the right** of the top bar (`MobileChrome`; mirror on
      desktop `Sidebar` if needed) — title left, indicator right.
- [ ] **Differentiate states** using the `/tournaments/live` query +
      `RealtimeStatusContext`: **Live** (a live tournament is running) vs
      **Connected** (WS up, no live tournament) vs **Reconnecting** / **Offline**.
      Keep the existing dot/label info.
- [ ] **Clickable when live**: if a live tournament is running, the indicator is a
      button → navigates to that tournament's current match (`/live/{tid}`,
      Current tab). Non-interactive otherwise.

## Phase C — Dashboard trends  (model: **Opus high**)

- [ ] **Full-width trends overview**: the preview chart doesn't span the card width
      — fix the width measurement / SVG sizing so it fills the container.
- [ ] Player line colours use the Phase A mapping (consistency).
- [x] ~~Moving average~~ → per user: keep the existing Last-N average; no separate
      moving-average overlay. (Add a small "(last N tournaments)" clarifier on the
      Trends Last-N control so the unit is unambiguous.)

## Phase D — Live tournament  (model: **Opus high**)

- [ ] **Current — cleaner inline entry**: redesign Select Clubs + Match Comments as
      a tighter, flatter **inline** form (no sheets/modals) that reads like the rest
      of the app — improve *how the info is entered*, not just colours.
- [ ] **Standings — best-case potential positions**: add a section below standings;
      pick a player → show their **highest reachable final position** (full best
      case: chosen player wins all remaining matches **and** other remaining results
      break in their favour). Reuse the standings row/elements.
- [ ] **Matches — compact by default**: default the match list to Compact view
      (check current default; it currently picks compact only on < 640px).
- [ ] **Admin — restyle**: rebuild `AdminPanel` in the flat app language
      (sections, inputs, buttons consistent with the rest).

## Phase E — Stats, part 1 (contained items)  (model: **Opus high**)

- [ ] **Trends label cutoff**: with tournament names on, the most-recent
      tournament's label is clipped at the right edge — anchor/clamp the last label
      (and/or add right padding) so it stays on-plot.
- [ ] **Records — consistent box colour**: the record boxes use a brighter surface
      than the player-stats boxes — switch to the same surface tokens (consistency).
- [ ] **Records — show ties for longest runs**: streak/longest-run records show
      **all** tied players, not just one (extend the existing ties handling to the
      streak-type records).
- [ ] **Cups — fix "defended"**: backend counts the winning tournament in the
      streak, so a fresh win shows "1 defended". Show **defenses = participated − 1**
      (only when > 0); winning without a later defence reads as 0 defended.
      (`CupCard`, reused by stats Cups.)
- [ ] **H2H — drop matrix explanation**: remove the explanatory paragraph above the
      matrix.
- [ ] **H2H — 2v2 teammate synergy**: when mode = 2v2, add a section about how well
      the selected player performs **with each teammate** (record/ppm with partner,
      best/worst partner). Reuse list/row elements.
- [ ] **Player — matches list consistency**: replace the bespoke player-matches
      rendering with the shared `MatchHistoryList`/`MatchRowWithClubs` used elsewhere.

## Phase F — Stats, part 2 (interactive)  (model: **Opus high/xhigh**)

- [ ] **Table — Last N toggle** *(unit = last **N tournaments**, confirmed)*: a
      Last-N toggle + **slider** (N=10 default) that recomputes **all** visible
      columns over the last N tournaments (same unit as Trends' Last-N); **Elo is
      unset/hidden** when Last-N is on.
- [ ] **Positions — drag to reorder**: let the user drag a player column to reorder
      it; the position lines update dynamically. Keep player **icons sticky** (column
      header stays visible) when scrolling down.
- [ ] **Player — radar overlay**: in the profile net, overlay one or more other
      players' radars, each in that player's **consistent colour** (Phase A). Add a
      player multi-select.

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
