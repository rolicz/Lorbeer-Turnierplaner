import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

function toWsUrl(apiBase: string, path: string) {
  const u = new URL(apiBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = path;
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function useTournamentWS(tid: number | null) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const lastTidRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tid) return;

    // Prevent double-connect loops in dev (StrictMode/HMR)
    if (lastTidRef.current === tid && wsRef.current && wsRef.current.readyState <= 1) {
      return;
    }
    lastTidRef.current = tid;

    // Close any previous socket
    wsRef.current?.close();

    const apiBase = (import.meta.env.VITE_WS_BASE_URL as string) || "http://localhost:8001";
    const url = toWsUrl(apiBase, `/ws/tournaments/${tid}`);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["tournament", tid] });
      qc.invalidateQueries({ queryKey: ["tournaments"] });
    };

    ws.onerror = () => {
      // Don't throw - just let it retry on next mount/reload
      // console.debug("WS error", url);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [tid, qc]);
}
