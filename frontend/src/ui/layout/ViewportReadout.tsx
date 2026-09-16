import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, X } from "lucide-react";

import { cn } from "../cn";
import Button from "../primitives/Button";
import { copyText } from "../../utils/clipboard";
import {
  isKeyboardOpen,
  keyboardConditions,
  keyboardOpenFrom,
  readKeyboardProbe,
  type KeyboardConditions,
  type KeyboardProbe,
} from "../shell/keyboardOpen";

/**
 * Settings → Diagnostics: what the viewport is doing, right now, on the device.
 *
 * Q2 hides the bottom tab bar while the keyboard is up. It shipped twice against a rule
 * that measured how much of the screen was covered, and failed on Roli's iPhone twice, so
 * the rule is now the caret itself (`ui/shell/keyboardOpen.ts`). This block is how a third
 * failure would get reported: the conditions the decision is actually made of, each with
 * its own inputs and its own pass/fail, updating live, with a field right here to raise the
 * keyboard with — plus the raw viewport numbers, which are evidence now rather than
 * thresholds.
 *
 * **Everything is above the field**, because the keyboard takes the bottom half of the
 * screen the moment he taps it: the numbers, the conditions and the verdict all sit above
 * it, so one screenshot carries the whole answer. Nothing in the block scrolls, and nothing
 * moves when focus lands.
 *
 * **And the verdict and Copy sit *directly* above it**, which is the second thing the phone
 * taught us: Safari scrolls the page by up to 222px to reveal a focused field, so the top of
 * this block leaves the screen exactly when the keyboard arrives — Roli: *"i had to scroll
 * up to reach copy button"*. The focused field is the one element the platform promises to
 * keep visible, so the two controls that have to survive a shifted page are anchored to it,
 * and Copy is the escape hatch: it carries now, at rest, deepest, the conditions and the
 * user agent as text, so a readout he can only half see is still a readout he can send.
 *
 * **Three columns, not one.** "Now" is the reading; "at rest" is the last reading taken with
 * no caret anywhere, which is what the third condition compares against in spirit — *did the
 * viewport move when the caret arrived?*; "deepest" is the reading with the *smallest* visual
 * viewport seen since this page was opened, so the evidence survives the keyboard closing and
 * a copied report is worth something even without a screenshot.
 *
 * The conditions are not recomputed here: `keyboardConditions()` is the shipped decision,
 * imported. A readout with its own copy of the rule could agree with a bug.
 */

/** How often to re-read when no event fires (the flag's own close is debounced by 250ms). */
const POLL_MS = 250;

type Reading = {
  at: number;
  /** null where the browser has no VisualViewport at all — then the flag can never be set. */
  probe: KeyboardProbe | null;
  layoutHeight: number;
  focus: string;
  conditions: KeyboardConditions | null;
  /** What the test says right now. */
  open: boolean;
  /** What `<html data-keyboard-open>` actually says right now. */
  flag: boolean;
};

type State = { now: Reading; rest: Reading | null; deepest: Reading | null; sig: string };

/** The focused element, named the way a bug report needs it. */
function describeFocus(el: Element | null): string {
  if (!el || el === document.body || el === document.documentElement) return "none";
  const tag = el.tagName.toLowerCase();
  if (tag === "input") return `input (${(el as HTMLInputElement).type || "text"})`;
  if ((el as HTMLElement).isContentEditable) return `${tag} (contenteditable)`;
  return tag;
}

function read(): Reading {
  const probe = readKeyboardProbe();
  const focus = typeof document === "undefined" ? "none" : describeFocus(document.activeElement);
  return {
    at: Date.now(),
    probe,
    layoutHeight: typeof window === "undefined" ? 0 : window.innerHeight,
    focus,
    conditions: probe ? keyboardConditions(probe) : null,
    open: probe ? keyboardOpenFrom(probe) : false,
    flag: isKeyboardOpen(),
  };
}

function sigOf(r: Reading | null): string {
  if (!r) return "-";
  const p = r.probe;
  const c = r.conditions;
  // Deliberately without the caret's live age: it changes every poll and nothing on screen
  // shows it. `settled` is the part of it that can change an answer.
  return [
    r.layoutHeight,
    p?.viewportHeight ?? "-",
    p?.offsetTop ?? "-",
    p?.scale ?? "-",
    r.focus,
    c?.arrivalHeight ?? "-",
    c?.settled ?? "-",
    r.open,
    r.flag,
  ].join("|");
}

function nextState(prev: State): State {
  const now = read();
  const rest = now.probe && !now.probe.editableFocus ? now : prev.rest;
  // "Deepest" = the most the visible viewport has ever been squeezed on this page.
  const deepest =
    now.probe && (!prev.deepest?.probe || now.probe.viewportHeight < prev.deepest.probe.viewportHeight)
      ? now
      : prev.deepest;
  const sig = `${sigOf(now)}//${sigOf(rest)}//${sigOf(deepest)}`;
  return sig === prev.sig ? prev : { now, rest, deepest, sig };
}

function px(n: number | undefined | null): string {
  return n == null ? "—" : `${Math.round(n)}`;
}

/** A condition, its verdict and the numbers it was decided on. */
function Condition({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? Check : X;
  return (
    <div className="flex items-start gap-2 py-0.5 text-xs">
      <Icon size={14} className={cn("mt-0.5 shrink-0", ok ? "text-accent" : "text-text-muted")} aria-hidden="true" />
      <span className="sr-only">{ok ? "met:" : "not met:"}</span>
      <span className="min-w-0 flex-1 text-text-normal">{children}</span>
    </div>
  );
}

function environmentLine(): string {
  if (typeof window === "undefined") return "";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return [
    standalone ? "standalone" : "browser",
    `window ${window.innerWidth}x${window.innerHeight}`,
    `screen ${window.screen?.width ?? "?"}x${window.screen?.height ?? "?"}`,
    `dpr ${window.devicePixelRatio ?? "?"}`,
  ].join(" · ");
}

/** One reading as a line of text — the same numbers the grid shows, pasteable. */
function formatReading(label: string, r: Reading | null): string {
  if (!r) return `${label}: (nothing recorded)`;
  const p = r.probe;
  const c = r.conditions;
  const parts = [
    `innerHeight=${Math.round(r.layoutHeight)}`,
    `vv.height=${p ? Math.round(p.viewportHeight) : "n/a"}`,
    `vv.offsetTop=${p ? Math.round(p.offsetTop) : "n/a"}`,
    `vv.scale=${p ? p.scale.toFixed(2) : "n/a"}`,
    `focus=${r.focus}`,
    `caretArrival=${p?.caretArrival ? `${Math.round(p.caretArrival.viewportHeight)}@${Math.round(p.caretArrival.ageMs)}ms${p.caretArrival.fromRest ? "" : " (no baseline)"}` : "none"}`,
    c ? `onscreenKeyboard=${c.onscreenKeyboard}${c.settled ? "" : " (settling)"}` : "onscreenKeyboard=n/a",
    `test=${r.open ? "open" : "closed"}`,
    `flag=${r.flag ? "set" : "unset"}`,
  ];
  return `${label}: ${parts.join(" ")}`;
}

/** Everything this component knows, as text he can paste into a message. */
function reportText(s: State): string {
  const c = s.now.conditions;
  return [
    `Viewport readout — ${new Date(s.now.at).toISOString()}`,
    environmentLine(),
    formatReading("now", s.now),
    formatReading("at rest", s.rest),
    formatReading("deepest", s.deepest),
    c
      ? `conditions: focus=${c.editableFocus} scale=${c.scaleOk} onscreenKeyboard=${c.onscreenKeyboard}`
      : "conditions: no visualViewport API",
    `userAgent: ${typeof navigator === "undefined" ? "?" : navigator.userAgent}`,
  ].join("\n");
}

export default function ViewportReadout() {
  const [state, setState] = useState<State>(() => {
    const now = read();
    const base: State = { now, rest: null, deepest: null, sig: "" };
    return nextState(base);
  });
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let frame = 0;
    const tick = () => setState((prev) => nextState(prev));
    const onChange = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(tick);
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onChange);
    vv?.addEventListener("scroll", onChange);
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    document.addEventListener("focusin", onChange);
    document.addEventListener("focusout", onChange);
    // The flag drops on a 250ms timer with no event of its own, and iOS does not fire a
    // viewport event for every keyboard animation frame: poll as well as listen.
    const poll = window.setInterval(tick, POLL_MS);
    tick();
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(poll);
      vv?.removeEventListener("resize", onChange);
      vv?.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      document.removeEventListener("focusin", onChange);
      document.removeEventListener("focusout", onChange);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const onCopy = useCallback(async () => {
    const ok = await copyText(reportText(state));
    setCopied(ok ? "done" : "failed");
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied("idle"), 2500);
  }, [state]);

  const { now, rest, deepest } = state;
  const c = now.conditions;

  return (
    <div className="space-y-2">
      {/* The numbers — evidence for the next bug report, not inputs to the rule any more.
          "At rest" is the last reading with no caret; "deepest" the smallest the visible
          viewport got. Kept to five short rows: every line here has to fit above a keyboard. */}
      <dl className="inset grid grid-cols-[1fr,auto,auto,auto] gap-x-3 gap-y-0.5 py-2 text-xs">
        <dt className="text-micro uppercase tracking-wide text-text-muted">measure</dt>
        <dd className="text-right text-micro uppercase tracking-wide text-text-muted">now</dd>
        <dd className="text-right text-micro uppercase tracking-wide text-text-muted">at rest</dd>
        <dd className="text-right text-micro uppercase tracking-wide text-text-muted">deepest</dd>

        <dt className="text-text-muted">innerHeight</dt>
        <dd className="text-right tabular-nums text-text-normal">{px(now.layoutHeight)}</dd>
        <dd className="text-right tabular-nums text-text-muted">{rest ? px(rest.layoutHeight) : "—"}</dd>
        <dd className="text-right tabular-nums text-text-muted">{deepest ? px(deepest.layoutHeight) : "—"}</dd>

        <dt className="text-text-muted">vv.height</dt>
        <dd className="text-right tabular-nums text-text-normal">{px(now.probe?.viewportHeight)}</dd>
        <dd className="text-right tabular-nums text-text-muted">{px(rest?.probe?.viewportHeight)}</dd>
        <dd className="text-right tabular-nums text-text-muted">{px(deepest?.probe?.viewportHeight)}</dd>

        <dt className="text-text-muted">vv.offsetTop</dt>
        <dd className="text-right tabular-nums text-text-normal">{px(now.probe?.offsetTop)}</dd>
        <dd className="text-right tabular-nums text-text-muted">{px(rest?.probe?.offsetTop)}</dd>
        <dd className="text-right tabular-nums text-text-muted">{px(deepest?.probe?.offsetTop)}</dd>

        <dt className="text-text-muted">vv.scale</dt>
        <dd className="text-right tabular-nums text-text-normal">{now.probe ? now.probe.scale.toFixed(2) : "—"}</dd>
        <dd className="text-right tabular-nums text-text-muted">{rest?.probe ? rest.probe.scale.toFixed(2) : "—"}</dd>
        <dd className="text-right tabular-nums text-text-muted">
          {deepest?.probe ? deepest.probe.scale.toFixed(2) : "—"}
        </dd>
      </dl>

      {/* The decision, condition by condition. */}
      {c ? (
        <div className="inset py-2">
          <Condition ok={c.editableFocus}>
            1 · caret in a text field — <span className="text-text-muted">{now.focus}</span>
          </Condition>
          <Condition ok={c.scaleOk}>
            2 · scale{" "}
            <span className="tabular-nums">{now.probe ? now.probe.scale.toFixed(2) : "—"}</span> ≤{" "}
            <span className="tabular-nums">{c.maxScale}</span>
          </Condition>
          {/* No arithmetic and no threshold: the question is whether the viewport moved at
              all when the caret arrived, and the only thing that can answer "no" is a
              hardware keyboard. Until the settle window is over, the caret has the say. */}
          <Condition ok={c.onscreenKeyboard}>
            3 · a keyboard came with the caret —{" "}
            {c.arrivalHeight == null ? (
              <span className="text-text-muted">
                {now.probe?.editableFocus ? "no reading from before the caret, so assumed" : "no caret"}
              </span>
            ) : (
              <>
                <span className="tabular-nums">vv.height {px(now.probe?.viewportHeight)}</span>{" "}
                <span className="text-text-muted">
                  {c.viewportMoved ? (
                    <>
                      (moved from <span className="tabular-nums">{px(c.arrivalHeight)}</span> at the caret)
                    </>
                  ) : c.settled ? (
                    <>(unchanged since the caret — no on-screen keyboard)</>
                  ) : (
                    <>(unchanged, giving a keyboard {c.settleMs}ms to show up)</>
                  )}
                </span>
              </>
            )}
          </Condition>
        </div>
      ) : (
        <p className="text-xs text-warn">
          This browser has no <code>visualViewport</code>, so the flag can never be set here.
        </p>
      )}

      {/* The field, last of the block, with the verdict and Copy pinned to it: Safari
          scrolls the page to reveal the field, so its immediate neighbours are the only
          real estate on the page that a keyboard cannot push out of reach. */}
      <div data-testid="viewport-readout-anchor">
        <div className="flex items-center gap-2 pb-1">
          <span
            className={cn(
              "chip font-semibold",
              now.open ? "border-accent/40 bg-accent/15 text-accent" : "text-text-muted"
            )}
          >
            Keyboard {now.open ? "open" : "closed"}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            flag {now.flag ? "set" : "unset"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5"
            // Keep the caret where it is: a copy tap must not close the keyboard the
            // reading is about.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void onCopy()}
          >
            <ClipboardCopy size={14} aria-hidden="true" />
            <span>{copied === "done" ? "Copied" : copied === "failed" ? "Failed" : "Copy"}</span>
          </Button>
        </div>
        <label className="input-label block" htmlFor="viewport-readout-field">
          Tap here to raise the keyboard
        </label>
        <input
          id="viewport-readout-field"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="type anything"
          className="input-field"
        />
        <p className="input-hint">
          The numbers above keep updating while the keyboard is up — screenshot them, or tap Copy right here: it keeps
          the caret, so the report describes the keyboard that is still open.
        </p>
      </div>

      <p className="text-xs text-text-muted">
        The bottom tab bar hides while the keyboard is open, and open means all three conditions above at once,
        published as <code>data-keyboard-open</code> on <code>&lt;html&gt;</code> — that is what "flag" says. If one of
        the three is false on the phone while the keyboard is visibly up, that one is the bug. Nothing here is a
        threshold any more: a caret in a text field <em>is</em> the keyboard, and condition 3 only takes it back when
        the viewport did not move at all, which is a hardware keyboard. <code>innerHeight</code> and{" "}
        <code>vv.offsetTop</code> are reported as evidence and decide nothing — subtracting them is what Q2 got wrong
        twice.
      </p>
      <p className="text-micro text-text-muted">{environmentLine()}</p>
    </div>
  );
}
