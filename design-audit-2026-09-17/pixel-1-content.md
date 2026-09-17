# Content pages at 390px — what the pixels say

Scope: the 17 `blue-m-*` content screens (390×844 CSS px, captured at 2×; every number below is
converted to CSS px, i.e. image px ÷ 2). Distances were measured with PIL against the page
background `rgb(11,17,30)`; where a distance is quoted "to ink" it runs from an edge to the first
glyph or box pixel, not to a layout box, so text-first blocks read 3–4 px larger than box-first
ones. I have not read any design documentation; component names are quoted only where a file under
`frontend/src` obviously matches what is on screen.

Capture artifacts, not findings: two fixed bottom elements were painted mid-page by the full-page
capture, exactly like the tab bar that was hidden — the Ideas composer ("Share an idea…") sits on
top of the third idea card in `blue-m-ideas.png`, and the friendlies filter capsule ("⚙ All · ⇲")
sits on top of the "Atzi 0–2 R…" row in `blue-m-friendlies.png`.

---

## Top bar → first content — 3 variants
**What varies:** how far below the 56 px top bar (its hairline sits at y = 56) the first ink appears.
- **A — a tab strip, 32 px to the tab glyphs** · seen on 10 screens: the strip's text/icon ink starts 32 px under the bar's hairline; the strip closes with its own full-bleed hairline at y = 117, i.e. the strip is 60 px tall.
  - `blue-m-tournaments.png`, `blue-m-tournaments-new.png` (tournament list / new tournament)
  - `blue-m-friendlies.png`, `blue-m-friendlies-create.png` (friendlies list / new friendly)
  - `blue-m-clubs.png`, `blue-m-clubs-new.png` (clubs list / new club)
  - `blue-m-ideas.png`, `blue-m-players.png`, `blue-m-settings.png`, `blue-m-settings-appearance.png`
- **B — a card edge, 16.5 px** · seen on 6 screens: a rounded panel starts 16–17 px under the bar.
  - `blue-m-profile-own.png`, `blue-m-profile-overview.png`, `blue-m-profile-stats.png`, `blue-m-profile-matches.png`, `blue-m-profile-guestbook.png` (the header-image box)
  - `blue-m-notfound.png` (the "This page does not exist" card)
- **C — a section label, 19.5 px** · seen on 1 screen: the caps of "LIVE NOW" start 19.5 px under the bar — 3 px lower than a card edge and 12 px higher than a tab strip's glyphs.
  - `blue-m-dashboard.png`

Within variant A the gap **under** the strip's hairline to the first ink is itself of 3 kinds:
12.5 px to a box edge on 7 screens (tournaments-new card, clubs segmented control, clubs-new input,
ideas chip, settings ×2 cards); 15.5 px to text on 3 screens (tournaments "SEPTEMBER 2026",
friendlies "28 AUGUST 2026", friendlies-create "Game"); **24.5 px** to the first avatar on
`blue-m-players.png` — the players list is the one tab page whose first block visibly floats.

## Section headings — 5 treatments (plus 3 form-label treatments below)
**What varies:** the type, the presence of a rule, and whether the heading sits bare, in a card, or in a card header strip.
- **A — small caps label + hairline rule** (13 px uppercase, letter-spaced, `rgb(186,198,216)`, cap height 9.5 px; the 1 px rule runs from the label to the right edge and sits exactly on the caps' vertical midline, ±0.5 px on all 15 instances measured) · seen on 8 screens, 21 instances
  - `blue-m-dashboard.png` — LIVE NOW · BAUERNKRANZ · LORBEERKRANZ · TRENDS · STANDINGS (all five also carry a "›" chevron after the label, before the rule)
  - `blue-m-profile-own.png`, `blue-m-profile-overview.png` — ABOUT · RIVALS · FAVORITE TEAMMATES · RECENT MATCHES
  - `blue-m-profile-stats.png` — KEY NUMBERS · PROFILE NET (with a muted sentence under it) · STREAKS · CURRENT / RECORD
  - `blue-m-friendlies.png` — every date group ("28 AUGUST 2026")
  - `blue-m-tournaments.png` — every month group ("SEPTEMBER 2026")
  - `blue-m-friendlies-create.png` — SETUP
- **B — the same small-caps label with no rule, inline before a control** · seen on 2 screens
  - `blue-m-clubs.png` — GROUP · STARS · LEAGUE (filter labels)
  - `blue-m-ideas.png` — AREA (filter label)
- **C — bold ~16 px title as the first line inside a card, no rule, no icon** (cap height 11 px, `rgb(248,250,252)`) · seen on 3 screens, 6 instances
  - `blue-m-settings.png` — Account · View as
  - `blue-m-settings-appearance.png` — Theme
  - `blue-m-tournaments-new.png` — Name · Mode · Players ("Players" carries a muted "Select at least 3" on the right)
- **D — bold ~16 px title in a card header strip: leading icon, muted count/subtitle, hairline under the strip** (strip 40.5 px tall on Ideas and Guestbook, 58.5 px on the Clubs disclosure) · seen on 3 screens
  - `blue-m-ideas.png` — "💡 Ideas 3"
  - `blue-m-profile-guestbook.png` — "💬 Guestbook 0"
  - `blue-m-friendlies-create.png` — "🛡 Clubs / Not set" with a chevron on the right (a disclosure, same strip)
- **E — bold ~16 px title bare on the page, muted count on the right, no rule** · seen on 3 screens, 8 instances
  - `blue-m-profile-matches.png` — "4. Lorbeerkranzturnier … 6 matches" (×7 groups)
  - `blue-m-profile-overview.png`, `blue-m-profile-own.png` — the "Recent matches" groups ("test 2v2 very long tournament name … 4 matches")

So the same job — "a group of rows starts here" — is done by A on the tournaments and friendlies lists (small caps + rule) and by E on the profile's match list (bold title, no rule), on screens one tap apart.

## Form field labels — 3 treatments on 4 forms
**What varies:** casing, weight, colour and position of the label for a text field or select.
- **A — small caps, muted, to the left of the control** · `blue-m-clubs.png` (GROUP / STARS / LEAGUE)
- **B — title case, regular, bright 15 px, to the left of the control** · `blue-m-clubs-new.png` (Name / Stars / League) — the same three words as A, on the adjacent tab, in a different style
- **C — title case, muted 13 px, above the control** · `blue-m-friendlies-create.png` ("Game", "Team A (1)"), `blue-m-profile-own.png` ("Profile text")
- and `blue-m-tournaments-new.png` labels its fields with treatment C of the section headings (bold card titles), so a fourth look for the same job.

## The "go there" affordance on a heading — 3 variants
**What varies:** how a section says it can be opened.
- **A — "›" chevron after the label** · 5 instances on `blue-m-dashboard.png` (LIVE NOW puts the chevron at the far right after the tournament name; the other four put it directly after the label)
- **B — orange "View all →" / "Full stats →" at the right end of the rule** · `blue-m-profile-own.png`, `blue-m-profile-overview.png` (View all), `blue-m-profile-stats.png` (Full stats) — orange `rgb(254,97,0)`, arrow glyph
- **C — muted "Full table ›" as a right-aligned line under the block** · `blue-m-dashboard.png` (Standings). The dashboard therefore uses chevron-after-label at the top of the section and a muted link with a chevron at the bottom of it, while the profile uses an orange arrow link at the top.

## Space around section headings (ink to ink) — no fixed rhythm
**What varies:** the gap between the previous block and the heading, and between the heading and its content.
- Above a treatment-A heading: 19.5 (dashboard STANDINGS), 21.5 (stats PROFILE NET), 22.5 (dashboard BAUERNKRANZ), 23 (profile RECENT MATCHES), 23.5 (profile FAVORITE TEAMMATES), 26.5 (profile RIVALS), 35.5 (tournaments AUGUST 2026, from the last text line of the previous row). Seven headings, six numbers.
- Below it: 10.5 (PROFILE NET → its subtitle), 11 (STREAKS → tiles), 12 (RIVALS, FAVORITE TEAMMATES → tiles; TRENDS → segmented control), 15 (RECENT MATCHES → title), 23.5 (friendlies date → first score), 24 (tournaments month → first row's colour bar), 28.5 (STANDINGS → table header). The tile sections sit 12 px under their heading; the row lists sit 24 px under theirs.
- Treatment E (profile match groups): 31 px above the title, 7 px below it to the pills.

## Tab strips — 2 variants, and clipping on 5 screens
**What varies:** whether tabs carry an icon; whether the strip fits.
- **A — icon + label, orange 2 px underline, full-bleed hairline** · 9 tabbed screens: tournaments ×2, friendlies ×2, clubs ×2, players, settings ×2, profile ×5 (14 screens in total counting the profile's)
- **B — label only** · `blue-m-ideas.png` (Open / Closed / All)
- The profile strip has four tabs and does not fit 390 px: "Guestbook" is cut to "Gues" on `blue-m-profile-own.png`, `blue-m-profile-overview.png`, `blue-m-profile-stats.png`, `blue-m-profile-matches.png`; on `blue-m-profile-guestbook.png` the strip is scrolled and "Overview" is cut to "verview" on the left. No fade or edge affordance is drawn either side; it is a hard clip in all 5.
- The profile strip also sits at two heights: y = 457 on the own profile (icon buttons in the header) and y = 498 on the other four (a full-width "Anpöbeln" button in the header).

## List rows — 7 shapes
**What varies:** row height, inner structure, separator, and what sits on the right.
- **A — 3-line row with a 2 px colour bar on the left, 1 px divider, 85 px pitch** · `blue-m-tournaments.png`: title 17 px bold, meta line (state · date · mode, plus "🏆 winner"), muted player list; a 28 px crown roundel on the right (gold or green outline), or nothing.
- **B — avatar row, 1 px divider, 66 px pitch** · `blue-m-players.png`: 40 px avatar, 18 px bold name (+ a 24 px crown roundel after the name on 2 rows), muted truncated tagline; on the right a bell-count pill (3 rows) and a 42×28 pencil button (all 6 rows).
- **C — label + count + "▶", 1 px divider, 45 px pitch** · `blue-m-clubs.png`: 14 px "5★" left, muted count right, then a small filled triangle — the only place in the set a triangle is used for "opens".
- **D — centred score line, 1 px divider, 41 px pitch** · `blue-m-friendlies.png`: name · club mark · big bold digits with a vertical bar · club mark · name; nothing on the right; winner's name bright, loser's muted.
- **E — centred score line with two-line team names, W/L/D letter roundels outside, 44 px pitch (48 for the first row after a group header)** · `blue-m-profile-matches.png`, `blue-m-profile-overview.png`, `blue-m-profile-own.png`: same score line as D but coloured digits (green/red/yellow) and a "vs" in place of digits for unplayed matches; a group header (pills for date/mode/position + "Lorbeerkranz at stake · X defending") precedes each block.
- **F — plain text rows inside a card, no dividers, 42 px pitch; the selected row gets a filled rounded box inset 14 px** · `blue-m-settings.png` (View as)
- **G — a card per row, nested inside a card** · `blue-m-ideas.png`: avatar 28 px + author/date, a status pill top-right, bold title, pill chips, body, then a "👍 0" button left and pencil/trash buttons right.
- Plus the dashboard standings table (`blue-m-dashboard.png`): 45 px pitch, dividers of a brighter colour than any list (see hairlines).

## Row right-hand affordance — 5 variants
**What varies:** what tells the reader a row opens something.
- crown roundel or nothing (`blue-m-tournaments.png`, 21 rows: 12 with, 9 without)
- pencil icon button (`blue-m-players.png`, 6 rows)
- "▶" triangle after a count (`blue-m-clubs.png`, 10 rows)
- nothing at all (`blue-m-friendlies.png`, 20 rows; `blue-m-profile-matches.png`, 29 rows)
- a filled highlight on the selected row (`blue-m-settings.png`, 6 rows)

## Hairlines — 4 colours for the same 1 px line on the page background
**What varies:** the divider colour.
- `rgb(34,44,60)` — row dividers on players, friendlies, tournaments, profile matches (5 screens)
- `rgb(28,37,52)` — row dividers on `blue-m-clubs.png` (dimmer than the others)
- `rgb(32,41,56)` — the rule after every small-caps heading (8 screens) and the rule under a profile match-group header
- `rgb(41,51,68)` — the dashboard standings table (brighter)
- inside cards the lines are `rgb(37,49,68)` (settings, guestbook, friendlies-create) and the top-bar / tab-strip hairlines are the same family. Six values for "a hairline", three of them within 6 RGB points of each other.

## Cards and panels — 3 radius families, one tone ladder
**What varies:** corner radius by role, and how many surface tones stack.
- **~12–14 px** — page-level cards: settings ×3, tournaments-new ×3, notfound, ideas outer, guestbook, friendlies-create "Clubs" disclosure, the settings "View as" selected row, the friendlies-create team slots (`r_top` 9.5–12 on an antialiased arc).
- **~10 px** — tiles and content boxes: profile header-image box, rival/teammate tiles (66 × 172), key-number tiles (76 × 173), streak tiles (52 × 173), theme tiles (38 × 160), the dashboard "live now" card and the friendlies-create match preview card (`r_top` 7.5–8.5).
- **~9–10 px** — inputs, selects, text buttons, icon buttons, segmented-control tracks (`r_top` 6–9.5); pills and the ideas area chips are fully round to the eye.
- Tones: page `11,17,30` → card `21,30,48` → tile / live card `29,40,60` → idea card / slot / selected row `34,47,69` → chip-in-idea `61,76,101` → input `48,63,89`. On `blue-m-ideas.png` four of these stack (page → card → card → chip); on `blue-m-friendlies-create.png` the score preview uses the tile tone directly on the page and the "Clubs" card uses the card tone, so the two panels one above the other are two different greys with two different radii.
- Full-width panels are 353–358 px wide, i.e. inset 16–18 px: cards 353–356, the profile header box 356, tiles reach 379 px from a 34 px start; the dashboard live card starts at 36. Sub-pixel, but the left edges of stacked panels differ by up to 2 px (`blue-m-profile-stats.png`: tiles at 34, header box at 34; `blue-m-friendlies-create.png`: preview 35, Clubs card 38).

## A card with a title — 2 variants
**What varies:** whether the title lives in a separate strip.
- **A — title as the first line inside the padding, no strip** · `blue-m-settings.png` (2), `blue-m-settings-appearance.png` (1), `blue-m-tournaments-new.png` (3)
- **B — icon + title (+ count/subtitle) in a 40–59 px header strip closed by a hairline** · `blue-m-ideas.png`, `blue-m-profile-guestbook.png`, `blue-m-friendlies-create.png` (Clubs)

## Counts — 5 placements
**What varies:** where a number that describes a list is put.
- muted, after the title inside a card header strip: "Ideas 3", "Guestbook 0" (`blue-m-ideas.png`, `blue-m-profile-guestbook.png`)
- muted, right of a small-caps heading's rule: "1 match" (`blue-m-friendlies.png`, every group)
- muted, right of a bold bare title: "4 matches" (`blue-m-profile-matches.png`, `blue-m-profile-overview.png`, `blue-m-profile-own.png`)
- muted, as its own line above the list with a refresh button: "626 of 626 clubs" (`blue-m-clubs.png`)
- muted, right of a row with a triangle: "16 ▶" (`blue-m-clubs.png` rows)
- (`blue-m-tournaments.png` and `blue-m-players.png` show no count at all)

## The three "new / create" forms — 3 layouts
**What varies:** everything: grouping, label style, field width, and where the primary action is.
- `blue-m-tournaments-new.png` — three stacked cards, each with a bold title; full-width input; a segmented "1v1 | 2v2"; a 48 px avatar grid; **Cancel + Create right-aligned under the cards** (Create disabled, dim blue).
- `blue-m-clubs-new.png` — no cards; bright title-case labels in a left column, inputs/selects in an aligned right column starting at x = 125; **a lone "Create" button left-aligned** (disabled, dim blue) under the fields.
- `blue-m-friendlies-create.png` — no cards for the first row; a muted "Game" label above a 210 px input with three 40×40 icon buttons beside it (**the save is one of the icons, top-right, and the only primary action on the page**); then a tile-tone score preview card, two 125×37 steppers, a card-tone "Clubs" disclosure, then a SETUP section with a segmented "1v1 | 2v2" in its heading and four rows of 31 px avatars. No footer action.
- Primary buttons across the set: dim blue `rgb(24,58,133)` when disabled (tournaments-new Create, clubs-new Create, friendlies-create save, guestbook send), bright blue `rgb(37,99,235)` when enabled (notfound "Back to dashboard", ideas send).

## Inputs, selects, buttons — sizes
**What varies:** heights that are almost, not quite, the same.
- Inputs 38 px tall (tournaments-new Name, clubs-new Name, clubs search, friendlies-create Game, textarea 96), selects 40 (clubs Stars 84 wide vs clubs League 304 wide and clubs-new Stars/League 247 wide — the two "Stars" selects on adjacent screens are 84 and 247 px wide), guestbook/ideas composer inputs 40.
- Text buttons 33–36 px tall (notfound Back 36, tournaments-new Cancel/Create 36, clubs-new Create 35; on `blue-m-settings.png` My profile 36, Logout 34 and Switch role 33 — three heights in one card, two of them side by side in the same row) except "Anpöbeln" at 39 (`blue-m-profile-overview.png`, `-stats`, `-matches`, `-guestbook`).
- Icon buttons: 40×40 on forms (friendlies-create clear/reset/save, guestbook send), 42×28 / 41×28 / 39–46×28–30 on list rows (players pencil, clubs refresh, profile-own header icons), 40×40 top-bar menu, 36×36 top-bar bell, ~40×40 top-bar back — three footprints for a bare-icon button.
- Segmented controls: track 39–40 px tall (dashboard Last 3/Total, clubs Stars/League, friendlies-create 1v1/2v2, ideas Most wanted/Newest, tournaments-new 1v1/2v2), active segment 30–32 with a 2 px orange outline on the tinted fill. On `blue-m-ideas.png` the 40 px sort control sits in the same wrapped row as the 34 px area chips, so the row's items are two heights.
- Pills: 21–22 px tall everywhere (dashboard "playing", "1v1", "×1"; profile date/mode/#1/6; players bell counts; friendlies-create "scheduled"; ideas "New") — the one thing that is the same on every screen it appears on. Chips inside idea cards are 26.

## Avatars — 6 diameters
**What varies:** the size of the same circular avatar.
- 28 (`blue-m-ideas.png` author) · 31 (`blue-m-friendlies-create.png` picker; its "None" slot is 36 with the ring) · 38 (`blue-m-dashboard.png` standings) · 40 (`blue-m-players.png`, `blue-m-dashboard.png` cup holders) · 48 (`blue-m-tournaments-new.png` picker) · 56 (profile headers, 5 screens). The two pickers — choosing players for a tournament vs for a friendly — use 48 and 31.
- The ring is 2 px gold/green on cup holders (`blue-m-players.png` Berni/Rumpi, `blue-m-dashboard.png`, profile headers) and a hairline elsewhere; the friendlies-create "None" slot draws a 2 px orange ring on a ⊘ glyph, the same ring weight as a cup holder.

## Column alignment
**What varies:** whether controls in a labelled column line up.
- `blue-m-clubs.png`: the three filter controls start at x = 70 (Group), 67.5 (Stars), 76 (League) — each row is sized by its own label, so the left edge zig-zags by 8.5 px; the search field below is full-bleed at x = 16.
- `blue-m-clubs-new.png`: all three controls start at x = 125.5 — a true column — while the labels are a different style (see form labels).
- `blue-m-dashboard.png` standings header: "PLAYER" is uppercase, "Pts ▾ · PPM · P · Win% · Elo" are mixed case, in one row; "Pts" is orange (sorted), P values are muted, Elo bright.
- Gutters are 16 px on both sides on 11 of 17 screens; `blue-m-clubs.png` runs the League select to 9 px from the right edge while everything else on the page stops at 16 (its right edge is 7 px past the search field's and the count line's).

## Empty and placeholder states — consistent in tone, 4 shapes
- "No header image" centred in a 202 px tile-tone box (4 screens); "No messages yet." centred in a card section (`blue-m-profile-guestbook.png`); "No club / No club" and "— — | — —" in the score preview (`blue-m-friendlies-create.png`); the notfound card with a 28 px compass icon, two centred lines and a bright button (`blue-m-notfound.png`). All use the muted `rgb(186,198,216)`; only notfound adds an icon and an action.

## Cut off, overlapping, wrapping badly
- Profile tab strip hard-clipped on all 5 profile screens (see Tab strips).
- `blue-m-profile-own.png`: the header meta wraps as "Guestbook: 2 ·" / "Angepöbelt: 47" — the "·" separator is left dangling at the end of line one; the other profile ("Angepöbelt: 247" with a fist icon) fits on one line and has the icon that the own profile's line lacks.
- `blue-m-dashboard.png`: the trend chart's x-axis labels are rotated ~50° and the outermost ("Kleines Feines", "7. Bauernkranzturnier") run into the chart card's padding; the y axis is unlabelled.
- `blue-m-ideas.png`: the area chip row wraps to two lines and the sort control ends up on the second line beside "Friendlies / Stats", its right edge flush with the card below but its height 6 px taller than the chips.
- `blue-m-players.png`: three taglines are ellipsised at 70–100 % width; rows with a tagline are 67 px, rows without are 65 px (pitches 65/67/67/65/67), so the list's rhythm shifts by 2 px depending on whether a player wrote something.
- `blue-m-friendlies-create.png`: "Match 1 · Leg 1 · 2v2" is shown for a friendly being created (a leg/match numbering with nothing to number), and the two score steppers are 125 px wide with a 100 px void between them.

---

## Fresh-eye observations
- The page background, the top bar and the tab strip are one colour; the only thing separating the bar from the page is a 1 px hairline, and cards begin 16 px later. On the card-first pages (profiles, notfound) the app reads as "a dark page with panels"; on the list pages (tournaments, friendlies, clubs, players) as "a dark page with text and hairlines"; on settings and tournaments-new as "a stack of cards with titles inside". Three different mental models of what a page is, within one app.
- Small-caps-with-a-rule is the app's most recognisable device and it is applied to two different things: "here is a section" (dashboard, profile, stats) and "here is a date bucket" (tournaments, friendlies). Because the profile's own match list then switches to bold titles for its buckets, the reader has to learn that bold-title-plus-count and small-caps-plus-count mean the same thing.
- Orange is used for: the active tab, the active segment, the active area chip, the "View all →" links, the sorted column head, the ×1 badge outline, the "None" ring, the radar fill, and the friendlies filter capsule's outline. It is the accent for both "selected" and "go somewhere", so a "View all →" looks like a selected state and an active chip looks like a link.
- Blue is used only for the enabled primary button (notfound, ideas send) and the disabled primary (dim). Because disabled primaries outnumber enabled ones 4:2 in this set, the first impression is that the app's primary colour is a dull navy.
- Four surfaces say "opens": a crown roundel, a pencil, a ▶ triangle, and a bare row. A first-time reader would not guess that a friendlies score row or a profile match row is tappable, nor that a tournaments row is (its crown looks like a status, not a handle).
- The dashboard's "LIVE NOW" heading pushes its subject (the tournament name) to the right end of the rule with a chevron; every other heading on the page keeps its chevron next to the label. Two heading grammars on one screen.
- The Clubs page shows the same "Stars" control twice, one tab apart, at two widths (84 vs 247 px) and under two label styles; the Stars select on the list tab is the only control in the set that is sized to its content rather than to the column.
- Profile headers differ between "own" and "other": three 40×28 icon buttons vs one 39 px full-width text button, a text-only meta line vs an icon-led one. The same header at two heights moves the tab strip by 41 px depending on whose profile it is.
- The tournament picker (48 px avatars in a grid) and the friendly picker (31 px avatars in four rows with "Unassigned" on the right and an orange "None" ring) are two different components for the same act.
- The friendlies-create page has no visible "create" wording anywhere: the save icon is the third of three identical-looking 40×40 icon buttons in the Game row.
- The ideas board is the deepest nesting in the set — page › card › card › chip — and its header strip counts "Ideas 3" while the guestbook's counts "Guestbook 0": the count is styled as part of the title rather than as a badge, unlike the bell-count pills on Players.
- Numbers in the dashboard standings are right-aligned in five columns while the profile stat tiles left-align a label over a 30 px figure; the same "Pts / PPM / Win%" data reads as a table on one screen and as tiles on the next.
