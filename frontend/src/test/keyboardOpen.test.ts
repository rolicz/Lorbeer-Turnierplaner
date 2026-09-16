import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installKeyboardWatcher,
  isEditableElement,
  isKeyboardOpen,
  keyboardConditions,
  keyboardOpenFrom,
  refreshKeyboardFlag,
  type KeyboardProbe,
} from "../ui/shell/keyboardOpen";

/** A phone in portrait, nothing covering it. */
const PHONE: KeyboardProbe = { layoutHeight: 844, viewportHeight: 844, offsetTop: 0, scale: 1, editableFocus: true };
/** The same phone on its side. */
const LANDSCAPE: KeyboardProbe = { layoutHeight: 390, viewportHeight: 390, offsetTop: 0, scale: 1, editableFocus: true };

const covered = (base: KeyboardProbe, px: number): KeyboardProbe => ({ ...base, viewportHeight: base.layoutHeight - px });

describe("keyboardOpenFrom", () => {
  it("says open when a keyboard-sized strip is covered and a field has the caret", () => {
    // iPhone portrait keyboard ≈ 336px of 844.
    expect(keyboardOpenFrom(covered(PHONE, 336))).toBe(true);
    // Landscape ≈ 200px of 390.
    expect(keyboardOpenFrom(covered(LANDSCAPE, 200))).toBe(true);
  });

  it("does not fire for a browser toolbar or an accessory bar", () => {
    // iOS Safari's own chrome: ~115px in portrait, ~50px in landscape.
    expect(keyboardOpenFrom(covered(PHONE, 115))).toBe(false);
    expect(keyboardOpenFrom(covered(LANDSCAPE, 50))).toBe(false);
    // An iPad hardware keyboard leaves only its ~55px accessory bar.
    expect(keyboardOpenFrom(covered({ ...PHONE, layoutHeight: 1112, viewportHeight: 1112 }, 55))).toBe(false);
  });

  it("does not fire on a scroll: a panned visual viewport is not a covered one", () => {
    // The visual viewport moved down 200px; nothing is covering it.
    expect(keyboardOpenFrom({ ...PHONE, viewportHeight: 644, offsetTop: 200 })).toBe(false);
  });

  it("does not fire on a pinch, which shrinks the visual viewport the same way", () => {
    expect(keyboardOpenFrom({ ...PHONE, viewportHeight: 422, scale: 2 })).toBe(false);
    // …and the keyboard is still detected at the scale rounding a zoom-disabled page shows.
    expect(keyboardOpenFrom({ ...covered(PHONE, 336), scale: 1.02 })).toBe(true);
  });

  it("does not fire on a rotation, where both heights change together", () => {
    expect(keyboardOpenFrom(LANDSCAPE)).toBe(false);
    expect(keyboardOpenFrom(PHONE)).toBe(false);
  });

  it("needs the caret: no editable focus, no keyboard", () => {
    expect(keyboardOpenFrom({ ...covered(PHONE, 336), editableFocus: false })).toBe(false);
  });

  it("survives a zero-height viewport (a hidden tab) without hiding anything", () => {
    expect(keyboardOpenFrom({ ...PHONE, layoutHeight: 0, viewportHeight: 0 })).toBe(false);
  });
});

describe("keyboardConditions", () => {
  // The diagnostics readout (`ui/layout/ViewportReadout.tsx`) shows these three answers on
  // the device, so they have to be the decision itself rather than a second copy of it.
  it("reports each condition and the numbers it was decided on", () => {
    const c = keyboardConditions(covered(PHONE, 336));
    expect(c).toMatchObject({ editableFocus: true, scaleOk: true, coveredOk: true });
    expect(c.covered).toBe(336);
    expect(c.requiredCovered).toBeCloseTo(168.8);
    expect(c.maxScale).toBe(1.05);
  });

  it("names the one condition that fails", () => {
    expect(keyboardConditions({ ...covered(PHONE, 336), scale: 2 })).toMatchObject({
      editableFocus: true,
      scaleOk: false,
      coveredOk: true,
    });
    expect(keyboardConditions({ ...covered(PHONE, 336), editableFocus: false })).toMatchObject({
      editableFocus: false,
      scaleOk: true,
      coveredOk: true,
    });
    // The hypothesis this readout exists to test: a layout viewport that shrinks with the
    // keyboard leaves nothing covered, and condition 3 can never pass.
    expect(keyboardConditions({ ...PHONE, layoutHeight: 508, viewportHeight: 508 })).toMatchObject({
      coveredOk: false,
    });
  });

  it("agrees with the flag's own test", () => {
    for (const p of [PHONE, covered(PHONE, 336), { ...covered(PHONE, 336), scale: 2 }, LANDSCAPE]) {
      const c = keyboardConditions(p);
      expect(c.editableFocus && c.scaleOk && c.coveredOk).toBe(keyboardOpenFrom(p));
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
}

describe("the watcher", () => {
  let vv: FakeVisualViewport | undefined;
  let stop: (() => void) | null = null;
  let field: HTMLInputElement;

  const setViewport = (v: FakeVisualViewport | undefined) => {
    vv = v;
    Object.defineProperty(window, "visualViewport", { value: v, configurable: true, writable: true });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    window.innerHeight = 844;
    setViewport(new FakeVisualViewport());
    field = document.createElement("input");
    document.body.appendChild(field);
  });

  afterEach(() => {
    stop?.();
    stop = null;
    field.remove();
    delete document.documentElement.dataset.keyboardOpen;
    vi.useRealTimers();
  });

  it("raises the flag when a focused field loses the bottom of the viewport, and drops it after", () => {
    stop = installKeyboardWatcher();
    expect(isKeyboardOpen()).toBe(false);

    field.focus();
    vv!.resizeTo(508); // 336px of keyboard
    expect(isKeyboardOpen()).toBe(true);

    // Closing waits out the keyboard's slide-away before the bar comes back…
    vv!.resizeTo(844);
    expect(isKeyboardOpen()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(isKeyboardOpen()).toBe(false);
  });

  it("drops the flag when the caret leaves, even if the viewport says nothing", () => {
    stop = installKeyboardWatcher();
    field.focus();
    vv!.resizeTo(508);
    expect(isKeyboardOpen()).toBe(true);

    field.blur();
    refreshKeyboardFlag();
    vi.advanceTimersByTime(250);
    expect(isKeyboardOpen()).toBe(false);
  });

  it("re-measures before dropping it, so a flapping event does not flash the bar", () => {
    stop = installKeyboardWatcher();
    field.focus();
    vv!.resizeTo(508);
    vv!.resizeTo(844); // schedules the close…
    vv!.resizeTo(508); // …and the keyboard is back before it fires
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
    vv!.resizeTo(508);
    expect(isKeyboardOpen()).toBe(true);

    off();
    expect(isKeyboardOpen()).toBe(false);
  });
});
