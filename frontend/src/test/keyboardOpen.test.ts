import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  coveredStrip,
  installKeyboardWatcher,
  isEditableElement,
  isKeyboardOpen,
  keyboardConditions,
  keyboardInsetFrom,
  keyboardInsetPublished,
  keyboardOpenFrom,
  refreshKeyboardFlag,
  type KeyboardProbe,
} from "../ui/shell/keyboardOpen";

/** How long condition 3 waits before it believes "nothing moved" (`SETTLE_MS`). */
const SETTLE_MS = 600;

/** A caret in a field on a phone, the instant it landed: nothing known about the viewport yet. */
const CARET: KeyboardProbe = {
  editableFocus: true,
  viewportHeight: 844,
  scale: 1,
  caretArrival: null,
  layoutHeight: 844,
  offsetTop: 0,
};

/** The same caret, with the viewport remembered from before it arrived. */
const arrived = (p: KeyboardProbe, viewportHeight: number, ageMs = SETTLE_MS, fromRest = true): KeyboardProbe => ({
  ...p,
  caretArrival: { viewportHeight, ageMs, fromRest },
});

describe("keyboardOpenFrom", () => {
  it("says open because a text field has the caret — that is the rule", () => {
    expect(keyboardOpenFrom(CARET)).toBe(true);
    // …and stays open once the viewport has moved under it, whatever it moved to.
    expect(keyboardOpenFrom(arrived({ ...CARET, viewportHeight: 508 }, 844))).toBe(true);
  });

  it("needs the caret: no editable focus, no keyboard", () => {
    expect(keyboardOpenFrom({ ...CARET, editableFocus: false })).toBe(false);
    expect(keyboardOpenFrom({ ...arrived({ ...CARET, viewportHeight: 508 }, 844), editableFocus: false })).toBe(false);
  });

  it("does not measure the screen any more — no geometry can hold the flag down", () => {
    // Q2 shipped twice on "how much of the layout viewport is covered" and failed on the
    // device twice; the readings below are Roli's own (iOS 18.7, standalone PWA), plus the
    // case that used to be a deliberate miss. The keyboard was up in all of them.
    const readings: KeyboardProbe[] = [
      { ...CARET, layoutHeight: 956, viewportHeight: 568, offsetTop: 131 },
      { ...CARET, layoutHeight: 894, viewportHeight: 568, offsetTop: 222 },
      // A browser that resizes the layout viewport all the way with the keyboard: the old
      // rule computed "covered = 0" here and said closed.
      { ...CARET, layoutHeight: 508, viewportHeight: 508 },
      // What used to be "just a browser toolbar" (115px) and "an accessory bar" (55px).
      { ...CARET, viewportHeight: 729 },
      { ...CARET, viewportHeight: 789 },
    ];
    for (const r of readings) expect(keyboardOpenFrom(r)).toBe(true);

    // …and it is not five lucky numbers: over every height and every scroll position the
    // two readings can take, the answer is the caret's and nothing else.
    for (const layoutHeight of [956, 894]) {
      for (let viewportHeight = 100; viewportHeight <= layoutHeight; viewportHeight += 7) {
        for (let offsetTop = 0; offsetTop <= layoutHeight - viewportHeight; offsetTop += 11) {
          expect(keyboardOpenFrom({ ...CARET, layoutHeight, viewportHeight, offsetTop })).toBe(true);
        }
      }
    }
  });

  it("does not fire on a pinch, which shrinks the visual viewport the same way", () => {
    expect(keyboardOpenFrom({ ...CARET, viewportHeight: 422, scale: 2 })).toBe(false);
    // …and the keyboard is still detected at the scale rounding a zoom-disabled page shows.
    expect(keyboardOpenFrom({ ...CARET, scale: 1.02 })).toBe(true);
  });

  describe("the hardware-keyboard check (condition 3)", () => {
    it("puts the bar back when the viewport did not move at all", () => {
      // An iPad with a hardware keyboard: the caret is in a field, nothing came up.
      expect(keyboardOpenFrom(arrived(CARET, 844))).toBe(false);
    });

    it("asks whether anything happened, not how much — one pixel is enough", () => {
      expect(keyboardOpenFrom(arrived({ ...CARET, viewportHeight: 843 }, 844))).toBe(true);
      expect(keyboardOpenFrom(arrived({ ...CARET, viewportHeight: 845 }, 844))).toBe(true);
      // Sub-pixel jitter is not "something happened".
      expect(keyboardOpenFrom(arrived({ ...CARET, viewportHeight: 844.2 }, 843.9))).toBe(false);
    });

    it("gives the keyboard time to arrive before believing it", () => {
      expect(keyboardOpenFrom(arrived(CARET, 844, 0))).toBe(true);
      expect(keyboardOpenFrom(arrived(CARET, 844, SETTLE_MS - 1))).toBe(true);
      expect(keyboardOpenFrom(arrived(CARET, 844, SETTLE_MS))).toBe(false);
    });

    it("abstains when the height it would compare against was never measured at rest", () => {
      // A caret that was already in a field when the watcher started looking says nothing
      // about what the viewport looked like before it — so the caret has the last word.
      expect(keyboardOpenFrom(arrived(CARET, 844, SETTLE_MS, false))).toBe(true);
    });

    it("comes back the moment the viewport does move", () => {
      const settled = arrived(CARET, 844, 5_000);
      expect(keyboardOpenFrom(settled)).toBe(false);
      expect(keyboardOpenFrom({ ...settled, viewportHeight: 508 })).toBe(true);
    });
  });
});

describe("keyboardConditions", () => {
  // The diagnostics readout (`ui/layout/ViewportReadout.tsx`) shows these three answers on
  // the device, so they have to be the decision itself rather than a second copy of it.
  it("reports each condition and the numbers it was decided on", () => {
    const c = keyboardConditions(arrived({ ...CARET, viewportHeight: 508 }, 844));
    expect(c).toMatchObject({ editableFocus: true, scaleOk: true, onscreenKeyboard: true });
    expect(c.arrivalHeight).toBe(844);
    expect(c.viewportMoved).toBe(true);
    expect(c.settled).toBe(true);
    expect(c.maxScale).toBe(1.05);
    expect(c.settleMs).toBe(SETTLE_MS);
  });

  it("names the one condition that fails", () => {
    expect(keyboardConditions({ ...CARET, scale: 2 })).toMatchObject({
      editableFocus: true,
      scaleOk: false,
      onscreenKeyboard: true,
    });
    expect(keyboardConditions({ ...CARET, editableFocus: false })).toMatchObject({
      editableFocus: false,
      scaleOk: true,
      onscreenKeyboard: true,
    });
    expect(keyboardConditions(arrived(CARET, 844))).toMatchObject({
      editableFocus: true,
      scaleOk: true,
      onscreenKeyboard: false,
      viewportMoved: false,
      settled: true,
    });
    // Same numbers, still inside the settle window: the caret still has it.
    expect(keyboardConditions(arrived(CARET, 844, 10))).toMatchObject({
      onscreenKeyboard: true,
      viewportMoved: false,
      settled: false,
    });
  });

  it("has nothing to say about the layout viewport — that is evidence, not a condition", () => {
    const tall = keyboardConditions({ ...CARET, layoutHeight: 956, offsetTop: 222 });
    const short = keyboardConditions({ ...CARET, layoutHeight: 508, offsetTop: 0 });
    expect(tall).toEqual(short);
  });

  it("agrees with the flag's own test", () => {
    const probes = [
      CARET,
      { ...CARET, editableFocus: false },
      { ...CARET, scale: 2 },
      arrived(CARET, 844),
      arrived({ ...CARET, viewportHeight: 508 }, 844),
      arrived(CARET, 844, 10),
    ];
    for (const p of probes) {
      const c = keyboardConditions(p);
      expect(c.editableFocus && c.scaleOk && c.onscreenKeyboard).toBe(keyboardOpenFrom(p));
    }
  });
});

/**
 * Q-D: how far up a *sticky* row has to sit, which is a different question from whether a
 * keyboard is up at all.
 *
 * iOS re-anchors `fixed` boxes to the shrunken visual viewport — that is why the tab bar
 * rides onto the keyboard (Q2) — but a `sticky` box is pinned to the **layout** viewport,
 * which the keyboard does not shrink, so a composer stays at the bottom of it: underneath
 * the keys. The offset it needs is the strip of layout viewport below the visible one.
 *
 * `AGENTS.md` §10 bans this measurement as a **threshold** — as the way to decide that a
 * keyboard exists, which was wrong on the device twice. Here it decides nothing: the caret
 * rule has already said yes before it is asked, and it is never compared against a floor or
 * a ratio. The two functions are split precisely so that is visible in the tests below —
 * `coveredStrip` is the ruler, `keyboardInsetFrom` is the ruler behind the caret's gate.
 */
describe("the covered strip", () => {
  /**
   * Roli's own readings, iOS 18.7, standalone PWA, keyboard up (the same two as above),
   * each with the visible viewport it had before the caret — the whole screen — so the
   * keyboard has visibly arrived and the strip may be believed.
   */
  const REAL: Array<[KeyboardProbe, number]> = [
    [arrived({ ...CARET, layoutHeight: 956, viewportHeight: 568, offsetTop: 131 }, 956), 257],
    [arrived({ ...CARET, layoutHeight: 894, viewportHeight: 568, offsetTop: 222 }, 894), 104],
  ];

  it("is what lies below the visible viewport inside the layout one", () => {
    for (const [probe, expected] of REAL) {
      expect(coveredStrip(probe)).toBe(expected);
      expect(keyboardInsetFrom(probe)).toBe(expected);
    }
  });

  it("counts `offsetTop`, because that is how far iOS shifted the layout viewport up", () => {
    // Same visible height, same screen: only the shift differs, and the row it has to clear
    // differs with it. This is the term Q2 got wrong by putting it in a *decision*.
    expect(coveredStrip({ ...CARET, layoutHeight: 956, viewportHeight: 568, offsetTop: 0 })).toBe(388);
    expect(coveredStrip({ ...CARET, layoutHeight: 956, viewportHeight: 568, offsetTop: 131 })).toBe(257);
  });

  it("is 0 on a desktop browser, so the offset is a no-op rather than a special case", () => {
    expect(coveredStrip(CARET)).toBe(0);
    expect(keyboardInsetFrom(CARET)).toBe(0);
    // …and on a browser that resizes the layout viewport with the keyboard (Android), where
    // there is nothing below the visible area to lift the row out of.
    expect(keyboardInsetFrom({ ...CARET, layoutHeight: 508, viewportHeight: 508 })).toBe(0);
  });

  it("never returns a negative lift, whatever a mid-animation reading says", () => {
    expect(coveredStrip({ ...CARET, layoutHeight: 844, viewportHeight: 900 })).toBe(0);
    expect(coveredStrip({ ...CARET, layoutHeight: Number.NaN })).toBe(0);
    // Rounded: a sub-pixel lift is not a lift.
    expect(coveredStrip({ ...CARET, layoutHeight: 844.4, viewportHeight: 844 })).toBe(0);
    expect(coveredStrip({ ...CARET, layoutHeight: 844.6, viewportHeight: 844 })).toBe(1);
  });

  it("is a position, not a detection: a pinch measures large and lifts nothing", () => {
    // The whole of the ban in one assertion. Pinch-zoomed, the visual viewport is a third of
    // the layout one and the strip is huge — and no keyboard is up, so nothing may move.
    const pinched: KeyboardProbe = { ...CARET, viewportHeight: 422, scale: 2 };
    expect(coveredStrip(pinched)).toBe(422);
    expect(keyboardOpenFrom(pinched)).toBe(false);
    expect(keyboardInsetFrom(pinched)).toBe(0);
  });

  it("lifts nothing without a caret, and nothing behind a hardware keyboard", () => {
    // A desktop page with a horizontal scrollbar measures ~15px and must move no box.
    const scrollbar: KeyboardProbe = { ...CARET, editableFocus: false, layoutHeight: 859 };
    expect(coveredStrip(scrollbar)).toBe(15);
    expect(keyboardInsetFrom(scrollbar)).toBe(0);
    // An iPad whose viewport never moved when the caret arrived: condition 3 says no
    // keyboard, so whatever the strip measures is not a keyboard's.
    const hardware = arrived({ ...CARET, layoutHeight: 894 }, 844);
    expect(coveredStrip(hardware)).toBe(50);
    expect(keyboardInsetFrom(hardware)).toBe(0);
  });

  it("waits for the viewport to move before it believes what it measured", () => {
    // The flag goes up on the caret alone, before the keyboard has drawn anything, and at
    // that instant the strip is whatever was below the visible viewport already — a browser
    // toolbar. The row must not jump by that; the keyboard's own resize is what places it.
    const settling = arrived({ ...CARET, layoutHeight: 894 }, 844, 10);
    expect(keyboardOpenFrom(settling)).toBe(true);
    expect(coveredStrip(settling)).toBe(50);
    expect(keyboardInsetFrom(settling)).toBe(0);

    // …and the moment the viewport does move, the whole strip is the lift.
    const arrivedKeyboard = arrived({ ...CARET, layoutHeight: 894, viewportHeight: 508 }, 844, 10);
    expect(keyboardInsetFrom(arrivedKeyboard)).toBe(386);
  });

  it("never lifts a row the flag has not been raised for", () => {
    const probes = [
      CARET,
      { ...CARET, editableFocus: false },
      { ...CARET, scale: 2, viewportHeight: 422 },
      { ...CARET, editableFocus: false, layoutHeight: 859 },
      arrived(CARET, 844),
      arrived({ ...CARET, viewportHeight: 508 }, 844),
      arrived(CARET, 844, 10),
      arrived({ ...CARET, layoutHeight: 894 }, 844, 10),
      ...REAL.map(([probe]) => probe),
    ];
    for (const p of probes) {
      const lift = keyboardInsetFrom(p);
      if (!keyboardOpenFrom(p)) expect(lift).toBe(0);
      // Never more than what was measured, and never measured differently.
      expect(lift === 0 || lift === coveredStrip(p)).toBe(true);
    }
  });
});

describe("isEditableElement", () => {
  const make = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild;
  };

  it("counts the fields that open a keyboard or a keypad", () => {
    expect(isEditableElement(make("<input />"))).toBe(true);
    expect(isEditableElement(make('<input type="search" />'))).toBe(true);
    expect(isEditableElement(make('<input type="number" />'))).toBe(true);
    expect(isEditableElement(make("<textarea></textarea>"))).toBe(true);
    const rich = make('<div contenteditable="true"></div>') as HTMLElement;
    // jsdom does not implement `isContentEditable`; the property is what the code reads.
    Object.defineProperty(rich, "isContentEditable", { value: true });
    expect(isEditableElement(rich)).toBe(true);
  });

  it("counts nothing else — a wheel picker, a checkbox, a button, a read-only field", () => {
    expect(isEditableElement(make('<input type="date" />'))).toBe(false);
    expect(isEditableElement(make('<input type="checkbox" />'))).toBe(false);
    expect(isEditableElement(make('<input type="file" />'))).toBe(false);
    expect(isEditableElement(make("<button></button>"))).toBe(false);
    expect(isEditableElement(make("<div></div>"))).toBe(false);
    expect(isEditableElement(make("<input readonly />"))).toBe(false);
    expect(isEditableElement(make("<input disabled />"))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

/** A stand-in for the real thing: jsdom has no VisualViewport. */
class FakeVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  scale = 1;
  resizeTo(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
  /** The keyboard, as iOS reports it: a shorter visible window, shifted down the layout one. */
  shiftTo(height: number, offsetTop: number) {
    this.height = height;
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event("resize"));
  }
}

describe("the watcher", () => {
  let vv: FakeVisualViewport | undefined;
  let stop: (() => void) | null = null;
  let field: HTMLInputElement;
  let details: HTMLTextAreaElement;

  const setViewport = (v: FakeVisualViewport | undefined) => {
    vv = v;
    Object.defineProperty(window, "visualViewport", { value: v, configurable: true, writable: true });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    window.innerHeight = 844;
    setViewport(new FakeVisualViewport());
    field = document.createElement("input");
    details = document.createElement("textarea");
    document.body.append(field, details);
  });

  afterEach(() => {
    stop?.();
    stop = null;
    field.remove();
    details.remove();
    delete document.documentElement.dataset.keyboardOpen;
    document.documentElement.style.removeProperty("--keyboard-inset-bottom");
    vi.useRealTimers();
  });

  it("raises the flag the moment a field takes the caret, before any viewport event", () => {
    stop = installKeyboardWatcher();
    expect(isKeyboardOpen()).toBe(false);

    field.focus();
    expect(isKeyboardOpen()).toBe(true);

    // The keyboard arrives and the flag simply stays up.
    vv!.resizeTo(508);
    vi.advanceTimersByTime(SETTLE_MS + 100);
    expect(isKeyboardOpen()).toBe(true);
  });

  it("drops the flag when the caret leaves, after the keyboard's slide-away", () => {
    stop = installKeyboardWatcher();
    field.focus();
    vv!.resizeTo(508);
    expect(isKeyboardOpen()).toBe(true);

    field.blur();
    expect(isKeyboardOpen()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(isKeyboardOpen()).toBe(false);
  });

  it("keeps the bar hidden when the caret moves from the title field to the textarea under it", () => {
    // Roli's video, 2026-09-16: the title `<input>` hid the bar, the `<textarea>` directly
    // below it did not — same composer, same keyboard, one tap apart. The episode (and the
    // viewport height it started from) has to survive a blur and a focus in the same instant.
    stop = installKeyboardWatcher();
    field.focus();
    vv!.resizeTo(508); // the keyboard
    vi.advanceTimersByTime(SETTLE_MS + 100);
    expect(isKeyboardOpen()).toBe(true);

    details.focus(); // blur + focus, the keyboard never leaves
    expect(isKeyboardOpen()).toBe(true);
    // …and it is still up once the second field's own settle window has passed: the height
    // it compares against is the one from before the keyboard, not the keyboard's own.
    vi.advanceTimersByTime(SETTLE_MS + 100);
    expect(isKeyboardOpen()).toBe(true);
  });

  it("puts the bar back when nothing came up — a hardware keyboard — and hides it again if one does", () => {
    stop = installKeyboardWatcher();
    field.focus();
    expect(isKeyboardOpen()).toBe(true);

    // Nothing resizes. The bar comes back on its own, without any event.
    vi.advanceTimersByTime(SETTLE_MS + 100);
    expect(isKeyboardOpen()).toBe(false);

    // The iPad's on-screen keyboard, called up by hand: the viewport moves, the flag returns.
    vv!.resizeTo(508);
    expect(isKeyboardOpen()).toBe(true);
  });

  it("re-measures before dropping it, so a flapping focus does not flash the bar", () => {
    stop = installKeyboardWatcher();
    field.focus();
    vv!.resizeTo(508);
    field.blur(); // schedules the close…
    field.focus(); // …and the caret is back before it fires
    vi.advanceTimersByTime(250);
    expect(isKeyboardOpen()).toBe(true);
  });

  it("never raises the flag where the API is missing", () => {
    setViewport(undefined);
    stop = installKeyboardWatcher();
    field.focus();
    window.dispatchEvent(new Event("resize"));
    expect(isKeyboardOpen()).toBe(false);
  });

  it("clears the flag when it is torn down: a hidden tab bar must never outlive it", () => {
    const off = installKeyboardWatcher();
    field.focus();
    expect(isKeyboardOpen()).toBe(true);

    off();
    expect(isKeyboardOpen()).toBe(false);
  });

  it("clears the flag on a navigation, where a removed field may never fire focusout", () => {
    stop = installKeyboardWatcher();
    field.focus();
    expect(isKeyboardOpen()).toBe(true);

    field.remove();
    refreshKeyboardFlag(true);
    expect(isKeyboardOpen()).toBe(false);
  });

  /* Q-D: the lift the sticky composers are placed with, published beside the flag. */

  it("publishes the covered strip while the flag is up, and nothing while it is not", () => {
    stop = installKeyboardWatcher();
    expect(keyboardInsetPublished()).toBe(0);
    expect(document.documentElement.style.getPropertyValue("--keyboard-inset-bottom")).toBe("");

    window.innerHeight = 956;
    field.focus();
    // The caret alone hides the bar immediately — and lifts nothing, because the viewport
    // has not moved yet. That is the honest reading, not a miss.
    expect(isKeyboardOpen()).toBe(true);
    expect(keyboardInsetPublished()).toBe(0);

    // …then the keyboard arrives, exactly as Roli's phone reported it.
    vv!.shiftTo(568, 131);
    expect(keyboardInsetPublished()).toBe(257);

    field.blur();
    vi.advanceTimersByTime(250);
    expect(isKeyboardOpen()).toBe(false);
    expect(keyboardInsetPublished()).toBe(0);
    // Removed, not zeroed: the token's own fallback is what a page without a keyboard uses.
    expect(document.documentElement.style.getPropertyValue("--keyboard-inset-bottom")).toBe("");
  });

  it("follows the keyboard while it is up — the flag does not move, the lift does", () => {
    window.innerHeight = 956;
    stop = installKeyboardWatcher();
    field.focus();
    vv!.shiftTo(568, 131);
    expect(keyboardInsetPublished()).toBe(257);

    // The accessory bar goes (a taller visible window): the row comes down with it, under a
    // flag that never changed.
    vv!.shiftTo(612, 131);
    expect(isKeyboardOpen()).toBe(true);
    expect(keyboardInsetPublished()).toBe(213);
  });

  it("publishes nothing where no keyboard came up — a hardware keyboard lifts nothing", () => {
    window.innerHeight = 894;
    stop = installKeyboardWatcher();
    field.focus();
    // 894 − 844 = 50px of strip (a browser toolbar, say) with the caret in a field, and the
    // viewport never moves. Condition 3 takes the flag back and the lift with it.
    expect(keyboardInsetPublished()).toBe(0);
    vi.advanceTimersByTime(SETTLE_MS + 100);
    expect(isKeyboardOpen()).toBe(false);
    expect(keyboardInsetPublished()).toBe(0);
  });

  it("drops the lift on a navigation, where a removed field may never fire focusout", () => {
    window.innerHeight = 956;
    stop = installKeyboardWatcher();
    field.focus();
    vv!.shiftTo(568, 131);
    expect(keyboardInsetPublished()).toBe(257);

    field.remove();
    refreshKeyboardFlag(true);
    expect(keyboardInsetPublished()).toBe(0);
  });

  it("drops it when it is torn down: a lifted composer must never outlive the watcher", () => {
    window.innerHeight = 956;
    const off = installKeyboardWatcher();
    field.focus();
    vv!.shiftTo(568, 131);
    expect(keyboardInsetPublished()).toBe(257);

    off();
    expect(keyboardInsetPublished()).toBe(0);
  });
});
