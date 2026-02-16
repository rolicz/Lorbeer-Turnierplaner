import { useEffect, useState } from "react";

export function useRouteEntryLoading({
  enabled = true,
  minMs = 140,
}: {
  enabled?: boolean;
  minMs?: number;
} = {}) {
  const [entered, setEntered] = useState<boolean>(() => !enabled);

  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => setEntered(true), Math.max(0, minMs));
    return () => window.clearTimeout(t);
  }, [enabled, minMs]);

  return !enabled || entered;
}
