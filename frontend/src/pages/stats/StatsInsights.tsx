import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Swords, Flame, BarChart3, ListChecks, LineChart } from "lucide-react";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import InlineLoading from "../../ui/primitives/InlineLoading";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { getStatsRatings, getStatsPlayers, getStatsPlayerMatches } from "../../api/stats.api";
import type { StatsScope } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { colorForIdx } from "./trendsMath";
import { Sparkline, WDLDonut, StatBar, MultiLine } from "./charts";
import { MatchHistoryList } from "./MatchHistoryList";

import HeadToHeadCard from "./HeadToHeadCard";
import StreaksCard from "./StreaksCard";
import StarsPerformanceCard from "./StarsPerformanceCard";
import { listClubs } from "../../api/clubs.api";

type Density = "simple" | "detailed";
type SortKey = "pts" | "rating" | "form";

const DENSITY_KEY = "stats-density";

type Row = {
  id: number;
  name: string;
  pts: number;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
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
    queryKey: ["stats", "players", mode, 12],
    queryFn: () => getStatsPlayers({ mode, lastN: 12 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const formById = useMemo(() => {
    const m = new Map<number, { pts: number[]; avg: number }>();
    for (const p of playersQ.data?.players ?? []) m.set(Number(p.player_id), { pts: (p.lastN_pts ?? []).map(Number), avg: Number(p.lastN_avg_pts ?? 0) });
    return m;
  }, [playersQ.data]);
  const rows = useMemo<Row[]>(() => {
    return (ratingsQ.data?.rows ?? []).map((r) => {
      const f = formById.get(Number(r.player.id));
      return {
        id: Number(r.player.id),
        name: r.player.display_name,
        pts: Number(r.pts),
        rating: Number(r.rating),
        wins: r.wins, draws: r.draws, losses: r.losses,
        gf: r.gf, ga: r.ga, gd: r.gd,
        form: f?.pts ?? [], formAvg: f?.avg ?? 0,
      };
    });
  }, [ratingsQ.data, formById]);
  return { rows, loading: ratingsQ.isLoading && !ratingsQ.data };
}

function Section({ title, icon, defaultOpen = false, children }: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
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

/** Clean, sortable standings list. Tap a row to focus a player. */
function Standings({ rows, loading, onSelect }: { rows: Row[]; loading: boolean; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const [sort, setSort] = useState<SortKey>("pts");
  const sorted = useMemo(() => {
    const r = rows.slice();
    if (sort === "rating") r.sort((a, b) => b.rating - a.rating);
    else if (sort === "form") r.sort((a, b) => b.formAvg - a.formAvg);
    else r.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    return r;
  }, [rows, sort]);

  return (
    <div className="card-outer">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-normal">Standings</h2>
        <div className="inline-flex rounded-full bg-bg-card-chip/50 p-0.5 text-xs">
          {(["pts", "rating", "form"] as SortKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)}
              className={"rounded-full px-2.5 py-1 transition " + (sort === k ? "bg-bg-card-inner text-text-normal font-medium" : "text-text-muted")}>
              {k === "pts" ? "Points" : k === "rating" ? "Rating" : "Form"}
            </button>
          ))}
        </div>
      </div>
      {loading ? <InlineLoading label="Loading…" /> : null}
      <div className="space-y-1.5">
        {sorted.map((r, i) => (
          <button key={r.id} type="button" onClick={() => onSelect(r.id)}
            className="surface flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-hover-default/30">
            <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-text-muted">{i + 1}</span>
            <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-normal">{r.name}</div>
              <div className="text-[11px] text-text-muted">
                <span className="text-status-text-green">{r.wins}</span>-<span className="text-amber-300">{r.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{r.losses}</span>
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

/** Cumulative-form multi-line graph over recent matches. */
function FormTrend({ rows }: { rows: Row[] }) {
  const maxLen = Math.max(0, ...rows.map((r) => r.form.length));
  const series = rows.map((r, idx) => {
    const c = colorForIdx(idx, rows.length);
    let cum = 0;
    const points = Array.from({ length: maxLen }, (_, i) => {
      const v = r.form[i];
      if (v == null && i >= r.form.length) return null;
      cum += Number(v ?? 0);
      return cum;
    });
    return { id: r.id, name: r.name, color: c.solid, points };
  });
  const yMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p ?? 0)));
  if (!maxLen) return <div className="text-sm text-text-muted">Not enough match data yet.</div>;
  return (
    <div>
      <MultiLine series={series} xLabels={Array.from({ length: maxLen }, (_, i) => String(i))} yMax={yMax} />
      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
        {series.map((s) => (
          <div key={s.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="min-w-0 truncate">{s.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-text-muted">Cumulative points across recent matches (higher line = better recent run).</div>
    </div>
  );
}

function PlayerHeader({ row, rank }: { row: Row; rank: number }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  return (
    <div className="card-outer flex items-center gap-3">
      <AvatarCircle playerId={row.id} name={row.name} updatedAt={avatarUpdatedAtById.get(row.id) ?? null} sizeClass="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-bold text-text-normal">{row.name}</div>
        <div className="text-xs text-text-muted">
          Rank #{rank} · {Math.round(row.rating)}★ ·{" "}
          <span className="text-status-text-green">{row.wins}</span>-<span className="text-amber-300">{row.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{row.losses}</span> · {row.pts} pts
        </div>
      </div>
      <Sparkline values={row.form} />
    </div>
  );
}

/** Player snapshot: win-rate donut + goals + recent form. */
function PlayerSnapshot({ row }: { row: Row }) {
  const gMax = Math.max(1, row.gf, row.ga);
  return (
    <div className="card-outer">
      <h2 className="mb-3 text-sm font-semibold text-text-normal">Snapshot</h2>
      <div className="flex items-center gap-4">
        <WDLDonut w={row.wins} d={row.draws} l={row.losses} />
        <div className="min-w-0 flex-1 space-y-2">
          <StatBar label="Goals for" value={row.gf} max={gMax} color="rgb(34 197 94)" />
          <StatBar label="Goals against" value={row.ga} max={gMax} color="rgb(239 68 68)" />
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-text-muted">Recent form</span>
            <Sparkline values={row.form} w={96} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentMatches({ playerId, scope, limit }: { playerId: number; scope: StatsScope; limit?: number }) {
  const q = useQuery({
    queryKey: ["stats", "playerMatches", playerId, scope],
    queryFn: () => getStatsPlayerMatches({ playerId, scope }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs(), staleTime: 60_000 });
  const tournaments = useMemo(() => {
    const ts = q.data?.tournaments ?? [];
    if (!limit) return ts;
    // Keep most recent tournaments until we have ~limit matches.
    const out: typeof ts = [];
    let count = 0;
    for (const t of ts) {
      out.push(t);
      count += t.matches.length;
      if (count >= limit) break;
    }
    return out;
  }, [q.data, limit]);
  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  if (!tournaments.length) return <div className="text-sm text-text-muted">No matches yet.</div>;
  return <MatchHistoryList tournaments={tournaments} clubs={clubsQ.data ?? []} focusId={playerId} showMeta={false} nameColorByResult hideModePill />;
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
  const [density, setDensity] = useState<Density>(() => (localStorage.getItem(DENSITY_KEY) === "detailed" ? "detailed" : "simple"));
  const setDensityPersist = (d: Density) => { localStorage.setItem(DENSITY_KEY, d); setDensity(d); };
  const detailed = density === "detailed";

  const { rows, loading } = useStandings(mode, scope);

  const densityToggle = (
    <div className="mb-3 flex justify-end">
      <SegmentedSwitch<Density>
        value={density}
        onChange={setDensityPersist}
        options={[{ key: "simple", label: "Simple" }, { key: "detailed", label: "Detailed" }]}
        ariaLabel="Detail level"
      />
    </div>
  );

  // Player profile
  if (playerId !== "") {
    const byPts = rows.slice().sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    const rank = byPts.findIndex((r) => r.id === playerId) + 1;
    const row = byPts.find((r) => r.id === playerId);
    return (
      <div className="space-y-4">
        {densityToggle}
        {row ? <PlayerHeader row={row} rank={rank} /> : null}
        {row ? <PlayerSnapshot row={row} /> : null}
        <Section title="Recent matches" icon={<ListChecks size={14} />} defaultOpen>
          <RecentMatches playerId={playerId} scope={scope} limit={detailed ? undefined : 8} />
        </Section>
        {detailed ? (
          <>
            <Section title="Head-to-head" icon={<Swords size={14} />}>
              <HeadToHeadCard embedded mode={mode} scope={scope} playerId={playerId} />
            </Section>
            <Section title="Club performance" icon={<BarChart3 size={14} />}>
              <StarsPerformanceCard embedded mode={mode} scope={scope} playerId={playerId} />
            </Section>
          </>
        ) : null}
      </div>
    );
  }

  // League
  return (
    <div className="space-y-4">
      {densityToggle}
      <Standings rows={rows} loading={loading} onSelect={onSelectPlayer} />
      {detailed ? (
        <>
          <Section title="Form trend" icon={<LineChart size={14} />} defaultOpen>
            <FormTrend rows={rows} />
          </Section>
          <Section title="Records & streaks" icon={<Flame size={14} />}>
            <StreaksCard embedded mode={mode} scope={scope} />
          </Section>
          <Section title="Rivalries" icon={<Swords size={14} />}>
            <HeadToHeadCard embedded mode={mode} scope={scope} playerId="" />
          </Section>
        </>
      ) : null}
    </div>
  );
}
