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

function buildWsUrlForPath(path: string) {
  const raw = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim();

  // If explicitly configured (dev/LAN), support both ws(s):// and http(s):// forms.
  if (raw) {
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
      return `${raw}${path.startsWith("/") ? "" : "/"}${path}`;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return httpBaseToWsUrl(raw, path.startsWith("/") ? path : `/${path}`);
    }
    // If someone sets something odd, fail loudly rather than silently.
    throw new Error(`Invalid VITE_WS_BASE_URL: ${raw}`);
  }

  // Production default: same-origin websocket (works behind reverse proxy).
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${path.startsWith("/") ? "" : "/"}${path}`;
}

function buildWsUrl(tid: number) {
  return buildWsUrlForPath(`/ws/tournaments/${tid}`);
}

function buildWsUrlUpdateAnyTournament() {
  return buildWsUrlForPath(`/ws/tournaments`);
}

function safeJsonParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

type WSOptions = {
  /** If false, no connect, and any existing socket is closed. */
  enabled: boolean;
  /** Used only for debugging. */
  label: string;
  /** Called for every incoming message. */
  onMessage: (ev: MessageEvent) => void;
};

/**
 * Robust websocket lifecycle:
 * - reconnect on close (exponential backoff + jitter)
 * - heartbeat ping to keep proxies from idling out the connection
 * - StrictMode/HMR-safe (won’t create “ghost” reconnect loops)
 */
function useRobustWS(url: string | null, { enabled, label, onMessage }: WSOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const closingRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !url) {
      // If disabled, ensure everything is closed/clean.
      closingRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
      reconnectTimerRef.current = null;
      pingTimerRef.current = null;
      wsRef.current?.close(1000, "disabled");
      wsRef.current = null;
      lastUrlRef.current = null;
      closingRef.current = false;
      return;
    }

    // Prevent double-connect loops in dev (StrictMode/HMR)
    if (lastUrlRef.current === url && wsRef.current && wsRef.current.readyState <= 1) return;
    lastUrlRef.current = url;

    // Cleanup previous connection/timers
    closingRef.current = true;
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
    reconnectTimerRef.current = null;
    pingTimerRef.current = null;
    wsRef.current?.close(1000, "reconnect");
    wsRef.current = null;
    closingRef.current = false;

    let alive = true;

    const clearPing = () => {
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    };

    const scheduleReconnect = () => {
      if (!alive || closingRef.current) return;
      if (reconnectTimerRef.current) return; // already scheduled

      const attempt = attemptRef.current++;
      // exponential backoff with cap + jitter
      const base = Math.min(15000, 500 * Math.pow(2, attempt)); // 0.5s, 1s, 2s, 4s...
      const jitter = Math.floor(Math.random() * 300);
      const delay = base + jitter;

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!alive || closingRef.current) return;
        connect();
      }, delay);
    };

    const startPing = (ws: WebSocket) => {
      clearPing();
      // Keep it comfortably below typical proxy idle timeouts (often 60s).
      pingTimerRef.current = window.setInterval(() => {
        if (!alive) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        try {
          // Server loop does `receive_text()`, so any text is fine.
          ws.send("ping");
        } catch {
          // ignore
        }
      }, 25000);
    };

    const connect = () => {
      if (!alive || closingRef.current) return;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        attemptRef.current = 0; // reset backoff on success
        startPing(ws);
      };

      ws.onmessage = (ev) => {
        if (!alive) return;
        onMessage(ev);
      };

      ws.onerror = () => {
        // Some browsers only fire onclose after an error; don’t force-close here.
      };

      ws.onclose = () => {
        clearPing();
        if (!alive || closingRef.current) return;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      alive = false;
      closingRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
      reconnectTimerRef.current = null;
      pingTimerRef.current = null;
      wsRef.current?.close(1000, "unmount");
      wsRef.current = null;
      closingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url, label, onMessage]);
}

export function useTournamentWS(tid: number | null) {
  const qc = useQueryClient();

  const url = (() => {
    if (!tid) return null;
    try {
      return buildWsUrl(tid);
    } catch {
      return null;
    }
  })();

  // lightweight debounce so bursts of ws events don’t spam invalidations
  const invalidateTimerRef = useRef<number | null>(null);

  useRobustWS(url, {
    enabled: !!tid,
    label: `tournament:${tid ?? "none"}`,
    onMessage: (ev) => {
      // Try JSON (your server sends {event,payload} in some places), but accept anything.
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      const eventName = data?.event ?? null;

      // Optional: if you ever want to filter:
      // if (eventName && !["match_updated", "tournament_updated"].includes(eventName)) return;

      if (invalidateTimerRef.current) return;
      invalidateTimerRef.current = window.setTimeout(() => {
        invalidateTimerRef.current = null;
        if (!tid) return;
        qc.invalidateQueries({ queryKey: ["tournament", tid] });
        qc.invalidateQueries({ queryKey: ["tournaments"] });
        qc.invalidateQueries({ queryKey: ["tournaments", "live"] });
      }, 80);

      // You can keep this if you like:
      // console.log("WS msg", { eventName, tid });
      void eventName;
    },
  });

  useEffect(() => {
    return () => {
      if (invalidateTimerRef.current) window.clearTimeout(invalidateTimerRef.current);
      invalidateTimerRef.current = null;
    };
  }, []);
}

export function useAnyTournamentWS() {
  const qc = useQueryClient();

  const url = (() => {
    try {
      return buildWsUrlUpdateAnyTournament();
    } catch {
      return null;
    }
  })();

  const invalidateTimerRef = useRef<number | null>(null);

  useRobustWS(url, {
    enabled: true,
    label: "tournaments:any",
    onMessage: (ev) => {
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      const eventName = data?.event ?? null;

      if (invalidateTimerRef.current) return;
      invalidateTimerRef.current = window.setTimeout(() => {
        invalidateTimerRef.current = null;
        qc.invalidateQueries({ queryKey: ["tournaments"] });
        qc.invalidateQueries({ queryKey: ["tournaments", "live"] });
      }, 80);

      void eventName;
    },
  });

  useEffect(() => {
    return () => {
      if (invalidateTimerRef.current) window.clearTimeout(invalidateTimerRef.current);
      invalidateTimerRef.current = null;
    };
  }, []);
}
