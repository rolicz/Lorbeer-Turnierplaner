import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { TrendingUp, Swords, Flame, BarChart3 } from "lucide-react";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsRatings, getStatsPlayers } from "../../api/stats.api";
import type { StatsScope } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";

import PlayerMatchesCard from "./PlayerMatchesCard";
import HeadToHeadCard from "./HeadToHeadCard";
import StreaksCard from "./StreaksCard";
import StarsPerformanceCard from "./StarsPerformanceCard";
import TrendsCard from "./TrendsCard";

type SortKey = "pts" | "rating" | "form";

/** Tiny inline sparkline (values 0..3 from lastN points). */
function Sparkline({ values }: { values: number[] }) {
  const w = 64;
  const h = 22;
  if (!values.length) return <div style={{ width: w, height: h }} />;
  const max = 3;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = h - 2 - (Math.max(0, Math.min(max, v)) / max) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1] ?? 0;
  const tone = last >= 2 ? "rgb(34 197 94)" : last >= 1 ? "rgb(234 179 8)" : "rgb(239 68 68)";
  const lastY = h - 2 - (Math.max(0, Math.min(max, last)) / max) * (h - 4);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(values.length - 1) * step} cy={lastY} r="2.5" fill={tone} />
    </svg>
  );
}

type Row = {
  id: number;
  name: string;
  rank: number;
  pts: number;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  gd: number;
  form: number[];
  formAvg: number;
};

function useStandings(mode: StatsMode, scope: StatsScope) {
  const ratingsQ = useQuery({
    queryKey: ["stats", "ratings", mode, scope],
    queryFn: () => getStatsRatings({ mode, scope }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const playersQ = useQuery({
    queryKey: ["stats", "players", mode, 10],
    queryFn: () => getStatsPlayers({ mode, lastN: 10 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const formById = useMemo(() => {
    const m = new Map<number, { pts: number[]; avg: number }>();
    for (const p of playersQ.data?.players ?? []) {
      m.set(Number(p.player_id), { pts: (p.lastN_pts ?? []).map(Number), avg: Number(p.lastN_avg_pts ?? 0) });
    }
    return m;
  }, [playersQ.data]);

  const rows = useMemo<Row[]>(() => {
    const rrows = ratingsQ.data?.rows ?? [];
    return rrows.map((r, i) => {
      const f = formById.get(Number(r.player.id));
      return {
        id: Number(r.player.id),
        name: r.player.display_name,
        rank: i + 1,
        pts: Number(r.pts),
        rating: Number(r.rating),
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        gd: r.gd,
        form: f?.pts ?? [],
        formAvg: f?.avg ?? 0,
      };
    });
  }, [ratingsQ.data, formById]);

  return { rows, loading: ratingsQ.isLoading && !ratingsQ.data };
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <CollapsibleCard
      title={<span className="inline-flex items-center gap-2 text-sm font-semibold">{icon}{title}</span>}
      defaultOpen={defaultOpen}
      variant="outer"
      bodyVariant="none"
      scrollOnOpen
    >
      <div className="card-inner">{children}</div>
    </CollapsibleCard>
  );
}

/** Mobile-first combined standings: rank, player, points, rating, record, form. */
function CombinedStandings({
  mode,
  scope,
  onSelect,
}: {
  mode: StatsMode;
  scope: StatsScope;
  onSelect: (id: number) => void;
}) {
  const { rows, loading } = useStandings(mode, scope);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const [sort, setSort] = useState<SortKey>("pts");

  const sorted = useMemo(() => {
    const r = rows.slice();
    if (sort === "rating") r.sort((a, b) => b.rating - a.rating);
    else if (sort === "form") r.sort((a, b) => b.formAvg - a.formAvg);
    else r.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    return r.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [rows, sort]);

  return (
    <div className="card-outer">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-normal">Standings</h2>
        <div className="inline-flex rounded-full bg-bg-card-chip/50 p-0.5 text-xs">
          {(["pts", "rating", "form"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={
                "rounded-full px-2.5 py-1 transition " +
                (sort === k ? "bg-bg-card-inner text-text-normal font-medium" : "text-text-muted")
              }
            >
              {k === "pts" ? "Points" : k === "rating" ? "Rating" : "Form"}
            </button>
          ))}
        </div>
      </div>

      {loading ? <InlineLoading label="Loading…" /> : null}

      <div className="space-y-1.5">
        {sorted.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            className="surface flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-hover-default/30"
          >
            <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-text-muted">{r.rank}</span>
            <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-normal">{r.name}</div>
              <div className="text-[11px] text-text-muted">
                <span className="text-status-text-green">{r.wins}</span>-
                <span className="text-amber-300">{r.draws}</span>-
                <span className="text-[color:rgb(var(--delta-down)/1)]">{r.losses}</span>
                <span> · GD {r.gd >= 0 ? `+${r.gd}` : r.gd} · {Math.round(r.rating)}★</span>
              </div>
            </div>
            <Sparkline values={r.form} />
            <span className="w-9 shrink-0 text-right text-lg font-bold tabular-nums text-text-normal">{r.pts}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerHeader({ mode, scope, playerId }: { mode: StatsMode; scope: StatsScope; playerId: number }) {
  const { rows } = useStandings(mode, scope);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  // Rank by points (matches the default standings order).
  const byPts = useMemo(() => rows.slice().sort((a, b) => b.pts - a.pts || b.gd - a.gd), [rows]);
  const idx = byPts.findIndex((x) => x.id === playerId);
  const r = idx >= 0 ? byPts[idx] : null;
  if (!r) return null;
  return (
    <div className="card-outer flex items-center gap-3">
      <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-bold text-text-normal">{r.name}</div>
        <div className="text-xs text-text-muted">
          Rank #{idx + 1} · {Math.round(r.rating)}★ ·{" "}
          <span className="text-status-text-green">{r.wins}</span>-
          <span className="text-amber-300">{r.draws}</span>-
          <span className="text-[color:rgb(var(--delta-down)/1)]">{r.losses}</span> · {r.pts} pts
        </div>
      </div>
      <Sparkline values={r.form} />
    </div>
  );
}

export default function StatsInsights({
  mode,
  scope,
  playerId,
  onSelectPlayer,
}: {
  mode: StatsMode;
  scope: StatsScope;
  playerId: number | "";
  onSelectPlayer: (id: number) => void;
}) {
  // Player profile view
  if (playerId !== "") {
    return (
      <div className="space-y-4">
        <PlayerHeader mode={mode} scope={scope} playerId={playerId} />
        <PlayerMatchesCard embedded mode={mode} scope={scope} playerId={playerId} />
        <CollapsibleSection title="Rivalries" icon={<Swords size={14} />}>
          <HeadToHeadCard embedded mode={mode} scope={scope} playerId={playerId} />
        </CollapsibleSection>
        <CollapsibleSection title="Club performance" icon={<BarChart3 size={14} />}>
          <StarsPerformanceCard embedded mode={mode} scope={scope} playerId={playerId} />
        </CollapsibleSection>
      </div>
    );
  }

  // League view
  return (
    <div className="space-y-4">
      <CombinedStandings mode={mode} scope={scope} onSelect={onSelectPlayer} />
      <CollapsibleSection title="Records & streaks" icon={<Flame size={14} />} defaultOpen>
        <StreaksCard embedded mode={mode} scope={scope} />
      </CollapsibleSection>
      <CollapsibleSection title="Trends" icon={<TrendingUp size={14} />}>
        <TrendsCard embedded mode={mode} />
      </CollapsibleSection>
      <CollapsibleSection title="Rivalries" icon={<Swords size={14} />}>
        <HeadToHeadCard embedded mode={mode} scope={scope} playerId="" />
      </CollapsibleSection>
    </div>
  );
}
