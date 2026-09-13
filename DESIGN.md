# Lorbeerkranz — Design Canon

> The single visual language for the app. Every page, primitive and worker task follows this
> file; when something here and the code disagree, the code is wrong. Companion to `AGENTS.md`
> (project knowledge). Created 2026-09-12 after a full audit of the frontend (see
> `FEATURES_2026-09.md` § "Design audit findings").

## 1. Principles

1. **One language, three layers.** Page → card → inset. Nothing nests deeper. No card inside a
   card inside a card, no chip used as a box.
2. **Flat and list-first.** Content is edge-to-edge rows with hairline dividers; cards are for
   grouping, not decoration. Whitespace separates, borders only where a surface needs an edge.
3. **Numbers are the hero.** Scores, points and records are big, tabular, unboxed. Everything
   around them is quiet.
4. **Semantic colour only through tokens.** Win/draw/loss, live, positive/negative, status and
   accent come from theme variables so every theme (blue, dark, red, light, green) reads right.
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
`delta-up / delta-down`, `live-indicator`, gradients.

**New semantic tokens (defined in `defaults.css`, overridden in `light.css`):**

| Token | Tailwind | Meaning | Dark default | Light |
|---|---|---|---|---|
| `--color-win` | `text-win`, `bg-win/…` | a win for the focused side | `74 222 128` (green-400) | `21 128 61` (green-700) |
| `--color-draw` | `text-draw`, `bg-draw/…` | a draw | `251 191 36` (amber-400) | `180 83 9` (amber-700) |
| `--color-loss` | `text-loss`, `bg-loss/…` | a loss | `248 113 113` (red-400) | `185 28 28` (red-700) |
| `--color-live` | `text-live`, `bg-live/…` | live/playing marker (= `--live-indicator`) | `239 68 68` | `220 38 38` (red-600, ≥4.5:1 as text on white) |

Soft backgrounds are always the token at low alpha (`bg-win/15`, `bg-loss/15`), never a second
token. `delta-up`/`delta-down` stay for numeric deltas (ratings, form).

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
`accent-text`, `text-subtle`, `page-x-bleed`, `pill-green`, `accent`. `Card`, `CardSection` and
`CollapsibleCard` take `variant="card" | "inset" | "none"`; `Modal` is always a `card` on a
scrim. `card` and `inset` bring their own `p-3` — write `inset p-0` (or `card p-0`) where the
box's children already carry the padding (avatars, collapsible headers, tight rows).

**Light theme, level 2 vs level 3.** In `light.css` `--color-bg-card-chip` is pure *white*:
right for a `chip` or an input on the grey page, wrong for an `inset`, which would then be
white on a white `card`. So in light an `inset` is `--color-bg-card-inner` (247 246 245) with
a `--color-border-card-inner` hairline — separated both on a white card and on the grey page —
while `chip`, `.input-field` and `.select-field` stay white. Dark themes are unaffected
(`bg-card-chip/50`, no border).

## 4. Radius, spacing, elevation

- Radius scale: `rounded-2xl` (16px) cards and modals · `rounded-xl` (12px) insets, buttons,
  inputs, segmented controls · `rounded-full` chips, pills, avatars, dots. `rounded-md` only for
  micro tiles (positions grid). Never `rounded-lg`/`rounded-sm` — with **one exception**:
  `SegmentedSwitch` gives its segments and its sliding indicator `rounded-lg` (8px) inside
  the `rounded-xl` track, because a control nested in a 12px box with 4px of padding cannot
  repeat that radius without cutting the track's corners. Nothing else may use `rounded-lg`.
- Spacing rhythm: `gap-2` inside rows, `gap-3` between elements, `space-y-3` inside cards,
  `space-y-5` between page sections. Page padding via `--page-pad-x`.
- Elevation: only `card` has a shadow. Floating elements (filter pill, toasts, bottom bar) use
  `shadow-pop` + `backdrop-blur-md`.

## 5. Typography

Tailwind scale only: `text-xs` (12) meta/labels · `text-sm` (14) body/rows · `text-base` (16)
emphasised body · `text-lg` (18) card titles, names next to scores · `text-2xl` (24) stat values
· `text-3xl`/`text-4xl` (30/36) hero scores. One extra utility `.text-micro` (10px, semibold) for
text that is a *marker* rather than prose: badges, superscript counters, unit captions
(`pts`, `ppm`), fixed-width indicators (▲/▼, W/D/L letters) and the bottom tab bar's labels,
which do not fit at 12px. Never for a sentence or a value the reader must read carefully.
**No other arbitrary `text-[Npx]`** — except where the size *is* geometry rather than type
(`NationFlag` sizes the flag glyph itself in em).
Numbers: `tabular-nums` always. `font-mono` only for date pills, odds and compact `W-D-L`
strings. Weights: `font-medium` default emphasis, `font-semibold` titles, `font-bold` numerals.

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
uppercase is reserved for `section-label` and for table column headers (`<thead>`).

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
  meta line under it, a key number is `StatTile`, an identity is `AvatarCircle` + `PlayerLink`.
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
| Single/multi choice | `Chip` / `ChipGroup` (`ui/primitives/Chip.tsx`) | rounded-full; selected = `bg-accent/15 text-accent ring-accent/40`; replaces `ToggleChip` |
| 2–3 view modes | `SegmentedSwitch` | `rounded-xl` track, `h-8` `rounded-lg` segments (§4 exception), sliding indicator in `Chip`'s selected style, lucide icon nodes |
| Page sections | `SectionTabs` | underline tabs with edge fades |
| Filters (stats) | `StatsFilterPill` | floating capsule, see §9 |
| Any score | `ScoreLine` | see §8 — the only way to render a score |
| Clubs under a score | `MatchSides` | badge + club, flag + league, stars; nothing but "No club" for a clubless side |
| Key number | `StatTile` | `inset` + `text-2xl font-bold tabular-nums` value + `text-xs` muted label |
| Lists | `List` / `ListRow` | hairline rows, stretched link |
| Empty / loading | `EmptyState`, `InlineLoading` (lucide `Loader2` spinner), `LoadingPlaceholder` |
| Overlay | `Modal` (card on scrim, full-screen sheet on mobile) |
| Identity | `AvatarCircle`, `ClubBadge`, `NationFlag`, `CupOwnerBadge` (lucide `Crown`) |
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
- Scheduled: numerals replaced by a muted `–` pair of the same size (hero) or `vs` (`sm`).
- Leader emphasis: leading side's names `text-text-normal font-semibold`, trailing side
  `text-text-muted`; equal → both normal.
- Focus result (rows with a focus player): `focus="left"|"right"` names the side, `result`
  the outcome; that side's numeral takes `text-win` / `text-draw` / `text-loss`; nothing else
  is coloured. Optional `resultBadge` prop renders a
  16px `W/D/L` letter chip on that side's outer edge, inside its names cell — so it stays
  next to the score on a wide row — for dense lists (Last 5, recent meetings).
- **The mode is not part of a match.** A match row or panel does not repeat `1v1` / `2v2`:
  the page around it says it (a tournament's header pill, a friendly's mode switch) and a
  2v2 score stacks two names per side. `MatchOverviewPanel`'s `showMode` and
  `MatchHistoryList`'s `showModePill` are off by default and turned on only where one list
  genuinely mixes modes — the friendlies list and any history shown in Overall mode
  (profile matches, the H2H matchup, the H2H history modal, the positions grid).
- Names: hero `text-lg`, md `text-base`, sm `text-sm`; 2v2 stacks two lines.
- Never wrap a `ScoreLine` in `card-chip`/borders. The hero panel (`MatchOverviewPanel`) is:
  meta line (`Match 1 · Leg 1` + status `Pill`) → `ScoreLine hero` → odds line
  (`text-xs text-text-muted font-mono`, only scheduled/playing) → two side columns with
  club badge + name (`text-sm`), flag + league (`text-xs muted`), stars **only when a club is
  set** (otherwise a muted "No club" line and nothing else). No `border-y` rules. Those two
  columns are `MatchSides` — the same block sits under the score in the live match list and
  the stats match history, and it hugs the centre gap exactly like the names do.

## 9. Floating filter pill (stats)

Capsule `h-9 rounded-full` with `SlidersHorizontal` (14px) and the current values as two compact
tokens: mode as text (`All` / `1v1` / `2v2`), source as a lucide icon (`Trophy` tournaments,
`Layers` both, `Handshake` friendlies) with `sr-only` label. Tapping opens an anchored popover
(above the pill, `card` surface) with two `ChipGroup`s (Mode, Source); tap outside or Escape
closes. Hidden where no filter applies.

## 10. Do / Don't

- Do put one idea per card; don't stack a card inside a card.
- Do use `chip` for tags; don't use it as a container for numbers.
- Do colour a result through `text-win/draw/loss`; don't tint whole boxes red/green.
- Do keep names next to scores; don't push them to the panel edges.
- Do use `section-label` for flat page sections; don't invent new header styles.
- Do prefer `ListRow`; don't hand-roll `flex justify-between` rows with ad-hoc paddings.
- Do let the page say the mode; don't print `1v1`/`2v2` on a match card that sits in a
  single-mode context.
- Do check `light` and `blue` themes for every visual change.
