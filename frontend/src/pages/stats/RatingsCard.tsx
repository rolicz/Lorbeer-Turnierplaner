import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { getStatsRatings } from "../../api/stats.api";
import type { StatsRatingsRow, StatsScope } from "../../api/types";
import { StatsFilterDataControls, type StatsMode } from "./StatsControls";

function fmtRating(x: number) {
  if (!Number.isFinite(x)) return "1000";
  return String(Math.round(x));
}

function Row({ i, r }: { i: number; r: StatsRatingsRow }) {
  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right font-mono text-[12px] tabular-nums text-text-muted">{i + 1}</span>
          <span className="truncate text-sm font-semibold text-text-normal">{r.player.display_name}</span>
        </div>
        <div className="ml-7 text-[11px] text-text-muted">
          {r.played} ·{" "}
          <span className="text-status-text-green">{r.wins}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{r.draws}</span>
          <span className="text-text-muted">-</span>
          <span className="text-[color:rgb(var(--delta-down)/1)]">{r.losses}</span>
          <span className="text-text-muted"> · </span>
          {r.gf}:{r.ga}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-mono text-lg tabular-nums text-text-normal">{fmtRating(r.rating)}</div>
        <div className="font-mono text-[11px] tabular-nums text-text-muted">{r.pts} pts</div>
      </div>
    </div>
  );
}

export default function RatingsCard({ embedded = false }: { embedded?: boolean } = {}) {
  const [mode, setMode] = useState<StatsMode>("overall");
  const [scope, setScope] = useState<StatsScope>("tournaments");

  const q = useQuery({
    queryKey: ["stats", "ratings", mode, scope],
    queryFn: () => getStatsRatings({ mode, scope }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);

  const content = (
    <div className="card-inner-flat space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatsFilterDataControls mode={mode} onModeChange={setMode} scope={scope} onScopeChange={setScope} />
      </div>
      <div className="grid gap-2" style={{ overflowAnchor: "none" }}>
        {rows.map((r, i) => (
          <Row key={r.player.id} i={i} r={r} />
        ))}
      </div>

      <div className="panel-subtle rounded-xl px-3 py-2 text-[11px] text-text-muted">
        Elo-like ladder: start <span className="font-mono text-text-normal">1000</span>, expected score uses the standard{" "}
        <span className="font-mono text-text-normal">400</span>-scale logistic curve,{" "}
        <span className="font-mono text-text-normal">K=24</span>. Goal difference boosts the update up to{" "}
        <span className="font-mono text-text-normal">3x</span> (capped). In 2v2, team rating is the average and the change is
        split across teammates.
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-ranking-star text-text-muted" aria-hidden="true" />
          Ratings
        </span>
      }
      defaultOpen={false}
      scrollOnOpen={true}
      variant="outer"
      bodyVariant="none"
    >
      {content}
    </CollapsibleCard>
  );
}
