/**
 * WebSocket event name constants and payload types.
 * Single source of truth for the realtime event contract on the frontend.
 * Mirror of the constants in backend/app/services/events.py.
 */
import type { Comment, TournamentDetail } from "../../api/types";

// ---- event name constants ----
export const WS_TOURNAMENT_SYNC = "tournament.sync" as const;
export const WS_TOURNAMENT_DELETED = "tournament.deleted" as const;
export const WS_COMMENT_UPSERT = "comment.upsert" as const;
export const WS_COMMENT_DELETE = "comment.delete" as const;
export const WS_COMMENT_META = "comment.meta" as const;
export const WS_TOURNAMENTS_CHANGED = "tournaments.changed" as const;

// ---- payload types ----
export type TournamentSyncPayload = {
  tournament_id: number;
  reason: string;
  tournament: TournamentDetail;
};

export type TournamentDeletedPayload = {
  tournament_id: number;
};

export type CommentUpsertPayload = {
  tournament_id: number;
  comment: Comment;
};

export type CommentDeletePayload = {
  tournament_id: number;
  comment_id: number;
};

export type CommentMetaPayload = {
  tournament_id: number;
  action: string;
  comment_id?: number | null;
};

export type TournamentsChangedPayload = {
  action: string;
  tournament_id?: number;
  status?: string;
};
