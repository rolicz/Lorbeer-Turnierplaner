export class ApiError extends Error {
  status: number;
  statusText: string;
  bodyText: string;

  constructor(status: number, statusText: string, bodyText: string) {
    super(`${status} ${statusText}: ${bodyText}`);
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

/**
 * Vite env: build-time.
 * - Dev:   VITE_API_BASE_URL=http://192.168.x.x:8001   (or http://localhost:8001)
 * - Prod:  VITE_API_BASE_URL=/api
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

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

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(opts.headers || {});

  // Only set Content-Type for requests that actually send a body.
  // This avoids oddities with DELETE/GET and makes 204 handling cleaner.
  if (opts.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const url = joinUrl(API_BASE, path);
  const res = await fetch(url, { ...opts, headers });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, res.statusText, text);
  }

  // Handle 204 No Content (e.g., DELETE)
  if (res.status === 204) return undefined as T;

  // Some endpoints might return empty body with 200 (rare), handle safely:
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
