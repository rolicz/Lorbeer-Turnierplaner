/**
 * The four fields that describe an idea — title, details, kind, where — shared by
 * the composer and by the in-place edit form, so "what an idea is" is written once.
 */
import { forwardRef, useEffect, useRef } from "react";

import { Chip, ChipGroup } from "../../ui/primitives/Chip";
import type { IdeaArea, IdeaKind } from "../../api/types";
import { IDEA_KINDS, IDEA_KIND_LABEL, selectableAreas, toggleArea } from "./ideaMeta";

export const IdeaTitleInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onFocus?: () => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
  }
>(function IdeaTitleInput({ value, onChange, onFocus, disabled, placeholder, className }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      className={`input-field ${className ?? ""}`}
      value={value}
      maxLength={120}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      disabled={disabled}
      aria-label="Idea title"
      placeholder={placeholder ?? "In one line: what should change?"}
    />
  );
});

/** `leading-5` — a fixed line box, so the row arithmetic below is exact. */
const BODY_LINE_HEIGHT = 20;
/** `input-field`'s `py-2`, both edges. */
const BODY_PADDING_Y = 16;
/** Three lines before a word is typed: the placeholder asks two questions. */
const BODY_MIN_ROWS = 3;
/** Past this it scrolls inside itself instead of pushing the form off the screen. */
const BODY_MAX_ROWS = 8;

const bodyHeightFor = (rows: number) => rows * BODY_LINE_HEIGHT + BODY_PADDING_Y;

/**
 * The details field, in the composer and in the edit form alike (Q1).
 *
 * It is deliberately **not** the comment composer's chat row. That row starts at
 * one line because a comment is one line — and under this two-line placeholder it
 * *shrank* from 56px to 40px the moment you typed the first character. This field
 * asks "what should happen, and why", so it opens at the size of an answer and
 * never gets smaller than one, then grows with the text to a cap.
 *
 * Auto-grow rather than the edit form's old `resize-y`: a drag handle is a desktop
 * affordance that does not exist under a thumb, and the phone is where the first
 * draft gets written. The two cannot be combined — auto-grow writes `style.height`
 * on every keystroke, which would throw away whatever the reader had dragged to.
 */
export function IdeaBodyField({
  value,
  onChange,
  onSubmit,
  disabled,
  focusNonce,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Ctrl/Cmd+Enter posts, the way every desktop chat does. */
  onSubmit?: () => void;
  disabled?: boolean;
  /** Bumped by the caller to put the caret back after a successful post. */
  focusNonce?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focusNonce) return;
    ref.current?.focus();
  }, [focusNonce]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // `scrollHeight` is content + padding; the 1px hairline is not in it, and
    // `border-box` means the height we set here has to carry it.
    const borders = el.offsetHeight - el.clientHeight;
    const fitted = Math.min(
      Math.max(el.scrollHeight, bodyHeightFor(BODY_MIN_ROWS)),
      bodyHeightFor(BODY_MAX_ROWS),
    );
    el.style.height = `${fitted + borders}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      // The minimum again, for the paint before the effect runs.
      rows={BODY_MIN_ROWS}
      className="input-field resize-none leading-5"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSubmit?.();
        }
      }}
      disabled={disabled}
      aria-label="Idea details"
      placeholder="Details (optional) — what should happen, and why?"
    />
  );
}

export function IdeaKindField({
  value,
  onChange,
  disabled,
}: {
  value: IdeaKind;
  onChange: (v: IdeaKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="section-label">Kind</span>
      <ChipGroup
        value={value}
        onChange={(k) => !disabled && onChange(k)}
        ariaLabel="Kind of request"
        options={IDEA_KINDS.map((k) => ({ key: k, label: IDEA_KIND_LABEL[k] }))}
      />
    </div>
  );
}

/**
 * Multi-select, because a complaint can span a page *and* a viewport — but
 * "Not about one page" / "Several pages" answer instead of naming, so picking one
 * of them clears the pages and vice versa (`toggleArea`, mirrored server-side).
 */
export function IdeaAreasField({
  catalog,
  value,
  onChange,
  disabled,
}: {
  catalog: IdeaArea[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const options = selectableAreas(catalog);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="section-label">Where?</span>
        {value.length === 0 ? (
          <span className="text-xs text-text-muted">Pick at least one.</span>
        ) : null}
      </div>
      <div role="group" aria-label="Which part of the app" className="flex flex-wrap gap-1.5">
        {options.map((a) => (
          <Chip
            key={a.key}
            selected={value.includes(a.key)}
            disabled={disabled}
            onClick={() => onChange(toggleArea(value, a.key))}
          >
            {a.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
