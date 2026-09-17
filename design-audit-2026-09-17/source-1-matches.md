# Matches, scores and clubs

Scope: every component under `frontend/src` that draws a match, a score, a result or a club. Method: every call site of the score/club/record primitives was enumerated with `grep` (the counts below are exhaustive over `frontend/src` excluding `test/` and `api/generated/`), and each consuming page was read in full or in its render half. Where a count says "surfaces" it means the distinct screens a reader can land on; where it says "sites" it means code locations. No design documentation was consulted; every finding below rests on the code cited.

Reading key for the surfaces named below:
- **Hero panel** = `ui/primitives/MatchOverviewPanel.tsx`, shown on 6 surfaces: dashboard "Live now" (`pages/dashboard/CurrentMatchPreviewCard.tsx:81`), tournament Overview tab "Current match" (`pages/live/OverviewSection.tsx:189`), tournament Current tab (`pages/live/CurrentGameSection.tsx:325`), match page Edit-result tab (`pages/live/MatchDetailPage.tsx:410`), New-friendly form (`pages/tools/FriendlyMatchCard.tsx:393`), friendly row editor (`pages/tools/FriendlyMatchesListCard.tsx:180`).
- **Stats match history** = `pages/stats/MatchHistoryList.tsx` (`MatchRowWithClubs`), shown on 6 surfaces: stats Player tab (`pages/stats/PlayerProfile.tsx:191`), stats H2H matchup (`pages/stats/h2h/MatchupView.tsx:229`), profile Matches tab (`pages/profile/MatchHistorySection.tsx:26`), profile Overview "Recent matches" (`pages/profile/ProfileOverviewTab.tsx:181`), match page Head-to-Head tab "Recent matches" (`pages/live/MatchH2HPanel.tsx:269`), friendly row editor H2H view (same panel via `pages/tools/FriendlyMatchesListCard.tsx:172`).

---

## Score layout — 6 variants
**What varies:** what sits between the two numbers, whether the names sit beside them, and whether the separator stays on one x down a list.

- **A — `ScoreLine` grid: names hug a centred numeral pair split by a 1px hairline** · 9 sites: `Flo  2 │ 1  Atzi`, numerals `font-bold tabular-nums` at `text-4xl` (hero) / `text-2xl` (md) / `text-lg` (sm) (`ui/primitives/ScoreLine.tsx:34`), the bar is `h-[0.75em] w-px bg-border-card-chip/70` (`:178`), `gap-2` around the bar and `gap-3` to the names (`:269`). Winner's names `font-semibold`, loser's `text-text-muted`, draw both `font-medium` (`:252`).
  - `ui/primitives/MatchOverviewPanel.tsx:80` — hero, on the 6 hero surfaces
  - `pages/live/MatchList.tsx:227` — tournament Matches tab (`sm` in Compact, `md` in Details)
  - `pages/live/OverviewSection.tsx:270` — Overview tab "Next matches" (`sm`)
  - `pages/live/OverviewSection.tsx:318` — Overview tab "Played matches" (`sm`)
  - `pages/live/WhatIfSection.tsx:118` — What-if tab "Every match" (`sm`)
  - `pages/tools/FriendlyList.tsx:117` — Friendlies page (`sm` Compact / `md` Details)
  - `pages/stats/MatchHistoryList.tsx:74` — the 6 stats-match-history surfaces (`sm` / `md`)
  - `pages/stats/RecordsView.tsx:77` — stats Records (`sm`)
  - `pages/live/comments/CommentList.tsx:178` — comments feed match-block header, tournament Comments tab and match page Comments tab (`sm`)
- **B — bare numerals with the names stacked *above* them, no side-by-side names** · 1 site: the goal-comment composer's "which side scored" buttons render `ScoreNumerals` under a name stack (`pages/live/comments/CommentComposer.tsx:187`, `:192`).
- **C — colon text `14:6`** · 3 sites: the goals segment of every `RecordLine` (`ui/primitives/RecordLine.tsx:202`, 13 call sites, see "Win / draw / loss"), the matchup "Goals" tile `{gf}:{ga}` (`pages/stats/h2h/MatchupView.tsx:210`), and the Current-tab confirm title `Finish this match at 2:1?` (`pages/live/CurrentGameSection.tsx:421`).
- **D — en-dash text `2–1`** · 2 sites: the Current-tab reset dialog body `Flo 2–1 Atzi is wiped.` (`pages/live/CurrentGameSection.tsx:413`) and the friendlies row `aria-label` (`pages/tools/FriendlyList.tsx:154`).
- **E — hyphen text `2-1`** · 2 sites: the decider summary sentence on the tournament page, `Penalties: Roli 5-4 Flo` (`pages/live/LiveTournamentPage.tsx:305`, rendered at `:690`), and the goal-composer button `title`/`aria-label` `makes it 2-1` (`pages/live/comments/CommentComposer.tsx:167`).
- **F — the hairline held to one x down the list** · 1 of the 8 list call sites: only the Friendlies page passes `digits` (`pages/tools/FriendlyList.tsx:120`, sized once per page at `:188`). The other 7 lists that draw a `ScoreLine` per row (`MatchList.tsx:227`, `OverviewSection.tsx:270` and `:318`, `WhatIfSection.tsx:118`, `MatchHistoryList.tsx:74`, `RecordsView.tsx:77`, `CommentList.tsx:178`) pass none, so the bar sits where each row's own digit count puts it.

Within the same dialog, the Current tab spells one score two ways: colon in the title (`:421`), en dash in the body (`:413`).

---

## Scheduled / in-progress / finished — 3 scheduled placeholders, 5 in-progress markers, 3 state vocabularies
**What varies:** what a match that has not been played shows in the score slot; what, if anything, says a match is being played; and which words name the three states.

### A not-yet-played match in the score slot — 3 variants
- **A — the word `vs`** (`ScoreLine` at `sm`: `text-sm font-medium text-text-muted`, `ui/primitives/ScoreLine.tsx:286`) · 5 places
  - `pages/live/OverviewSection.tsx:272` — Overview "Next matches"
  - `pages/live/MatchList.tsx:227` — Matches tab, Compact view
  - `pages/live/WhatIfSection.tsx:120` — What-if, every open match
  - `pages/tools/FriendlyList.tsx:117` — Friendlies, Compact (a scheduled friendly)
  - `pages/stats/MatchHistoryList.tsx:74` — stats match history, Compact (a scheduled match)
- **B — muted dashes either side of the hairline `– │ –`** (`ScoreLine` at `md`/`hero`, `:293`) · 9 places: Matches tab Details view (`MatchList.tsx:227`), Friendlies Details (`FriendlyList.tsx:117`), stats history Details (`MatchHistoryList.tsx:74`), and all 6 hero surfaces (`MatchOverviewPanel.tsx:80`). The same match therefore flips between `vs` and `– │ –` when the reader toggles Compact/Details on the Matches tab or the Friendlies page.
- **C — real zeros `0 │ 0`** · 1 place: the comments feed header derives `state` from whether the goals are `null` (`pages/live/comments/CommentList.tsx:180`), and the coordinator only nulls them when both are `null` (`pages/live/TournamentCommentsCard.tsx:581`); the wire type is `goals: number` (`api/generated/schema.d.ts:2244`–`2252`) and the backend defaults a side to `0` (`backend/app/models.py:256`). A scheduled match's comment block is the one place in the app that prints a 0–0 scoreline in the finished style.

### An in-progress match — 5 markers, and none on the score itself
`ScoreLine` special-cases only `scheduled` (`ui/primitives/ScoreLine.tsx:247`); a `playing` score is drawn exactly like a finished one (same numerals, same leader emphasis). What says "being played" comes from outside the score:
- **A — 6px dot + raw lowercase state word + `#N · leg N` line above the score** · 1 place: `pages/live/MatchList.tsx:96`–`:181` (`text-status-text-green` word, `bg-status-text-green` dot) — Matches tab, both views.
- **B — 6px dot + the words `played` / `live` / `to play`** · 1 place: `pages/live/WhatIfSection.tsx:65`, `:75`, `:113` — What-if.
- **C — a bordered Pill reading the raw enum `playing` / `scheduled` / `finished`** · 6 places: `ui/primitives/MatchOverviewPanel.tsx:76` (`matchStatusPill`, `ui/theme.ts:23`) — every hero surface.
- **D — capitalised `Scheduled` / `Playing` / `Finished` in a segmented switch** · 1 place: `pages/live/MatchDetailPage.tsx:50`, `:399` — Edit-result tab.
- **E — nothing** · 5 places: Friendlies list (`FriendlyList.tsx`), the 6 stats-history surfaces (`MatchHistoryList.tsx`), Overview next/played (`OverviewSection.tsx`), Records (`RecordsView.tsx`), comments header (`CommentList.tsx`).

### The colour of "live"
- In-page markers for a *playing match* use the green status family: `text-status-text-green` (`MatchList.tsx:96`, `WhatIfSection.tsx:70`, `TournamentsPage.tsx:161` for a live tournament), `pillGreen` (`ui/theme.ts:10`), the standings leader bar `bg-status-bar-green` (`pages/live/StandingsTable.tsx:347`), and the ongoing-streak chip `bg-status-bg-green/60 text-status-text-green` labelled `live` (`pages/stats/StreaksView.tsx:63`). 5 sites, all green.
- The navigation's "Live now" dot paints with `--color-live` (`styles.css:463`), which is **red-500** in the dark themes (`themes/defaults.css:40`) and red-600 in light (`themes/light.css:19`): `ui/shell/BottomTabBar.tsx:67`, `ui/shell/Sidebar.tsx:68`, `ui/shell/MobileChrome.tsx:177`. 3 sites, all red.

### Three vocabularies for the same three states
1. raw enum, lowercase: `scheduled / playing / finished` — `MatchList.tsx:177`, `MatchOverviewPanel.tsx:76` (7 surfaces)
2. `to play / live / played` — `WhatIfSection.tsx:75` (1 surface)
3. `Scheduled / Playing / Finished` — `MatchDetailPage.tsx:50` (1 surface)

---

## A two-player team inside a match row — 5 variants
**What varies:** whether the two names stack or share a line, and which character joins them on a line.

- **A — one name per line, stacked** · 7 sites (every `ScoreLine` fed an array): `pages/live/MatchList.tsx:16` (`splitPlayers`), `pages/live/OverviewSection.tsx:37`, `pages/live/WhatIfSection.tsx:100`, `pages/tools/FriendlyList.tsx:82`, `pages/stats/MatchHistoryList.tsx:49`, `ui/primitives/MatchOverviewPanel.tsx:34`, and the goal-composer buttons `pages/live/comments/CommentComposer.tsx:187`.
- **B — one line, `Flo + Berni`** (`utils/matchDisplay.ts:6`) · 2 visible sites: the Records rows hand the joined string to `ScoreLine` as a single line (`pages/stats/RecordsView.tsx:202`, `:79`) and the match page's meta line `Flo + Berni vs Roli + Atzi` (`pages/live/MatchDetailPage.tsx:329`). Also in `aria-label`s at `MatchList.tsx:154`, `WhatIfSection.tsx:132`, `FriendlyList.tsx:154`.
- **C — one line, `Flo/Berni` (no spaces)** · 3 visible sites: the comments feed header (`pages/live/TournamentCommentsCard.tsx:92` → `CommentList.tsx:181`, again one line inside a `ScoreLine`), duo-rivalry rows (`pages/stats/HeadToHeadRows.tsx:133`), and the club-slot labels of the New-friendly form (`pages/tools/FriendlyMatchCard.tsx:207`, `:211`).
- **D — one line, `Flo / Berni` (spaced)** · 5 visible sites: match page H2H title (`pages/stats/h2h/matchupSummary.ts:41` → `pages/live/MatchH2HPanel.tsx:181`), matchup names (`pages/stats/h2h/MatchupView.tsx:108`), and the duo rows where the slash is its own muted span (`HeadToHeadRows.tsx:84`, `pages/stats/h2h/DuoDetail.tsx:47`, `pages/stats/h2h/DuoLeaderboard.tsx:32`).
- **E — stacked avatar + name links** · 1 site: the matchup header, 40px avatar for a solo side and 32px for each member of a team (`pages/stats/h2h/MatchupView.tsx:84`).

The same match can appear as stacked names on the Matches tab (A), `Flo + Berni` on one line in Records (B), and `Flo/Berni` on one line in its own comments block (C).

---

## The word between two sides — 6 spellings of "vs"
- `ScoreLine` placeholder, `text-sm font-medium text-text-muted` (`ui/primitives/ScoreLine.tsx:286`)
- matchup header, `text-sm font-medium text-text-muted`, becomes `and` for the Together relation (`pages/stats/h2h/MatchupView.tsx:178`)
- duo-rivalry row, `text-xs text-text-muted` (`pages/stats/HeadToHeadRows.tsx:145`)
- inline muted span inside a `text-sm font-semibold` title (`pages/live/MatchH2HPanel.tsx:181`)
- inline muted span inside a `text-sm font-medium` title (`pages/stats/H2HView.tsx:592`)
- plain, inheriting the meta line's `text-sm text-text-muted` (`pages/live/MatchDetailPage.tsx:329`)

---

## How a club is shown — 1 symbol, 8 placements, 7 "no club" renderings
**What varies:** not the symbol (there is one `ClubBadge` with one fallback order) but where it sits, what accompanies it, and what is drawn when a side has no club.

### The symbol and its fallback order — 1 implementation
`ui/ClubBadge.tsx`: crest image (`:92`) → national-team flag (`:108`) → initials on a name-hashed disc (`:123`) → nothing when the name is empty (`:111`). Two sizes: `sm` 16px (`:19`), `md` 22px (`:20`). A flag as symbol sits in the same box; a league flag next to a league name is `NationFlag` at 14×10.5px (`ui/NationFlag.tsx:17`) or 18×13.5px (`:18`).
- 16px: 10 sites — `ui/primitives/ClubMark.tsx:54` (×3 consumers below), `pages/live/MatchList.tsx:130`, `ui/primitives/MatchSides.tsx:81` in row size (×3 consumers), `pages/clubs/ClubList.tsx:105`, `ui/ClubPicker.tsx:82`, `ui/SelectClubsPanel.tsx` slot (`:103`).
- 22px: 1 site — `MatchSides` in hero size (`:81`), i.e. the 6 hero surfaces.

### Placement — 8 variants
- **A — 16px mark on the inner edge of the names, empty 16px slot kept when there is no club** (`ClubMark.tsx:44`) · 3 places: Friendlies Compact (`pages/tools/FriendlyList.tsx:127`), stats history Compact (`pages/stats/MatchHistoryList.tsx:91`, 6 surfaces), Records (`pages/stats/RecordsView.tsx:85`).
- **B — 16px mark on the inner edge of the names, nothing and no slot when there is no club** · 1 place: Matches tab Compact, hand-built in `withBadge` (`pages/live/MatchList.tsx:128`–`:130`). A clubless side's names sit 22px closer to the score than the row above.
- **C — club line under the score: `Name 🛡 │ 🛡 Name`, then `League 🇩🇪 │ 🇪🇸 League`, then a line of five stars** (`MatchSides` `stars="glyphs"`, `:154`) · 2 places: Matches tab Details (`MatchList.tsx:244`), stats history Details (`MatchHistoryList.tsx:97`, with the as-of rating `:103`).
- **D — the same club line, but the rating folded into the league line as `★ 3.5`** (`MatchSides` `stars="token"`, `:136`) · 1 place: Friendlies Details (`FriendlyList.tsx:137`).
- **E — the club line at hero size (22px symbols, `text-text-normal` names)** · 6 places: `MatchOverviewPanel.tsx:97`.
- **F — club name as plain text, no symbol, no league, no flag; a line of stars underneath** · 1 place: comments feed header (`pages/live/comments/CommentList.tsx:187`, `:192`).
- **G — vertical slot card: players label, 16px symbol + wrapping name, flag + league, stars** · 1 place: the club panel's two slots (`ui/SelectClubsPanel.tsx:103`–`:137`), on Current tab / Edit-result / both friendly forms.
- **H — list row: 16px symbol + name, meta `EA FC 26 · 🇩🇪 Bundesliga · 4.5★`** · 2 places: Clubs page (`pages/clubs/ClubList.tsx:80`–`:105`) and the picker sheet rows (`ui/ClubPicker.tsx:82`–`:100`, flag + league under the name, stars trailing).

Flag position relative to the league name: `MatchSides` mirrors it (flag *after* the league on the left side, *before* on the right, `:134`, `:144`); `ClubPicker.tsx:94`, `ClubList.tsx:80` and `SelectClubsPanel.tsx:127` always put the flag first.

### A side with no club — 7 renderings
- `No club` in muted text where the club name goes (`ui/clubControls.tsx:45` → `ui/primitives/MatchSides.tsx:108`) — 9 surfaces (C, D, E above)
- an empty, invisible 16px box (`ui/primitives/ClubMark.tsx:44`) — 3 surfaces (A)
- nothing at all (`pages/live/MatchList.tsx:128`) — Matches tab Compact
- `—` for the name and `—` for the stars (`pages/live/comments/CommentList.tsx:187`, `:192`) — comments header
- a `ShieldHalf` icon + `Select club` + `Tap to choose` (`ui/SelectClubsPanel.tsx:110`, `:120`, `:131`) — club slot
- `not set` per side / `Not set` for both in the panel's collapsed header (`ui/SelectClubsPanel.tsx:174`, `:175`)
- `—` / `Select club first` (`ui/ClubStarsEditor.tsx:107`, `:138`) — stars editor

An id with no club in the loaded list prints `#123` as the club's name (`ui/clubControls.tsx:58`). The loaded list differs by surface: the dashboard hero asks for `EA FC 26` only (`pages/dashboard/CurrentMatchPreviewCard.tsx:41`), the tournament / match / friendly pages ask for the match's own game (`pages/live/LiveTournamentPage.tsx:515`, `pages/live/MatchDetailPage.tsx:117`, `pages/tools/FriendlyMatchCard.tsx:184`, `pages/tools/FriendlyMatchesListCard.tsx:117`), and the stats/profile views ask for every game (`pages/stats/RecordsView.tsx:180`, `pages/stats/PlayerProfile.tsx:74`, `pages/stats/h2h/MatchupView.tsx:145`, `pages/stats/StarsView.tsx:58`, `pages/stats/H2HView.tsx:291`, `pages/ProfilePage.tsx:71`).

---

## A club's star rating — 5 expressions
**What varies:** glyphs vs digits, glyph size, and the glyph's side of the number.

- **A — five 14px glyphs** (`ui/primitives/Stars.tsx:26`) · 5 sites: `MatchSides` glyph line (`:154`; Matches Details, stats-history Details, 6 hero surfaces), club slot (`ui/SelectClubsPanel.tsx:137`), picker row (`ui/ClubPicker.tsx:100`), comments header (`pages/live/comments/CommentList.tsx:192`).
- **B — five 12px glyphs** · 2 sites: star history (`ui/ClubStarHistory.tsx:63`), stats "Club stars" ladder (`pages/stats/StarsView.tsx:97`).
- **C — one 12px glyph + number, `★ 3.5`, mirrored so the two numbers meet at the centre** (`ui/primitives/Stars.tsx:75`) · 1 site: Friendlies Details via `MatchSides.tsx:136`.
- **D — digits then a text star, `3.5★`** · 9 sites: Clubs page row meta (`pages/clubs/ClubList.tsx:83`), Clubs page group labels / create form / delete dialog (`pages/ClubsPage.tsx:53`, `:348`, `:411`, `:492`, `:573`), star filter options (`ui/clubControls.tsx:135`), `ratingText` (`:77`), and the star history row — where it sits **next to** the five glyphs of B, so that row states the rating twice (`ui/ClubStarHistory.tsx:63`–`:64`).
- **E — the same `N★` shape used for a number that is not a star rating**: the stats Player header prints the Elo rating as `1234★` (`pages/stats/PlayerProfile.tsx:113`).

---

## Win / draw / loss — 9 expressions
**What varies:** colour on a numeral, a letter in a disc, a coloured triple, a weight change, a hue ramp.

- **A — the focus side's numeral takes `text-win/draw/loss`** (`ui/primitives/ScoreLine.tsx:46`) · 1 site enabling it: `pages/stats/MatchHistoryList.tsx:83` — the 6 stats-history surfaces, both views.
- **B — a 16px disc with the letter `W`/`D`/`L`, `bg-win/15 text-win`, at the row's outer edge** (`ScoreLine.tsx:52`, `:186`, `:194`) · 1 site: `MatchHistoryList.tsx:85`, **Compact only** — the badge disappears when the reader switches the same list to Details.
- **C — a 24px disc with the letter, `ring-1 ring-inset`, in a "Last 5" strip** · 1 site: `pages/stats/h2h/MatchupView.tsx:47`, `:229`.
- **D — coloured text `W3` for the current run** · 1 site: `MatchupView.tsx:216`.
- **E — `RecordLine` triple `3-0-0` with each digit coloured, hyphens uncoloured** (`ui/primitives/RecordLine.tsx:188`) · 13 sites: `pages/live/StandingsTable.tsx:366`, `pages/live/MatchH2HPanel.tsx:50`, `pages/profile/ProfileOverviewTab.tsx:35`, `:144`, `pages/stats/H2HView.tsx:62`, `:521`, `:594`, `pages/stats/StarsView.tsx:102`, `pages/stats/h2h/DuoDetail.tsx:49`, `pages/stats/h2h/DuoLeaderboard.tsx:34`, `pages/stats/HeadToHeadRows.tsx:86`, `:98`, `:152`, `:159`.
- **F — the same triple hand-written with its own spans** · 3 sites: `pages/stats/PlayerProfile.tsx:113`, `pages/profile/ProfileStatsSection.tsx:100`, and `MatchupView.tsx:203`–`:209` (this one greys the hyphens with `text-text-muted`; the other two leave them in the surrounding tone).
- **G — separate W / D / L table columns in the three colours** · 1 site: `pages/stats/standings.ts:93`–`:95` → `StatsTable` (stats Table, dashboard Standings preview).
- **H — weight only, no colour: winner's names `font-semibold`, loser's `text-text-muted`** (`ScoreLine.tsx:252`) · all 9 `ScoreLine` sites; What-if reuses the muted-names cue to mean "assumed to lose" (`pages/live/WhatIfSection.tsx:100`).
- **I — a red→green hue ramp on a tile** · 2 sites: the H2H matrix (`pages/stats/H2HView.tsx:472`, `.h2h-cell`) and the Positions grid (`.pos-tile`, `styles.css`).

Adjacent, and not W/D/L but drawn in the same family: the standings leader gets a 2px `bg-status-bar-green` bar on the row's left edge (`pages/live/StandingsTable.tsx:347`); a tournament winner gets a gold `Trophy` (`pages/live/OverviewSection.tsx:133`, `pages/TournamentsPage.tsx:168`).

---

## Match-list idioms — 8 row/divider idioms, 5 divider strengths
**What varies:** row min-height and padding, whether there is a divider, how far the hover wash overhangs the content.

- **A — `.row` (min-height 52px, `py-3`, `gap-3`, `styles.css:196`) between `list-divided` hairlines** · 8 lists: tournament Standings/Results (`pages/live/StandingsTable.tsx:335`), What-if projected table (`pages/live/WhatIfSection.tsx:294`), Clubs page (`pages/clubs/ClubList.tsx:88`), duo leaderboard (`pages/stats/h2h/DuoLeaderboard.tsx:28`), cup reigns (`pages/stats/CupDetail.tsx:181`), H2H by-player (`pages/stats/H2HView.tsx:507`), Tournaments list (`ListRow`, `ui/primitives/List.tsx:72`), Players admin.
- **B — `list-divided` + a custom `py-2` row whose hover wash overhangs the content by a negative margin** · 3 places, 2 different overhangs: Matches tab `-mx-2 px-2 py-2` (`pages/live/MatchList.tsx:158`), Friendlies `-mx-1 px-1 py-2` / `py-1.5` (`pages/tools/FriendlyList.tsx:145`), dashboard cup block `-mx-2 px-2 py-2` (`pages/dashboard/CupsPreviewCard.tsx:90`).
- **C — `list-divided` + a row with vertical padding only, wash flush with the content** · 7 places, 4 paddings: stats history `py-2` Details / `py-1` Compact (`pages/stats/MatchHistoryList.tsx:73`), Records `py-2` (`pages/stats/RecordsView.tsx:92`), What-if matches `py-2` (`pages/live/WhatIfSection.tsx:108`), Streaks `py-2` (`pages/stats/StreaksView.tsx:53`), Club-stars ladder `px-1 py-2.5` (`pages/stats/StarsView.tsx:94`), star history `py-1.5` (`ui/ClubStarHistory.tsx:61`), comments blocks `px-3 py-3` (`pages/live/comments/CommentList.tsx:202`).
- **D — an `inset p-1.5` box holding its own rows** · 3 blocks on one tab, 3 paddings: Overview mini-standings `px-1.5 py-0.5` no divider (`pages/live/OverviewSection.tsx:230`, `:242`), "Next matches" `px-1.5 py-1` no divider (`:268`), "Played matches" `px-1.5 py-2` **with** `list-divided` (`:304`, `:315`).
- **E — stacked `inset` boxes separated by `space-y-2`, no hairline** · 7 places: duo rows `px-3 py-2` (`pages/stats/HeadToHeadRows.tsx:80`, `:139`), top rivalries `px-3 py-2` (`pages/stats/H2HView.tsx:589`), match page H2H summary cards `px-3 py-2.5` (`pages/live/MatchH2HPanel.tsx:47`) and its "Recent matches" — a `space-y-2` stack where each item is a meta line + a `MatchRowWithClubs` (`:255`, `:266`), rival / teammate cards `px-3 py-2` (`pages/profile/ProfileOverviewTab.tsx:51`, `:162`).
- **F — `<table>` rows with `border-b border-border-card-inner/40`** · 3 places: stats Table + dashboard Standings (`pages/stats/StatsTable.tsx:189`), cup per-player (`pages/stats/CupDetail.tsx:260`), H2H matrix.
- **G — picker rows `px-3` + `py-2`, no divider, full-width hover wash** · 1 place: `ui/ClubPicker.tsx:68`.
- **H — a `row-tap` `<Link>`/`<button>` wrapping the whole row vs a stretched overlay behind inert content** — both used for match rows: wrapper on stats history (`MatchHistoryList.tsx:117`), Records (`RecordsView.tsx:92`), Overview played (`OverviewSection.tsx:315`); overlay on the Matches tab (`MatchList.tsx:158`) and Friendlies (`FriendlyList.tsx:145`).

Divider strengths in play: `list-divided` = `border-card-chip/40` (`styles.css:189`); table rows `border-card-inner/40` (`StatsTable.tsx:189`, `CupDetail.tsx:260`); table headers `border-card-chip/50` (`StatsTable.tsx:160`); stats-history tournament header `border-card-chip/35` (`MatchHistoryList.tsx:186`); Clubs page group separators `border-card-chip/30` (`ClubList.tsx:151`).

---

## Naming the fixture around the score — 2 numberings, 2 capitalisations, 3 positions
- `#4` · 4 places: Matches tab (`pages/live/MatchList.tsx:176`), Overview next and played (`pages/live/OverviewSection.tsx:269`, `:317`), What-if (`pages/live/WhatIfSection.tsx:112`).
- `Match 4` · 3 places: hero meta line (`ui/primitives/MatchOverviewPanel.tsx:73`, 6 surfaces), match page H2H recent (`pages/live/MatchH2HPanel.tsx:266`), match page title (`pages/live/MatchDetailPage.tsx:133`).
- `leg 1` lowercase (`MatchList.tsx:181`) vs `Leg 1` (`MatchOverviewPanel.tsx:73`, `MatchH2HPanel.tsx:266`).
- Where the meta sits: a line **above** the score (Matches tab, What-if, hero, match-page H2H recent), a centred line **below** it (`tName · date`, `pages/stats/RecordsView.tsx:88`), or on a **block header** above a group of rows (stats history, `MatchHistoryList.tsx:186`); Friendlies, Overview and the comments header carry none per row.

---

## Compact / Details — 3 controls and 4 fixed densities
- SegmentedSwitch, remembered in `localStorage` (`pages/live/MatchList.tsx:52`, `:72`) — Matches tab
- `ChipGroup` Compact/Details, component state (`pages/stats/h2h/MatchupView.tsx:244`, `pages/stats/PlayerProfile.tsx:173`) — matchup, stats Player
- the floating filter capsule (`pages/tools/FriendlyMatchesListCard.tsx:258`, `:388`) — Friendlies
- no control, always Compact: profile Matches tab (`pages/profile/MatchHistorySection.tsx:31`), profile Overview recent (`pages/profile/ProfileOverviewTab.tsx:189`), match page H2H recent (`pages/live/MatchH2HPanel.tsx:269`), Records (`pages/stats/RecordsView.tsx:77`).

---

## Odds line — 1 look, 2 copies
`1 4.88 · X 4.14 · 2 1.60` in `font-mono text-xs tabular-nums text-text-muted`, once as `mt-1 text-center` in the hero (`ui/primitives/MatchOverviewPanel.tsx:90`) and once as `mt-1.5 flex justify-center` around a local `OddsInline` (`pages/live/MatchList.tsx:20`, `:238`).

---

## Fresh-eye observations
Things that look arbitrary or wrong to a first-time viewer, whether or not the app is consistent about them.

1. **"Live" is red in the navigation and green everywhere else.** The tab-bar/sidebar dot is red-500 (`themes/defaults.css:40`); the Matches tab, What-if, hero pill, live-tournament label, standings leader bar and ongoing-streak chip all say the same thing in green. A reader learns "green = happening now" on every page and then meets a red pulse for it in the bar.
2. **An unplayed match in the comments feed reads `0 │ 0`**, in the finished style with both names at draw weight, because the header only shows a placeholder when goals are `null` and goals are never `null` (`CommentList.tsx:180`, `TournamentCommentsCard.tsx:581`, `schema.d.ts:2252`). Every other list says `vs` or `– │ –`.
3. **The New-friendly preview pill says `playing`** as soon as a goal is typed and `scheduled` before that (`pages/tools/FriendlyMatchCard.tsx:255` → `MatchOverviewPanel.tsx:76`), for a result that is being entered after the fact; once saved, the friendly carries no state marker anywhere.
4. **Enum words are user-facing text.** `finished`, `scheduled`, `playing` appear verbatim, lowercase, inside a bordered pill on 6 surfaces and beside a dot on the Matches tab, while the Edit-result switch capitalises them and What-if rewrites them.
5. **The W/D/L badge only exists in Compact.** Toggle the same stats history to Details and the letter disc vanishes, leaving only the numeral colour (`MatchHistoryList.tsx:85`). Compact says more about the result than Details.
6. **`vs` versus `– │ –` one toggle apart.** A scheduled match on the Matches tab shows `vs` in Compact and two dashes with a hairline in Details (`MatchList.tsx:227` flips the size).
7. **The hairline walks.** In 7 of 8 lists the score separator's x depends on the row's own digit count; only the Friendlies page fixes it (`FriendlyList.tsx:120`).
8. **Elo wears a star.** `1234★` in the stats Player header (`PlayerProfile.tsx:113`) uses the same glyph the app uses for club star ratings a few blocks lower on the same page.
9. **The star-history row states the rating twice**, five glyphs and then `3.5★` (`ui/ClubStarHistory.tsx:63`–`:64`).
10. **"No club" is printed as if it were a club's name**, in the club-name slot, muted, on 9 surfaces (`MatchSides.tsx:108`); a first-time reader can take it for a club called "No club".
11. **A decider is a sentence with a hyphen score.** `Penalties: Roli 5-4 Flo` (`LiveTournamentPage.tsx:305`) is the only score in the app rendered as running prose, and the only one with a hyphen on screen.
12. **The Overview tab uses three row rhythms in a row.** Mini-standings `py-0.5` without dividers, Next matches `py-1` without dividers, Played matches `py-2` with dividers (`OverviewSection.tsx:242`, `:268`, `:315`), all inside identical `inset p-1.5` boxes.
13. **Same standings, two densities one tap apart.** Overview's mini table has no avatars at `text-xs` (`OverviewSection.tsx:242`); the Standings tab has 36px avatars in 52px rows (`StandingsTable.tsx:335`, `:354`).
14. **The hover wash overhangs by 8px, 4px or 0** depending on the list (`MatchList.tsx:158`, `FriendlyList.tsx:145`, `MatchHistoryList.tsx:117`), so a pressed row's highlight box sits differently relative to the section rule on each page.
15. **The league flag changes sides.** Under a score the flag is mirrored to the outside of the league name (`MatchSides.tsx:134`, `:144`); in the picker, the Clubs page and the club slot it is always first.
16. **A team name has four spellings**: stacked, `Flo + Berni`, `Flo/Berni`, `Flo / Berni` — and the last two differ only by spaces, in views a reader moves between directly (comments header → match page H2H tab).
17. **The `live` chip on an ongoing streak** (`StreaksView.tsx:63`) is dressed exactly like the match-state pill's `playing` but means "this run is still open".
18. **Two `#`s on one line.** The Matches tab meta line reads `#4 playing · leg 1` while the hero directly above (Overview/Current) reads `Match 4 · Leg 1 [playing]` for the same fixture.
