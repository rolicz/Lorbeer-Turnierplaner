/** Cups sub-view — one `CupDetail` (holder, records, timeline, reigns, per player) per cup. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { listCupDefs } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import CupDetail from "./CupDetail";

export default function CupsView() {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => {
    const raw = defsQ.data?.cups?.length ? defsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    return raw.filter((c) => c.key !== "default").concat(raw.filter((c) => c.key === "default"));
  }, [defsQ.data]);

  if (defsQ.isLoading && !defsQ.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-6">
      {cups.map((c) => (
        <CupDetail key={c.key} cupKey={c.key} cupName={c.name} />
      ))}
    </div>
  );
}
