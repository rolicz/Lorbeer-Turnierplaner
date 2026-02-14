import { useEffect, useState } from "react";
import { getSeenGuestbookEntryIds, subscribeSeenGuestbook } from "../seenGuestbook";

export function useSeenGuestbookIdsByProfileId(profilePlayerIds: number[]) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSeenGuestbook(() => setTick((v) => v + 1)), []);
  const out = new Map<number, Set<number>>();
  for (const pid of profilePlayerIds) out.set(pid, new Set(getSeenGuestbookEntryIds(pid)));
  return out;
}

export function useSeenGuestbookSet(profilePlayerId: number) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSeenGuestbook(() => setTick((v) => v + 1)), []);
  return new Set(getSeenGuestbookEntryIds(profilePlayerId));
}
