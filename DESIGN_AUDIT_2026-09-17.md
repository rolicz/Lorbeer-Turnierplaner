# Design consistency audit — 2026-09-17

An outside look at the app, deliberately taken **without** the design documentation.

Eight reviewers worked in parallel: four read `frontend/src`, four read screenshots. None of them
opened `DESIGN.md`, `AGENTS.md` or any tracker, and none was allowed to justify a finding with a
rule. The only admissible evidence was the app's own behaviour, counted: *"eleven screens do X,
four do Y, here is each one."* Where a reviewer could only support something with a remembered
rule, it was dropped.

The point was to find out what the app actually looks like to someone meeting it for the first
time, without being fenced in by decisions already written down. So this report **names variants
and counts them; it does not say which one is right.** That call is yours.

## What was looked at

- **Source:** every component under `frontend/src` (excluding `api/generated/` and `src/test/`),
  read in four disjoint slices — matches/scores/clubs, people, time/numbers/words, and
  containers/states/actions.
- **Pixels:** 71 screenshots against a throwaway stack (a copy of the dev database, ports 8003 /
  8020, three seeded ideas so the board was not empty) — all 36 screens at 390×844, 17 at 1280×900,
  10 in the light theme, and 8 viewport-height captures with the real top and bottom bars in place.
  Distances and colours were measured with PIL, not eyeballed.

The raw reports are in `design-audit-2026-09-17/`. They carry the full evidence — every count
below can be traced to a `file:line` or a named screenshot there.

## How to read this

Parts 1 and 2 are things that are **wrong whatever your taste** — content covered, text that
cannot be read, a number that contradicts itself, a mark that means two things. Part 3 is the
actual decision list: one subject at a time, every variant in use, with counts. Parts 4–6 are
housekeeping: dead code, what turned out to be fine, and the claims that did not survive checking.

**The split between "broken" and "a choice" is mine, not the reviewers'** — they were told not to
rank anything. Where I have verified a claim myself, it says so.

---

# Part 1 — Broken regardless of taste

### 1.1 The trends chart's colours ignore the theme — each theme loses different players
`frontend/src/pages/stats/trendsMath.ts:8` spreads hue evenly round the wheel at a **fixed**
lightness (56% solid, 38% for "no data" dashes, 16% outline). Nothing consults the theme, so
whichever hue lands near the background's lightness disappears. Measured contrast of the line
against its own card:

| player | light theme | blue theme |
|---|---|---|
| Flo (yellow) | **1.31:1** | 10.5:1 |
| Berni (cyan) | **1.50:1** | 9.1:1 |
| Rumpi (green) | **1.63:1** | 8.4:1 |
| Atzi (dark blue) | 6.6:1 | **2.06:1** |

The dashed "no data" segments are worse: Atzi's dashed line in the blue theme measures **1.03:1** —
against the card it sits on, that is invisible. *Verified in the source.*

### 1.2 Two more fixed colours with the same problem
- The **form sparkline** on Stats → Player is a hard-coded `#21c55d` (`charts.tsx`, a `GREEN`
  constant rather than a token): 7.3:1 on the blue card, **2.28:1** on the light card, which is
  pure white.
- The **"Compare with" dots** dim toward their own theme's ground: Flo's dot is **1.14:1** in
  light, Atzi's is **1.34:1** in blue.

### 1.3 Placeholder text is Tailwind's default grey, not a token
`#9ca3af` on both the Clubs search and the Ideas composer: 4.2:1 on the blue field, **2.54:1** on
the white light field. Neither input sets a placeholder colour. `ClubPicker.tsx` is the one input
in the app that does.

### 1.4 Two floating elements sit on top of content
Measured on the viewport captures, where the chrome is real — and present in **both** themes:
- The **filter capsule** (117×44, 15px above the bottom bar) covers the right end of the last
  visible friendlies row — `Atzi 0 | 2 R` with "umpi" underneath it — and covers the **"Defense"**
  label of the radar on Stats → Player.
- The **sticky Ideas composer** lies over the third idea card, leaving a 5px slit through which
  that card's title shows.

### 1.5 Every `.inset` is 1px taller in the light theme, and it accumulates
`styles.css:58` sets `border: 0`; `styles.css:67` gives the light theme `border: 1px solid`. The
reason is sound and documented in the file — `--color-bg-card-chip` is pure white in light, so a
white inset on a white card would vanish. The side effect is that the two themes are never
pixel-aligned below the first inset: dashboard +8 device px, ideas +6, live overview +10, match
detail +18, stats/player +20. Pages with no insets drift 0. *Verified in the source.*

### 1.6 Standings row dividers are invisible in both themes
`1.02:1` in blue, `1.06:1` in light — while the header rule above them is `1.48:1` and the ordinary
list rows elsewhere on the same screen are `1.34:1`. The stats table reads as unruled while the
list under it is ruled.

### 1.7 An unplayed match shows `0 │ 0` in the comments feed
Every other list in the app shows `vs` or `– │ –` for a match that has not been played. The
comments feed header decides by asking whether goals are `null` (`comments/CommentList.tsx:180`) —
but the wire type is `goals: number` and the backend defaults a side to `0`, so they are never
`null`. A scheduled match's comment block is the one place in the app that prints a finished-looking
0–0, with both names at draw weight.

### 1.8 Eleven destructive or irreversible actions have no confirmation
Thirteen flows go through the shared `ConfirmDialog` (nine with the red "what is lost" block). Zero
use a native `confirm()`. These eleven ask nothing:

| action | where |
|---|---|
| Delete avatar | `players/PlayerAvatarEditor.tsx:295` |
| Delete header image | `profile/ProfileHeader.tsx:248` (icon only) |
| Remove idea image | `ideas/IdeaCard.tsx:183` |
| **Remove second leg** (deletes matches) | `live/AdminPanel.tsx:236` |
| **Set last match to playing** (reopens a finished tournament) | `live/AdminPanel.tsx:257` |
| Reshuffle order | `live/AdminPanel.tsx:245` |
| Clear to draw (removes a saved decider) | `live/AdminPanel.tsx:447` |
| Swap Home/Away | `live/CurrentGameSection.tsx:262` |
| Swap sides | `live/MatchList.tsx:209` |
| Logout | `SettingsPage.tsx:139` |
| Clear the whole friendly form | `tools/FriendlyMatchCard.tsx:347` |

**Swap sides asks on the match page and does not ask on the other two screens that offer it.**

### 1.9 The W/D/L badge exists in Compact and disappears in Details
`MatchHistoryList.tsx:85` draws the 16px W/D/L disc only in the Compact view. Switch the same list
to Details and the letter is gone, leaving only the coloured numeral. The denser view says *more*
about the result than the roomier one.

### 1.10 A drawn score and a lost score are nearly the same colour in the light theme
Win `#166534` / draw `#92400e` / loss `#991b1b`. All three are legible, but draw and loss are
**ΔE ≈ 21** apart in light against **ΔE ≈ 69** in blue. On `light-m-profile-matches` the draw "5"
and the loss "2" are two dark warm digits; in blue they are unmistakably yellow and red. The D and
L badge discs share a near-identical tint in light.

### 1.11 The app never picks a locale
All five date helpers and both inline formatters pass `undefined`, so the same screen reads
`12.9.2026` on an Austrian phone, `12/09/2026` on a British one and `9/12/2026` on an American one.
On a German phone `fmtDate` is **unpadded** and `fmtDateTime` is **padded**, so one day gets two
column widths. A test pins the en-GB shape (`src/test/cupsPreview.test.tsx:114`), which is not what
your own phone renders.

### 1.12 Five strings can print "1 tournaments"
Never pluralised: `cupParts.tsx:135`, `:146`, `:27`, `h2h/MatchupView.tsx:203` ("1 wins, 0 draws, 2
losses"), `SelectClubsPanel.tsx:295` ("1 of 1 clubs"). Elsewhere a helper (`fmtCount`, 4 sites) or a
hand-rolled ternary (13 sites) handles it.

### 1.13 Two layout edges that do not line up
- The Clubs page's **League select runs to 9px from the right edge** while everything else on that
  page — search field, count line — stops at 16.
- On **match edit** the match card is nested one level deeper than on Current/Overview/Matches and
  is 24px narrower, so "Cheltenham Town" wraps to two lines there and on no other screen.

---

# Part 2 — One mark, several meanings

These are not style variance. The same visual carries different information depending on the
screen, which is the kind of thing a reader learns wrong once and then misreads everywhere.

### 2.1 `★` means club quality in six places and Elo in one
Stats → Player prints the Elo rating as **`1052★`** (`PlayerProfile.tsx:113`) — the same glyph that
means a club's star rating a few blocks lower on the same page. **Found independently by three
reviewers** (source, text and pixels), which is the strongest corroboration in this audit.

### 2.2 A crown means four different things
| meaning | where |
|---|---|
| holds the cup **today** | Players page, profile header — where the avatar's coloured ring already says it, so the fact is drawn twice |
| held the cup **going into this tournament** | tournament standings — and here the avatar gets no ring |
| **won** this tournament with that cup at stake | Positions grid (smaller, filled) |
| the cup is **at stake** (not about a person at all) | tournament list, match-history date pills |

### 2.3 A ring around an avatar means "holds a cup" on 11 surfaces and "is selected" on 5
They never collide only because no picker passes `cups`. The friendly form's "None" slot draws a
2px orange ring — the same weight as a cup holder's.

### 2.4 "Live" is green in the page and red in the navigation
Five in-page markers for a playing match use the green status family. The three navigation "Live
now" dots paint `--color-live`, which is **red-500** in the dark themes. A reader learns "green =
happening now" on every page and then meets a red pulse for it in the bar.

### 2.5 A draw is painted in the gold cup's colour
Blue theme: draw digit `#fabe23`, cup gold `#fbbf24`, winner's trophy `#fbbe23` — one colour for a
drawn score, the Lorbeerkranz ring and the trophy. Light theme: draw `#92400e` against cup gold
`#a64a0c`, the same near-identity in brown. On a match-history row a D badge and the gold crown on
the date pill above it read as the same mark.

### 2.6 One cup changes hue between themes, the other does not
Lorbeerkranz is **yellow** `#fbbf24` in blue and **brown** `#a64a0c` in light. Bauernkranz stays
green in both. Each theme also has exactly one weak crown, and it is a different cup in each: gold
4.0:1 in light, green 3.3:1 in blue.

### 2.7 A pill that looks like every other pill is sometimes a door
The Streaks "Current" pills open a profile; the voter chips do nothing; the trends legend chips
toggle a line. Same shape, three behaviours.

### 2.8 The accent colour means both "selected" and "go somewhere"
Orange is the active tab, the active segment, the active chip, the sort arrow — **and** the "View
all →" links. So a link looks like a selected state and a selected chip looks like a link. In the
light theme the roles swap wholesale: the accent becomes blue and the filled button becomes teal,
so blue means "selected" in one theme and "press me" in the other.

### 2.9 `×N` points in two directions
`×3` on a cup reign = three tournaments held. `×3` on a Records header = three players tied. `3×
1v1` on Positions = a count of a mode.

### 2.10 "P" sits next to a number that means points
A standings row reads `3P 3-0-0 14:6 GD +8` directly under a large `9 pts`.

---

# Part 3 — One thing, several ways

The decision list. No recommendation attached to any of these.

## 3.1 Scores and matches

**Separator between two goal counts — 6 spellings.** Hairline grid (9 `ScoreLine` sites) · bare
numerals under stacked names (1) · colon `14:6` (`RecordLine` ×13 + 2) · en dash `2–1` (2) · hyphen
`2-1` (2). **The Reset and Finish dialogs on the same match use two of them** — "Roli 3–1 Berni is
wiped." and "Finish this match at 3:1?".

**The hairline walks.** Only 1 of 8 score lists passes `digits` (`FriendlyList.tsx:120`); in the
other seven the separator's x moves with each row's digit count.

**An unplayed match — 3 placeholders.** `vs` (5 places, small size) · `– │ –` (9 places, medium and
hero) · a real `0 │ 0` (comments feed, see 1.7). The same match flips between the first two when you
toggle Compact/Details.

**"This match is being played" — 5 markers, 3 vocabularies.** Dot + raw lowercase enum · dot + `to
play / live / played` · the raw enum inside a bordered pill (6 hero surfaces) · capitalised
`Scheduled / Playing / Finished` in a segmented switch · nothing (5 lists). The score itself never
says it. **The raw enum words are user-facing text on 7 surfaces.**

**Match-list row idioms — 8**, with 5 divider strengths (`chip/30`, `/35`, `/40`, `/50`,
`inner/40`) and hover washes that overhang the content by 8px, 4px or 0 depending on the list. The
live tournament's **Overview tab uses three row rhythms in a row** — `py-0.5` without dividers,
`py-1` without dividers, `py-2` with them — inside three identical boxes.

**Naming a fixture — `#4` (4 places) vs `Match 4` (3), `leg 1` vs `Leg 1`**, and the meta line sits
above the score, below it, or on a block header depending on the screen. The Matches tab reads `#4
playing · leg 1` while the hero directly above it reads `Match 4 · Leg 1 [playing]` for the same
fixture.

**Compact / Details — 3 controls** (a remembered `SegmentedSwitch`, a `ChipGroup`, the floating
capsule) in 3 placements, plus 4 lists fixed at Compact with no control at all.

## 3.2 Clubs

One `ClubBadge`, one fallback order (crest → flag → monogram), two sizes. That part is clean.
Around it:

- **8 placements** of the symbol, and the league flag **mirrors sides** under a score but is always
  first in the picker, the Clubs page and the club slot.
- **"No club" has 7 renderings** — the words "No club" in the club-name slot on 9 surfaces (a
  first-time reader can take it for a club called "No club"), an invisible 16px slot on 3, nothing
  at all on 1, `—`, a shield icon + "Select club", "not set", "Select club first".
- **A star rating has 5 expressions** — 14px glyphs (5), 12px glyphs (2), `★ 3.5` (1), `3.5★` (9).
  The star-history row shows **both at once**, so it states the rating twice.

## 3.3 People

- **Avatar diameter: 7 values** through `AvatarCircle` (24/28/32/36/40/48/56) plus 4 more in the
  pickers. The same "leaderboard row" context appears at 24, 28 and 36. The **fallback initial does
  not scale with the disc** — 14px inside a 24px avatar, 12px inside a 28px one.
- **Name typography: 12 combinations.**
- **Tapping a person: 4 behaviours.** 12 sites link the identity to the profile; 3 make the whole
  row the profile; 15 show a name whose tap does something else; 20 show a name that does nothing.
  Of the three bylines, **the Ideas byline is a link and the comment and guestbook bylines are
  dead** — the three cards are laid out identically. Four tooltip phrasings for the same door.
- **A 2v2 team is written 6 ways** — stacked · `A/B` · `A / B` · `A` + muted `/` + `B` · `A + B` ·
  and the Records list, alone, collapses a stacked score line to one `A + B` line. **The same club
  slot label reads `Roli + Berni` on a tournament match and `Roli/Berni` on a friendly.** *Found
  independently by three reviewers.*
- **"You" is nearly never said.** Marked in 4 places (two in Settings, the profile header, the
  notification bell). Unmarked in every standings table, leaderboard, comment feed, voter list and
  picker. The composer labels the reader by name while the bell speaks in the second person. The
  shell shows no logged-in identity at all.
- **Rank digits: 3 typographies**, and "first place" is a green bar in one table, bold text in
  another, a colour ramp in a third.
- **8 spellings of an empty name**: `—`, `Anonymous`, `Player #N`, `#N`, a bare digit as the avatar
  initial, `Guest`/`Me`, `Unassigned`/`Team A`, `?`.

## 3.4 Time, numbers and words

- **Dates: 9 rendered shapes.** A reader can meet eight of them in one session — `12.9.2026`
  (tournaments), `12.09.2026, 14:30` (comments), `12. Sep. 26` (streaks/records), `12. September
  2026` (friendlies headings), `September 2026` (tournaments headings), `Sep` (chart), `2d ago`
  (bell), `14:30:45` (friendlies "Saved"), plus `2026-09-12 14:30:45` in Diagnostics.
- The 2-digit year in Records/Streaks has **no apostrophe**, so "26" reads like a day number. The
  helper's own comment promises `'26`.
- **Relative time exists in exactly one place** (the bell). Tapping the entry lands on an absolute
  timestamp. **"edited" carries a time on comments and not on guestbook entries or ideas.**
- **Seconds appear exactly once in the product UI** — "Saved 14:30:45." on the friendly form.
- **The same per-match average is labelled 4 ways** ("Pts / match" ×7, "PPM"/"G/M"/"GA/M" ×7, a
  lowercase "ppm" suffix ×6, a bare number ×1) and reaches the screen through **4 different
  functions across 22 call sites** — including `fmtPct`, which never formats a percentage.
- **Played: "P" (7) · "matches" (6) · "Played" (5) · "games" (2). Points: "Pts" (3) · "pts" (4) ·
  "Points" (1)** — "Pts" and "pts" sit on the same tournament Overview tab. **Win rate: "Win rate"
  (2) · "Win %" (5) · "Win%" (2)**, and the H2H matrix cell prints the number with no `%` at all.
- **Elo: "Elo" (4) · "Rating" (1) · `1052★` (1).**
- **"a of b": `#3/8` (3) · `5 / 12` (1) · `3 of 10` (2).**
- **Four words for "still running"** — a streak chip says `live`, a streak with no start date says
  `ongoing`, a reign row says `current`, a club-star row says `now`.
- **Capitalisation is consistent where it is shared and drifts where it is hand-written**: section
  labels 29/29 sentence case, `StatsSection` 15/15 — but Title Case outliers in 5 buttons ("Create
  Tournament", "Open Standings/Results/Matches", "Swap Home/Away") against ≈45 sentence case, one
  tab ("All Friendlies" against 15), one page title ("Player Login" against 4).
- **31 empty-state sentences end with a full stop and 4 do not**; "None yet." (3) against "No
  <thing> yet." (≈22). **Ellipsis: "…" ×68, "..." ×2.** **"Login"/"Logout" (4) vs "Log in" (1).**
- **12 German strings in 5 files** of an English UI — "Anpöbeln"/"Gesendet" on the poke button,
  "anpöbel notifications" on the Players page, "Kein eindeutiger Sieger" on Positions,
  "Schere-Stein-Papier Turnier" as a decider name beside "Match" and "Penalties". *This one may well
  be deliberate flavour rather than an oversight — it is listed because a blind reviewer counted it,
  not because it is wrong.*

## 3.5 Containers, states and actions

- **`.inset` is used at 58 sites with 8 different paddings**; `.card` at 25 sites overrides its own
  padding at 11 of them with 7 different values.
- **Section headings: 8 treatments**, including the same uppercase label with and without its rule
  (31 vs 12), and a sentence-case bold title on **4 different element types** (`h2`, `h3`, `div`,
  `span`). On the Clubs page the *same three fields* — Group / Stars / League — are captioned
  uppercase on the Browse tab, sentence-case bold on the Create tab, and as form labels in the row
  editor. The two Stars controls on adjacent tabs are **84px and 247px wide**.
- **Empty states: 3 shapes.** The shared component at 35 sites with **10 different paddings and
  surfaces** — the same one-line "No … yet." sits bare on the page in Stats, inside a level-2 box on
  the live Overview, and inside a full card on Stats → Player. Plus 11 hand-written sentences in 7
  type styles, and 9 places that render nothing at all.
- **Loading: 6 idioms.** The full-page spinner draws **4, 5 or 6 dots depending on the page**.
  `InlineLoading` appears at 30 sites with **9 different labels**. Three feeds use a skeleton; 16
  queries show the previous content with no indicator at all.
- **Errors: 6 shapes.** 72 toasts (titles in two templates: "… loading failed" ×35, "Could not …"
  ×32) against 5 inline boxes, and only one of those can be dismissed. "Not found / invalid" has 4
  shapes, **two of which skip `PageLayout`** and therefore have no desktop back chevron.
- **Buttons.** `Button.iconOnly` has **0 callers** while **43 icon buttons are hand-sized**, spelled
  three different ways, at 28/32/36/40px — plus controls outside `Button` at 16, 20 and 44px, for
  **7 tap-target sizes**. The clear-search × in the club picker is **16px with no hit area at all**.
  The same Reply/Edit/Delete trio is 36px on comments and 32px on guestbook entries and ideas.
  **31 raw `<button>`s** carry their own look, including 8 different "text link as an action" styles.
  *Verified: `iconOnly` genuinely has no callers.*
- **"The whole row is the action" is implemented 7 ways.** On two screens — standings rows and
  stats-table rows — the row is tappable with **no chevron, no underline, nothing** but a hover
  tint, while `ListRow` elsewhere shows a chevron by default.
- **Filters and tabs: 9 control idioms.** Compact/Details is a segmented switch, a chip pair and a
  popover group. 1v1/2v2 is a segmented switch on two forms and a popover group on two lists. Sort
  is a segmented switch on Ideas, a chip group in H2H, and clickable column headers in the tables.
  **Filters sit in four different places** — floating bottom-right, an inline row under the tabs,
  inside a card's header band, inside a collapsible panel. The Clubs page filters with **two native
  OS dropdowns** while every other filter in the app is a custom control.
- **Overlays: 8 treatments, 3 scrim alphas, and the z-order disagrees with itself** — the bell
  popover blurs at z-50, the filter popover blurs at z-40 (*below* a modal), the dropdown menu does
  not blur and sits at z-60 (*above* a modal). The toast floats over everything at z-70 with the
  app's only `shadow-xl`.
- **13 distinct `rounded-full` recipes** for a tag or badge.

## 3.6 The desktop width

- **16 of 17 pages fill a fixed 992px column**; Settings alone centres a 672px card.
- **9 of 17 present their main content as a ~150px island centred at x≈760, with ~400px of empty
  row on either side** — friendlies, both profile match lists, the matchup, stats/player, the live
  Matches tab in Details, the done tournament's played matches, the dashboard live card, match
  detail.
- **5 push text to the left edge and one control to the far right with 700–820px of nothing
  between** — the tournaments list (title at 280, crown at 1096), players, clubs, and the compact
  standings card, where "PLAYER" sits at 301 and "P / GD / PTS" at 1169–1221.
- **The same six-column standings table sits on two different column grids** — the dashboard and
  Stats → Table differ by 9–14px in the four middle columns while the player and Elo columns
  coincide.
- The desktop profile opens on a **990×557px "No header image" placeholder**, leaving the tabs at
  y 829 and the first real content 33px above the fold.
- The trends chart rotates every tournament name 45° along the x-axis even at 992px, where there is
  room not to.

## 3.7 The chrome

Measured on 8 viewport captures. **The top bar is geometrically identical on all 8** — 57px, menu
40×40 at (12,8), back 40×40 at (56,8) where it appears, title centre at 195.0 ± 0.5. That part
holds. Two things inside it do not:

- **The bell is 36×36 next to two 40×40 buttons**, with its top 2px lower and its bottom 2px higher.
- **The bottom bar is also 57px** and identical on all 8 — but the red dot on Tournaments is on
  every screen with nothing to say whether it means "live" or "unread".

**Three "commit" affordances use three anchoring rules**: the filter capsule and the Ideas composer
are anchored 15px above the bar, match edit's Cancel/Save scroll with the form 41px above it, and
the comments composer sits unanchored inside its card, 350px up.

---

# Part 4 — Defined and never reached

- `Modal`'s centred-only layout — all 6 call sites pass `fullScreenOnMobile`. *Verified.*
- `Button.iconOnly` — 0 callers against 43 hand-sized icon buttons. *Verified.*
- `AdminPanel`'s `card` wrapper — its one caller passes `wrap={false}`.
- `CollapsibleCard`'s `card` and `inset` variants — its one caller passes `variant="none"`.
- `SegmentedSwitch.widthClass` — accepted, ignored, still passed at two call sites.
- `shadow-card` and `shadow-focus` — defined in `tailwind.config.cjs`, used 0 times.

---

# Part 5 — Checked and found consistent

Worth knowing so it is not re-examined:

- **W-D-L order and hyphens: 6 of 6.** The label "W-D-L": 3 of 3.
- **"1v1" / "2v2" lowercase: 6 of 6.**
- **Tournament status words** come from one function.
- **Pills are 21–22px tall on every screen they appear on** — the one dimension that never varies.
- **The club symbol has one implementation and one fallback order.**
- **No thousands separators anywhere**; the weekday is never shown; the year is never omitted.
- **Native tooltips: ≈45 literals, all sentence case, none ending in a full stop.**
- **The desktop sidebar is pixel-identical on all 17 pages** apart from the moved highlight, and the
  content column starts at x=264 on all 17.
- **The tab strip's geometry is one variant** — height, underline colour and thickness identical
  everywhere.
- **Body and muted text measure 7.8:1 to 19.9:1 in both themes** — no ordinary text has a contrast
  problem. Selected chips, tabs, status pills, W/D/L badges and primary buttons all hold in both.
- **List-row hairlines and section rules are matched between themes** (1.34:1 vs 1.32:1).

---

# Part 6 — Claims that did not survive checking

Recorded so they are not acted on.

### The tab strips do fade — two reviewers were wrong about this
Two independent reviewers reported the clipped tab strips as "hard clip, no fade or edge
affordance" (the live tournament's 7 tabs, the profile's 4). A third measured a fade. **I checked
the pixels myself and the third is right:** on `blue-m-live-comments-screen.png` the glyph
brightness of the clipped "…andings" ramps 47 → 76 → 98 → 123 → 145 → 174 → 194 → 216 across the
left 60 image px, and the profile strip's right edge ramps down the same way. `SectionTabs.tsx:115`
and `:123` render exactly those gradients, conditionally on whether the strip can still scroll.

What remains true is only the underlying fact: **seven tabs do not fit in 390px** on the live
tournament and **four do not fit** on the profile, so both strips open mid-word. Whether that is
acceptable is a judgement, not a missing affordance.

### The bottom bar marking no current tab on Clubs and Ideas is correct
Neither is a bottom-bar destination, so there is nothing to highlight.

### The Positions grid's lines are behind the digits, not over them
A reviewer reported the lineage lines "running over the digits". Looking at the capture, the lines
pass *behind* the digits and read through the translucent tiles — which is what makes the grid look
busy, but the digits stay legible and on top. The busyness is a fair fresh-eye observation; "over
the digits" overstates it.

### Two capture artefacts, correctly identified by the reviewers themselves
In the full-page screenshots the fixed filter capsule and the Ideas composer are painted mid-page.
Three reviewers spotted this and set it aside. **It is still a real defect** (see 1.4) — but that
was established on the viewport captures, where the chrome is where a reader actually sees it.

### One capture was not comparable
`light-m-stats-player.png` is missing twelve club crests that the blue capture shows on the same
rows — lazily-loaded images that had not arrived. The reviewer noticed the discrepancy, checked a
second screen where the counts matched, and marked those rows as not comparable instead of
reporting a theme difference.

---

## Method notes

- **Stack:** backend on 8003 against a copy of `backend/app.db` with throwaway credentials minted
  for the audit — `backend/secrets.json` was never read. Vite on 8020. Ports 8000/8001/8010/5173
  untouched. Three ideas were seeded into the copy so the Ideas board was not empty.
- **Captures:** animations disabled; the fixed bottom bar hidden in full-page shots (it is otherwise
  painted across the middle of a tall page) and left in place in the eight `-screen` shots.
- **Nothing in the repository was modified by any reviewer.** All eight were read-only.
- To regenerate: the screenshot script and the shot list are reproducible from this report's
  method; the raw reports in `design-audit-2026-09-17/` name every file and line they cite.
