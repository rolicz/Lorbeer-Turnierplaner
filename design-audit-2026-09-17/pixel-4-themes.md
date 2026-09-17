# The same screens in two themes

Ten screens, mobile 390×844 @2x, `blue-m-<slug>.png` against `light-m-<slug>.png`. Every colour below
was sampled from the PNGs with PIL (foreground = the pixel furthest from the local mode, or the most
saturated pixel for dots/rings/lines; background = the local mode). Ratios are WCAG luminance
contrast, given as numbers only. Where a token is named it comes from `frontend/src/themes/blue.css`,
`light.css`, `defaults.css` or `frontend/src/styles.css`; the finding itself is what the pixels show.

Page grounds for reference: blue `#0b111e`, light `#ecebe9`. Body text: blue `#f8fafc`, light
`#0c0a09`. Muted text: blue `#bac6d8` (10.9:1 on the page), light `#4a4642` (7.9:1). All ordinary
labels, muted lines, tab labels, pills and chips measured between 7.8:1 and 19.9:1 in both themes and
are not listed again.

## Trends chart lines — each theme loses different players

- **dashboard** · `blue-m-dashboard.png` vs `light-m-dashboard.png`: the six player lines are the same
  hex in both themes (`trendsMath.ts` `colorForIdx`: `hsl(hue 72% 56%)`, theme-invariant), drawn on a
  card that is `#1d283c` in blue and `#f7f6f5` in light. Solid-line core colour against that card:

  | player | line | on blue card | on light card |
  |---|---|---|---|
  | Flo | `#e0e03d` | 10.5:1 | **1.31:1** |
  | Rumpi | `#3de03d` | 8.4:1 | **1.63:1** |
  | Berni | `#3ee0e0` | 9.1:1 | **1.50:1** |
  | Mike | `#e03ee0` | 4.2:1 | 3.3:1 |
  | Roli | `#e03d3d` | 3.45:1 | 4.0:1 |
  | Atzi | `#3d3ddf` | **2.06:1** | 6.6:1 |

  In light the yellow, green and cyan lines sit on near-white at 1.3–1.6:1; in blue the dark-blue
  line sits on navy at 2.1:1. The same chart therefore reads as "five lines and a faint one" in blue
  and "three lines and three pastel ones" in light.
- **dashboard** (same pair): the dashed "no data" segments are fainter still in both, and fainter in
  light: blue Atzi dashed `#28283c` = 1.03:1, Berni `#313b3c` = 1.28:1, Rumpi `#3c453c` = 1.48:1;
  light Flo dashed `#efeeb9` = 1.11:1, Berni `#caf0ef` = 1.13:1, Rumpi `#b9eeb7` = 1.22:1, Roli
  `#efb8b6` = 1.59:1, Atzi `#bfbfef` = 1.63:1. The dashed Berni and Flo segments in
  `light-m-dashboard.png` and the dashed Atzi segment in `blue-m-dashboard.png` are the ones a viewer
  will not find without the legend.
- **dashboard**: chart gridlines are `#2d3a4e` on `#1d283c` (1.29:1) in blue and `#efedec` on
  `#f7f6f5` (1.08:1) in light — the light grid is roughly a third as strong. The chart's axis tick
  labels are fine in both (8.6:1 / 8.7:1).

## Form sparkline — bright green on white

- **stats-player** · `blue-m-stats-player.png` vs `light-m-stats-player.png`: the "Form (last 12)"
  sparkline in the player card is the same `#21c55d` in both themes. On the blue card (`#151e30`) it
  is 7.3:1; on the light card, which is pure white `#ffffff`, it is **2.28:1**. (`charts.tsx`
  `Sparkline` picks a fixed `GREEN`/`AMBER`/`RED` constant, not a theme token.)

## Compare-with dots — dimmed toward the wrong ground

- **stats-player** · same pair, "Compare with" chips: the five unselected player dots are dimmed
  versions of the chart palette. Blue dims toward dark (`#2b3286`, `#2b7b3d`, `#2b7b86`, `#743286`,
  `#747b3d` on chip `#1d283c`); light dims toward white (`#a3a2eb`, `#a3eba2`, `#a3ebeb`, `#eca2eb`,
  `#eceba2` on chip `#f6f5f4`). Contrast of dot vs chip:

  | player | blue | light |
  |---|---|---|
  | Atzi (blue) | **1.34:1** | 2.16:1 |
  | Rumpi (green) | 2.82:1 | **1.29:1** |
  | Berni (cyan) | 3.01:1 | **1.23:1** |
  | Mike (magenta) | 1.79:1 | 1.76:1 |
  | Flo (yellow) | 3.27:1 | **1.14:1** |

  In `light-m-stats-player.png` the Flo, Berni and Rumpi dots are barely there; in
  `blue-m-stats-player.png` the Atzi dot is the one that vanishes. Same players as the chart above.

## Cup colours — one cup changes hue, and the two cups have unequal weight in blue

- **dashboard** · `blue-m-dashboard.png` vs `light-m-dashboard.png`: the Lorbeerkranz is **yellow**
  in blue (`#fbbf24`: section dot, Berni's name, Berni's avatar ring, the crown) and **brown** in light
  (`#a64a0c`, `--color-cup-gold`). The Bauernkranz stays green in both (`#15803d` / `#167437`). A
  viewer who learns "the yellow cup" on one theme meets a brown cup on the other; the green one
  keeps its identity.
- **dashboard** (same pair): in blue the two cup holders' names carry very different weight — Rumpi
  in cup-green `#15803d` on the page is **3.76:1**, Berni in cup-gold `#fbbf24` is **11.3:1**. In
  light both names are ~4.9:1 (`#167437` 4.91:1, `#a64a0c` 4.89:1). The same applies to the avatar
  rings: in `blue-m-dashboard.png` Berni's ring is a bright band, Rumpi's a dark-green one.
- **tournaments** · `blue-m-tournaments.png` vs `light-m-tournaments.png`, the round crown badges at
  the right of every row: the 2v2 (gold) crown glyph is `#fbbf24` on its `#2c2a1f` disc in blue
  (8.6:1) and `#a64a0c` on `#e2d4ca` in light (**4.0:1**); the 1v1 (green) crown is `#147f3c` on
  `#0c2123` in blue (**3.3:1**) and `#167437` on `#cedad0` in light (4.1:1). Each theme has one weak
  crown, and it is a different cup in each. The same badge appears on `profile-matches` (next to
  the name: 8.5:1 blue / 4.0:1 light) and on every date pill in the match histories (`profile-matches`
  and `stats-player`: gold crown 7.0:1 blue / **3.6:1** light).

## Trophy (winner marker) — pale orange in light

- **tournaments** · `blue-m-tournaments.png` vs `light-m-tournaments.png`: the small trophy before
  the winner's name is `#fbbe23` on the page in blue (11.2:1) and `#fb923b` in light (**1.90:1**). It
  is painted with `text-gradient-gold-from` (`TournamentsPage.tsx:168`; the same class on the live
  page's `OverviewSection.tsx:133`), which light.css sets to `251 146 60`. In blue this trophy is
  the same colour as the cup crown and the draw digits (`#fbbf24`); in light the trophy is orange
  while crown and draw are brown, so "gold" splits into two colours on that theme.

## Draw vs loss — clearly apart in blue, close in light

- **profile-matches** · `blue-m-profile-matches.png` vs `light-m-profile-matches.png`, and every
  score-line, W-D-L run and D/L badge on `match-detail`, `stats-player`: result colours are win
  `#49dd7f` / draw `#fabe23` / loss `#f77070` in blue and win `#166534` / draw `#92400e` / loss
  `#991b1b` in light. All six are legible on their grounds (5.9–11.2:1). But the distance between
  draw and loss is CIE76 ΔE ≈ 69 in blue (yellow vs coral) and **ΔE ≈ 21** in light (brown vs dark
  red). In `light-m-profile-matches.png` the draw "5" on the Flo/Berni 5:5 row and the loss "2" on
  the Roli/Flo 4:2 row are two dark warm digits; in blue they are unmistakably yellow and red. The
  D badge (`#92400e` on `#ded2c8`) and L badge (`#991b1b` on `#dfccca`) share the same near-identical
  disc tint in light; in blue the discs are `#2e2a1e` vs `#2e1f2a`, also close, but the glyphs differ
  in hue far more.

## Placeholder text — the same grey on two different fields

- **clubs** · `blue-m-clubs.png` vs `light-m-clubs.png`: the "Search clubs..." placeholder is
  `#9ca3af` in both themes. On the blue field (`#303f59`) that is 4.2:1; on the white light field
  it is **2.54:1**.
- **ideas** · `blue-m-ideas.png` vs `light-m-ideas.png`: the "Share an idea..." composer placeholder
  is the same `#9ca3af`: 4.2:1 on `#303f59` in blue, **2.54:1** on white in light. Neither field
  sets a placeholder colour, so this is Tailwind's preflight default (`gray.400`); `ClubPicker.tsx`
  is the one input that does (`placeholder:text-text-muted`).

## Surfaces — depth ordering

- **match-detail** · `blue-m-match-detail.png` vs `light-m-match-detail.png`: the page has three
  levels — page, the H2H box, and the nested "Exact matchup" / "Team A together" / "Team B together"
  boxes. In blue they are `#0b111e` → `#1d283c` (1.28:1) → `#26344b` (1.18:1): three fills, each
  a step lighter. In light they are `#ecebe9` → `#f7f6f5` (1.10:1) → **`#f7f6f5` (1.00:1)**: the
  nested box has exactly the fill of its parent and is marked only by a 1px hairline (`#dddbd9`,
  1.28:1 against the fill). The mechanism is visible in the CSS: `.inset` paints
  `--color-bg-card-chip / 0.5` (translucent, so nesting stacks) while `[data-theme="light"] .inset`
  paints the opaque `--color-bg-card-inner` plus a border (`styles.css` 58–70).
- **live-overview**, **dashboard**, **stats-player** (all pairs): boxes on the page ground are
  `#1d283c` on `#0b111e` (1.28:1) in blue and `#f7f6f5` on `#ecebe9` (1.10:1) in light — the
  light box is closer to its page than the blue box is to its page, and relies on the hairline
  border it alone carries. The one white surface (`#ffffff`, 1.19:1 on the page) is the true
  `.card`: the stats-player player card, the Ideas outer card, the profile "No header image" box.
  So in light a screen can show two slightly different box whites side by side (`stats-player`:
  white player card above `#f7f6f5` stat tiles) where blue shows one navy.
- **ideas** · `blue-m-ideas.png` vs `light-m-ideas.png`: the three-level stack reads in both — blue
  `#0b111e` → `#151e30` → `#222f45`, light `#ecebe9` → `#ffffff` → `#f7f6f5` — but in opposite
  directions: blue goes lighter with each level, light goes lighter then darker.
- **clubs** · `blue-m-clubs.png` vs `light-m-clubs.png`: the Stars/League selects and the search
  field have no visible border in blue (edge pixel = page colour; the `#303f59` fill alone marks the
  box at 1.78:1) and a distinct `#a8a29e` border in light (2.12:1 on the page) around a white fill
  that is itself only 1.19:1 from the page. Both are findable; they are found by different means.

## Club-stars bars — a hue swap

- **stats-player** · `blue-m-stats-player.png` vs `light-m-stats-player.png`: the horizontal bars in
  "Club stars" are dark brown `#321e19` in blue (1.20:1 on the page) and lavender `#cbd1e5` in light
  (1.28:1). They are the accent at low alpha, so they change colour with the accent (orange → blue).
  Text on the bar is fine in both (W-D-L digits 5.5–9.4:1 blue, 4.7–5.5:1 light; "10P" 9.1:1 / 6.1:1).

## Radar chart

- **stats-player** (same pair): outline `#e03d3d` is 4.4:1 on the blue page and 3.6:1 on the light
  page; fill is `#391b25` (blue) / `#e9c5c4` (light); the pentagon grid is `#222c3c` (1.34:1) /
  `#d0cecb` (1.32:1) — equal. The "Defense" axis label is hidden behind the floating filter pill
  in **both** captures.

## Hairlines that are equal — and a second, fainter hairline that is also equal

- List rows (`tournaments`, `friendlies`, `clubs`, `profile-matches`, `stats-player` club-stars rows):
  `#222c3c` on `#0b111e` (1.34:1) in blue, `#d0cecb` on `#ecebe9` (1.32:1) in light. Section-label
  rules: 1.29:1 / 1.27:1. Matched.
- Standings rows (`dashboard` standings preview, `stats-table` rows): `#0c1323` on `#0b111e`
  (**1.02:1**) in blue, `#e5e5e3` on `#ecebe9` (**1.06:1**) in light — invisible in both, while the
  header rule above them is 1.48:1 / 1.42:1. Not a theme difference; noted under fresh-eye.
- The score separator "|" in every score line: `#354153` (1.83:1) blue, `#bcb8b5` (1.65:1) light.

## Things that turned out the same

- "playing" pill: 6.7:1 (blue) / 7.5:1 (light). Status stripes on tournament rows are the same
  hex in both (`#22c55e` live, `#0ea5e9` draft; done `#475569` / `#a8a29e`).
- Selected chip / segment / tab: accent text on an accent tint, 4.5–6.2:1 in blue (orange
  `#fe6100`) and 4.6–5.8:1 in light (blue `#1d4cd6`); the tab underline and the selected avatar ring
  follow the same accent. Unselected avatars wear a thin grey ring in both.
- Primary buttons: blue `#2563eb` with a white label (5.2:1) in blue; teal `#14b8a6` with the
  page-ink label (7.9:1) in light — both the "All matches" button (`match-detail`) and the send
  button (`ideas`) agree within their theme. (The send button's icon in light is dark, not white; an
  earlier sample that suggested white was the white composer band showing through the rounded
  corners.)
- W/D/L badges, loser-name muting, winner bolding, "×1" chips, meta pills, "Open Standings",
  "Anpöbeln": 4.3–19.9:1 in both.

## Layout differences between themes (should be none)

- **Every `.inset` box is 1 CSS px taller in light**, because `[data-theme="light"] .inset` adds a
  `1px solid` border where `.inset` has `border: 0` (`styles.css` 58–70). With `height: auto` the
  border adds to the box, so everything below each inset shifts down 2 device px, cumulatively.
  Measured by aligning edge profiles band by band:
  - `dashboard` 2930 → 2938 px (+2 after the live card, +4 after the cups, +6 through the chart, +8
    at the standings).
  - `ideas` 2114 → 2120 (+2 per idea card).
  - `live-overview` (both 1688, viewport-tall): +2 after the current-match card, +6 by the standings
    header, +10 at "Next matches".
  - `match-detail` (both 1688): +4 at the first nested box, +8, +12 at "Team B", +18 at "Recent
    matches".
  - `stats-player` 12602 → 12622: +2/+6/+10 across the three rows of stat tiles, +12 after the
    radar's compare chips, +18 after the streak tiles, +20 from "Club stars" on.
  - `tournaments`, `friendlies`, `clubs`, `stats-table`, `profile-matches`: 0 px drift (no insets).
  Because of this, the two captures of a card page are never pixel-aligned below the first inset.
- **`light-m-stats-player.png` is missing twelve club crests/flags that `blue-m-stats-player.png`
  shows on the same rows** (six in the left slot at blue y ≈ 7728, 8081, 10169, 10432, 11467, 11641;
  six in the right slot at y ≈ 8742, 9547, 9722, 9813, 10169, 10867 — e.g. the Berni 2:1 Roli,
  Flo 4:3 Roli, Flo/Berni 1:6 Roli/Atzi, Rumpi 6:1 Roli/Berni, Flo/Rumpi 4:6 Roli/Atzi rows). Nothing
  in the theme CSS touches images, and `profile-matches` has identical crest counts in both (13 left,
  17 right), so this looks like lazily-loaded images that had not arrived when the light capture
  was taken — but it means those rows are not comparable between the two files.
- The fixed "Share an idea…" composer is painted across the third idea card in both `ideas`
  captures, and the floating filter pill covers the radar's "Defense" label in both `stats-player`
  captures — the same full-page-capture effect as the hidden tab bar, not a theme difference.

## Fresh-eye observations

- **Two action colours per theme, and they swap roles.** In blue the accent (active tab, selected
  chip, sort arrow, avatar ring) is orange and the filled button is blue; in light the accent is
  blue and the filled button is teal. "Blue" therefore means "selected" on one theme and "press me"
  on the other.
- **A draw is painted in the gold cup's colour.** Blue: draw digit `#fabe23`, cup gold `#fbbf24`,
  trophy `#fbbe23` — one colour for a drawn score, the Lorbeerkranz ring/crown and the winner's
  trophy. Light: draw `#92400e`, cup gold `#a64a0c` — the same near-identity, both brown. On a
  match-history row a D badge and a gold crown on the date pill above it look like the same thing.
- **Two hairline strengths.** List rows and section rules are 1.3:1; standings rows on the dashboard
  and the stats table are 1.02–1.06:1. The stats table looks unruled while the list below it on the
  same screen is ruled.
- **Tournament rows look like unfilled cards.** Each row after the first in a month shows a rounded
  top edge but no fill and no side edges, so the list reads as "cards with only their lids drawn".
  Same in both themes.
- **"Live" as a word is barely tinted.** `#ccfbf1` mint next to `#f8fafc` body text in blue, and
  `#134e4a` next to `#0c0a09` in light; the green left stripe does the work in both.
- **The score separator "|"** is faint enough (1.6–1.8:1) to be read as a gap rather than a mark.
- **Chart lines are the only colours not derived from the theme**, which is why the same six lines
  are strong on navy and pastel on white; every other colour in the app moved between themes.
- **The light theme has two whites** (`#ffffff` cards and `#f7f6f5` boxes) on a `#ecebe9` page and
  relies on 1px hairlines to separate boxes; the blue theme has one box navy at a clearer step and
  no hairlines. Both are coherent, but the light theme's boxes are 1.10:1 from the page where the
  blue theme's are 1.28:1.
