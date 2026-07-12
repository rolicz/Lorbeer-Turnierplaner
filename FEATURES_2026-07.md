# Feature Batch 2026-07 — Plan & Tracker

> Branch `feature/2026-07-batch` off `main` (baseline `6c85b72`). Created 2026-07-12.
> Line numbers reference that baseline — if drifted, locate by symbol name.
>
> Seven tasks (T1–T7). Implemented by workflow agents, one task per agent, sequential,
> one-or-more commits per task with the task ID in the message (`feat(T3): ...`).

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding
   code style (Tailwind + design tokens, `qk` query-key factory, generated API types).
2. Checks must be green before committing: backend touched → `make test` + `make lint`
   from repo root; backend response models touched → `make gen-types`, commit the
   regenerated `frontend/src/api/generated/schema.d.ts` in the same commit; frontend
   touched → `cd frontend && npm run check` (and `npm run build` for anything structural).
3. UI must work at mobile ~375px and desktop. Follow existing compact-mobile conventions
   (icon `md:hidden` + label `hidden md:inline`, `text-xs`/`text-[11px]` for dense text).
4. Tick your task's checkbox here and note deviations under the task.
5. If blocked or the code doesn't match this spec, stop, note it here, commit nothing broken.

---

## T1 — Stats payload: per-tournament `mode` + `winner_player_id`; no-winner & mode badges in positions  ☐

**Backend** (`backend/app/services/stats/players.py`, `compute_stats_players`):
- The per-tournament dict built at `players.py:86-94` (`{id, name, date, players_count, cup_stakes}`)
  gains two fields: `mode: str` (from `t.mode`, already loaded) and
  `winner_player_id: int | None` — the unique winner: use `unique_winner_player_id(rows)`
  over that tournament's standings (already computed for positions), and if `None` fall
  back to the decider exactly like `backend/app/services/cup.py:100-106`
  (`t.decider_type != "none" and t.decider_winner_player_id`, must be a participant).
  Mirror, don't duplicate creatively — a small helper in `services/stats/core.py` next to
  `unique_winner_player_id` is fine if both call sites can share it.
- Schema: add both fields to `StatsPlayersTournamentOut` (`backend/app/schemas/responses.py:640-645`).
  Then `make gen-types` (commit schema.d.ts).
- Backend test: extend the stats-players test to assert `mode` present and
  `winner_player_id` null for a tied-top tournament without decider, set when a decider exists.

**Frontend badges:**
- `frontend/src/pages/stats/PositionsView.tsx` (Insights positions):
  - Tournament header cell (`:160-171`): after the name, render up to two mini-pills
    (`text-[9px]` pill style consistent with existing pills): the tournament mode
    (`1v1`/`2v2`) — but ONLY when the global Mode filter is `overall` (redundant otherwise) —
    and a "no winner" pill (use a scale/equal glyph or the text `remis`-style short label,
    keep it 2-4 chars) when `winner_player_id == null` for a `done` tournament.
  - Winner styling `:179`: `isWinner` becomes `pos === 1 && t.winner_player_id === playerId`
    (crown only for the real unique winner; tied-top players keep the position color but no crown).
  - Tooltips/aria-labels include mode and "kein eindeutiger Sieger" info.
- `frontend/src/pages/stats/TournamentPositionsGrid.tsx` (shared, classic + PlayerMatchesCard):
  - `isWinner` (`:108`, `pos === 1`) → require `t.winner_player_id === <the profiled player>`
    when the field is present (the component gets `positionsByTournament` per player —
    pass the player id or compare via a new optional prop; keep backward compatible).
  - Tile `title` text gains mode + no-winner info. Add a subtle bottom-left mode marker
    (tiny `2` dot or `text-[8px]` "2v2") only when tournaments of mixed modes are shown;
    the laurels own the top-right corner — do not crowd it.
- `frontend/src/api/types.ts`: no hand-written mirrors — use the regenerated fields.

**DoD:** backend tests green incl. new assertions; positions views render badges; crown
suppressed for tied tournaments; `npm run check` green.

## T2 — "Most tournament wins" leaderboard in Records  ☐  *(depends on T1)*

- `frontend/src/pages/stats/RecordsView.tsx`: add a new section ABOVE "Match superlatives"
  titled "Titles" with one leaderboard block "Most tournament wins" following the existing
  `RecordGroup`/streak-card markup pattern (`RecordsView.tsx:21-50`, `:150-168` — surface
  card, icon+label header, ×N tie badge, up to 6 rows, "+N more").
- Data: `useQuery(qk.stats.players(mode…), () => getStatsPlayers({ mode }))` — same
  endpoint PositionsView uses; it already respects the global Mode filter. Wins per player
  = count of tournaments where `t.winner_player_id === player.id` (T1 field). Tournaments
  without a unique winner count for nobody.
- Row: rank, player name (clickable → selects the player / links to `?view=player`), win
  count, and the most recent won tournament's name+date as the meta line. Sort desc,
  ties share a rank. Hide players with 0 wins.
- Respects the global Mode chip (1v1/2v2/overall) — no extra UI needed.

**DoD:** records tab shows the block, numbers match the positions grid (count of crowns),
`npm run check` green.

## T3 — Shots entry: native wheel picker  ☐

- `frontend/src/pages/live/CommentCreateComposer.tsx:143-168`: replace the two
  `Input type="number"` fields (Team A / Team B shots) with native `<select>` elements
  styled `select-field w-full` (iOS renders these as the native wheel picker — same
  pattern as `TournamentCommentParts.tsx:393` and `ClubsPage.tsx:336`).
- Options: `0..50` (integers). Keep an empty placeholder option `–` mapping to `""` so the
  submit-blocking behavior of `normalizeShots` (`TournamentCommentsCard.tsx:579-587`,
  empty → null → blocked) is preserved. State stays the existing `shotsA`/`shotsB` strings.
- Keep labels ("Team A shots" / "Team B shots" — whatever the current Input labels are)
  via the existing label markup convention (`input-label`).
- Do NOT change `normalizeShots` or the submit payload.

**DoD:** shots mode shows two selects; posting shots works; `npm run check` green.

## T4 — iOS standalone PWA: dead back button  ☐

Root cause (verified): `useContextualBack`'s `canPop = loc.key !== "default"`
(`frontend/src/ui/shell/routeMeta.ts:29`) is falsified by the PWA resume feature —
`useLocationRestore.ts:48` does `navigate(saved.path, { replace: true })` on cold start,
which mints a fresh location key without adding a history entry, so `goBack()` runs a
no-op `nav(-1)` instead of falling back to `meta.backTo`. The hamburger is (by design)
hidden on detail routes, leaving the user stuck.

- Fix: in `routeMeta.ts`, replace the `canPop` heuristic with the real history index the
  codebase already uses in `useSwipeNav.ts:89`:
  `Number((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0`.
  Extract that one-liner into a tiny exported helper (e.g. `historyCanPop()`) in
  `routeMeta.ts` and use it from BOTH `useContextualBack` and `useSwipeNav` (so the two
  never drift again).
- Add a vitest unit test for `routeMeta()` route classification and for `historyCanPop()`
  with mocked `window.history.state` (idx 0 → false, idx 2 → true, missing state → false).

**DoD:** with `history.state.idx === 0`, `goBack()` navigates to `meta.backTo`
(`/tournaments` from `/live/:id`); tests green; `npm run check` green.

## T5 — Live tournament: compact Overview tab (leftmost, default)  ☐

- `frontend/src/pages/live/LiveTournamentPage.tsx`: new tab key `"overview"`
  (extend `LiveTab`/`TAB_KEYS` `:48,:98`), FIRST in the list, always shown, lucide icon
  (e.g. `LayoutGrid`), label "Overview". It becomes the DEFAULT tab when no `?tab=` param.
  The legacy mapping `?tab=overview → "current"` (`:101`) is removed — `overview` is now a
  real tab.
- New component `frontend/src/pages/live/OverviewSection.tsx` — strictly read-only, no
  inputs, compact enough that on a ~375px phone all three blocks are visible without
  scrolling (thin section labels, dense rows):
  1. **Current match:** pick like the dashboard's `pickPreviewMatch`
     (`CurrentMatchPreviewCard.tsx:25-33`: playing → first scheduled → last finished) and
     render `ui/primitives/MatchOverviewPanel` (already stateless/compact; pass clubs,
     surface `panel-subtle`). Wrap in a button that switches to the `current` tab (or to
     the match detail page when tournament is done).
  2. **Standings (compact):** reuse the standings math — extend
     `pages/live/tournamentStandings.ts` with an `includePlaying` option (mirroring
     `StandingsTable`'s internal `computeStandings(..., "live")` semantics — do NOT import
     the heavy `StandingsTable`). Render one dense row per player: rank, name,
     played, GD, Pts (`text-xs`, `tabular-nums`), leader highlighted. Tapping goes to the
     `standings` tab.
  3. **Next matches:** up to 3 `scheduled` matches (by `order_index`, excluding the one
     shown as current): one line each — `#n` + `teamName(sideA)` vs `teamName(sideB)`
     (helper from `utils/matchDisplay.ts`). Tapping goes to the `matches` tab. Hide the
     block when empty (done tournaments).
- Data: everything comes from the already-loaded `tQ.data`/`matchesSorted`/`clubsQ` —
  no new queries; realtime updates arrive via the existing `useTournamentWS`.

**DoD:** overview is the leftmost + default tab on mobile and desktop, fully read-only,
all three blocks visible on a 375px viewport, taps navigate to the right tabs;
`npm run check` + `npm run build` green.

## T6 — H2H: real 2v2 stats (Insights `H2HView`)  ☐

Backend already computes everything needed — `StatsH2HOut` contains
`best_teammates_2v2` (duo strength), `team_rivalries_2v2` (duo-vs-duo records),
`with_2v2` + `team_rivalries_2v2_for_player` (player-scoped) — the Insights view just
never uses them (`H2HView.tsx` recomputes teammate synergy client-side from
`getStatsPlayerMatches` and shows player-only rivalries). Frontend-only task.

- `frontend/src/pages/stats/H2HView.tsx` + new files under `frontend/src/pages/stats/h2h/`:
  - When the global mode is `2v2`, add a sub-view `ChipGroup` (same primitive as the
    matrix metric chips): **Players | Duos**, default `Duos`. In `1v1`/`overall` nothing
    changes (no chip group).
  - **Players sub-view** (2v2): the existing matrix (player×player over 2v2 matches — keep
    it, it stays meaningful; add a one-line muted caption "per player across 2v2 matches"),
    the existing per-player detail; REPLACE the client-side teammate-synergy `useMemo`
    (`H2HView.tsx:122-149`) and its extra `getStatsPlayerMatches` queries with the
    backend's `with_2v2` (when a player is selected) / `best_teammates_2v2` — delete the
    duplicated aggregation. Top-rivalries stays player-based here.
  - **Duos sub-view** (new components, e.g. `h2h/DuoLeaderboard.tsx`, `h2h/DuoRivalries.tsx`,
    `h2h/DuoDetail.tsx`):
    - *Best duos* — leaderboard from `best_teammates_2v2`: rank, both names, played,
      W-D-L, PPM, GD. Tapping a duo selects it.
    - *Duo rivalries* — top `team_rivalries_2v2` rows: `A+B vs C+D`, played, W-D-L from
      the first duo's perspective, GF:GA; ordered by rivalry_score (existing field).
    - *Duo detail* (when a duo is selected): its overall record + all its matchups
      (filter `team_rivalries_2v2` client-side for entries containing the duo — the group
      is small, the global list covers it) + a "Matches" action opening a `Modal` with
      `MatchHistoryList` fed by `getStatsH2HMatches({ relation: "teammates",
      left_player_ids: [a, b], scope })` — copy the pattern from
      `HeadToHeadCard.tsx:147-159` and the modal at `:747-793`.
  - Also surface **top rivalries as duos**: when mode is `2v2`, the existing
    "Top rivalries" block (`H2HView.tsx:301-321`) must show duo-vs-duo rows
    (`team_rivalries_2v2`) instead of single-player pairs — this is the user's core
    complaint.
- Reuse `PlayerPicker`/avatar conventions for duo display (two overlapping `AvatarCircle`s
  is a nice touch if cheap; otherwise names).
- No duo×duo matrix — deliberately rejected (combinatorially sparse); note it here as decided.
- Types come from the generated schema (fields already exist) — no backend change.

**DoD:** with mode 2v2: sub-nav works, top rivalries are duo-based, best-duos +
duo-rivalries + duo-detail render with correct numbers (spot-check against the classic
HeadToHeadCard's 2v2 lists which already use these fields), client-side synergy
computation deleted, matches modal opens; `npm run check` green.

## T7 — Cup eras: config-driven mode scoping  ☐

Today a cup = `{key, name, since_date}` and EVERY cup folds over ALL tournaments
(`services/cup.py:75-78`); there is no tournament↔cup association. New concept: **eras** —
from a date on, a cup only counts tournaments of a given mode. Generic, config-only.

**Config schema** (`backend/app/cup_defs.py` + `cups.json`):
```json
{ "key": "bauernkranz", "name": "Bauernkranz", "since_date": "2026-01-05",
  "eras": [ { "since": "2026-07-12", "mode": "1v1" } ] }
```
- `eras` optional list of `{since: ISO date, mode: "1v1" | "2v2" | "any"}`. Semantics: the
  era active for a tournament dated `d` is the LAST era with `since <= d`; before the
  earliest era, mode is implicitly `"any"`. A tournament qualifies for the cup iff
  `since_date` (unchanged, inclusive lower bound) passes AND the active era's mode is
  `"any"` or equals `t.mode`.
- Ownership is ONE continuous fold across era boundaries — the owner carries over the
  boundary and from then on only qualifying tournaments can transfer/extend it. (This is
  exactly the user's case: on 2026-07-12 the Bauernkranz holder keeps it and only 1v1
  results move it from now on.)
- Parse/validate in `load_cup_defs()`: valid modes, parseable dates, sort eras by `since`,
  reject duplicate `since` per cup. `CupDef` dataclass gains `eras: list[CupEra]`
  (default `[]` = today's behavior, exactly).

**Backend logic** (`backend/app/services/cup.py`):
- Add `def tournament_qualifies(t: Tournament, cup: CupDef) -> bool` implementing the
  rule above; apply it as a skip-filter inside BOTH `compute_cup()`'s fold (next to the
  existing `status != "done"` skip at `:81`) and `compute_cup_tournament_stakes()`
  (`:187-272`). Do NOT restructure the folds — they stay linear; era logic is a pure
  per-tournament predicate. Keep the SQL query as-is (tiny data set, filter in Python).
- Expose `eras` in the cup-defs API payload (router `backend/app/routers/cup.py` +
  response schema) → `make gen-types`.

**Tests** (`backend/tests/test_cup_eras.py`, plus keep existing cup tests green):
- No eras → behavior identical (regression).
- Era boundary: owner won a 2v2 before the boundary, era says 1v1-only after → a later
  2v2 tournament changes nothing; a later 1v1 tournament transfers/extends normally;
  owner carries across the boundary.
- Stakes: non-qualifying tournaments produce no stake entries for that cup.

**Frontend:**
- `CupCard.tsx` header: when the cup's CURRENT era (era active today) has mode ≠ any,
  show a small mode pill (`1v1`/`2v2`) next to the cup name. CupsView inherits it.
- No tournament-creation UI change (qualification is read-time by mode — by design).

**Config rollout:**
- Update `backend/app/cups.json` (dev default) with the eras above for both cups:
  `default`/Lorbeerkranz → `[{"since": "2026-07-12", "mode": "2v2"}]`,
  `bauernkranz` → `[{"since": "2026-07-12", "mode": "1v1"}]`.
- Update README's cups section (schema, semantics, example).
- NOTE for deployment (user action): production reads `CUPS_CONFIG_PATH=/data/cups.json`
  on the server — that file must be updated by hand with the same eras when deploying.

**DoD:** `make test` + `make lint` green incl. new era tests; `make gen-types` committed;
cup page shows mode pill; README documents eras.

---

## Out of scope (decided)

- Per-tournament cup opt-in/opt-out (`cup_key` on Tournament) — eras-by-mode covers the
  need; revisit only if a real case appears.
- Duo×duo H2H matrix — rejected as combinatorially sparse.
- Classic-stats-mode (`StatsPage` legacy tabs) feature parity — new features target the
  Insights experience; classic gets only what falls out of shared components (T1 grid).

## Verification

Per task: see rules above. Final gate for the batch: `make test && make lint`,
`cd frontend && npm run check && npm run build`, then a review workflow over the whole
branch diff, then the user's manual smoke check (mobile + desktop):
overview tab on a live tournament, shots wheel on iOS, back button from a cold-started
installed PWA, 2v2 H2H duos, records tournament-wins numbers, positions badges, cup page
pills + unchanged owners, and after deploying: update `/data/cups.json` on the server.
