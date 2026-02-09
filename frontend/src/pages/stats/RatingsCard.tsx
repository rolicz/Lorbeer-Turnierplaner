import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { MetaRow } from "../../ui/primitives/Meta";
import { getStatsRatings } from "../../api/stats.api";
import type { StatsRatingsRow } from "../../api/types";

type Mode = "overall" | "1v1" | "2v2";

function fmtRating(x: number) {
  if (!Number.isFinite(x)) return "1000";
  return String(Math.round(x));
}

function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const idx = value === "overall" ? 0 : value === "1v1" ? 1 : 2;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Filter mode"
      title="Filter: Overall / 1v1 / 2v2"
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + wCls}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {(
        [
          { k: "overall" as const, label: "Overall", icon: "fa-layer-group" },
          { k: "1v1" as const, label: "1v1", icon: "fa-user" },
          { k: "2v2" as const, label: "2v2", icon: "fa-users" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
          type="button"
          onClick={() => onChange(x.k)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-xl text-[11px] transition-colors " +
            wCls +
            " " +
            (value === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.k}
        >
          <i className={"fa-solid " + x.icon + " hidden sm:inline"} aria-hidden="true" />
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
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

export default function RatingsCard() {
  const [mode, setMode] = useState<Mode>("overall");
  const qc = useQueryClient();

  // Warmup: prefetch all modes so switching doesn't cause a "blank -> filled" layout jump on cold load.
  useEffect(() => {
    const modes: Mode[] = ["overall", "1v1", "2v2"];
    for (const m of modes) {
      void qc.prefetchQuery({
        queryKey: ["stats", "ratings", m],
        queryFn: () => getStatsRatings({ mode: m }),
        staleTime: 30_000,
      });
    }
  }, [qc]);

  const q = useQuery({
    queryKey: ["stats", "ratings", mode],
    queryFn: () => getStatsRatings({ mode }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);

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
      <div className="card-inner space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MetaRow>
            <i className="fa-solid fa-filter" aria-hidden="true" />
            <span>Mode</span>
          </MetaRow>
          <ModeSwitch value={mode} onChange={setMode} />
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
    </CollapsibleCard>
  );
}
