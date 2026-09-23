import { listPlayerGuestbookReadIds, listPlayerGuestbookReadMap } from "../api/players.api";
import { qk } from "../api/queryKeys";
import { createSeenItemsHooks } from "./useSeenItems";

const { useSeenIdsByContainerId: useSeenGuestbookIdsByProfileId, useSeenSet: useSeenGuestbookSet } =
  createSeenItemsHooks({
    readMapQueryKey: (viewerId) => qk.playerGuestbookReadMap(viewerId),
    readMapFn: listPlayerGuestbookReadMap,
    containerKey: "profile_player_id" as const,
    idsKey: "entry_ids" as const,
    singleQueryKey: (pid, viewerId) => qk.playerGuestbookReadIds(pid, viewerId),
    singleFn: (pid) => listPlayerGuestbookReadIds(pid),
  });

export { useSeenGuestbookIdsByProfileId, useSeenGuestbookSet };
