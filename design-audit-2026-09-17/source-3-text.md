# Time, numbers and words

Method: exhaustive `grep` over `frontend/src` (excluding `api/generated/` and `src/test/`), then reading every hit in context. Every count below is of call sites in code, not of on-screen occurrences. Where a helper is called once but rendered on several screens, the screens are listed. Locale samples were produced by running each helper's exact `toLocale*` options through Node's ICU for `en-US`, `en-GB`, `de-AT`, `de-DE` — the app passes `undefined` as the locale everywhere, so what a viewer sees is decided by their browser.

---

## Dates — 9 rendered shapes

**What varies:** numeric vs spelled month, padded vs unpadded day/month, 4-digit vs 2-digit year, with or without time, relative vs absolute, locale-driven vs fixed. (Weekday: 0 places. Year omitted for the current year: 0 places — the year is always printed.)

- **A — locale numeric date, no options** (`fmtDate`, `utils/format.ts:3-8`): en-US `9/12/2026` · en-GB `12/09/2026` · de-AT `12.9.2026` (note: unpadded on a German phone) · 12 call sites, 10 files
  - `frontend/src/pages/live/TournamentMetaPills.tsx:28` — live tournament page (desktop title row and the Overview tab's date pill)
  - `frontend/src/pages/TournamentsPage.tsx:163` — tournaments list, every row's meta line
  - `frontend/src/pages/stats/MatchHistoryList.tsx:192` — date pill above each tournament's match group: profile Overview "Recent matches", profile Matches tab, Stats › Player › matches, Stats › H2H matchup drill-in, H2H per-player history modal (callers at `pages/profile/ProfileOverviewTab.tsx:185`, `pages/profile/MatchHistorySection.tsx:27`, `pages/stats/PlayerProfile.tsx:182`, `pages/stats/h2h/MatchupView.tsx:250`, `pages/stats/H2HView.tsx:351`)
  - `frontend/src/pages/live/MatchH2HPanel.tsx:266` — match detail › H2H panel: "Match 4 · Leg 2 · 12.9.2026"
  - `frontend/src/pages/stats/cupParts.tsx:60` — "Holding since 12.9.2026" (dashboard cups preview and Stats › Cups detail)
  - `frontend/src/pages/stats/cupReigns.ts:105` — reign span "12.9.2026 – 23.4.2026" / "12.9.2026 – now" (Cup detail "Longest reign" tile hint, reign-timeline tooltips)
  - `frontend/src/pages/stats/CupDetail.tsx:217` — reign row "took it from X · <tournament> · 12.9.2026"
  - `frontend/src/pages/stats/CupDetail.tsx:221` — reign row "ended by X · 12.9.2026"
  - `frontend/src/ui/ClubStarHistory.tsx:21` — "since 12.9.2026" / "by 12.9.2026" (club editor on the Clubs page and the club picker's star history)
  - `frontend/src/ui/shell/NotificationBell.tsx:30` — bell list, any entry older than 7 days (see Relative time)
  - `frontend/src/pages/dashboard/TrendsPreviewCard.tsx:153`, `:154` — x-axis hints under the dashboard trends chart
- **B — padded numeric date + hh:mm** (`fmtDateTime` `utils/format.ts:22-32`, `fmtTs` `:35-43`, identical options): en-US `09/12/2026, 02:30 PM` · en-GB `12/09/2026, 14:30` · de-AT `12.09.2026, 14:30` · 6 call sites
  - `frontend/src/pages/live/TournamentCommentParts.tsx:177` — tournament comment byline
  - `frontend/src/pages/live/TournamentCommentParts.tsx:178` — "· edited 12.09.2026, 14:30" on a comment
  - `frontend/src/pages/live/TournamentCommentsCard.tsx:981` — delete-comment dialog subtitle
  - `frontend/src/pages/profile/GuestbookEntryCard.tsx:120` — guestbook entry byline
  - `frontend/src/pages/profile/GuestbookSection.tsx:174` — delete-message dialog subtitle
  - `frontend/src/pages/ideas/IdeaCard.tsx:140` — idea card byline
  - On a de-AT phone the same day reads `12.9.2026` in A and `12.09.2026` in B; on en-US `9/12/2026` vs `09/12/2026`. On en-GB both are padded.
- **C — abbreviated month + 2-digit year** (`fmtShortDate`, `utils/format.ts:118-123`): en-US `Sep 12, 26` · en-GB `12 Sept 26` · de-AT `12. Sep. 26` · 4 call sites, all in Stats › Overview
  - `frontend/src/pages/stats/streakDisplay.ts:6`, `:8` — Streaks sub-view record rows "12. Sep. 26 – 3. Okt. 26" / "since 12. Sep. 26" (also the streak groups inside Records)
  - `frontend/src/pages/stats/RecordsView.tsx:88` — Records › biggest wins etc.: "<tournament> · 12. Sep. 26"
  - `frontend/src/pages/stats/RecordsView.tsx:141` — Records › Most tournament wins: latest title's date
  - The helper's own comment (`format.ts:117`) says `12 Jun '26`; the apostrophe is never produced.
- **D — spelled-out day heading** (`fmtDateLong`, `utils/format.ts:15-20`): en-US `September 12, 2026` · en-GB `12 September 2026` · de-AT `12. September 2026` · 1 call site
  - `frontend/src/pages/tools/FriendlyList.tsx:199` — friendlies list day-group headings
- **E — month + year heading** (inline `toLocaleDateString(undefined, {month:"long", year:"numeric"})`): `September 2026` · 1 call site
  - `frontend/src/pages/TournamentsPage.tsx:98` — tournaments list month group headings
- **F — chart ticks** (inline `{month:"short"}`, year at January): `Sep` / en-GB `Sept`, `2026` · 1 call site
  - `frontend/src/pages/stats/charts.tsx:188` — Stats › Trends x-axis (and the dashboard trends preview, same chart)
- **G — fixed ISO-style `2026-09-12 14:30:45`, locale-free, with seconds** · 1 call site
  - `frontend/src/diagnostics/crashLog.ts:512-520` (`formatTimestamp`) rendered at `frontend/src/ui/layout/DiagnosticsSettings.tsx:62` — Settings › Diagnostics entries
- **H — time only, with seconds** (inline `toLocaleTimeString()`): en-US `2:30:45 PM` · de/en-GB `14:30:45` · 1 call site
  - `frontend/src/pages/tools/FriendlyMatchCard.tsx:386` — friendlies form: "Saved 14:30:45."
- **I — relative** ("just now" / "5m ago" / "3h ago" / "2d ago", numeric date A after 7 days) · 1 call site
  - `frontend/src/ui/shell/NotificationBell.tsx:19-30` (`timeAgo`) rendered at `:159` — bell popover

Also: one native `<input type="date">` (`frontend/src/pages/live/AdminPanel.tsx:296`, live tournament › Admin › Tournament date) — the browser's own picker format. `frontend/src/ui/layout/ViewportReadout.tsx:174` writes `toISOString()` (UTC, `Z`) into the copied diagnostics text — the only UTC timestamp in the app; everything else is browser-local.

---

## Relative vs absolute time for the same kind of thing — 2 variants

**What varies:** a user-authored post's byline is relative in one surface and absolute in the rest.

- **A — relative "2d ago"** · 1 place
  - `frontend/src/ui/shell/NotificationBell.tsx:159` — bell popover (a reply to your comment, a guestbook entry, a poke, a new idea)
- **B — absolute "12.09.2026, 14:30"** · 5 places
  - `frontend/src/pages/live/TournamentCommentParts.tsx:177` — the comment the bell entry opens
  - `frontend/src/pages/profile/GuestbookEntryCard.tsx:120` — the guestbook entry the bell entry opens
  - `frontend/src/pages/ideas/IdeaCard.tsx:140` — the idea the bell entry opens
  - `frontend/src/pages/live/TournamentCommentsCard.tsx:981`, `frontend/src/pages/profile/GuestbookSection.tsx:174` — delete dialogs

### "edited" marker — 2 variants
- **A — "· edited <date, time>"** · 1: `frontend/src/pages/live/TournamentCommentParts.tsx:178` (tournament comments)
- **B — "· edited" with no time** · 2: `frontend/src/pages/profile/GuestbookEntryCard.tsx:121` (guestbook), `frontend/src/pages/ideas/IdeaCard.tsx:141` (ideas)

### "still running" word — 4 variants
- **"live"** chip (lowercase) · `frontend/src/pages/stats/StreaksView.tsx:63` (Streaks record row that is ongoing); "Live" capitalised as a tournament status `frontend/src/ui/theme.ts:41` (tournaments list); "Live now" nav label
- **"ongoing"** · `frontend/src/pages/stats/streakDisplay.ts:7` (a streak with no start date)
- **"current"** · `frontend/src/pages/stats/CupDetail.tsx:214` (reign row), tile label "Current reign" `:121`, "Current" `frontend/src/pages/stats/StreaksView.tsx:72`
- **"now"** · `frontend/src/pages/stats/cupReigns.ts:105` ("… – now"), `frontend/src/ui/ClubStarHistory.tsx:70` (tag on the newest row)

---

## Times of day — 3 variants

**What varies:** 12h vs 24h is never chosen (locale decides), seconds appear on two surfaces only, one timestamp is UTC.

- **A — hh:mm, clock style left to the browser** (`hour12` never set) · 3 formatting paths, 6 call sites (the 6 in Dates-B)
  - `frontend/src/utils/format.ts:26-31`, `:37-42`
- **B — with seconds** · 2 places
  - `frontend/src/pages/tools/FriendlyMatchCard.tsx:386` — "Saved 14:30:45." (only time-only string in the app)
  - `frontend/src/diagnostics/crashLog.ts:516` — Settings › Diagnostics
- **C — UTC ISO** · 1 place: `frontend/src/ui/layout/ViewportReadout.tsx:174` (copied text only)

---

## Decimal places — 3 variants, reached by 5 routes

**What varies:** the same "x.xx" is produced by four different functions; stars and diagnostics trim to one place; Elo/rivalry/percent round to none.

- **A — two places** · 22 call sites via 4 routes
  - `fmtAvg` (6): `frontend/src/pages/stats/standings.ts:91` (PPM), `:99` (G/M), `:100` (GA/M), `:102` (GD/M, signed), `frontend/src/pages/stats/h2h/MatchupView.tsx:211` (Pts / match tile), `frontend/src/pages/live/MatchH2HPanel.tsx:59` ("2.10 ppm")
  - `fmtPct` (6 — despite its name, never a percentage): `frontend/src/pages/profile/ProfileStatsSection.tsx:93`, `:94`, `:95` (Pts/Goals/Conceded per match tiles), `:103` (Form), `frontend/src/pages/profile/ProfileOverviewTab.tsx:40` (rival card "ppm"), `:149` (teammate card "ppm")
  - inline `.toFixed(2)` (8): `frontend/src/pages/stats/PlayerProfile.tsx:127`, `:128`, `:129` (the same three tiles as the profile, hand-formatted), `frontend/src/pages/stats/H2HView.tsx:67` (rival card), `:139` (matrix PPM cell), `frontend/src/pages/stats/HeadToHeadRows.tsx:97`, `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:44`, `frontend/src/pages/stats/StarsView.tsx:123`
  - `fmtOdd` (2 lines × 3 numbers): `frontend/src/ui/primitives/MatchOverviewPanel.tsx:91`, `frontend/src/pages/live/MatchList.tsx:23` — "1 2.10 · X 3.40 · 2 2.80"
- **B — one place, trailing ".0" trimmed** · 3
  - `frontend/src/ui/clubControls.tsx:16`, `:19` (`starsLabel`: "4.5", "4") — Clubs page, club picker, star history "4.5★"
  - `frontend/src/ui/layout/DiagnosticsSettings.tsx:45` — "3 times over 2.4s"
- **C — integer** · Elo `fmtRating` (`frontend/src/pages/stats/standings.ts:103`, `frontend/src/pages/profile/ProfileStatsSection.tsx:102`, `frontend/src/pages/stats/PlayerProfile.tsx:113`), rivalry score `Math.round` (`frontend/src/pages/stats/H2HView.tsx:140`, `:605`), every percentage (below)
- Thousands separators: 0 places (no `toLocaleString` on a number anywhere; Elo prints `1523`).

---

## Percentages — 2 rendering variants, 3 labels

**What varies:** the "%" sign is present in six places and absent in one; the label is spelled three ways.

- **A — integer + "%"** · 6
  - `frontend/src/pages/stats/standings.ts:96` — stats table "Win%" column
  - `frontend/src/pages/profile/ProfileStatsSection.tsx:92` — profile "Win rate" tile
  - `frontend/src/pages/stats/PlayerProfile.tsx:126` — Stats › Player "Win rate" tile
  - `frontend/src/pages/stats/h2h/MatchupView.tsx:164`, `:212` — matchup "Win %" tile
  - `frontend/src/pages/stats/h2hHelpers.ts:16-18` (`pct`) at `frontend/src/pages/stats/HeadToHeadRows.tsx:92` ("62% win") and `:135` ("62% close")
- **B — integer, no sign** · 1
  - `frontend/src/pages/stats/H2HView.tsx:141` — H2H matrix cell when the metric chip "Win %" is selected prints "62"
- Rounding: 7 of 7 round to a whole number.
- Labels: **"Win rate"** 2 (`ProfileStatsSection.tsx:92`, `PlayerProfile.tsx:126`) · **"Win %"** 5 (`MatchupView.tsx:212`, `H2HView.tsx:408` chip, `frontend/src/pages/stats/trends/TrendsExplorer.tsx:26`, radar axes `ProfileStatsSection.tsx:58`, `PlayerProfile.tsx:52`) · **"Win%"** 2 (`standings.ts:96` column, `:112` chip)

---

## Signed numbers — 3 zero-handling variants

**What varies:** goal difference is always signed, including "+0"; two other deltas drop the sign at zero.

- **A — always signed, zero is "+0"** · 7 code paths
  - `frontend/src/ui/primitives/RecordLine.tsx:136` — "GD +8" on every record line (live standings, results, H2H rival/rivalry rows, profile rivals and teammates, duo rows, stars ladder)
  - `frontend/src/pages/stats/standings.ts:101` (GD column), `:102` (GD/M "+1.33")
  - `frontend/src/pages/profile/ProfileStatsSection.tsx:96` — profile "Goal diff" tile
  - `frontend/src/pages/stats/PlayerProfile.tsx:130` — Stats › Player "Goal diff" tile
  - `frontend/src/pages/stats/H2HView.tsx:137` — matrix "Goal diff" cell
  - `frontend/src/pages/live/OverviewSection.tsx:32-33` — winner line "6 matches · GD +8" (`:158`) and the mini standings table (`:249`)
- **B — signed when positive, blank at zero** · 1
  - `frontend/src/pages/live/WhatIfSection.tsx:311` — projected table's gained-points column ("+6" or nothing)
- **C — signed when positive, unsigned zero** · 1
  - `frontend/src/ui/layout/DiagnosticsSettings.tsx:37-38` — crumb deltas "+0.25s" / "0.00s"

---

## Scoreline written in prose — 3 separators

**What varies:** the glyph between two goal counts when the score is text rather than the `ScoreLine` primitive (which draws a hairline and prints "–" for an unplayed match, `frontend/src/ui/primitives/ScoreLine.tsx:293-294`).

- **A — colon "14:6"** · 3
  - `frontend/src/ui/primitives/RecordLine.tsx:196-200` — every record line
  - `frontend/src/pages/stats/h2h/MatchupView.tsx:210` — matchup "Goals" tile
  - `frontend/src/pages/live/CurrentGameSection.tsx:421` — "Finish this match at 3:1?" dialog title
- **B — en dash "3–1"** · 2
  - `frontend/src/pages/live/CurrentGameSection.tsx:413` — "Roli 3–1 Berni is wiped." (the Reset dialog on the same match as A's Finish dialog)
  - `frontend/src/pages/tools/FriendlyList.tsx:154` — friendlies row aria-label
- **C — hyphen "2-1"** · 2
  - `frontend/src/pages/live/comments/CommentComposer.tsx:167` — goal comment: "makes it 2-1"
  - `frontend/src/pages/live/LiveTournamentPage.tsx:305` — decider summary "Penalties: Roli 5-4 Berni"

---

## "a out of b" — 3 idioms

- **A — "#3/8"** (`fmtRank`, `utils/format.ts:131-133`) · 3: `frontend/src/pages/profile/ProfileOverviewTab.tsx:197`, `frontend/src/pages/profile/MatchHistorySection.tsx:39` (position pill on a profile's match groups), `frontend/src/pages/stats/PositionsView.tsx:419` (grid tooltip)
- **B — "5 / 12"** with spaces · 1: `frontend/src/pages/stats/PlayerStreakChips.tsx:61-62` (current / record streak chips, profile Stats tab and Stats › Player; label "Streaks · current / record" at `ProfileStatsSection.tsx:123`, `PlayerProfile.tsx:162`)
- **C — "3 of 10"** in words · 2: `frontend/src/pages/stats/StarsView.tsx:76` ("across 3 of 10 ratings"), `frontend/src/ui/SelectClubsPanel.tsx:295` ("12 of 597 clubs")

---

## Per-match average label — 4 spellings

**What varies:** the same quantity (points, goals or conceded per match) is labelled four ways.

- **A — "Pts / match", "Goals / match", "Conceded / match"** (tile labels) · 7: `frontend/src/pages/profile/ProfileStatsSection.tsx:93-95`, `frontend/src/pages/stats/PlayerProfile.tsx:127-129`, `frontend/src/pages/stats/h2h/MatchupView.tsx:211`
- **B — "PPM", "G/M", "GA/M", "GD/M"** (column headers and chips) · 7: `frontend/src/pages/stats/standings.ts:91`, `:99`, `:100`, `:102`, `:109`, `:114` ("GF-GA-GD /m" chip), `frontend/src/pages/stats/H2HView.tsx:408` (matrix chip "PPM")
- **C — "ppm" as a lowercase unit after the number** · 6: `frontend/src/pages/live/MatchH2HPanel.tsx:59`, `frontend/src/pages/stats/H2HView.tsx:67`, `frontend/src/pages/stats/HeadToHeadRows.tsx:97`, `frontend/src/pages/profile/ProfileOverviewTab.tsx:40`, `:149`, `frontend/src/pages/stats/StarsView.tsx:128`
- **D — bare number, no unit** · 1: `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:44` (duo leaderboard right column, accent-coloured "2.10")

---

## Played-count unit — 4 variants

- **A — "P" glued to the number ("3P")** · 7: `frontend/src/ui/primitives/RecordLine.tsx:152` default, used at `frontend/src/pages/live/StandingsTable.tsx:366`, `frontend/src/pages/stats/h2h/DuoDetail.tsx:49`, `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:34`, `frontend/src/pages/stats/StarsView.tsx:102`; column/chip "P" `frontend/src/pages/stats/standings.ts:92`, `:110`; mini-table header `frontend/src/pages/live/OverviewSection.tsx:234`
- **B — "matches"** · 6: `frontend/src/pages/live/MatchH2HPanel.tsx:58`, `frontend/src/pages/stats/H2HView.tsx:600` (as `playedLabel`), and `fmtCount` at `frontend/src/pages/tools/FriendlyList.tsx:201`, `frontend/src/pages/live/MatchList.tsx:69`, `frontend/src/pages/stats/MatchHistoryList.tsx:200`, `frontend/src/pages/live/OverviewSection.tsx:158`
- **C — "games"** · 2: `frontend/src/pages/stats/HeadToHeadRows.tsx:91`, `:155` (duo leaderboard row and team rivalry row)
- **D — "Played"** · 5: tiles `frontend/src/pages/profile/ProfileStatsSection.tsx:91`, `frontend/src/pages/stats/PlayerProfile.tsx:125`, `frontend/src/pages/stats/h2h/MatchupView.tsx:202`; chips `frontend/src/pages/stats/H2HView.tsx:408`, `:585`
- "MP": 0 places.

---

## Points label — 3 variants

- **A — "Pts"** · 3: `frontend/src/pages/stats/standings.ts:90`, `:108` (column, chip), `frontend/src/pages/live/OverviewSection.tsx:236` (mini-table header)
- **B — "pts"** · 4: `frontend/src/pages/live/StandingsTable.tsx:374`, `frontend/src/pages/live/OverviewSection.tsx:163` (winner tile, same tab as A's header), `frontend/src/pages/live/WhatIfSection.tsx:316`, `frontend/src/pages/stats/PlayerProfile.tsx:113` ("12 pts")
- **C — "Points"** · 1: `frontend/src/pages/stats/trends/TrendsExplorer.tsx:22` (metric chip)

---

## Goal-difference label — 3 variants (+ 1 unlabelled)

- **A — "GD"** · 4 paths: `frontend/src/ui/primitives/RecordLine.tsx:153` default (every record line), `frontend/src/pages/stats/standings.ts:101`, `frontend/src/pages/live/OverviewSection.tsx:235`, `:158`
- **B — "Goal diff"** · 4: `frontend/src/pages/profile/ProfileStatsSection.tsx:96`, `frontend/src/pages/stats/PlayerProfile.tsx:130`, `frontend/src/pages/stats/H2HView.tsx:408`, `frontend/src/pages/stats/trends/TrendsExplorer.tsx:25`
- **C — "GD/M"** · 1: `frontend/src/pages/stats/standings.ts:102`
- **D — no label, bare signed number** · 1: `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:40` (`gdLabel=""`)

---

## W-D-L — 1 variant (consistent)

Order W-D-L with hyphens in 6 of 6 places: `frontend/src/ui/primitives/RecordLine.tsx:180-190`, `frontend/src/pages/stats/h2h/MatchupView.tsx:203-208`, `frontend/src/pages/profile/ProfileStatsSection.tsx:100` ("Record 3-0-0"), `frontend/src/pages/stats/PlayerProfile.tsx:113`, `frontend/src/pages/stats/H2HView.tsx:138` (matrix cell), `:470` (aria). Label "W-D-L" 3 of 3 (`standings.ts:111`, `MatchupView.tsx:203`, `H2HView.tsx:408`). Win/draw/loss colouring on 4 of the 6 (the matrix cell and its aria are plain).

---

## Elo — 3 presentations

- **A — labelled "Elo"** · 4: `frontend/src/pages/stats/standings.ts:103`, `:115`, `frontend/src/pages/profile/ProfileStatsSection.tsx:102` ("Elo 1523 · #2"), `frontend/src/pages/stats/trends/TrendsExplorer.tsx:27`
- **B — labelled "Rating"** · 1: `frontend/src/pages/stats/trends/TrendsExplorer.tsx:193` (view toggle "Rating | Δ per event" for the Elo metric)
- **C — number + "★"** · 1: `frontend/src/pages/stats/PlayerProfile.tsx:113` ("1523★ · 3-0-0 · 12 pts") — the same glyph that means club star rating at `frontend/src/ui/ClubStarHistory.tsx:64` ("4.5★")

---

## "×" and "+N more" — 3 uses of the multiplication sign

- **A — prefix "×3" = tournaments held** · 4: `frontend/src/pages/stats/cupParts.tsx:28` (ReignChip; dashboard cups and cup detail), `frontend/src/pages/stats/CupDetail.tsx:122`, `:138`, `:280`
- **B — prefix "×3" = players tied at the top** · 1: `frontend/src/pages/stats/RecordsView.tsx:58` (`TieCount`, section-header accessory at `:71`, `:120`)
- **C — suffix "3× 1v1" = count of a mode** · 1: `frontend/src/pages/stats/PositionsView.tsx:286`
- "+N more" · 3: `frontend/src/pages/stats/RecordsView.tsx:64`, `frontend/src/pages/stats/StreaksView.tsx:69`, `:85`

---

## Pluralisation — 3 variants

**What varies:** a shared helper, hand-rolled ternaries, and strings that never pluralise.

- **A — `fmtCount(n, "match", "matches")`** (`utils/format.ts:64-66`) · 4: `frontend/src/pages/tools/FriendlyList.tsx:201`, `frontend/src/pages/live/MatchList.tsx:69`, `frontend/src/pages/stats/MatchHistoryList.tsx:200`, `frontend/src/pages/live/OverviewSection.tsx:158`
- **B — hand-rolled ternary** · 13: `frontend/src/ui/ClubPicker.tsx:268` (`club${…"s"}`), `frontend/src/pages/stats/PositionsView.tsx:283` (`tournament${…"s"}`), `frontend/src/pages/stats/StarsView.tsx:76` (`match${…"es"}`), `frontend/src/pages/live/LiveTournamentPage.tsx:404-420` ("1 match loses…" / "N matches lose…"), `:854` (match/matches + it/them), `:874` ("match is"/"matches are"), `frontend/src/pages/live/WhatIfSection.tsx:161`, `frontend/src/pages/live/TournamentCommentParts.tsx:193` and `frontend/src/pages/profile/GuestbookEntryCard.tsx:135` ("repl" + "y"/"ies"), `frontend/src/ui/layout/DiagnosticsSettings.tsx:248` (event/events), `frontend/src/pages/profile/GuestbookSection.tsx:184-186` and `frontend/src/pages/ideas/IdeasPage.tsx:377-379` ("The one vote…" / "All N votes…")
- **C — never pluralised (can print "1 tournaments")** · 5: `frontend/src/pages/stats/cupParts.tsx:135` (timeline tooltip `${n} tournaments`), `:146` (aria), `:27` (ReignChip tooltip `${n} tournaments held`), `frontend/src/pages/stats/h2h/MatchupView.tsx:203` (tile tooltip "1 wins, 0 draws, 2 losses"), `frontend/src/ui/SelectClubsPanel.tsx:295` ("1 of 1 clubs")
- Guarded by a minimum above 1, so never wrong: `frontend/src/pages/stats/StatsTable.tsx:117` ("last N tournaments", min 2), `frontend/src/pages/stats/trends/TrendsExplorer.tsx:211-212` (min 2), `frontend/src/ui/layout/DiagnosticsSettings.tsx:44` ("N times", count > 1), `frontend/src/pages/stats/CupDetail.tsx:143` ("N reigns tied", tied > 1)

---

## Zero handling — 4 variants for "nothing to show"

- **A — em dash "—"** · 73 string occurrences in 30 files; for a stat with 0 played: `frontend/src/pages/stats/standings.ts:91`, `:96`, `:99`, `:100`, `:102`; `frontend/src/pages/profile/ProfileStatsSection.tsx:92-95`, `:102`, `:103`; `frontend/src/pages/stats/PlayerProfile.tsx:126-129`; `frontend/src/pages/stats/h2h/MatchupView.tsx:211`, `:212`, `:218`; `frontend/src/pages/stats/CupDetail.tsx:138`, `:150`, `:155`; `frontend/src/pages/stats/cupParts.tsx:60`
- **B — words instead of a number** · 1: `frontend/src/pages/stats/StarsView.tsx:100`, `:120` — an unplayed star rung prints "no matches" and "—", never "0"
- **C — literal zero** · 3: `frontend/src/pages/stats/PlayerStreakChips.tsx:61-62` ("0 / 0"), `frontend/src/pages/ideas/IdeaCard.tsx:281` and `frontend/src/ui/primitives/VoteButton.tsx:41` (vote count "0"), `fmtCount` ("0 matches", `MatchList.tsx:69`)
- **D — element hidden** · 2: `frontend/src/pages/TournamentsPage.tsx:187` (unread pill only when > 0), `frontend/src/pages/stats/cupParts.tsx:61` ("· N defended" only when > 0)
- Other placeholders in user-facing text: "n/a" ×3 and "?" ×4 in `frontend/src/ui/layout/ViewportReadout.tsx:146-160`; "#<id>" for an unnamed player `frontend/src/pages/live/LiveTournamentPage.tsx:298`, `:302`; "?" in `fmtRank` when the total is unknown (`utils/format.ts:133`).

---

## Capitalisation — headings: 1 variant (consistent); titles, tabs and buttons: 2 variants

- **Section labels** (`section-label`): 29 of 29 sentence case (`frontend/src/pages/live/OverviewSection.tsx:181` "Current match", `:259` "Next matches", `frontend/src/pages/profile/ProfileOverviewTab.tsx:137` "Favorite teammates", `frontend/src/pages/profile/ProfileStatsSection.tsx:123` "Streaks · current / record", `frontend/src/pages/ideas/IdeaFields.tsx:162` "Where?", …). `StatsSection label=`: 15 of 15 sentence case.
- **Page and card titles, multiword** — Title Case 1 vs sentence case 4:
  - Title Case: `frontend/src/pages/LoginPage.tsx:47` "Player Login"
  - Sentence case: `frontend/src/pages/NotFoundPage.tsx:21` "Not found", `frontend/src/pages/SettingsPage.tsx:161` "View as", `:209` "Keyboard and viewport", `:214` "Crash log"
- **Tab / chip / segment labels, multiword** — Title Case 1 vs sentence case 15:
  - Title Case: `frontend/src/pages/FriendliesPage.tsx:14` "All Friendlies"
  - Sentence case: "All tournaments", "All time", "Edit result", "Per event", "Δ per event" (`frontend/src/pages/stats/trends/TrendsExplorer.tsx:193`, `:196`), "Last N", "What if", "Results & personal", "General (tournament)" (`frontend/src/pages/live/TournamentCommentsCard.tsx:773`), "Win streak", "Unbeaten streak", "Scoring streak", "Clean sheet streak" (`frontend/src/pages/stats/PlayerStreakChips.tsx:11-14`), "Goal diff", "Live now"
- **Button labels, multiword** — Title Case 5 vs sentence case ≈45:
  - Title Case: `frontend/src/pages/tournaments/NewTournamentForm.tsx:119` "Create Tournament", `frontend/src/pages/live/OverviewSection.tsx:225` "Open Standings" / "Open Results", `:299` "Open Matches", `frontend/src/pages/live/CurrentGameSection.tsx:271` "Swap Home/Away"
  - Sentence case (sample of the ≈45 extracted): "Save result", "Save friendly match", "Delete tournament", "Finish match", "Reset match", "Swap sides" (`frontend/src/pages/live/MatchDetailPage.tsx:482`), "Re-assign schedule", "Send test", "Enable on this device", "Post idea", "Set status", "Save decider", "Save date", "Save name", "Set last match to playing", "Remove decider / keep draw", "Reset to best case", "Reset zoom", "Upload header image", "Edit header image", "Edit avatar", "Cancel edit", "Edit message", "Hide replies", "Copy all", "Clear log", "Delete club/idea/comment/message/friendly", "Show all", "Show less", "Read all", "Use image", "Choose photo"
- **Native tooltips (`title=`)**, ≈45 literals: sentence case throughout, 0 end with a full stop (e.g. `frontend/src/pages/dashboard/StandingsPreviewCard.tsx:27` "Open the full table in Stats", `frontend/src/pages/stats/PlayerProfile.tsx:117` "Recent form — points per match in the last games"). 3 are German (below).

---

## Empty-state sentences — 2 variants (full stop / none), 2 phrasings

- **A — ends with a full stop** · 31 EmptyState titles + ≈10 inline (`frontend/src/pages/stats/StatsTable.tsx:156` "No players yet.", `frontend/src/pages/live/comments/CommentList.tsx:264` "No comments yet. Be the first to add one.", `frontend/src/pages/stats/h2h/MatchupView.tsx:262-264` "No matches between A and B yet (1v1 · Tournaments).", `frontend/src/pages/dashboard/CupsPreviewCard.tsx:108`, `frontend/src/pages/profile/ProfileOverviewTab.tsx:170`, `frontend/src/ui/ClubStarHistory.tsx:56`, …)
- **B — no full stop** · 4: `frontend/src/ui/ClubPicker.tsx:387` "No clubs found", `frontend/src/pages/live/WhatIfSection.tsx:210` "Nothing to project" (its hint has one), `frontend/src/pages/stats/cupParts.tsx:92` "No owner yet", `frontend/src/ui/layout/DiagnosticsSettings.tsx:234` "Nothing recorded"
- **Phrasing:** "No <thing> yet." ≈22 vs the shorthand "None yet." 3 (`frontend/src/pages/stats/RecordsView.tsx:100`, `:150`, `frontend/src/pages/stats/StreaksView.tsx:68`) — the shorthand appears only under Records/Streaks section headers.
- `frontend/src/pages/TournamentsPage.tsx:130-141` is the one list empty state not using `EmptyState` (a plain div: "No tournaments yet. Create one.").

---

## Ellipsis — 2 variants

- **A — "…" (one character)** · 68 (every "Saving…", "Loading…", "Posting…", "Deleting…", …)
- **B — "..." (three dots)** · 2: `frontend/src/pages/LoginPage.tsx:76` "Logging in...", `frontend/src/ui/layout/DiagnosticsSettings.tsx:243` "Clearing..."

## Login wording — 2 variants

- **"Login" / "Logout" as one word** · 4: `frontend/src/pages/LoginPage.tsx:76`, `frontend/src/pages/SettingsPage.tsx:147`, `:153`, `frontend/src/pages/tools/FriendlyMatchCard.tsx:389` ("Login as editor/admin to store friendlies for stats.")
- **"Log in" as two words** · 1: `frontend/src/pages/ideas/IdeaCard.tsx:279` ("Log in to vote")

## Language — English UI with 12 German strings in 5 files

- `frontend/src/pages/profile/ProfileHeader.tsx:307` "Anpöbeln" (tooltip), `:320` "Anpöbeln…", `:322` "Gesendet", `:323` "Anpöbeln" (the poke button's three states), `:220` "Mark all anpöbel notifications as read"
- `frontend/src/pages/PlayersAdminPage.tsx:207`, `:208` "Unread anpöbel notifications"
- `frontend/src/pages/ProfilePage.tsx:280` "Could not anpöbeln" (error toast title)
- `frontend/src/pages/stats/PositionsView.tsx:378` "· kein eindeutiger Sieger", `:396` and `:397` "Kein eindeutiger Sieger" (tooltip + aria on a tied-top tile)
- `frontend/src/pages/live/LiveTournamentPage.tsx:308` "Schere-Stein-Papier Turnier" (decider summary), while its siblings are "Match" and "Penalties"
- ("Steirisch" at `frontend/src/push/usePushNotifications.ts:28` is a language name and is excluded.)

## Mode and status tokens — consistent

- "1v1" / "2v2" lowercase in 6 of 6 rendering places (`frontend/src/pages/TournamentsPage.tsx:164`, `frontend/src/pages/live/TournamentMetaPills.tsx:25`, `frontend/src/pages/stats/MatchHistoryList.tsx:194`, `frontend/src/pages/stats/StatsFilterPill.tsx:23-24`, `frontend/src/pages/stats/PositionsView.tsx:286`, `frontend/src/pages/tools/FriendlyMatchCard.tsx:448`); the API's "overall" is shown as "All" (`StatsFilterPill.tsx:22`).
- Tournament status words "Live" / "Draft" / "Done" from one function (`frontend/src/ui/theme.ts:38-48`).

---

## Fresh-eye observations

Things that would look arbitrary or wrong to someone opening the app for the first time, even where the code is consistent about them.

1. **The app never picks a locale.** All five date helpers and both inline formatters pass `undefined`, so the *same* screen reads `12.9.2026` on an Austrian phone, `12/09/2026` on a British one and `9/12/2026` on an American one. The test suite pins an en-GB shape (`frontend/src/test/cupsPreview.test.tsx:114` expects "23/04/2026"), which is not what a German-locale phone shows.
2. **On a German-locale phone the date-only form is unpadded and the date-time form is padded** (`12.9.2026` on a tournament pill, `12.09.2026, 14:30` on a comment) because `fmtDate` passes no options and `fmtDateTime` asks for `2-digit`. Two column widths for the same day.
3. **A reader can meet eight date/time shapes in one session**: `12.9.2026` (tournaments), `12.09.2026, 14:30` (comments), `12. Sep. 26` (streaks/records), `12. September 2026` (friendlies headings), `September 2026` (tournaments headings), `Sep` (chart), `2d ago` (bell), `14:30:45` (friendlies "Saved"), plus `2026-09-12 14:30:45` in Diagnostics.
4. **The 2-digit year in Records/Streaks has no apostrophe** (`12 Sept 26`, `12. Sep. 26`), so "26" reads like a day number; the helper's own comment promises `'26`. It sits one sub-view away from Cups, which prints four-digit years.
5. **Seconds appear exactly once in the product UI** ("Saved 14:30:45." on the friendlies form) and nowhere a reader would compare against; and in en-US locales that line is the only 12-hour clock with seconds.
6. **The bell says "2d ago"; tapping the entry lands on "12.09.2026, 14:30".** The relative form exists in one popover only.
7. **`fmtPct` never formats a percentage.** All six callers are per-match averages; every real percentage is computed inline (`Math.round(x*100)%`) in four files, and the percentage helper is called `pct` in `h2hHelpers.ts`. Not visible to a reader, but it is why the same "x.xx" reaches the screen by four different routes.
8. **"P" means "played" next to a number that means "points".** A standings row reads `3P 3-0-0 14:6 GD +8` under a big `9 pts`; "P" is one letter away from the unit the eye just read.
9. **"×3" points in two directions and has two meanings**: "×3" on a cup reign = 3 tournaments held; "×3" on a Records header = 3 players tied; "3× 1v1" on Positions = a count of a mode.
10. **The Elo number wears a ★ on Stats › Player only** (`1523★`), the glyph that means club star rating on every other screen (`4.5★`).
11. **The Reset and Finish dialogs on the same match write the score two ways**: "Roli 3–1 Berni is wiped." and "Finish this match at 3:1?".
12. **Four words for "still running"** — a streak chip says "live", a streak with no date says "ongoing", a reign row says "current", a club-star row and a reign span say "now".
13. **The H2H matrix's "Win %" metric prints the number without the sign** while every other win-rate in the app carries "%".
14. **The odds line uses bookmaker notation without a key** — "1 2.10 · X 3.40 · 2 2.80" on the live match panel and every compact match row.
15. **German surfaces in six places of an English UI** — "Anpöbeln"/"Gesendet" on the profile poke button, "anpöbel notifications" on the players admin page, "Kein eindeutiger Sieger" on Positions, "Schere-Stein-Papier Turnier" as a decider name next to "Match" and "Penalties".
16. **"#" is a rank in three shapes** — "#3/8" (position pill), "· #2" (Elo rank on a profile), "#" (mini-table column header) — and also an id fallback ("#17") for an unnamed player in the decider summary.
17. **Profile and Stats › Player show the same six tiles with the same labels, formatted by different code** (`fmtPct`/`fmtInt` on the profile, inline `toFixed(2)`/template strings on Stats). They agree today; nothing keeps them agreeing.
