import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import type { Player } from "../../api/types";
import { commentImageUrl, createTournamentComment, listTournamentComments, putCommentImage } from "../../api/comments.api";
import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";
import { markCommentSeen } from "../../seenComments";

function fmtTs(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MatchCommentsPanel({
  tournamentId,
  matchId,
  canWrite,
  playersInMatch,
}: {
  tournamentId: number;
  matchId: number;
  canWrite: boolean;
  playersInMatch: Player[];
}) {
  const qc = useQueryClient();
  const { token, role } = useAuth();
  const canAttachImage = role === "admin" || role === "editor";
  const seen = useSeenSet(tournamentId);

  const [author, setAuthor] = useState<"general" | number>("general");
  const [text, setText] = useState("");
  const [draftImageBlob, setDraftImageBlob] = useState<Blob | null>(null);
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(null);
  const [imageCropOpen, setImageCropOpen] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [flashId, setFlashId] = useState<number | null>(null);

  const idsOk =
    typeof tournamentId === "number" &&
    Number.isFinite(tournamentId) &&
    tournamentId > 0 &&
    typeof matchId === "number" &&
    Number.isFinite(matchId) &&
    matchId > 0;

  const commentsQ = useQuery({
    queryKey: ["comments", tournamentId],
    queryFn: () => listTournamentComments(tournamentId),
    enabled: Number.isFinite(tournamentId) && tournamentId > 0,
  });

  const avatarMetaQ = useQuery({ queryKey: ["players", "avatars"], queryFn: listPlayerAvatarMeta });
  const avatarUpdatedAtByPlayerId = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of avatarMetaQ.data ?? []) m.set(r.player_id, r.updated_at);
    return m;
  }, [avatarMetaQ.data]);

  function setDraftImage(blob: Blob | null) {
    setDraftImageBlob(blob);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }

  useEffect(() => {
    return () => {
      if (draftImagePreviewUrl) URL.revokeObjectURL(draftImagePreviewUrl);
    };
  }, [draftImagePreviewUrl]);

  const matchComments = useMemo(() => {
    const raw = commentsQ.data?.comments ?? [];
    return raw
      .filter((c) => c.match_id === matchId)
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  }, [commentsQ.data, matchId]);

  const byId = useMemo(() => new Map(playersInMatch.map((p) => [p.id, p.display_name])), [playersInMatch]);
  const authorLabel = (authorPlayerId: number | null) =>
    authorPlayerId == null ? "General" : byId.get(authorPlayerId) ?? `#${authorPlayerId}`;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!Number.isFinite(tournamentId) || tournamentId <= 0) throw new Error("Missing tournament id");
      if (!Number.isFinite(matchId) || matchId <= 0) throw new Error("Missing match id");
      if (!token) throw new Error("Not logged in");
      const author_player_id = author === "general" ? null : author;
      const created = await createTournamentComment(token, tournamentId, {
        match_id: matchId,
        author_player_id,
        body: text.trim(),
        has_image: !!draftImageBlob,
      });
      if (draftImageBlob) {
        try {
          await putCommentImage(token, created.id, draftImageBlob, "comment.webp");
        } catch (e: any) {
          showErrorToast(String(e?.message ?? e), "Comment image upload failed");
        }
      }
      return created;
    },
    onSuccess: async (created) => {
      setPendingScrollId(created.id);
      setText("");
      setDraftImage(null);
      setAuthor("general");
      setImageCropOpen(false);
      setComposerOpen(false);
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
    },
  });

  useEffect(() => {
    if (!pendingScrollId) return;
    const section = document.getElementById(`current-match-comments-${matchId}`);
    const el = document.getElementById(`match-comment-${pendingScrollId}`);
    if (!section || !el) return;

    // Defer until layout stabilizes (composer collapsing + query refresh).
    requestAnimationFrame(() => {
      const nav = document.querySelector(".nav-shell") as HTMLElement | null;
      const navH = nav?.getBoundingClientRect().height ?? 0;

      // Scroll so the new comment ends up at the bottom of the viewport (nice for quickly reading it).
      requestAnimationFrame(() => {
        const bottomPad = 10;
        const r = el.getBoundingClientRect();
        const yBottom = window.scrollY + r.bottom - (window.innerHeight - bottomPad);
        window.scrollTo({ top: Math.max(0, yBottom), behavior: "smooth" });

        setFlashId(null);
        requestAnimationFrame(() => setFlashId(pendingScrollId));
        window.setTimeout(() => setFlashId(null), 1800);
        setPendingScrollId(null);
      });
    });
  }, [pendingScrollId, commentsQ.dataUpdatedAt]);

  return (
    <>
    <div id={`current-match-comments-${matchId}`}>
      <CollapsibleCard
        title="Match comments"
        defaultOpen={false}
        className="panel-inner"
        right={
          matchComments.length ? (
            <span className="text-xs text-text-muted">{matchComments.length}</span>
          ) : null
        }
      >
        <div className="space-y-2">
        <ErrorToastOnError error={commentsQ.error} title="Comments loading failed" />
        <ErrorToastOnError error={createMut.error} title="Could not post comment" />
        {commentsQ.isLoading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : matchComments.length === 0 ? (
          <div className="text-sm text-text-muted">No comments yet.</div>
        ) : (
          <div className="space-y-2">
	            {matchComments.map((c) => (
	              <div
	                key={c.id}
	                id={`match-comment-${c.id}`}
	                className={
	                  "panel-subtle p-3 scroll-mt-28 sm:scroll-mt-32 " + (flashId === c.id ? "comment-attn" : "")
	                }
	              >
	                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
	                  {c.author_player_id != null ? (
	                    <span className="panel-subtle inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full shrink-0">
	                      {avatarUpdatedAtByPlayerId.has(c.author_player_id) ? (
	                        <img
	                          src={playerAvatarUrl(
	                            c.author_player_id,
	                            avatarUpdatedAtByPlayerId.get(c.author_player_id) ?? null
	                          )}
	                          alt=""
	                          className="h-full w-full object-cover"
	                          loading="lazy"
	                          decoding="async"
	                        />
	                      ) : (
	                        <span className="text-[12px] font-semibold text-text-muted">
	                          {(authorLabel(c.author_player_id) || "?").trim().slice(0, 1).toUpperCase()}
	                        </span>
	                      )}
	                    </span>
	                  ) : null}
	                  <div className="text-xs font-semibold text-text-normal truncate">{authorLabel(c.author_player_id)}</div>
                    </div>

                    {!seen.has(c.id) ? (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markCommentSeen(tournamentId, c.id);
                        }}
                        title="Mark as read"
                        className="h-8 w-8 p-0 inline-flex items-center justify-center shrink-0"
                      >
                        <i className="fa-solid fa-envelope text-accent motion-safe:animate-pulse" aria-hidden="true" />
                      </Button>
                    ) : null}
	                </div>
	                <div className="mt-0.5 text-[11px] text-text-muted">
	                  {fmtTs(Date.parse(c.created_at))}
	                  {Date.parse(c.updated_at) > Date.parse(c.created_at) ? (
	                    <span className="ml-2">edited</span>
                  ) : null}
                </div>
                <div className="mt-2 space-y-2">
                  {c.body ? <div className="whitespace-pre-wrap text-sm">{c.body}</div> : null}
                  {c.has_image ? (
                    <div className="panel-subtle p-2">
                      <img
                        src={commentImageUrl(c.id, c.image_updated_at ?? null)}
                        alt=""
                        className="w-full rounded-lg object-cover aspect-[4/3]"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {canWrite ? (
          <div className="space-y-2">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setComposerOpen((v) => {
                    const next = !v;
                    if (!next) {
                      // Treat "collapse" as cancel.
                      setText("");
                      setDraftImage(null);
                      setImageCropOpen(false);
                      setAuthor("general");
                    }
                    return next;
                  });
                }}
                title={composerOpen ? "Collapse" : "Add comment"}
                className="h-10 px-3 inline-flex items-center justify-center gap-2"
              >
                {composerOpen ? (
                  <i className="fa-solid fa-chevron-up text-sm md:hidden" aria-hidden="true" />
                ) : (
                  <i className="fa-solid fa-plus text-sm md:hidden" aria-hidden="true" />
                )}
                <span className="hidden md:inline">{composerOpen ? "Collapse" : "Add comment"}</span>
              </Button>
            </div>

            {composerOpen ? (
              <div className="panel-subtle p-3 space-y-2">
                <label className="block">
                  <div className="input-label">Posted as</div>
                  <select
                    className="select-field"
                    value={author === "general" ? "general" : String(author)}
                    onChange={(e) =>
                      setAuthor(e.target.value === "general" ? "general" : Number(e.target.value))
                    }
                    disabled={createMut.isPending}
                  >
                    <option value="general">General</option>
                    {playersInMatch.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </label>

                <Textarea
                  label="Comment"
                  placeholder="Write a comment…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={createMut.isPending}
                />

                {canAttachImage ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-text-muted">Image (4:3, 1920x1440)</div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setImageCropOpen(true)}
                          className="h-9 px-3 inline-flex items-center justify-center gap-2"
                          title={draftImagePreviewUrl ? "Replace image" : "Attach image"}
                        >
                          <i className="fa-solid fa-image md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">{draftImagePreviewUrl ? "Replace" : "Attach"}</span>
                        </Button>
                        {draftImagePreviewUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setDraftImage(null)}
                            className="h-9 w-9 p-0 inline-flex items-center justify-center"
                            title="Remove image"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {draftImagePreviewUrl ? (
                      <div className="panel-subtle p-2">
                        <img src={draftImagePreviewUrl} alt="" className="w-full rounded-lg object-cover aspect-[4/3]" />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    onClick={() => void createMut.mutateAsync()}
                    disabled={createMut.isPending || (!text.trim() && !draftImageBlob) || !idsOk}
                    title="Post comment"
                    className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
                  >
                    <i className="fa-solid fa-paper-plane md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Post</span>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      </CollapsibleCard>
    </div>
    <CommentImageCropper
      open={imageCropOpen}
      title="Attach comment image"
      onClose={() => setImageCropOpen(false)}
      onApply={async (blob) => setDraftImage(blob)}
    />
    </>
  );
}
