import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";
import { getStatsPlayerMatches } from "../../api/stats.api";
import type { Match, StatsScope } from "../../api/types";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import {
  StatsAvatarSelector,
  StatsControlLabel,
  StatsFilterDataControls,
  StatsSegmentedSwitch,
  type StatsMode,
} from "./StatsControls";
import { MatchHistoryList } from "./MatchHistoryList";

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

type Outcome = "W" | "D" | "L";

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = m.sides.find((s) => s.side === "A");
  const b = m.sides.find((s) => s.side === "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

function outcomeForPlayer(m: Match, playerId: number): { outcome: Outcome; points: number } | null {
  if (m.state !== "finished") return null;
  const a = m.sides.find((s) => s.side === "A");
  const b = m.sides.find((s) => s.side === "B");
  const aHas = (a?.players ?? []).some((p) => p.id === playerId);
  const bHas = (b?.players ?? []).some((p) => p.id === playerId);
  const focusSide: "A" | "B" | null = aHas && !bHas ? "A" : bHas && !aHas ? "B" : null;
  if (!focusSide) return null;

  const w = winnerSide(m);
  if (!w) return { outcome: "D", points: 1 };
  if (w === focusSide) return { outcome: "W", points: 3 };
  return { outcome: "L", points: 0 };
}

function rollingAvg(series: number[], window: number) {
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    // Fixed denominator (pad missing history with 0) to avoid inflating early values.
    const avg = slice.reduce((a, b) => a + b, 0) / Math.max(1, window);
    out.push(avg);
  }
  return out;
}

function Sparkline({
  series,
  outcomes,
  xMinLabel,
  xMaxLabel,
}: {
  series: number[]; // points per match: 0/1/3
  outcomes: Outcome[];
  xMinLabel?: string;
  xMaxLabel?: string;
}) {
  const n = Math.min(series.length, outcomes.length);
  const w = 320;
  const h = 80;
  const padX = 8;
  const padY = 10;
  if (n <= 1) return null;

  const avg = rollingAvg(series.slice(0, n), 5);
  const xAt = (i: number) => padX + (i * (w - padX * 2)) / Math.max(1, n - 1);
  const yAt = (v: number) => {
    const vv = Math.max(0, Math.min(3, v));
    const innerH = h - padY * 2;
    return padY + (1 - vv / 3) * innerH;
  };

  const pts = avg.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(" ");
  const area = `${padX},${h - padY} ${pts} ${w - padX},${h - padY}`;

  const dotFill = (o: Outcome) =>
    o === "W" ? "rgb(var(--color-status-text-green))" : o === "D" ? "rgb(251 191 36)" : "rgb(248 113 113)";

  return (
    <div className="panel-subtle rounded-2xl p-3">
      <div className="text-[11px] font-medium text-text-muted">Form (last {n})</div>
      <svg
        className="mt-2 h-[80px] w-full"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-label="Form sparkline"
      >
        <defs>
          <linearGradient id="formFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
          </linearGradient>
          <filter id="formGlow" x="-20%" y="-50%" width="140%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.4" floodColor="rgb(var(--color-accent))" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* y grid */}
        {[0, 1, 2, 3].map((v) => (
          <line
            key={v}
            x1={padX}
            x2={w - padX}
            y1={yAt(v)}
            y2={yAt(v)}
            stroke="rgb(var(--color-border-card-inner))"
            strokeOpacity={v === 0 ? 0.55 : 0.28}
            strokeWidth={v === 0 ? 1 : 1}
          />
        ))}

        {/* y labels */}
        <text x={padX} y={yAt(3) + 4} fontSize="10" fill="rgb(var(--color-text-muted))">
          3
        </text>
        <text x={padX} y={yAt(0) - 2} fontSize="10" fill="rgb(var(--color-text-muted))">
          0
        </text>

        {/* baseline (explicit for crispness) */}
        <line
          x1={padX}
          x2={w - padX}
          y1={h - padY}
          y2={h - padY}
          stroke="rgb(var(--color-border-card-inner))"
          strokeOpacity="0.55"
          strokeWidth="1"
        />

        {/* area */}
        <polygon points={area} fill="url(#formFill)" />

        {/* line */}
        <polyline
          points={pts}
          fill="none"
          stroke="rgb(var(--color-accent))"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#formGlow)"
        />

        {/* outcome dots */}
        {outcomes.slice(0, n).map((o, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(avg[i])} r={2.3} fill={dotFill(o)} opacity="0.95" />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-text-muted">
          Rolling avg <span className="text-text-normal">5</span> (0..3)
          {xMinLabel || xMaxLabel ? (
            <span className="text-text-muted">
              {" "}
              · {xMinLabel || "—"} <span className="opacity-70">to</span> {xMaxLabel || "—"}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {outcomes.slice(-n).map((o, i) => (
            <span
              key={i}
              className={
                "h-2.5 w-2.5 rounded-sm " +
                (o === "W"
                  ? "bg-status-bg-green/45"
                  : o === "D"
                    ? "bg-amber-500/35"
                    : "bg-red-500/30")
              }
              title={o}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PlayerMatchesCard() {
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const clubs = clubsQ.data ?? [];

  const [playerId, setPlayerId] = useState<number | "">("");
  const [mode, setMode] = useState<StatsMode>("overall");
  const [scope, setScope] = useState<StatsScope>("tournaments");
  const [showMeta, setShowMeta] = useState(false);
  // Intentionally no auto-scroll on avatar selection; it feels jumpy on mobile and is easy to trigger accidentally.

  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", playerId || "none", scope],
    queryFn: () => getStatsPlayerMatches({ playerId: Number(playerId), scope }),
    enabled: playerId !== "",
    placeholderData: keepPreviousData,
    staleTime: 0,
    // Avoid surprise reflows while the user is interacting (mobile scroll anchoring can look like "jumps").
    // WS invalidation still refreshes stats when tournaments change.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const selected = useMemo(() => {
    if (playerId === "") return null;
    return players.find((p) => p.id === playerId) ?? null;
  }, [players, playerId]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [players]);

  const tournaments = useMemo(() => {
    const rows = matchesQ.data?.tournaments ?? [];
    if (mode === "overall") return rows;
    return rows.filter((t) => t.mode === mode);
  }, [matchesQ.data?.tournaments, mode]);
  const form = useMemo(() => {
    if (!selected) return null;
    const flat = tournaments.flatMap((t) =>
      t.matches
        .filter((m) => m.state === "finished")
        .map((m) => ({
          t_date: new Date(t.date ?? 0).getTime(),
          t_label: fmtDate(t.date),
          order: m.order_index ?? 0,
          m,
        }))
    );
    const sorted = flat
      .slice()
      .sort((a, b) => (a.t_date !== b.t_date ? a.t_date - b.t_date : a.order - b.order))
      .slice(-25);
    const last = sorted.map((x) => x.m);
    const out: Outcome[] = [];
    const pts: number[] = [];
    for (const m of last) {
      const o = outcomeForPlayer(m, selected.id);
      if (!o) continue;
      out.push(o.outcome);
      pts.push(o.points);
    }
    if (!out.length) return null;
    return {
      pts,
      out,
      startLabel: sorted[0]?.t_label ?? "",
      endLabel: sorted[sorted.length - 1]?.t_label ?? "",
    };
  }, [selected, tournaments]);

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-list text-text-muted" aria-hidden="true" />
          Player Matches
        </span>
      }
      defaultOpen={false}
      scrollOnOpen={true}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      <ErrorToastOnError error={matchesQ.error} title="Player matches loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Club data loading failed" />
      <div className="card-inner-flat rounded-2xl space-y-2 scroll-mt-[calc(env(safe-area-inset-top,0px)+128px)] sm:scroll-mt-[calc(env(safe-area-inset-top,0px)+144px)]">
        <div className="flex flex-wrap items-start gap-2">
          <StatsFilterDataControls mode={mode} onModeChange={setMode} scope={scope} onScopeChange={setScope} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatsControlLabel icon="fa-sliders" text="View" />
            <StatsSegmentedSwitch<boolean>
              value={showMeta}
              onChange={setShowMeta}
              options={[
                { key: false, label: "Compact", icon: "fa-compress" },
                { key: true, label: "Details", icon: "fa-list" },
              ]}
              ariaLabel="Details"
              title="Toggle details (clubs / leagues / stars)"
            />
          </div>
        </div>

        <div className="h-px bg-border-card-inner/70" />

        <StatsAvatarSelector
          players={sortedPlayers}
          selectedId={playerId}
          onSelect={setPlayerId}
          avatarUpdatedAtById={avatarUpdatedAtById}
          avatarClassName="h-8 w-8"
        />
      </div>

      <div style={{ overflowAnchor: "none" }}>
        {playerId === "" ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Pick a player to see their match history.</div>
        ) : null}
        {matchesQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}

        {selected && tournaments.length ? (
          <div className="space-y-3">
            {form ? <Sparkline series={form.pts} outcomes={form.out} xMinLabel={form.startLabel} xMaxLabel={form.endLabel} /> : null}
            <MatchHistoryList tournaments={tournaments} focusId={selected.id} clubs={clubs} showMeta={showMeta} />
          </div>
        ) : null}

        {selected && !matchesQ.isLoading && !tournaments.length ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">No matches found for {selected.display_name}.</div>
        ) : null}
      </div>
    </CollapsibleCard>
  );
}
