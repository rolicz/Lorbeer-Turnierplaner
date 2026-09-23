import { listTournamentCommentReadIds, listTournamentCommentReadMap } from "../api/comments.api";
import { qk } from "../api/queryKeys";
import { createSeenItemsHooks } from "./useSeenItems";

const { useSeenIdsByContainerId: useSeenIdsByTournamentId, useSeenSet } = createSeenItemsHooks({
  readMapQueryKey: (viewerId) => qk.commentsReadMap(viewerId),
  readMapFn: listTournamentCommentReadMap,
  containerKey: "tournament_id" as const,
  idsKey: "comment_ids" as const,
  singleQueryKey: (tid, viewerId) => qk.commentsReadIds(tid, viewerId),
  singleFn: (tid) => listTournamentCommentReadIds(tid),
});

export { useSeenIdsByTournamentId, useSeenSet };
