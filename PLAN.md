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

## Phase 2 — Per-page reworks  (model: **Sonnet high**)

- [ ] **Tournaments list**: flatter, full-width rows, keep all current info
      (status, date, winner, cup stakes, unread).
- [ ] **Live tournament**: split **Current match** and **Standings** into
      separate sub-nav tabs (currently combined in Overview). Apply new
      SelectClubs. Keep real-time.
- [ ] **Friendlies**: full rework to the new list/section language; consistent
      with the rest.
- [ ] **Clubs**: streamline to the same patterns.
- [ ] **Player profile**: add sub-nav.
      - **Landing tab** = header image + avatar + title + about/bio **+ a recent
        activity feed** (recent matches/results, guestbook, pokes), **+ Rivals**
        (top opponents / nemesis) **+ Favorite teammates** (best 2v2 duos) and
        similar at-a-glance highlights.
      - Move **detailed stats** and the **full match list** to their own
        sub-pages/tabs (off the landing page).

## Phase 3 — Stats major refactor  (model: **Opus xhigh**)

- [ ] **Trends graph**: zoomable + horizontally scrollable; **month** ticks on
      the x-axis (density adapts to zoom); default range = last ~12 months
      (remove the "Show last" slider); optional **tournament-name** labels;
      non-participation shown clearly (gap markers, not just faded line); reuse
      the SAME chart on the dashboard (retire the old `TrendsPreviewCard`
      chart).
- [ ] **Table**: mobile-fit via **selectable columns** (chip toggles) with sane
      defaults; allow choosing totals **and** per-match averages; keep the
      selector uncluttered.
- [ ] **Positions tab (new)**: players in rows × tournaments (with names) in
      columns; mark laurel tournaments; horizontally scrollable.
- [ ] **H2H**: square matrix with **full player names**, equal cell size; plus a
      restored per-player detail (choose a player → opponents, nemesis/favorite,
      records, recent meetings) — re-incorporate the old H2H richness.
- [ ] **Streaks**: show dates nicely (start–end for concluded, "since X" for
      ongoing) without clutter.
- [ ] **Stars tab (restore)**: per-player performance by club star rating.
- [ ] Consistent **scrollable player pickers** across all stats views.
- [ ] **New stats page #1 — Records & superlatives**: biggest win, highest-
      scoring match, most goals in a tournament, longest win/unbeaten runs,
      biggest upset, etc.
- [ ] **New stats page #2 — Cup history / reigns**: who held each cup when,
      reign lengths, defenses, lineage of title changes.

## Phase 4 — Verification  (model: **Sonnet**)

- [ ] Playwright sweep 360/390 + 1280 across all routes; zero console errors.
- [ ] Swipe back/forward works; no conflict with tables/charts/chip rows.
- [ ] Feature parity vs. old (H2H detail, stars, all stats reachable).
- [ ] All 5 themes look right; both stats modes (new default + classic).
- [ ] `make test` + `npm run check` + build green.

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
