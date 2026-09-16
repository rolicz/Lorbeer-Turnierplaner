import { useCallback, useEffect } from "react";
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
 * A value this hook did **not** honour is rewritten out of the URL (A9). It used
 * to be left standing, so the address bar named a tab the page was not showing
 * and `lastLocation` remembered that URL and replayed it on every return — a
 * reader who once followed an editor's `?tab=new` link kept landing on it.
 * `allowed` is how a page narrows the list further for *this* caller (an
 * admin-only tab), so the same rewrite covers a forbidden value; pass it only
 * when the answer is settled at render time, never while it is still loading.
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
  opts?: { allowed?: readonly K[] },
): [K, (k: K) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const { swap } = useReturnScroll();

  const allowed = opts?.allowed ?? keys;
  const raw = searchParams.get(param);
  const honoured = (allowed as readonly string[]).includes(raw ?? "");
  const active: K = honoured ? (raw as K) : fallback;

  // Say what we are showing. `raw != null && !honoured` is the whole condition:
  // an absent param is already the canonical spelling of the fallback.
  useEffect(() => {
    if (raw == null || honoured) return;
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
  }, [honoured, param, raw, searchParams, setSearchParams]);

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
