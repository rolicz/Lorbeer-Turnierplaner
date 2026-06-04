import { listTournamentCommentReadIds, listTournamentCommentReadMap } from "../api/comments.api";
import { qk } from "../api/queryKeys";
import { createSeenItemsHooks } from "./useSeenItems";

const { useSeenIdsByContainerId: useSeenIdsByTournamentId, useSeenSet } = createSeenItemsHooks({
  readMapQueryKey: (token) => qk.commentsReadMap(token),
  readMapFn: (token) => listTournamentCommentReadMap(token),
  containerKey: "tournament_id" as const,
  idsKey: "comment_ids" as const,
  singleQueryKey: (tid, token) => qk.commentsReadIds(tid, token),
  singleFn: (token, tid) => listTournamentCommentReadIds(token, tid),
});

export { useSeenIdsByTournamentId, useSeenSet };
