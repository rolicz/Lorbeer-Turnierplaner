import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listTournamentCommentReadIds, listTournamentCommentReadMap } from "../api/comments.api";
import { useAuth } from "../auth/AuthContext";

export function useSeenIdsByTournamentId(tournamentIds: number[]) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["comments", "read-map", token ?? "none"],
    queryFn: () => listTournamentCommentReadMap(token as string),
    enabled: !!token,
  });
  return useMemo(() => {
    const source = new Map<number, Set<number>>();
    for (const row of q.data ?? []) {
      source.set(Number(row.tournament_id), new Set((row.comment_ids ?? []).map((x) => Number(x))));
    }
    const out = new Map<number, Set<number>>();
    for (const tid of tournamentIds) out.set(tid, source.get(tid) ?? new Set<number>());
    return out;
  }, [q.data, tournamentIds]);
}

export function useSeenSet(tournamentId: number) {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["comments", "read", tournamentId, token ?? "none"],
    queryFn: () => listTournamentCommentReadIds(token as string, tournamentId),
    enabled: !!token && Number.isFinite(tournamentId) && tournamentId > 0,
  });
  return useMemo(() => new Set((q.data?.comment_ids ?? []).map((x) => Number(x))), [q.data?.comment_ids]);
}
