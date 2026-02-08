import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { MetaRow } from "../../ui/primitives/Meta";

import { listPlayers } from "../../api/players.api";
import { getStatsH2H } from "../../api/stats.api";
import type { StatsH2HDuo, StatsH2HOpponentRow, StatsH2HPair, StatsH2HTeamRivalry } from "../../api/types";

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function dominanceScoreFromOpponentRow(r: StatsH2HOpponentRow) {
  const played = Number(r.played ?? 0) || 0;
  const wins = Number(r.wins ?? 0) || 0;
  const losses = Number(r.losses ?? 0) || 0;
  const winsTotal = wins + losses;
  const share = winsTotal > 0 ? wins / winsTotal : 0.5;
  const closeness = 1 - Math.min(1, Math.abs(share - 0.5) * 2); // 1 close .. 0 one-sided
  return played * (1 - closeness);
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

function OpponentRow({ r }: { r: StatsH2HOpponentRow }) {
  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
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

function DuoRow({ r }: { r: StatsH2HDuo }) {
  return (
    <div className="panel-subtle flex items-center justify-between gap-3 rounded-xl px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-normal">
          {r.p1.display_name} <span className="text-text-muted">/</span> {r.p2.display_name}
        </div>
        <div className="text-[11px] text-text-muted">
          {fmtInt(r.played)} games · {pct(r.win_rate)} win · {fmtInt(r.gf)}:{fmtInt(r.ga)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono tabular-nums text-sm text-text-normal">{r.pts_per_match.toFixed(2)} ppm</div>
        <div className="font-mono tabular-nums text-[11px] text-text-muted">
          <span className="text-status-text-green">{fmtInt(r.wins)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{fmtInt(r.draws)}</span>
          <span className="text-text-muted">-</span>
          <span className="text-red-300">{fmtInt(r.losses)}</span>
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
  const t1 = rr.team1.map((p) => p.display_name).join("/");
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

type Mode = "overall" | "1v1" | "2v2";
type RivalryOrder = "rivalry" | "played";

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

function OrderSwitch({ value, onChange }: { value: RivalryOrder; onChange: (o: RivalryOrder) => void }) {
  const idx = value === "rivalry" ? 0 : 1;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Order"
      title='Order: "Legendary" or "Played"'
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
          { k: "rivalry" as const, label: "Legendary", icon: "fa-handshake-angle" },
          { k: "played" as const, label: "Played", icon: "fa-hashtag" },
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

export default function HeadToHeadCard() {
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const players = playersQ.data ?? [];

  const [playerId, setPlayerId] = useState<number | "">("");
  const [mode, setMode] = useState<Mode>("overall");
  const [order, setOrder] = useState<RivalryOrder>("rivalry");
  const FETCH_LIMIT = 200; // keep UI trimmed to 5 by default, but don't hide data due to API limit
  const h2hQ = useQuery({
    queryKey: ["stats", "h2h", playerId || "all", FETCH_LIMIT, order],
    queryFn: () => getStatsH2H({ playerId: playerId === "" ? null : playerId, limit: FETCH_LIMIT, order }),
    staleTime: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const selected = useMemo(() => {
    if (playerId === "") return null;
    return players.find((p) => p.id === playerId) ?? null;
  }, [players, playerId]);

  const modeTitle = mode === "overall" ? "Overall" : mode === "1v1" ? "1v1" : "2v2";
  const orderTitle = order === "played" ? "Most played" : "Legendary";
  const DEFAULT_SHOW = 5;
  const [showAllByKey, setShowAllByKey] = useState<Record<string, boolean>>({});
  const getShowAll = (k: string) => !!showAllByKey[k];
  const toggleShowAll = (k: string) => setShowAllByKey((prev) => ({ ...prev, [k]: !prev[k] }));

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
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
              <span>Filter</span>
            </span>
            <ModeSwitch value={mode} onChange={setMode} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-arrow-down-wide-short text-[11px]" aria-hidden="true" />
              <span>Order</span>
            </span>
            <OrderSwitch value={order} onChange={setOrder} />
          </div>
        </div>

          <MetaRow>
            <span>Focus</span>
            <span className="text-text-muted">Optional</span>
          </MetaRow>
          <div className="flex items-center gap-2">
            <select
              className="w-full rounded-xl border border-border-card-inner bg-bg-card-inner px-3 py-2 text-sm text-text-normal"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">All players</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            {playerId !== "" ? (
              <button
                type="button"
                className="btn-base btn-ghost inline-flex h-10 w-10 items-center justify-center"
                onClick={() => setPlayerId("")}
                title="Clear focus"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </div>
      </div>

        {h2hQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}
        {h2hQ.error ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(h2hQ.error)}</div> : null}

        {h2hQ.data ? (
          <div className="space-y-3">
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
                            (visible as StatsH2HPair[]).map((r) => <PairRow key={`${mode}-${r.a.id}-${r.b.id}`} r={r} />)
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

            {mode === "1v1" ? (
              null
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
                            {visible.map((r) => <OpponentRow key={`vs-${mode}-${r.opponent.id}`} r={r} />)}
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
                              {visible.map((r) => <DuoRow key={`with-${r.p1.id}-${r.p2.id}`} r={r} />)}
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
          </div>
        ) : null}
    </CollapsibleCard>
  );
}
