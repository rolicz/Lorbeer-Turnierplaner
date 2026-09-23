/**
 * Ideas — the group's feature requests, changes and bug reports (R5).
 *
 * Reading is public; posting and voting need a login. The board is built like the
 * app's other two feeds (the tournament's comments, a profile's guestbook): one
 * `card p-0`, the ideas as level-2 `inset` rows, and the composer attached to the
 * card's bottom edge — never a second card beside it (`DESIGN.md` §9b).
 *
 * Nothing here decides who may do what: every row carries `can_edit` /
 * `can_delete` / `can_set_status` from `services/authorization.py`, and the
 * controls render from those flags (`AGENTS.md` §6).
 */
import { Lightbulb } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Chip } from "../../ui/primitives/Chip";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import EmptyState from "../../ui/primitives/EmptyState";
import { ErrorToastOnError, showErrorToast } from "../../ui/primitives/ErrorToast";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import LoadingPlaceholder from "../../ui/primitives/LoadingPlaceholder";
import PageLayout from "../../ui/layout/PageLayout";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import VoteVotersModal from "../../ui/primitives/VoteVotersModal";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { useTabParam } from "../../ui/shell/useTabParam";

import { listIdeaAreas, listIdeaVoters, listIdeas } from "../../api/ideas.api";
import { qk } from "../../api/queryKeys";
import { useAuth } from "../../auth/AuthContext";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { fmtDateTime } from "../../utils/format";
import type { Idea, IdeaComment, IdeaKind, IdeaStatus } from "../../api/types";
import IdeaCard, { type IdeaCardHandlers } from "./IdeaCard";
import IdeaComposer, { type IdeaDraft } from "./IdeaComposer";
import {
  IDEA_KIND_LABEL,
  IDEA_SORT_KEYS,
  IDEA_STATUS_LABEL,
  IDEA_TAB_KEYS,
  type IdeaSort,
  type IdeaTab,
  areaLabel,
  filterIdeas,
  sortIdeas,
  usedAreaKeys,
} from "./ideaMeta";
import { useIdeaMutations } from "./useIdeaMutations";

const EMPTY_DRAFT: IdeaDraft = { title: "", body: "", kind: "feature", areas: [] };

const TABS: SectionTab<IdeaTab>[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default function IdeasPage() {
  const { playerId: viewerId } = useAuth();
  const [tab, setTab] = useTabParam<IdeaTab>(IDEA_TAB_KEYS, "open");
  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState<IdeaSort>("top");
  const [area, setArea] = useState<string | null>(null);

  const ideasQ = useQuery({ queryKey: qk.ideas(viewerId), queryFn: () => listIdeas() });
  const areasQ = useQuery({ queryKey: qk.ideaAreas(), queryFn: listIdeaAreas, staleTime: 60 * 60 * 1000 });

  const ideas = useMemo(() => ideasQ.data?.ideas ?? [], [ideasQ.data]);
  const areaCatalog = useMemo(() => areasQ.data?.areas ?? [], [areasQ.data]);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const {
    createMut,
    putImageMut,
    deleteImageMut,
    patchMut,
    statusMut,
    deleteMut,
    voteMut,
    commentMut,
    deleteCommentMut,
    markReadMut,
  } = useIdeaMutations();

  // --- composer state ----------------------------------------------------
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<IdeaDraft>(EMPTY_DRAFT);
  const [draftImageBlob, setDraftImageBlob] = useState<Blob | null>(null);
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(null);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  /** null = the composer's own draft; a number = "replace this idea's image". */
  const [cropperTarget, setCropperTarget] = useState<"draft" | number | null>(null);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [votersIdea, setVotersIdea] = useState<Idea | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Idea | null>(null);
  const [pendingRemoveImage, setPendingRemoveImage] = useState<Idea | null>(null);
  const [pendingDeleteComment, setPendingDeleteComment] = useState<IdeaComment | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (draftImagePreviewUrl) URL.revokeObjectURL(draftImagePreviewUrl);
    };
  }, [draftImagePreviewUrl]);

  // A push lands on `/ideas?idea=<id>`: jump to it, mark it once, drop the param
  // so the destination memory never replays it (`lastLocation` ONE_SHOT_PARAMS).
  const handledDeepLink = useRef<number | null>(null);
  const deepLinkId = Number(searchParams.get("idea") ?? 0);
  useEffect(() => {
    if (!deepLinkId || !ideas.length) return;
    if (handledDeepLink.current === deepLinkId) return;
    if (!ideas.some((i) => i.id === deepLinkId)) return;
    handledDeepLink.current = deepLinkId;
    setTab("all");
    setArea(null);
    setFlashId(deepLinkId);
    markReadMut.mutate(deepLinkId);
    const next = new URLSearchParams(searchParams);
    next.delete("idea");
    setSearchParams(next, { replace: true });
    window.setTimeout(() => {
      document.getElementById(`idea-${deepLinkId}`)?.scrollIntoView({ block: "center" });
    }, 0);
    const t = window.setTimeout(() => setFlashId(null), 2400);
    return () => window.clearTimeout(t);
  }, [deepLinkId, ideas, searchParams, setSearchParams, setTab, markReadMut]);

  const availableAreas = useMemo(() => usedAreaKeys(ideas, areaCatalog), [ideas, areaCatalog]);
  // An area filter whose ideas all moved to another tab would silently show nothing.
  useEffect(() => {
    if (area && !availableAreas.includes(area)) setArea(null);
  }, [area, availableAreas]);

  const visible = useMemo(
    () => sortIdeas(filterIdeas(ideas, { tab, area }), sort),
    [ideas, tab, area, sort],
  );

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setDraftImageBlob(null);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function applyCroppedImage(blob: Blob) {
    if (cropperTarget === "draft" || cropperTarget == null) {
      setDraftImageBlob(blob);
      setDraftImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      return;
    }
    const ideaId = cropperTarget;
    setSavingId(ideaId);
    putImageMut
      .mutateAsync({ ideaId, blob })
      .catch((e: unknown) =>
        showErrorToast(e instanceof Error ? e.message : "Upload failed", "Could not attach the image"),
      )
      .finally(() => setSavingId(null));
  }

  async function postIdea() {
    const title = draft.title.trim();
    if (!title || draft.areas.length === 0) return;
    try {
      const created = await createMut.mutateAsync({
        title,
        body: draft.body.trim(),
        kind: draft.kind,
        areas: draft.areas,
      });
      if (draftImageBlob) {
        try {
          await putImageMut.mutateAsync({ ideaId: created.id, blob: draftImageBlob });
        } catch (e: unknown) {
          showErrorToast(e instanceof Error ? e.message : "Upload failed", "Idea image upload failed");
        }
      }
      resetDraft();
      setComposerOpen(false);
      setFlashId(created.id);
      window.setTimeout(() => setFlashId(null), 2400);
      setComposerFocusNonce((n) => n + 1);
    } catch {
      // surfaced by createMut.error
    }
  }

  const handlers: IdeaCardHandlers = {
    areaCatalog,
    avatarUpdatedAtByPlayerId: avatarUpdatedAtById,
    savingId,
    onVote: (idea, value) => {
      voteMut.mutate({ ideaId: idea.id, value });
    },
    onOpenVoters: (idea) => setVotersIdea(idea),
    onOpenImage: (src) => setLightboxSrc(src),
    onRequestDelete: (idea) => setPendingDelete(idea),
    onSave: async (idea, patch: { title: string; body: string; kind: IdeaKind; areas: string[] }) => {
      setSavingId(idea.id);
      try {
        await patchMut.mutateAsync({ ideaId: idea.id, ...patch });
      } finally {
        setSavingId(null);
      }
    },
    onSaveStatus: async (idea, status: IdeaStatus, note: string) => {
      setSavingId(idea.id);
      try {
        await statusMut.mutateAsync({ ideaId: idea.id, status, note });
      } finally {
        setSavingId(null);
      }
    },
    onReplaceImage: (idea) => setCropperTarget(idea.id),
    onRemoveImage: (idea) => setPendingRemoveImage(idea),
    onOpenComments: (idea) => {
      markReadMut.mutate(idea.id);
    },
    onPostComment: async (idea, body) => {
      await commentMut.mutateAsync({ ideaId: idea.id, body });
    },
    onRequestDeleteComment: (comment) => setPendingDeleteComment(comment),
  };

  const loading = ideasQ.isLoading && !ideasQ.data;
  const doomedVotes = pendingDelete?.votes ?? 0;

  return (
    <PageLayout title="Ideas">
      <ErrorToastOnError error={ideasQ.error} title="Ideas loading failed" />
      <ErrorToastOnError error={areasQ.error} title="Idea areas loading failed" />
      <ErrorToastOnError error={createMut.error} title="Could not post the idea" />
      <ErrorToastOnError error={patchMut.error} title="Could not save the idea" />
      <ErrorToastOnError error={statusMut.error} title="Could not set the status" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete the idea" />
      <ErrorToastOnError error={voteMut.error} title="Could not vote" />
      <ErrorToastOnError error={deleteImageMut.error} title="Could not remove the image" />
      <ErrorToastOnError error={commentMut.error} title="Could not post the comment" />
      <ErrorToastOnError error={deleteCommentMut.error} title="Could not delete the comment" />

      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />

      {availableAreas.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label">Area</span>
          <Chip selected={area == null} onClick={() => setArea(null)}>
            All
          </Chip>
          {availableAreas.map((key) => (
            <Chip key={key} selected={area === key} onClick={() => setArea(key)}>
              {areaLabel(key, areaCatalog)}
            </Chip>
          ))}
          <span className="ms-auto">
            <SegmentedSwitch
              value={sort}
              onChange={setSort}
              ariaLabel="Sort ideas"
              options={IDEA_SORT_KEYS.map((k) => ({
                key: k,
                label: k === "top" ? "Most wanted" : "Newest",
              }))}
            />
          </span>
        </div>
      ) : null}

      <section className="card min-w-0 p-0" data-ideas-feed>
        <div className="flex items-center justify-between gap-2 border-b border-border-card-outer/55 px-3 py-2.5">
          <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-text-normal">
            <Lightbulb size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="truncate">Ideas</span>
            <span className="shrink-0 text-xs font-normal tabular-nums text-text-muted">
              {visible.length}
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="px-3 py-3">
            <LoadingPlaceholder />
          </div>
        ) : null}

        {!loading && visible.length === 0 ? (
          <EmptyState
            className="px-3 py-6"
            title={ideas.length === 0 ? "No ideas yet." : "Nothing here with these filters."}
            hint={
              ideas.length === 0 ? "Write the first one below." : "Try another tab or area."
            }
          />
        ) : null}

        {visible.length ? (
          <div className="space-y-2 px-3 py-3">
            {visible.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} flash={flashId === idea.id} handlers={handlers} />
            ))}
          </div>
        ) : null}

        <IdeaComposer
            open={composerOpen}
            onOpen={() => setComposerOpen(true)}
            onClose={() => {
              setComposerOpen(false);
              resetDraft();
            }}
            draft={draft}
            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
            areaCatalog={areaCatalog}
            imagePreviewUrl={draftImagePreviewUrl}
            onOpenImageCropper={() => setCropperTarget("draft")}
            onClearImage={() => {
              setDraftImageBlob(null);
              setDraftImagePreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
            }}
            onSubmit={() => void postIdea()}
            submitting={createMut.isPending || putImageMut.isPending}
            focusNonce={composerFocusNonce}
        />
      </section>

      <CommentImageCropper
        open={cropperTarget != null}
        title="Attach a screenshot"
        hint="Shows what you mean. 4:3, cropped here."
        onClose={() => setCropperTarget(null)}
        onApply={(blob) => applyCroppedImage(blob)}
      />

      <ImageLightbox open={!!lightboxSrc} src={lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <VoteVotersModal
        open={votersIdea != null}
        title="Who wants this"
        queryKey={qk.ideaVoters(votersIdea?.id ?? "none")}
        queryFn={() => listIdeaVoters(votersIdea?.id as number)}
        onClose={() => setVotersIdea(null)}
      />

      {/* Deleting takes the votes, the screenshot and the admin's answer with it. */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this idea?"
        subtitle={
          pendingDelete
            ? `${pendingDelete.author_display_name} · ${IDEA_KIND_LABEL[pendingDelete.kind]}`
            : undefined
        }
        confirmLabel="Delete idea"
        busy={deleteMut.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const doomed = pendingDelete;
          setPendingDelete(null);
          if (doomed) deleteMut.mutate(doomed.id);
        }}
      >
        <div>“{pendingDelete?.title}” is removed from the board.</div>
        {doomedVotes > 0 ? (
          <div>
            {doomedVotes === 1
              ? "The one vote for it goes too."
              : `All ${doomedVotes} votes for it go too.`}
          </div>
        ) : null}
        {pendingDelete?.has_image ? <div>The attached screenshot goes with it.</div> : null}
        {pendingDelete && pendingDelete.status !== "new" ? (
          <div>
            Its status ({IDEA_STATUS_LABEL[pendingDelete.status]}
            {pendingDelete.status_note ? " and the note under it" : ""}) is lost.
          </div>
        ) : null}
        <div>This cannot be undone.</div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!pendingRemoveImage}
        title="Remove the screenshot?"
        subtitle="The idea stays; only the image goes."
        confirmLabel="Remove image"
        busy={deleteImageMut.isPending}
        busyLabel="Removing…"
        onCancel={() => setPendingRemoveImage(null)}
        onConfirm={() => {
          const idea = pendingRemoveImage;
          setPendingRemoveImage(null);
          if (idea) {
            setSavingId(idea.id);
            void deleteImageMut.mutateAsync(idea.id).finally(() => setSavingId(null));
          }
        }}
      >
        <div>The screenshot is removed for good.</div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!pendingDeleteComment}
        title="Delete this comment?"
        subtitle={
          pendingDeleteComment
            ? `${pendingDeleteComment.author_display_name} · ${fmtDateTime(pendingDeleteComment.created_at)}`
            : undefined
        }
        confirmLabel="Delete comment"
        busy={deleteCommentMut.isPending}
        busyLabel="Deleting…"
        onCancel={() => setPendingDeleteComment(null)}
        onConfirm={() => {
          const doomed = pendingDeleteComment;
          setPendingDeleteComment(null);
          if (doomed) deleteCommentMut.mutate(doomed.id);
        }}
      >
        <div>The comment is removed for good.</div>
      </ConfirmDialog>
    </PageLayout>
  );
}
