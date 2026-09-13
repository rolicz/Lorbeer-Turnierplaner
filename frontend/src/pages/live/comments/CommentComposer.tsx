/**
 * The comment composer (S10): one always-visible chat row at the bottom of the
 * feed instead of an "Add comment" button that opens a form.
 *
 *   [🖼] [ Write a comment…                    ] [⚽] [🎯] [➤]
 *
 * The common path is type → send. Tapping ⚽ or 🎯 swaps the row into the goal /
 * shots entry *in place* (same row, same send button), and the two selectors that
 * used to be dropdowns above a form are two small chips above the field, already
 * defaulted to the match you are looking at and to yourself.
 */
import { Goal, ImageIcon, Send, Target, X } from "lucide-react";
import { useEffect, useRef } from "react";

import Button from "../../../ui/primitives/Button";
import { Chip } from "../../../ui/primitives/Chip";
import { cn } from "../../../ui/cn";
import type {
  CommentCreateMode,
  CommentGoalPlayerOption,
  CommentGoalSide,
  CommentGoalTeamOption,
} from "../tournamentCommentTypes";

const SHOTS_OPTIONS = Array.from({ length: 51 }, (_, i) => i);

/** A textarea that starts one line high and grows with its content (chat-style). */
function AutoTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  ariaLabel,
  autoFocus,
  maxRows = 6,
  focusNonce,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  autoFocus?: boolean;
  maxRows?: number;
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
    // 20px line-height + 16px vertical padding, capped so the row never eats the feed.
    el.style.height = `${Math.min(el.scrollHeight, maxRows * 20 + 16)}px`;
  }, [value, maxRows]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Enter inserts a newline (a phone keyboard has no other option);
        // Ctrl/Cmd+Enter sends, like every desktop chat.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSubmit?.();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      className="input-field max-h-32 min-h-[2.5rem] flex-1 resize-none py-2 leading-5"
    />
  );
}

/** Text field + send button — the composer's own bottom row, and the reply row. */
export function CommentSendRow({
  value,
  onChange,
  onSubmit,
  canSubmit,
  submitting = false,
  placeholder,
  ariaLabel,
  sendLabel = "Send",
  disabled = false,
  autoFocus = false,
  focusNonce,
  leading,
  trailing,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting?: boolean;
  placeholder?: string;
  ariaLabel: string;
  sendLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Bumped by the caller to put the caret back after a successful post. */
  focusNonce?: number;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-1.5">
      {leading}
      <AutoTextarea
        value={value}
        onChange={onChange}
        onSubmit={() => {
          if (canSubmit && !submitting) onSubmit();
        }}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        focusNonce={focusNonce}
      />
      {trailing}
      <Button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || submitting || disabled}
        title={sendLabel}
        aria-label={sendLabel}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
      >
        <Send size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** The "Goal" / "Shots" badge that leaves the entry mode again. */
function ModeBadge({ label, onLeave, disabled }: { label: string; onLeave: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="chip inline-flex items-center gap-1.5 text-accent">
        {label === "Goal" ? <Goal size={12} aria-hidden="true" /> : <Target size={12} aria-hidden="true" />}
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        onClick={onLeave}
        disabled={disabled}
        title={`Leave ${label.toLowerCase()} entry`}
        aria-label={`Leave ${label.toLowerCase()} entry`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
      >
        <X size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}

export default function CommentComposer({
  mode,
  onModeChange,
  allowMatchEventModes,
  scopeControl,
  authorControl,
  goalTeams,
  goalSide,
  onGoalSideChange,
  goalPlayers,
  goalMinute,
  onGoalMinuteChange,
  goalPlayerName,
  onGoalPlayerNameChange,
  shotsA,
  onShotsAChange,
  shotsB,
  onShotsBChange,
  draftBody,
  onChangeDraftBody,
  canAttachImage = false,
  imagePreviewUrl = null,
  onOpenImageCropper,
  onClearImage,
  onSubmit,
  canSubmit,
  submitting = false,
  disabled = false,
  sticky = true,
  playersListId,
  focusNonce,
}: {
  mode: CommentCreateMode;
  onModeChange: (mode: CommentCreateMode) => void;
  /** Goal/shots entry only makes sense on a match scope. */
  allowMatchEventModes: boolean;
  /** "Post to" selector — rendered only where more than one scope exists. */
  scopeControl?: React.ReactNode;
  /** "Posted as" toggle. */
  authorControl?: React.ReactNode;
  goalTeams: CommentGoalTeamOption[];
  goalSide: CommentGoalSide | null;
  onGoalSideChange: (side: CommentGoalSide) => void;
  goalPlayers: CommentGoalPlayerOption[];
  goalMinute: string;
  onGoalMinuteChange: (value: string) => void;
  goalPlayerName: string;
  onGoalPlayerNameChange: (value: string) => void;
  shotsA: string;
  onShotsAChange: (value: string) => void;
  shotsB: string;
  onShotsBChange: (value: string) => void;
  draftBody: string;
  onChangeDraftBody: (value: string) => void;
  canAttachImage?: boolean;
  imagePreviewUrl?: string | null;
  onOpenImageCropper?: () => void;
  onClearImage?: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting?: boolean;
  disabled?: boolean;
  /** Pin the row above the bottom tab bar while the feed is on screen. */
  sticky?: boolean;
  playersListId: string;
  /**
   * Bumped after a successful post: clicking Send moves focus to the button, which
   * then disables itself, so without this the caret lands on `<body>` and posting a
   * second comment would cost an extra tap.
   */
  focusNonce?: number;
}) {
  const teamA = goalTeams.find((t) => t.side === "A");
  const teamB = goalTeams.find((t) => t.side === "B");
  const minuteRef = useRef<HTMLInputElement>(null);

  // Picking the scoring side hands the caret straight to the minute — the one
  // field a goal entry always needs typed.
  useEffect(() => {
    if (mode !== "goal" || goalSide == null) return;
    minuteRef.current?.focus();
  }, [mode, goalSide]);

  const sendLabel = mode === "goal" ? "Post goal" : mode === "shots" ? "Post shots" : "Post comment";

  return (
    <div
      className={cn(
        // Attached to the feed's card: a hairline separates them, nothing floats (T3).
        "z-10 rounded-b-2xl border-t border-border-card-outer/55 bg-bg-card-outer p-2",
        sticky && "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-4",
      )}
      data-comment-composer
    >
      <div className="space-y-2">
        {/* The scope selector takes its own line: "Match 2 — Rumpi vs Roli" has to stay
            readable, and in goal/shots entry it is the label that says which match it is for. */}
        {scopeControl ? <div>{scopeControl}</div> : null}

        {mode === "comment" && (authorControl || allowMatchEventModes) ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {authorControl}
            {allowMatchEventModes ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onModeChange("goal")}
                  disabled={disabled}
                  title="Enter a goal"
                  className="shrink-0 gap-1.5"
                >
                  <Goal size={14} aria-hidden="true" />
                  Goal
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onModeChange("shots")}
                  disabled={disabled}
                  title="Enter shots"
                  className="shrink-0 gap-1.5"
                >
                  <Target size={14} aria-hidden="true" />
                  Shots
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {mode === "comment" && imagePreviewUrl ? (
          <div className="flex items-center gap-2">
            <img src={imagePreviewUrl} alt="" className="h-14 w-[74px] rounded-xl object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-text-muted">Image attached (4:3)</span>
            <Button
              type="button"
              variant="ghost"
              onClick={onOpenImageCropper}
              disabled={disabled}
              title="Replace image"
              aria-label="Replace image"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
            >
              <ImageIcon size={14} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClearImage}
              disabled={disabled}
              title="Remove image"
              aria-label="Remove image"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {mode === "goal" && allowMatchEventModes ? (
          <div className="space-y-2">
            <ModeBadge label="Goal" onLeave={() => onModeChange("comment")} disabled={disabled} />
            <div className="grid grid-cols-2 gap-1.5">
              {goalTeams.map((team) => (
                <Chip
                  key={team.side}
                  selected={goalSide === team.side}
                  onClick={() => onGoalSideChange(team.side)}
                  disabled={disabled}
                  className="min-w-0 text-left"
                  title={`Goal for ${team.label} — makes it ${team.nextScoreline}`}
                >
                  <span className="block truncate">{team.label}</span>
                  <span className="block text-xs opacity-80">{team.nextScoreline}</span>
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-1.5">
              <input
                ref={minuteRef}
                className="input-field"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                step={1}
                value={goalMinute}
                onChange={(e) => onGoalMinuteChange(e.target.value)}
                disabled={disabled}
                placeholder="Min"
                aria-label="Goal minute"
              />
              <input
                className="input-field"
                type="text"
                list={goalSide && goalPlayers.length ? playersListId : undefined}
                placeholder={goalSide ? "Scorer" : "Pick the scoring side first"}
                value={goalPlayerName}
                onChange={(e) => onGoalPlayerNameChange(e.target.value)}
                disabled={disabled || goalSide == null}
                aria-label="Goal scorer"
              />
              {goalSide && goalPlayers.length ? (
                <datalist id={playersListId}>
                  {goalPlayers.map((p) => (
                    <option key={p.label} value={p.label} />
                  ))}
                </datalist>
              ) : null}
            </div>
          </div>
        ) : null}

        {mode === "shots" && allowMatchEventModes ? (
          <div className="space-y-2">
            <ModeBadge label="Shots" onLeave={() => onModeChange("comment")} disabled={disabled} />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <label className="block min-w-0">
                  <span className="block truncate text-xs text-text-muted">{teamA?.label ?? "Team A"}</span>
                  <select
                    className="select-field mt-0.5"
                    value={shotsA}
                    onChange={(e) => onShotsAChange(e.target.value)}
                    disabled={disabled}
                    aria-label={`Shots — ${teamA?.label ?? "Team A"}`}
                  >
                    <option value="">–</option>
                    {SHOTS_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0">
                  <span className="block truncate text-xs text-text-muted">{teamB?.label ?? "Team B"}</span>
                  <select
                    className="select-field mt-0.5"
                    value={shotsB}
                    onChange={(e) => onShotsBChange(e.target.value)}
                    disabled={disabled}
                    aria-label={`Shots — ${teamB?.label ?? "Team B"}`}
                  >
                    <option value="">–</option>
                    {SHOTS_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit || submitting || disabled}
                title={sendLabel}
                aria-label={sendLabel}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
              >
                <Send size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <CommentSendRow
            value={draftBody}
            onChange={onChangeDraftBody}
            onSubmit={onSubmit}
            canSubmit={canSubmit}
            submitting={submitting}
            disabled={disabled}
            ariaLabel={mode === "goal" ? "Goal note" : "Comment"}
            placeholder={mode === "goal" ? "Note (optional)…" : "Write a comment…"}
            sendLabel={sendLabel}
            focusNonce={focusNonce}
            leading={
              mode === "comment" && canAttachImage && !imagePreviewUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onOpenImageCropper}
                  disabled={disabled}
                  title="Attach image"
                  aria-label="Attach image"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
                >
                  <ImageIcon size={16} aria-hidden="true" />
                </Button>
              ) : null
            }
          />
        )}
      </div>
    </div>
  );
}
