import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Convert an HTTP(S) base URL to a WS(S) URL for a given path.
 * Example: https://example.com + /ws/tournaments/3 -> wss://example.com/ws/tournaments/3
 */
function httpBaseToWsUrl(httpBase: string, path: string) {
  const u = new URL(httpBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = path;
  u.search = "";
  u.hash = "";
  return u.toString();
}

function buildWsUrl(tid: number) {
  const raw = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim();

  // If explicitly configured (dev/LAN), support both ws(s):// and http(s):// forms.
  if (raw) {
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
      return `${raw}/ws/tournaments/${tid}`;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return httpBaseToWsUrl(raw, `/ws/tournaments/${tid}`);
    }

    // If someone sets something odd, fail loudly rather than silently.
    throw new Error(`Invalid VITE_WS_BASE_URL: ${raw}`);
  }

  // Production default: same-origin websocket (works behind Caddy reverse proxy).
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/tournaments/${tid}`;
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

    const url = buildWsUrl(tid);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = () => {
      // Any tournament update event: revalidate the cached tournament & list.
      qc.invalidateQueries({ queryKey: ["tournament", tid] });
      qc.invalidateQueries({ queryKey: ["tournaments"] });
    };

    ws.onerror = () => {
      // Don't throw - just let it reconnect on next mount/reload
      // console.debug("WS error", url);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [tid, qc]);
}
