/** Shared comment view types + scope helper for the tournament comments UI. */

export type CommentScope = { kind: "tournament" } | { kind: "match"; matchId: number };

export type CommentAuthor = { kind: "general" } | { kind: "player"; playerId: number };

export type TournamentComment = {
  id: number;
  createdAt: number;
  updatedAt: number;
  scope: CommentScope;
  author: CommentAuthor;
  body: string;
  hasImage: boolean;
  imageUpdatedAt: string | null;
  upvotes: number;
  downvotes: number;
  myVote: -1 | 0 | 1;
};

export function sameScope(a: CommentScope | null | undefined, b: CommentScope): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (b.kind === "tournament") return true;
  return a.kind === "match" && a.matchId === b.matchId;
}
