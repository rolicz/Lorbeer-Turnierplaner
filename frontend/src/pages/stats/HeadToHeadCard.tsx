import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

import { listPlayers } from "../../api/players.api";
import { getStatsH2H } from "../../api/stats.api";
import type { StatsH2HDuo, StatsH2HOpponentRow, StatsH2HPair, StatsH2HTeamRivalry } from "../../api/types";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import {
  StatsAvatarSelector,
  StatsControlLabel,
  StatsModeSwitch,
  StatsSegmentedSwitch,
  type StatsMode,
} from "./StatsControls";

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function PairRow({ r }: { r: StatsH2HPair }) {
  const closePct = pct(r.rivalry_score / Math.max(1, r.played));
  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-normal">
          {r.a.display_name} <span className="text-text-muted">vs</span> {r.b.display_name}
        </div>
        <div className="text-[11px] text-text-muted">
          {fmtInt(r.played)} games · {closePct} close
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-sm text-text-normal">
          <span className="text-status-text-green">{fmtInt(r.a_wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{fmtInt(r.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-red-300">{fmtInt(r.b_wins)}</span>
        </div>
        <div className="font-mono tabular-nums text-[11px] text-text-muted">
          {fmtInt(r.a_gf)}:{fmtInt(r.a_ga)}
        </div>
      </div>
    </div>
  );
}

function OpponentRow({
  r,
  tone,
}: {
  r: StatsH2HOpponentRow;
  tone?: "favorite" | "nemesis" | null;
}) {
  const isFav = tone === "favorite";
  const isNem = tone === "nemesis";
  return (
    <div
      className={
        "panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2 " +
        (isFav ? "ring-1 ring-[color:rgb(var(--color-status-border-green)/0.6)]" : "") +
        (isNem ? "ring-1 ring-[color:rgb(var(--delta-down)/0.45)]" : "")
      }
      style={{
        backgroundImage: isFav
          ? "linear-gradient(0deg, rgb(var(--color-status-bg-green) / 0.28), rgb(var(--color-status-bg-green) / 0.28))"
          : isNem
            ? "linear-gradient(0deg, rgb(var(--delta-down) / 0.14), rgb(var(--delta-down) / 0.14))"
            : undefined,
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-normal">{r.opponent.display_name}</div>
        <div className="text-[11px] text-text-muted">
          {fmtInt(r.played)} games · {pct(r.win_rate)} win · {fmtInt(r.gf)}:{fmtInt(r.ga)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-sm text-text-normal">
          <span className="text-status-text-green">{fmtInt(r.wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{fmtInt(r.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-red-300">{fmtInt(r.losses)}</span>
        </div>
        <div className="font-mono tabular-nums text-[11px] text-text-muted">{r.pts_per_match.toFixed(2)} ppm</div>
      </div>
    </div>
  );
}

function DuoRow({ r, focusPlayerId }: { r: StatsH2HDuo; focusPlayerId?: number | null }) {
  const rr = useMemo(() => {
    const pid = focusPlayerId ?? null;
    if (!pid) return r;
    if (r.p1.id === pid) return r;
    if (r.p2.id !== pid) return r;
    return { ...r, p1: r.p2, p2: r.p1 };
  }, [r, focusPlayerId]);

  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-normal">
          {rr.p1.display_name} <span className="text-text-muted">/</span> {rr.p2.display_name}
        </div>
        <div className="text-[11px] text-text-muted">
          {fmtInt(rr.played)} games · {pct(rr.win_rate)} win · {fmtInt(rr.gf)}:{fmtInt(rr.ga)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-sm text-text-normal">{rr.pts_per_match.toFixed(2)} ppm</div>
        <div className="font-mono tabular-nums text-[11px] text-text-muted">
          <span className="text-status-text-green">{fmtInt(rr.wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{fmtInt(rr.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-red-300">{fmtInt(rr.losses)}</span>
        </div>
      </div>
    </div>
  );
}

function normalizeTeamRivalryForFocus(r: StatsH2HTeamRivalry, focusPlayerId: number | null): StatsH2HTeamRivalry {
  if (!focusPlayerId) return r;
  const in1 = (r.team1 ?? []).some((p) => p.id === focusPlayerId);
  const in2 = (r.team2 ?? []).some((p) => p.id === focusPlayerId);
  if (in1 || !in2) return r; // already left, or not found (shouldn't happen)

  const winsTotal = (r.team1_wins ?? 0) + (r.team2_wins ?? 0);
  const winShare = winsTotal > 0 ? (r.team2_wins ?? 0) / winsTotal : 0.5;
  return {
    ...r,
    team1: r.team2,
    team2: r.team1,
    team1_wins: r.team2_wins,
    team2_wins: r.team1_wins,
    team1_gf: r.team2_gf,
    team1_ga: r.team2_ga,
    team2_gf: r.team1_gf,
    team2_ga: r.team1_ga,
    win_share_team1: winShare,
    // rivalry_score / dominance_score are symmetric; keep as-is.
  };
}

function TeamRivalryRow({ r, focusPlayerId }: { r: StatsH2HTeamRivalry; focusPlayerId?: number | null }) {
  const rr = useMemo(() => normalizeTeamRivalryForFocus(r, focusPlayerId ?? null), [r, focusPlayerId]);
  const team1 = useMemo(() => {
    const pid = focusPlayerId ?? null;
    if (!pid) return rr.team1;
    if (!rr.team1?.length) return rr.team1;
    if (rr.team1[0]?.id === pid) return rr.team1;
    if (rr.team1[1]?.id !== pid) return rr.team1;
    return [rr.team1[1], rr.team1[0]];
  }, [rr.team1, focusPlayerId]);

  const t1 = team1.map((p) => p.display_name).join("/");
  const t2 = rr.team2.map((p) => p.display_name).join("/");
  const closePct = pct(rr.rivalry_score / Math.max(1, rr.played));
  return (
    <div className="panel-subtle rounded-xl px-3 py-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-normal">{t1}</div>
        </div>
        <div className="text-[11px] text-text-muted">vs</div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-text-normal">{t2}</div>
        </div>
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-text-muted">
        <span className="shrink-0">
          {fmtInt(rr.played)} games · {closePct} close
        </span>
        <span className="shrink-0 font-mono tabular-nums">
          <span className="text-status-text-green">{fmtInt(rr.team1_wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{fmtInt(rr.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-red-300">{fmtInt(rr.team2_wins)}</span>
          <span className="text-text-muted"> · </span>
          {fmtInt(rr.team1_gf)}:{fmtInt(rr.team1_ga)}
        </span>
      </div>
    </div>
  );
}

type RivalryOrder = "rivalry" | "played";
type View = "lists" | "matrix";

export default function HeadToHeadCard() {
  const qc = useQueryClient();
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const FETCH_LIMIT = 200; // keep UI trimmed to 5 by default, but don't hide data due to API limit
  const [isOpen, setIsOpen] = useState(false);
  const didWarmRef = useRef(false);

  const [playerId, setPlayerId] = useState<number | "">("");
  const [mode, setMode] = useState<StatsMode>("overall");
  const [order, setOrder] = useState<RivalryOrder>("played");
  const [view, setView] = useState<View>("lists");

  // Warmup: prefetch H2H for all players so avatar clicks don't trigger a first-time loading/layout shift.
  useEffect(() => {
    if (!isOpen) return;
    if (didWarmRef.current) return;
    if (!players.length) return;
    didWarmRef.current = true;

    const ids: Array<number | null> = [null, ...players.map((p) => p.id)];
    const orders: RivalryOrder[] = ["played", "rivalry"];
    for (const pid of ids) {
      for (const o of orders) {
        void qc.prefetchQuery({
          queryKey: ["stats", "h2h", pid ?? "all", FETCH_LIMIT, o],
          queryFn: () => getStatsH2H({ playerId: pid, limit: FETCH_LIMIT, order: o }),
          staleTime: 30_000,
        });
      }
    }
  }, [FETCH_LIMIT, isOpen, players, qc]);

  const h2hQ = useQuery({
    queryKey: ["stats", "h2h", playerId || "all", FETCH_LIMIT, order],
    queryFn: () => getStatsH2H({ playerId: playerId === "" ? null : playerId, limit: FETCH_LIMIT, order }),
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

  const modeTitle = mode === "overall" ? "Overall" : mode === "1v1" ? "1v1" : "2v2";
  const orderTitle = order === "played" ? "Most played" : "Legendary";
  const DEFAULT_SHOW = 5;
  const [showAllByKey, setShowAllByKey] = useState<Record<string, boolean>>({});
  const getShowAll = (k: string) => !!showAllByKey[k];
  const toggleShowAll = (k: string) => setShowAllByKey((prev) => ({ ...prev, [k]: !prev[k] }));

  const nemesis = useMemo(() => {
    const d = h2hQ.data;
    if (!d || !selected) return null;
    return mode === "1v1" ? d.nemesis_1v1 ?? null : mode === "2v2" ? d.nemesis_2v2 ?? null : d.nemesis_all ?? null;
  }, [h2hQ.data, selected, mode]);

  const victim = useMemo(() => {
    const d = h2hQ.data;
    if (!d || !selected) return null;
    return mode === "1v1"
      ? d.favorite_victim_1v1 ?? null
      : mode === "2v2"
        ? d.favorite_victim_2v2 ?? null
        : d.favorite_victim_all ?? null;
  }, [h2hQ.data, selected, mode]);

  const favoriteOpponentId = victim?.opponent?.id ?? null;
  const nemesisOpponentId = nemesis?.opponent?.id ?? null;

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-user-group text-text-muted" aria-hidden="true" />
          Head-to-Head
        </span>
      }
      defaultOpen={false}
      scrollOnOpen={true}
      onOpenChange={setIsOpen}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      <ErrorToastOnError error={h2hQ.error} title="H2H loading failed" />
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatsControlLabel icon="fa-filter" text="Filter" />
            <StatsModeSwitch value={mode} onChange={setMode} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatsControlLabel icon="fa-arrow-down-wide-short" text="Order" />
            <StatsSegmentedSwitch<RivalryOrder>
              value={order}
              onChange={setOrder}
              options={[
                { key: "played", label: "Played", icon: "fa-hashtag" },
                { key: "rivalry", label: "Legendary", icon: "fa-handshake-angle" },
              ]}
              ariaLabel="Order"
              title='Order: "Legendary" or "Played"'
            />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatsControlLabel icon="fa-layer-group" text="View" />
            <StatsSegmentedSwitch<View>
              value={view}
              onChange={setView}
              options={[
                { key: "lists", label: "Lists", icon: "fa-list" },
                { key: "matrix", label: "Matrix", icon: "fa-table-cells" },
              ]}
              ariaLabel="View"
              title="View"
            />
          </div>
        </div>

        <div className="h-px bg-border-card-inner/70" />

        <StatsAvatarSelector
          players={sortedPlayers}
          selectedId={playerId}
          onSelect={setPlayerId}
          avatarUpdatedAtById={avatarUpdatedAtById}
          includeAll={true}
          allValue=""
          allLabel="All players"
          allIconClass="fa-solid fa-layer-group text-[12px] text-text-muted"
          avatarClassName="h-8 w-8"
        />
      </div>

        {h2hQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}

        {h2hQ.data ? (
          <div className="space-y-3" style={{ overflowAnchor: "none" }}>
            {view === "matrix" ? (
              <div className="card-inner-flat rounded-2xl space-y-2">
                <div className="text-sm font-semibold text-text-normal">
                  Matrix <span className="text-text-muted">· {modeTitle}</span>
                </div>
                <div className="text-[11px] text-text-muted">
                  Cells show <span className="text-text-normal">W</span> (top) / <span className="text-text-normal">D</span>{" "}
                  (mid) / <span className="text-text-normal">L</span> (bottom) from the row player’s perspective.
                </div>

                {(() => {
                  const list =
                    mode === "1v1"
                      ? (h2hQ.data.rivalries_1v1 ?? [])
                      : mode === "2v2"
                        ? (h2hQ.data.rivalries_2v2 ?? [])
                        : (h2hQ.data.rivalries_all ?? []);

                  const byKey = new Map<string, StatsH2HPair>();
                  for (const r of list) {
                    const a = Math.min(r.a.id, r.b.id);
                    const b = Math.max(r.a.id, r.b.id);
                    byKey.set(`${a}-${b}`, r);
                  }

                  const metric = (r: StatsH2HPair) => {
                    // For the matrix highlight we follow the current ordering mode.
                    // "played": highlight by games played.
                    // "legendary": highlight by rivalry_score (played × closeness).
                    return order === "played" ? Number(r.played ?? 0) : Number(r.rivalry_score ?? 0);
                  };
                  const maxMetric = Math.max(1, ...list.map(metric));
                  const focusId = selected?.id ?? null;

                  const roster = [...players].sort((a, b) => a.display_name.localeCompare(b.display_name));
                  if (!roster.length) return <div className="text-sm text-text-muted">No players.</div>;

                  // Mobile-friendly: vertical column labels so the grid can stay compact.
                  // Keep the left name column fixed (no wasted space), and make cells wide enough to avoid overflow.
                  const rowHeadW = "56px";
                  const colW = roster.length <= 8 ? "38px" : roster.length <= 10 ? "34px" : "30px";
                  // Let columns expand to fill available width (no dead space on the right),
                  // but keep a minimum so cells stay readable.
                  const gridCols = `${rowHeadW} repeat(${roster.length}, minmax(${colW}, 1fr))`;

                  return (
                    <div className="-mx-3 overflow-x-auto px-3">
                      <div
                        className="rounded-lg p-px"
                        style={{ backgroundColor: "rgb(var(--color-border-card-inner) / 0.55)" }}
                      >
                        <div
                          className="grid gap-px"
                          style={{
                            gridTemplateColumns: gridCols,
                          }}
                        >
                          <div className="sticky left-0 z-20 flex h-7 items-center rounded-md bg-bg-card-inner px-1.5 text-[10px] font-semibold text-text-muted">
                            <span className="truncate">Player</span>
                          </div>
                          {roster.map((p) => (
                            <div
                              key={`h-${p.id}`}
                              className="flex h-7 items-center justify-center rounded-md bg-bg-card-chip/28 px-1 text-center font-semibold text-text-muted"
                              title={p.display_name}
                            >
                              <div className="w-full truncate text-[9px] leading-3">{p.display_name}</div>
                            </div>
                          ))}

                          {roster.map((rowP) => (
                            <Fragment key={`row-${rowP.id}`}>
                              <div
                                key={`r-${rowP.id}`}
                                className={"sticky left-0 z-10 flex h-9 items-center rounded-md bg-bg-card-inner px-1.5 text-[11px] font-semibold text-text-normal"}
                                style={{
                                  backgroundImage:
                                    focusId && rowP.id === focusId
                                      ? `linear-gradient(0deg, rgb(var(--color-accent) / 0.08), rgb(var(--color-accent) / 0.08))`
                                      : undefined,
                                }}
                                title={rowP.display_name}
                              >
                                <div className="w-full truncate">{rowP.display_name}</div>
                              </div>
                              {roster.map((colP) => {
                              const cellBaseCls = "bg-bg-card-chip/28";
                              const rowIsFocus = !!focusId && rowP.id === focusId;
                              const toneCell =
                                rowIsFocus && favoriteOpponentId && colP.id === favoriteOpponentId
                                  ? "favorite"
                                  : rowIsFocus && nemesisOpponentId && colP.id === nemesisOpponentId
                                    ? "nemesis"
                                    : null;
                              const cellBoxShadow = toneCell
                                ? toneCell === "favorite"
                                  ? "inset 0 0 0 1.5px rgb(var(--color-status-border-green) / 0.95)"
                                  : "inset 0 0 0 1.5px rgb(var(--delta-down) / 0.65)"
                                : undefined;
                              if (rowP.id === colP.id) {
                                return (
                                  <div
                                    key={`c-${rowP.id}-${colP.id}`}
                                    className={"h-9 rounded-md " + cellBaseCls}
                                    style={{
                                      backgroundImage: rowIsFocus
                                        ? `linear-gradient(0deg, rgb(var(--color-accent) / 0.06), rgb(var(--color-accent) / 0.06))`
                                        : undefined,
                                      boxShadow: cellBoxShadow,
                                    }}
                                  />
                                );
                              }
                              const a = Math.min(rowP.id, colP.id);
                              const b = Math.max(rowP.id, colP.id);
                              const r = byKey.get(`${a}-${b}`) ?? null;
                              if (!r || !r.played) {
                                return (
                                  <div
                                    key={`c-${rowP.id}-${colP.id}`}
                                    className={
                                      "flex h-9 items-center justify-center rounded-md px-1 text-center text-[11px] text-text-muted " +
                                      cellBaseCls
                                    }
                                    style={{
                                      backgroundImage: rowIsFocus
                                        ? `linear-gradient(0deg, rgb(var(--color-accent) / 0.06), rgb(var(--color-accent) / 0.06))`
                                        : undefined,
                                      boxShadow: cellBoxShadow,
                                    }}
                                  >
                                    —
                                  </div>
                                );
                              }
                                const rowIsA = r.a.id === rowP.id;
                                const w = rowIsA ? r.a_wins : r.b_wins;
                                const l = rowIsA ? r.b_wins : r.a_wins;
                                const d = r.draws;
                                const t = Math.max(0, Math.min(1, metric(r) / maxMetric));
                                const alpha = 0.03 + 0.14 * t; // subtle highlight, scaled to current mode/order
                                return (
                                  <div
                                    key={`c-${rowP.id}-${colP.id}`}
                                    className={
                                      "flex h-9 items-center justify-center rounded-md px-1 text-center overflow-hidden " +
                                      cellBaseCls
                                    }
                                  style={{
                                    backgroundImage: rowIsFocus
                                      ? `linear-gradient(0deg, rgb(var(--color-accent) / ${alpha}), rgb(var(--color-accent) / ${alpha})), linear-gradient(0deg, rgb(var(--color-accent) / 0.06), rgb(var(--color-accent) / 0.06))`
                                      : `linear-gradient(0deg, rgb(var(--color-accent) / ${alpha}), rgb(var(--color-accent) / ${alpha}))`,
                                    boxShadow: cellBoxShadow,
                                  }}
                                  title={`${rowP.display_name} vs ${colP.display_name} · ${r.played} games`}
                                >
                                    <div className="mx-auto inline-flex flex-col items-center justify-center font-mono text-[10px] leading-[10px] tabular-nums">
                                      <span className="text-status-text-green">{fmtInt(w)}</span>
                                      <span className="text-amber-300">{fmtInt(d)}</span>
                                      <span className="text-[color:rgb(var(--delta-down)/1)]">{fmtInt(l)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}

            {view === "lists" ? (
              <>
                {!selected ? (
                  <div className="card-inner-flat rounded-2xl space-y-2">
                    {(() => {
                      const k = `legendary-${mode}-${order}`;
                      const list =
                        mode === "2v2"
                          ? (h2hQ.data.team_rivalries_2v2 ?? [])
                          : mode === "1v1"
                            ? (h2hQ.data.rivalries_1v1 ?? [])
                            : (h2hQ.data.rivalries_all ?? []);

                      const showAll = getShowAll(k);
                      const hasMore = list.length > DEFAULT_SHOW;
                      const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);

                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-text-normal">
                                Legendary rivalries <span className="text-text-muted">· {modeTitle}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-text-muted">
                                {orderTitle === "Legendary" ? (
                                  <>
                                    Ranked by <span className="text-text-normal">played × closeness</span>.{" "}
                                    <span className="text-text-normal">% close</span> measures win-balance (wins only, draws
                                    ignored).
                                  </>
                                ) : (
                                  <>Sorted by <span className="text-text-normal">games played</span>.</>
                                )}
                              </div>
                            </div>

                            {hasMore ? (
                              <button
                                type="button"
                                className="btn-base btn-ghost inline-flex h-9 items-center justify-center px-3 py-2 text-[11px] shrink-0"
                                onClick={() => toggleShowAll(k)}
                                title={showAll ? `Show top ${DEFAULT_SHOW}` : "Show all"}
                              >
                                {showAll ? `Top ${DEFAULT_SHOW}` : "All"}
                              </button>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            {visible.length ? (
                              mode === "2v2" ? (
                                (visible as StatsH2HTeamRivalry[]).map((r) => (
                                  <TeamRivalryRow
                                    key={`t2-${r.team1.map((p) => p.id).join("-")}-${r.team2.map((p) => p.id).join("-")}`}
                                    r={r}
                                  />
                                ))
                              ) : (
                                (visible as StatsH2HPair[]).map((r) => (
                                  <PairRow key={`${mode}-${r.a.id}-${r.b.id}`} r={r} />
                                ))
                              )
                            ) : (
                              <div className="text-sm text-text-muted">No data yet.</div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                {mode === "2v2" && !selected ? (
                  <div className="card-inner-flat rounded-2xl space-y-2">
                    {(() => {
                      const k = `best-teammates-${mode}-${order}`;
                      const list = h2hQ.data.best_teammates_2v2 ?? [];
                      const showAll = getShowAll(k);
                      const hasMore = list.length > DEFAULT_SHOW;
                      const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);
                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-text-normal">Best teammates (2v2)</div>
                            {hasMore ? (
                              <button
                                type="button"
                                className="btn-base btn-ghost inline-flex h-9 items-center justify-center px-3 py-2 text-[11px] shrink-0"
                                onClick={() => toggleShowAll(k)}
                                title={showAll ? `Show top ${DEFAULT_SHOW}` : "Show all"}
                              >
                                {showAll ? `Top ${DEFAULT_SHOW}` : "All"}
                              </button>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            {visible.length ? (
                              visible.map((r) => <DuoRow key={`duo-${r.p1.id}-${r.p2.id}`} r={r} />)
                            ) : (
                              <div className="text-sm text-text-muted">No data yet.</div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : null}

                {selected ? (
                  (() => {
                const Matchups = (
                  <div className="card-inner-flat rounded-2xl space-y-2">
                    <div className="text-sm font-semibold text-text-normal">
                      {selected.display_name}
                      <span className="text-text-muted"> · matchups ({modeTitle})</span>
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {order === "played" ? (
                        <>Sorted by <span className="text-text-normal">games played</span>.</>
                      ) : (
                        <>
                          Sorted by <span className="text-text-normal">played × closeness</span>.{" "}
                          <span className="text-text-normal">Closeness</span> compares wins only (draws ignored).
                        </>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const k = `matchups-focus-${mode}-${order}-${selected.id}`;
                        const list =
                          mode === "1v1"
                            ? (h2hQ.data.vs_1v1 ?? [])
                            : mode === "2v2"
                              ? (h2hQ.data.vs_2v2 ?? [])
                              : (h2hQ.data.vs_all ?? []);

                        const showAll = getShowAll(k);
                        const hasMore = list.length > DEFAULT_SHOW;
                        const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);

                        return visible.length ? (
                          <>
                            {hasMore ? (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  className="btn-base btn-ghost inline-flex h-9 items-center justify-center px-3 py-2 text-[11px]"
                                  onClick={() => toggleShowAll(k)}
                                  title={showAll ? `Show top ${DEFAULT_SHOW}` : "Show all"}
                                >
                                  {showAll ? `Top ${DEFAULT_SHOW}` : "All"}
                                </button>
                              </div>
                            ) : null}
                            {visible.map((r) => (
                              <OpponentRow
                                key={`vs-${mode}-${r.opponent.id}`}
                                r={r}
                                tone={
                                  favoriteOpponentId && r.opponent.id === favoriteOpponentId
                                    ? "favorite"
                                    : nemesisOpponentId && r.opponent.id === nemesisOpponentId
                                      ? "nemesis"
                                      : null
                                }
                              />
                            ))}
                          </>
                        ) : (
                          <div className="text-sm text-text-muted">No data yet.</div>
                        );
                      })()}
                    </div>
                  </div>
                );

                const Teammates =
                  mode === "2v2" ? (
                    <div className="card-inner-flat rounded-2xl space-y-2">
                      <div className="text-sm font-semibold text-text-normal">
                        {selected.display_name}
                        <span className="text-text-muted"> · teammates (2v2)</span>
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {order === "played" ? (
                          <>Sorted by <span className="text-text-normal">games played</span>.</>
                        ) : (
                          <>
                            Sorted by <span className="text-text-normal">points per match</span> (then games played).
                          </>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(() => {
                          const k = `teammates-focus-${mode}-${order}-${selected.id}`;
                          const list = h2hQ.data.with_2v2 ?? [];
                          const showAll = getShowAll(k);
                          const hasMore = list.length > DEFAULT_SHOW;
                          const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);

                          return visible.length ? (
                            <>
                              {hasMore ? (
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    className="btn-base btn-ghost inline-flex h-9 items-center justify-center px-3 py-2 text-[11px]"
                                    onClick={() => toggleShowAll(k)}
                                    title={showAll ? `Show top ${DEFAULT_SHOW}` : "Show all"}
                                  >
                                    {showAll ? `Top ${DEFAULT_SHOW}` : "All"}
                                  </button>
                                </div>
                              ) : null}
                              {visible.map((r) => (
                                <DuoRow key={`with-${r.p1.id}-${r.p2.id}`} r={r} focusPlayerId={selected.id} />
                              ))}
                            </>
                          ) : (
                            <div className="text-sm text-text-muted">No data yet.</div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : null;

                if (mode !== "2v2") return Matchups;

                const TeamRivalries = (
                  <div className="card-inner-flat rounded-2xl space-y-2">
                    {(() => {
                      const k = `team-rivalries-focus-${mode}-${order}-${selected.id}`;
                      const list = h2hQ.data.team_rivalries_2v2_for_player ?? [];
                      const showAll = getShowAll(k);
                      const hasMore = list.length > DEFAULT_SHOW;
                      const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);

                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-text-normal">
                              {selected.display_name}
                              <span className="text-text-muted"> · team rivalries (2v2)</span>
                            </div>
                            {hasMore ? (
                              <button
                                type="button"
                                className="btn-base btn-ghost inline-flex h-9 items-center justify-center px-3 py-2 text-[11px] shrink-0"
                                onClick={() => toggleShowAll(k)}
                                title={showAll ? `Show top ${DEFAULT_SHOW}` : "Show all"}
                              >
                                {showAll ? `Top ${DEFAULT_SHOW}` : "All"}
                              </button>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {order === "played" ? (
                              <>Sorted by <span className="text-text-normal">games played</span>.</>
                            ) : (
                              <>
                                Sorted by <span className="text-text-normal">played × closeness</span>.{" "}
                                <span className="text-text-normal">% close</span> compares wins only (draws ignored).
                              </>
                            )}
                          </div>

                          <div className="space-y-2">
                            {visible.length ? (
                              visible.map((r) => (
                                <TeamRivalryRow
                                  key={`tm-${r.team1.map((p) => p.id).join("-")}-${r.team2.map((p) => p.id).join("-")}`}
                                  r={r}
                                  focusPlayerId={selected.id}
                                />
                              ))
                            ) : (
                              <div className="text-sm text-text-muted">No data yet.</div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );

                return (
                  <div className="space-y-3">
                    {Matchups}
                    {Teammates}
                    {TeamRivalries}
                  </div>
                );
                  })()
                ) : null}
              </>
            ) : null}

          </div>
        ) : null}
    </CollapsibleCard>
  );
}
