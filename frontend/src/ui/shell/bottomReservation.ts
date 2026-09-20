/**
 * The page's end reservation, and the scroll it owes back (Q14).
 *
 * `AppShell` ends every page with room for the bottom tab bar. Q2 left that room a
 * **constant** (`pb-nav-h`) while everything else the bar pushes up collapsed with it,
 * on purpose: the reservation is the one offset of the six that is *document height*
 * rather than a floating overlay, and removing 72px of document mid-sentence shortens
 * the scroll range under the reader. Roli found what that costs on the phone: with the
 * keyboard up the page still reserves 72px for a bar that is `display: none`, so a
 * composer at the page end sits in dead space and Safari scrolls further than it needs
 * to in order to reveal the field.
 *
 * So the reservation collapses now — and this module is the other half of that trade,
 * the bookkeeping that keeps the collapse from moving the page under the reader's thumb.
 *
 * ## What actually moves, and what cannot
 *
 * The reservation is padding at the **end** of the document. Taking it away moves no
 * element: everything above it keeps its document coordinates. The only thing that
 * changes is how far the page can scroll — and that matters in exactly one place:
 *
 * - **Anywhere above the last screenful** (the reader is mid-page): the scroll range
 *   shrinks below where they are standing. Nothing moves, nothing to compensate.
 * - **Parked at the very end** — which is where a composer puts you: `scrollY` *is* the
 *   maximum, the browser clamps it down by the reservation, and the content slides down
 *   by that much into the strip the reservation was holding. This is not avoidable by
 *   scrolling: the scroll that would hold the content still is the scroll that no longer
 *   exists. It is also the whole point — the strip it closes is the dead space Roli
 *   reported, and the composer comes down into it at every other scroll position too, as
 *   its own offset gives up the bar's room. (Q-D changed *what* that offset becomes — the
 *   strip the keyboard covers rather than 0, `pin-clear` rather than `nav-clear`, because
 *   sticky is pinned to the layout viewport — but not that it gives up the bar's room, and
 *   not this reservation, which is document height and still collapses to 0.)
 * - **A page shorter than the screen**: nothing scrolls, `main` is `flex-1` inside a
 *   `min-h-screen` column and stretches either way, so the reservation is absorbed and
 *   nothing moves at all.
 *
 * What *is* avoidable is the asymmetry. The clamp takes scroll away from the reader and
 * the browser never gives it back: when the keyboard goes and the reservation returns,
 * the document grows again but the scroll stays where the clamp left it, so every
 * keyboard visit at the end of a page walks the reader 72px up it for good. So the
 * collapse **records what the clamp took**, and the expansion **pays it back** in the
 * same style recalculation in which the room returns. The round trip is then the
 * identity: the page ends exactly where it started.
 *
 * ## The debt is only ours while the reader has not moved
 *
 * `anchor` is where the scroll was left standing when the clamp took it. If `scrollY`
 * is anywhere else, the reader (or Safari's own scroll-to-reveal, or a posted message
 * growing the feed) has moved the page since, that position is theirs, and the debt is
 * void — checked on every read, so there is no listener to order and nothing to go
 * stale.
 *
 * ## And it must never look like the reader's own position
 *
 * `useScrollRestoration` (N2) remembers an offset per history entry from `scroll`
 * events, and the clamp fires one like any other scroll. Recorded raw, it would be
 * saved as the place the reader chose to be, and coming back to the page later would
 * restore a scroll nobody chose. That is why `reservationScrollDebt()` is exported:
 * the restoration hook adds it back, so what it stores is always the offset in the
 * page's *full* coordinates — the ones it will have again the moment the keyboard goes.
 */

/** How much scroll the collapse took from the reader and has not given back yet. */
let debt = 0;
/** Where the scroll was left standing when we took it — the proof the debt is still ours. */
let anchor = 0;

/** Sub-pixel slack: the engine's own clamp may land a fraction off the arithmetic. */
const ANCHOR_TOLERANCE_PX = 2;

/**
 * Scroll the reservation's collapse took from the reader, and still owes back — `0`
 * whenever they have scrolled since, because then the position on screen is their own.
 *
 * Read by `useScrollRestoration`, which must record where the *reader* is rather than
 * where the clamp left them, and by the expansion below.
 */
export function reservationScrollDebt(): number {
  if (!debt) return 0;
  if (typeof window === "undefined") return debt;
  if (Math.abs(window.scrollY - anchor) > ANCHOR_TOLERANCE_PX) forgetReservationScrollDebt();
  return debt;
}

/**
 * Drop the debt unpaid.
 *
 * Called on every navigation: the offset was taken from a page that is no longer on
 * screen, and paying it into the next one would scroll a page the reader just opened.
 */
export function forgetReservationScrollDebt(): void {
  debt = 0;
  anchor = 0;
}

/**
 * Flip the flag that collapses (or restores) the page's end reservation, and settle the
 * scroll in the same turn.
 *
 * `flip` is the caller's own attribute write — it is handed in rather than done here so
 * that the measurement, the flip and the compensation are one synchronous block with no
 * frame in between for the browser to paint an intermediate state.
 */
export function applyBottomReservation(collapse: boolean, flip: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    flip();
    return;
  }
  const owed = collapse ? 0 : reservationScrollDebt();
  const before = window.scrollY;

  flip();

  // Reading the document's height forces the style + layout recalculation the flip just
  // caused, so the new scroll range is final here — before a paint, and without waiting
  // for the engine to clamp `scrollY` on its own schedule.
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  if (collapse) {
    const kept = Math.min(before, maxScroll);
    debt = Math.max(0, Math.round(before - kept));
    anchor = kept;
    return;
  }

  forgetReservationScrollDebt();
  if (owed <= 0) return;
  window.scrollTo({ top: Math.min(before + owed, maxScroll), left: 0, behavior: "auto" });
}
