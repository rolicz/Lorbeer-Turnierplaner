import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { qk } from "../api/queryKeys";
import type { Comment, TournamentCommentsResponse, TournamentDetail } from "../api/types";
import {
  applyCommentDelete,
  applyCommentUpsert,
  applyGlobalMessage,
  applyTournamentMessage,
  applyTournamentSync,
} from "../hooks/realtime/applyEvent";
import {
  WS_TOURNAMENT_SYNC,
  WS_TOURNAMENTS_CHANGED,
} from "../hooks/realtime/wsEvents";

const TID = 7;

function comment(id: number, over: Partial<Comment> = {}): Comment {
  return {
    id,
    body: `c${id}`,
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    ...over,
  } as Comment;
}

function commentsCache(rows: Comment[], pinned: number | null = null): TournamentCommentsResponse {
  return { comments: rows, pinned_comment_id: pinned } as TournamentCommentsResponse;
}

describe("applyTournamentSync", () => {
  it("replaces the tournament cache wholesale (zero refetch)", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.tournament(TID), { id: TID, name: "old" } as unknown as TournamentDetail);

    applyTournamentSync(qc, { tournament_id: TID, tournament: { id: TID, name: "new" } });

    expect(qc.getQueryData(qk.tournament(TID))).toEqual({ id: TID, name: "new" });
  });

  it("ignores a payload without a tournament", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.tournament(TID), { id: TID, name: "keep" } as unknown as TournamentDetail);
    applyTournamentSync(qc, { tournament_id: TID });
    expect((qc.getQueryData(qk.tournament(TID)) as { name: string }).name).toBe("keep");
  });

  // A10: the broadcast has no single viewer, so its capability flags are all false —
  // taking them would hide this editor's controls until the next refetch.
  it("keeps the viewer's capability flags, which the broadcast cannot know", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.tournament(TID), {
      id: TID,
      name: "old",
      can_edit: true,
      can_delete: true,
      can_set_decider: true,
    } as unknown as TournamentDetail);

    applyTournamentSync(qc, {
      tournament_id: TID,
      tournament: { id: TID, name: "new", can_edit: false, can_delete: false, can_set_decider: false },
    });

    expect(qc.getQueryData(qk.tournament(TID))).toEqual({
      id: TID,
      name: "new",
      can_edit: true,
      can_delete: true,
      can_set_decider: true,
    });
  });

  it("takes the payload's flags when there is nothing cached to keep", () => {
    const qc = new QueryClient();
    applyTournamentSync(qc, {
      tournament_id: TID,
      tournament: { id: TID, name: "new", can_edit: false, can_delete: false, can_set_decider: false },
    });
    expect((qc.getQueryData(qk.tournament(TID)) as { can_edit: boolean }).can_edit).toBe(false);
  });
});

describe("applyCommentUpsert", () => {
  it("appends a brand-new comment", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.commentsTournament(TID), commentsCache([comment(1)]));

    applyCommentUpsert(qc, { tournament_id: TID, comment: comment(2, { body: "fresh" }) });

    const rows = (qc.getQueryData(qk.commentsTournament(TID)) as TournamentCommentsResponse).comments;
    expect(rows.map((c) => c.id)).toEqual([1, 2]);
    expect(rows[1].body).toBe("fresh");
  });

  it("merges an edit but preserves the viewer's vote state", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      qk.commentsTournament(TID),
      commentsCache([comment(1, { body: "old", upvotes: 5, downvotes: 1, my_vote: 1 })]),
    );

    // Broadcast carries the edited body but zeroed/absent vote data.
    applyCommentUpsert(qc, {
      tournament_id: TID,
      comment: comment(1, { body: "edited", upvotes: 0, downvotes: 0, my_vote: 0 }),
    });

    const c = (qc.getQueryData(qk.commentsTournament(TID)) as TournamentCommentsResponse).comments[0];
    expect(c.body).toBe("edited");
    expect(c.upvotes).toBe(5);
    expect(c.downvotes).toBe(1);
    expect(c.my_vote).toBe(1);
  });

  // A5: the tournaments list counts comments for its unread badge, so a new one
  // has to invalidate the summary the way the meta/global reducers already do.
  it("refreshes the comments summary the list badge is built from", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    qc.setQueryData(qk.commentsTournament(TID), commentsCache([comment(1)]));

    applyCommentUpsert(qc, { tournament_id: TID, comment: comment(2) });

    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.commentsSummary()));
  });
});

describe("applyCommentDelete", () => {
  it("removes the comment and clears the pin when it was pinned", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.commentsTournament(TID), commentsCache([comment(1), comment(2)], 2));

    applyCommentDelete(qc, { tournament_id: TID, comment_id: 2 });

    const data = qc.getQueryData(qk.commentsTournament(TID)) as TournamentCommentsResponse;
    expect(data.comments.map((c) => c.id)).toEqual([1]);
    expect(data.pinned_comment_id).toBeNull();
  });

  it("keeps the pin when a different comment is deleted", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.commentsTournament(TID), commentsCache([comment(1), comment(2)], 1));
    applyCommentDelete(qc, { tournament_id: TID, comment_id: 2 });
    const data = qc.getQueryData(qk.commentsTournament(TID)) as TournamentCommentsResponse;
    expect(data.pinned_comment_id).toBe(1);
  });

  // A5: the other direction of the same badge — a deleted comment must stop counting.
  it("refreshes the comments summary the list badge is built from", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    qc.setQueryData(qk.commentsTournament(TID), commentsCache([comment(1), comment(2)]));

    applyCommentDelete(qc, { tournament_id: TID, comment_id: 2 });

    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.commentsSummary()));
  });
});

describe("message routers", () => {
  it("applyTournamentMessage dispatches tournament.sync", () => {
    const qc = new QueryClient();
    applyTournamentMessage(qc, {
      event: WS_TOURNAMENT_SYNC,
      payload: { tournament_id: TID, tournament: { id: TID, name: "routed" } },
      seq: 1,
    });
    expect((qc.getQueryData(qk.tournament(TID)) as { name: string }).name).toBe("routed");
  });

  it("applyGlobalMessage invalidates list/live only on tournaments.changed", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    applyGlobalMessage(qc, { event: "noise", payload: {}, seq: 1 });
    expect(spy).not.toHaveBeenCalled();

    applyGlobalMessage(qc, { event: WS_TOURNAMENTS_CHANGED, payload: { action: "updated" }, seq: 2 });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.tournaments()));
    expect(keys).toContain(JSON.stringify(qk.tournamentsLive()));
    // a plain "updated" must NOT touch stats/cup
    expect(keys).not.toContain(JSON.stringify(qk.stats.all()));
    expect(keys).not.toContain(JSON.stringify(qk.cupAll()));
  });

  // A5: `action="comment"` exists only to move the unread badge, so it refreshes the
  // summary and deliberately leaves the tournament list alone.
  it("applyGlobalMessage moves the badge on a comment without refetching the list", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    applyGlobalMessage(qc, { event: WS_TOURNAMENTS_CHANGED, payload: { action: "comment", tournament_id: TID }, seq: 4 });

    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.commentsSummary()));
    expect(keys).not.toContain(JSON.stringify(qk.tournaments()));
    expect(keys).not.toContain(JSON.stringify(qk.tournamentsLive()));
    expect(keys).not.toContain(JSON.stringify(qk.stats.all()));
  });

  it("applyGlobalMessage refreshes stats + cup on a status change", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyGlobalMessage(qc, { event: WS_TOURNAMENTS_CHANGED, payload: { action: "status", status: "done" }, seq: 3 });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.stats.all()));
    expect(keys).toContain(JSON.stringify(qk.cupAll()));
  });
});
