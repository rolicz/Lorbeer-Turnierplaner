import { Link } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { MetaRow } from "../../ui/primitives/Meta";

import { listPlayers } from "../../api/players.api";
import { getStatsPlayers } from "../../api/stats.api";
import type { StatsPlayersResponse, StatsTournamentLite, StatsPlayerRow } from "../../api/types";

import { getCup, listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey } from "../../cupColors";

import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";

type SortMode = "overall" | "lastN";
type ModeFilter = "overall" | "1v1" | "2v2";

function fmtAvg(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function parseDateSafe(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function CupOwnerMark({ cupKey, cupName }: { cupKey: string; cupName: string }) {
  const varName = cupColorVarForKey(cupKey);
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-sm"
      style={{
        borderColor: `rgb(var(${varName}) / 0.55)`,
        backgroundColor: `rgb(var(${varName}) / 0.14)`,
        color: `rgb(var(${varName}))`,
      }}
      title={`${cupName} owner`}
    >
      <i className="fa-solid fa-crown text-[13px]" aria-hidden="true" />
    </span>
  );
}

function Avatar({ playerId, name, updatedAt }: { playerId: number; name: string; updatedAt: string | null }) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <span className="panel-subtle inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full shrink-0">
      {updatedAt ? (
        <img
          src={playerAvatarUrl(playerId, updatedAt)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-sm font-semibold text-text-muted">{initial}</span>
      )}
    </span>
  );
}

function StatsPill({
  icon,
  label,
  value,
  valueCls = "text-text-chip",
}: {
  icon: string;
  label: string;
  value: string;
  valueCls?: string;
}) {
  return (
    <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
      <i className={icon + " text-text-muted"} aria-hidden="true" />
      <span className="text-[11px] text-text-muted">{label}</span>
      <span className={"text-[11px] font-mono tabular-nums " + valueCls}>{value}</span>
    </span>
  );
}

function Scoreline({
  played,
  wins,
  draws,
  losses,
  gf,
  ga,
  gd,
}: {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
}) {
  const gdCls = gd > 0 ? "text-status-text-green" : gd < 0 ? "text-red-300" : "text-text-muted";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <StatsPill icon="fa-solid fa-gamepad" label="P" value={fmtInt(played)} />

      <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-text-muted">W</span>
          <span className="text-[11px] font-mono tabular-nums text-status-text-green">{fmtInt(wins)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-text-muted">D</span>
          <span className="text-[11px] font-mono tabular-nums text-amber-300">{fmtInt(draws)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-text-muted">L</span>
          <span className="text-[11px] font-mono tabular-nums text-red-300">{fmtInt(losses)}</span>
        </span>
      </span>

      <span className="card-chip inline-flex items-center gap-2 px-2 py-1">
        <i className="fa-regular fa-futbol text-text-muted" aria-hidden="true" />
        <span className="text-[11px] text-text-muted">G</span>
        <span className="text-[11px] font-mono tabular-nums text-text-chip">
          {fmtInt(gf)}:{fmtInt(ga)}
        </span>
        <span className={"text-[11px] font-mono tabular-nums " + gdCls} title="Goal difference">
          ({gd > 0 ? "+" : ""}
          {fmtInt(gd)})
        </span>
      </span>
    </div>
  );
}

function InfoLegend() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-2">
            <i className="fa-regular fa-flag text-text-muted" aria-hidden="true" />
            Tournament positions
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm border pos-best" />
            <span>best</span>
            <span className="h-2.5 w-2.5 rounded-sm border pos-mid" />
            <span className="h-2.5 w-2.5 rounded-sm border pos-bad" />
            <span className="h-2.5 w-2.5 rounded-sm border pos-worst" />
            <span>worst</span>
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="pos-none inline-flex h-6 w-7 items-center justify-center rounded-lg border text-[11px] font-mono tabular-nums">
              —
            </span>
            <span>not played</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="pos-winner inline-flex h-6 w-7 items-center justify-center rounded-lg border text-[11px] font-mono tabular-nums">
              1
            </span>
            <span>winner</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-2">
            <i className="fa-regular fa-clock" aria-hidden="true" />
            <span>Old</span>
          </span>
          <div className="h-2 w-20 rounded-full border border-border-card-inner bg-gradient-to-r from-bg-card-chip to-bg-card-inner" />
          <span className="inline-flex items-center gap-2">
            <span>New</span>
            <i className="fa-regular fa-clock text-text-normal" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

function useTournamentCols() {
  const [cols, setCols] = useState<number>(() => {
    if (typeof window === "undefined") return 12;
    const w = window.innerWidth;
    if (w >= 1024) return 12; // lg
    if (w >= 640) return 10; // sm
    return 8; // base
  });

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const next = w >= 1024 ? 12 : w >= 640 ? 10 : 8;
      setCols(next);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return cols;
}

function TournamentPositionsGrid({
  tournamentsSorted,
  recencyByTournamentId,
  positionsByTournament,
  expanded,
  cols,
}: {
  tournamentsSorted: StatsTournamentLite[];
  recencyByTournamentId: Map<number, number>; // 0..1 (old..new)
  positionsByTournament: Record<number, number | null>;
  expanded: boolean;
  cols: number;
}) {
  const total = tournamentsSorted.length;
  const rowsNeeded = total > 0 ? Math.ceil(total / cols) : 0;
  const hasOlder = rowsNeeded > 1;

  const visible = useMemo(() => {
    if (!hasOlder) return tournamentsSorted;
    if (expanded) return tournamentsSorted;
    return tournamentsSorted.slice(Math.max(0, total - cols));
  }, [tournamentsSorted, expanded, hasOlder, total, cols]);

  return (
    <div className="relative w-full">
      <div className="panel rounded-2xl p-2">
        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10 lg:grid-cols-12">
          {visible.length === 0 && (
            <div className="col-span-full panel-subtle px-3 py-2 text-xs text-text-muted">No tournaments yet.</div>
          )}

          {visible.map((t) => {
            const pos = positionsByTournament?.[t.id] ?? null;
            const title = t.date ? `${t.name} · ${t.date}` : t.name;

            const w = recencyByTournamentId.get(t.id) ?? 0.5;
            const opacity = 0.5 + 0.5 * w;

            if (pos == null) {
              return (
                <div
                  key={t.id}
                  title={title + " · did not participate"}
                  className="pos-none inline-flex h-9 items-center justify-center rounded-xl border text-[11px] font-mono tabular-nums"
                  style={{ opacity }}
                >
                  —
                </div>
              );
            }

            const totalPlayers = Number(t.players_count ?? 0) || Math.max(1, pos);
            const isWinner = pos === 1;
            const p = totalPlayers <= 1 ? 0 : clamp((pos - 1) / (totalPlayers - 1), 0, 1); // 0 best .. 1 worst

            const base =
              "inline-flex h-9 items-center justify-center rounded-xl border text-[11px] font-mono tabular-nums transition " +
              "hover:brightness-110 hover:border-accent/40";

            const cls = isWinner ? "pos-winner shadow-[0_0_0_1px_rgba(16,185,129,0.15)]" : "pos-tile";

            return (
              <Link
                key={t.id}
                to={`/live/${t.id}`}
                title={`${title} · position ${pos}/${totalPlayers}`}
                className={
                  base +
                  " " +
                  cls +
                  " w-full select-none no-underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30"
                }
                style={isWinner ? ({ opacity } as CSSProperties) : ({ opacity, ["--pos-p" as any]: p } as CSSProperties)}
                aria-label={`${title}, position ${pos} of ${totalPlayers}`}
              >
                <span>{pos}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayersViewSwitch({ value, onChange }: { value: SortMode; onChange: (v: SortMode) => void }) {
  const idx = value === "overall" ? 0 : 1;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Players view"
      title="View: Overall or form"
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
          { k: "overall" as const, label: "Overall", icon: "fa-trophy" },
          { k: "lastN" as const, label: "Form", icon: "fa-chart-line" },
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

function ModeSwitch({ value, onChange }: { value: ModeFilter; onChange: (m: ModeFilter) => void }) {
  const idx = value === "overall" ? 0 : value === "1v1" ? 1 : 2;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Mode filter"
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

function TilesScopeSwitch({
  value,
  onChange,
  title,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  title: string;
}) {
  const idx = value ? 1 : 0;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Tournament tiles scope"
      title={title}
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
          { k: false as const, label: "Recent", icon: "fa-clock" },
          { k: true as const, label: "All", icon: "fa-layer-group" },
        ] as const
      ).map((x) => (
        <button
          key={String(x.k)}
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

export default function PlayersStatsCard() {
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  const LASTN_FETCH = 25;
  const [modeFilter, setModeFilter] = useState<ModeFilter>("overall");
  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players", modeFilter, LASTN_FETCH],
    queryFn: () => getStatsPlayers({ mode: modeFilter, lastN: LASTN_FETCH }),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const avatarMetaQ = useQuery({ queryKey: ["players", "avatars"], queryFn: listPlayerAvatarMeta });
  const avatarUpdatedAtByPlayerId = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of avatarMetaQ.data ?? []) m.set(r.player_id, r.updated_at);
    return m;
  }, [avatarMetaQ.data]);

  const cupDefsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cupsRaw = cupDefsQ.data?.cups?.length ? cupDefsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
  const cups = useMemo(() => {
    const nonDefault = cupsRaw.filter((c) => c.key !== "default");
    const defaults = cupsRaw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [cupsRaw]);

  const cupsQ = useQueries({
    queries: cups.map((c) => ({
      queryKey: ["cup", c.key],
      queryFn: () => getCup(c.key),
    })),
  });

  const cupOwnerIdLegacy = statsQ.data?.cup_owner_player_id ?? null;
  const cupsOwnedByPlayerId = useMemo(() => {
    const m = new Map<number, { key: string; name: string }[]>();
    for (let i = 0; i < cups.length; i++) {
      const def = cups[i];
      const q = cupsQ[i];
      const ownerId = q?.data?.owner?.id ?? null;
      if (ownerId == null) continue;
      const arr = m.get(ownerId) ?? [];
      arr.push({ key: def.key, name: q?.data?.cup?.name ?? def.name ?? def.key });
      m.set(ownerId, arr);
    }

    if (cupOwnerIdLegacy != null) {
      const hasDefaultFromCups = Array.from(m.values()).some((arr) => arr.some((x) => x.key === "default"));
      if (!hasDefaultFromCups) {
        const arr = m.get(cupOwnerIdLegacy) ?? [];
        arr.push({ key: "default", name: "Cup" });
        m.set(cupOwnerIdLegacy, arr);
      }
    }
    return m;
  }, [cups, cupsQ, cupOwnerIdLegacy]);

  const tournaments = statsQ.data?.tournaments ?? [];
  const [lastNView, setLastNView] = useState<number>(10);

  function avgLastN(s: StatsPlayerRow) {
    const arr = (s.lastN_pts ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
    if (!arr.length) return 0;
    // Divide by the chosen N even if the player has fewer than N matches.
    // This avoids inflating small-sample "form" (e.g. 1 match + 1 win = 3.00 ppm).
    const n = clamp(Math.trunc(lastNView) || 1, 1, LASTN_FETCH);
    const slice = arr.slice(-n);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / n;
  }

  const tournamentsSorted = useMemo(() => {
    const ts = tournaments.slice();
    ts.sort((a, b) => {
      const da = parseDateSafe(a.date);
      const db = parseDateSafe(b.date);
      if (da != null && db != null && da !== db) return da - db;
      return a.id - b.id;
    });
    return ts;
  }, [tournaments]);

  const recencyByTournamentId = useMemo(() => {
    const m = new Map<number, number>();
    const ts = tournamentsSorted;
    const dates = ts.map((t) => parseDateSafe(t.date) ?? 0);
    const min = dates.length ? Math.min(...dates) : 0;
    const max = dates.length ? Math.max(...dates) : 1;
    const span = Math.max(1, max - min);
    ts.forEach((t) => {
      const d = parseDateSafe(t.date) ?? min;
      m.set(t.id, (d - min) / span);
    });
    return m;
  }, [tournamentsSorted]);

  const statsByPlayerId = useMemo(() => {
    const m = new Map<number, StatsPlayerRow>();
    for (const r of statsQ.data?.players ?? []) m.set(r.player_id, r);
    return m;
  }, [statsQ.data]);

  const [sortMode, setSortMode] = useState<SortMode>("overall");
  const [openByPlayerId, setOpenByPlayerId] = useState<Record<number, boolean>>({});
  const [showAllTournamentTiles, setShowAllTournamentTiles] = useState(false);
  const tileCols = useTournamentCols();

  const players = playersQ.data ?? [];
  const rows = useMemo(() => {
    const out: { p: { id: number; display_name: string }; s: StatsPlayerRow; rank: number }[] = [];
    for (const p of players) {
      const s = statsByPlayerId.get(p.id);
      if (!s) continue;
      out.push({ p: { id: p.id, display_name: p.display_name }, s, rank: 0 });
    }

    out.sort((a, b) => {
      if (sortMode === "overall") return b.s.pts - a.s.pts || a.p.display_name.localeCompare(b.p.display_name);
      const av = avgLastN(a.s);
      const bv = avgLastN(b.s);
      if (bv !== av) return bv - av;
      return b.s.pts - a.s.pts || a.p.display_name.localeCompare(b.p.display_name);
    });

    out.forEach((x, i) => (x.rank = i + 1));
    return out;
  }, [players, statsByPlayerId, sortMode, lastNView]);

  const setAllOpen = (open: boolean) => {
    setOpenByPlayerId((prev) => {
      const next: Record<number, boolean> = { ...prev };
      for (const r of rows) next[r.p.id] = open;
      return next;
    });
  };

  const allExpanded = rows.length > 0 && rows.every((r) => !!openByPlayerId[r.p.id]);

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-regular fa-user text-text-muted" aria-hidden="true" />
          Players
        </span>
      }
      bodyClassName="space-y-3"
      defaultOpen={true}
      scrollOnOpen={true}
      variant="outer"
      bodyVariant="none"
    >
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-9 w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
              <span>Filter</span>
            </span>
            <ModeSwitch value={modeFilter} onChange={setModeFilter} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-9 w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-eye text-[11px]" aria-hidden="true" />
              <span>View</span>
            </span>
            <PlayersViewSwitch value={sortMode} onChange={setSortMode} />
          </div>

          {(() => {
            const canToggleTiles = tournamentsSorted.length > tileCols;
            const title = canToggleTiles
              ? showAllTournamentTiles
                ? "Show only the most recent row of tournaments for each player"
                : "Show all tournament tiles for each player"
              : "Only one row of tournaments (toggle still changes state, but the grid won't look different yet)";

            return (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex h-9 w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
                  <i className="fa-solid fa-layer-group text-[11px]" aria-hidden="true" />
                  <span>Tiles</span>
                </span>
                <TilesScopeSwitch value={showAllTournamentTiles} onChange={setShowAllTournamentTiles} title={title} />
              </div>
            );
          })()}

          <button
            type="button"
            className="btn-base btn-ghost inline-flex h-9 items-center gap-2 rounded-xl px-3 py-2 text-[11px]"
            onClick={() => setAllOpen(allExpanded ? false : true)}
            disabled={rows.length === 0}
            title={rows.length ? (allExpanded ? "Collapse all players" : "Expand all players") : "Loading players…"}
            aria-pressed={allExpanded}
          >
            <i className={"fa-solid " + (allExpanded ? "fa-angles-up" : "fa-angles-down")} aria-hidden="true" />
            <span className="whitespace-nowrap">{allExpanded ? "Collapse" : "Expand"}</span>
          </button>
        </div>
      </div>

      {sortMode === "lastN" ? (
        <div className="panel-subtle p-3 space-y-2">
          <MetaRow>
            <span>Last N</span>
            <span className="text-text-normal">N = {lastNView}</span>
          </MetaRow>
          <input
            type="range"
            min={1}
            max={LASTN_FETCH}
            value={lastNView}
            onChange={(e) => setLastNView(clamp(Number(e.target.value), 1, LASTN_FETCH))}
            className="w-full"
          />
        </div>
      ) : null}

      <CollapsibleCard
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-regular fa-circle-question text-text-muted" aria-hidden="true" />
            Legend
          </span>
        }
        defaultOpen={false}
        className="panel-subtle"
      >
        <InfoLegend />
      </CollapsibleCard>

      <div className="panel-subtle rounded-2xl overflow-hidden">
        <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
        <ErrorToastOnError error={statsQ.error} title="Stats loading failed" />
        <div className="grid grid-cols-12 items-center gap-2 border-b border-border-card-inner bg-bg-card-chip/20 px-3 py-2 text-[11px] text-text-muted">
          <div className="col-span-7 inline-flex items-center gap-2">Player</div>
          <div className="col-span-5 text-right inline-flex items-center justify-end gap-2">
            {sortMode === "overall" ? "Overall points" : `Last ${lastNView} avg`}
          </div>
        </div>

        {playersQ.isLoading && <div className="px-3 py-3 text-text-muted">Loading players…</div>}
        {statsQ.isLoading && <div className="px-3 py-3 text-text-muted">Loading stats…</div>}

        {rows.map(({ p, s, rank }, idx) => {
	          const metric =
	            sortMode === "overall"
	              ? { icon: "fa-solid fa-trophy", label: "P", value: String(s.pts) }
	              : { icon: "fa-solid fa-chart-line", label: "P", value: fmtAvg(avgLastN(s)) };

	          const rowOpen = !!openByPlayerId[p.id];
	          const toggleRow = () =>
	            setOpenByPlayerId((prev) => ({
	              ...prev,
	              [p.id]: !prev[p.id],
	            }));

          const ownedCups = cupsOwnedByPlayerId.get(p.id) ?? [];
          const avatarUpdatedAt = avatarUpdatedAtByPlayerId.get(p.id) ?? null;
          const zebra = idx % 2 === 0 ? "bg-table-row-a" : "bg-table-row-b";

          return (
            <div key={p.id} className={"border-b border-border-card-inner last:border-b-0 " + zebra}>
              <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
                <div className="col-span-2">
                  <span className="panel inline-flex h-9 w-full items-center justify-center px-2 text-medium font-bold tabular-nums text-text-normal">
                    #{rank}
                  </span>
                </div>

                <button type="button" onClick={toggleRow} className="col-span-6 min-w-0 text-left" title={rowOpen ? "Collapse player" : "Expand player"}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar playerId={p.id} name={p.display_name} updatedAt={avatarUpdatedAt} />
                    <span className="truncate text-xl font-semibold text-text-normal">{p.display_name}</span>
                    {ownedCups.length ? (
                      <span className="inline-flex items-center gap-1.5">
                        {ownedCups.map((c) => (
                          <CupOwnerMark key={c.key} cupKey={c.key} cupName={c.name} />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </button>

                <div className="col-span-3 flex items-center justify-end gap-2">
                  <div className="panel inline-flex h-9 items-center gap-2 px-3">
                    <i className={metric.icon + " text-text-muted text-xs"} aria-hidden="true" />
                    <span className="font-medium font-mono leading-none text-text-normal">{metric.value}</span>
                    <span className="text-xs font-medium text-text-muted">{metric.label}</span>
                  </div>
                </div>

                <button type="button" onClick={toggleRow} className="col-span-1 btn-base btn-ghost inline-flex h-9 w-full items-center justify-center px-0" title={rowOpen ? "Collapse" : "Expand"}>
                  <i className={"fa-solid " + (rowOpen ? "fa-chevron-up" : "fa-chevron-down")} aria-hidden="true" />
                </button>
              </div>

              {rowOpen && (
                <div className="px-3 pb-3">
                  <TournamentPositionsGrid
                    tournamentsSorted={tournamentsSorted}
                    recencyByTournamentId={recencyByTournamentId}
                    positionsByTournament={s.positions_by_tournament ?? {}}
                    expanded={showAllTournamentTiles}
                    cols={tileCols}
                  />

                  <Scoreline played={s.played} wins={s.wins} draws={s.draws} losses={s.losses} gf={s.gf} ga={s.ga} gd={s.gd} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleCard>
  );
}
