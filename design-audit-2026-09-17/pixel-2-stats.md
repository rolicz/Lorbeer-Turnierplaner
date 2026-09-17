# Stats and tournament screens at 390px — what the pixels say

Set: 19 full-page captures, `blue-m-*`, 780 px wide = 390 CSS px at device-scale 2. All
distances below are CSS px unless marked "img px". Measurements were taken with PIL (flood
fills for boxes, row scans for lines, ink bounding boxes for type); where I only estimated,
I say so. Component names in parentheses come from `frontend/src` and are there only to
point at the code — every finding is stated from what is visible.

Screens, by what a reader would call them:

| file | screen |
|---|---|
| `blue-m-stats-table.png` | Stats › Overview › Table |
| `blue-m-stats-positions.png` | Stats › Overview › Positions |
| `blue-m-stats-streaks.png` | Stats › Overview › Streaks |
| `blue-m-stats-records.png` | Stats › Overview › Records |
| `blue-m-stats-cups.png` | Stats › Overview › Cups |
| `blue-m-stats-trends.png` | Stats › Trends |
| `blue-m-stats-h2h-players.png` | Stats › H2H › Players |
| `blue-m-stats-h2h-duos.png` | Stats › H2H › Duos (shows the Players view behind a notice) |
| `blue-m-stats-matchup.png` | Stats › H2H › "Roli vs Berni" drill-in |
| `blue-m-stats-player.png` | Stats › Player (Roli) |
| `blue-m-live-overview.png` | live tournament › Overview |
| `blue-m-live-current.png` | live tournament › Current |
| `blue-m-live-matches.png` | live tournament › Matches |
| `blue-m-live-standings.png` | live tournament › Standings |
| `blue-m-live-comments.png` | live tournament › Comments |
| `blue-m-live-whatif.png` | live tournament › What if |
| `blue-m-match-detail.png` | Match 1 › Head-to-Head |
| `blue-m-match-edit.png` | Match 1 › Edit result |
| `blue-m-done-tournament.png` | finished tournament › Overview |

Two things that are **not** findings, checked so nobody re-checks them:
- The gap between the tab strip's hairline and the first content box is 25 img px on all 19
  screens (12.5 CSS px). Where the first thing is text rather than a box the ink starts 3–8 px
  lower, which is cap-height, not layout.
- The tab strip fades its labels at both scroll edges (glyph brightness ramps 32→111 over
  32 img px at the left edge of the Comments capture, 97→52 at the right edge of Overview), so
  the half-visible "M…" / "…andings" tabs are faded, not cut. The floating "All · 🏆" capsule
  sits at the same viewport spot on all ten Stats captures and lands mid-page in the tall ones
  (over the H2H picker's sixth avatar, over the radar's "Defense" label) — a fixed element in a
  full-page capture, same as the hidden tab bar.

---

## Section heading — 5 variants
**What varies:** whether the label is uppercase, whether it carries a trailing hairline rule, whether an icon leads it, and whether it lives on the page or inside a card as a bold title.
- **A — uppercase 9 px cap label + trailing rule, no icon** (`.section-label` + `.section-head` in `styles.css`) · seen on 9 screens: "CURRENT MATCH ———", "KEY NUMBERS ———", "MATRIX ———". The rule sometimes ends in something: an ⓘ (Positions), "×4"/"×3" counts (Records), an "Open Standings →" button (Overview), "Show all" (H2H), a Compact/Details control (Player).
  - `blue-m-stats-positions.png`, `blue-m-stats-cups.png`, `blue-m-stats-h2h-players.png`, `blue-m-stats-h2h-duos.png`, `blue-m-stats-matchup.png`, `blue-m-stats-player.png`, `blue-m-live-overview.png`, `blue-m-live-whatif.png`, `blue-m-done-tournament.png`
- **B — same label and rule, with a leading lucide icon** · seen on 3 screens: "🔥 WIN STREAK", "🏆 MOST TOURNAMENT WINS", "⧉ 5 MATCHES".
  - `blue-m-stats-streaks.png` (all 4 sections), `blue-m-stats-records.png` (all 5), `blue-m-live-matches.png`
- **C — uppercase label with no rule** · seen on 3 screens, always above a row of pills: "COLUMNS", "METRIC" / "VIEW" / "RANGE", "PLAYER". What if uses C for "PLAYER" and A for "PROJECTED TABLE" ten lines lower; H2H's "MATRIX" also labels a pill row but gets the rule.
  - `blue-m-stats-table.png`, `blue-m-stats-trends.png`, `blue-m-live-whatif.png`
- **D — sentence-case, regular weight, no rule** · seen on 2 screens: "Current" (×4, same 9 px cap as the uppercase labels) and "Compare with" (11.5 px cap — larger than every uppercase label).
  - `blue-m-stats-streaks.png`, `blue-m-stats-player.png`
- **E — bold sentence-case title inside a card, 11 px cap** · seen on 4 screens: "Comments 0", "Match comments 0", "Clubs", "Recent matches", "Result", "Advanced"; "Exact matchup" / "Team A together" are a bigger 13.5 px inside an inset. Within one tournament, Overview / What if / Matches head their blocks with A/B while Current and Comments head theirs with E.
  - `blue-m-live-current.png`, `blue-m-live-comments.png`, `blue-m-match-detail.png`, `blue-m-match-edit.png`

## Tab strip — 2 variants
**What varies:** whether each tab has an icon.
- **A — icon + label** · 17 screens: all 10 Stats captures and all 7 tournament captures (Overview, Current, Standings, Matches, What if, Comments, Results).
- **B — label only** · 2 screens: "Head-to-Head · Comments · Edit result".
  - `blue-m-match-detail.png`, `blue-m-match-edit.png`
Height, underline colour and thickness are identical in both.

## Standings — 4 idioms over 5 appearances
**What varies:** avatar presence and size, header row, divider shape, how the points unit is written, how the top row is marked.
- **A — compact table in a card** (`pages/live/OverviewSection.tsx`) · 2 screens: header "# PLAYER … P GD PTS" all caps grey, no avatars, no dividers, leader row bold.
  - `blue-m-live-overview.png` (STANDINGS), `blue-m-done-tournament.png` (FINAL STANDINGS)
- **B — rich rows** (`pages/live/StandingsTable.tsx`) · 1 screen: 36 px avatar, rank + movement triangle, name followed by chips (crown, shield-2, target-20), proportional "1P 0-1-0 0:0 GD +0" line, big "1" over small "pts" at the right, rows 73 px tall with the rounded-corner divider (see Dividers B), a green vertical bar on row 1.
  - `blue-m-live-standings.png`
- **C — projected rows** (`pages/live/WhatIfSection.tsx`) · 1 screen: 30 px avatar, rank, name, "+9", then "10 pts" on one line; straight full-width dividers; the chosen player's row is tinted brown.
  - `blue-m-live-whatif.png`
- **D — leaderboard with column headers** (`pages/stats/StatsTable.tsx`) · 1 screen: header "PLAYER · Pts▾ · PPM · P · Win% · Elo ⓘ", 28 px avatar with the cup ring, straight dividers, no unit.
  - `blue-m-stats-table.png`
The same live tournament shows its table as A on Overview, B on Standings and C on What if.

## Column header row — 3 casings on the 3 tables that have one
- **A — all caps**: "# PLAYER P GD PTS" · `blue-m-live-overview.png`, `blue-m-done-tournament.png`
- **B — caps for the name column, mixed case for the numbers**: "PLAYER Pts▾ PPM P Win% Elo" · `blue-m-stats-table.png`
- **C — sentence case throughout**: "Player Titles Held▾ Longest" · `blue-m-stats-cups.png` (PER PLAYER, twice)
The sort mark itself (orange label + solid ▾) is identical on B and C. The streak, records, H2H-by-player and reigns lists have no header row at all.

## Points unit — 3 spellings
- **stacked** big "1" over small "pts" · `blue-m-live-standings.png`, `blue-m-done-tournament.png` (winner card "9 / pts")
- **inline** "10 pts" · `blue-m-live-whatif.png`, `blue-m-stats-player.png` ("105 pts")
- **none** · `blue-m-stats-table.png`, and the compact tables on `blue-m-live-overview.png` / `blue-m-done-tournament.png`

## Match row — 6 idioms
**What varies:** where the score sits, whether crests appear, how the winner is marked, whether an index/status line precedes it.
- **A — compact perspective row** (`pages/stats/MatchHistoryList.tsx`) · 3 screens: names right-aligned to a fixed centre score "3 | 1", crest (or flag) between name and score, a W/L/D circle on the perspective player's side, only that player's goals coloured, 2v2 names stacked on two lines.
  - `blue-m-stats-matchup.png`, `blue-m-stats-player.png`, `blue-m-match-detail.png` (Recent matches)
- **B — centred record row with a caption under it** · 1 screen: "Rumpi 🟢 8 | 1 🟢 Flo" then "Weihnachtsturnier · 23 Dec 25"; both goals white; in BIGGEST UPSET the third row swaps crests for nation flags.
  - `blue-m-stats-records.png`
- **C — indexed result in a card** · 1 screen: "#1   Rumpi 4 | 0 Roli", no crests, winner's name bold and loser's grey, both goals white, hairline dividers.
  - `blue-m-done-tournament.png`
- **D — indexed fixture in a card** · 1 screen: "#2  Flo/Berni vs Roli/Rumpi", no dividers.
  - `blue-m-live-overview.png` (NEXT MATCHES)
- **E — full match block** · 1 screen (plus the single card on Overview/Current/Edit): "● #1 playing · leg 1", big stacked score, mono odds line, club + crest, league + flag, five stars, ↑ ↓ ⇄ buttons.
  - `blue-m-live-matches.png`
- **F — what-if block** · 1 screen: "● #1 live … as it stands", medium score or "vs", three 1/X/2 circles.
  - `blue-m-live-whatif.png`

## A pair of players — 3 spellings
- **stacked on two lines** · 8 screens (every match card, A/E/F rows above)
- **"Roli / Berni" with a slash** · 1 screen: `blue-m-match-detail.png` (card title, both buttons)
- **"Flo + Rumpi" with a plus** · 1 screen: `blue-m-stats-records.png` (HIGHEST-SCORING MATCH)

## Record string "P · W-D-L · goals · ppm" — 2 typefaces
**What varies:** monospace vs the proportional UI face, for the same coloured green-yellow-red triplet.
- **A — monospace** · 4 screens: "1 matches 0-0-1 1:6 0.00 ppm", "31P 19-7-5", "10P 7-1-2" with a bold mono "2.20" before a sans "ppm"; the odds line "1 4.48 · X 3.81 · 2 1.71" on the 4 tournament screens that show it is mono too.
  - `blue-m-match-detail.png`, `blue-m-stats-h2h-players.png`, `blue-m-stats-h2h-duos.png`, `blue-m-stats-player.png` (CLUB STARS)
- **B — proportional** · 5 screens: "1P 0-1-0 0:0 GD +0" (`ui/primitives/RecordLine.tsx`), "19-7-5 2.06 ppm" in the Favorite tile, "26 matches 14-4-8" in rivalry cards, "1052★ · 31-12-20 · 105 pts", the big "3-1-6" tile.
  - `blue-m-live-standings.png`, `blue-m-stats-h2h-players.png`, `blue-m-stats-h2h-duos.png`, `blue-m-stats-matchup.png`, `blue-m-stats-player.png`
On H2H › Players the Favorite tile (B) sits 10 px above the by-player list (A).

## The same metric, named 3 ways
- points per match: **"PPM"** (`blue-m-stats-table.png` header, H2H matrix pill), **"ppm"** (`blue-m-match-detail.png`, H2H tiles and list, Player club stars), **"Pts / match"** (`blue-m-stats-matchup.png` tile, `blue-m-stats-player.png` KEY NUMBERS)
- win share: **"Win%"** (Table), **"Win %"** (matrix pill, radar axis, matchup tile), **"Win rate"** (Player tile)
- played: **"P"** (Table), **"31P"** (H2H list), **"Played"** (matchup/Player tiles, matrix pill), **"26 matches"** (rivalry cards)

## Dividers — 3 shapes
**What varies:** the hairline's length and whether its ends curve.
- **A — straight, full width (32→747 img px)** · 7 screens: `blue-m-stats-table.png`, `blue-m-stats-streaks.png`, `blue-m-live-whatif.png`, `blue-m-stats-player.png`, `blue-m-stats-matchup.png`, `blue-m-live-matches.png`, `blue-m-done-tournament.png` (inside the card)
- **B — inset to 50→729 img px with a visible quarter-circle at each end** (each row is drawn as a rounded box with only its top edge showing) · 5 screens: `blue-m-live-standings.png`, `blue-m-stats-h2h-players.png` and `blue-m-stats-h2h-duos.png` (by-player list), `blue-m-stats-records.png` (HIGHEST-SCORING and BIGGEST UPSET rows), `blue-m-stats-cups.png` (REIGNS)
- **C — none, spacing only** · `blue-m-live-overview.png` (both cards), rivalry cards on H2H, "Current" chip rows on Streaks
Records mixes A (MOST TOURNAMENT WINS) and B (HIGHEST-SCORING MATCH) on one screen.

## Card surface — 2 tones, often on one screen
**What varies:** fill and border. Measured at the card's left edge.
- **A — dark fill (21,30,48) with a 1 px lighter border (37,49,68)** · 5 screens: Clubs disclosure and "Match comments" (`blue-m-live-current.png`), "Comments" (`blue-m-live-comments.png`), "Result" / "Advanced" / "Clubs" (`blue-m-match-edit.png`), both cup-holder cards (`blue-m-stats-cups.png`), the player header (`blue-m-stats-player.png`)
- **B — lighter fill (29,40,60), no border** · 9 screens: the match card (`blue-m-live-overview.png`, `blue-m-live-current.png`), standings and next-matches cards, the H2H card and "Recent matches" (`blue-m-match-detail.png`), the chart card (`blue-m-stats-trends.png`), all stat tiles, rivalry cards, the best-case card (`blue-m-live-whatif.png`)
Match 1's Head-to-Head tab is B, its Edit result tab is A. Current stacks B (match card) directly over A (Clubs). Nested insets come in two further tones: (34,47,69) on `blue-m-match-edit.png` / `blue-m-stats-matchup.png` / cups "Current reign", and (38,52,75) on `blue-m-match-detail.png`. An **inactive filter pill is also (29,40,60)** — the same colour as a B card.

## Stat tile — 2 placements (and a third shape)
- **bare on the page** · 3 screens: KEY NUMBERS (`blue-m-stats-player.png`), RECORDS (`blue-m-stats-cups.png`), Favorite/Nemesis (`blue-m-stats-h2h-players.png`, `-duos`)
- **inside a card** · 2 screens: the six matchup tiles (`blue-m-stats-matchup.png`), "Current reign" (`blue-m-stats-cups.png`)
- **icon + label with a small "1 / 4" value** · 1 screen: STREAKS · CURRENT / RECORD (`blue-m-stats-player.png`)
Label size, value size (≈23 px cap) and 10 px corner match across all of them.

## Compact / Details toggle — 3 presentations on 3 screens
- **segmented track with icons, on the heading row** (`ui/primitives/SegmentedSwitch.tsx`): 40 px track, active segment a rounded rectangle (r≈12) · `blue-m-live-matches.png`
- **two loose stadium pills, no icons, on their own row under "MATCHES · 10"** (`ChipGroup`) · `blue-m-stats-matchup.png`
- **two loose stadium pills, no icons, on the "MATCH HISTORY" heading row** (`ChipGroup`) · `blue-m-stats-player.png`
`blue-m-match-edit.png`'s Scheduled / Playing / Finished uses the segmented shape without icons, so the segmented track and the loose pills are each used twice for a "pick one of few" control.

## Match state "playing" — 4 renderings
- **green outlined stadium badge "playing", 20 px tall** (`ui/primitives/MatchOverviewPanel.tsx`) · 3 screens: `blue-m-live-overview.png`, `blue-m-live-current.png`, `blue-m-match-edit.png`
- **inline pale-cyan word "playing" after "● #1"** · `blue-m-live-matches.png`
- **inline green word "live" after "● #1", grey "as it stands" at the right** · `blue-m-live-whatif.png`
- **filled teal 16 px badge "live"** on a streak row · `blue-m-stats-streaks.png`

## Avatar diameter — 9 sizes
24 (`blue-m-stats-streaks.png`, `blue-m-stats-records.png`, column heads on `blue-m-stats-positions.png`) · 28 (`blue-m-stats-table.png`, PER PLAYER on `blue-m-stats-cups.png`) · 30 (projected table, `blue-m-live-whatif.png`) · 32 (REIGNS, `blue-m-stats-cups.png`) · 36 (`blue-m-live-standings.png`, the picker on `blue-m-live-whatif.png`) · 38 (winner card, `blue-m-done-tournament.png`) · 40 (header, `blue-m-stats-matchup.png`) · 44 (pickers on `blue-m-stats-h2h-players.png`, `-duos`, `blue-m-stats-player.png`) · 48 (holder, `blue-m-stats-cups.png`) · 56 (header, `blue-m-stats-player.png`).
The **player picker** — a row of circles with an orange ring on the chosen one and the name under it — is 36 px on What if and 44 px on the three Stats screens, with wider spacing there.

## Cup-holder ring on the avatar — present on 8 screens, absent on 5
Berni wears a yellow ring and Rumpi a green one on `blue-m-stats-table.png`, `blue-m-stats-streaks.png`, `blue-m-stats-records.png`, `blue-m-stats-cups.png`, `blue-m-stats-h2h-players.png`, `blue-m-stats-h2h-duos.png`, `blue-m-stats-matchup.png`, `blue-m-stats-player.png`. The same two players have only the neutral hairline on `blue-m-stats-positions.png` (column heads), `blue-m-live-standings.png` (a crown chip after the name instead), `blue-m-live-whatif.png` (picker and table), `blue-m-done-tournament.png` (Rumpi in the winner card). Inside Stats › Overview, Table has the rings and Positions, one pill to the right, does not.

## Mode + date pills — 2 orders
- **mode first, plain** "[2v2] [13/09/2026]" · `blue-m-live-overview.png`, `blue-m-done-tournament.png` (`pages/live/TournamentMetaPills.tsx`)
- **date first, with a crown badge overlapping the pill's top-right corner** "[11/07/2026 👑] [2v2]" · `blue-m-stats-matchup.png`, `blue-m-stats-player.png` (every tournament group header)
Both use the same 20 px monospace stadium.

## Date format — 2
- **dd/mm/yyyy** · 6 screens: `blue-m-live-overview.png`, `blue-m-done-tournament.png`, `blue-m-stats-cups.png` ("Holding since 11/09/2026", reigns, "30/11/2025 – 04/01/2026"), `blue-m-stats-matchup.png`, `blue-m-stats-player.png`, `blue-m-match-detail.png` ("Match 8 · Leg 1 · 04/01/2026")
- **dd Mon yy** · 2 screens: "30 Nov 25 – 23 Dec 25" (`blue-m-stats-streaks.png`), "07 Aug 26", "11 Sept 26" (`blue-m-stats-records.png` — the only four-letter month)

## Player colour key — 2 intensities, 3 legend shapes
- **saturated dots** (224,62,62 / 62,62,224 / …) in stadium legend pills · `blue-m-stats-trends.png`; the same dots inline as "● Berni ● Atzi" text under the reign bar · `blue-m-stats-cups.png`
- **muted dots** (43,50,134 / 116,123,61 — Flo's yellow reads olive) inside the "Compare with" chips · `blue-m-stats-player.png`
- the green and yellow lines on `blue-m-stats-positions.png` have no key at all.

## "There is more" — 4 affordances
- grey text "+1 more" (×4) · `blue-m-stats-streaks.png`
- "Show all" button on the heading rule · `blue-m-stats-h2h-players.png`, `-duos`
- "view profile" grey text after the name, plus a › chevron · `blue-m-stats-player.png`
- "🔥 Longest runs in Streaks" icon button under the last section · `blue-m-stats-records.png`

## Text button height — 2
- **32 px, r≈10** · 5 screens: "Open Standings →" (`blue-m-live-overview.png`), "Open Results →" / "Open Matches →" (`blue-m-done-tournament.png`), "Show all" (`blue-m-stats-h2h-players.png`), "Switch to 2v2" (`blue-m-stats-h2h-duos.png`), "Longest runs in Streaks" (`blue-m-stats-records.png`)
- **36 px, r≈10–12** · 2 screens: "Cancel" / "Save result" / "Swap sides" (`blue-m-match-edit.png`), "All matches …" (`blue-m-match-detail.png`)
Icon-only buttons are 30 px (`blue-m-live-current.png`, `blue-m-live-matches.png`). All buttons are rounded rectangles; every filter pill is a full stadium (r = 16 on 32).

## A count next to a heading — 6 ways
"5 MATCHES" (count first, `blue-m-live-matches.png`) · "MATCHES · 10" (`blue-m-stats-matchup.png`) · "×4" at the rule's end (`blue-m-stats-records.png`) · "4 matches" grey, right-aligned on the group line (`blue-m-stats-matchup.png`, `blue-m-stats-player.png`) · "Comments 0" grey after the title (`blue-m-live-comments.png`, `blue-m-live-current.png`) · "1 total" right (`blue-m-match-detail.png`)

## Comment composer — 2 shapes, and 2 empty-state sentences
- `blue-m-live-current.png`: "Roli · ⊕ Goal · ◎ Shots" chip row, then [image] [Write a comment…] [send]; empty text "No comments on this match yet."
- `blue-m-live-comments.png`: "↳ General (tournament) ▾" dropdown, then a lone "Roli" chip, then the same row; empty text "No comments yet. Be the first to add one."

## Info icon — 2 placements
inline after the "Elo" column header (`blue-m-stats-table.png`) vs at the far right end of the heading rule (`blue-m-stats-positions.png`).

## Cramped, cut or wrapping at 390 px
- Pill rows leave a one-pill orphan line: "Cups" alone under Table/Positions/Streaks/Records (5 screens), "Flo" alone under the Trends legend and again under "Compare with", "Per match" alone under METRIC, "Goal diff · Rivalry" under MATRIX (2 screens), the COLUMNS row wraps to two.
- `blue-m-stats-positions.png`: every row label is truncated ("7. Bauernkranz…", "4. Lorbeerkran…", "Kranzlos S. Tur…"); the green and yellow lines run over the digits in the cells they connect (the "1"s in 6./5. Bauernkranz for Roli, Berni's "1" in 4. Lorbeerkranz, Mike's "1" in Neujahrsturnier).
- `blue-m-match-edit.png`: the match card is nested one level deeper than on Current/Overview/Matches and is 24 px narrower, so "Cheltenham Town" breaks to two lines here and nowhere else (3 screens keep it on one).
- `blue-m-match-detail.png`: the blue button truncates its own label: "All matches: Roli / Berni vs Rumpi / …".
- `blue-m-stats-trends.png`: the x-axis carries two label rows (months, then eleven 45° tournament names); the y-axis ticks are 0 · 53 · 105.
- `blue-m-stats-h2h-players.png`: the matrix's rotated column names sit ≈70 img px above the first row, a gap larger than any row gap on the screen.

---

## Fresh-eye observations
- Two pages that are the same page: `blue-m-stats-h2h-duos.png` is `blue-m-stats-h2h-players.png` with a two-line notice and a "Switch to 2v2" button on top — the matrix, the by-player list and the rivalry cards repeat pixel for pixel below it.
- The filter's state is written twice on the drill-in: the floating capsule says "All · 🏆" while the header card says "Overall · Tournaments" (`blue-m-stats-matchup.png`).
- A star means two things: five white stars under a club are its quality (5 tournament screens, CLUB STARS on Player), and "1052★" in the Player header is an Elo number.
- The H2H matrix uses vertical, rotated column names — the only rotated text in the app besides the Trends x-axis — and leaves the diagonal as blank dark squares.
- "Last N" on the Table is a pill that looks like every other selectable pill but is followed by the grey caption "all-time totals" instead of sitting in a group.
- The Overview tab of a tournament repeats what its other tabs show (a match card, a standings table, a match list) in three different reduced forms, each with an "Open … →" button — a reader meets the standings in three shapes before leaving one tournament.
- On the Player page the picker has no heading; on What if the same picker is headed "PLAYER"; on H2H it is headed "HEAD-TO-HEAD BY PLAYER" with a rule.
- Rank numbers are bold on Streaks and Records and regular on Table, What if and Standings.
- The whole app writes 2v2 opponents as two stacked names, then the Head-to-Head card writes "Roli / Berni" and the Records list "Flo + Rumpi".
- Inactive pills and B-tone cards share one colour, so on `blue-m-stats-trends.png` the legend pills sit directly under a card of the same fill and read as loose pieces of it.
- The reign bar on Cups has no tick marks or dates; its legend dots are the only key, and the same colours mean the same players on Trends, so the two screens agree without ever saying so.
