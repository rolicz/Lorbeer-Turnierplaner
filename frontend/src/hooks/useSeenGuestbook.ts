import { listPlayerGuestbookReadIds, listPlayerGuestbookReadMap } from "../api/players.api";
import { qk } from "../api/queryKeys";
import { createSeenItemsHooks } from "./useSeenItems";

const { useSeenIdsByContainerId: useSeenGuestbookIdsByProfileId, useSeenSet: useSeenGuestbookSet } =
  createSeenItemsHooks({
    readMapQueryKey: (token) => qk.playerGuestbookReadMap(token),
    readMapFn: (token) => listPlayerGuestbookReadMap(token),
    containerKey: "profile_player_id" as const,
    idsKey: "entry_ids" as const,
    singleQueryKey: (pid, token) => qk.playerGuestbookReadIds(pid, token),
    singleFn: (token, pid) => listPlayerGuestbookReadIds(token, pid),
  });

export { useSeenGuestbookIdsByProfileId, useSeenGuestbookSet };
