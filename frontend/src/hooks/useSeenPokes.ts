import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPlayerPokeReadIds, listPlayerPokeReadMap } from "../api/players.api";
import { useAuth } from "../auth/AuthContext";

export function useSeenPokesByProfileId(profilePlayerIds: number[]) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["players", "pokes", "read-map", token ?? "none"],
    queryFn: () => listPlayerPokeReadMap(token as string),
    enabled: !!token,
  });
  return useMemo(() => {
    const source = new Map<number, Set<number>>();
    for (const row of q.data ?? []) {
      source.set(Number(row.profile_player_id), new Set((row.poke_ids ?? []).map((x) => Number(x))));
    }
    const out = new Map<number, Set<number>>();
    for (const pid of profilePlayerIds) out.set(pid, source.get(pid) ?? new Set<number>());
    return out;
  }, [q.data, profilePlayerIds]);
}

export function useSeenPokesSet(profilePlayerId: number) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["players", "pokes", "read", profilePlayerId, token ?? "none"],
    queryFn: () => listPlayerPokeReadIds(token as string, profilePlayerId),
    enabled: !!token && Number.isFinite(profilePlayerId) && profilePlayerId > 0,
  });
  return useMemo(() => new Set((q.data?.poke_ids ?? []).map((x) => Number(x))), [q.data?.poke_ids]);
}

