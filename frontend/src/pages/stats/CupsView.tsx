/** Cups sub-view — one `CupDetail` (holder, records, timeline, reigns, per player) per cup. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { listCupDefs, orderCups } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import CupDetail from "./CupDetail";

export default function CupsView() {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => orderCups(defsQ.data?.cups), [defsQ.data]);

  if (defsQ.isLoading && !defsQ.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-6">
      {cups.map((c) => (
        <CupDetail key={c.key} cupKey={c.key} cupName={c.name} />
      ))}
    </div>
  );
}
