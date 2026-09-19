/**
 * One-shot `?<param>=<key>` anchor: once the page is ready, scroll to
 * `sectionIdFor(key)` and drop the param with a `replace` so it fires exactly
 * once — Back returns to a clean URL and N2's scroll restoration owns the
 * offset from then on. An unknown key only cleans the URL.
 *
 * Generalised from `CupsView`'s `?cup=` effect (M4) so a second sub-view does
 * not carry a second copy of the same mechanism — `StreaksView`'s and
 * `RecordsView`'s `?record=` anchors, and `CupsView`'s own `?cup=`, all call
 * this and nothing else.
 */
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { scrollToSectionById } from "../../ui/scrollToSection";

export function useOneShotSectionParam(
  param: string,
  sectionIdFor: (key: string) => string,
  knownKeys: readonly string[],
  /** True once every section above the target has its final height — a jump
   *  before that lands next to still-loading content. */
  ready: boolean,
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const target = searchParams.get(param);
  const jumpedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!target) {
      jumpedRef.current = null;
      return;
    }
    if (!ready || jumpedRef.current === target) return;
    jumpedRef.current = target;
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
    if (!knownKeys.includes(target)) return; // unknown key: just clean the URL
    scrollToSectionById(sectionIdFor(target), 40, 0, "auto");
  }, [knownKeys, param, ready, searchParams, sectionIdFor, setSearchParams, target]);
}
