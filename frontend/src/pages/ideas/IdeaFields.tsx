/**
 * The three fields that describe an idea — title, kind, where — shared by the
 * composer and by the in-place edit form, so "what an idea is" is written once.
 */
import { forwardRef } from "react";

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
