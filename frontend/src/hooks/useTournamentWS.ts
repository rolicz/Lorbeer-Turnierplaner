import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

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

function addTokenToWsUrl(url: string, token?: string | null) {
  if (!token) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("token", token);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
}

function buildWsUrlForPath(path: string, token?: string | null) {
  const envValue = import.meta.env.VITE_WS_BASE_URL;
  const raw = typeof envValue === "string" ? envValue.trim() : "";

  if (raw) {
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
      return addTokenToWsUrl(`${raw}${path.startsWith("/") ? "" : "/"}${path}`, token);
    }
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return addTokenToWsUrl(httpBaseToWsUrl(raw, path.startsWith("/") ? path : `/${path}`), token);
    }
    throw new Error(`Invalid VITE_WS_BASE_URL: ${raw}`);
  }

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return addTokenToWsUrl(
    `${proto}://${window.location.host}${path.startsWith("/") ? "" : "/"}${path}`,
    token
  );
}

function buildWsUrl(tid: number) {
  return buildWsUrlForPath(`/ws/tournaments/${tid}`);
}

function buildWsUrlUpdateAnyTournament() {
  return buildWsUrlForPath(`/ws/tournaments`);
}

function buildPlayerWsUrl(playerId: number, token?: string | null) {
  return buildWsUrlForPath(`/ws/players/${playerId}`, token);
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function eventNameFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  const event = rec.event;
  return typeof event === "string" ? event : null;
}

type Subscriber = (ev: MessageEvent) => void;

type Conn = {
  url: string;
  ws: WebSocket | null;
  subscribers: Set<Subscriber>;
  refCount: number;
  closing: boolean;
  attempt: number;
  pingTimer: number | null;
  reconnectTimer: number | null;
};

/**
 * Global, shared WS connections keyed by URL.
 * This prevents multiple components (CurrentMatchPreviewCard, LiveTournamentPage, etc.)
 * from opening duplicate sockets to the same endpoint.
 */
const CONNS = new Map<string, Conn>();

function clearPing(conn: Conn) {
  if (conn.pingTimer) window.clearInterval(conn.pingTimer);
  conn.pingTimer = null;
}

function clearReconnect(conn: Conn) {
  if (conn.reconnectTimer) window.clearTimeout(conn.reconnectTimer);
  conn.reconnectTimer = null;
}

function closeConn(conn: Conn, code = 1000, reason = "close") {
  conn.closing = true;
  clearPing(conn);
  clearReconnect(conn);
  try {
    conn.ws?.close(code, reason);
  } catch {
    // ignore
  }
  conn.ws = null;
  conn.closing = false;
}

function scheduleReconnect(conn: Conn) {
  if (conn.closing) return;
  if (conn.reconnectTimer) return;
  if (conn.refCount <= 0) return;

  const attempt = conn.attempt++;
  const base = Math.min(15000, 500 * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 300);
  const delay = base + jitter;

  conn.reconnectTimer = window.setTimeout(() => {
    conn.reconnectTimer = null;
    if (conn.closing) return;
    if (conn.refCount <= 0) return;
    connect(conn);
  }, delay);
}

function startPing(conn: Conn, ws: WebSocket) {
  clearPing(conn);
  conn.pingTimer = window.setInterval(() => {
    if (conn.refCount <= 0) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send("ping"); // backend expects receive_text()
    } catch {
      // ignore
    }
  }, 25000);
}

function connect(conn: Conn) {
  if (conn.closing) return;
  if (conn.refCount <= 0) return;

  // already open/connecting
  if (conn.ws && conn.ws.readyState <= WebSocket.OPEN) return;

  let ws: WebSocket;
  try {
    ws = new WebSocket(conn.url);
  } catch {
    scheduleReconnect(conn);
    return;
  }

  conn.ws = ws;

  ws.onopen = () => {
    if (conn.refCount <= 0) return;
    conn.attempt = 0;
    startPing(conn, ws);
  };

  ws.onmessage = (ev) => {
    if (conn.refCount <= 0) return;
    for (const sub of conn.subscribers) {
      try {
        sub(ev);
      } catch {
        // ignore subscriber errors
      }
    }
  };

  ws.onerror = () => {
    // let onclose handle reconnect
  };

  ws.onclose = () => {
    clearPing(conn);
    if (conn.refCount <= 0) return;
    if (conn.closing) return;
    scheduleReconnect(conn);
  };
}

function getOrCreateConn(url: string): Conn {
  const existing = CONNS.get(url);
  if (existing) return existing;

  const conn: Conn = {
    url,
    ws: null,
    subscribers: new Set(),
    refCount: 0,
    closing: false,
    attempt: 0,
    pingTimer: null,
    reconnectTimer: null,
  };
  CONNS.set(url, conn);
  return conn;
}

function subscribe(url: string, fn: Subscriber) {
  const conn = getOrCreateConn(url);
  conn.subscribers.add(fn);
  conn.refCount += 1;

  connect(conn);

  return () => {
    conn.subscribers.delete(fn);
    conn.refCount = Math.max(0, conn.refCount - 1);

    if (conn.refCount === 0) {
      closeConn(conn, 1000, "idle");
      CONNS.delete(url);
    }
  };
}

// ---- invalidation de-dupe (avoid 3 components invalidating the same queries) ----
const INVALIDATE_TIMERS = new Map<string, number>();

function scheduleInvalidate(key: string, fn: () => void) {
  if (INVALIDATE_TIMERS.has(key)) return;
  const t = window.setTimeout(() => {
    INVALIDATE_TIMERS.delete(key);
    fn();
  }, 80);
  INVALIDATE_TIMERS.set(key, t);
}

function shouldIgnoreEventName(eventName: string | null) {
  return eventName === "connected" || eventName === "pong" || eventName == null;
}

function invalidateTournamentRelated(qc: QueryClient, tid: number) {
  void qc.invalidateQueries({ queryKey: ["tournament", tid] });
  void qc.invalidateQueries({ queryKey: ["comments", tid] });
  void qc.invalidateQueries({ queryKey: ["comments", "summary"] });
  void qc.invalidateQueries({ queryKey: ["tournaments"] });
  void qc.invalidateQueries({ queryKey: ["tournaments", "live"] });

  // Cup + future laurels/points (players stats)
  void qc.invalidateQueries({ queryKey: ["cup"] });
  void qc.invalidateQueries({ queryKey: ["stats", "players"] });
  void qc.invalidateQueries({ queryKey: ["stats", "h2h"] });
  void qc.invalidateQueries({ queryKey: ["stats", "streaks"] });
  void qc.invalidateQueries({ queryKey: ["stats", "ratings"] });
}

function invalidateAnyTournamentRelated(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ["cup"] });
  void qc.invalidateQueries({ queryKey: ["tournaments"] });
  void qc.invalidateQueries({ queryKey: ["tournaments", "live"] });
  void qc.invalidateQueries({ queryKey: ["comments", "summary"] });
  void qc.invalidateQueries({ queryKey: ["stats", "players"] });
  void qc.invalidateQueries({ queryKey: ["stats", "h2h"] });
  void qc.invalidateQueries({ queryKey: ["stats", "streaks"] });
  void qc.invalidateQueries({ queryKey: ["stats", "ratings"] });
  void qc.invalidateQueries({ queryKey: ["stats", "playerMatches"] });
}

function invalidatePlayerPokeRelated(qc: QueryClient, playerId: number, token?: string | null) {
  void qc.invalidateQueries({ queryKey: ["players", "pokes", "summary"] });
  void qc.invalidateQueries({ queryKey: ["players", "pokes", playerId] });
  void qc.invalidateQueries({ queryKey: ["players", "pokes", "read", playerId, token ?? "none"] });
  if (token) {
    void qc.invalidateQueries({ queryKey: ["players", "pokes", "read-map", token] });
    void qc.invalidateQueries({ queryKey: ["players", "pokes", "authored-unread", token] });
  }
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

  const tidRef = useRef<number | null>(tid);
  useEffect(() => {
    tidRef.current = tid;
  }, [tid]);

  useEffect(() => {
    if (!tid || !url) return;

    const unsub = subscribe(url, (ev) => {
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      const eventName = eventNameFromPayload(data);
      if (shouldIgnoreEventName(eventName)) return;

      scheduleInvalidate(`tournament:${tid}`, () => {
        const id = tidRef.current;
        if (!id) return;
        invalidateTournamentRelated(qc, id);
      });
    });

    return () => {
      unsub();
    };
  }, [qc, tid, url]);
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

  useEffect(() => {
    if (!url) return;

    const unsub = subscribe(url, (ev) => {
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      const eventName = eventNameFromPayload(data);
      if (shouldIgnoreEventName(eventName)) return;

      scheduleInvalidate("tournaments:any", () => {
        invalidateAnyTournamentRelated(qc);
      });
    });

    return () => {
      unsub();
    };
  }, [qc, url]);
}

export function usePlayerProfileWS(playerId: number | null, token?: string | null) {
  const qc = useQueryClient();

  const url = (() => {
    if (!playerId) return null;
    try {
      return buildPlayerWsUrl(playerId, token);
    } catch {
      return null;
    }
  })();

  const playerIdRef = useRef<number | null>(playerId);
  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    if (!playerId || !url) return;

    const unsub = subscribe(url, (ev) => {
      const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
      const eventName = eventNameFromPayload(data);
      if (shouldIgnoreEventName(eventName)) return;

      scheduleInvalidate(`player-pokes:${playerId}`, () => {
        const id = playerIdRef.current;
        if (!id) return;
        invalidatePlayerPokeRelated(qc, id, token);
      });
    });

    return () => {
      unsub();
    };
  }, [playerId, qc, token, url]);
}
