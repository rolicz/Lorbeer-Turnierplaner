import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const seenRouteScopes = new Set<string>();

function defaultRouteScope(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

export function useRouteEntryLoading({
  enabled = true,
  minMs = 140,
  scope,
}: {
  enabled?: boolean;
  minMs?: number;
  scope?: string;
} = {}) {
  const location = useLocation();
  const routeScope = useMemo(() => scope ?? defaultRouteScope(location.pathname), [location.pathname, scope]);
  const isSeen = enabled && seenRouteScopes.has(routeScope);
  const [entered, setEntered] = useState<boolean>(() => !enabled || isSeen);

  useEffect(() => {
    if (!enabled) return;
    if (seenRouteScopes.has(routeScope)) return;
    const t = window.setTimeout(() => setEntered(true), Math.max(0, minMs));
    const markSeen = window.setTimeout(() => {
      seenRouteScopes.add(routeScope);
    }, Math.max(0, minMs));
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(markSeen);
    };
  }, [enabled, minMs, routeScope]);

  useEffect(() => {
    if (!enabled || !entered) return;
    seenRouteScopes.add(routeScope);
  }, [enabled, entered, routeScope]);

  return !enabled || entered;
}
