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
 * ## What counts as "open": the caret, not the geometry
 *
 * Q2 has had two rules before this one and both of them measured *how much of the screen
 * was covered*. Both shipped green and both did nothing on Roli's iPhone. The first
 * subtracted `visualViewport.offsetTop`, which is a scroll position and not coverage. The
 * second removed that term — a real arithmetic bug — and still failed: in his video the
 * bar hides with the composer's title `<input>` focused and stays with the `<textarea>`
 * directly below it focused, same keyboard, same screen, seconds apart. A threshold that
 * has been wrong twice on the only device that matters is not a threshold worth a third
 * try, so **the covered strip is gone**, floor and ratio with it. What is left is the
 * signal that was right every time it was read:
 *
 * 1. **A text field has the caret.** A keyboard needs a caret: nothing opens one without
 *    an `<input>`, a `<textarea>` or a `contenteditable` taking focus. On a phone, a caret
 *    in a text field means the keyboard is up, near enough always. It is also the
 *    fail-safe, because focus always ends — blur, unmount, navigation — and losing it
 *    clears the flag.
 * 2. **Scale ≈ 1.** Kept as a cheap sanity check, not as a measurement: a pinch is the one
 *    other thing that shrinks the visual viewport, and while you are zoomed in the bar is
 *    the least of your problems. The cost is the harmless direction — pinch-zooming while
 *    a field is focused brings the bar back over the keyboard rather than hiding a bar
 *    nobody asked to hide.
 * 3. **Something happened to the viewport when the caret arrived.** The one geometric
 *    question left, and it is deliberately a *negative* one with no threshold in it: not
 *    "how much is covered" but "did the visible viewport move **at all**". Remember
 *    `visualViewport.height` in the instant the caret lands; if it is still exactly that
 *    a moment later, no keyboard came up, and an iPad with a hardware keyboard (or any
 *    desktop browser) gets its tab bar back. Any change at all — in either direction, at
 *    any size — answers "yes, a keyboard", so this can never be the reason the bar stays
 *    up on a phone. See `SETTLE_MS` and `KeyboardProbe.caretArrival` for the two things
 *    that keep it honest.
 *
 * **Every misfire fails visible.** No `visualViewport` (or no DOM at all) → the flag is
 * never set and the bar stays exactly where it is today; the `nav-clear` token carries
 * the bar's full height as its own fallback, so even a missing stylesheet lands on the
 * old behaviour. The flag is *derived* on every event and never toggled, so it cannot
 * drift out of sync with the viewport; it is re-derived on viewport resize/scroll,
 * window resize, orientation change, focus in/out, tab visibility, page restore and
 * every navigation, and the watcher clears it when it unmounts. Only *dropping* it
 * because the caret left is debounced (250ms), and only so the bar does not flash back
 * over a keyboard that is still sliding away — which is also what carries the caret from
 * a composer's title field to the textarea under it without ending anything.
 *
 * **What it costs.** A caret in a text field with no keyboard over it hides the bar for
 * `SETTLE_MS` before condition 3 puts it back. A hardware keyboard whose accessory bar
 * *does* shrink the viewport (iPadOS' shortcuts bar) reads as an on-screen keyboard —
 * "did anything happen" cannot tell those apart without a threshold, and a threshold is
 * exactly what this rule exists to be rid of. Both land on today's behaviour, which is
 * the safe direction.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** `<html data-keyboard-open="true">` — the flag `styles.css` keys off. */
const FLAG = "keyboardOpen";

/** How long a "closed" reading must hold before the bar comes back (keyboard slide-out). */
const CLOSE_DELAY_MS = 250;
/**
 * How long a keyboard gets to show itself before "nothing moved" is believed (condition 3).
 *
 * Every platform animates its keyboard in well inside this (iOS ~250ms, Android ~300ms) and
 * fires the viewport resize as it starts, so the window is generous on purpose: being late
 * with the bar on an iPad costs a fraction of a second, being early on a phone would put the
 * bar back on a keyboard, which is the bug. A reading that arrives after the window still
 * wins — the comparison is re-derived on every event, not latched.
 */
const SETTLE_MS = 600;
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
  /** Is the caret in a field that opens a keyboard? Condition 1 — the rule, on its own. */
  editableFocus: boolean;
  /** `visualViewport.height` — what is actually visible. */
  viewportHeight: number;
  /** `visualViewport.scale`. Condition 2. */
  scale: number;
  /**
   * What the visible viewport looked like in the instant the caret arrived — condition 3,
   * and `null` when there is no caret or no reading from before it.
   *
   * `fromRest` is the guard that keeps this from ever hiding a keyboard: the height only
   * counts as a baseline if it was measured with **no caret anywhere**. A caret that was
   * already in a field when this module started looking (a restored tab, a remounted
   * watcher) says nothing about what the viewport looked like before it, so condition 3
   * abstains and the bar hides exactly as conditions 1 and 2 say.
   */
  caretArrival: { viewportHeight: number; ageMs: number; fromRest: boolean } | null;
  /**
   * `window.innerHeight` — *reported, never decided on*. The layout viewport is where
   * `position: fixed; bottom: 0` puts the tab bar, and how far it hangs below the visible
   * area used to be the whole test. It was wrong on the device twice (see the module doc),
   * so it is now evidence for the diagnostics readout and nothing else.
   */
  layoutHeight: number;
  /**
   * `visualViewport.offsetTop` — *reported, never decided on*. Where the visible strip sits
   * inside the layout viewport, i.e. how far Safari scrolled the page to reveal the field.
   * Subtracting it was Q2's first bug; it is shown in the readout because it is the number
   * that identified it.
   */
  offsetTop: number;
};

/**
 * Each condition's own answer, next to the numbers it was computed from.
 *
 * It exists so the live readout in Settings → Diagnostics can show *the* decision rather
 * than a second implementation of it: Q2 has shipped twice against a rule that looked right
 * on paper and did nothing on Roli's phone, and a readout that recomputed the conditions
 * itself could agree with a bug instead of exposing it.
 */
export type KeyboardConditions = {
  /** 1. The caret is in something that opens a keyboard. */
  editableFocus: boolean;
  /** 2. The visual viewport is small because of a keyboard, not a pinch. */
  scaleOk: boolean;
  /** 3. The viewport did something when the caret arrived — see `KeyboardProbe.caretArrival`. */
  onscreenKeyboard: boolean;
  /** `visualViewport.height` when the caret arrived, or `null` when condition 3 abstains. */
  arrivalHeight: number | null;
  /** Has the visible viewport moved since then — at all, in either direction? */
  viewportMoved: boolean;
  /** Has the caret been there longer than `SETTLE_MS`, i.e. is condition 3 answerable yet? */
  settled: boolean;
  /** What condition 2 allows. */
  maxScale: number;
  /** How long condition 3 waits. */
  settleMs: number;
};

/** The test itself, condition by condition (see this module's doc comment). */
export function keyboardConditions(p: KeyboardProbe): KeyboardConditions {
  const arrival = p.caretArrival?.fromRest ? p.caretArrival : null;
  const settled = !!arrival && arrival.ageMs >= SETTLE_MS;
  // Rounded, because "did anything happen" is a pixel question and sub-pixel jitter is not
  // an answer to it. Any real change, up or down, means a keyboard came or went.
  const moved = !arrival || Math.round(p.viewportHeight) !== Math.round(arrival.viewportHeight);
  return {
    editableFocus: p.editableFocus,
    scaleOk: p.scale <= MAX_SCALE,
    // Nothing moved after the keyboard had time to arrive ⇒ there is no on-screen keyboard
    // (hardware keyboard, desktop browser). Until then, and whenever there is no baseline
    // to compare against, the caret has the last word.
    onscreenKeyboard: !settled || moved,
    arrivalHeight: arrival ? arrival.viewportHeight : null,
    viewportMoved: moved,
    settled,
    maxScale: MAX_SCALE,
    settleMs: SETTLE_MS,
  };
}

/** All three at once — the one answer the flag is set from. */
export function keyboardOpenFrom(p: KeyboardProbe): boolean {
  const c = keyboardConditions(p);
  return c.editableFocus && c.scaleOk && c.onscreenKeyboard;
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

/**
 * One stretch of the caret sitting in a text field, and the viewport height it started at.
 *
 * It begins when a caret arrives and ends when the caret has been gone for `CLOSE_DELAY_MS`
 * — *not* at every blur, because moving from a composer's title field to the textarea under
 * it is a blur and a focus in the same instant with the keyboard never leaving the screen.
 * Ending it there would re-baseline against the keyboard-open height and answer condition 3
 * with "nothing moved", which is precisely the regression this rule has to survive.
 */
type CaretEpisode = { at: number; viewportHeight: number; fromRest: boolean };

let episode: CaretEpisode | null = null;
/** What the previous reading saw, so an arriving caret can be told from one already there. */
let sawCaret: boolean | undefined;
let closeTimer: number | undefined;
let settleTimer: number | undefined;

function clearCloseTimer(): void {
  if (closeTimer === undefined) return;
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}

function endEpisode(): void {
  episode = null;
  if (settleTimer === undefined) return;
  window.clearTimeout(settleTimer);
  settleTimer = undefined;
}

/** Reads the live viewport. `null` where the API is missing — then nothing ever hides.
 *  Exported so the diagnostics readout measures with the same ruler, not a copy of it. */
export function readKeyboardProbe(): KeyboardProbe | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const vv = window.visualViewport;
  if (!vv) return null;
  return {
    editableFocus: isEditableElement(document.activeElement),
    viewportHeight: vv.height,
    scale: vv.scale,
    caretArrival: episode
      ? { viewportHeight: episode.viewportHeight, ageMs: Date.now() - episode.at, fromRest: episode.fromRest }
      : null,
    layoutHeight: window.innerHeight,
    offsetTop: vv.offsetTop,
  };
}

/**
 * Note what the caret is doing, and open an episode when it arrives.
 *
 * Deliberately runs *after* the probe the current decision is made from: the first reading
 * with a caret in it has no baseline yet and must not have one, or condition 3 would compare
 * the viewport with itself and abstain forever.
 */
function observeCaret(p: KeyboardProbe): void {
  const caret = p.editableFocus;
  if (caret && !episode) {
    episode = { at: Date.now(), viewportHeight: p.viewportHeight, fromRest: sawCaret === false };
    // Nothing else will fire if no keyboard comes up, so ask again once one would have.
    if (settleTimer === undefined) {
      settleTimer = window.setTimeout(() => {
        settleTimer = undefined;
        refreshKeyboardFlag();
      }, SETTLE_MS + 20);
    }
  }
  sawCaret = caret;
}

/**
 * Re-derive the flag from the live viewport.
 *
 * Opening is immediate (the bar must be gone before the keyboard has finished sliding in).
 * A caret that *left* waits out `CLOSE_DELAY_MS` and re-measures, so a keyboard that is
 * still animating away does not get the bar drawn on top of it and a field-to-field hop
 * does not end the episode; `immediate` skips that wait for the cases where the field is
 * provably gone — navigation, teardown. A caret that is still there with no keyboard behind
 * it (condition 3) needs no such grace: nothing is animating.
 */
export function refreshKeyboardFlag(immediate = false): void {
  const p = readKeyboardProbe();
  const open = p ? keyboardOpenFrom(p) : false;
  if (p) observeCaret(p);

  if (open) {
    clearCloseTimer();
    setFlag(true);
    return;
  }
  if (p?.editableFocus) {
    // Caret, no keyboard: a hardware keyboard or a pinch. The episode stays open, so the
    // instant the viewport does move the flag comes back.
    clearCloseTimer();
    setFlag(false);
    return;
  }
  if (!isKeyboardOpen() && !episode) {
    clearCloseTimer();
    return;
  }
  if (immediate) {
    clearCloseTimer();
    endEpisode();
    setFlag(false);
    return;
  }
  if (closeTimer !== undefined) return;
  closeTimer = window.setTimeout(() => {
    closeTimer = undefined;
    const again = readKeyboardProbe();
    if (again && keyboardOpenFrom(again)) return;
    if (!again?.editableFocus) endEpisode();
    setFlag(false);
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
    endEpisode();
    // A fresh watcher must not trust a baseline it never took.
    sawCaret = undefined;
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
