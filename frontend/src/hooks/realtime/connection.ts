/**
 * Shared websocket connection layer.
 *
 * - One pooled socket per URL (multiple components share it).
 * - Reconnect with exponential backoff.
 * - Heartbeat ping + liveness timeout: if no message arrives within
 *   LIVENESS_TIMEOUT, the socket is presumed dead and force-reconnected
 *   (handles half-open sockets after sleep / network changes).
 * - Aggregate connection status (live | reconnecting | offline) for the UI.
 * - onOpen fires on every (re)connect so subscribers can resync after a gap.
 */
import type { RealtimeStatus } from "../../ui/RealtimeStatusContext";

const PING_INTERVAL = 25_000;
const LIVENESS_TIMEOUT = 35_000;

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

export function buildWsUrlForPath(path: string, token?: string | null) {
  const envValue = import.meta.env.VITE_WS_BASE_URL;
  const raw = typeof envValue === "string" ? envValue.trim() : "";
  const p = path.startsWith("/") ? path : `/${path}`;

  if (raw) {
    if (raw.startsWith("ws://") || raw.startsWith("wss://")) return addTokenToWsUrl(`${raw}${p}`, token);
    if (raw.startsWith("http://") || raw.startsWith("https://")) return addTokenToWsUrl(httpBaseToWsUrl(raw, p), token);
    throw new Error(`Invalid VITE_WS_BASE_URL: ${raw}`);
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return addTokenToWsUrl(`${proto}://${window.location.host}${p}`, token);
}

export type RealtimeMessage = { event: string | null; payload: unknown; seq: number | null };

export type Handler = {
  onMessage: (msg: RealtimeMessage) => void;
  /** Fired on every (re)connect; use to resync after a possible gap. `first` is true on the initial connect. */
  onOpen?: (first: boolean) => void;
};

type ConnStatus = "connecting" | "open" | "closed";

type Conn = {
  url: string;
  ws: WebSocket | null;
  status: ConnStatus;
  subscribers: Set<Handler>;
  refCount: number;
  closing: boolean;
  attempt: number;
  hasConnectedOnce: boolean;
  pingTimer: number | null;
  reconnectTimer: number | null;
  livenessTimer: number | null;
};

const CONNS = new Map<string, Conn>();

// ---- aggregate status store ------------------------------------------------
const statusListeners = new Set<(s: RealtimeStatus) => void>();
let aggregateStatus: RealtimeStatus = "offline";

function computeAggregate(): RealtimeStatus {
  let any = false;
  let anyOpen = false;
  for (const c of CONNS.values()) {
    if (c.refCount <= 0) continue;
    any = true;
    if (c.status === "open") anyOpen = true;
  }
  return anyOpen ? "live" : any ? "reconnecting" : "offline";
}

function refreshStatus() {
  const next = computeAggregate();
  if (next === aggregateStatus) return;
  aggregateStatus = next;
  for (const fn of statusListeners) fn(next);
}

export function subscribeStatus(fn: (s: RealtimeStatus) => void): () => void {
  statusListeners.add(fn);
  fn(aggregateStatus);
  return () => statusListeners.delete(fn);
}

export function getStatus(): RealtimeStatus {
  return aggregateStatus;
}

// ---- timers ----------------------------------------------------------------
function clearPing(c: Conn) {
  if (c.pingTimer) window.clearInterval(c.pingTimer);
  c.pingTimer = null;
}
function clearReconnect(c: Conn) {
  if (c.reconnectTimer) window.clearTimeout(c.reconnectTimer);
  c.reconnectTimer = null;
}
function clearLiveness(c: Conn) {
  if (c.livenessTimer) window.clearTimeout(c.livenessTimer);
  c.livenessTimer = null;
}
function bumpLiveness(c: Conn) {
  clearLiveness(c);
  c.livenessTimer = window.setTimeout(() => {
    // No traffic (not even pong) for too long -> assume dead, force reconnect.
    if (c.refCount <= 0 || c.closing) return;
    try {
      c.ws?.close();
    } catch {
      /* ignore */
    }
  }, LIVENESS_TIMEOUT);
}

function setStatus(c: Conn, status: ConnStatus) {
  if (c.status === status) return;
  c.status = status;
  refreshStatus();
}

function scheduleReconnect(c: Conn) {
  if (c.closing || c.reconnectTimer || c.refCount <= 0) return;
  const attempt = c.attempt++;
  const delay = Math.min(15_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 300);
  c.reconnectTimer = window.setTimeout(() => {
    c.reconnectTimer = null;
    if (!c.closing && c.refCount > 0) connect(c);
  }, delay);
}

function startPing(c: Conn, ws: WebSocket) {
  clearPing(c);
  c.pingTimer = window.setInterval(() => {
    if (c.refCount <= 0 || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send("ping");
    } catch {
      /* ignore */
    }
  }, PING_INTERVAL);
}

function connect(c: Conn) {
  if (c.closing || c.refCount <= 0) return;
  if (c.ws && c.ws.readyState <= WebSocket.OPEN) return;

  setStatus(c, "connecting");
  let ws: WebSocket;
  try {
    ws = new WebSocket(c.url);
  } catch {
    setStatus(c, "closed");
    scheduleReconnect(c);
    return;
  }
  c.ws = ws;

  ws.onopen = () => {
    if (c.refCount <= 0) return;
    c.attempt = 0;
    setStatus(c, "open");
    startPing(c, ws);
    bumpLiveness(c);
    const first = !c.hasConnectedOnce;
    c.hasConnectedOnce = true;
    for (const sub of c.subscribers) sub.onOpen?.(first);
  };

  ws.onmessage = (ev) => {
    if (c.refCount <= 0) return;
    bumpLiveness(c);
    let parsed: unknown = null;
    if (typeof ev.data === "string") {
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        parsed = null;
      }
    }
    const rec = (parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null) ?? {};
    const msg: RealtimeMessage = {
      event: typeof rec.event === "string" ? rec.event : null,
      payload: rec.payload ?? null,
      seq: typeof rec.seq === "number" ? rec.seq : null,
    };
    if (msg.event === "connected" || msg.event === "pong" || msg.event == null) return;
    for (const sub of c.subscribers) {
      try {
        sub.onMessage(msg);
      } catch {
        /* ignore subscriber errors */
      }
    }
  };

  ws.onerror = () => {
    /* onclose drives reconnect */
  };

  ws.onclose = () => {
    clearPing(c);
    clearLiveness(c);
    setStatus(c, "closed");
    if (c.refCount <= 0 || c.closing) return;
    scheduleReconnect(c);
  };
}

function closeConn(c: Conn) {
  c.closing = true;
  clearPing(c);
  clearReconnect(c);
  clearLiveness(c);
  try {
    c.ws?.close(1000, "idle");
  } catch {
    /* ignore */
  }
  c.ws = null;
  c.closing = false;
}

export function subscribe(url: string, handler: Handler): () => void {
  let c = CONNS.get(url);
  if (!c) {
    c = {
      url,
      ws: null,
      status: "closed",
      subscribers: new Set(),
      refCount: 0,
      closing: false,
      attempt: 0,
      hasConnectedOnce: false,
      pingTimer: null,
      reconnectTimer: null,
      livenessTimer: null,
    };
    CONNS.set(url, c);
  }
  c.subscribers.add(handler);
  c.refCount += 1;

  // If already open, fire onOpen immediately so a late subscriber can sync.
  if (c.ws && c.ws.readyState === WebSocket.OPEN) handler.onOpen?.(false);
  connect(c);
  refreshStatus();

  return () => {
    const conn = CONNS.get(url);
    if (!conn) return;
    conn.subscribers.delete(handler);
    conn.refCount = Math.max(0, conn.refCount - 1);
    if (conn.refCount === 0) {
      closeConn(conn);
      CONNS.delete(url);
    }
    refreshStatus();
  };
}
