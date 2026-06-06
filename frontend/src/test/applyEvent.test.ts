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
});

describe("message routers", () => {
  it("applyTournamentMessage dispatches tournament.sync", () => {
    const qc = new QueryClient();
    applyTournamentMessage(qc, {
      event: "tournament.sync",
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

    applyGlobalMessage(qc, { event: "tournaments.changed", payload: { action: "updated" }, seq: 2 });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.tournaments()));
    expect(keys).toContain(JSON.stringify(qk.tournamentsLive()));
    // a plain "updated" must NOT touch stats/cup
    expect(keys).not.toContain(JSON.stringify(qk.stats.all()));
    expect(keys).not.toContain(JSON.stringify(qk.cupAll()));
  });

  it("applyGlobalMessage refreshes stats + cup on a status change", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    applyGlobalMessage(qc, { event: "tournaments.changed", payload: { action: "status", status: "done" }, seq: 3 });
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(qk.stats.all()));
    expect(keys).toContain(JSON.stringify(qk.cupAll()));
  });
});
