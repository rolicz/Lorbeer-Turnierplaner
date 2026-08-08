import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../api/client";
import { qk } from "../api/queryKeys";

export type LiveTournamentLite = {
  id: number;
  name: string;
  mode: "1v1" | "2v2";
  status: "live";
  date?: string | null;
};

/**
 * The currently LIVE tournament (derived from match states server-side), or null.
 *
 * Shared by the dashboard live card and the nav shells via the query cache;
 * the interval keeps always-mounted consumers (sidebar) fresh without a WS.
 */
export function useLiveTournament() {
  return useQuery({
    queryKey: qk.tournamentsLive(),
    queryFn: async (): Promise<LiveTournamentLite | null> =>
      apiFetch<LiveTournamentLite | null>("/tournaments/live"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    staleTime: 0,
  });
}
