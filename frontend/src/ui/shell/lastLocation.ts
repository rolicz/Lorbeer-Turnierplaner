import { activeDest, type NavDest } from "./navConfig";

const KEY = "lk:dest-last";
// Same idea as useLocationRestore: don't resume into a stale, long-abandoned session.
const TTL_MS = 12 * 60 * 60 * 1000;

/** Deep-link params that fire exactly once; never replay them from memory. */
const ONE_SHOT_PARAMS = ["unread", "comment", "entry", "cup", "idea", "record"] as const;

type Entry = { path: string; ts: number };
type Store = Record<string, Entry>;

/**
 * URLs that turned out to be dead (deleted tournament, missing player, 404) while
 * this tab lived. Page-level effects run *before* the shell's remember effect, so
 * forgetting alone would be undone by the very navigation that revealed the miss.
 */
const forgotten = new Set<string>();

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Store = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as { path?: unknown; ts?: unknown } | null;
      if (!entry || typeof entry.path !== "string" || typeof entry.ts !== "number") continue;
      out[key] = { path: entry.path, ts: entry.ts };
    }
    return out;
  } catch {
    // malformed or unavailable storage (private mode / quota) → no memory
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

/** `pathname + search` without the one-shot params (and without a bare "?"). */
export function normalizePath(pathname: string, search = ""): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return pathname;
  }
  for (const p of ONE_SHOT_PARAMS) params.delete(p);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

function splitPath(path: string): [string, string] {
  const i = path.indexOf("?");
  return i < 0 ? [path, ""] : [path.slice(0, i), path.slice(i)];
}

function usablePath(path: string, destKey: string): boolean {
  // A remembered path must still be a normal in-app URL owned by this destination.
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  return activeDest(splitPath(path)[0])?.key === destKey;
}

/**
 * Store the current location as the last page of its destination, so tapping that
 * destination later returns here instead of its root. Locations outside the nav
 * (login, settings, 404) are ignored.
 */
export function rememberLocation(pathname: string, search = ""): void {
  const dest = activeDest(pathname);
  if (!dest) return;
  const path = normalizePath(pathname, search);
  if (forgotten.has(path)) return;
  const store = readStore();
  store[dest.key] = { path, ts: Date.now() };
  writeStore(store);
}

/**
 * Where a destination's nav item should point:
 * the destination you are already in → its root (second tap = root),
 * else the remembered page, else `fallback` (e.g. the live-tournament shortcut),
 * else the destination's root.
 */
export function resolveDestination(dest: NavDest, currentPathname: string, fallback?: string | null): string {
  if (activeDest(currentPathname)?.key === dest.key) return dest.to;
  const entry = readStore()[dest.key];
  if (entry && entry.ts > 0 && Date.now() - entry.ts <= TTL_MS && usablePath(entry.path, dest.key)) {
    return entry.path;
  }
  return fallback ?? dest.to;
}

/** Drop a destination's memory (next tap goes to its root). */
export function forgetDestination(destKey: string): void {
  const store = readStore();
  if (!(destKey in store)) return;
  delete store[destKey];
  writeStore(store);
}

/**
 * Drop the memory pointing at this exact URL and never remember it again in this
 * session — a deleted tournament or a missing player must not trap its tab.
 */
export function forgetLocation(path: string): void {
  const [pathname, search] = splitPath(path);
  const target = normalizePath(pathname, search);
  forgotten.add(target);
  const dest = activeDest(pathname);
  if (!dest) return;
  const store = readStore();
  if (store[dest.key]?.path !== target) return;
  delete store[dest.key];
  writeStore(store);
}

/** Test seam: forget the in-memory dead-URL blocklist. */
export function resetForgottenPaths(): void {
  forgotten.clear();
}
