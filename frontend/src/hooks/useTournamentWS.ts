import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Convert an HTTP(S) base URL to a WS(S) URL for a given path.
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

  if (raw) {
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
      return `${raw}${path.startsWith("/") ? "" : "/"}${path}`;
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return httpBaseToWsUrl(raw, path.startsWith("/") ? path : `/${path}`);
    }
    throw new Error(`Invalid VITE_WS_BASE_URL: ${raw}`);
  }

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
  enabled: boolean;
  label: string;
  onMessage: (ev: MessageEvent) => void;
};

function useRobustWS(url: string | null, { enabled, label, onMessage }: WSOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const closingRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);

  // ✅ Keep handler stable (no reconnects because callback identity changes)
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !url) {
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

    if (lastUrlRef.current === url && wsRef.current && wsRef.current.readyState <= 1) return;
    lastUrlRef.current = url;

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
      if (reconnectTimerRef.current) return;

      const attempt = attemptRef.current++;
      const base = Math.min(15000, 500 * Math.pow(2, attempt));
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
      pingTimerRef.current = window.setInterval(() => {
        if (!alive) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send("ping"); // server expects receive_text()
        } catch {}
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
        attemptRef.current = 0;
        startPing(ws);
        void label;
      };

      ws.onmessage = (ev) => {
        if (!alive) return;
        onMessageRef.current(ev);
      };

      ws.onerror = () => {
        // let onclose handle reconnect
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
  }, [enabled, url, label]);
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

  const invalidateTimerRef = useRef<number | null>(null);

  useRobustWS(url, {
    enabled: !!tid,
    label: `tournament:${tid ?? "none"}`,
    onMessage: (ev) => {
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      const eventName = data?.event ?? null;

      // Debounce invalidations
      if (invalidateTimerRef.current) return;
      invalidateTimerRef.current = window.setTimeout(() => {
        invalidateTimerRef.current = null;
        if (!tid) return;

        // Tournament page/card data
        qc.invalidateQueries({ queryKey: ["tournament", tid] });

        // Lists that show status/live marker
        qc.invalidateQueries({ queryKey: ["tournaments"] });
        qc.invalidateQueries({ queryKey: ["tournaments", "live"] });

        qc.invalidateQueries({ queryKey: ["cup"] });
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
        qc.invalidateQueries({ queryKey: ["cup"] });
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
