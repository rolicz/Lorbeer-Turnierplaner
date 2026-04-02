import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import Textarea from "../../ui/primitives/Textarea";

export type CommentDraftAuthorValue = "general" | number;

export type CommentDraftAuthorOption = {
  value: CommentDraftAuthorValue;
  label: string;
};

export type CommentGoalPlayerOption = {
  id: number;
  label: string;
};

export default function CommentCreateComposer({
  authorOptions,
  authorValue,
  onAuthorChange,
  mode,
  onModeChange,
  goalPlayers,
  goalMinute,
  onGoalMinuteChange,
  goalPlayerId,
  onGoalPlayerChange,
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
  mode: "comment" | "goal";
  onModeChange: (mode: "comment" | "goal") => void;
  goalPlayers: CommentGoalPlayerOption[];
  goalMinute: string;
  onGoalMinuteChange: (value: string) => void;
  goalPlayerId: number | null;
  onGoalPlayerChange: (value: number | null) => void;
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
  const allowGoalMode = goalPlayers.length > 0;

  return (
    <div className={surfaceClassName + " p-3 space-y-3"}>
      <label className="block">
        <div className="input-label">Posted as</div>
        <select
          className="select-field"
          value={authorValue === "general" ? "general" : String(authorValue)}
          onChange={(event) =>
            onAuthorChange(event.target.value === "general" ? "general" : Number(event.target.value))
          }
          disabled={disabled}
        >
          {authorOptions.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {allowGoalMode ? (
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
          </div>
        </div>
      ) : null}

      {mode === "goal" && allowGoalMode ? (
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
            <select
              className="select-field"
              value={goalPlayerId != null ? String(goalPlayerId) : ""}
              onChange={(event) => onGoalPlayerChange(event.target.value ? Number(event.target.value) : null)}
              disabled={disabled}
            >
              <option value="">Choose scorer</option>
              {goalPlayers.map((player) => (
                <option key={player.id} value={String(player.id)}>
                  {player.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
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
      )}

      <div className="flex items-center justify-end">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || disabled}
          title={mode === "goal" ? "Post goal entry" : "Post comment"}
          className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
        >
          <i className="fa-solid fa-paper-plane md:hidden" aria-hidden="true" />
          <span className="hidden md:inline">Post</span>
        </Button>
      </div>
    </div>
  );
}
