import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const KEY = "lk:last-location";
const TTL_MS = 12 * 60 * 60 * 1000; // don't resume into a stale, long-abandoned session

// Captured once at module load — the true cold-launch URL, before any in-app redirect.
const ENTRY_PATH = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
const IS_STANDALONE =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

let didRestore = false;

/**
 * Standalone-PWA resume: when the OS evicts the backgrounded app and it cold-launches
 * at the manifest start_url ("/"), jump back to the route the user last had open.
 *
 * - Persists the current route on every navigation (skips "/" and "/login").
 * - Restores once per launch, and only when the cold-launch URL was exactly "/", so
 *   deep links / shared URLs / push-notification opens are never overridden.
 * - Browser (non-installed) sessions are left alone — "/" keeps going to the dashboard.
 */
export function useLocationRestore() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/" || location.pathname === "/login") return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ path: location.pathname + location.search, ts: Date.now() }));
    } catch {
      // ignore storage failures (private mode / quota)
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (didRestore) return;
    didRestore = true;
    if (!IS_STANDALONE || ENTRY_PATH !== "/") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { path?: string; ts?: number };
      if (!saved?.path || saved.path === "/" || saved.path === "/login") return;
      if (!saved.ts || Date.now() - saved.ts > TTL_MS) return;
      navigate(saved.path, { replace: true });
    } catch {
      // ignore malformed storage
    }
  }, [navigate]);
}
