import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPlayerPoke,
  listPlayerPokes,
  listPlayerPokeSummary,
  markAllPlayerPokesRead,
} from "../../api/players.api";
import { qk } from "../../api/queryKeys";
import type { Role } from "../../api/types";

export type PokeFlashKind = "none" | "sent" | "read";

/**
 * Poke ("anpöbeln") data + actions for a profile: summary/list queries, the
 * unread-author summary, the transient send/read button flash, and the
 * create-poke / mark-all-read mutations. Lifted verbatim from ProfilePage.
 */
export function useProfilePokes({
  targetPlayerId,
  token,
  role,
  actorPlayerId,
}: {
  targetPlayerId: number | null;
  token: string | null;
  role: Role | null;
  actorPlayerId: number | null;
}) {
  const qc = useQueryClient();

  const pokesSummaryQ = useQuery({
    queryKey: qk.playerPokesSummary(),
    queryFn: listPlayerPokeSummary,
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const pokesQ = useQuery({
    queryKey: qk.playerPokes(targetPlayerId ?? "none"),
    queryFn: () => listPlayerPokes(targetPlayerId as number, 80),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });

  const [pokeButtonFlash, setPokeButtonFlash] = useState<{
    kind: PokeFlashKind;
    playerId: number | null;
  }>({ kind: "none", playerId: null });

  const canPokeAsActor =
    !!token &&
    role !== "reader" &&
    Number.isFinite(actorPlayerId) &&
    (actorPlayerId ?? 0) > 0 &&
    Number.isFinite(targetPlayerId) &&
    (targetPlayerId ?? 0) > 0 &&
    Number(actorPlayerId) !== Number(targetPlayerId);

  const pokeSummaryRow = useMemo(() => {
    if (!targetPlayerId) return null;
    return (pokesSummaryQ.data ?? []).find((row) => Number(row.profile_player_id) === Number(targetPlayerId)) ?? null;
  }, [pokesSummaryQ.data, targetPlayerId]);
  const ownerUnreadPokes = useMemo(
    () => (pokesQ.data ?? []).filter((row) => !row.seen_by_profile_owner),
    [pokesQ.data]
  );
  const unreadPokeCount = ownerUnreadPokes.length;
  const unreadPokeAuthorsText = useMemo(() => {
    if (!ownerUnreadPokes.length) return "0";
    const byAuthor = new Map<number, { name: string; count: number }>();
    for (const row of ownerUnreadPokes) {
      const authorId = Number(row.author_player_id);
      const prev = byAuthor.get(authorId);
      if (prev) {
        prev.count += 1;
      } else {
        byAuthor.set(authorId, {
          name: row.author_display_name || `Player #${authorId}`,
          count: 1,
        });
      }
    }
    return Array.from(byAuthor.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((x) => `${x.count}x ${x.name}`)
      .join(", ");
  }, [ownerUnreadPokes]);
  const totalPokeCount = Number(pokeSummaryRow?.total_pokes ?? 0);

  const pokeMut = useMutation({
    mutationFn: async () => {
      if (!token || !targetPlayerId) throw new Error("Not logged in");
      return createPlayerPoke(token, targetPlayerId, actorPlayerId ?? null);
    },
    onSuccess: async () => {
      setPokeButtonFlash({ kind: "sent", playerId: targetPlayerId ?? null });
      await qc.invalidateQueries({ queryKey: qk.playerPokesSummary() });
      await qc.invalidateQueries({ queryKey: qk.playerPokes(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerPokesReadPrefix(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerPokesReadMap(token) });
      await qc.invalidateQueries({ queryKey: qk.playerPokesAuthoredUnread(token) });
    },
  });
  const markPokesReadAllMut = useMutation({
    mutationFn: async () => {
      if (!token || !targetPlayerId) throw new Error("Not logged in");
      return markAllPlayerPokesRead(token, targetPlayerId);
    },
    onSuccess: async () => {
      setPokeButtonFlash({ kind: "read", playerId: targetPlayerId ?? null });
      await qc.invalidateQueries({ queryKey: qk.playerPokesSummary() });
      await qc.invalidateQueries({ queryKey: qk.playerPokes(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerPokesReadIds(targetPlayerId ?? "none", token) });
      await qc.invalidateQueries({ queryKey: qk.playerPokesReadMap(token) });
      await qc.invalidateQueries({ queryKey: qk.playerPokesAuthoredUnread(token) });
    },
  });

  useEffect(() => {
    if (pokeButtonFlash.kind === "none") return;
    const t = window.setTimeout(() => setPokeButtonFlash({ kind: "none", playerId: null }), 1100);
    return () => window.clearTimeout(t);
  }, [pokeButtonFlash]);

  const pokeFlashKind: PokeFlashKind =
    pokeButtonFlash.playerId != null &&
    targetPlayerId != null &&
    Number(pokeButtonFlash.playerId) === Number(targetPlayerId)
      ? pokeButtonFlash.kind
      : "none";

  return {
    pokesError: pokesQ.error,
    pokesSummaryError: pokesSummaryQ.error,
    pokesLoading: pokesQ.isLoading,
    pokesSummaryLoading: pokesSummaryQ.isLoading,
    canPokeAsActor,
    unreadPokeCount,
    unreadPokeAuthorsText,
    totalPokeCount,
    pokeFlashKind,
    pokeMut,
    markPokesReadAllMut,
  };
}
