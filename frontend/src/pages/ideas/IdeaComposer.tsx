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
 * to the minute; the bottom edge stays the place you type, and `Details` — a real
 * three-line field, `IdeaFields`' `IdeaBodyField`, not a chat row (Q1) — is what it
 * becomes, over the form's own send row.
 */
import { ImageIcon, Lightbulb, Send, X } from "lucide-react";
import { useEffect, useRef } from "react";

import Button from "../../ui/primitives/Button";
import type { IdeaArea, IdeaKind } from "../../api/types";
import { IdeaAreasField, IdeaBodyField, IdeaKindField, IdeaTitleInput } from "./IdeaFields";

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
  // `preventScroll`, because the composer is pinned to the bottom of the viewport
  // and needs no scrolling to reach: left to itself the browser scrolls the newly
  // focused title to the top of a short viewport, which drags the send row below
  // the fold — measured at 390x400, where the taller details field made the drop
  // long enough to hide it completely (Q1).
  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [open]);

  const canSubmit = !!draft.title.trim() && draft.areas.length > 0;

  return (
    <div
      className="sticky bottom-nav-clear z-10 rounded-b-2xl border-t border-border-card-outer/55 bg-bg-card-outer p-2 lg:bottom-0"
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
          <>
            {/* Details stays the last field, not second the way the edit form has it:
                it is the one you are still typing when the keyboard is up, so it
                belongs nearest the keyboard, with only its own send row below it. */}
            <IdeaBodyField
              value={draft.body}
              onChange={(body) => onChange({ body })}
              onSubmit={() => {
                if (canSubmit && !submitting) onSubmit();
              }}
              disabled={submitting}
              focusNonce={focusNonce}
            />
            {/* Send posts the *idea*, not the details — it is enabled while this field
                is empty — so it is the form's own row rather than a button welded to
                the field's edge, and the screenshot next to it is the secondary of the
                pair: one icon, one that fills (`DESIGN.md` §9b). */}
            <div className="flex items-center gap-1.5">
              {imagePreviewUrl ? null : (
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
              )}
              <Button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit || submitting}
                title="Post idea"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5"
              >
                <Send size={16} aria-hidden="true" />
                {submitting ? "Posting…" : "Post idea"}
              </Button>
            </div>
          </>
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
