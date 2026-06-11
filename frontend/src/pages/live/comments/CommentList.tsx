/**
 * The comments feed: the filter-driven switch (single match / general / one match / all)
 * plus the recursive comment-tree, match-block and general-list rendering. All of the
 * interactive state lives in the coordinator (TournamentCommentsCard) and is handed down as
 * one bundle so this stays a presentational view over the already-grouped comment data.
 */
import EmptyState from "../../../ui/primitives/EmptyState";
import { StarsFA } from "../../../ui/primitives/StarsFA";
import type { Player } from "../../../api/types";
import { CommentCard } from "../TournamentCommentParts";
import {
  type CommentAuthor,
  type CommentScope,
  type TournamentComment,
} from "../tournamentCommentTypes";
import { type CommentFilterValue } from "./CommentFilterBar";

type CommentMatchHeaderClub = {
  name: string;
  league_name: string | null;
  rating: number | null;
  ratingText: string | null;
  present: boolean;
};

/** Score/clubs/stars summary for a match block header, as computed by the coordinator. */
export type CommentMatchHeader = {
  title: string;
  aPlayers: string;
  bPlayers: string;
  aGoals: number | null;
  bGoals: number | null;
  aClub: CommentMatchHeaderClub;
  bClub: CommentMatchHeaderClub;
};

type CommentBlock = { matchId: number; comments: TournamentComment[] };

export type CommentListProps = {
  // --- feed shape / scope ---
  onlyMatchId: number | null;
  filter: CommentFilterValue;
  blocks: CommentBlock[];
  matchBlocksWithComments: CommentBlock[];
  generalComments: TournamentComment[];
  pinnedTournamentComment: TournamentComment | null;
  comments: TournamentComment[];
  totalComments: number;
  childrenByParent: Map<number, TournamentComment[]>;
  rootScopeKey: Map<number, string>;
  matchHeaderMeta: (matchId: number) => CommentMatchHeader | null;

  // --- per-block / per-thread collapse ---
  showMatchHeader: boolean;
  collapsedBlocks: Set<string>;
  setCollapsedBlocks: (next: Set<string>) => void;
  toggleBlock: (key: string) => void;
  collapsedThreads: Set<number>;
  toggleThread: (id: number) => void;

  // --- viewer / permissions ---
  token: string | null;
  seen: { has: (id: number) => boolean };
  canWrite: boolean;
  canDelete: boolean;
  players: Player[];
  currentPlayerId: number | null;
  currentPlayerName: string | null;
  avatarUpdatedAtByPlayerId: Map<number, string>;
  authorLabel: (a: CommentAuthor) => string;

  // --- card state ---
  editingId: number | null;
  editingDirty: boolean;
  pinnedTournamentCommentId: number | null;
  flashId: number | null;
  draftAuthor: "general" | number;
  draftBody: string;
  canSubmit: boolean;
  replyToId: number | null;
  replyDraft: string;
  replySubmitting: boolean;

  // --- card callbacks ---
  onMarkSeen: (id: number) => void;
  onTogglePin: (c: TournamentComment) => void;
  onVote: (id: number, value: -1 | 0 | 1) => void;
  onOpenVoters: (id: number) => void;
  onOpenImage: (src: string) => void;
  openReply: (c: TournamentComment) => void;
  cancelReply: () => void;
  submitReply: (c: TournamentComment) => void;
  setReplyDraft: (v: string) => void;
  toggleEdit: (c: TournamentComment) => void;
  deleteComment: (id: number) => void;
  setDraftAuthor: (v: "general" | number) => void;
  setDraftBody: (v: string) => void;
  upsertComment: (scope: CommentScope) => void;
};

export default function CommentList(props: CommentListProps) {
  const {
    onlyMatchId,
    filter,
    blocks,
    matchBlocksWithComments,
    generalComments,
    pinnedTournamentComment,
    comments,
    totalComments,
    childrenByParent,
    rootScopeKey,
    matchHeaderMeta,
    showMatchHeader,
    collapsedBlocks,
    setCollapsedBlocks,
    toggleBlock,
    collapsedThreads,
    toggleThread,
    token,
    seen,
    canWrite,
    canDelete,
    players,
    currentPlayerId,
    currentPlayerName,
    avatarUpdatedAtByPlayerId,
    authorLabel,
    editingId,
    editingDirty,
    pinnedTournamentCommentId,
    flashId,
    draftAuthor,
    draftBody,
    canSubmit,
    replyToId,
    replyDraft,
    replySubmitting,
    onMarkSeen,
    onTogglePin,
    onVote,
    onOpenVoters,
    onOpenImage,
    openReply,
    cancelReply,
    submitReply,
    setReplyDraft,
    toggleEdit,
    deleteComment,
    setDraftAuthor,
    setDraftBody,
    upsertComment,
  } = props;

  function renderCommentCard(c: TournamentComment, surface: string, opts: { childCount: number; collapsed: boolean }) {
    const pinnable =
      c.scope.kind === "tournament" &&
      canWrite &&
      (pinnedTournamentCommentId == null || pinnedTournamentCommentId === c.id);
    return (
      <CommentCard
        key={c.id}
        c={c}
        isEditing={editingId === c.id}
        isPinned={pinnedTournamentCommentId === c.id}
        isUnseen={!!token && !seen.has(c.id)}
        onMarkSeen={() => onMarkSeen(c.id)}
        flash={flashId === c.id}
        surfaceClassName={surface}
        avatarUpdatedAt={c.author.kind === "player" ? avatarUpdatedAtByPlayerId.get(c.author.playerId) ?? null : null}
        onOpenImage={onOpenImage}
        canPin={pinnable}
        onTogglePin={pinnable ? () => onTogglePin(c) : null}
        canEdit={c.canEdit}
        canDelete={canDelete}
        canReply={canWrite}
        onReply={() => openReply(c)}
        replyOpen={replyToId === c.id}
        replyDraft={replyDraft}
        onChangeReplyDraft={setReplyDraft}
        onSubmitReply={() => void submitReply(c)}
        onCancelReply={cancelReply}
        replySubmitting={replySubmitting}
        childCount={opts.childCount}
        collapsed={opts.collapsed}
        onToggleCollapse={() => toggleThread(c.id)}
        players={players}
        currentPlayerId={currentPlayerId}
        currentPlayerName={currentPlayerName}
        authorLabel={authorLabel}
        onToggleEdit={() => toggleEdit(c)}
        onDelete={() => {
          void deleteComment(c.id);
        }}
        onVote={(value) => onVote(c.id, value)}
        onOpenVoters={() => onOpenVoters(c.id)}
        draftAuthor={draftAuthor}
        onChangeDraftAuthor={setDraftAuthor}
        draftBody={draftBody}
        onChangeDraftBody={setDraftBody}
        onSave={() => {
          void upsertComment(c.scope);
        }}
        canSubmit={canSubmit && (editingId !== c.id || editingDirty)}
      />
    );
  }

  /** Render a comment and its (collapsible) reply subtree, recursively. */
  function renderCommentTree(c: TournamentComment, surface: string, depth: number) {
    const children = childrenByParent.get(c.id) ?? [];
    const collapsed = collapsedThreads.has(c.id);
    return (
      <div key={c.id} className="space-y-2">
        {renderCommentCard(c, surface, { childCount: children.length, collapsed })}
        {children.length && !collapsed ? (
          <div className="ml-1 space-y-2 border-l border-border-card-inner/40 pl-2 sm:pl-3">
            {children.map((ch) => renderCommentTree(ch, "panel-inner", depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  /** A match block: header (score/clubs/stars) + its comments. Header toggles collapse. */
  function renderMatchBlock(matchId: number, surface: string) {
    const h = matchHeaderMeta(matchId);
    const arr = (blocks.find((b) => b.matchId === matchId)?.comments ?? []);
    const blockKey = `m-${matchId}`;
    const isCollapsed = showMatchHeader && collapsedBlocks.has(blockKey);
    const unseenHere =
      !!token && comments.some((c) => rootScopeKey.get(c.id) === blockKey && !seen.has(c.id));
    const headerInner = h ? (
          <div className="space-y-1">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <div className="min-w-0 truncate text-sm text-text-normal">{h.aPlayers}</div>
              <div className="card-chip flex items-center justify-center gap-2 justify-self-center">
                {h.aGoals == null || h.bGoals == null ? (
                  <span className="text-sm font-semibold tabular-nums text-text-muted">—</span>
                ) : (
                  <>
                    <span className="text-sm font-semibold tabular-nums">{h.aGoals}</span>
                    <span className="text-text-muted">:</span>
                    <span className="text-sm font-semibold tabular-nums">{h.bGoals}</span>
                  </>
                )}
              </div>
              <div className="min-w-0 truncate text-right text-sm text-text-normal">{h.bPlayers}</div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
              <div className="min-w-0 whitespace-normal break-words leading-tight">{h.aClub.present ? h.aClub.name : "—"}</div>
              <div />
              <div className="min-w-0 whitespace-normal break-words text-right leading-tight">{h.bClub.present ? h.bClub.name : "—"}</div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-text-muted">
              <div className="min-w-0">{h.aClub.present ? <StarsFA rating={h.aClub.rating ?? 0} textClassName="text-text-muted" /> : <span>—</span>}</div>
              <div />
              <div className="flex min-w-0 justify-end">{h.bClub.present ? <StarsFA rating={h.bClub.rating ?? 0} textClassName="text-text-muted" /> : <span>—</span>}</div>
            </div>
          </div>
    ) : null;
    // not CardSection: rounded-2xl omitted so the block spans edge-to-edge inside the parent card; scroll-mt critical for anchor navigation
    return (
      <div key={matchId} id={`comments-block-match-${matchId}`} className="card-inner-flat scroll-mt-28 sm:scroll-mt-32">
        {h && showMatchHeader ? (
          <button
            type="button"
            onClick={() => toggleBlock(blockKey)}
            className="flex w-full items-start gap-2 text-left"
            aria-expanded={!isCollapsed}
          >
            <i className={`fa-solid ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"} mt-1 text-[11px] text-text-muted`} aria-hidden="true" />
            <span className="min-w-0 flex-1">{headerInner}</span>
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-text-muted">
              {unseenHere ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
              {arr.length}
            </span>
          </button>
        ) : null}

        {!isCollapsed ? (
          <div className="mt-3 space-y-2">
            {arr.length ? arr.map((c) => renderCommentTree(c, surface, 0)) : (
              <EmptyState title="No comments on this match yet." />
            )}
          </div>
        ) : null}
      </div>
    );
  }

  function renderGeneralList() {
    if (!generalComments.length) return <EmptyState title="No general comments yet." />;
    const ordered = [pinnedTournamentComment, ...generalComments.filter((c) => c.id !== pinnedTournamentComment?.id)]
      .filter(Boolean) as TournamentComment[];
    return <div className="space-y-2">{ordered.map((c) => renderCommentTree(c, "panel", 0))}</div>;
  }

  if (onlyMatchId != null) {
    return renderMatchBlock(onlyMatchId, "panel-subtle");
  }
  if (filter === "general") {
    return (
      <div className="panel-subtle p-3">
        <div className="mb-3 text-sm font-semibold">General</div>
        {renderGeneralList()}
      </div>
    );
  }
  if (typeof filter === "number") {
    return renderMatchBlock(filter, "panel-subtle");
  }
  return (
    <div className="space-y-2">
      {matchBlocksWithComments.length ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              const keys = matchBlocksWithComments.map((b) => `m-${b.matchId}`);
              const allCollapsed = keys.every((k) => collapsedBlocks.has(k));
              setCollapsedBlocks(allCollapsed ? new Set() : new Set(keys));
            }}
            className="text-xs text-text-muted transition hover:text-text-normal"
          >
            {matchBlocksWithComments.every((b) => collapsedBlocks.has(`m-${b.matchId}`))
              ? "Expand all"
              : "Collapse all"}
          </button>
        </div>
      ) : null}
      {generalComments.length ? (
        <div className="panel-subtle p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">General</div>
            <div className="text-xs text-text-muted">{generalComments.length}</div>
          </div>
          {renderGeneralList()}
        </div>
      ) : null}
      {matchBlocksWithComments.map((b) => renderMatchBlock(b.matchId, "panel-subtle"))}
      {totalComments === 0 ? (
        <EmptyState title={`No comments yet.${canWrite ? " Be the first to add one." : ""}`} className="panel-subtle px-3 py-6" />
      ) : null}
    </div>
  );
}
