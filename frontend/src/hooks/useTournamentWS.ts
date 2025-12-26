import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL as string;

export function useTournamentWS(tournamentId: number | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!tournamentId) return;

    const ws = new WebSocket(`${WS_BASE}/ws/tournaments/${tournamentId}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.event) {
          qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
          qc.invalidateQueries({ queryKey: ["tournaments"] });
        }
      } catch {
        // ignore
      }
    };

    return () => ws.close();
  }, [tournamentId, qc]);
}
