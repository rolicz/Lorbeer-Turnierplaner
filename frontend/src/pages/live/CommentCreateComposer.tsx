import { useId } from "react";

import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import Textarea from "../../ui/primitives/Textarea";

export type CommentDraftAuthorValue = "general" | number;
export type CommentCreateMode = "comment" | "goal" | "result";

export type CommentDraftAuthorOption = {
  value: CommentDraftAuthorValue;
  label: string;
};

export type CommentGoalPlayerOption = {
  label: string;
};

export default function CommentCreateComposer({
  authorOptions,
  authorValue,
  onAuthorChange,
  mode,
  onModeChange,
  allowMatchEventModes = false,
  goalPlayers,
  goalMinute,
  onGoalMinuteChange,
  goalPlayerName,
  onGoalPlayerNameChange,
  resultScoreA,
  onResultScoreAChange,
  resultScoreB,
  onResultScoreBChange,
  currentScorelineLabel,
  onUseCurrentScore,
  draftBody,
  onChangeDraftBody,
  canAttachImage = false,
  imagePreviewUrl = null,
  onOpenImageCropper,
  onClearImage,
  onSubmit,
  canSubmit,
  disabled = false,
  surfaceClassName = "panel-subtle",
}: {
  authorOptions: CommentDraftAuthorOption[];
  authorValue: CommentDraftAuthorValue;
  onAuthorChange: (value: CommentDraftAuthorValue) => void;
  mode: CommentCreateMode;
  onModeChange: (mode: CommentCreateMode) => void;
  allowMatchEventModes?: boolean;
  goalPlayers: CommentGoalPlayerOption[];
  goalMinute: string;
  onGoalMinuteChange: (value: string) => void;
  goalPlayerName: string;
  onGoalPlayerNameChange: (value: string) => void;
  resultScoreA: string;
  onResultScoreAChange: (value: string) => void;
  resultScoreB: string;
  onResultScoreBChange: (value: string) => void;
  currentScorelineLabel?: string | null;
  onUseCurrentScore?: (() => void) | null;
  draftBody: string;
  onChangeDraftBody: (value: string) => void;
  canAttachImage?: boolean;
  imagePreviewUrl?: string | null;
  onOpenImageCropper?: () => void;
  onClearImage?: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  disabled?: boolean;
  surfaceClassName?: string;
}) {
  const playersListId = useId();

  return (
    <div className={surfaceClassName + " p-3 space-y-3"}>
      <label className="block">
        <div className="input-label">Posted as</div>
        <select
          className="select-field"
          value={authorValue === "general" ? "general" : String(authorValue)}
          onChange={(event) => onAuthorChange(event.target.value === "general" ? "general" : Number(event.target.value))}
          disabled={disabled}
        >
          {authorOptions.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {allowMatchEventModes ? (
        <div className="space-y-2">
          <div className="input-label">Entry type</div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === "comment" ? "solid" : "ghost"}
              onClick={() => onModeChange("comment")}
              disabled={disabled}
              className="h-9 px-3 inline-flex items-center justify-center"
            >
              Comment
            </Button>
            <Button
              type="button"
              variant={mode === "goal" ? "solid" : "ghost"}
              onClick={() => onModeChange("goal")}
              disabled={disabled}
              className="h-9 px-3 inline-flex items-center justify-center"
            >
              Goal
            </Button>
            <Button
              type="button"
              variant={mode === "result" ? "solid" : "ghost"}
              onClick={() => onModeChange("result")}
              disabled={disabled}
              className="h-9 px-3 inline-flex items-center justify-center"
            >
              Result
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "goal" && allowMatchEventModes ? (
        <div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)]">
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
              list={goalPlayers.length ? playersListId : undefined}
              placeholder="Ronaldo"
              value={goalPlayerName}
              onChange={(event) => onGoalPlayerNameChange(event.target.value)}
              disabled={disabled}
            />
            {goalPlayers.length ? (
              <datalist id={playersListId}>
                {goalPlayers.map((player) => (
                  <option key={player.label} value={player.label} />
                ))}
              </datalist>
            ) : null}
          </label>
        </div>
      ) : null}

      {mode === "result" && allowMatchEventModes ? (
        <div className="space-y-2">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Input
              label="Score A"
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              value={resultScoreA}
              onChange={(event) => onResultScoreAChange(event.target.value)}
              disabled={disabled}
            />
            <Input
              label="Score B"
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              step={1}
              value={resultScoreB}
              onChange={(event) => onResultScoreBChange(event.target.value)}
              disabled={disabled}
            />
          </div>
          {currentScorelineLabel && onUseCurrentScore ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={onUseCurrentScore}
                disabled={disabled}
                className="h-9 px-3 inline-flex items-center justify-center"
              >
                {currentScorelineLabel}
              </Button>
            </div>
          ) : null}
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

      <div className="flex items-center justify-end">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || disabled}
          title={mode === "goal" ? "Post goal entry" : mode === "result" ? "Post result update" : "Post comment"}
          className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
        >
          <i className="fa-solid fa-paper-plane md:hidden" aria-hidden="true" />
          <span className="hidden md:inline">Post</span>
        </Button>
      </div>
    </div>
  );
}
