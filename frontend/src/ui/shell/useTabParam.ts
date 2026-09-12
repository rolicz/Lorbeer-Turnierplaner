import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Persist a page's tab selection in the URL (`?tab=…` by default) so deep links,
 * reloads and "back" from a detail page return to the tab the user was on.
 *
 * Unknown or missing values fall back to `fallback`; selecting the fallback tab
 * drops the param again so the canonical URL stays clean. Param changes replace
 * the history entry — a tab switch is not a navigation step.
 */
export function useTabParam<K extends string>(
  keys: readonly K[],
  fallback: K,
  param = "tab",
): [K, (k: K) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(param);
  const active: K = (keys as readonly string[]).includes(raw ?? "") ? (raw as K) : fallback;

  const setActive = useCallback(
    (k: K) => {
      const next = new URLSearchParams(searchParams);
      if (k === fallback) next.delete(param);
      else next.set(param, k);
      setSearchParams(next, { replace: true });
    },
    [fallback, param, searchParams, setSearchParams],
  );

  return [active, setActive];
}
