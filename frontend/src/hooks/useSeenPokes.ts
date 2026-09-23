import { listPlayerPokeReadIds, listPlayerPokeReadMap } from "../api/players.api";
import { qk } from "../api/queryKeys";
import { createSeenItemsHooks } from "./useSeenItems";

const { useSeenIdsByContainerId: useSeenPokesByProfileId, useSeenSet: useSeenPokesSet } =
  createSeenItemsHooks({
    readMapQueryKey: (viewerId) => qk.playerPokesReadMap(viewerId),
    readMapFn: listPlayerPokeReadMap,
    containerKey: "profile_player_id" as const,
    idsKey: "poke_ids" as const,
    singleQueryKey: (pid, viewerId) => qk.playerPokesReadIds(pid, viewerId),
    singleFn: (pid) => listPlayerPokeReadIds(pid),
  });

export { useSeenPokesByProfileId, useSeenPokesSet };
