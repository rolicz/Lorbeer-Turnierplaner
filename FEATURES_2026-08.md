# Feature Batch 2026-08 — League Nation Flags & Club Badges

> Branch `feature/2026-08-flags-badges` off `main` (baseline `ca44b46`). Created 2026-08-07.
> Symbol names are the source of truth; line numbers (where given) reference the baseline.
>
> Feature request: country flags for each league's nation, and a visual symbol for
> clubs — shown wherever teams appear, e.g. the current-game card and matches lists.
> Must not break existing DBs when deploying. **Local first**: no runtime CDN/external
> requests; all assets ship in the bundle or are generated client-side.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding
   code style (Tailwind + design tokens, `qk` query-key factory, generated API types).
2. Checks must be green before committing: backend touched → `make test` + `make lint`
   from repo root; backend response models touched → `make gen-types`, commit the
   regenerated `frontend/src/api/generated/schema.d.ts` in the same commit; frontend
   touched → `cd frontend && npm run check` (and `npm run build` for anything structural).
3. UI must work at mobile ~375px and desktop. Flags/badges are *supporting* visuals:
   small, never pushing the club/league text to wrap or truncate more than today.
4. Tick your task's checkbox here and note deviations under the task.
5. If blocked or the code doesn't match this spec, stop, note it here, commit nothing broken.

---

## Decisions (already made — do not relitigate)

- **Flags: `flag-icons` npm package** (MIT), rendered via its CSS classes
  (`<span class="fi fi-de" />`). The CSS + SVGs are bundled by Vite → fully local,
  crisp on every OS/browser. Rejected: emoji flags (don't render on Windows),
  any remote flag CDN (violates local-first).
- **Nation codes** are flag-icons-compatible lowercase codes stored as strings:
  ISO 3166-1 alpha-2 (`de`, `at`, …) plus GB subdivisions (`gb-eng`, `gb-sct`).
- **Club symbols are generated monogram badges** (initials on a deterministic
  colored disc). 626 clubs make curated crest images infeasible, and real crests
  are trademarked — nothing to bundle. No DB change needed for clubs.
  Exception (G6): clubs in the `National (Men)` / `National (Women)` leagues *are*
  countries — they render their country's flag as their symbol.
- **DB transition is additive + automatic**: nullable `league.nation` column added
  via the existing `_ensure_runtime_columns()` ALTER-TABLE pattern
  (`backend/app/db.py:32`), then an idempotent startup backfill fills `NULL`
  nations from the exact-name map below. Fresh DBs, the current prod DB, and
  rollbacks to old code all keep working (old code simply ignores the column).
  **No manual server step on deploy** (unlike the cups.json rollout).
- Backfill only ever writes rows where `nation IS NULL` — manual corrections
  (SQL or future admin UI) are never overwritten.

## League → nation map (exact `league.name` strings, incl. the NWSL `))` typo)

| League name | nation |
|---|---|
| Premier League | gb-eng |
| La Liga | es |
| Bundesliga | de |
| Serie A | it |
| Ligue 1 | fr |
| Süper Lig | tr |
| Österreichische Bundesliga | at |
| Liga Portugal | pt |
| Eredivisie | nl |
| Primera División | ar |
| Scottish Premiership | gb-sct |
| Belgian Pro League | be |
| MLS | us |
| Swiss Super League | ch |
| EFL League One | gb-eng |
| Danish Superliga | dk |
| Eliteserien | no |
| Ekstraklasa | pl |
| Allsvenskan | se |
| Serie B | it |
| League of Ireland Premier Division | ie |
| Saudi League | sa |
| K League | kr |
| Chinese Super League | cn |
| A-League | au |
| Liga 1 (Romania) | ro |
| EFL Championship | gb-eng |
| EFL League Two | gb-eng |
| 2. Bundesliga | de |
| 3. Bundesliga | de |
| Woman's Super League (England) | gb-eng |
| Liga F (Spain) | es |
| Frauen-Bundesliga (Germany) | de |
| Serie A Femminile (Italy) | it |
| Arkema Première Ligue (France) | fr |
| NWSL (North America)) | us |
| Indian Super League | in |
| Ligue 2 | fr |
| LaLiga 2 | es |
| Rest of the World | *(null — no flag)* |
| National (Men) | *(null — clubs get own flags, G6)* |
| National (Women) | *(null — clubs get own flags, G6)* |

`Primera División` is Argentina's league (verified: Boca Juniors, River-side clubs in dev DB).

---

## G1 — Backend: `league.nation` column, startup backfill, API exposure  ☑

- `backend/app/models.py` `League`: add `nation: Optional[str] = Field(default=None)`.
- `backend/app/db.py` `_ensure_runtime_columns()`: extend the existing pattern —
  if table `league` exists and column `nation` missing →
  `ALTER TABLE league ADD COLUMN nation VARCHAR`. Keep the push-preference
  migration intact; refactor to a small loop/helper only if it stays obviously simple.
- New `backend/app/league_nations.py`: `LEAGUE_NATIONS: dict[str, str]` with the
  exact-name map above (omit the null rows), plus
  `backfill_league_nations(engine) -> int` that UPDATEs `league SET nation=? WHERE
  name=? AND nation IS NULL` per entry and returns rows changed. Call it from
  `init_db()` after `_ensure_runtime_columns()`; log
  `"League nations backfilled: N"` only when N > 0.
- `backend/app/schemas/responses.py`: `LeagueOut` gains `nation: str | None`;
  `ClubOut` gains `league_nation: str | None`; `ClubColumnsOut` unchanged.
- `backend/app/routers/clubs.py` `list_clubs`: the query already joins League —
  select `League.nation` too and fill `league_nation` in the response rows.
  `create_league`: `LeagueCreateBody` gains optional `nation: str | None`; validate
  against `^[a-z]{2}(-[a-z]{2,3})?$` when set (400 otherwise); store it.
- `backend/data/seed-leagues.json` + the `leagues` block in `backend/data/seed.json`:
  add `"nation"` per league (same map) and make `upsert_leagues` in
  `backend/app/seed.py` set nation on create and fill it on existing rows where NULL
  (seeding stays manual/optional — backfill above is what prod relies on).
- `make gen-types` — commit the regenerated `schema.d.ts` in the same commit.
- Backend tests (new `backend/tests/test_league_nation.py`, style of neighbors):
  (a) legacy table without the column → `init_db()` adds it and backfills known names;
  (b) backfill is idempotent and never overwrites non-NULL;
  (c) `/clubs/leagues` returns `nation`, `/clubs` returns `league_nation`;
  (d) `POST /clubs/leagues` accepts + validates `nation`.

**DoD:** `make test` + `make lint` green; schema.d.ts committed; starting the backend
against a copy of an old DB logs the backfill once, then never again.

*Done.* `make test` 110 passed (105 baseline + 5 new), `make lint` green, `schema.d.ts`
regenerated. Verified against a copy of `backend/data/app.db`: first `init_db()` adds the
column and logs `League nations backfilled: 39`, a second one logs nothing; `Rest of the
World` / `National (Men)` / `National (Women)` stay NULL.

Notes for later tasks:
- `_ensure_runtime_columns()` is now a small table-driven loop (`_RUNTIME_COLUMNS`),
  push-preference migration unchanged in behaviour.
- Nation-code validation lives in `backend/app/validation.py` as `validate_nation_code`
  (regex `^[a-z]{2}(-[a-z]{2,3})?$`, lowercases + trims); reused by `create_league` and
  by seeding.
- `LeagueOut.nation` / `ClubOut.league_nation` are **required** fields (`str | None`, no
  default), so the generated TS types are `nation: string | null` /
  `league_nation: string | null` — not optional. `LeagueCreateBody.nation` is optional.
- `backend/data/seed.json` has no `Indian Super League` / `Ligue 2` / `LaLiga 2` rows
  (unlike `seed-leagues.json`); left as-is — only nations were added, no new leagues.
- Backfill runs from `init_db()`, not from seeding; `upsert_leagues` only fills NULLs too.

## G2 — Frontend primitives: NationFlag, ClubBadge, enriched club lookup  ☑

- `cd frontend && npm i flag-icons` (exact version in package-lock committed).
  Import `"flag-icons/css/flag-icons.min.css"` once in `frontend/src/main.tsx`.
- New `frontend/src/ui/NationFlag.tsx`: `({ nation, size = "sm", className })` →
  `<span className={"fi fi-" + nation ...} />` with `rounded-[2px]`, sizes
  `sm` (~14px wide) and `md` (~18px), `aria-hidden` (decorative — adjacent text
  names the league). Renders `null` when `nation` is falsy. No hardcoded colors.
- New `frontend/src/ui/ClubBadge.tsx`: deterministic monogram disc.
  - Initials: first letters of the first two words of the club name (single-word
    names → first two letters), uppercased.
  - Color: stable string hash of the club name → index into a fixed ~12-entry
    palette of Tailwind-arbitrary HSL values chosen to read well on the dark
    surfaces (muted saturation, ~35-45% lightness backgrounds, light text).
  - Shape: `rounded-full` disc, sizes `sm` (~16px, `text-[8px]`) and `md`
    (~22px, `text-[10px]`), `font-semibold`, `shrink-0`, `aria-hidden`.
  - Props: `({ name, size, className })` — pure function of the name; no fetches.
- `frontend/src/ui/clubControls.tsx` `clubLabelPartsById`: return shape gains
  `league_nation: string | null` (from the generated `Club` type's new field).
  All existing callers keep compiling (additive).
- Frontend test `frontend/src/test/clubBadge.test.ts`: initials for one/two/multi-word
  names; same name → same palette index; different names spread across indices.

**DoD:** `npm run check` + `npm run build` green; components exported and unit-tested;
no external network request for any flag (verify build output contains the SVGs).

*Done.* `npm run check` green (139 tests = 129 baseline + 10 new), `npm run build` green.
`flag-icons@7.5.0` pinned in package-lock; built CSS contains zero `url(//…)` /
`url(http…)` references and all 542 flag SVGs are emitted into `dist/assets/`.

Notes for later tasks:
- **Deviation (additive):** `frontend/vite.config.ts` gained
  `build.assetsInlineLimit: (filePath) => filePath.includes("flag-icons") ? false : undefined`.
  Without it Vite inlines every flag SVG under 4 kB as a data URI and the
  render-blocking CSS goes 68.6 kB → 491 kB (12.4 → 97.7 kB gzip). With it the CSS is
  100.3 kB (20.4 kB gzip, i.e. +8 kB gzip for the flag-icons rule set) and the browser
  fetches only the flags actually shown. Default inlining is untouched for all other assets.
  `dist/` grows 1.9 MB → 7.2 MB on disk (the 542 SVGs), served on demand.
- `NationFlag` (default export, `frontend/src/ui/NationFlag.tsx`): props
  `{ nation?: string | null; size?: "sm" | "md"; className?: string }`. Sizing is done
  via font-size (`.fi` is `1.333em × 1em`), so `sm` = `text-[10.5px]` (~14×10.5px),
  `md` = `text-[13.5px]` (~18×13.5px); adding a `className` with `text-*` would override it.
  Trims + lowercases the code, renders `null` for falsy/blank, `shrink-0 rounded-[2px]`,
  `aria-hidden`.
- `ClubBadge` (default export, `frontend/src/ui/ClubBadge.tsx`): props
  `{ name?: string | null; size?: "sm" | "md"; className?: string }`; `sm` = `h-4 w-4
  text-[8px]`, `md` = `h-[22px] w-[22px] text-[10px]`; `shrink-0`, `aria-hidden`, renders
  `null` for a blank name. Also exports the pure helpers `clubInitials`,
  `clubBadgeColorIndex`, `clubBadgeHash` (FNV-1a) and `CLUB_BADGE_COLORS` (12 full
  Tailwind arbitrary `bg-[hsl(…)]` class strings — must stay literal for the JIT scanner).
  File carries `/* eslint-disable react-refresh/only-export-components */` like
  `clubControls.tsx` because it exports helpers next to the component.
- G6 can add the optional `nation?` prop to `ClubBadge` and short-circuit to `NationFlag`
  before the monogram branch; the `md` footprints (22px vs ~18px) are close enough.
- `clubLabelPartsById` now returns `league_nation: string | null` in all three branches
  (no club / unknown id → `null`). Purely additive; every existing caller still compiles.
- `flag-icons/css/flag-icons.min.css` is imported in `frontend/src/main.tsx` just before
  `./styles.css` — do not import it again anywhere else.
- The `package-lock.json` diff was kept to the flag-icons entries only: a plain
  `npm i flag-icons` also pruned three unrelated optional/peer entries (`@emnapi/core`,
  `@emnapi/runtime`, `vitest/node_modules/esbuild`). That pruning reproduces on a bare
  `npm install --package-lock-only` on `main`, so it is pre-existing drift and was left
  out of this commit.

## G3 — Current game: flags + badges in MatchOverviewPanel  ☑

- `frontend/src/ui/primitives/MatchOverviewPanel.tsx` (used by the dashboard
  `CurrentMatchPreviewCard`, live `CurrentGameSection` / `OverviewSection`,
  `MatchDetailPage`, friendlies): in the club-name row (`aClubParts.name` /
  `bClubParts.name`, `:150-152`) prepend a `ClubBadge` (`md` on desktop, `sm` on
  mobile is fine as a single size if simpler); in the league row
  (`aClubParts.league_name`, `:155-157`) prepend a `NationFlag` with the side's
  `league_nation`. Side B mirrors side A (badge/flag trailing on the right-aligned
  side so the visual sits toward the outer edge — match the existing symmetric layout).
- No-club sides ("No club") render neither badge nor flag.
- Keep truncation behavior: badges/flags `shrink-0`, text keeps `min-w-0`.

**DoD:** dashboard current-match card, live Overview tab, and match detail all show
badge + flag on both sides at 375px without wrapping regressions; `npm run check` green.

*Done.* `npm run check` green (141 tests = 139 baseline + 2 new), `npm run build` green.
Only `MatchOverviewPanel.tsx` changed, so all six consumers (dashboard
`CurrentMatchPreviewCard`, live `CurrentGameSection` / `OverviewSection`,
`MatchDetailPage`, friendlies `FriendlyMatchCard` / `FriendlyMatchesListCard`) get it.

Notes for later tasks:
- Both symbol rows are now `min-w-0 flex items-baseline gap-1.5` (side B adds
  `justify-end`, keeps `text-right`) with the text moved into a
  `min-w-0 whitespace-normal md:truncate break-words leading-tight` `<span>` — i.e.
  truncation/wrapping behaviour is unchanged, the symbols are the only new boxes.
  `items-baseline` (not `items-center`) so the symbol aligns with the *first* text
  line when a long club/league name wraps at 375px.
- **Deviation (sizing):** the primitives only expose `sm`/`md`, and `cn()` is a plain
  join (no tailwind-merge), so the responsive step-up is done with `md:` overrides
  passed as `className` — module constants `BADGE_MD_UP` (`md:h-[22px] md:w-[22px]
  md:text-[10px]`) and `FLAG_MD_UP` (`md:text-[13.5px]`) in `MatchOverviewPanel.tsx`.
  Base size stays the primitives' `sm`; the `md:` variants are emitted after the base
  utilities in the built CSS (verified in `dist/assets/index-*.css`), so they win at
  `md+`. Overriding in the other direction (base classes via `className`) would be a
  source-order coin flip — don't. The spec only asked for a responsive *badge*; the
  flag got the same treatment so the two rows stay proportional.
- No-club sides render neither symbol; the guard is
  `clubs.some((c) => c.id === side?.club_id)`, which also suppresses the badge for the
  `#<id>` unresolved-club label (`clubLabelPartsById` returns that when the id is not in
  `clubs`) — a monogram of `#1` would be nonsense. G4/G5 want the same guard.
- **Deviation (tests):** added `frontend/src/test/matchOverviewPanel.test.tsx`, the repo's
  first component render test. Infra was already there (`vitest.config.ts` →
  `environment: "jsdom"`, `@testing-library/react` + `jest-dom` in `setup.ts`); nothing
  was configured for it. Asserts badges on both sides, a `.fi-de` flag only for the side
  whose league has a nation, and no badge/flag for a "No club" side.
- Not verified in a real browser: this environment has no browser (no chromium/playwright),
  so the 375px check was done from the CSS/layout rules plus the emitted class list, not
  visually. Worth an eyeball during the batch-level runtime gate (Verification gates §4).

## G4 — Matches lists: flags + badges in history rows  ☑

- `frontend/src/pages/stats/MatchHistoryList.tsx` (stats matches modal, H2H matches,
  player profile via `MatchHistorySection` / `PlayerMatchesCard`): each side's club
  label (`aClub.name` / `bClub.name`, `:29-30` and their render sites) gains a `sm`
  `ClubBadge`; where the league name is shown, prepend a `sm` `NationFlag`. If the
  row is too dense for both on mobile, badge wins (flag only where the league name
  already renders).
- `frontend/src/pages/tools/FriendlyMatchesListCard.tsx`: same treatment for its
  club labels (it resolves clubs the same way — reuse `clubLabelPartsById` parts).
- Rows stay single-line where they are single-line today.

**DoD:** stats match history, H2H matches modal, profile match history, and the
friendlies list all show club badges (and flags where league names appear) at 375px;
`npm run check` green.

*Done.* `npm run check` green (144 tests = 141 baseline + 3 new), `npm run build` green.
Only `MatchRowWithClubs` in `MatchHistoryList.tsx` changed; every consumer inherits it
(`PlayerMatchesCard`, `HeadToHeadCard`, `H2HView`, `PlayerProfile`, profile
`MatchHistorySection` / `ProfileOverviewTab`, live `MatchH2HPanel`, tools
`FriendlyMatchesListCard`).

Notes for later tasks:
- **Deviation (scope):** `FriendlyMatchesListCard.tsx` was **not** touched — it renders no
  club label of its own. Its history rows come from `MatchHistoryList` (this task), its
  editor preview from `MatchOverviewPanel` (G3), and its club picker from
  `SelectClubsPanel` (G5). So the spec's second bullet is satisfied without a diff there.
- Club/league rows only exist in the **Details** view (`showMeta`); the Compact view has
  no club text, so it stays untouched ("rows stay single-line where they are today").
  Consumers hard-wired to `showMeta={false}` (profile `MatchHistorySection` /
  `ProfileOverviewTab`, `PlayerProfile`, live `MatchH2HPanel` recent meetings) therefore
  show no symbols by design — nothing to attach them to.
- Both meta rows now mirror `MatchOverviewPanel`: `min-w-0 flex items-baseline gap-1.5`
  (side B adds `justify-end`, keeps `text-right`) with the text in a `min-w-0
  whitespace-normal md:truncate break-words leading-tight` `<span>`. Truncation/wrapping
  is unchanged; the symbols are the only new boxes.
- Sizes are the primitives' `sm` only — no `md:` step-up here (unlike G3): these rows are
  `text-xs md:text-sm`, a third the size of the overview panel's club line, and a 22px
  disc next to 14px text looked top-heavy. G5/G6 should stay on `sm` for list rows too.
- Same no-club guard as G3 (`clubs.some((c) => c.id === side?.club_id)`), so "No club" and
  unresolved `#<id>` labels get no monogram. Flags need no guard —
  `clubLabelPartsById` returns `league_nation: null` in both of those branches.
- Test: `frontend/src/test/matchHistoryList.test.tsx` (renders `MatchRowWithClubs`
  directly) — badges both sides + one `.fi-de` flag in Details, no badge for a "No club"
  side, no symbols at all in Compact.
- Not verified in a real browser (no browser in this environment); 375px was checked from
  the class list only, same caveat as G3.

## G5 — Pickers & Clubs page  ☑

- `frontend/src/ui/ClubCombobox.tsx`: option rows and the selected-value row gain a
  `sm` `ClubBadge`; league line (if shown per option) gains a `sm` `NationFlag`.
- `frontend/src/ui/SelectClubsPanel.tsx`: same for its club rows.
- `frontend/src/pages/ClubsPage.tsx`: club rows gain badges; the league filter
  options (`FilterSelect`) and/or league group headers gain flags where a league
  name renders. Purely visual — no filtering/sorting changes.

**DoD:** picking a club in tools/live flows shows badges in the list and in the
selection; Clubs page shows badges + flags; `npm run check` green.

*Done.* `npm run check` green (146 tests = 144 baseline + 2 new), `npm run build` green.
Touched `ClubCombobox.tsx`, `SelectClubsPanel.tsx`, `ClubsPage.tsx` — the combobox change
covers every picker (both `SelectClubsPanel` sides → friendlies editor/list, live
`CurrentGameSection`, `MatchDetailPage`).

Notes for later tasks:
- `ClubCombobox`: `sm` `ClubBadge` before the club name in the trigger (only when a club is
  selected — the placeholder gets none) and in every option row; `sm` `NationFlag` before
  the option's league line. Both option lines are now `flex min-w-0 items-center gap-1.5`
  with the text in a `min-w-0 truncate` `<span>` (was `block truncate`), so truncation is
  unchanged. `items-center` (not G3/G4's `items-baseline`) because these lines always
  truncate to one line and never wrap.
- **Deviation (SelectClubsPanel):** the panel renders no club row of its own — the names
  live in the two `ClubCombobox` triggers (covered above) and the star editors. Its only
  club text is the `showSelectedMeta` league line, which got the `NationFlag`. No badge
  there (the name it would belong to is one line up, in the trigger).
- **Deviation (ClubsPage league filter):** the spec's `FilterSelect` bullet does not apply —
  the Clubs page league/stars filters are plain native `<select>`s (`select-field`), and
  `<option>` cannot host a flag element. Took the "and/or" branch: flags go on the
  **group-by-league headers** (`groupMode === "league"`, keyed by league name via a new
  `leagueNations.byName` map) and inline before the league name in each club row's meta
  line. `FilterSelect` itself was left untouched — giving it per-option leading nodes would
  have been a shared-component change beyond this task (worth its own task if the picker
  filters should show flags too).
- `ClubsPage` club rows: `sm` `ClubBadge` before the name (`flex min-w-0 items-center
  gap-1.5`, name keeps `truncate font-medium`). The meta line is now a `ReactNode[]`
  (`metaParts`) instead of a `string[]` so the league entry can carry its flag; the `·`
  separator logic is unchanged.
- New module-level helper `leagueNationForClub(club, nationsById)` mirrors the existing
  `leagueNameForClub`: prefers `club.league_nation` (G1 field), falls back to the league
  list by `league_id` so a cached/stale club payload still gets a flag.
- Test: `frontend/src/test/clubCombobox.test.tsx` — badge in the trigger for the selected
  club, badge per option, exactly one `.fi-de` flag for the only fixture league with a
  nation. It stubs `Element.prototype.scrollIntoView` (jsdom has no layout) and queries
  `document` for the options because the list renders in a body portal.
- Not verified in a real browser (none in this environment); 375px checked from the class
  list only, same caveat as G3/G4.

## G6 — National teams: flag as the club symbol (stretch)  ☑

- New `frontend/src/ui/nationalTeams.ts`: `NATIONAL_TEAM_NATIONS: Record<string, string>`
  mapping national-team club names (as they exist in the DB: `Argentina`, `Croatia`,
  `Czechia`, `Denmark`, `England`, `Finland`, `France`, `Germany`, `Ghana`, `Hungary`,
  `Iceland`, `Ireland`, …) to flag-icons codes. Cover the names present in the dev DB
  (query: clubs whose league is `National (Men)` / `National (Women)`); unknown names
  simply keep the monogram badge.
- `ClubBadge` gains an optional `nation?: string | null` prop: when set, render a
  `NationFlag` (same footprint) instead of the monogram. Wire it where the club's
  league is one of the National leagues — cleanest via `clubLabelPartsById`
  (it knows `league_name`; add `national_nation: string | null` to its return,
  resolved through the map).
- Women's national teams share the same country codes.

**DoD:** a match with e.g. Germany vs France shows the two flags as club symbols in
the current-game card and match lists; non-mapped national clubs fall back to
monogram; `npm run check` green.

*Done.* `npm run check` green (157 tests = 146 baseline + 11 new), `npm run build` green.
Frontend only — no backend, no API/type changes, so no `make test` / `make gen-types` run.

Notes:
- New `frontend/src/ui/nationalTeams.ts` exports `NATIONAL_TEAM_NATIONS` (club name →
  flag-icons code) plus `isNationalTeamLeague(leagueName)` (`startsWith("National (")`,
  same test `randomClubAssignmentOk` already uses) and
  `nationalTeamNation(clubName, leagueName)`. The lookup is **case/whitespace-insensitive**
  (an internal lowercase index) and **gated on the National league**, so a regular club
  named after a country (e.g. a hypothetical "Georgia" in some domestic league) keeps its
  monogram. Unmapped national clubs return `null` → monogram, per spec.
- **Deviation (map size):** the map covers all 29 dev-DB names (query confirmed:
  `National (Men)` only, `National (Women)` has no clubs yet) **plus ~65 further national
  teams** and a few alternate spellings (`Qatar`/`Quatar` — the DB has the typo —,
  `Czechia`/`Czech Republic`, `Ireland`/`Republic of Ireland`, `United States`/`USA`,
  `Turkey`/`Türkiye`, `Ivory Coast`/`Côte d'Ivoire`, `South Korea`). The women's league is
  empty today, so a DB-only map would have left every future women's team on a monogram.
  Every code was verified to exist in `flag-icons/flags/4x3/` and as a `fi-*` CSS class.
- `ClubBadge` gained `nation?: string | null`: when set it short-circuits to
  `<NationFlag nation={nation} size={size} className={className} />` before the monogram
  branch (`ClubBadgeSize` and `NationFlagSize` are the same `"sm" | "md"` union, so the
  size passes straight through). All other props/behaviour unchanged.
- `clubLabelPartsById` gained `national_nation: string | null` (null in the no-club and
  unresolved-`#<id>` branches). Additive — every existing caller still compiles.
- Wiring: `MatchOverviewPanel` (both sides), `MatchHistoryList.MatchRowWithClubs` (both
  sides) read it from `clubLabelPartsById`; `ClubCombobox` (trigger + option rows) and
  `ClubsPage` club rows call `nationalTeamNation(c.name, …)` directly because they work
  from `Club` objects, not from the parts helper. `SelectClubsPanel` needs nothing (G5:
  it renders no club name of its own).
- **Deviation (responsive sizing):** G3's `BADGE_MD_UP` (`md:h-[22px] md:w-[22px]
  md:text-[10px]`) must not be applied to a flag — `.fi` is sized by `font-size` and a
  forced square box would letterbox it. `MatchOverviewPanel` therefore picks the override
  per side via a new module-level `symbolMdUp(nation)` → `FLAG_MD_UP` for national teams,
  `BADGE_MD_UP` otherwise. The list/picker call sites pass no className (`sm` only), so
  they were unaffected.
- Tests: new `frontend/src/test/nationalTeams.test.ts` (all 29 dev-DB names resolve, code
  shape regex, GB subdivisions, casing/whitespace/`Quatar`, league gate, unmapped → null)
  and two cases added to `frontend/src/test/matchOverviewPanel.test.tsx` (Germany vs France
  renders `.fi-de` + `.fi-fr` and no monograms; an unmapped "Atlantis" keeps its disc).
- Not verified in a real browser (none in this environment) — same caveat as G3/G4/G5.

---

## Verification gates (after all tasks)

1. `make test` (baseline 105 + new), `make lint` from repo root.
2. `cd frontend && npm run check` (baseline 129 + new) and `npm run build`.
3. `make gen-types` produces no diff (schema.d.ts committed in G1).
4. Runtime: backend against a **copy** of `backend/data/app.db` → confirm startup
   logs the backfill once; dashboard current-match card + a stats match list show
   flags/badges; build output serves flag SVGs locally (no external requests in
   devtools network tab).
5. DB safety: run the new backend against a copy of the prod-shaped DB, then run
   the **old** backend (main) against the same file — both start clean.

## Deployment

Nothing manual: `git pull && docker compose up -d --build`. The nation column +
backfill happen at startup (watch for `League nations backfilled: 39` once in
`docker compose logs backend`). No cups.json-style config edit needed.
