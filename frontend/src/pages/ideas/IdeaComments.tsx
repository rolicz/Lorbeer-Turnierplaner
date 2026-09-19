/**
 * A flat comment list under an idea (P4, riding on P1's `IdeaOut.comments`).
 *
 * An idea row *is* the level-2 `inset` (`IdeaCard.tsx`), and inset → inset is
 * forbidden (`DESIGN.md` §3), so its comments take the shape a guestbook reply
 * already uses (§9b, `GuestbookEntryCard.tsx`): flat rows behind an accent
 * rail on the idea's own surface, never a surface of their own.
 *
 * Comments cannot be edited (Roli, 2026-09-19 — "it can stay a flat list").
 * `can_delete` is a comment's whole permission surface: no `Pencil`, no inline
 * editor, no "edited" byline — `updated_at` is never written and is not read
 * here.
 */
import { useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import PlayerLink from "../../ui/primitives/PlayerLink";
import { CommentSendRow } from "../live/comments/CommentComposer";
import { fmtCount, fmtDateTime } from "../../utils/format";
import type { Idea, IdeaComment } from "../../api/types";

export default function IdeaComments({
  idea,
  token,
  open,
  onToggle,
  avatarUpdatedAtByPlayerId,
  onPost,
  onRequestDelete,
}: {
  idea: Idea;
  token: string | null;
  open: boolean;
  onToggle: () => void;
  avatarUpdatedAtByPlayerId: Map<number, string>;
  onPost: (idea: Idea, body: string) => Promise<void>;
  onRequestDelete: (comment: IdeaComment) => void;
}) {
  const comments = idea.comments;
  const count = comments.length;

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);

  // Nothing to open and nothing to do about it: a control that does nothing
  // is never shown (§9b).
  if (count === 0 && !token) return null;

  async function handlePost() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await onPost(idea, body);
      setDraft("");
      setFocusNonce((n) => n + 1);
    } catch {
      // surfaced by the page's ErrorToastOnError
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "Hide comments" : "Show comments"}
        className="inline-flex h-8 items-center gap-1.5 px-2 text-xs"
      >
        <MessageSquare size={14} aria-hidden="true" />
        {count > 0 ? fmtCount(count, "comment", "comments") : "Comment"}
      </Button>

      {open ? (
        <div className="mt-2 space-y-2 border-l-2 border-accent/25 pl-3">
          {comments.map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <PlayerLink playerId={c.author_player_id} name={c.author_display_name} decorative>
                    <AvatarCircle
                      playerId={c.author_player_id}
                      name={c.author_display_name}
                      updatedAt={avatarUpdatedAtByPlayerId.get(c.author_player_id) ?? null}
                      sizeClass="h-6 w-6"
                      fallbackClassName="text-xs font-semibold text-text-muted"
                    />
                  </PlayerLink>
                  <div className="min-w-0">
                    <PlayerLink
                      playerId={c.author_player_id}
                      name={c.author_display_name}
                      className="block truncate text-xs font-semibold text-text-normal"
                    >
                      {c.author_display_name}
                    </PlayerLink>
                    <div className="truncate text-xs text-text-muted">{fmtDateTime(c.created_at)}</div>
                  </div>
                </div>
                {c.can_delete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onRequestDelete(c)}
                    title="Delete comment"
                    className="h-7 w-7 shrink-0 p-0"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap text-sm">{c.body}</div>
            </div>
          ))}

          {token ? (
            <CommentSendRow
              value={draft}
              onChange={setDraft}
              onSubmit={() => void handlePost()}
              canSubmit={!!draft.trim()}
              submitting={posting}
              placeholder="Write a comment…"
              ariaLabel="Comment on this idea"
              sendLabel="Post comment"
              focusNonce={focusNonce}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
