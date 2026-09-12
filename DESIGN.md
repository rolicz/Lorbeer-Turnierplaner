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
| `--color-live` | `text-live`, `bg-live/…` | live/playing marker (= `--live-indicator`) | `239 68 68` | same |

Soft backgrounds are always the token at low alpha (`bg-win/15`, `bg-loss/15`), never a second
token. `delta-up`/`delta-down` stay for numeric deltas (ratings, form).

## 3. Surfaces (three levels, `styles.css`)

| Class | Level | Use | Style |
|---|---|---|---|
| `card` | 1 | a standalone block on the page | `rounded-2xl p-3`, `bg-card-outer`, hairline `border-card-outer/55`, soft shadow |
| `inset` | 2 | a box *inside* a card or a page section: score panel, stat tile, sub-panel, list block | `rounded-xl p-3`, `bg-card-chip/50` (light: `bg-card-chip` + hairline), no shadow |
| `chip` | 3 | inline tag/pill/badge | `rounded-full px-2.5 py-1 text-xs`, `bg-card-chip`, hairline |
| `divider` / `list-divided` | — | hairlines between rows | unchanged |

Retired (delete after migration): `card-outer`, `card-inner`, `card-inner-flat`, `card-subtle`,
`card-chip` (as a box), `panel`, `panel-subtle`, `panel-inner`, `surface`, `surface-2`,
`hairline`, `hairline-b`, `eyebrow`, `stack`, `stack-tight`, `modal-shell`, `sheet-shell`,
`nav-link*`, `main-nav-*`, `subnav-*`, `page-slide-*`, `symbol-margin-to-text`, `accent-text`,
`text-subtle`, `page-x-bleed`, `pill-green`. `Card`, `CardSection` and `Panel`-style
primitives map onto `card`/`inset`. Modals use `card` on a scrim.

## 4. Radius, spacing, elevation

- Radius scale: `rounded-2xl` (16px) cards and modals · `rounded-xl` (12px) insets, buttons,
  inputs, segmented controls · `rounded-full` chips, pills, avatars, dots. `rounded-md` only for
  micro tiles (positions grid). Never `rounded-lg`/`rounded-sm`.
- Spacing rhythm: `gap-2` inside rows, `gap-3` between elements, `space-y-3` inside cards,
  `space-y-5` between page sections. Page padding via `--page-pad-x`.
- Elevation: only `card` has a shadow. Floating elements (filter pill, toasts, bottom bar) use
  `shadow-pop` + `backdrop-blur-md`.

## 5. Typography

Tailwind scale only: `text-xs` (12) meta/labels · `text-sm` (14) body/rows · `text-base` (16)
emphasised body · `text-lg` (18) card titles, names next to scores · `text-2xl` (24) stat values
· `text-3xl`/`text-4xl` (30/36) hero scores. One extra utility `.text-micro` (10px, semibold) for
badges and superscript counters only. **No other arbitrary `text-[Npx]`.**
Numbers: `tabular-nums` always. `font-mono` only for date pills, odds and compact `W-D-L`
strings. Weights: `font-medium` default emphasis, `font-semibold` titles, `font-bold` numerals.

## 6. Section headers

- Page-level flat section: `section-label` (uppercase, tracked, `text-xs`, muted) inside
  `section-head` (trailing hairline). Optional actions on the right.
- Inside a card: `<h2 class="text-sm font-semibold">` in a `flex justify-between` row.
Never both for the same block. No uppercase labels inside cards.

## 7. Components canon (`frontend/src/ui/primitives/`)

| Need | Use | Notes |
|---|---|---|
| Actions | `Button` (`solid`/`ghost`, `sm`/`md`, `iconOnly`) | never raw `btn-base`/`icon-button` classes |
| Status tag | `Pill` (+ `statusMatchPill`/`statusPill`) | rounded-full, `chip` surface + status tokens |
| Single/multi choice | `Chip` / `ChipGroup` (`ui/primitives/Chip.tsx`) | rounded-full; selected = `bg-accent/15 text-accent ring-accent/40`; replaces `ToggleChip` |
| 2–3 view modes | `SegmentedSwitch` | rounded-xl track, sliding accent indicator, lucide icon nodes |
| Page sections | `SectionTabs` | underline tabs with edge fades |
| Filters (stats) | `StatsFilterPill` | floating capsule, see §9 |
| Any score | `ScoreLine` | see §8 — the only way to render a score |
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
- Focus result (rows with a focus player): the focus side's numeral takes `text-win` /
  `text-draw` / `text-loss`; nothing else is coloured. Optional `resultBadge` prop renders a
  16px `W/D/L` letter chip at the row's outer edge for dense lists (Last 5, recent meetings).
- Names: hero `text-lg`, md `text-base`, sm `text-sm`; 2v2 stacks two lines.
- Never wrap a `ScoreLine` in `card-chip`/borders. The hero panel (`MatchOverviewPanel`) is:
  meta line (`Match 1 · Leg 1 · 1v1` + status `Pill`) → `ScoreLine hero` → odds line
  (`text-xs text-text-muted font-mono`, only scheduled/playing) → two side columns with
  club badge + name (`text-sm`), flag + league (`text-xs muted`), stars **only when a club is
  set** (otherwise a muted "No club" line and nothing else). No `border-y` rules.

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
- Do check `light` and `blue` themes for every visual change.
