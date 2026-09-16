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
 * Q2 hides the bottom tab bar while the keyboard is up, shipped green against what the
 * VisualViewport API is documented to do, and did nothing at all on Roli's iPhone. Nothing
 * else gets written until the numbers are read off *that* phone, and this is how they are
 * read: the three conditions the decision is made of, each with its own inputs and its own
 * pass/fail, updating live, with a field right here to raise the keyboard with.
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
 * no caret anywhere, which is what makes the interesting question answerable at a glance —
 * *did `innerHeight` shrink when the keyboard opened?* (if it did, `covered` collapses to ~0
 * and condition 3 can never pass, which is the leading hypothesis). "Deepest" is the reading
 * with the largest covered strip seen since this page was opened, so the evidence survives
 * the keyboard closing and a copied report is worth something even without a screenshot.
 *
 * The conditions are not recomputed here: `keyboardConditions()` is the shipped decision,
 * imported. A readout with its own copy of the thresholds could agree with a bug.
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
  return [r.layoutHeight, p?.viewportHeight ?? "-", p?.offsetTop ?? "-", p?.scale ?? "-", r.focus, r.open, r.flag].join("|");
}

function nextState(prev: State): State {
  const now = read();
  const rest = now.probe && !now.probe.editableFocus ? now : prev.rest;
  const deepest =
    now.conditions && (!prev.deepest?.conditions || now.conditions.covered > prev.deepest.conditions.covered)
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
    c ? `covered=${Math.round(c.covered)}/${Math.round(c.requiredCovered)}` : "covered=n/a",
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
      ? `conditions: focus=${c.editableFocus} scale=${c.scaleOk} covered=${c.coveredOk}`
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
      {/* The numbers. "At rest" is the comparison that answers the open question.
          Kept to five short rows: every line here has to fit above a keyboard. */}
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
          <Condition ok={c.coveredOk}>
            3 · covered <span className="tabular-nums">{Math.round(c.covered)}</span> ≥{" "}
            <span className="tabular-nums">{Math.round(c.requiredCovered)}</span>{" "}
            {/* The arithmetic in place: this subtraction is the whole question. `offsetTop`
                is deliberately not in it — it says where the visible strip sits, not what
                covers it, and subtracting it is the bug Q2 shipped twice. */}
            <span className="text-text-muted">
              ({px(now.layoutHeight)} − {px(now.probe?.viewportHeight)})
            </span>
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
        the three is false on the phone while the keyboard is visibly up, that one is the bug.{" "}
        <code>vv.offsetTop</code> is listed because it is how far the page was scrolled to reveal the field — reported
        here, never subtracted.
      </p>
      <p className="text-micro text-text-muted">{environmentLine()}</p>
    </div>
  );
}
