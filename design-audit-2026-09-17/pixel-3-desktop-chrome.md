# Desktop width and the app chrome — what the pixels say

Method: every number below was measured with PIL on the PNGs (Set A at 1280 CSS px, scale 1;
Set B at 390×844 CSS px, scale 2 — Set B numbers are given in CSS px, i.e. image px ÷ 2).
Page ground is rgb(11,17,30); "content" means any pixel that is not that colour.
Component names in brackets come from file names under `frontend/src` only.

## Desktop (1280px)

### The persistent sidebar — 1 variant
**What varies:** nothing but the highlighted item.
- **A — 240px sidebar, identical on every page** · seen on 17 pages: 1px border at x=239, logo at (16,16),
  nav pills x 10–229, bell button + Settings + Collapse pinned at the bottom (y 774–890). A pixel diff
  of the sidebar against `blue-d-dashboard.png` shows differences only inside the nav list (the moved
  highlight) on all 16 other pages. [`ui/shell/Sidebar.tsx`]
  - all 17 `blue-d-*.png`

### Where the content column starts and ends — 2 variants
**What varies:** one page centres a narrower card; the other sixteen fill a fixed 992px column.
- **A — full column x 264–1255 (992px), 24px to the viewport edge** · seen on 16 pages
  - `blue-d-dashboard.png`, `blue-d-tournaments.png`, `blue-d-friendlies.png`, `blue-d-clubs.png`,
    `blue-d-ideas.png`, `blue-d-players.png`, `blue-d-profile-overview.png`, `blue-d-profile-matches.png`,
    `blue-d-stats-table.png`, `blue-d-stats-positions.png`, `blue-d-stats-player.png`,
    `blue-d-stats-matchup.png`, `blue-d-live-overview.png`, `blue-d-live-matches.png`,
    `blue-d-match-detail.png`, `blue-d-done-tournament.png`
- **B — a 672px card centred in the column (x 424–1095, 160px dead on each side)** · seen on 1 page
  - `blue-d-settings.png` — (Settings → Account)

Title row: the h1 starts at x=264 on the 10 pages without a back chevron and at x=304 on the 7 pages
with one (chevron at 276). Tab strips: first glyph at x=276/277, 2px orange underline at y 114–115,
hairline at y=116 on 14 of 15 tabbed pages; on the two profile pages the strip sits at y 829–851
because the header block precedes it.

### How the 992px are used inside the column — 3 variants
**What varies:** whether the page's main object stretches, centres as a narrow island, or splits to the two edges.
- **A — the object stretches to the column** (tables, tiles, cards, filter rows, list rows) · seen on 9 pages
  - `blue-d-dashboard.png` (live card, two cup panels side by side, chart, 6-col table),
    `blue-d-stats-table.png` (6-col table), `blue-d-stats-player.png` (3-up tiles, full-width ladder),
    `blue-d-stats-matchup.png` (3-up tiles), `blue-d-ideas.png` (cards), `blue-d-clubs.png` (filter row),
    `blue-d-match-detail.png` (2-up cards, a 944px-wide blue button), `blue-d-settings.png` (inside its card),
    `blue-d-live-overview.png` (cards)
- **B — a narrow island centred at x≈760 with ≈400px of empty row on either side** · seen on 9 pages
  - `blue-d-friendlies.png` — every row is a ~150px score line ("Roli 9 | 1 Flo") centred; nothing else in the row
  - `blue-d-profile-overview.png`, `blue-d-profile-matches.png` — Recent/all matches, same rows
  - `blue-d-stats-matchup.png`, `blue-d-stats-player.png` — match history, same rows
  - `blue-d-live-matches.png` — Details view, teams+odds+clubs stacked in a ~250px column in the middle
  - `blue-d-done-tournament.png` — Played matches card
  - `blue-d-stats-positions.png` — a 440px grid (x 540–979) centred while its heading, description and
    the "ⓘ" stay at the column edges (264 / 1246); 276px empty each side of the grid
  - `blue-d-stats-player.png` — the radar chart (~230px) centred under a full-width eyebrow
- **C — text at the left edge, one control at the far right, nothing between** · seen on 5 pages
  - `blue-d-tournaments.png` — title at 280, crown badge at 1096–1109: ~800px gap on every row
  - `blue-d-players.png` — name at 316, edit button at 1210–1255
  - `blue-d-clubs.png` — group "5★" at 276, count at 1215 and caret at 1240
  - `blue-d-live-overview.png`, `blue-d-done-tournament.png` — compact standings card: "PLAYER" at 301,
    "P" at 1169, "GD" 1194, "PTS" 1221: an 820px void between the names and their numbers

### The six-column standings table — 2 variants
**What varies:** the same columns sit at different x on the two pages that show the table.
- **A — dashboard** · 1 page: header Pts 691–715 · PPM 828–851 · P 946–951 · Win% 1064–1093 · Elo 1231–1246;
  first data row Pts 691 · PPM 825 · P 937 · Win% 1067 · Elo 1214–1246 [`pages/dashboard/StandingsPreviewCard.tsx`]
  - `blue-d-dashboard.png`
- **B — stats overview** · 1 page: header Pts 682–707 · PPM 818–841 · P 934–939 · Win% 1049–1079 · Elo 1207–1222
  (+ an info icon to 1246); data row Pts 682 · PPM 815 · P 925 · Win% 1053 · Elo 1214–1246 [`pages/stats/StarsView.tsx`]
  - `blue-d-stats-table.png`
  The player column (269–350) and the Elo values (1214–1246) coincide; the four middle columns are 9–14px
  further left on B. Both tables are the same 992px wide with the same six players.

### Where the score line sits in a match row — 2 variants
**What varies:** the centre of the "a | b" pair.
- **A — centred on the column, x≈760** · seen on 9 pages: `blue-d-friendlies.png` (digits 741–749 / 772–776),
  `blue-d-live-matches.png` (737–749 / 770–782), `blue-d-stats-matchup.png`, `blue-d-stats-player.png`,
  `blue-d-profile-matches.png`, `blue-d-profile-overview.png`, `blue-d-dashboard.png` (live card),
  `blue-d-live-overview.png` (Current match card), `blue-d-match-detail.png` (Recent matches)
- **B — shifted 16px right, x≈776** · seen on 2 pages, both cards that put a "#n" label in the left gutter:
  - `blue-d-done-tournament.png` — Played matches: digits 756–765 / 786–795
  - `blue-d-live-overview.png` — Next matches: "vs" at 769–782
  Note `blue-d-live-matches.png` also labels rows "#1 playing" yet keeps A — its label is on the line above.

### "Pick one of N" controls — 2 visual styles, and one control that uses both
**What varies:** whether the options sit in a dark rounded container or lie loose on the page.
- **A — boxed group (container + orange-bordered active pill, 32px tall)** · seen on 4 pages
  - `blue-d-dashboard.png` — "⚡ Last 3 | Total" (with icons)
  - `blue-d-clubs.png` — "Stars | League" (with icons)
  - `blue-d-ideas.png` — "Most wanted | Newest" (no icons)
  - `blue-d-live-matches.png` — "Compact | Details" (with icons), at the right of the "5 MATCHES" line, active pill 84×32
- **B — loose pills on the page ground** · seen on 4 pages
  - `blue-d-stats-table.png` (+ `stats-positions`) — "Table Positions Streaks Records Cups" and the COLUMNS row (32px)
  - `blue-d-stats-matchup.png` — "Against | Together" (33px) and "Compact | Details" (88×34) on its own line
    *below* "MATCHES · 10", left-aligned, no icons [`pages/stats/h2h/MatchupView.tsx`]
  - `blue-d-stats-player.png` — "Compact | Details" (88×34) at the *right* of the "MATCH HISTORY" line, no icons
    [`pages/stats/PlayerProfile.tsx`]
  - `blue-d-ideas.png` — the AREA chips (34px) on the same row as the boxed sort group
  The one toggle that appears three times — Compact/Details — has three looks: boxed+icons+right
  (`live-matches`, [`pages/live/MatchList.tsx`]), loose+left+below (`stats-matchup`), loose+right+inline (`stats-player`).
  Active-pill heights: 32px on 6 controls, 33–34px on 4. Both a `SegmentedSwitch.tsx` and a `Chip.tsx` exist in `ui/primitives/`.

### The action that belongs to a section header — 4 variants
**What varies:** what a "go to the full thing" affordance looks like and where it sits.
- **A — filled grey button with "→", in the header line at the right** · 2 pages: "Open Standings →"
  (`blue-d-live-overview.png`), "Open Results →" and "Open Matches →" (`blue-d-done-tournament.png`) [`pages/live/OverviewSection.tsx`]
- **B — orange text link with "→", in the header line at the right** · 1 page: "View all →" (`blue-d-profile-overview.png`)
  [`pages/profile/ProfileOverviewTab.tsx`]
- **C — muted text link with "›", *under* the block at the right** · 1 page: "Full table ›" (`blue-d-dashboard.png`)
  [`pages/dashboard/StandingsPreviewCard.tsx`]
- **D — the caps label itself carries a "›"** · 1 page: "BAUERNKRANZ ›", "LORBEERKRANZ ›", "TRENDS ›", "STANDINGS ›",
  and "LIVE NOW ——— test 2v2 very long tournament name ›" where the *name* at the right is the link (`blue-d-dashboard.png`).
  The dashboard uses C and D on the same page, 300px apart.

### Section heading style — 2 variants
**What varies:** caps eyebrow with a hairline vs. bold sentence-case inside a card.
- **A — caps eyebrow + rule to the right edge** · 10 pages: `dashboard`, `tournaments` (month), `friendlies` (date + "n matches"),
  `profile-overview`, `stats-positions`, `stats-player`, `stats-matchup`, `live-overview`, `live-matches` ("5 MATCHES", with an icon,
  the only eyebrow that has one), `done-tournament`
- **B — bold sentence-case card title** · 3 pages: `match-detail` ("Exact matchup", "Team A together", "Recent matches"),
  `settings` ("Account", "View as"), `ideas` ("Ideas 3" card head)
  `blue-d-stats-player.png` mixes the two: "Compare with" is a plain sentence-case label sitting between two eyebrows.

### Tab strips — 2 variants
**What varies:** icons.
- **A — icon + label** · 13 pages: tournaments, friendlies, clubs, players, settings, stats (×4), live (×2), done, profile (×2)
- **B — label only** · 2 pages: `blue-d-ideas.png` (Open/Closed/All), `blue-d-match-detail.png` (Head-to-Head/Comments/Edit result)

### Records and dates — 2 typefaces each
**What varies:** the same W-D-L record and the same date appear in monospace on some pages and in the body sans on others.
- **W-D-L in mono** · 2 pages: `blue-d-match-detail.png` ("1 matches 0-0-1 1:6 0.00 ppm", three tiles),
  `blue-d-stats-player.png` (ladder "10P 7-1-2")
- **W-D-L in sans** · 3 pages: `blue-d-profile-overview.png` ("4-0-1 2.40 ppm"), `blue-d-stats-matchup.png` ("3-1-6" tile),
  `blue-d-stats-player.png` (identity line "31-12-20")
- **Date as a mono pill (with a tiny cup icon on its corner)** · 5 pages: profile-overview, profile-matches, stats-matchup,
  stats-player, and next to the title on live-overview/live-matches/done-tournament
- **Date as plain sans** · 3 pages: `blue-d-tournaments.png` ("11/09/2026 · 1v1"), `blue-d-dashboard.png` ("Holding since 11/09/2026"),
  `blue-d-ideas.png` ("17/09/2026, 06:23")

### What changes between the two widths (Set A vs Set B where both exist)
- Reflows: dashboard cups (stacked → 2-up), stat tiles (2-up × 3 rows → 3-up × 2 rows, `stats-player`), clubs filter
  (4 stacked rows → one row), ideas AREA chips + sort (two wrapped rows → one row), tab strips (scrollable → all fit).
- Just gets wider: every score-line row (`friendlies`, `stats-player`, profile matches) — the row is 390 wide on the phone and
  992 on desktop with the same ~150px island in the middle; the tournaments list rows (crown moves from x=720 to x=1096);
  the compact standings card; the ideas cards (a two-line body becomes one line in a 944px card).
- Same at both: the floating filter pill is 117×44 in both captures (desktop 24px from right and bottom; mobile 16px from the
  right, 15px above the bar). The Compact/Details, Last 3/Total, Stars/League controls keep their style across widths.

## The chrome (top bar, bottom bar)

### The top bar — 1 variant in geometry
**What varies:** nothing measurable across the 8 screens; the back button appears on 2 and the title stays put.
- **A — 57px bar (56 + 1px hairline at y=56.5)** · seen on 8 screens. Menu button 40×40 at (12,8) on 8/8; back button
  40×40 at (56,8) on 2/8 (`blue-m-live-comments-screen.png`, `blue-m-match-edit-screen.png`); bell 36×36 at (342,10) on 8/8.
  Title centre x = 195.0 (`dashboard`, `clubs`, `stats-player`, `tournaments`), 195.25 (`friendlies`, `ideas`), 194.5
  (`match-edit`), 192.75 on `live-comments` where the title is truncated ("test 2v2 very long tour…", text box 104.5–281).
  Title cap-height 11.5–12px on 8/8. [`ui/shell/MobileChrome.tsx`, `ui/shell/NotificationBell.tsx`]
  The two left controls are 40px; the right control is 36px, with its top 2px lower and its bottom 2px higher than the menu's.

### The tab strip under the top bar — 1 geometry, 2 looks, 1 scrolled
- Present on 7/8 (the dashboard has none). 60px tall (y 57–117), hairline at y=117, 2px orange underline at y 115–117 whose
  width equals the tab (16→145.5 on friendlies, 16→97.5 on clubs, 16→165.5 on tournaments, 16→75.5 on ideas,
  243→334.5 on match-edit, 299→385.5 on stats-player, 273→364 on live-comments). Labels packed from x=29 with ~30px gaps
  on 7/7 (stats' four tabs happen to reach x=372.5).
- Icons: 5/7 with (`friendlies`, `clubs`, `tournaments`, `stats-player`, `live-comments`), 2/7 without (`ideas`, `match-edit`).
- `blue-m-live-comments-screen.png` is the one strip that is horizontally scrolled: the first visible tab reads "andings"
  (glyphs start at x=20, hard-clipped, no fade on the left); the active "Comments" ends at 363.5 at the right edge.

### The bottom tab bar — 1 geometry, 2 states of "current"
**What varies:** whether any tab is marked at all.
- **Geometry, 8/8 identical:** hairline at y=787, bar 787–844 (57px, the same 57 as the top bar); five tabs on 78px centres;
  icon glyphs 17px tall at y 800.5–817 (widths 17 / 23.5 / 19 / 17 / 19 — the trophy is the wide one); labels y 823.5–831.
  A 7.5px red dot sits on the trophy's top-right corner (x 125–132.5, y 795–802.5) on **8/8** screens. [`ui/shell/BottomTabBar.tsx`]
- **A — current tab = orange icon + orange label** · 6 screens: Dashboard on `dashboard`; Friendlies on `friendlies`;
  Tournaments on `live-comments`, `match-edit`, `tournaments`; Stats on `stats-player`.
- **B — no tab marked, all five muted** · 2 screens: `blue-m-clubs-screen.png`, `blue-m-ideas-screen.png` (those destinations
  have no tab; the bar shows nothing as current).

### Gap between the bars and the content — 1 variant (the first element's own shape explains the spread)
- Tab hairline → first content: 12px where the first thing is a box edge (`clubs` GROUP chips, `live-comments` card,
  `match-edit` card, `ideas` AREA chip), 14px (`stats-player`, the avatar ring), 15px where it is caps text (`friendlies`,
  `tournaments`). Dashboard (no tabs): 19px from the top bar to the "LIVE NOW" caps. Effectively one ~12px box gap on 7/7
  tabbed screens.
- Last content → bottom bar: content runs straight under the bar on 5/8 (`dashboard`, `friendlies`, `stats-player`, `ideas`,
  `tournaments` at 0–7px) — a scrolling list, as expected. `clubs` 16px (a row boundary). `match-edit` 41px below its
  Cancel/Save row. `live-comments` 350px of nothing.

### Things anchored above the bottom bar — 4 variants
**What varies:** what floats there, and whether it covers the list.
- **A — the floating filter pill** · 2 screens: 117×44 at x 257–373.5, y 728–771.5 (16px right margin, 15px above the bar),
  orange-bordered, opaque. [`ui/primitives/FilterPill.tsx` via `pages/stats/StatsFilterPill.tsx`, `pages/tools/FriendlyMatchesListCard.tsx`]
  - `blue-m-friendlies-screen.png` — it covers the right end of the last visible row: "Atzi 0 | 2 R" (the "umpi" is under the pill)
  - `blue-m-stats-player-screen.png` — it covers the radar chart's "Defense" label ("Def" shows)
- **B — a sticky composer strip** · 1 screen: `blue-m-ideas-screen.png` — an opaque strip (~y 717–772, 15px above the bar, the same
  band as the pill) holding "Share an idea…" + a 39.5px blue send button (325–364.5). It lies over the third idea card; that card's
  title glyphs show in a ~5px slit between the strip and the bar (y 773–777.5). [`pages/ideas/IdeaComposer.tsx`]
- **C — in-flow buttons at the end of the page** · 1 screen: `blue-m-match-edit-screen.png` — "Cancel" and "Save result"
  right-aligned (right edge 373.5), bottom at 745.5, 41px above the bar; they scroll with the form.
- **D — a composer inside the card, not anchored** · 1 screen: `blue-m-live-comments-screen.png` — the same input+blue-send shape
  as B sits at y ≈385–430 inside the Comments card, 350px above the bar. [`pages/live/comments/CommentComposer.tsx`]
  Two composers of the same shape (input, blue round-square send, "Roli" chip / image button), one sticky at the bottom and one
  in the card.

## Fresh-eye observations

- **Desktop pages read as a phone page pinned to the left of a 992px column.** 9 of 17 pages present their main content as a
  ~150px score island at x≈760 with ~400px of ground on each side; another 5 push text to the left edge and one control to
  the right edge with 700–820px of nothing between. Only the dashboard, the stats table, the tiles and the ideas cards look
  designed for the width.
- **Settings is the only page that admits the column is too wide** and centres a 672px card; every other page fills 992px.
- **The profile opens on a 990×557px "No header image" placeholder** (`blue-d-profile-overview.png`, `blue-d-profile-matches.png`,
  [`pages/profile/ProfileHeader.tsx`]): on a 900px-tall viewport the tabs sit at y 829 and the first real content at y 867 —
  33px above the bottom edge. The "Anpöbeln" button sits alone on its own row at the far right (x 1139–1255) above the tabs.
- **The compact standings inside the live/done cards** keep "P / GD / PTS" glued to the right edge, 820px from the names, in a
  card that otherwise has 12px padding.
- **The dashboard's own standings and the Stats "Table" are the same table with the same rows and a different column grid**
  (9–14px), visible when flipping between `blue-d-dashboard.png` and `blue-d-stats-table.png`.
- **One toggle, three costumes**: Compact/Details is boxed with icons on the live match list, loose-left-below on the matchup,
  loose-right-inline on the player page.
- **Five ways to say "see more"** on the desktop: a filled "Open … →" button, an orange "View all →", a muted "Full table ›" under
  the table, a caps header with "›", and a right-aligned tournament name with "›" — the dashboard alone uses three of them.
- **Two typefaces for numbers that mean the same thing**: "0-0-1" is monospace on the match page and in the club-stars ladder,
  sans on the profile rivals, the matchup tile and the player identity line; a date is a mono pill in match histories and plain
  sans in the tournaments list, on the dashboard and on ideas.
- **Match-detail's "All matches: Roli / Berni vs Rumpi / Atzi"** is the one 944px-wide saturated-blue button on the desktop; the
  two "All matches as a team" buttons beneath it are grey. The only other blue on desktop is the ideas send square.
- **The trends chart** rotates every tournament name 45° along the x-axis (`blue-d-dashboard.png`); at 992px there is room to not.
- **The stats-positions page** left-aligns its heading, description and the ⓘ at the two column edges but centres the grid,
  so the eye jumps 276px from the text to the data.
- **The tournaments list** puts a 3px coloured bar (green live / blue draft / grey done) at the row's left and a crown at x=1096,
  leaving an 800px lane where a desktop list would put the date, mode and winner as columns.
- **Chrome:** the bell is 36px next to two 40px buttons; the top and bottom bars are both 57px, a coincidence that reads as
  intent. The red dot on Tournaments is on every screen with no hint whether it means "live" or "unread". On Clubs and Ideas
  the bottom bar shows no current tab at all — the user is somewhere the bar cannot point to.
- **The mobile Ideas screen has a sliced card**: the third idea's title peeks out in a 5px strip between the sticky composer and
  the bottom bar; the composer is opaque, the card beneath is not scrolled away.
- **The live tournament's tab strip on the phone** starts mid-word ("andings") with no fade or arrow; 7 tabs in 390px.
- **Mobile Clubs** stacks four filters of four different widths (a two-pill group, a 86px select, a 305px select, a full-width
  search) and a round icon-only Refresh; the desktop version labels the same button "Refresh".
- **Mobile Ideas** wraps the AREA chips onto a second row and lets the "Most wanted | Newest" sort group land at the end of that
  row, so a sort control sits inside a filter row.
- **Match-edit's Cancel/Save** scroll with the page while the filter pill and the ideas composer stay anchored — the three
  "commit" affordances on the phone use three anchoring rules.
