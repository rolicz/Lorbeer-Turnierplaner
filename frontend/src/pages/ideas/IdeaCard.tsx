/**
 * One idea in the feed: a level-2 `inset` row inside the board's single card
 * (`DESIGN.md` §3/§9b), with the two editors it can open in place.
 *
 * Two different jobs, so two triggers, each naming what it edits (§9b):
 * **Edit** rewrites the author's own text; tapping the **status pill** — admin only —
 * triages it. Which of them a viewer sees is not decided here: the payload carries
 * `can_edit` / `can_delete` / `can_set_status`, computed server-side, and this
 * component renders them.
 *
 * Below the actions row sits the flat comment thread (`IdeaComments.tsx`, P4):
 * a comment cannot be edited, so its own flag is `can_delete` alone.
 */
import { Check, ImageIcon, Pencil, Save, Trash2, Users, X } from "lucide-react";
import { useState } from "react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import PlayerLink from "../../ui/primitives/PlayerLink";
import VoteButton from "../../ui/primitives/VoteButton";
import { Pill } from "../../ui/primitives/Pill";
import { cn } from "../../ui/cn";
import { fmtDateTime } from "../../utils/format";
import { ideaImageUrl } from "../../api/ideas.api";
import type { Idea, IdeaArea, IdeaComment, IdeaKind, IdeaStatus } from "../../api/types";
import {
  IDEA_KIND_ICON,
  IDEA_KIND_LABEL,
  IDEA_STATUSES,
  IDEA_STATUS_ICON,
  IDEA_STATUS_LABEL,
  areaLabel,
  ideaStatusPillClass,
} from "./ideaMeta";
import { IdeaAreasField, IdeaBodyField, IdeaKindField, IdeaTitleInput } from "./IdeaFields";
import IdeaComments from "./IdeaComments";

export type IdeaCardHandlers = {
  areaCatalog: IdeaArea[];
  avatarUpdatedAtByPlayerId: Map<number, string>;
  onVote: (idea: Idea, value: 0 | 1) => void;
  onOpenVoters: (idea: Idea) => void;
  onOpenImage: (src: string) => void;
  onRequestDelete: (idea: Idea) => void;
  onSave: (idea: Idea, patch: { title: string; body: string; kind: IdeaKind; areas: string[] }) => Promise<void>;
  onSaveStatus: (idea: Idea, status: IdeaStatus, note: string) => Promise<void>;
  onReplaceImage: (idea: Idea) => void;
  onRemoveImage: (idea: Idea) => void;
  /** Reading marks read: called when a viewer expands an idea's comments (P4/P1). */
  onOpenComments: (idea: Idea) => void;
  onPostComment: (idea: Idea, body: string) => Promise<void>;
  onRequestDeleteComment: (comment: IdeaComment) => void;
  savingId: number | null;
};

export default function IdeaCard({
  idea,
  flash,
  handlers,
}: {
  idea: Idea;
  flash: boolean;
  handlers: IdeaCardHandlers;
}) {
  const {
    areaCatalog,
    avatarUpdatedAtByPlayerId,
    onVote,
    onOpenVoters,
    onOpenImage,
    onRequestDelete,
    onSave,
    onSaveStatus,
    onReplaceImage,
    onRemoveImage,
    onOpenComments,
    onPostComment,
    onRequestDeleteComment,
    savingId,
  } = handlers;

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(idea.title);
  const [body, setBody] = useState(idea.body);
  const [kind, setKind] = useState<IdeaKind>(idea.kind);
  const [areas, setAreas] = useState<string[]>(idea.areas);

  const [statusOpen, setStatusOpen] = useState(false);
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [note, setNote] = useState(idea.status_note);

  // The deep link (`?idea=`) forces the thread open; its own read-marking
  // lives in the page's effect, so this does not call `onOpenComments` again.
  // Adjusted during render, not an effect (react-hooks/set-state-in-effect):
  // the React-endorsed "store the previous prop and compare" shape.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [prevFlash, setPrevFlash] = useState(flash);
  if (flash !== prevFlash) {
    setPrevFlash(flash);
    if (flash) setCommentsOpen(true);
  }

  function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) onOpenComments(idea);
  }

  const busy = savingId === idea.id;
  const edited = !!idea.edited_at;
  const KindIcon = IDEA_KIND_ICON[idea.kind];
  const StatusIcon = IDEA_STATUS_ICON[idea.status];

  function startEdit() {
    setTitle(idea.title);
    setBody(idea.body);
    setKind(idea.kind);
    setAreas(idea.areas);
    setStatusOpen(false);
    setEditing(true);
  }

  function startStatus() {
    setStatus(idea.status);
    setNote(idea.status_note);
    setEditing(false);
    setStatusOpen(true);
  }

  const statusPill = (
    <Pill className={ideaStatusPillClass(idea.status)} title={`Status: ${IDEA_STATUS_LABEL[idea.status]}`}>
      <StatusIcon size={12} aria-hidden="true" />
      {IDEA_STATUS_LABEL[idea.status]}
    </Pill>
  );

  return (
    <div
      id={`idea-${idea.id}`}
      className={cn(
        "inset scroll-mt-28 transition sm:scroll-mt-32",
        flash && "ring-2 ring-accent/60",
      )}
    >
      {/* Who, when */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <PlayerLink playerId={idea.author_player_id} name={idea.author_display_name} decorative>
            <AvatarCircle
              playerId={idea.author_player_id}
              name={idea.author_display_name}
              updatedAt={avatarUpdatedAtByPlayerId.get(idea.author_player_id) ?? null}
              sizeClass="h-7 w-7"
              fallbackClassName="text-xs font-semibold text-text-muted"
            />
          </PlayerLink>
          <div className="min-w-0">
            <PlayerLink
              playerId={idea.author_player_id}
              name={idea.author_display_name}
              className="block truncate text-xs font-semibold text-text-normal"
            >
              {idea.author_display_name}
            </PlayerLink>
            <div className="truncate text-xs text-text-muted">
              {fmtDateTime(idea.created_at)}
              {edited ? " · edited" : ""}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {idea.can_set_status ? (
            <button
              type="button"
              onClick={() => (statusOpen ? setStatusOpen(false) : startStatus())}
              aria-expanded={statusOpen}
              title="Set the status of this idea"
              className="focus-ring rounded-full"
            >
              {statusPill}
            </button>
          ) : (
            statusPill
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <IdeaTitleInput value={title} onChange={setTitle} disabled={busy} />
          <IdeaBodyField value={body} onChange={setBody} disabled={busy} />
          <IdeaKindField value={kind} onChange={setKind} disabled={busy} />
          <IdeaAreasField catalog={areaCatalog} value={areas} onChange={setAreas} disabled={busy} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {idea.has_image ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReplaceImage(idea)}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <ImageIcon size={14} aria-hidden="true" />
                  Replace image
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveImage(idea)}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <X size={14} aria-hidden="true" />
                  Remove image
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onReplaceImage(idea)}
                disabled={busy}
                className="gap-1.5"
              >
                <ImageIcon size={14} aria-hidden="true" />
                Attach image
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSave(idea, { title: title.trim(), body: body.trim(), kind, areas }).then(() =>
                  setEditing(false),
                );
              }}
              disabled={busy || !title.trim() || areas.length === 0}
              className="gap-1.5"
            >
              <Save size={14} aria-hidden="true" />
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <h3 className="text-sm font-semibold text-text-normal">{idea.title}</h3>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip inline-flex items-center gap-1.5">
              <KindIcon size={12} className="text-text-muted" aria-hidden="true" />
              {IDEA_KIND_LABEL[idea.kind]}
            </span>
            {idea.areas.map((a) => (
              <span key={a} className="chip">
                {areaLabel(a, areaCatalog)}
              </span>
            ))}
          </div>

          {idea.status_note ? (
            <div className="text-xs text-text-muted">
              <span className="font-medium text-text-normal">{IDEA_STATUS_LABEL[idea.status]}</span>
              {" — "}
              {idea.status_note}
            </div>
          ) : null}

          {idea.body ? <div className="whitespace-pre-wrap text-sm">{idea.body}</div> : null}

          {idea.has_image ? (
            <button
              type="button"
              className="focus-ring block w-full rounded-xl"
              onClick={() => onOpenImage(ideaImageUrl(idea.id, idea.image_updated_at))}
              title="Open screenshot"
            >
              <img
                src={ideaImageUrl(idea.id, idea.image_updated_at)}
                alt=""
                className="aspect-[4/3] w-full cursor-zoom-in rounded-xl object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <VoteButton
              direction="up"
              active={idea.my_vote === 1}
              count={idea.votes}
              onVote={() => onVote(idea, idea.my_vote === 1 ? 0 : 1)}
              title={idea.my_vote === 1 ? "Take your vote back" : "I want this too"}
            />
            {idea.votes > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenVoters(idea)}
                title="Show who wants this"
                aria-label="Show who wants this"
                className="inline-flex h-8 w-8 items-center justify-center p-0"
              >
                <Users size={14} className="text-text-muted" aria-hidden="true" />
              </Button>
            ) : null}

            <span className="ms-auto inline-flex items-center gap-1.5">
              {idea.can_edit ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={startEdit}
                  title="Edit this idea"
                  className="inline-flex h-8 w-8 items-center justify-center p-0 md:w-auto md:px-3"
                >
                  <Pencil size={14} className="md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Edit</span>
                </Button>
              ) : null}
              {idea.can_delete ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onRequestDelete(idea)}
                  title="Delete this idea"
                  className="inline-flex h-8 w-8 items-center justify-center p-0 md:w-auto md:px-3"
                >
                  <Trash2 size={14} className="md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Delete</span>
                </Button>
              ) : null}
            </span>
          </div>

          <IdeaComments
            idea={idea}
            open={commentsOpen}
            onToggle={toggleComments}
            avatarUpdatedAtByPlayerId={avatarUpdatedAtByPlayerId}
            onPost={onPostComment}
            onRequestDelete={onRequestDeleteComment}
          />
        </div>
      )}

      {/* Triage, opened from the pill it changes (§9b). */}
      {statusOpen && idea.can_set_status ? (
        <div className="mt-2 space-y-2 border-t border-border-card-chip/40 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-label">Status</span>
            <select
              className="select-field w-auto"
              value={status}
              onChange={(e) => setStatus(e.target.value as IdeaStatus)}
              disabled={busy}
              aria-label="Status"
            >
              {IDEA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {IDEA_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            className="input-field"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            aria-label="Status note"
            placeholder="Why? (optional, shown under the status)"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setStatusOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void onSaveStatus(idea, status, note.trim()).then(() => setStatusOpen(false));
              }}
              disabled={busy}
              className="gap-1.5"
            >
              <Check size={14} aria-hidden="true" />
              {busy ? "Saving…" : "Set status"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
