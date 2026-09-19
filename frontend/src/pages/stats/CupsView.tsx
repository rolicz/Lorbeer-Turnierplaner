/** Cups sub-view — one `CupDetail` (holder, records, timeline, reigns, per player) per cup. */
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { getCup, listCupDefs, orderCups } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import { CUP_PARAM, cupSectionId } from "./statsNav";
import { useOneShotSectionParam } from "./useOneShotSectionParam";
import CupDetail from "./CupDetail";

export default function CupsView() {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => orderCups(defsQ.data?.cups), [defsQ.data]);

  // The same queries the sections run (same keys → the cache answers, no second
  // request): a deep link may only jump once every section above the target has
  // its final height, or the jump lands next to a still-loading cup.
  const cupQs = useQueries({
    queries: cups.map((c) => ({ queryKey: qk.cup(c.key), queryFn: () => getCup(c.key) })),
  });
  const ready = cups.length > 0 && cupQs.every((q) => q.data || q.isError);

  // `?cup=<key>` (the dashboard preview): scroll that cup into view, then drop
  // the param with a `replace` so it fires exactly once — Back returns to a
  // clean URL and N2's scroll restoration owns the offset from then on. The
  // shared `?record=` mechanism (M4), so Streaks/Records do not carry a copy.
  const cupKeys = useMemo(() => cups.map((c) => c.key), [cups]);
  useOneShotSectionParam(CUP_PARAM, cupSectionId, cupKeys, ready);

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
