export class ApiError extends Error {
  status: number;
  statusText: string;
  bodyText: string;
  /**
   * Seconds to wait before trying again — a 429's `{"retry_after": n}` (FastAPI wraps it
   * in `detail`), falling back to its `Retry-After` header; `null` for every other status.
   */
  retryAfter: number | null;

  constructor(status: number, statusText: string, bodyText: string, retryAfter: number | null = null) {
    super(`${status} ${statusText}: ${bodyText}`);
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
    this.retryAfter = retryAfter;
  }

  /** The server's own sentence (`{"detail": "…"}`), when it sent one — for a form's error line. */
  get detail(): string | null {
    const parsed = parseJson(this.bodyText);
    const detail = parsed && typeof parsed === "object" && "detail" in parsed ? (parsed as { detail: unknown }).detail : null;
    return typeof detail === "string" && detail.trim() ? detail.trim() : null;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function retryAfterFrom(res: Response, bodyText: string): number | null {
  if (res.status !== 429) return null;
  const parsed = parseJson(bodyText);
  const detail = parsed && typeof parsed === "object" && "detail" in parsed ? (parsed as { detail: unknown }).detail : parsed;
  const fromBody =
    detail && typeof detail === "object" && "retry_after" in detail
      ? Number((detail as { retry_after: unknown }).retry_after)
      : NaN;
  if (Number.isFinite(fromBody) && fromBody >= 0) return Math.ceil(fromBody);
  const fromHeader = Number(res.headers.get("Retry-After"));
  return Number.isFinite(fromHeader) && fromHeader >= 0 ? Math.ceil(fromHeader) : null;
}

/**
 * Vite env: build-time.
 * - Dev:   VITE_API_BASE_URL=/api   (vite proxies it to the backend, so dev is one origin — L0)
 * - Prod:  VITE_API_BASE_URL=/api
 */
const envBase = import.meta.env.VITE_API_BASE_URL;
const RAW_BASE = typeof envBase === "string" ? envBase.trim() : "";

/**
 * Returns absolute base URL or relative '/api'.
 * - If env missing: default to '/api' (works behind reverse proxy)
 */
export const API_BASE = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : "/api";

/**
 * Join base + path safely, regardless of whether base is absolute URL or relative '/api'.
 */
function joinUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;

  // Absolute base (http://..., https://...)
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return `${base.replace(/\/+$/, "")}${p}`;
  }

  // Relative base (/api)
  return `${base.replace(/\/+$/, "")}${p}`;
}

/**
 * The session is the `lk_session` cookie (L2): `HttpOnly`, set by the server on login and
 * sent by the browser on every same-origin request — this one, an `<img>`, the websocket
 * handshake, the service worker's — without being asked. There is no credential anywhere
 * in the frontend and nothing here to attach; `credentials` stays at its default,
 * `same-origin`, which is exactly the origin dev (vite's proxy) and production (Caddy)
 * both are.
 */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers || {});

  // Only set Content-Type for requests that actually send a body.
  // This avoids oddities with DELETE/GET and makes 204 handling cleaner.
  if (opts.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = joinUrl(API_BASE, path);
  const res = await fetch(url, { ...opts, headers });

  if (!res.ok) {
    // Don't fire on the auth endpoints — a 401 there means wrong credentials or a bad
    // legacy JWT, not a session the server has ended.
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("api:unauthorized"));
    }
    const text = await res.text();
    throw new ApiError(res.status, res.statusText, text, retryAfterFrom(res, text));
  }

  // Handle 204 No Content (e.g., DELETE)
  if (res.status === 204) return undefined as T;

  // Some endpoints might return empty body with 200 (rare), handle safely:
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Build a media resource URL with optional cache-busting via `?v=<updatedAt>` and an
 * optional `?w=<width>` (W2), which asks the server for the pre-computed size that is
 * actually drawn instead of the original file.
 *
 * This is the app's **one** media URL builder, and a call that passes no width still
 * produces the byte-identical URL it produced before W2 — deliberately, so this batch
 * invalidates nothing a browser has already cached. Widths come from
 * `api/mediaSizes.ts`; nothing else spells one.
 */
export function mediaUrl(path: string, updatedAt?: string | null, width?: number | null): string {
  const base = API_BASE.replace(/\/+$/, "");
  const qs: string[] = [];
  if (updatedAt) qs.push(`v=${encodeURIComponent(updatedAt)}`);
  if (width) qs.push(`w=${width}`);
  const q = qs.length ? `?${qs.join("&")}` : "";
  return `${base}${path.startsWith("/") ? "" : "/"}${path}${q}`;
}

// FormData uploads must not set Content-Type (browser adds the multipart boundary).
// Use this instead of apiFetch for multipart/form-data requests.
export async function apiUpload<T>(path: string, opts: { body: FormData; method?: string }): Promise<T> {
  const url = joinUrl(API_BASE, path);
  const res = await fetch(url, {
    method: opts.method ?? "PUT",
    body: opts.body,
  });
  if (!res.ok) {
    // Intentional (A5): a 401 here means the session ended mid-upload; route it through the same
    // central logout as apiFetch. No /auth/ guard needed — no upload path is under /auth/.
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("api:unauthorized"));
    }
    const text = await res.text();
    throw new ApiError(res.status, res.statusText, text, retryAfterFrom(res, text));
  }
  return (await res.json()) as T;
}
