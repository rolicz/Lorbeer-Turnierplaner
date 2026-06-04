import { listPlayerPokeReadIds, listPlayerPokeReadMap } from "../api/players.api";
import { qk } from "../api/queryKeys";
import { createSeenItemsHooks } from "./useSeenItems";

const { useSeenIdsByContainerId: useSeenPokesByProfileId, useSeenSet: useSeenPokesSet } =
  createSeenItemsHooks({
    readMapQueryKey: (token) => qk.playerPokesReadMap(token),
    readMapFn: (token) => listPlayerPokeReadMap(token),
    containerKey: "profile_player_id" as const,
    idsKey: "poke_ids" as const,
    singleQueryKey: (pid, token) => qk.playerPokesReadIds(pid, token),
    singleFn: (token, pid) => listPlayerPokeReadIds(token, pid),
  });

export { useSeenPokesByProfileId, useSeenPokesSet };
