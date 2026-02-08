import { useEffect, useMemo, useState } from "react";
import { getSeenCommentIds, subscribeSeenComments } from "../seenComments";

export function useSeenIdsByTournamentId(tournamentIds: number[]) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeSeenComments(() => setTick((v) => v + 1)), []);

  return useMemo(() => {
    const out = new Map<number, Set<number>>();
    for (const tid of tournamentIds) {
      out.set(tid, new Set(getSeenCommentIds(tid)));
    }
    return out;
  }, [tick, tournamentIds.join("|")]);
}

export function useSeenSet(tournamentId: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeSeenComments(() => setTick((v) => v + 1)), []);
  return useMemo(() => new Set(getSeenCommentIds(tournamentId)), [tick, tournamentId]);
}

