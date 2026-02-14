import { useEffect, useState } from "react";
import { getSeenCommentIds, subscribeSeenComments } from "../seenComments";

export function useSeenIdsByTournamentId(tournamentIds: number[]) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSeenComments(() => setTick((v) => v + 1)), []);
  const out = new Map<number, Set<number>>();
  for (const tid of tournamentIds) out.set(tid, new Set(getSeenCommentIds(tid)));
  return out;
}

export function useSeenSet(tournamentId: number) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSeenComments(() => setTick((v) => v + 1)), []);
  return new Set(getSeenCommentIds(tournamentId));
}
