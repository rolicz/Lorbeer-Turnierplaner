# Lorbeerkranz — Design Canon

> The single visual language for the app. Every page, primitive and worker task follows this
> file; when something here and the code disagree, the code is wrong. Companion to `AGENTS.md`
> (project knowledge). Created 2026-09-12 after a full audit of the frontend (see
> `FEATURES_2026-09.md` § "Design audit findings").
>
> Last checked against the code: **2026-09-17** (C15, the blind audit's fix batch —
> `DESIGN_FIXES_2026-09.md`, C1–C14 — whose fourteen workers each wrote down the canon line their
> task changed; this pass applies them. Changed here: §2's `draw`, `live`, cup gold split and the
> player palette, §3's inset hairline and `CollapsibleCard`, §5b (new, the word list), §6's
> "see more" link, §7's confirm rule and the crown/ring lines, §8's `resultBadge`.)
> The previous full re-read was **2026-09-14** (A8, the Round 6 audit's canon pass — every
> claim below was re-read against the code it describes, and the ones that had drifted are
> corrected here rather than enforced against a practice that won on merit). Verified at that
> point: no retired surface class is defined or used, no raw Tailwind palette class outside
> `src/themes/`, `rounded-lg` only inside `SegmentedSwitch`, no arbitrary `rounded-[Npx]` and no
> arbitrary `text-[Npx]` except `NationFlag`'s two flag-glyph sizes (§5's own exception), and no
> hand-rolled `section-head` in `pages/stats`.

## 1. Principles

1. **One language, three layers.** Page → card → inset. Nothing nests deeper. No card inside a
   card inside a card, no chip used as a box.
2. **Flat and list-first.** Content is edge-to-edge rows with hairline dividers; cards are for
   grouping, not decoration. Whitespace separates, borders only where a surface needs an edge.
3. **Numbers are the hero.** Scores, points and records are big, tabular, unboxed. Everything
   around them is quiet.
4. **Semantic colour only through tokens.** Win/draw/loss, live, error/warn, positive/negative,
   status and accent come from theme variables so every theme (blue, dark, red, light, green)
   reads right — and each token means one thing, so nothing borrows a neighbour's (§2).
   Raw Tailwind palette classes (`text-amber-300`, `bg-red-500/15`, …) are forbidden in
   components.
5. **One icon set:** lucide-react. No Font Awesome.
6. **Native where the OS does it better** (selects → wheel picker on iOS, number inputs), custom
   where the OS looks foreign (menus, chips, tabs).
7. **Mobile first, desktop honest.** Layouts are designed at 390px; on desktop content stays in
   readable columns (`max-w-6xl`) and never stretches a two-name score across 1000px.

## 2. Tokens (`frontend/src/themes/*.css`, mapped in `tailwind.config.cjs`)

Existing families stay: `bg-default / bg-card-outer / bg-card-inner / bg-card-chip`,
`text-normal / text-chip / text-muted`, `border-card-outer / -inner / -chip`, `accent`,
`btn-*`, `hover-*`, `status-*` (green = live/playing, blue = draft/scheduled, default = neutral).
**`--color-live` is red and that is not a contradiction**: `status-*` green describes a state on a
page the reader is already looking at ("this match is playing"), while `--color-live` is the
navigation's attention dot, which sits beside the unread badge and asks the reader to go somewhere.
Two jobs, two colours — don't "unify" them (C13 did, on a consistency argument that ignored what
the dot is for; reverted the same day on Roli's call).
`delta-up / delta-down`, gradients. (`--live-indicator` is gone: it was a private copy of
`--color-live` that `light.css` never overrode, so a light-theme live dot stayed red-500 on a
near-white page while the token beside it already knew better. `.live-dot` / `.live-ping` read the
token — A8.)
**`accent` means *selected***: an active tab, a segment, a chip, a sort arrow, the filter pill's
filtered state. It is not "press me" — a text link that leads somewhere is muted text + a chevron
(§6), and a real action is a `Button`. Three recovery/error affordances still paint accent text
(`MatchDetailPage`'s "Back", the tournaments list's "Create one.", push settings' "Dismiss"); they
are a known, listed exception, not the pattern (C14).

**New semantic tokens (defined in `defaults.css`, overridden in `light.css`):**

| Token | Tailwind | Meaning | Dark default | Light |
|---|---|---|---|---|
| `--color-win` | `text-win`, `bg-win/…` | a win for the focused side | `74 222 128` (green-400) | `21 128 61` (green-700) |
| `--color-draw` | `text-draw`, `bg-draw/…` | a draw | `253 224 71` (yellow-300) | `133 77 14` (yellow-800) |
| `--color-loss` | `text-loss`, `bg-loss/…` | a loss | `248 113 113` (red-400) | `185 28 28` (red-700) |
| `--color-live` | (no `text-live`/`bg-live` call sites) `.live-dot` / `.live-ping` only | the nav's **attention** dot — go and look; deliberately not the status green, non-text (3:1 floor) | `239 68 68` (red-500) | `220 38 38` (red-600, 4.05:1 on the bottom tab bar's own ground) |
| `--color-cup-gold` | (inline, via `cupColors.ts`, `cupColorVarForKey`) | the Lorbeerkranz's *text* colour (the holder's name, ≥4.5:1) | `251 191 36` (amber-400; green theme `245 208 90`) | `166 74 12` (dark amber) |
| `--color-cup-gold-mark` | (inline, via `cupColors.ts`, `cupMarkColorVarForKey`) | the Lorbeerkranz's *mark* colour (ring, crown disc, dot — non-text, ≥3:1; the holder's *name* keeps using `--color-cup-gold`) | `251 191 36` (amber-400, same as text) | `171 94 5` (custom amber; 4.07:1 on the page ground, 3.09:1 on its own `/0.22` crown disc — the binding floor, 3.43:1 on `/0.14`, 4.84:1 on white) |
| `--color-cup-green-dark` | (inline, via `cupColors.ts`) | the Bauernkranz's colour — **no text/mark split**, one value answers both jobs in both theme files | `21 128 61` (green-700) | `22 116 55` |
| `--player-solid-s` / `--player-solid-l` | (inline, via `trendsMath.ts`) | the player palette. `colorForIdx` spreads six hues round the wheel and emits `hsl(<hue> var(--player-solid-s) var(--player-solid-l))`; **the hue is the player's identity and is the same in every theme**, only saturation and lightness move | `72% / 72%` | `72% / 30%` |
| `--color-error` | `text-error`, `bg-error/10`, `border-error/40` | something failed, or is about to be destroyed | `248 113 113` (red-400) | `185 28 28` (red-700) |
| `--color-warn` | `text-warn`, `bg-warn/10`, `border-warn/40` | attention, but nothing failed | `251 191 36` (amber-400) | `146 64 14` (amber-800) |

Soft backgrounds are always the token at low alpha (`bg-win/15`, `bg-loss/15`), never a second
token. `delta-up`/`delta-down` stay for numeric deltas (ratings, form).
**A message is not a result** (A8). `win`/`draw`/`loss` answer "how did this match go", and each
has to stay readable *next to the other two* in a `W-D-L` run; `error`/`warn` answer "is anything
wrong", and each has to stay readable as a **sentence** on a card, on an `inset` and on its own
10% tint. Two jobs, two families: an error message, a denied permission, a failed load and the
body of a delete confirmation are `error`; a reconnecting socket and the "someone else changed
this" banner are `warn`. Nothing that is not a match result may reach for a result token, and
nothing that is not broken may reach for `error` — the connection indicator spent a release
painted `draw`, which is how this rule came to be written down. In the dark themes `error` still
resolves to the same red as `loss`, and `warn` shared amber-400 with `draw` until C11 moved `draw`
to yellow-300; a theme breaking such a coincidence is exactly what separate variables are for.
**A cup's colour is a token of its own** (`src/cupColors.ts` maps cup key → token): it is worn as
text (the holder's name), as a ring and as a dot, so it may never borrow a medal gradient or a
status colour, which move for other reasons.
**A mark and text are different jobs from the same cup** (C11): a mark (ring, crown disc, dot)
clears 3:1, the holder's name clears 4.5:1, so a cup token may split into `--color-cup-<x>` (text)
and `--color-cup-<x>-mark` (mark) where those two floors would otherwise collide — as the
Lorbeerkranz does, the light theme having darkened its gold to brown to make the *name* readable.
And where a badge or disc paints an icon **and** its own translucent fill from the same token, the
icon's contrast against **that fill**, not the plain page ground, is the floor to measure — the
same "measure it on the surface it is carried on" rule R3 states below for `draw`/`warn`.
**The player palette is a theme's job too** (C2): `colorForIdx` owns the six hues and the theme
owns their lightness, so a player's colour is the same hue everywhere and the theme never enters
JavaScript — the function stays pure and a theme switch repaints with no React commit. The floor
is the 3:1 non-text minimum against the *lightest* surface a player's mark sits on in that theme —
the blue theme's `chip` (where the blue hue is the weakest of the six), and white in light.

**Light theme, contrast (A6).** Light is not a tint of the dark palette: a colour picked to glow
on a near-black page is unreadable on a near-white one. So `light.css` restates every token that
carries *text* until it clears 4.5:1 **on the page ground** (`236 235 233` — the worst case, and
the surface most of these labels sit on), and a selected chip's own `bg-accent/15` tint counts as
part of that background:

| Token | Dark | Light | on the page ground |
|---|---|---|---|
| `--color-accent` | `59 130 246` (blue-500) | `29 76 214` | 3.09:1 → 5.77:1 (4.60:1 under `bg-accent/15`) |
| `--color-btn-text` | `255 255 255` on the teal `--color-btn-bg` | `12 10 9` | 2.49:1 → 7.94:1 (the 2.49 is what the dark teal *was* when A6 measured it; R3 below repaired it to 5.47:1. Light's own teal fill never moved) |
| `--color-cup-gold` | `251 191 36` | `166 74 12` | 1.90:1 → 4.89:1 |
| `--color-cup-green-dark` | `21 128 61` | `22 116 55` | 4.21:1 → 4.91:1 |
| `--color-error` | `248 113 113` (red-400) | `185 28 28` | 2.19:1 → 5.43:1 (5.45:1 on `bg-error/10`) |
| `--color-warn` | `251 191 36` (amber-400) | `146 64 14` | 1.84:1 → 5.95:1 (6.08:1 on `bg-warn/10`) |

The state tokens went one step further than `draw` did: `180 83 9` is 4.21:1 on the ground and
4.39:1 on a 10% tint, which A8 judged enough under a single numeral in a `W-D-L` run and not
enough under the two-line paragraph a warning is — so light's `warn` became amber-800. R3 found
the first half of that judgement wrong too and took `draw` to the same amber-800 (below), which
leaves the rule with one half: **whatever the token carries, measure it on the surface it is
carried on**, the page ground and its own tint included.

**Dark themes, the solid button (R3).** A6 fixed light's button by darkening its *label*, and
nobody re-ran the same test on the dark themes' own `--color-btn-bg`: white sat on teal-500 at
2.49:1, on blue-500 at 3.68:1 and on the red theme's softened red at 4.32:1 — the solid
button's label was the least readable text in the app. Shown both repairs rendered as real
buttons, Roli kept the white label and darkened the fill, so `defaults.css` is teal-700
(5.47:1), `blue.css` is blue-600 (5.17:1) and `red.css` is `200 35 50` (5.61:1).
`--color-hover-btn-bg` moves with each one **one step further down** (teal-800, blue-700,
`170 25 40`), because every old hover stepped *up* into a brighter shade and made the label
worse the moment a pointer touched it — measured, hovering used to drop the label to 1.86:1
(teal), 2.54:1 (blue) and 3.67:1 (red), i.e. *below* the resting fill it was already failing at.
So the rule the three now follow: **a hover moves away from the label's own luminance, never
toward it.** `light` has obeyed it all along in the other direction (dark ink, hover one step
lighter: 7.94 → 10.61), which is why its unchanged teal is right where it is.
`green` is untouched: its dark label on green-500 is already 6.54:1, and neither repair helps it
— keeping that label on a green-700 fill collapses to 2.97:1, and switching to white on green-700
gives 5.02:1, a downgrade bought with the loss of the theme's own colour. `--color-accent` is a
different token and did not move with the button, so in the red theme the two are no longer the
same red.

**Light theme, the result run (R3).** A6 stopped `win` and `draw` at "clears 4.5:1", and both
landed at exactly 4.21:1 — which the table above already records, and A8 already treated as not
enough for a sentence. It is not enough for a `W-D-L` run either: the three numerals are read as
one word, so the weakest of them sets the reading, and on their own `bg-*/15` badge (`ScoreLine`)
they measured 3.49:1, 3.48:1 and 4.25:1. All three go one step down — `win` `22 101 52`
(5.98:1 plain, 4.81:1 on its badge), `draw` `146 64 14` (5.95 / 4.76), `loss` `153 27 27`
(6.98 / 5.41). `loss` moved although it passed plain at 5.43:1: left where it was it became the
lightest of the three to the eye and the only one still failing on its badge. Two values
coincided differently after that — `draw` shared amber-800 with `--color-warn`, and `loss` no
longer shared red-700 with `--color-error`, which is tuned for sentences and stays. Both were
coincidences, not couplings: the families answer different questions (see above) and a theme may
split or join them freely.
A second step, **C11**, then took `draw` from amber-800 to **yellow-800** (`133 77 14`) to widen
its distance from `loss` (ΔE 21 → 33; 5.75:1 on the page, 4.64:1 on its own badge) — `warn` stays
at amber-800, so even that coincidence is gone. The dark themes' `draw` moved with it, to
**yellow-300** (`253 224 71`), because amber-400 was the same value as every cup mark and a drawn
score should not read as a trophy.

**Opacity is not a tone.** A token drawn at alpha (`text-text-muted/40`, `/60`, `/80`) is asking
the palette for a shade it does not have, and on the light theme's paper-white ground it buys
1.97:1, 2.96:1 and 4.72:1 — hierarchy paid for with legibility. Hierarchy is the type scale (§5),
the weight, and the three text tokens; **never a fraction of one of them.** So: no
`text-text-muted/<n>` anywhere (R3 removed the last seven), and a `·` between meta parts is
spacing, not a third tone — it inherits the muted line it sits in, or names the token where its
line is not muted. The alpha *backgrounds* are untouched and stay legal: `bg-win/15` and friends
are a tint of a surface, `bg-text-muted/60` is a dot whose word is next to it, and both are
measured against the surface behind them, not read as text.

## 3. Surfaces (three levels, `styles.css`)

| Class | Level | Use | Style |
|---|---|---|---|
| `card` | 1 | a standalone block on the page | `rounded-2xl p-3`, `bg-card-outer`, hairline `border-card-outer/55`, soft shadow |
| `inset` | 2 | a box *inside* a card or a page section: score panel, stat tile, sub-panel, list block | `rounded-xl p-3`, `bg-card-chip/50` (light: `bg-card-inner` + a `border-card-inner` hairline, drawn as an inset shadow so the box is the same size in every theme — C3), no shadow |
| `chip` | 3 | inline tag/pill/badge | `rounded-full px-2.5 py-1 text-xs`, `bg-card-chip`, hairline |
| `divider` / `list-divided` | — | hairlines between rows | unchanged |

Retired and **deleted** (DS1 + DS3, 2026-09-13): `card-outer`, `card-inner`, `card-inner-flat`,
`card-subtle`, `card-chip` (as a box), `panel`, `panel-subtle`, `panel-inner`, `surface`,
`surface-2`, `hairline`, `hairline-b`, `eyebrow`, `stack`, `stack-tight`, `modal-shell`,
`sheet-shell`, `nav-link*`, `main-nav-*`, `subnav-*`, `page-slide-*`, `symbol-margin-to-text`,
`accent-text`, `text-subtle`, `page-x-bleed`, `pill-green`, `accent`, `icon-button`.
`Card` takes `variant="card" | "inset" | "none"`; `CollapsibleCard` has no surface of its own —
its one use, the clubs list, lays its groups flat on the page (C8); `CardSection` **is** an `inset` — it takes an optional `title`
and `actions` (rendered as one `text-sm font-semibold` row, §6), `padded` (off ⇒ `p-0`, for a box
whose children bring their own padding) and `className`, and nothing that would let it be a
different surface; `Modal` is always a `card` on a scrim. `card` and `inset` bring their own
`p-3` — write `inset p-0` (or `card p-0`) where the box's children already carry the padding (avatars,
collapsible headers, tight rows).

**Light theme, level 2 vs level 3.** In `light.css` `--color-bg-card-chip` is pure *white*:
right for a `chip` or an input on the grey page, wrong for an `inset`, which would then be
white on a white `card`. So in light an `inset` is `--color-bg-card-inner` (247 246 245) with
a `--color-border-card-inner` hairline — separated both on a white card and on the grey page —
while `chip`, `.input-field` and `.select-field` stay white. Dark themes are unaffected
(`bg-card-chip/50`, no border). **That hairline is an inset `box-shadow`, never a `border`**
(C3): a border adds to the box, so light pages stood 2 device px taller per inset than the same
page in a dark theme (measured: dashboard +8, ideas +6, live overview +10, match detail +18,
stats/player +20). A shadow paints inside the box and changes nothing but the pixels. An `.inset`
that also carries a real `border` class (`PlayerStreakChips`' record state) drops the shadow, so
the two never draw as adjacent rings.

## 4. Radius, spacing, elevation

- Radius scale: `rounded-2xl` (16px) cards and modals · `rounded-xl` (12px) insets, buttons,
  inputs, segmented controls · `rounded-full` chips, pills, avatars, dots. `rounded-md` (6px)
  only for the two micro-tile grids — the positions grid (tiles, legend swatches and legend
  examples) and the H2H matrix cells, which are the same thing at nearly the same size, both
  sized by `pages/stats/microGrid.ts`: the matrix cell is a square that fills the width its
  box has left over (`matrixCellSize`, 44 at its tightest and 56 at its widest — R1b), the
  positions tile is 40×42 and gives up width — never height — only when the column count
  forces it, down to 32 (Q3).
  Never `rounded-lg`/`rounded-sm` — with **one exception**:
  `SegmentedSwitch` gives its segments and its sliding indicator `rounded-lg` (8px) inside
  the `rounded-xl` track, because a control nested in a 12px box with 4px of padding cannot
  repeat that radius without cutting the track's corners. Nothing else may use `rounded-lg`.
  An image that *is* a rectangle takes no radius rather than an off-scale one: `NationFlag`'s
  14×10.5px flag glyph used to carry `rounded-[2px]`, and the scale's smallest step (6px) would
  round it into a lozenge, so it is simply square (A8).
- Directional radii are for partial edges only and follow the scale of the box they belong to
  (`rounded-b-2xl` on a collapsible card's body, `rounded-t` on the positions grid's drag-over
  column, `rounded`/`rounded-r` on 2px accent bars and progress fills). Never use one to give a
  whole box an off-scale radius. A radius on a **pinned** surface is a hole in it: the positions
  header carried `rounded-t` at rest until Q3, and once it really stuck, the grid showed through
  its corner notches. A sticky band is a rectangle; the radius belongs to the state that draws a
  surface of its own (there, the drop ring).
- Spacing rhythm: `gap-2` inside rows, `gap-3` between elements, `space-y-3` inside cards **and
  between the blocks of a page column** (that is what `.page` is), `space-y-4` between the
  sections of a view that stacks several of them (the dashboard, a stats sub-view, a form),
  `space-y-5` only where those sections are themselves long lists and need the air (H2H's two
  sub-views, the match-history groups, the profile overview, a tournament's admin panel). Page
  padding via `--page-pad-x`. (The canon used to claim `space-y-5` "between page sections"; it
  was never that — A8.)
- **Page rhythm (T10).** A page's title row — back chevron · `h1` · meta · actions, `hidden
  lg:flex`, a fixed 2rem tall — belongs to `PageLayout` and sits *outside* the content column,
  so a phone starts every page at `main`'s padding alone (16px under the top bar; 72px from the
  top on desktop, title row included). A tabbed page's `SectionTabs` strip is therefore the
  **first block in the column on every page**, 44px tall, 12px above the block under it, with no
  header block of any kind above it; a page without a strip (dashboard) starts its first section
  at exactly the same offset. Pages do not style the strip — `SectionTabs` takes no `className`.
- **Sticky to the page, under the chrome (Q3).** A grid's column header pins to the *page*, not
  to a wrapper: a box with `overflow-x` set is a scroll container in **both** axes, so a header
  inside one is pinned to a box that never scrolls vertically — which looks exactly like not
  being sticky. Both micro-tile grids therefore fit their width (above) and mount their
  `overflow-x-auto` box **only** past the floor, where sideways scrolling is the honest answer
  and the header stops pinning with it. What it pins *to* is `ui/shell/useStickyTop.ts`: the
  measured height of `#app-top-nav` (57px on a plain phone, more under a notch, 0 on desktop
  where the bar is `lg:hidden`), and 0 while that bar is away — it auto-hides on scroll-down, so
  the header docks under it and rides to the top with it, sharing its `duration-300 ease-out-expo`.
  A pinned band must also be opaque across its whole width: grid gutters and corner radii are
  holes, and anything painted across the grid (the positions grid's cup lineage) shows through
  them — close them with a negative margin and matching padding, not with a lower z-index. The
  app's top bar is `z-30`; nothing that scrolls under it may go above `z-20`.
- Elevation: only `card` has a shadow. Floating elements that sit **over** the page — the filter
  pill, toasts, the notification popover — use `shadow-pop` + `backdrop-blur-md`.
- **The two nav bars are not floating elements: they are opaque (Q12).** `.nav-shell` paints
  `--color-bg-default` at full strength, with no `backdrop-filter` and no shadow at rest; the top
  bar is separated by its `border-b` and gains `shadow-pop` only once the page has scrolled, the
  bottom bar by its `border-t` alone. They were translucent until 2026-09-16, when an iOS update
  changed how Safari composites a blurred bar and made the page visible through them — measured on
  Roli's phone either side of the update, same CSS, different result. A bar the page slides under
  must not offer a view of what is under it.

## 5. Typography

Tailwind scale only: `text-xs` (12) meta/labels · `text-sm` (14) body/rows · `text-base` (16)
emphasised body · `text-lg` (18) card titles, names next to scores · `text-xl` (20) the page
`h1`, and only there (`PageLayout`'s desktop title row) · `text-2xl` (24) stat values ·
`text-4xl` (36) hero scores. (`text-3xl` has no callers: a hero score is `text-4xl` at every
width — A8.)
One extra utility `.text-micro` (10px, semibold) for text that is a *marker* rather than prose:
badges, superscript counters, unit captions (`pts`, `ppm`), fixed-width indicators (▲/▼, W/D/L letters) and the bottom tab bar's labels,
which do not fit at 12px. Never for a sentence or a value the reader must read carefully.
**No other arbitrary `text-[Npx]`** — except where the size *is* geometry rather than type
(`NationFlag` sizes the flag glyph itself in em).
Numbers: `tabular-nums` always. `font-mono` is for **fixed-width numeric tokens** — a number or
short code the reader scans down a column or reads as one token rather than as prose: date pills,
odds, `W-D-L` strings, `ppm`, ranks, the positions grid's tiles and legend, streak patches, and
the constants quoted inside an explainer (`K=24`, `1000`). Never for a sentence, a name or a
value that stands alone in running text. (The canon used to list only the first three — A8.)
Weights: `font-medium` default emphasis, `font-semibold` titles, `font-bold` numerals.

## 5b. Words

One word per quantity, split by the two jobs a label does. A *fixed-column line* (`RecordLine`)
and a *column header* take the abbreviation — `P`, `Pts`, `GD`, `PPM`, `G/M`, `GA/M`, `GD/M`,
`Elo`, `Win %`. A *tile* or a *chip* takes the word — `Played`, `Points` (as `Pts` in a chip
group), `Goal diff`, `Pts / match`, `Goals / match`, `Conceded / match`. A *unit after a number*
is lowercase — `pts`, `ppm`. A *count in prose* is `fmtCount(n, singular, plural)` and never a
hand-rolled ternary (the duo detail spelled its own and told a reader "1 games together" — A8);
pronoun and verb agreement (`it`/`them`, `is`/`are`, `was`/`were`) stays hand-rolled beside it.
A per-match average is `fmtAvg` and nothing else — `fmtPct` is gone and an inline `.toFixed(2)` is
not allowed back. `★` means a **club's** star rating and never a player's Elo. `×N` means
"tournaments held"; a tie says `N tied` and a per-mode count says `1v1: 4 · 2v2: 3`.
**Two names on one line** go through `joinNames` / `NAME_JOINER` (`utils/matchDisplay.ts`) —
`A / B`, spaced — and **nothing parses a joined name string back into an array**: stacking is
`ScoreLine`'s job (§8), so a 2v2 side is passed as an array, never as a string.
A score written in prose is an **en dash** (`3–1`); `RecordLine`'s `14:6` and the Goals tile are
GF:GA records, not scores. `…`, never `...`. `Login` is the noun (the label), "log in" the verb
(inside a sentence). Buttons, tabs and titles are **sentence case**. An empty state ends with a
full stop and names its thing ("No streaks yet.", never "None yet."). A state that is still
running is `current` (and wears `.chip`, not a status pill — it is not a match state); only the
open end of a **date range** is `now`. A profile door is `Open X's profile`.

## 6. Section headers

- Page-level flat section: `section-label` (uppercase, tracked, `text-xs`, muted) inside
  `section-head` (trailing hairline). An optional action (link, button, segmented switch) is
  the second child and carries `order-1`, so the hairline runs *between* label and action
  (`section-head::after` is a flex item at order 0).
- Inside a card or an `inset`: `<h2>` / `<h3>` with `text-sm font-semibold text-text-normal`,
  in a `flex items-center justify-between` row when it has an action or a trailing number.
  A card that *is* one entity (a cup, a player) may title itself `text-lg font-semibold`
  (§5 "card titles"); anything nested below that is `text-sm`.
- A label that names one control or filter group ("Mode", "Range", "League", "Columns") is a
  bare `section-label` next to its control — no `section-head`, no hairline.
- **A "see more" link is muted text + a chevron, never accent** (C14). One look, one class string
  — `inline-flex items-center gap-1 text-xs text-text-muted transition hover:text-text-normal`
  followed by `<ChevronRight size={14} />` (`pages/dashboard/StandingsPreviewCard.tsx` is the
  worked example; `inline-flex items-center gap-1` and `transition` are load-bearing, and there is
  no `font-medium`). A text link that does **not** navigate — an action like "Reset zoom" — takes
  the same muted text **without** the chevron: the icon is the navigation affordance, not part of
  the look. Accent belongs to the selected chip next to it (§2), so a "see more" that painted
  accent said "selected" to the same eye. A section with somewhere bigger to go may instead use a
  ghost `Button` as its `action` (the stats skeleton below) — what it may not be is a third look.

Never two of these for the same block. **No uppercase labels inside a card or an `inset`** —
uppercase is reserved for `section-label` and for a row of **column headers**: a real `<thead>`
(the stats table, a cup's per-player table) or the pseudo-`<thead>` line above a column-aligned
list built from rows rather than `<td>`s (the live Overview's mini standings). Those are a legend
for the columns under them, not a heading, and writing the same job two ways in two places is
worse than the rule they bend. A **group** heading inside a card — a league group in the club
picker, "Selected" / "Recent" — is not that: it is sentence case, `text-sm font-semibold
text-text-normal` (A8).

### Stats sub-view skeleton

Every stats sub-view (Table · Positions · Streaks · Records · Cups, Trends, H2H Players/Duos/
Matchup, Player) is built from the same block, so the sections read as one page:

```
  STREAK · LONGEST WIN RUN ───────────────  ← section-head + section-label (icon first)
  Most wins in a row without a loss.        ← optional one-line muted explainer (text-xs)
  1  Flo            2026-03 … 2026-05   7   ← rows: List/ListRow, ScoreLine or StatTile
  2  Roli           2026-06 … 2026-07   5
                              Show all  →   ← optional action, a ghost Button
```

- `frontend/src/pages/stats/StatsSection.tsx` **is** that block (`label`, `icon`, `explainer`,
  `action`, children). Never hand-roll a `section-head` inside a stats sub-view.
- **Category blocks** — a sub-view made of several equivalent groups (Streaks' four streak
  kinds, Records' titles / superlatives / longest runs) — are flat `StatsSection`s in a
  `grid gap-6 lg:grid-cols-2`, each with its own lucide icon, title, explainer and rows. They
  are *not* cards: on the page's own surface the hairline and the grid gap separate them
  (§1.2), and a card per group would box every number on the page.
- Rows are the shared primitives, never a local copy: a match row is `ScoreLine` (§8) with its
  meta line under it, a key number is `StatTile`, an identity is `AvatarCircle` + `PlayerLink`,
  and a played/W-D-L/goals/GD line is `RecordLine` — the duo detail spelled its own with `·`
  separators for a while and told you "1 games together" for its trouble (A8).
- The one `card` allowed inside a sub-view is the block that **names whose numbers these are** —
  the matchup's two-player header, the Player view's identity row. Everything under it is a
  `StatsSection` on the page's own surface, not a stack of cards (A8).
- One empty state (`EmptyState`) and one loading state (`InlineLoading label="Loading…"`) per
  sub-view; a block that is empty inside a filled sub-view renders a compact `EmptyState` in
  place of its rows.
- A truncated list says so in one muted `text-xs` line (`+N more`); a list with somewhere to go
  gets a ghost `Button` as the section's `action` instead.

## 7. Components canon (`frontend/src/ui/primitives/`)

| Need | Use | Notes |
|---|---|---|
| Actions | `Button` (`solid`/`ghost`, `sm`/`md`, `iconOnly`) | never raw `btn-base`/`icon-button` classes; in light themes a ghost button carries a hairline resting edge, because `bg-card-chip` is white there |
| Status tag | `Pill` (+ `statusMatchPill`/`statusPill`) | rounded-full, `chip` surface + status tokens |
| Single/multi choice | `Chip` / `ChipGroup` (`ui/primitives/Chip.tsx`) | `rounded-full border px-3 py-1.5 text-sm`; selected = `bg-accent/15 text-accent border-accent/40`, unselected = `bg-bg-card-chip/50` + a `border-border-card-chip/40` hairline (both states are the same height, and the hairline keeps an unselected chip visible on the light theme's white card). `chipClass()` is exported for the few triggers that cannot be a `Chip`. Replaces `ToggleChip` |
| 2–3 view modes | `SegmentedSwitch` | `rounded-xl` track, `h-8` `rounded-lg` segments (§4 exception), sliding indicator in `Chip`'s selected style, lucide icon nodes |
| Page sections | `SectionTabs` | underline tabs with edge fades |
| Filters | `FilterPill` (`ui/primitives/`) | the app's floating capsule, see §9. A page declares its groups (`filterGroup`) and owns their state; the pill owns everything else. `pages/stats/StatsFilterPill.tsx` is the stats page's two groups and nothing more (Q7) |
| Any score | `ScoreLine` | see §8 — the only way to render a score; `ScoreNumerals` is the bare numeral pair for a control that has to *speak* a score (the goal entry's side choice); `leftMark`/`rightMark` put one small symbol between a side's names and the score — the club crest in a score-only row (`ClubMark`, Q8/Q17) |
| Clubs under a score | `MatchSides` | badge + club, flag + league, stars; nothing but "No club" for a clubless side. A row with **no** club line — a score-only row — says it with `ClubMark` instead (§8), never with both. `stars="token"` folds the rating into the league line as `★ 3.5` instead of giving five glyphs a line of their own — one line less per row, and the two numbers then meet either side of the centre gap (the friendlies list, Q7) |
| A club beside a score | `ClubMark` (`ui/primitives/`) | one 16px `ClubBadge` for a side, plus the club's name `sr-only` and — for a side with no club — an inert 16px box that keeps the row's geometry. The **only** way a score-only match row names its clubs, and the same component on every one of them: the friendlies list in Compact, `MatchRowWithClubs` in Compact (Stats → Player, both profile lists, the H2H matchup, the H2H history modal, the match page's H2H panel) and `RecordsView`'s superlatives (Q17). It is passed to `ScoreLine` as `leftMark`/`rightMark` and never rendered on its own |
| Picking a club | `SelectClubsPanel` + `ClubPicker` (`ui/`) | one panel per match, a `card` behind a single "Clubs" disclosure that summarises both clubs (§9b, T9). Open, it holds the whole job in one bounded block: the two `ClubSlot`s (side players + crest, league, stars), then the star/league filters, then the dice + *Random matchup* row. A slot opens the `ClubPicker` sheet: search focused on open, the club this side already has pinned on top with its `ClubStarsEditor`, then recents, then league groups, crest + stars per row, one tap selects. The scoreboard above (`MatchOverviewPanel`/`MatchSides`) stays **read-only on every surface** |
| Writing a comment | `CommentComposer` (`pages/live/comments/`) | one chat row *inside* the feed's card, attached to its bottom edge behind a hairline and sticky, so it floats over the feed while reading and settles flush at the end (T3); scope + author are chips above the field, goal/shots swap the row in place. The guestbook's composer is the same row (`CommentSendRow`) at the end of its feed |
| Key number | `StatTile` | `inset` + `text-2xl font-bold tabular-nums` value + `text-xs` muted label |
| A row's record (`3P 3-0-0 14:6 GD +8`) | `RecordLine` | the only way to print played / W-D-L / goals / GD under a name. Fixed columns, not `·` separators: `recordWidths(rows)` once per list sizes every track to that list's widest value, so segment *k* starts at the same x in every row (T14). The separators survive as `sr-only` text; the on-screen gap is `gap-2`. `RecordNum` is the bare fixed-width numeral for a column outside the line. A real `<table>` (the stats table, the dashboard preview) already aligns its columns and does not use it |
| A list of one-line rows | `List` / `ListRow` | leading · title · subtitle · trailing, hairline separators, and the row's action as a **stretched overlay** (`absolute inset-0 z-0`) so `trailing` can hold its own buttons without nesting one control in another. Reach for it whenever the row fits that shape (players admin, tournaments, nav-ish lists) |
| A list of rows that carry a primitive | `list-divided` + the row the page writes itself | A `ScoreLine`, a `MatchSides` block, a `RecordLine` under a name, a two-line standings row: these are not "title + subtitle + trailing", and squeezing them through `ListRow`'s slots costs more than it saves — 13 files build their own rows and that is **correct** (A8). What is *not* optional is the mechanic: the container is `list-divided`, and an interactive row copies `ListRow`'s pattern exactly — `relative` row, one stretched `<button>`/`<Link>` (`absolute inset-0 z-0 rounded-xl focus-ring`) carrying an `aria-label` that names what it opens, the content `pointer-events-none relative z-10`, and any real control inside it `pointer-events-auto` above the overlay (`pages/live/MatchList.tsx` is the worked example, A6). Never `role="button"` on a `<div>`, never a hand-rolled keydown handler, never a button inside the row's own hit area |
| Empty / loading | `EmptyState`, `InlineLoading` (lucide `Loader2` spinner), `LoadingPlaceholder` |
| Overlay | `Modal` (card on scrim, full-screen sheet on mobile) | **The container owns the screen edge** (Q4). A `fixed` overlay escapes the `body` padding that clears a landscape notch, so the sheet's *positioning box* takes the insets itself — `bottom-safe-b left-safe-l right-safe-r`, plus `sm:top-safe-t` once it centres — and the card keeps its own `p-3` on top; the card is also clamped to `max-h-sheet` and scrolls, so a tall dialog's buttons can never end up off-screen. `ImageLightbox` does the same on its pan/zoom box (as `top/right/bottom/left`, not padding: `clientWidth` there *is* the fit maths) and the drawer (`MobileChrome`) pads itself `pt-safe-t pb-safe-b pl-safe-l`. An overlay root carries `style={{ margin: 0 }}`, because a page column's `> * ~ *` rule would otherwise hand it a 12px top margin and the scrim would miss the top of the screen. Never hand-spell `env(safe-area-inset-*)` in a class: the four `safe-t/r/b/l` spacing tokens (`tailwind.config.cjs`, §2) are the vocabulary, and they are 0px wherever a device has no inset. The mobile tab bar has its own token in the same place — `nav-clear`, the room you must leave above the screen's bottom edge *right now*, which is the bar's height normally and 0 while the keyboard is up (§9b, Q2/Q14). **A sticky page header floors at the top inset** the same way: `useStickyTop` returns `max(<measured bar height>, env(safe-area-inset-top, 0px))`, because with the auto-hiding bar away 0 is the top of the *window*, and on a notched phone that is the status bar's own strip (Q11). It is the one place `env()` is spelled outside the config — the other half of that `max()` is a measured number, which no class can carry — and the floor lives in the hook so a call site cannot forget it |
| Confirming an irreversible action | `ConfirmDialog` | a `Modal` with a title, a one-line subtitle saying what happens, then Cancel + **the verb** (never "OK"), all in sentence case. **Every** irreversible action asks first — a delete, an admin's too (A10; deleting is allowed even when real results hang off the row), and equally a logout, a reshuffle, a side swap or clearing a dirty form (C7). Never `window.confirm`. **The red block is not decoration and is not a mood:** the body *names what is lost* in the danger idiom (`border-error/40 bg-error/10 text-error`, the `error` token and never `loss`, because a deleted tournament is not a defeat — §2, A8) **iff the action deletes something that is stored** — a result, a comment, a message, a file, a whole entity. An action that is reversible by its own inverse, or that changes state without deleting (mark read, reopen a tournament, swap sides, reshuffle an unplayed order, discard what is only typed), carries **no** red block; its subtitle says how to undo it instead. A dialog that shows a `busy` state must pass `busyLabel` — the fallback is "Deleting…", and most of these are not deletes |
| Identity | `AvatarCircle`, `ClubBadge`, `NationFlag`, `CupOwnerBadge` (lucide `Crown`) | `AvatarCircle` is the only avatar, and it always wears a ring: a 1px neutral hairline by default (decoration — it gives the disc an edge on a white card as well as a dark page), or, given `cups`, a 2.5px ring in the cup's colour (a conic split for two). **Colour is the information and its tense is always "today"** (T15): a cup ring means this player holds that cup *right now* — `useCupHolders` is where that answer comes from. Historic ownership is never a ring. **One tense per screen:** the ring is worn only where the surface is about now — the Players page, a profile, the stats leaderboards (Table, Records, Streaks, Cups, the H2H matchup's header, Player) and the dashboard cups preview — H2H's own Players/Duos views render no avatars at all, though the canon used to list them (A8). **Inside a tournament** — its standings/results, the What-if table, its match lists, the Overview's blocks, and the Positions grid of past tournaments — every avatar keeps the neutral hairline, because that screen is about a past or ongoing event and a present-tense ring would read as "held it back then"; cup information there has exactly one carrier, the standings' `CupOwnerBadge` crown ("owned it going into this tournament"). Comment authors, guestbook entries and pickers get no cup marking at all. The ring is drawn inside the avatar's own box, so adopting it never moves the layout. **The crown is never drawn beside a ringed avatar** (C12): where the ring already says "holds it today", a `CupOwnerBadge` next to it says the same thing twice, so the badge was removed from the Players page and the profile header and a crown on a person now means exactly one thing — "owned it going into this tournament", in the standings. **A ring means "holds a cup" — except on a picker avatar, where it means "selected"** (`ui/primitives/AvatarButton`, `ring-2` accent, 6 pickers plus the friendly form's "None" slot). That is a deliberate, audited exception, not drift: no picker passes `cups`, so the two meanings can never meet on one disc, and re-ringing six pickers to prove a point is churn. Don't re-report it |
| Identity → profile | `PlayerLink` | the only way an avatar/name becomes a link; hugs its text, stops click/Enter from bubbling so a row keeps its own action, `decorative` for an avatar that duplicates the name link. Never nest it in another `<a>` |
| Stars | `Stars` (lucide `Star`/`StarHalf`, replaces `StarsFA`); `StarsToken` is the same rating as one glyph plus the number, for a row too dense to spend 80px per side on a picture |

## 8. Score display (`ScoreLine`)

Sizes `hero` (match panel), `md` (match rows in lists), `sm` (compact rows, mini standings).

```
   Flo          2 │ 1          Atzi        ← names hug the score (left name right-aligned)
                Live · 34'                 ← optional status line (hero only)
```

- Grid `[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3`; left names `text-right`, right
  names `text-left`, so the trio is centred and never spreads across the panel.
- Numerals `font-bold tabular-nums`: hero `text-4xl`, md `text-2xl`, sm `text-lg`; separator is
  a vertical hairline (`w-px h-[0.75em] bg-border-card-chip/70`), **no colon, no box**.
- Scheduled: numerals replaced by a muted `–` pair of the same size (`hero` and `md`); at `sm`,
  where a dash pair is too quiet to read, a single muted `vs`.
- Leader emphasis: leading side's names `text-text-normal font-semibold`, trailing side
  `text-text-muted`; equal → both normal.
- Focus result (rows with a focus player): `focus="left"|"right"` names the side, `result`
  the outcome; that side's numeral takes `text-win` / `text-draw` / `text-loss`; nothing else
  is coloured. Optional `resultBadge` prop renders a
  16px `W/D/L` letter chip on that side's outer edge, inside its names cell — so it stays
  next to the score on a wide row — on every row that has a focus result, in both densities: the
  letter is the result the colour alone cannot carry (C5).
- **The mode is not part of a match.** A match row or panel does not repeat `1v1` / `2v2`:
  the page around it says it (the tournament's meta pills — next to the desktop `h1`, and at the
  top of its Overview tab on a phone — or a friendly's mode switch) and a
  2v2 score stacks two names per side. `MatchOverviewPanel`'s `showMode` and
  `MatchHistoryList`'s `showModePill` are off by default and turned on only where one list
  genuinely mixes modes — the friendlies list and any history shown in Overall mode
  (profile matches, the H2H matchup, the H2H history modal, the positions grid).
- Names: hero `text-lg`, md `text-base`, sm `text-sm`; 2v2 stacks two lines.
- **In a list, the numerals hold a fixed column** (Q7). The trio is centred, so a `10`
  on one row and a `2` on the next widen the middle cell differently and the hairline
  walks down the page — 12px of drift in the friendlies list, measured, before it was
  fixed. `scoreDigits(goals)` once per list, its answer to every row's `digits`, and
  every score then sits at the same x: the same mechanism `recordWidths` gives
  `RecordLine` (T14), sized to that list's widest score and never wider. A single
  score — a hero panel, a preview — passes nothing; there is no column to keep.
- **The club stands between its names and the score, never inside the score** (Q8). A row that
  shows a score and nothing else names its clubs with one 16px `ClubMark` per side, passed as
  `leftMark` / `rightMark`. **Every** such row does, from the same component and by the same rule
  (Q17): the friendlies list in Compact, every Compact `MatchRowWithClubs` (Stats → Player, the
  profile's overview and Matches tab, the H2H matchup, the H2H history modal, the match page's
  H2H panel) and the Records superlatives. The switch is the row's own Compact/Details state, not
  a prop a caller can forget — a Details row has `MatchSides` and needs no mark. It rides the
  **inner** edge of that
  side's names, `gap-1.5` from them against the grid's `gap-3` to the numerals, so a 2:1 ratio
  says it belongs to the team and not to the score. (Q8 shipped it on the outer edge, reasoning
  that a scoreboard reads crest-team-score; Roli overruled that — *"i want the crests to sit
  between the result and names, not outside of names"* — and the crests then gain a column of
  their own, since their x no longer depends on how long the names are.) The fixed numeral column
  (`digits`) is centred in the grid and **cannot** move: the mark grows into the names' cell and
  pushes the *names* outward, 22px per side (measured identical to the pixel across 24 mixed rows
  at both widths, before and after). A 2v2 side spends no extra line — the mark is centred against
  both names. A side with no club keeps the slot as an inert 16px box, and on the inner edge that
  box is **load-bearing**: without it the row's names would sit 22px closer to the score than every
  other row's. A row that already carries a club line (Details, `MatchSides`) gets **no** mark: one
  club never wears two symbols on one row. Re-measured on all seven surfaces when the rule went
  app-wide (Q17): the mark is 16px, 6px from its own names and 12px from the numerals on every
  row at both widths, its vertical centre equals the numerals' to 0.00px on every 2v2 row, and
  **6336 score and row-height values compared before/after moved 0**. The mark takes its x from
  the numeral track, so on a list that also passes `digits` (friendlies) the crests hold one
  column per side, and on one that does not they drift with the score they hug.
- A control that previews a score (the goal entry's "which side scores") uses the exported
  `ScoreNumerals`, never a hand-written `1-0` string: same weight, same tabular figures, same
  hairline separator. The numeral that changes is emphasised, the other muted.
- **One panel surface everywhere (T8).** `MatchOverviewPanel` **is** an `inset` and has no
  `surface` prop to opt out of it: the dashboard preview, live Overview, live Current, the
  match-detail edit preview, the friendly form and the friendlies list's row editor all render
  the same box (marked `data-match-panel`). Where the panel is tappable, the tap target is a bare
  wrapper (`focus-ring block w-full rounded-xl`, or a stretched overlay behind it) — never a
  `card` around the panel; the block's title and its link belong in the `section-head` above it,
  like every other flat block. The one panel on a `card` is the match-detail "Result" editor,
  where the card groups the whole form: card → inset is the canon, and the translucent inset
  then paints ~5/255 lighter there than on the page (light themes are identical, the inset being
  opaque).
- Never wrap a `ScoreLine` in `card-chip`/borders. The hero panel (`MatchOverviewPanel`) is:
  meta line (`Match 1 · Leg 1` + status `Pill`) → `ScoreLine hero` → odds line
  (`text-xs text-text-muted font-mono`, only scheduled/playing) → two side columns with
  club badge + name (`text-sm`), flag + league (`text-xs muted`), stars **only when a club is
  set** (otherwise a muted "No club" line and nothing else). No `border-y` rules. Those two
  columns are `MatchSides` — the same block sits under the score in the live match list and
  the stats match history, and it hugs the centre gap exactly like the names do.

## 9. Floating filter pill

**The app's filter control, not the stats page's** (Q7). It is `ui/primitives/FilterPill`: a page
declares its groups — label, options, current value, the value that counts as unfiltered, and
whether the capsule shows that group as text or as an icon — and owns their state; the pill owns
the capsule, the popover, the placement, the accent state and the pulse. Two pages use it today:
Stats (Mode · Source) and the friendlies list (Mode · View). Anything that filters a list goes
here; nothing grows a filter row of its own.

**A display preference may share the control, but it is not a filter.** The friendlies list's
Compact/Details choice lives in the same popover — it belongs to "what this list shows", both
rows above the list had to disappear, and a second floating control would be one too many — but it
is declared `display`, so it never turns the pill accent and never claims the numbers on screen are
filtered.

Capsule `h-11 rounded-full` (≈118×44px with two groups) with `SlidersHorizontal` (16px) and the
current values as compact tokens, a 4px dot between them: text (`All` / `1v1` / `2v2`, `text-sm
font-semibold`) or a lucide icon (`Trophy` tournaments, `Layers` both, `Handshake` friendlies;
`Shrink` compact, `List` details). The glyphs are `aria-hidden` and the whole button carries one
`aria-label` (`"Mode: All, Source: Tournaments"`) — inside a single button, per-token `sr-only`
text concatenates into an unreadable name. It is a full 44px tap target because it is the **only**
way into the filters (T4): no inline "Filters" chip in the sub-view row, no second trigger anywhere.

It floats bottom-right (`right-4 bottom-nav-clear pr-safe-r`, `lg:right-6 lg:bottom-6`) at
`z-40`, above the mobile bottom tab bar and below modals. **It hides while the on-screen keyboard
is up** (`hide-on-keyboard`, §9b): it shares the bottom-right corner with a composer's send
button, and a filter is not what you came for mid-sentence. Tapping it opens an anchored popover
(`card` surface, portalled to `body`, 8px from the trigger, right edges flush) with one
`ChipGroup` per group; tap outside, Escape or a re-tap closes and focus returns to the trigger.
Only the groups the current section uses are shown; where none applies (Cups) nothing is rendered
at all.

Carrying the job alone, it states itself in three ways (S9, resized by T4):

- **Default state:** solid `bg-bg-card-outer` with a 2px `border-accent/45` accent edge and
  `shadow-pop`.
- **Filtered state** — any filter *the section actually uses* is off its default: the border goes
  `border-accent/70`, a soft `ring-2 ring-accent/20` halo appears, a small accent dot sits on the
  sliders glyph, and the token that is off default turns accent, so the pill says *which* filter
  is active. Exposed as `data-filtered` for tests.
- **First visit per session:** one short attention pulse (framer-motion scale, `data-pulse`,
  gated by `sessionStorage`), cancelled by the first tap and dropped under
  `prefers-reduced-motion`.

A page that carries the pill keeps `pb-16` so its last content row still clears the capsule when
the page is scrolled to the end (20px of air at 390px and at 1280px; 26px on the friendlies list,
whose last row is a score rather than a full-width block).

## 9b. Editing in place (pickers, composers, toolboxes)

An editor is not a section you unfold; it is the thing itself becoming editable.

- **The trigger names or shows what it edits.** Tapping a club slot opens that side's club
  picker; tapping a score opens the score control; a disclosure that hides a whole job names it
  and shows its current values ("Clubs · Bayern München · FC Barcelona"). Never a bare "edit"
  affordance next to a value it does not describe.
- **Don't scatter one job across two places.** Whatever a value needs to be edited — the value
  itself, its tools, its filters — belongs to one surface.
- **No disclosure around a feed or a single input.** A comment feed and its composer are the
  page; they are always open. Collapsibles are for *lists you browse* (league groups on the
  Clubs page).
- **A group of secondary editing controls may hide behind one disclosure** — and should, when
  leaving it open clutters the screen with tools the reader does not need (club filters,
  randomisers). Rules when you do: one trigger that names what is inside, one clearly bounded
  container so it is obvious what belongs to it, and **everything that job needs lives inside**,
  including the values being edited. A panel that hides the tools but sends you elsewhere to pick
  the value is worse than no panel — that is the one case where repeating a value on screen (the
  read-only scoreboard and the open editor) is correct.
  The worked example is `SelectClubsPanel` (T9): a `card` whose header row is the only trigger
  (icon + "Clubs" + both club names, or "Not set"), and whose body is slots → filters →
  randomisers, in that order, in one `sm:max-w-md` column. The container is a `card` precisely
  because its contents are level-2 (`ClubSlot`, `FilterSelect`): card → inset is the canon,
  inset → inset is not. It starts open where setting the value *is* the form's purpose (the two
  friendly forms) and closed where the value usually already exists (live match, match detail),
  and each surface remembers the reader's last choice in `localStorage`
  (`club_panel_open:<surface>`, the `match_list_view` idiom).
- **A feed and its composer are one card.** The composer is the card's last row, separated by a
  hairline and sticky, so it floats over the feed while you read and settles flush on the card's
  bottom edge at the end — never a second card floating next to the feed. Groups *inside* the
  feed (match blocks, day separators) are hairline-separated sections of that one card, not
  cards of their own, so the rows inside them stay level-2 `inset` (§1). The app has **two**
  feeds and they are built the same way: the tournament's comments and a profile's guestbook
  (`pages/profile/GuestbookSection.tsx`, A8) — one `card p-0`, a header row naming the feed and
  its count, the messages as `inset` rows, a reply flat and tighter on the card's own surface
  behind a `border-l-2 border-accent/25` rule (a reply inside an `inset` would be inset → inset,
  which §3 forbids), then the chat row on the bottom edge.
- **The keyboard owns the bottom of the screen.** Everything pinned there clears the mobile
  tab bar with the `nav-clear` token, never a hand-written `4.5rem` — and that token is **0 while
  the on-screen keyboard is up**, because the bar is hidden then (`<html data-keyboard-open>`,
  `ui/shell/keyboardOpen.ts`, Q2). A composer's sticky offset, the filter pill, the error toast
  **and the page's own end padding** (`AppShell`, Q14) therefore collapse in the same repaint, so
  nothing floats in a 72px gap over the keys and no page ends in 72px of room held for a bar that
  is not there. The page's end is the only one of them that is *document height*, and the browser
  clamps the scroll when a document gets shorter under a reader parked at its end — so that flip
  alone is bracketed by `ui/shell/bottomReservation.ts`, which records what the clamp took and
  pays it back when the room returns, and keeps it out of N2's per-entry scroll record meanwhile.
  Two surfaces hide with the bar (the bar itself, the filter pill) and one never does — the error
  toast, because an error you cannot see is worse than a filter you cannot reach.
- **Only the value a control writes may be prefilled.** A field means what it says: the goal
  entry's scorer is the footballer in the game, so it is never prefilled with a human player
  from this app. When a field is optional, say in one quiet line what happens if it stays
  empty.
- **An editor a row opens belongs under the row, full width — and that row carries no controls
  of its own.** A list row's action slot is `shrink-0` and sized for icon buttons, so a panel
  rendered into it is wider than the row and gets clipped; and a pair of buttons per row makes the
  rarest thing in a list its loudest (on the clubs page they took 141px of a 358px row, which is
  what truncated the club names). So the **row itself is the control** — §7's stretched overlay,
  with an `aria-label` that names what it opens and `aria-expanded` for its state — the editor
  renders *after* the row at the row's full width behind an accent rail
  (`border-l-2 border-accent/30`) instead of a surface of its own (so a panel inside it is still
  the one `inset`, §8), and **delete lives inside that editor**, behind `ConfirmDialog`. Two lists
  open an editor this way and they are built the same: the friendlies list
  (`pages/tools/FriendlyList.tsx`, Q7/Q8) and the clubs list (`pages/clubs/ClubList.tsx`, Q15).
  No chevron on such a row: that glyph promises navigation, and these rows expand. A viewer who
  may not edit gets **no** overlay, no `row-tap` and no `aria-expanded` — a row that is only text,
  never an affordance that does nothing.
- **Heavy choice → sheet.** Many options, search, filters: a `Modal` sheet (full screen on
  mobile), opened from the value, closing on pick.
- **Light input → always-visible row.** A text field with its send button sits at the bottom of
  the feed like a chat, never behind a button that reveals a form.
- **A send button belongs to whatever it posts.** The chat row welds it to the field because in a
  comment feed the field *is* the message. Where the field is one optional part of a form — the
  Ideas composer's `Details`, whose Post is enabled while it sits empty — the send is the form's
  own last row instead: the secondary action as an icon button, the primary filling the rest
  (the paired-actions rule below). The field above it is then a real field, not a one-line row
  that grows: `IdeaBodyField` (`pages/ideas/IdeaFields.tsx`) opens three lines high and grows
  with the text to eight, `resize-none`, because the placeholder asks for a paragraph and because
  a drag handle does not exist under a thumb (Q1). Anchored to the bottom edge, growing pushes
  the form up and never the send row down.
- **Controls that act on more than one side live with the container, not inside a per-side
  sheet.** Club filters, "random matchup" and the dice belong to the match card that owns both
  clubs; a sheet for side A must not be the only way to reach them.
- Paired actions get equal weight: two buttons in one row are the same height and share the
  width, unless one is genuinely secondary (then it is an icon button, and the other fills).

## 10. Navigation: back, the menu, and the one gesture

Everything that moves the reader backwards reads **one** model (`ui/shell/routeHierarchy.ts` →
`ui/shell/backNavigation.ts`, Q6, with the rule Q6b settled on the device). There is no second
opinion: no per-page `back` prop, no list of "detail" route patterns, no separate rule for the
drill-in that lives in a query param.

**Every location is one of two things.**

- A **destination** — anything the bottom bar, the sidebar or the drawer points at (Dashboard,
  Tournaments, Friendlies, Stats, Players, Clubs, Ideas, Settings), plus `/login` and any URL that
  matched nothing. Destinations are siblings laid out in a bar, not rungs of a ladder.
- Somewhere you went **into** — a tournament, a match, a profile, the stats matchup. Each has a
  **parent**, and the parent never depends on how you arrived:

  | Inside | Parent |
  |---|---|
  | `/live/:id/match/:mid` | `/live/:id`, on the tab it was opened from |
  | `/live/:id` | `/tournaments` |
  | `/profiles/:id` and `/profile` | `/players` |
  | `/stats…&vs=…` (the matchup) | the same URL without `vs`/`rel` |

**The rules.**

1. **A back affordance appears on a page you went into, and nowhere else.** One question,
   `useBack().hasBack`, asked by the mobile top bar and by `PageLayout`'s desktop title row. A
   chevron on a tab destination would read "the screen before" and mean "the dashboard"; the bar
   holding every sibling is already on screen.
2. **Back returns the reader to the page they came from.** On a page you went into it **pops**
   whenever the entry behind is that page — the parent you walked in from, or whatever drilled in
   here (a match page's "All matches" opens the matchup; back returns to the match page, T11).
   Popping is free and it is better: that page comes back with its scroll offset, its open tab and
   its data.
3. **Except after a jump**, where back means **one level up**. Tapping a nav destination is not
   walking into something, it is teleporting: "Tournaments" that lands on the tournament U6
   remembered goes up to the **tournaments list**, not back out into the destination you were in
   before (N1). Arriving from nowhere is the same case — a cold deep link, a push notification, a
   restored session — and so is an arrival the app cannot vouch for. Up is a **`replace`**,
   consuming the page being left the way a native stack pops, so walking up a deep link never grows
   history and a ladder can never ping-pong.

   A jump and a drill-in are **indistinguishable afterwards** — the entry behind sits in another
   part of the app either way — so the difference is **recorded when the navigation is made** and
   never inferred by comparing the two URLs. Every nav-destination link carries `NAV_JUMP_STATE`
   (the bottom bar, the sidebar, the drawer, "Live now" — all built by `useDestinationLinks`), plus
   the few in-page controls whose whole promise is *leaving* the page they sit on ("Save and
   return", "Cancel"). `navStack` stores the answer against the history entry, where a `?tab=`
   replace cannot wipe it. Anything it does not know is treated as a jump: back goes up, which is
   never a wrong page — only a lost scroll offset.
4. **On a destination there is no up**, so back is the history step you took to get here — the
   sibling move the browser's own button and the iOS edge make too. There is nothing deeper to
   leave, so the arrival kind does not enter into it. With nothing behind it, it goes home; at home
   with nothing behind it, it does nothing. Back never ejects the reader from the app.
5. **Back and the menu coexist, inside a frame that never moves** (Q13). The phone's top bar is one
   row of three boxes: two side boxes of the **same fixed width** (`w-top-bar-side`, 84px — the
   left cluster, menu 40 + gap 4 + back 40) with the title between them, so the title's centre is
   the *screen's* centre on every page, with back and without it, with the bell and without it. The **menu owns the left screen
   edge** and never moves; **back appears inboard of it**, in space that is reserved whether or not
   it is there — `[≡] [‹] · Title · [bell]`. The chevron never *replaces* the hamburger, so Clubs,
   Ideas and Settings stay reachable without leaving the page first. The right box holds **one**
   control at a time: the notification bell, or the connection marker while the socket is in
   trouble (`TopBarStatus`) — never both, because a chip of text there is a variable width and a
   variable width moves the title. Back took the screen edge until 2026-09-16, and pushed the menu
   *and* the title a different distance on every page; that is what this frame replaced.
6. **One gesture: swipe right.** It does not imitate back, it *is* back — the same call, so a tap
   and a swipe can never land in different places. **There is no forward gesture**: nothing in the
   OS this app imitates has one, and an invisible gesture available a minority of the time only
   turns ordinary left drags into surprise navigation. The listeners are passive, so the iOS system
   edge-swipe is never fought.
7. **Anything horizontally draggable opts out** with `data-no-swipe-nav` — tables, matrices, chip
   rows, tab strips, charts, carousels — or a swipe past its scroll edge navigates. Range inputs and
   live horizontal scrollers are excluded automatically. This is not optional politeness: it is the
   price of having a global gesture at all.
8. **The browser's own back button is the browser's**, and it now agrees with the chevron almost
   everywhere: both walk the trail. The one place they part is after a jump, where the chevron goes
   up the hierarchy and the button pops back into the destination you came from — the browser's
   button is the *trail* and the chevron is the *promise the nav bar made*. On a cold deep link the
   button leaves the app, because there is nothing else behind it; the app's own back still goes up.
9. **A drill-in that swaps the whole body is a history step** (the matchup: a push). A lateral move
   between things that are all on screen is not (section tabs, sub-view chips, `?tab=`, filters —
   all `replace`). If it deserves a back affordance, it deserves an entry.

## 11. Do / Don't

- Do put one idea per card; don't stack a card inside a card.
- Do use `chip` for tags; don't use it as a container for numbers.
- Do colour a result through `text-win/draw/loss`; don't tint whole boxes red/green.
- Do keep names next to scores; don't push them to the panel edges.
- Do use `section-label` for flat page sections; don't invent new header styles.
- Do open an editor from the value it edits; don't scatter one job across two places.
- Do hide a *toolbox* behind one named disclosure; don't leave secondary tools on screen forever.
- Do use `ListRow` where a row is leading · title · subtitle · trailing, and `list-divided` +
  your own row where it carries a `ScoreLine` or a `RecordLine`; either way the row's action is a
  stretched overlay. Don't hand-roll `flex justify-between` rows with ad-hoc paddings, and never
  make a `<div>` a `role="button"`.
- Do say `text-error` / `text-warn` when something is wrong; don't borrow `text-loss` or
  `text-draw`, which mean a match went a certain way.
- Do ask before anything irreversible with `ConfirmDialog`, and keep the red block for what
  actually deletes stored data; don't use `window.confirm`, and don't let a non-delete say
  "Deleting…".
- Do say "see more" as muted text + a chevron; don't paint a text link accent — accent means
  *selected*.
- Do take a label from §5b's vocabulary and a count from `fmtCount`; don't invent a second word
  for a quantity you can already name.
- Do build hierarchy from size, weight and the three text tokens; don't draw text at a fraction
  of a token (`text-text-muted/40`) to make it quieter.
- Do let the page say the mode; don't print `1v1`/`2v2` on a match card that sits in a
  single-mode context.
- Do check `light` and `blue` themes for every visual change.
- Do let the box that touches a screen edge name its safe-area inset with the `safe-*` spacing
  tokens (`pb-safe-b`, `left-safe-l`, …); don't hand-spell `env(safe-area-inset-*)` in a class,
  and don't leave the job to the ten call sites of an overlay.
- Do clear the mobile tab bar with `nav-clear` — `bottom-nav-clear` on a floating surface,
  `pb-nav-clear` to reserve room at the end of a page; don't write its height into a class, don't
  leave anything floating over the keyboard, and don't hold room for a bar that is hidden.
- Do let `useBack()` decide whether a page has a back affordance and where it goes; don't hand a
  page its own back button, and don't add a second way out of one screen.
- Do mark a navigation that is *not* a drill-in with `NAV_JUMP_STATE` when you add one (a new nav
  entry point, a "done here" button); don't try to work out afterwards whether back should pop by
  comparing where the reader is with where they were.
- Do give any horizontally draggable element `data-no-swipe-nav`; don't assume the guard will
  notice it on its own.
