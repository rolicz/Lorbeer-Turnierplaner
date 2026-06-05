import { Fragment, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";
import { getStatsH2H, getStatsH2HMatches, type StatsH2HMatchesRequest } from "../../api/stats.api";
import type { StatsH2HPair, StatsH2HTeamRivalry, StatsScope } from "../../api/types";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import {
  StatsAvatarSelector,
  StatsControlLabel,
  StatsFilterDataControls,
  StatsSegmentedSwitch,
  type StatsMode,
} from "./StatsControls";
import { MatchHistoryList } from "./MatchHistoryList";
import { fmtInt } from "../../utils/format";
import { DuoRow, OpponentRow, PairRow, TeamRivalryRow } from "./HeadToHeadRows";

type RivalryOrder = "rivalry" | "played";
type View = "lists" | "matrix";
type DetailView = "compact" | "details";

type MatchupHistoryModalState = {
  title: string;
  req: StatsH2HMatchesRequest;
  focusPlayerId: number | null;
};

export default function HeadToHeadCard({ embedded = false }: { embedded?: boolean } = {}) {
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const FETCH_LIMIT = 200; // keep UI trimmed to 5 by default, but don't hide data due to API limit

  const [playerId, setPlayerId] = useState<number | "">("");
  const [mode, setMode] = useState<StatsMode>("overall");
  const [scope, setScope] = useState<StatsScope>("tournaments");
  const [order, setOrder] = useState<RivalryOrder>("played");
  const [view, setView] = useState<View>("lists");
  const [detailView, setDetailView] = useState<DetailView>("compact");
  const [historyModal, setHistoryModal] = useState<MatchupHistoryModalState | null>(null);

  const h2hQ = useQuery({
    queryKey: ["stats", "h2h", playerId || "all", FETCH_LIMIT, order, scope],
    queryFn: () =>
      getStatsH2H({ playerId: playerId === "" ? null : playerId, limit: FETCH_LIMIT, order, scope }),
    placeholderData: keepPreviousData,
    staleTime: 0,
    // Avoid surprise reflows while the user is interacting (mobile scroll anchoring can look like "jumps").
    // WS invalidation still refreshes stats when tournaments change.
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const clubsQ = useQuery({
    queryKey: ["clubs"],
    queryFn: () => listClubs(),
    enabled: !!historyModal,
    staleTime: 5 * 60_000,
  });

  const historyQ = useQuery({
    queryKey: [
      "stats",
      "h2hMatches",
      historyModal?.req.mode ?? "overall",
      historyModal?.req.relation ?? "opposed",
      (historyModal?.req.left_player_ids ?? []).join("-"),
      (historyModal?.req.right_player_ids ?? []).join("-"),
      historyModal?.req.exact_teams ? "exact" : "subset",
      historyModal?.req.scope ?? "tournaments",
    ],
    queryFn: () => getStatsH2HMatches(historyModal!.req),
    enabled: !!historyModal,
    placeholderData: keepPreviousData,
    staleTime: 0,
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
  const scopeTitle = scope === "tournaments" ? "tournaments" : scope === "both" ? "all" : "friendlies";
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
  const clubs = clubsQ.data ?? [];

  const openOpposedModal = (args: {
    title: string;
    leftPlayerIds: number[];
    rightPlayerIds: number[];
    exactTeams?: boolean;
    focusPlayerId?: number | null;
  }) => {
    setHistoryModal({
      title: args.title,
      req: {
        mode,
        relation: "opposed",
        left_player_ids: args.leftPlayerIds,
        right_player_ids: args.rightPlayerIds,
        exact_teams: !!args.exactTeams,
        scope,
      },
      focusPlayerId: args.focusPlayerId ?? selected?.id ?? null,
    });
  };

  const openTeammatesModal = (args: { title: string; leftPlayerIds: number[]; focusPlayerId?: number | null }) => {
    setHistoryModal({
      title: args.title,
      req: {
        mode,
        relation: "teammates",
        left_player_ids: args.leftPlayerIds,
        right_player_ids: [],
        scope,
      },
      focusPlayerId: args.focusPlayerId ?? selected?.id ?? null,
    });
  };

  useEffect(() => {
    if (!historyModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyModal]);

  const content = (
    <>
      <ErrorToastOnError error={h2hQ.error} title="H2H loading failed" />
      <ErrorToastOnError error={historyQ.error} title="Match history loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Club data loading failed" />
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <StatsFilterDataControls mode={mode} onModeChange={setMode} scope={scope} onScopeChange={setScope} />

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

        {h2hQ.isLoading ? <InlineLoading label="Loading…" /> : null}

        {h2hQ.data ? (
          <div className="space-y-3" style={{ overflowAnchor: "none" }}>
            {view === "matrix" ? (
              <div className="card-inner-flat rounded-2xl space-y-2">
                <div className="text-sm font-semibold text-text-normal">
                  Matrix <span className="text-text-muted">· {modeTitle} · {scopeTitle}</span>
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
                                <button
                                  key={`c-${rowP.id}-${colP.id}`}
                                  type="button"
                                  className={
                                    "flex h-9 w-full items-center justify-center appearance-none border-0 rounded-md px-1 text-center overflow-hidden transition hover:bg-bg-card-chip/40 active:bg-bg-card-chip/50 " +
                                    cellBaseCls
                                  }
                                  style={{
                                    backgroundImage: rowIsFocus
                                      ? `linear-gradient(0deg, rgb(var(--color-accent) / ${alpha}), rgb(var(--color-accent) / ${alpha})), linear-gradient(0deg, rgb(var(--color-accent) / 0.06), rgb(var(--color-accent) / 0.06))`
                                      : `linear-gradient(0deg, rgb(var(--color-accent) / ${alpha}), rgb(var(--color-accent) / ${alpha}))`,
                                    boxShadow: cellBoxShadow,
                                  }}
                                  title={`${rowP.display_name} vs ${colP.display_name} · ${r.played} games`}
                                  onClick={() =>
                                    openOpposedModal({
                                      title: `${rowP.display_name} vs ${colP.display_name}`,
                                      leftPlayerIds: [rowP.id],
                                      rightPlayerIds: [colP.id],
                                      focusPlayerId: rowP.id,
                                    })
                                  }
                                >
                                  <div className="inline-flex flex-col items-center justify-center font-mono text-[10px] leading-[10px] tabular-nums">
                                    <span className="text-status-text-green">{fmtInt(w)}</span>
                                    <span className="text-amber-300">{fmtInt(d)}</span>
                                    <span className="text-[color:rgb(var(--delta-down)/1)]">{fmtInt(l)}</span>
                                  </div>
                                </button>
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
                      const k = `legendary-${mode}-${order}-${scope}`;
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
                                Legendary rivalries <span className="text-text-muted">· {modeTitle} · {scopeTitle}</span>
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
                                    onOpenMatches={(rr) =>
                                      openOpposedModal({
                                        title: `${rr.team1.map((p) => p.display_name).join("/")} vs ${rr.team2.map((p) => p.display_name).join("/")}`,
                                        leftPlayerIds: rr.team1.map((p) => p.id),
                                        rightPlayerIds: rr.team2.map((p) => p.id),
                                        exactTeams: true,
                                      })
                                    }
                                  />
                                ))
                              ) : (
                                (visible as StatsH2HPair[]).map((r) => (
                                  <PairRow
                                    key={`${mode}-${r.a.id}-${r.b.id}`}
                                    r={r}
                                    onOpenMatches={(rr) =>
                                      openOpposedModal({
                                        title: `${rr.a.display_name} vs ${rr.b.display_name}`,
                                        leftPlayerIds: [rr.a.id],
                                        rightPlayerIds: [rr.b.id],
                                      })
                                    }
                                  />
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
                      const k = `best-teammates-${mode}-${order}-${scope}`;
                      const list = h2hQ.data.best_teammates_2v2 ?? [];
                      const showAll = getShowAll(k);
                      const hasMore = list.length > DEFAULT_SHOW;
                      const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);
                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-text-normal">
                              Best teammates <span className="text-text-muted">· 2v2 · {scopeTitle}</span>
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
                              visible.map((r) => (
                                <DuoRow
                                  key={`duo-${r.p1.id}-${r.p2.id}`}
                                  r={r}
                                  onOpenMatches={(rr) =>
                                    openTeammatesModal({
                                      title: `${rr.p1.display_name} / ${rr.p2.display_name}`,
                                      leftPlayerIds: [rr.p1.id, rr.p2.id],
                                    })
                                  }
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
                ) : null}

                {selected ? (
                  (() => {
                const Matchups = (
                  <div className="card-inner-flat rounded-2xl space-y-2">
                    <div className="text-sm font-semibold text-text-normal">
                      {selected.display_name}
                      <span className="text-text-muted"> · matchups ({modeTitle}) · {scopeTitle}</span>
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
                        const k = `matchups-focus-${mode}-${order}-${scope}-${selected.id}`;
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
                                onOpenMatches={() =>
                                  openOpposedModal({
                                    title: `${selected.display_name} vs ${r.opponent.display_name}`,
                                    leftPlayerIds: [selected.id],
                                    rightPlayerIds: [r.opponent.id],
                                    focusPlayerId: selected.id,
                                  })
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
                        <span className="text-text-muted"> · teammates (2v2) · {scopeTitle}</span>
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
                          const k = `teammates-focus-${mode}-${order}-${scope}-${selected.id}`;
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
                                <DuoRow
                                  key={`with-${r.p1.id}-${r.p2.id}`}
                                  r={r}
                                  focusPlayerId={selected.id}
                                  onOpenMatches={(rr) =>
                                    openTeammatesModal({
                                      title: `${rr.p1.display_name} / ${rr.p2.display_name}`,
                                      leftPlayerIds: [rr.p1.id, rr.p2.id],
                                      focusPlayerId: selected.id,
                                    })
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
                  ) : null;

                if (mode !== "2v2") return Matchups;

                const TeamRivalries = (
                  <div className="card-inner-flat rounded-2xl space-y-2">
                    {(() => {
                      const k = `team-rivalries-focus-${mode}-${order}-${scope}-${selected.id}`;
                      const list = h2hQ.data.team_rivalries_2v2_for_player ?? [];
                      const showAll = getShowAll(k);
                      const hasMore = list.length > DEFAULT_SHOW;
                      const visible = showAll ? list : list.slice(0, DEFAULT_SHOW);

                      return (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-text-normal">
                              {selected.display_name}
                              <span className="text-text-muted"> · team rivalries (2v2) · {scopeTitle}</span>
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
                                  onOpenMatches={(rr) =>
                                    openOpposedModal({
                                      title: `${rr.team1.map((p) => p.display_name).join("/")} vs ${rr.team2.map((p) => p.display_name).join("/")}`,
                                      leftPlayerIds: rr.team1.map((p) => p.id),
                                      rightPlayerIds: rr.team2.map((p) => p.id),
                                      exactTeams: true,
                                      focusPlayerId: selected.id,
                                    })
                                  }
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

      {historyModal ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/65" onClick={() => setHistoryModal(null)} />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center p-3 sm:p-6">
            <div className="card-outer w-full max-w-4xl p-3 sm:p-4 max-h-[88vh] overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-normal">{historyModal.title}</div>
                  <div className="text-[11px] text-text-muted">Match history</div>
                </div>
                <button
                  type="button"
                  className="icon-button h-10 w-10 p-0 inline-flex items-center justify-center"
                  onClick={() => setHistoryModal(null)}
                  aria-label="Close"
                  title="Close"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 card-inner-flat rounded-2xl p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatsControlLabel icon="fa-sliders" text="View" />
                  <StatsSegmentedSwitch<DetailView>
                    value={detailView}
                    onChange={setDetailView}
                    options={[
                      { key: "compact", label: "Compact", icon: "fa-compress" },
                      { key: "details", label: "Details", icon: "fa-list" },
                    ]}
                    ariaLabel="History details"
                    title="Toggle details (clubs / leagues / stars)"
                  />
                </div>
              </div>

              <div className="mt-3 max-h-[calc(88vh-10rem)] overflow-y-auto pr-1">
                {historyQ.isLoading ? <InlineLoading label="Loading…" /> : null}

                {!historyQ.isLoading && !(historyQ.data?.tournaments?.length ?? 0) ? (
                  <div className="card-inner-flat rounded-2xl text-sm text-text-muted">No matches found for this matchup.</div>
                ) : null}

                {historyQ.data?.tournaments?.length ? (
                  <MatchHistoryList
                    tournaments={historyQ.data.tournaments}
                    focusId={historyModal.focusPlayerId}
                    clubs={clubs}
                    showMeta={detailView === "details"}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) return <div className="space-y-3">{content}</div>;

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
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      {content}
    </CollapsibleCard>
  );
}
