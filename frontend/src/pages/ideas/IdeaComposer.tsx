/**
 * Writing an idea (R5). One row on the bottom edge of the feed's card — never a
 * second card floating beside it (`DESIGN.md` §9b, the mistake A8 had to undo in
 * the guestbook).
 *
 *   [ Share an idea…                                  ] [➤]
 *
 * An idea needs more than a sentence, so the row **grows in place** when you reach
 * for it — the same move the comment composer makes when it swaps into goal entry.
 * Focusing the field opens the block above it (title · kind · where · screenshot)
 * and hands the caret to the title, exactly the way picking a scoring side hands it
 * to the minute; the field on the bottom edge stays what it always was, the place
 * you type, and `Details` is what it becomes.
 */
import { ImageIcon, Lightbulb, Send, X } from "lucide-react";
import { useEffect, useRef } from "react";

import Button from "../../ui/primitives/Button";
import { CommentSendRow } from "../live/comments/CommentComposer";
import type { IdeaArea, IdeaKind } from "../../api/types";
import { IdeaAreasField, IdeaKindField, IdeaTitleInput } from "./IdeaFields";

export type IdeaDraft = {
  title: string;
  body: string;
  kind: IdeaKind;
  areas: string[];
};

export default function IdeaComposer({
  open,
  onOpen,
  onClose,
  draft,
  onChange,
  areaCatalog,
  imagePreviewUrl,
  onOpenImageCropper,
  onClearImage,
  onSubmit,
  submitting = false,
  focusNonce,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  draft: IdeaDraft;
  onChange: (next: Partial<IdeaDraft>) => void;
  areaCatalog: IdeaArea[];
  imagePreviewUrl: string | null;
  onOpenImageCropper: () => void;
  onClearImage: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  /** Bumped after a post, to put the caret back where a second idea would start. */
  focusNonce?: number;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  // Opening hands the caret to the title: that is the field you came to fill in.
  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
  }, [open]);

  const canSubmit = !!draft.title.trim() && draft.areas.length > 0;

  return (
    <div
      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 rounded-b-2xl border-t border-border-card-outer/55 bg-bg-card-outer p-2 lg:bottom-0"
      data-idea-composer
    >
      <div className="space-y-2">
        {open ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="chip inline-flex items-center gap-1.5 text-accent">
                <Lightbulb size={12} aria-hidden="true" />
                New idea
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
                title="Close the composer"
                aria-label="Close the composer"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </div>

            <IdeaTitleInput
              ref={titleRef}
              value={draft.title}
              onChange={(title) => onChange({ title })}
              disabled={submitting}
            />
            <IdeaKindField
              value={draft.kind}
              onChange={(kind) => onChange({ kind })}
              disabled={submitting}
            />
            <IdeaAreasField
              catalog={areaCatalog}
              value={draft.areas}
              onChange={(areas) => onChange({ areas })}
              disabled={submitting}
            />

            {imagePreviewUrl ? (
              <div className="flex items-center gap-2">
                <img src={imagePreviewUrl} alt="" className="h-14 w-[74px] rounded-xl object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
                  Screenshot attached (4:3)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onOpenImageCropper}
                  disabled={submitting}
                  title="Replace screenshot"
                  aria-label="Replace screenshot"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
                >
                  <ImageIcon size={14} aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClearImage}
                  disabled={submitting}
                  title="Remove screenshot"
                  aria-label="Remove screenshot"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {open ? (
          <CommentSendRow
            value={draft.body}
            onChange={(body) => onChange({ body })}
            onSubmit={onSubmit}
            canSubmit={canSubmit}
            submitting={submitting}
            ariaLabel="Idea details"
            placeholder="Details (optional) — what should happen, and why?"
            sendLabel="Post idea"
            focusNonce={focusNonce}
            leading={
              imagePreviewUrl ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onOpenImageCropper}
                  disabled={submitting}
                  title="Attach a screenshot"
                  aria-label="Attach a screenshot"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
                >
                  <ImageIcon size={16} aria-hidden="true" />
                </Button>
              )
            }
          />
        ) : (
          /* Closed: one field and its send button, the shape every feed in this app
             ends with. Focusing it *is* starting an idea — nothing hides behind a
             button that reveals a form (§9b). */
          <div className="flex items-end gap-1.5">
            <IdeaTitleInput
              value={draft.title}
              onChange={(title) => onChange({ title })}
              onFocus={onOpen}
              placeholder="Share an idea…"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={onOpen}
              title="Write an idea"
              aria-label="Write an idea"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
            >
              <Send size={16} aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
