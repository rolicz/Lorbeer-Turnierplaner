/**
 * The comments feed: the filter-driven switch (single match / general / one match / all)
 * plus the recursive comment-tree, match-block and general-list rendering. All of the
 * interactive state lives in the coordinator (TournamentCommentsCard) and is handed down as
 * one bundle so this stays a presentational view over the already-grouped comment data.
 */
import { ChevronDown, ChevronRight } from "lucide-react";

import type { MatchState } from "../../../api/types";
import EmptyState from "../../../ui/primitives/EmptyState";
import ScoreLine from "../../../ui/primitives/ScoreLine";
import { Stars } from "../../../ui/primitives/Stars";
import { CommentCard, type CommentCardContextValue } from "../TournamentCommentParts";
import { type TournamentComment } from "../tournamentCommentTypes";
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
  state: MatchState;
  aGoals: number;
  bGoals: number;
  aClub: CommentMatchHeaderClub;
  bClub: CommentMatchHeaderClub;
};

type CommentBlock = { matchId: number; comments: TournamentComment[] };

/** A reply is flat and tighter than the `inset` box of the comment it answers. */
const REPLY_SURFACE = "px-3 py-2";

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
  toggleBlock: (key: string) => void;
  collapsedThreads: Set<number>;
  toggleThread: (id: number) => void;

  // --- shared/stable card-level values (viewer/permissions, card state, card callbacks) ---
  ctx: CommentCardContextValue;
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
    toggleBlock,
    collapsedThreads,
    toggleThread,
    ctx,
  } = props;
  const {
    token,
    seen,
    canWrite,
    pinnedTournamentCommentId,
    editingId,
    canSaveEdit,
    flashId,
    avatarUpdatedAtByPlayerId,
    replyToId,
    onMarkSeen,
    onTogglePin,
    onVote,
    onOpenVoters,
    openReply,
    submitReply,
    toggleEdit,
    deleteComment,
    saveEdit,
  } = ctx;

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
        canPin={pinnable}
        onTogglePin={pinnable ? () => onTogglePin(c) : null}
        canEdit={c.canEdit}
        onReply={() => openReply(c)}
        replyOpen={replyToId === c.id}
        onSubmitReply={() => void submitReply(c)}
        childCount={opts.childCount}
        collapsed={opts.collapsed}
        onToggleCollapse={() => toggleThread(c.id)}
        onToggleEdit={() => toggleEdit(c)}
        onDelete={() => deleteComment(c)}
        onVote={(value) => onVote(c.id, value)}
        onOpenVoters={() => onOpenVoters(c.id)}
        onSave={saveEdit}
        canSubmit={canSaveEdit}
        ctx={ctx}
      />
    );
  }

  /**
   * Render a comment and its (collapsible) reply subtree, recursively.
   *
   * Depth cue (S10, closing the DS3 finding): a root comment is a boxed `inset`,
   * a reply is a flat, tighter row on the block's own surface, hanging off an
   * accent-tinted left rule. Fill, padding, indent and rule all say "reply", and
   * nothing needs a fourth surface to do it.
   */
  function renderCommentTree(c: TournamentComment, surface: string, depth: number) {
    const children = childrenByParent.get(c.id) ?? [];
    const collapsed = collapsedThreads.has(c.id);
    return (
      <div key={c.id} className={depth === 0 ? "space-y-2" : "space-y-1"}>
        {renderCommentCard(c, surface, { childCount: children.length, collapsed })}
        {children.length && !collapsed ? (
          <div className="ml-2 space-y-1 border-l-2 border-accent/25 pl-2 sm:pl-3">
            {children.map((ch) => renderCommentTree(ch, REPLY_SURFACE, depth + 1))}
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
    // The score is a `ScoreLine` like every other score in the app (DESIGN.md §8):
    // no colon, no box, and the club/stars rows hug the centre gap under it the
    // way `MatchSides` does elsewhere.
    const headerInner = h ? (
          <div>
            <ScoreLine
              size="sm"
              state={h.state}
              leftNames={h.aPlayers}
              rightNames={h.bPlayers}
              leftGoals={h.aGoals}
              rightGoals={h.bGoals}
            />
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
              <div className="min-w-0 whitespace-normal break-words text-right leading-tight">{h.aClub.present ? h.aClub.name : "—"}</div>
              <div />
              <div className="min-w-0 whitespace-normal break-words leading-tight">{h.bClub.present ? h.bClub.name : "—"}</div>
            </div>
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-xs text-text-muted">
              <div className="flex min-w-0 justify-end">{h.aClub.present ? <Stars rating={h.aClub.rating ?? 0} textClassName="text-text-muted" /> : <span>—</span>}</div>
              <div />
              <div className="flex min-w-0">{h.bClub.present ? <Stars rating={h.bClub.rating ?? 0} textClassName="text-text-muted" /> : <span>—</span>}</div>
            </div>
          </div>
    ) : null;
    // A block is a hairline-separated section *inside* the feed's card (T3): the feed and
    // its composer are one unit, so a block cannot be a card of its own — its comments are
    // the level-2 `inset` rows (DESIGN.md §3). scroll-mt is critical for anchor navigation.
    return (
      <section key={matchId} id={`comments-block-match-${matchId}`} className="scroll-mt-28 px-3 py-3 sm:scroll-mt-32">
        {h && showMatchHeader ? (
          <button
            type="button"
            onClick={() => toggleBlock(blockKey)}
            className="flex w-full items-start gap-2 text-left"
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight size={12} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" /> : <ChevronDown size={12} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />}
            <span className="min-w-0 flex-1">{headerInner}</span>
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-text-muted">
              {unseenHere ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
              {arr.length}
            </span>
          </button>
        ) : null}

        {!isCollapsed ? (
          <div className={h && showMatchHeader ? "mt-3 space-y-2" : "space-y-2"}>
            {arr.length ? arr.map((c) => renderCommentTree(c, surface, 0)) : (
              <EmptyState title="No comments on this match yet." />
            )}
          </div>
        ) : null}
      </section>
    );
  }

  function renderGeneralList() {
    if (!generalComments.length) return <EmptyState title="No general comments yet." />;
    const ordered = [pinnedTournamentComment, ...generalComments.filter((c) => c.id !== pinnedTournamentComment?.id)]
      .filter(Boolean) as TournamentComment[];
    return <div className="space-y-2">{ordered.map((c) => renderCommentTree(c, "inset", 0))}</div>;
  }

  if (onlyMatchId != null) {
    return renderMatchBlock(onlyMatchId, "inset");
  }
  if (filter === "general") {
    return (
      <section className="px-3 py-3">
        <div className="mb-3 text-sm font-semibold">General</div>
        {renderGeneralList()}
      </section>
    );
  }
  if (typeof filter === "number") {
    return renderMatchBlock(filter, "inset");
  }
  return (
    <div className="list-divided">
      {generalComments.length ? (
        <section className="px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">General</div>
            <div className="text-xs text-text-muted">{generalComments.length}</div>
          </div>
          {renderGeneralList()}
        </section>
      ) : null}
      {matchBlocksWithComments.map((b) => renderMatchBlock(b.matchId, "inset"))}
      {totalComments === 0 ? (
        <EmptyState title={`No comments yet.${canWrite ? " Be the first to add one." : ""}`} className="px-3 py-6" />
      ) : null}
    </div>
  );
}
