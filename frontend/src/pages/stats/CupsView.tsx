/** Cups tab — reigns & title history, reusing the dashboard cup component. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { qk } from "../../api/queryKeys";
import CupCard from "../dashboard/CupCard";

export default function CupsView() {
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const cups = useMemo(() => {
    const raw = defsQ.data?.cups?.length ? defsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    return raw.filter((c) => c.key !== "default").concat(raw.filter((c) => c.key === "default"));
  }, [defsQ.data]);

  if (defsQ.isLoading && !defsQ.data) return <InlineLoading label="Loading…" />;

  // Reuse the dashboard cup component so both views stay identical.
  return (
    <div className="space-y-6">
      {cups.map((c) => (
        <section key={c.key}>
          <div className="section-head">
            <span className="section-label inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rgbFromCssVar(cupColorVarForKey(c.key)) }} aria-hidden="true" />
              {c.name}
            </span>
          </div>
          <CupCard cupKey={c.key} />
        </section>
      ))}
    </div>
  );
}
