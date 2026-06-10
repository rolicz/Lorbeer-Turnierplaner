import { useId } from "react";

import Button from "../../ui/primitives/Button";
import FilterSelect from "../../ui/FilterSelect";
import Input from "../../ui/primitives/Input";
import Textarea from "../../ui/primitives/Textarea";

export type CommentDraftAuthorValue = "general" | number;
export type CommentCreateMode = "comment" | "goal" | "shots";

export type CommentDraftAuthorOption = {
  value: CommentDraftAuthorValue;
  label: string;
};

export type CommentGoalPlayerOption = {
  label: string;
};

export type CommentGoalSide = "A" | "B";

export type CommentGoalTeamOption = {
  side: CommentGoalSide;
  label: string;
  nextScoreline: string;
};

export default function CommentCreateComposer({
  authorOptions,
  authorValue,
  onAuthorChange,
  mode,
  onModeChange,
  allowMatchEventModes = false,
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
  onCancel,
  canSubmit,
  disabled = false,
  surfaceClassName = "panel-subtle p-3",
}: {
  authorOptions: CommentDraftAuthorOption[];
  authorValue: CommentDraftAuthorValue;
  onAuthorChange: (value: CommentDraftAuthorValue) => void;
  mode: CommentCreateMode;
  onModeChange: (mode: CommentCreateMode) => void;
  allowMatchEventModes?: boolean;
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
  onCancel?: () => void;
  canSubmit: boolean;
  disabled?: boolean;
  surfaceClassName?: string;
}) {
  const playersListId = useId();

  return (
    <div className={surfaceClassName + " space-y-3"}>
      <div className="block">
        <div className="input-label">Posted as</div>
        <FilterSelect
          value={authorValue === "general" ? "general" : String(authorValue)}
          onChange={(v) => onAuthorChange(v === "general" ? "general" : Number(v))}
          disabled={disabled}
          ariaLabel="Posted as"
          options={authorOptions.map((option) => ({ value: String(option.value), label: option.label }))}
        />
      </div>

      {allowMatchEventModes ? (
        <div className="space-y-2">
          <div className="input-label">Entry type</div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={mode === "comment" ? "solid" : "ghost"}
              onClick={() => onModeChange("comment")}
              disabled={disabled}
              className="h-9 px-2 inline-flex items-center justify-center gap-1.5"
            >
              <i className="fa-solid fa-comment" aria-hidden="true" />
              <span className="truncate">Comment</span>
            </Button>
            <Button
              type="button"
              variant={mode === "goal" ? "solid" : "ghost"}
              onClick={() => onModeChange("goal")}
              disabled={disabled}
              className="h-9 px-2 inline-flex items-center justify-center gap-1.5"
            >
              <i className="fa-solid fa-futbol" aria-hidden="true" />
              <span className="truncate">Goal</span>
            </Button>
            <Button
              type="button"
              variant={mode === "shots" ? "solid" : "ghost"}
              onClick={() => onModeChange("shots")}
              disabled={disabled}
              className="h-9 px-2 inline-flex items-center justify-center gap-1.5"
            >
              <i className="fa-solid fa-bullseye" aria-hidden="true" />
              <span className="truncate">Shots</span>
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "shots" && allowMatchEventModes ? (
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            label={`Shots — ${goalTeams.find((t) => t.side === "A")?.label ?? "Team A"}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            step={1}
            value={shotsA}
            onChange={(event) => onShotsAChange(event.target.value)}
            disabled={disabled}
          />
          <Input
            label={`Shots — ${goalTeams.find((t) => t.side === "B")?.label ?? "Team B"}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={999}
            step={1}
            value={shotsB}
            onChange={(event) => onShotsBChange(event.target.value)}
            disabled={disabled}
          />
        </div>
      ) : null}

      {mode === "goal" && allowMatchEventModes ? (
        <div className="space-y-2">
          <div className="space-y-2">
            <div className="input-label">Scoring side</div>
            <div className="grid gap-2 md:grid-cols-2">
              {goalTeams.map((team) => (
                <Button
                  key={team.side}
                  type="button"
                  variant={goalSide === team.side ? "solid" : "ghost"}
                  onClick={() => onGoalSideChange(team.side)}
                  disabled={disabled}
                  className="min-h-[56px] px-3 py-2 inline-flex items-start justify-start text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">Goal for {team.label}</span>
                    <span className="block text-xs opacity-80">Makes it {team.nextScoreline}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)]">
            <Input
              label="Minute"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              step={1}
              value={goalMinute}
              onChange={(event) => onGoalMinuteChange(event.target.value)}
              disabled={disabled}
            />
            <label className="block">
              <div className="input-label">Player</div>
              <input
                className="input-field"
                type="text"
                list={goalSide && goalPlayers.length ? playersListId : undefined}
                placeholder={goalSide ? "Krankl" : "Select scoring side first"}
                value={goalPlayerName}
                onChange={(event) => onGoalPlayerNameChange(event.target.value)}
                disabled={disabled || goalSide == null}
              />
              {goalSide && goalPlayers.length ? (
                <datalist id={playersListId}>
                  {goalPlayers.map((player) => (
                    <option key={player.label} value={player.label} />
                  ))}
                </datalist>
              ) : null}
            </label>
          </div>
          <Textarea
            label="Goal comment (optional)"
            placeholder="Optional goal note…"
            value={draftBody}
            onChange={(event) => onChangeDraftBody(event.target.value)}
            disabled={disabled}
          />
        </div>
      ) : null}

      {mode === "comment" ? (
        <>
          <Textarea
            label="Comment"
            placeholder="Write a comment…"
            value={draftBody}
            onChange={(event) => onChangeDraftBody(event.target.value)}
            disabled={disabled}
          />

          {canAttachImage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-text-muted">Image (4:3, 1920x1440)</div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onOpenImageCropper}
                    disabled={disabled}
                    className="h-9 px-3 inline-flex items-center justify-center gap-2"
                    title={imagePreviewUrl ? "Replace image" : "Attach image"}
                  >
                    <i className="fa-solid fa-image md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">{imagePreviewUrl ? "Replace" : "Attach"}</span>
                  </Button>
                  {imagePreviewUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onClearImage}
                      disabled={disabled}
                      className="h-9 w-9 p-0 inline-flex items-center justify-center"
                      title="Remove image"
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {imagePreviewUrl ? (
                <div className="panel-subtle p-2">
                  <img src={imagePreviewUrl} alt="" className="w-full rounded-lg object-cover aspect-[4/3]" />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border-card-chip/40 pt-3">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || disabled}
          title={mode === "goal" ? "Post goal entry" : mode === "shots" ? "Post shots entry" : "Post comment"}
          className="inline-flex items-center justify-center gap-2 px-4"
        >
          <i className="fa-solid fa-paper-plane" aria-hidden="true" />
          <span>{mode === "goal" ? "Post goal" : mode === "shots" ? "Post shots" : "Post"}</span>
        </Button>
      </div>
    </div>
  );
}
