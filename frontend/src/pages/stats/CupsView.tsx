/** Cups sub-view — one `CupDetail` (holder, records, timeline, reigns, per player) per cup. */
import { useEffect, useMemo, useRef } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { getCup, listCupDefs, orderCups } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import { scrollToSectionById } from "../../ui/scrollToSection";
import { CUP_PARAM, cupSectionId } from "./statsNav";
import CupDetail from "./CupDetail";

export default function CupsView() {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => orderCups(defsQ.data?.cups), [defsQ.data]);
  const [searchParams, setSearchParams] = useSearchParams();

  // The same queries the sections run (same keys → the cache answers, no second
  // request): a deep link may only jump once every section above the target has
  // its final height, or the jump lands next to a still-loading cup.
  const cupQs = useQueries({
    queries: cups.map((c) => ({ queryKey: qk.cup(c.key), queryFn: () => getCup(c.key) })),
  });
  const ready = cups.length > 0 && cupQs.every((q) => q.data || q.isError);

  // `?cup=<key>` (the dashboard preview): scroll that cup into view, then drop
  // the param with a `replace` so it fires exactly once — Back returns to a
  // clean URL and N2's scroll restoration owns the offset from then on.
  const target = searchParams.get(CUP_PARAM);
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!target) {
      jumpedRef.current = null;
      return;
    }
    if (!ready || jumpedRef.current === target) return;
    jumpedRef.current = target;
    const next = new URLSearchParams(searchParams);
    next.delete(CUP_PARAM);
    setSearchParams(next, { replace: true });
    if (!cups.some((c) => c.key === target)) return; // unknown cup: just clean the URL
    scrollToSectionById(cupSectionId(target), 40, 0, "auto");
  }, [cups, ready, searchParams, setSearchParams, target]);

  if (defsQ.isLoading && !defsQ.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-6">
      {cups.map((c) => (
        <div key={c.key} id={cupSectionId(c.key)}>
          <CupDetail cupKey={c.key} cupName={c.name} />
        </div>
      ))}
    </div>
  );
}
