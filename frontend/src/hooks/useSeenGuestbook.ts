import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPlayerGuestbookReadIds, listPlayerGuestbookReadMap } from "../api/players.api";
import { useAuth } from "../auth/AuthContext";

export function useSeenGuestbookIdsByProfileId(profilePlayerIds: number[]) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["players", "guestbook", "read-map", token ?? "none"],
    queryFn: () => listPlayerGuestbookReadMap(token as string),
    enabled: !!token,
  });
  return useMemo(() => {
    const source = new Map<number, Set<number>>();
    for (const row of q.data ?? []) {
      source.set(Number(row.profile_player_id), new Set((row.entry_ids ?? []).map((x) => Number(x))));
    }
    const out = new Map<number, Set<number>>();
    for (const pid of profilePlayerIds) out.set(pid, source.get(pid) ?? new Set<number>());
    return out;
  }, [q.data, profilePlayerIds]);
}

export function useSeenGuestbookSet(profilePlayerId: number) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["players", "guestbook", "read", profilePlayerId, token ?? "none"],
    queryFn: () => listPlayerGuestbookReadIds(token as string, profilePlayerId),
    enabled: !!token && Number.isFinite(profilePlayerId) && profilePlayerId > 0,
  });
  return useMemo(() => new Set((q.data?.entry_ids ?? []).map((x) => Number(x))), [q.data?.entry_ids]);
}
