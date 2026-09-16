import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyBottomReservation, forgetReservationScrollDebt, reservationScrollDebt } from "../ui/shell/bottomReservation";

/**
 * The page, as far as this module can see it: a document of some height in a window of
 * some height, with the browser's own rule that a scroll cannot go past the end.
 *
 * `RESERVATION` is what `AppShell`'s `pb-nav-clear` adds to the document while the
 * bottom tab bar is there — the thing the keyboard takes away and gives back.
 */
const RESERVATION = 72;
const VIEWPORT = 844;
let contentHeight = 4290;
let reserved = true;
let scrollY = 0;

const docHeight = () => contentHeight + (reserved ? RESERVATION : 0);
const maxScroll = () => Math.max(0, docHeight() - VIEWPORT);

/** The flip a real `setFlag` hands in: the attribute write, and the layout it causes. */
const collapseReservation = () => {
  reserved = false;
  scrollY = Math.min(scrollY, maxScroll()); // the browser clamps as the document shortens
};
const restoreReservation = () => {
  reserved = true;
};

const scrollToMock = vi.fn((arg: number | ScrollToOptions) => {
  const top = Math.round(typeof arg === "number" ? arg : (arg.top ?? 0));
  scrollY = Math.max(0, Math.min(maxScroll(), top));
});

beforeEach(() => {
  contentHeight = 4290;
  reserved = true;
  scrollY = 0;
  scrollToMock.mockClear();
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: () => docHeight() });
  window.scrollTo = scrollToMock as unknown as typeof window.scrollTo;
});

afterEach(() => {
  forgetReservationScrollDebt();
});

describe("the page's end reservation (Q14)", () => {
  it("takes nothing from a reader standing above the last screenful", () => {
    scrollY = 1759;
    applyBottomReservation(true, collapseReservation);

    expect(scrollY).toBe(1759);
    expect(reservationScrollDebt()).toBe(0);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("records what the clamp took from a reader parked at the very end", () => {
    scrollY = maxScroll(); // 3518
    applyBottomReservation(true, collapseReservation);

    expect(scrollY).toBe(3446);
    expect(reservationScrollDebt()).toBe(RESERVATION);
  });

  it("gives it back in the same turn the room returns — the round trip is the identity", () => {
    scrollY = maxScroll();
    const parked = scrollY;
    applyBottomReservation(true, collapseReservation);
    expect(scrollY).toBe(parked - RESERVATION);

    applyBottomReservation(false, restoreReservation);
    expect(scrollY).toBe(parked);
    expect(reservationScrollDebt()).toBe(0);
  });

  it("pays it once: a second expansion scrolls nothing", () => {
    scrollY = maxScroll();
    applyBottomReservation(true, collapseReservation);
    applyBottomReservation(false, restoreReservation);
    scrollToMock.mockClear();

    applyBottomReservation(false, restoreReservation);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("voids the debt the moment the reader scrolls for themselves", () => {
    scrollY = maxScroll();
    applyBottomReservation(true, collapseReservation);
    expect(reservationScrollDebt()).toBe(RESERVATION);

    scrollY -= 300; // the reader scrolls up while typing
    expect(reservationScrollDebt()).toBe(0);

    applyBottomReservation(false, restoreReservation);
    expect(scrollY).toBe(3146);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("is dropped unpaid when the page it was taken from is left behind", () => {
    scrollY = maxScroll();
    applyBottomReservation(true, collapseReservation);
    forgetReservationScrollDebt();

    applyBottomReservation(false, restoreReservation);
    expect(scrollY).toBe(3446);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("has nothing to take on a page shorter than the screen", () => {
    contentHeight = 500;
    scrollY = 0;
    applyBottomReservation(true, collapseReservation);

    expect(scrollY).toBe(0);
    expect(reservationScrollDebt()).toBe(0);
    applyBottomReservation(false, restoreReservation);
    expect(scrollY).toBe(0);
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("is what keeps the clamp out of the scroll-restoration record", () => {
    // `useScrollRestoration` stores `window.scrollY + reservationScrollDebt()`, so the
    // offset it remembers is the one the reader chose — not the one the shortened
    // document left them at.
    scrollY = maxScroll();
    const chosen = scrollY;
    applyBottomReservation(true, collapseReservation);

    expect(window.scrollY).toBe(chosen - RESERVATION);
    expect(window.scrollY + reservationScrollDebt()).toBe(chosen);
  });
});
