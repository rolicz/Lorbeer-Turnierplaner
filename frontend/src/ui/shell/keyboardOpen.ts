/**
 * Is the on-screen keyboard up? — one answer, shared by everything pinned to the
 * bottom of the screen (Q2).
 *
 * The bug it exists for: `BottomTabBar` is `fixed inset-x-0 bottom-0`, and iOS does
 * not resize the layout viewport when the keyboard opens — it shrinks the *visual*
 * viewport and re-anchors fixed elements to it. So the bar rides up and parks on top
 * of the keyboard, above the composer you are typing in. `VisualViewport` is the only
 * mechanism iOS Safari gives us for this: `interactive-widget=resizes-content` and
 * `env(keyboard-inset-height)` are Chromium-only.
 *
 * **One flag, one repaint.** The answer is published as a single DOM attribute —
 * `<html data-keyboard-open>` — and everything else is CSS (`styles.css`): the bar and
 * the floating filter pill carry `.hide-on-keyboard`, and the `nav-clear` spacing token
 * (the clearance the bottom-pinned surfaces leave *for that bar*) collapses to 0 in the
 * same style recalculation. Five surfaces, one mechanism. A React context would
 * re-render five components instead, and the offsets could trail the bar by a frame —
 * exactly the gap over the keyboard this task is about.
 *
 * **What counts as "open".** The visual viewport also shrinks for a pinch, and it moves
 * on every momentum scroll and every toolbar collapse, so a height change is not a
 * keyboard. Three things have to be true at once:
 *
 * 1. **A text field has focus.** A keyboard needs a caret: nothing opens one without an
 *    `<input>`, a `<textarea>` or a `contenteditable` taking focus. This is the
 *    condition that rules out scrolling, rotating and plain reading — and it is the
 *    fail-safe, because focus always ends (blur, unmount, navigation) and losing it
 *    clears the flag.
 * 2. **Scale ≈ 1.** A pinch shrinks `visualViewport.height` exactly the way a keyboard
 *    does. The cost is the harmless direction: pinch-zooming while a field is focused
 *    brings the bar back over the keyboard, rather than hiding a bar nobody asked to
 *    hide.
 * 3. **The covered strip is keyboard-sized**: at least 20% of the layout viewport *and*
 *    at least 120px. A phone keyboard is 40–50% of the screen in portrait and more in
 *    landscape; iOS Safari's own toolbars account for ~115px in portrait and ~50px in
 *    landscape, and an iPad's hardware-keyboard accessory bar for ~55px. All three stay
 *    under the floor, so none of them hides the bar. The *ratio* is what makes this
 *    device- and orientation-independent instead of a table of keyboard heights.
 *
 * **Every misfire fails visible.** No `visualViewport` (or no DOM at all) → the flag is
 * never set and the bar stays exactly where it is today; the `nav-clear` token carries
 * the bar's full height as its own fallback, so even a missing stylesheet lands on the
 * old behaviour. The flag is *derived* on every event and never toggled, so it cannot
 * drift out of sync with the viewport; it is re-derived on viewport resize/scroll,
 * window resize, orientation change, focus in/out, tab visibility, page restore and
 * every navigation, and the watcher clears it when it unmounts. Only *dropping* it is
 * debounced (250ms), and only so the bar does not flash back over a keyboard that is
 * still sliding away.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** `<html data-keyboard-open="true">` — the flag `styles.css` keys off. */
const FLAG = "keyboardOpen";

/** How long a "closed" reading must hold before the bar comes back (keyboard slide-out). */
const CLOSE_DELAY_MS = 250;
/** Floor, so a browser toolbar or an iPad accessory bar never reads as a keyboard. */
const MIN_COVERED_PX = 120;
/** …and the same in relative terms, so the floor scales with the screen. */
const MIN_COVERED_RATIO = 0.2;
/** Above this the visual viewport is small because of a pinch, not a keyboard. */
const MAX_SCALE = 1.05;

/** Input types that open a keyboard or a keypad. A wheel picker (date, time) does not. */
const TEXT_INPUT_TYPES = new Set(["", "text", "search", "url", "tel", "email", "password", "number"]);

/** Does this element take a caret — i.e. can it be the reason a keyboard is up? */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const html = el as HTMLElement;
  if (html.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") {
    const ta = el as HTMLTextAreaElement;
    return !ta.readOnly && !ta.disabled;
  }
  if (tag !== "INPUT") return false;
  const input = el as HTMLInputElement;
  if (input.readOnly || input.disabled) return false;
  return TEXT_INPUT_TYPES.has((input.type || "").toLowerCase());
}

/** Everything the decision needs, so the decision itself can be tested without a browser. */
export type KeyboardProbe = {
  /** `window.innerHeight` — the layout viewport, which the keyboard does not change. */
  layoutHeight: number;
  /** `visualViewport.height` — what is actually visible. */
  viewportHeight: number;
  /** `visualViewport.offsetTop` — a panned visual viewport is not a covered one. */
  offsetTop: number;
  /** `visualViewport.scale`. */
  scale: number;
  /** Is the caret in a field that opens a keyboard? */
  editableFocus: boolean;
};

/** The test itself (see the three conditions in this module's doc comment). */
export function keyboardOpenFrom(p: KeyboardProbe): boolean {
  if (!p.editableFocus) return false;
  if (p.scale > MAX_SCALE) return false;
  if (!(p.layoutHeight > 0)) return false;
  const covered = p.layoutHeight - p.viewportHeight - p.offsetTop;
  return covered >= Math.max(MIN_COVERED_PX, p.layoutHeight * MIN_COVERED_RATIO);
}

/** Is the flag currently set? (The DOM is the single source of truth, not a module variable.) */
export function isKeyboardOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset[FLAG] === "true";
}

function setFlag(open: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (open) root.dataset[FLAG] = "true";
  else delete root.dataset[FLAG];
}

/** Reads the live viewport. `null` where the API is missing — then nothing ever hides. */
function probe(): KeyboardProbe | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const vv = window.visualViewport;
  if (!vv) return null;
  return {
    layoutHeight: window.innerHeight,
    viewportHeight: vv.height,
    offsetTop: vv.offsetTop,
    scale: vv.scale,
    editableFocus: isEditableElement(document.activeElement),
  };
}

let closeTimer: number | undefined;

function clearCloseTimer(): void {
  if (closeTimer === undefined) return;
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}

/**
 * Re-derive the flag from the live viewport.
 *
 * Opening is immediate (the bar must be gone before the keyboard has finished sliding
 * in); closing waits out `CLOSE_DELAY_MS` and *re-measures*, so a keyboard that is still
 * animating away does not get the bar drawn on top of it. `immediate` skips that wait
 * for the cases where the field is provably gone — navigation, teardown.
 */
export function refreshKeyboardFlag(immediate = false): void {
  const p = probe();
  const open = p ? keyboardOpenFrom(p) : false;
  if (open) {
    clearCloseTimer();
    setFlag(true);
    return;
  }
  if (!isKeyboardOpen()) {
    clearCloseTimer();
    return;
  }
  if (immediate) {
    clearCloseTimer();
    setFlag(false);
    return;
  }
  if (closeTimer !== undefined) return;
  closeTimer = window.setTimeout(() => {
    closeTimer = undefined;
    const again = probe();
    if (!again || !keyboardOpenFrom(again)) setFlag(false);
  }, CLOSE_DELAY_MS);
}

let watchers = 0;
let stopListening: (() => void) | null = null;

/**
 * Start watching (ref-counted, so a second mount in a test cannot double-bind).
 * Returns the cleanup, which always clears the flag: a torn-down watcher must never
 * leave the app with a permanently hidden tab bar.
 */
export function installKeyboardWatcher(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  watchers += 1;
  if (watchers === 1) {
    const onChange = () => refreshKeyboardFlag();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onChange);
    vv?.addEventListener("scroll", onChange);
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("pageshow", onChange);
    document.addEventListener("focusin", onChange);
    document.addEventListener("focusout", onChange);
    document.addEventListener("visibilitychange", onChange);
    stopListening = () => {
      vv?.removeEventListener("resize", onChange);
      vv?.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("pageshow", onChange);
      document.removeEventListener("focusin", onChange);
      document.removeEventListener("focusout", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
    refreshKeyboardFlag(true);
  }
  return () => {
    watchers -= 1;
    if (watchers > 0) return;
    stopListening?.();
    stopListening = null;
    clearCloseTimer();
    setFlag(false);
  };
}

/** Mounted once, in the app shell. */
export function useKeyboardWatcher(): void {
  const { pathname } = useLocation();
  useEffect(() => installKeyboardWatcher(), []);
  // Leaving a page unmounts whatever held the caret, and a removed element does not
  // reliably fire `focusout`: re-derive on every navigation so the flag can never
  // outlive the field that set it.
  useEffect(() => {
    refreshKeyboardFlag(true);
  }, [pathname]);
}
