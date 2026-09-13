import { useCallback } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { useReturnScroll } from "./useReturnScroll";

/**
 * Persist a page's tab selection in the URL (`?tab=…` by default) so deep links,
 * reloads and "back" from a detail page return to the tab the user was on.
 *
 * Unknown or missing values fall back to `fallback`; selecting the fallback tab
 * drops the param again so the canonical URL stays clean. Param changes replace
 * the history entry — a tab switch is not a navigation step.
 *
 * Each tab also keeps its own scroll offset: switching away remembers where you
 * were, coming back returns you there, and a tab you have not opened yet starts
 * at the top instead of inheriting the previous tab's offset. Tab changes made
 * by other code (deep links that force a tab and then scroll to an entry) go
 * through `setSearchParams` directly and are left alone.
 */
export function useTabParam<K extends string>(
  keys: readonly K[],
  fallback: K,
  param = "tab",
): [K, (k: K) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const { swap } = useReturnScroll();

  const raw = searchParams.get(param);
  const active: K = (keys as readonly string[]).includes(raw ?? "") ? (raw as K) : fallback;

  const setActive = useCallback(
    (k: K) => {
      if (k !== active) swap(`${pathname}?${param}=${active}`, `${pathname}?${param}=${k}`);
      const next = new URLSearchParams(searchParams);
      if (k === fallback) next.delete(param);
      else next.set(param, k);
      setSearchParams(next, { replace: true });
    },
    [active, fallback, param, pathname, searchParams, setSearchParams, swap],
  );

  return [active, setActive];
}
