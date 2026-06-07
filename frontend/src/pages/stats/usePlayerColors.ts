import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listPlayers } from "../../api/players.api";
import { qk } from "../../api/queryKeys";
import { buildPlayerColorMap, colorForIdx, type PlayerColor } from "./trendsMath";

/**
 * Single source of truth for per-player line/marker colours. Builds a stable
 * playerId → colour map from the **full roster** so a player's colour is the same
 * on the dashboard, Trends, Positions and the Player radar.
 *
 * `colorOf` falls back to a deterministic hue for ids not in the roster (so it
 * never throws), but in practice every player is covered.
 */
export function usePlayerColors() {
  const playersQ = useQuery({
    queryKey: qk.players(),
    queryFn: listPlayers,
    staleTime: 5 * 60_000,
  });

  const ids = useMemo(() => (playersQ.data ?? []).map((p) => p.id), [playersQ.data]);
  const map = useMemo(() => buildPlayerColorMap(ids), [ids]);

  const colorOf = useMemo(() => {
    const total = Math.max(1, map.size);
    return (playerId: number): PlayerColor => map.get(playerId) ?? colorForIdx(Math.abs(playerId) % total, total);
  }, [map]);

  return { colorOf, map, ready: !!playersQ.data };
}
