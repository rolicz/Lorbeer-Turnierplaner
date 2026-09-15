# Lorbeerkranz — Design Canon

> The single visual language for the app. Every page, primitive and worker task follows this
> file; when something here and the code disagree, the code is wrong. Companion to `AGENTS.md`
> (project knowledge). Created 2026-09-12 after a full audit of the frontend (see
> `FEATURES_2026-09.md` § "Design audit findings").
>
> Last checked against the code: **2026-09-14** (A8, the Round 6 audit's canon pass — every
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
`btn-*`, `hover-*`, `status-*` (green = live/playing, blue = draft/scheduled, default = neutral),
`delta-up / delta-down`, gradients. (`--live-indicator` is gone: it was a private copy of
`--color-live` that `light.css` never overrode, so a light-theme live dot stayed red-500 on a
near-white page while the token beside it already knew better. `.live-dot` / `.live-ping` read the
token — A8.)

**New semantic tokens (defined in `defaults.css`, overridden in `light.css`):**

| Token | Tailwind | Meaning | Dark default | Light |
|---|---|---|---|---|
| `--color-win` | `text-win`, `bg-win/…` | a win for the focused side | `74 222 128` (green-400) | `21 128 61` (green-700) |
| `--color-draw` | `text-draw`, `bg-draw/…` | a draw | `251 191 36` (amber-400) | `180 83 9` (amber-700) |
| `--color-loss` | `text-loss`, `bg-loss/…` | a loss | `248 113 113` (red-400) | `185 28 28` (red-700) |
| `--color-live` | `text-live`, `bg-live/…`, and `.live-dot` / `.live-ping` | live/playing marker | `239 68 68` (red-500) | `220 38 38` (red-600, ≥4.5:1 as text on white) |
| `--color-cup-gold` | (inline, via `cupColors.ts`) | the Lorbeerkranz's colour | `251 191 36` (amber-400; green theme `245 208 90`) | `166 74 12` (dark amber) |
| `--color-cup-green-dark` | (inline, via `cupColors.ts`) | the Bauernkranz's colour | `21 128 61` (green-700) | `22 116 55` |
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
painted `draw`, which is how this rule came to be written down. In the dark themes `error`/`warn`
resolve to the same red and amber as `loss`/`draw`; that is a coincidence a theme is free to
break, which is the point of their being separate variables.
**A cup's colour is a token of its own** (`src/cupColors.ts` maps cup key → token): it is worn as
text (the holder's name), as a ring and as a dot, so it may never borrow a medal gradient or a
status colour, which move for other reasons.

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
coincide differently now — `draw` shares amber-800 with `--color-warn`, and `loss` no longer
shares red-700 with `--color-error`, which is tuned for sentences and stays. Both are
coincidences, not couplings: the families answer different questions (see above) and a theme may
split or join them freely.

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
| `inset` | 2 | a box *inside* a card or a page section: score panel, stat tile, sub-panel, list block | `rounded-xl p-3`, `bg-card-chip/50` (light: `bg-card-inner` + a `border-card-inner` hairline), no shadow |
| `chip` | 3 | inline tag/pill/badge | `rounded-full px-2.5 py-1 text-xs`, `bg-card-chip`, hairline |
| `divider` / `list-divided` | — | hairlines between rows | unchanged |

Retired and **deleted** (DS1 + DS3, 2026-09-13): `card-outer`, `card-inner`, `card-inner-flat`,
`card-subtle`, `card-chip` (as a box), `panel`, `panel-subtle`, `panel-inner`, `surface`,
`surface-2`, `hairline`, `hairline-b`, `eyebrow`, `stack`, `stack-tight`, `modal-shell`,
`sheet-shell`, `nav-link*`, `main-nav-*`, `subnav-*`, `page-slide-*`, `symbol-margin-to-text`,
`accent-text`, `text-subtle`, `page-x-bleed`, `pill-green`, `accent`, `icon-button`.
`Card` and `CollapsibleCard` take `variant="card" | "inset" | "none"` (plus
`bodyVariant` on the collapsible); `CardSection` **is** an `inset` — it takes an optional `title`
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
(`bg-card-chip/50`, no border).

## 4. Radius, spacing, elevation

- Radius scale: `rounded-2xl` (16px) cards and modals · `rounded-xl` (12px) insets, buttons,
  inputs, segmented controls · `rounded-full` chips, pills, avatars, dots. `rounded-md` (6px)
  only for the two micro-tile grids — the positions grid (tiles, legend swatches and legend
  examples) and the H2H matrix cells, which are the same thing at the same size: the
  positions tile is a fixed 40×42, the matrix cell a square that fills the width its box
  has left over (`matrixCellSize`, 44 at its tightest and 56 at its widest — R1b).
  Never `rounded-lg`/`rounded-sm` — with **one exception**:
  `SegmentedSwitch` gives its segments and its sliding indicator `rounded-lg` (8px) inside
  the `rounded-xl` track, because a control nested in a 12px box with 4px of padding cannot
  repeat that radius without cutting the track's corners. Nothing else may use `rounded-lg`.
  An image that *is* a rectangle takes no radius rather than an off-scale one: `NationFlag`'s
  14×10.5px flag glyph used to carry `rounded-[2px]`, and the scale's smallest step (6px) would
  round it into a lozenge, so it is simply square (A8).
- Directional radii are for partial edges only and follow the scale of the box they belong to
  (`rounded-b-2xl` on a collapsible card's body, `rounded-t` on the positions grid's sticky
  header, `rounded`/`rounded-r` on 2px accent bars and progress fills). Never use one to give a
  whole box an off-scale radius.
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
- Elevation: only `card` has a shadow. Floating elements (filter pill, toasts, bottom bar) use
  `shadow-pop` + `backdrop-blur-md`.

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
| Filters (stats) | `StatsFilterPill` | floating capsule, see §9 |
| Any score | `ScoreLine` | see §8 — the only way to render a score; `ScoreNumerals` is the bare numeral pair for a control that has to *speak* a score (the goal entry's side choice) |
| Clubs under a score | `MatchSides` | badge + club, flag + league, stars; nothing but "No club" for a clubless side |
| Picking a club | `SelectClubsPanel` + `ClubPicker` (`ui/`) | one panel per match, a `card` behind a single "Clubs" disclosure that summarises both clubs (§9b, T9). Open, it holds the whole job in one bounded block: the two `ClubSlot`s (side players + crest, league, stars), then the star/league filters, then the dice + *Random matchup* row. A slot opens the `ClubPicker` sheet: search focused on open, the club this side already has pinned on top with its `ClubStarsEditor`, then recents, then league groups, crest + stars per row, one tap selects. The scoreboard above (`MatchOverviewPanel`/`MatchSides`) stays **read-only on every surface** |
| Writing a comment | `CommentComposer` (`pages/live/comments/`) | one chat row *inside* the feed's card, attached to its bottom edge behind a hairline and sticky, so it floats over the feed while reading and settles flush at the end (T3); scope + author are chips above the field, goal/shots swap the row in place. The guestbook's composer is the same row (`CommentSendRow`) at the end of its feed |
| Key number | `StatTile` | `inset` + `text-2xl font-bold tabular-nums` value + `text-xs` muted label |
| A row's record (`3P 3-0-0 14:6 GD +8`) | `RecordLine` | the only way to print played / W-D-L / goals / GD under a name. Fixed columns, not `·` separators: `recordWidths(rows)` once per list sizes every track to that list's widest value, so segment *k* starts at the same x in every row (T14). The separators survive as `sr-only` text; the on-screen gap is `gap-2`. `RecordNum` is the bare fixed-width numeral for a column outside the line. A real `<table>` (the stats table, the dashboard preview) already aligns its columns and does not use it |
| A list of one-line rows | `List` / `ListRow` | leading · title · subtitle · trailing, hairline separators, and the row's action as a **stretched overlay** (`absolute inset-0 z-0`) so `trailing` can hold its own buttons without nesting one control in another. Reach for it whenever the row fits that shape (players admin, tournaments, nav-ish lists) |
| A list of rows that carry a primitive | `list-divided` + the row the page writes itself | A `ScoreLine`, a `MatchSides` block, a `RecordLine` under a name, a two-line standings row: these are not "title + subtitle + trailing", and squeezing them through `ListRow`'s slots costs more than it saves — 13 files build their own rows and that is **correct** (A8). What is *not* optional is the mechanic: the container is `list-divided`, and an interactive row copies `ListRow`'s pattern exactly — `relative` row, one stretched `<button>`/`<Link>` (`absolute inset-0 z-0 rounded-xl focus-ring`) carrying an `aria-label` that names what it opens, the content `pointer-events-none relative z-10`, and any real control inside it `pointer-events-auto` above the overlay (`pages/live/MatchList.tsx` is the worked example, A6). Never `role="button"` on a `<div>`, never a hand-rolled keydown handler, never a button inside the row's own hit area |
| Empty / loading | `EmptyState`, `InlineLoading` (lucide `Loader2` spinner), `LoadingPlaceholder` |
| Overlay | `Modal` (card on scrim, full-screen sheet on mobile) |
| Confirming a delete | `ConfirmDialog` | a `Modal` whose body *names what is lost* (match count, the cups that move, a friendly's two sides and date) in the danger idiom — `border-error/40 bg-error/10 text-error`, the `error` token and never `loss`, because a deleted tournament is not a defeat (§2, A8) — then Cancel + the verb. **Every** delete confirms, an admin's too (A10) — deleting is allowed even when real results hang off the row. Never `window.confirm` for a destructive action |
| Identity | `AvatarCircle`, `ClubBadge`, `NationFlag`, `CupOwnerBadge` (lucide `Crown`) | `AvatarCircle` is the only avatar, and it always wears a ring: a 1px neutral hairline by default (decoration — it gives the disc an edge on a white card as well as a dark page), or, given `cups`, a 2.5px ring in the cup's colour (a conic split for two). **Colour is the information and its tense is always "today"** (T15): a cup ring means this player holds that cup *right now* — `useCupHolders` is where that answer comes from. Historic ownership is never a ring. **One tense per screen:** the ring is worn only where the surface is about now — the Players page, a profile, the stats leaderboards (Table, Records, Streaks, Cups, the H2H matchup's header, Player) and the dashboard cups preview — H2H's own Players/Duos views render no avatars at all, though the canon used to list them (A8). **Inside a tournament** — its standings/results, the What-if table, its match lists, the Overview's blocks, and the Positions grid of past tournaments — every avatar keeps the neutral hairline, because that screen is about a past or ongoing event and a present-tense ring would read as "held it back then"; cup information there has exactly one carrier, the standings' `CupOwnerBadge` crown ("owned it going into this tournament"). Comment authors, guestbook entries and pickers get no cup marking at all. The ring is drawn inside the avatar's own box, so adopting it never moves the layout |
| Identity → profile | `PlayerLink` | the only way an avatar/name becomes a link; hugs its text, stops click/Enter from bubbling so a row keeps its own action, `decorative` for an avatar that duplicates the name link. Never nest it in another `<a>` |
| Stars | `Stars` (lucide `Star`/`StarHalf`, replaces `StarsFA`) |

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
  next to the score on a wide row — for dense lists (Last 5, recent meetings).
- **The mode is not part of a match.** A match row or panel does not repeat `1v1` / `2v2`:
  the page around it says it (the tournament's meta pills — next to the desktop `h1`, and at the
  top of its Overview tab on a phone — or a friendly's mode switch) and a
  2v2 score stacks two names per side. `MatchOverviewPanel`'s `showMode` and
  `MatchHistoryList`'s `showModePill` are off by default and turned on only where one list
  genuinely mixes modes — the friendlies list and any history shown in Overall mode
  (profile matches, the H2H matchup, the H2H history modal, the positions grid).
- Names: hero `text-lg`, md `text-base`, sm `text-sm`; 2v2 stacks two lines.
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

## 9. Floating filter pill (stats)

Capsule `h-11 rounded-full` (≈118×44px with both filters) with `SlidersHorizontal` (16px) and the
current values as two compact tokens: mode as text (`All` / `1v1` / `2v2`, `text-sm font-semibold`),
source as a lucide icon (`Trophy` tournaments, `Layers` both, `Handshake` friendlies). The glyphs
are `aria-hidden` and the whole button carries one `aria-label`
(`"Mode: All, Source: Tournaments"`) — inside a single button, per-token `sr-only` text
concatenates into an unreadable name. It is a full 44px tap target because it is the **only** way
into the filters (T4): no inline "Filters" chip in the sub-view row, no second trigger anywhere.

It floats bottom-right (`right-4 bottom-[calc(4.5rem+safe-area)]`, `lg:right-6 lg:bottom-6`) at
`z-40`, above the mobile bottom tab bar and below modals. Tapping it opens an anchored popover
(`card` surface, portalled to `body`, 8px from the trigger, right edges flush) with two
`ChipGroup`s (Mode, Source); tap outside, Escape or a re-tap closes and focus returns to the
trigger. Only the groups the current section uses are shown; where neither applies (Cups) nothing
is rendered at all.

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

The stats root keeps `pb-16` so the last content row still clears the capsule when the page is
scrolled to the end (20px of air at 390px and at 1280px).

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
- **Only the value a control writes may be prefilled.** A field means what it says: the goal
  entry's scorer is the footballer in the game, so it is never prefilled with a human player
  from this app. When a field is optional, say in one quiet line what happens if it stays
  empty.
- **An editor a row opens belongs under the row, full width.** A list row's action slot is
  `shrink-0` and sized for icon buttons; a panel rendered into it is wider than the row and gets
  clipped. `MatchRowWithClubs` takes `expanded` for exactly this (the friendlies list's inline
  editor): it renders after the row, at the row's full width, behind an accent rail
  (`border-l-2 border-accent/30`) instead of a surface of its own — so the score panel inside it
  is still the one `inset` (§8).
- **Heavy choice → sheet.** Many options, search, filters: a `Modal` sheet (full screen on
  mobile), opened from the value, closing on pick.
- **Light input → always-visible row.** A text field with its send button sits at the bottom of
  the feed like a chat, never behind a button that reveals a form.
- **Controls that act on more than one side live with the container, not inside a per-side
  sheet.** Club filters, "random matchup" and the dice belong to the match card that owns both
  clubs; a sheet for side A must not be the only way to reach them.
- Paired actions get equal weight: two buttons in one row are the same height and share the
  width, unless one is genuinely secondary (then it is an icon button, and the other fills).

## 10. Do / Don't

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
- Do build hierarchy from size, weight and the three text tokens; don't draw text at a fraction
  of a token (`text-text-muted/40`) to make it quieter.
- Do let the page say the mode; don't print `1v1`/`2v2` on a match card that sits in a
  single-mode context.
- Do check `light` and `blue` themes for every visual change.
