# Redesign Plan — from TODO.md

Living plan. Work top-to-bottom; **check items off as they land**. Keep going
until every box is checked. Each phase: independently shippable, `npm run check`
+ build green, verified at 360/390px (mobile-first) and 1280px. Commit per step.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Design decisions (the "get it right" calls)

These set the language everything else follows.

- **Kill the card look → flat, list-first layout.** Replace nested
  `card-outer`/`card-inner` (heavy borders, shadows, double padding that eats
  horizontal space) with **edge-to-edge sections**: a small uppercase section
  label + content separated by **hairline dividers**, full page width, minimal
  side padding. Group with subtle background tint only where it adds clarity —
  never card-in-card. Denser, content-forward (think iOS settings / Linear).
- **One control language.** A single high-contrast selected state for all
  switches (adopt the `ChipGroup` pill style: accent fill + ring, or a
  segmented control with a strongly contrasted active pill). Restyle inputs &
  buttons to match. No more "which one is selected?" ambiguity.
- **Back nav = gesture, not a row.** Remove the `PageBack` row entirely (it
  starts its own line and wastes vertical space). Add a **global edge swipe**:
  swipe right → back, swipe left → forward, consistent everywhere; guard against
  horizontal scrollers (tables, chip rows, charts). A compact back chevron lives
  in the top bar on detail routes only.
- **One live indicator.** A single, clearly-labelled connection chip
  (dot + "Live"/"Reconnecting"/"Offline") in one place (the top bar, left-
  aligned near the title — not floating far right). Remove the duplicates in the
  Settings page and the sidebar drawer footer.
- **Consistent lists.** One shared `ListRow`/`List` pattern reused across
  tournaments, friendlies, clubs, players, matches; variants only where the data
  truly differs.
- **Consistent player picker.** One scrollable avatar strip (spread across the
  width, horizontally scrollable when many) used everywhere a player is chosen.
- **Consistent charts.** One chart component family used everywhere, incl. the
  dashboard (currently still the old `MultiLineChart`/`TrendsPreviewCard`).

---

## Phase 1 — Design system & consistency  (model: **Opus high/xhigh**) ✅

- [x] New flat-surface utilities (`stack`, `section-label`, `divider`, `row`) in
      `styles.css`; `List`/`ListRow` primitive replaces card-in-card lists.
- [x] Restyle primitives: `SegmentedSwitch` strong accent selected state;
      `Input`/`Button` focus + press polish (Textarea inherits input-field).
- [x] Redesign the **SelectClubs** control → `ClubCombobox` (searchable, compact,
      on-brand, portal so it's never clipped); reused via `SelectClubsPanel` on
      live current-game, match detail, friendlies create/edit.
- [x] Shared `List`/`ListRow` pattern + adopted on the players list (reference).
- [x] Single live-connection chip near the top-bar title; removed Settings +
      mobile-drawer duplicates (desktop sidebar keeps its single one).
- [x] Removed `PageBack`; contextual top-bar back (mobile) + inline desktop back
      chevron + global `useSwipeNav` (right=back, left=forward) wired in `AppShell`
      with horizontal-scroller / range-slider / `data-no-swipe-nav` guards.

## Phase 2 — Per-page reworks  (done on Opus xhigh) ✅

- [x] **Tournaments list**: flat full-width `ListRow`s (status bar + meta line +
      cup/unread), all info kept.
- [x] **Live tournament**: split into separate **Current** + **Standings** subnav
      tabs (Current only when a live/scheduled match exists; done → Results
      first). ClubCombobox applied; redundant section cards dropped; real-time
      intact; legacy `?tab=overview` deep links remapped.
- [x] **Friendlies**: nested cards removed; one flat Mode/View filter row; flat
      create form.
- [x] **Clubs**: flat filter row + flat divided club rows (meta line, no per-club
      panels).
- [x] **Player profile**: Overview / Stats / Matches / Guestbook sub-nav.
      - Landing = identity header + About + **Rivals** + **Favorite teammates**
        (best 2v2 duos, computed client-side) + recent matches.
      - Detailed stat chips/streaks → Stats tab; full match list → Matches tab;
        guestbook → its own tab (unread deep-link switches to it).

## Phase 3 — Stats major refactor  (done on Opus xhigh) ✅

- [x] **Trends graph**: new time-based `TrendChart` — zoomable + horizontally
      scrollable, adaptive **month** ticks (bold year marks), default **1-year**
      range (+ 2y/All chips, removed the "Show last" slider), optional
      **tournament-name** labels, gaps + event ticks for non-participation;
      **same chart reused on the dashboard**.
- [x] **Table**: selectable column chips (incl. PPM/G·M/GA·M averages) with sane
      mobile defaults — fits mobile without horizontal scroll.
- [x] **Positions tab (new)**: players × tournaments grid, laurel crowns,
      green→red placement coloring, horizontally scrollable.
- [x] **H2H**: full-name square matrix (equal cells) + restored per-player detail
      (picker → favorite/nemesis + full opponents breakdown) + top rivalries.
- [x] **Streaks**: date ranges (start–end concluded, "since X" ongoing).
- [x] **Stars tab restored**: PPM by club star rating.
- [x] Consistent scrollable `PlayerPicker` across stats views.
- [x] **New page — Records & superlatives**: biggest win, highest-scoring match,
      most goals by one side, biggest upset (by Elo), longest runs.
- [x] **New page — Cups**: current holder + reign length + full title-change
      history per cup.

## Phase 4 — Verification  ✅

- [x] Playwright sweep 390 + 1366 across all 11 routes × both stats modes —
      **zero console errors** (44 combinations).
- [x] Horizontal scrollers (tables, charts, matrices, pickers) opt out of swipe
      via `data-no-swipe-nav`; swipe back/forward wired globally. *(gesture itself
      best confirmed on a real touch device.)*
- [x] Feature parity: H2H per-player detail, Stars, all stats tabs reachable;
      classic stats still available via Settings → Experiments.
- [x] Light theme spot-checked (flat design reads correctly); both stats modes OK.
- [x] `npm run check` (typecheck + eslint + 71 tests) + `npm run build` green.
      No backend changes, so `make test` not required.

---

## Resolved with the user

1. New stats pages → **build both**: Records & superlatives **and** Cup history.
2. Player profile landing → header/avatar/title/about **+ recent activity feed**
   **+ Rivals + Favorite teammates** (and similar highlights); detailed stats and
   the full match list move to their own sub-pages.
3. Swipe-forward → standard (only when a forward history entry exists). ✔

## Notes
- Classic stats stays available via Settings → Experiments throughout.
- No backend/data-model changes expected; this is frontend design + stats UI.
