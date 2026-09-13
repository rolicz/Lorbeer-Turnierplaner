import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { getCup, listCupDefs, type CupDef } from "../api/cup.api";
import { qk } from "../api/queryKeys";
import type { AvatarCup } from "../ui/primitives/AvatarCircle";

/**
 * Who holds each cup **right now**, keyed by player id — the one tense an
 * avatar ring speaks in (T15). Historic ownership is never a ring: the
 * standings' crown badge (`CupOwnerBadge`) is what says who went into a given
 * tournament holding a cup.
 *
 * Every caller shares one cache entry per cup (`qk.cupDefs` + `qk.cup`), so
 * adopting this on a page that already renders a cup costs no extra request,
 * and it never blocks a first render — an avatar simply gains its ring when the
 * answer arrives.
 */
export function useCupHolders({ enabled = true }: { enabled?: boolean } = {}) {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs, enabled, staleTime: 30_000 });
  const defs = useMemo<CupDef[]>(() => defsQ.data?.cups ?? [], [defsQ.data]);

  const cupQs = useQueries({
    queries: defs.map((c) => ({ queryKey: qk.cup(c.key), queryFn: () => getCup(c.key), enabled, staleTime: 30_000 })),
  });

  // Cheap to rebuild each render (cups are few, players fewer); `useQueries`
  // hands back a fresh array every time anyway, so a memo would never hit.
  const cupsHeldByPlayerId = new Map<number, AvatarCup[]>();
  cupQs.forEach((q, i) => {
    const def = defs[i];
    const ownerId = Number(q.data?.owner?.id ?? 0);
    if (!def || ownerId <= 0) return;
    const arr = cupsHeldByPlayerId.get(ownerId) ?? [];
    arr.push({ key: def.key, name: q.data?.cup?.name ?? def.name });
    cupsHeldByPlayerId.set(ownerId, arr);
  });

  return { cupsHeldByPlayerId };
}

/**
 * The tournament where each cup was **first claimed**, keyed by cup key.
 *
 * `cup_stakes` names one player per cup per tournament, and for every
 * tournament but one that player is the defender — the holder going in. The
 * exception is the tournament that created the cup: there was no holder, so the
 * backend names the *winner* instead (`history[0].from.id === 0`). A caller that
 * puts a verb on that name ("… defending") has to know which of the two it is.
 *
 * Shares `useCupHolders`' cached queries, so asking both costs one fetch.
 */
export function useCupFirstClaims({ enabled = true }: { enabled?: boolean } = {}) {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs, enabled, staleTime: 30_000 });
  const defs = useMemo<CupDef[]>(() => defsQ.data?.cups ?? [], [defsQ.data]);

  const cupQs = useQueries({
    queries: defs.map((c) => ({ queryKey: qk.cup(c.key), queryFn: () => getCup(c.key), enabled, staleTime: 30_000 })),
  });

  const firstClaimTournamentByCupKey = new Map<string, number>();
  cupQs.forEach((q, i) => {
    const def = defs[i];
    if (!def) return;
    const first = (q.data?.history ?? []).find((h) => Number(h.from?.id ?? 0) <= 0);
    if (first) firstClaimTournamentByCupKey.set(def.key, Number(first.tournament_id));
  });

  return { firstClaimTournamentByCupKey };
}
