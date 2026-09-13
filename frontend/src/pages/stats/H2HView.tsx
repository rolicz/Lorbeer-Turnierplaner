/** H2H section — full matrix, per-player detail, teammate synergy and rivalries.
 *  In 2v2 mode the Players | Duos sub-view chips (owned by StatsInsights) expose the
 *  backend's real duo stats (best_teammates_2v2 / team_rivalries_2v2) instead of a
 *  client-side recompute. The selected player is shared with the other sections. */
import { HeartCrack, Smile } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import Modal from "../../ui/primitives/Modal";
import PlayerLink from "../../ui/primitives/PlayerLink";
import { getStatsH2H, getStatsH2HMatches, type StatsH2HMatchesRequest } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { ChipGroup } from "../../ui/primitives/Chip";
import { PlayerPicker } from "./PlayerPicker";
import StatsSection from "./StatsSection";
import { MatchHistoryList, tournamentMatchHref } from "./MatchHistoryList";
import { DuoRow } from "./HeadToHeadRows";
import { duoKey } from "./h2hHelpers";
import { DuoLeaderboard } from "./h2h/DuoLeaderboard";
import { DuoPicker } from "./h2h/DuoPicker";
import { DuoRivalries } from "./h2h/DuoRivalries";
import { DuoDetail } from "./h2h/DuoDetail";
import type { Row } from "./standings";
import type { H2HSub } from "./statsNav";
import type { StatsMode } from "./statsMode";
import type { StatsScope, StatsH2HPair, StatsH2HOpponentRow, StatsH2HDuo, StatsH2HTeamRivalry } from "../../api/types";

function h2hTone(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  return `hsl(${t * 130} 60% 42% / 0.85)`;
}

function h2hSequential(t: number): string {
  return `hsl(210 60% ${48 - t * 22}% / ${0.55 + t * 0.3})`;
}

function h2hDiverging(gd: number, maxAbs: number): string {
  if (maxAbs === 0) return `hsl(0 0% 40% / 0.55)`;
  const t = Math.max(-1, Math.min(1, gd / maxAbs));
  if (t >= 0) return `hsl(130 55% ${46 - t * 18}% / ${0.55 + t * 0.3})`;
  return `hsl(0 55% ${46 + t * 18}% / ${0.55 - t * 0.3})`;
}

type HistoryModalState = { title: string; req: StatsH2HMatchesRequest; focusPlayerId: number | null };

/** Favorite / Nemesis chip — taps into the matchup when the opponent is known. */
function RivalCard({ icon, label, row, onOpen }: {
  icon: ReactNode; label: string; row: StatsH2HOpponentRow | null; onOpen: (opponentId: number) => void;
}) {
  const body = (
    <>
      <div className="inline-flex items-center gap-2 text-text-muted">{icon}<span>{label}</span></div>
      <div className="mt-0.5 font-semibold">{row?.opponent.display_name ?? "—"}</div>
      {row ? (
        <div className="mt-0.5 text-text-muted">
          <span className="text-win">{row.wins}</span>-<span className="text-draw">{row.draws}</span>-<span className="text-loss">{row.losses}</span> ·{" "}
          {row.pts_per_match.toFixed(2)} ppm
        </div>
      ) : null}
    </>
  );
  if (!row) return <div className="inset px-3 py-2">{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(row.opponent.id)}
      title={`All matches against ${row.opponent.display_name}`}
      className="inset px-3 py-2 text-left transition hover:bg-bg-card-chip/40 active:bg-bg-card-chip/50 focus-ring"
    >
      {body}
    </button>
  );
}

export default function H2HView({ mode, scope, rows, subView, selectedId, onSelect, onOpenMatchup }: {
  mode: StatsMode; scope: StatsScope; rows: Row[];
  /** Sub-view from the URL (`?sub=`); Duos is 2v2-only. */
  subView: H2HSub;
  /** Shared stats player selection (URL `?player=`), so H2H ↔ Player keep the same player. */
  selectedId: number | null; onSelect: (id: number) => void;
  /** Drill into "A vs B, every match" (URL `?player=<a>&vs=<b>`). */
  onOpenMatchup: (leftId: number, rightId: number) => void;
}) {
  const q = useQuery({
    queryKey: qk.stats.h2h("all", 200, "rivalry", scope),
    queryFn: () => getStatsH2H({ playerId: null, limit: 200, order: "rivalry", scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  // W-D-L is the default: the full record answers "how do these two compare?"
  // without a legend, where a bare win-rate number needs one (S8).
  const [matrixMetric, setMatrixMetric] = useState<"winrate" | "played" | "gd" | "wdl" | "ppm" | "rivalry">("wdl");
  // Ordered (insertion order) so a third tap can replace the OLDEST selection; 0–2 entries.
  const [selectedDuoIds, setSelectedDuoIds] = useState<number[]>([]);
  const [historyModal, setHistoryModal] = useState<HistoryModalState | null>(null);
  const [historyDetails, setHistoryDetails] = useState(false);
  const [rivalryOrder, setRivalryOrder] = useState<"rivalry" | "played">("rivalry");
  const [rivalriesExpanded, setRivalriesExpanded] = useState(false);
  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  // Duos sub-view is only meaningful in 2v2; other modes always show the players view.
  const effectiveSubView: H2HSub = mode === "2v2" ? subView : "players";

  const pairs: StatsH2HPair[] = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    return mode === "1v1" ? d.rivalries_1v1 : mode === "2v2" ? d.rivalries_2v2 : d.rivalries_all;
  }, [q.data, mode]);
  const pairIndex = useMemo(() => {
    const m = new Map<string, StatsH2HPair>();
    for (const p of pairs) m.set([p.a.id, p.b.id].sort((x, y) => x - y).join("-"), p);
    return m;
  }, [pairs]);
  const cell = (rowId: number, colId: number) => {
    const p = pairIndex.get([rowId, colId].sort((x, y) => x - y).join("-"));
    if (!p || p.played === 0) return null;
    const rowIsA = p.a.id === rowId;
    const rowWins = rowIsA ? p.a_wins : p.b_wins;
    const colWins = rowIsA ? p.b_wins : p.a_wins;
    const rowGf = rowIsA ? p.a_gf : p.b_gf;
    const rowGa = rowIsA ? p.a_ga : p.b_ga;
    const ppm = (3 * rowWins + p.draws) / p.played;
    return { pct: (rowWins / p.played) * 100, w: rowWins, d: p.draws, l: colWins, played: p.played, gd: rowGf - rowGa, ppm, rivalry: p.rivalry_score };
  };
  const cellText = (v: { pct: number; played: number; gd: number; w: number; d: number; l: number; ppm: number; rivalry: number }) =>
    matrixMetric === "played" ? String(v.played)
      : matrixMetric === "gd" ? (v.gd >= 0 ? `+${v.gd}` : String(v.gd))
        : matrixMetric === "wdl" ? `${v.w}-${v.d}-${v.l}`
          : matrixMetric === "ppm" ? v.ppm.toFixed(2)
            : matrixMetric === "rivalry" ? String(Math.round(v.rivalry))
              : String(Math.round(v.pct));
  const sortedRivalries = useMemo(
    () => pairs.slice().sort((a, b) => (rivalryOrder === "played" ? b.played - a.played || b.rivalry_score - a.rivalry_score : b.rivalry_score - a.rivalry_score)),
    [pairs, rivalryOrder],
  );
  const topRivalries = rivalriesExpanded ? sortedRivalries : sortedRivalries.slice(0, 8);

  // Precompute normalization ranges for per-metric coloring (and whether any cell
  // is tappable at all — an empty matrix must not advertise a tap).
  const matrixRanges = useMemo(() => {
    let maxPlayed = 1, maxRivalry = 1, maxAbsGd = 1, anyPlayed = false;
    for (const r of rows) {
      for (const c of rows) {
        if (r.id === c.id) continue;
        const v = cell(r.id, c.id);
        if (!v) continue;
        anyPlayed = true;
        maxPlayed = Math.max(maxPlayed, v.played);
        maxRivalry = Math.max(maxRivalry, v.rivalry);
        maxAbsGd = Math.max(maxAbsGd, Math.abs(v.gd));
      }
    }
    return { maxPlayed, maxRivalry, maxAbsGd, anyPlayed };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, rows]);

  const cellColor = (v: ReturnType<typeof cell>): string => {
    if (!v) return "";
    switch (matrixMetric) {
      case "played": return h2hSequential(v.played / matrixRanges.maxPlayed);
      case "rivalry": return h2hSequential(v.rivalry / matrixRanges.maxRivalry);
      case "gd": return h2hDiverging(v.gd, matrixRanges.maxAbsGd);
      default: return h2hTone(v.pct);
    }
  };

  // Per-player detail.
  const detailQ = useQuery({
    queryKey: qk.stats.h2hPlayerDetail(selectedId, scope),
    queryFn: () => getStatsH2H({ playerId: selectedId as number, order: "played", limit: 50, scope }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const vs = useMemo<StatsH2HOpponentRow[]>(() => {
    const d = detailQ.data;
    if (!d) return [];
    return (mode === "1v1" ? d.vs_1v1 : mode === "2v2" ? d.vs_2v2 : d.vs_all) ?? [];
  }, [detailQ.data, mode]);
  const nemesis = mode === "1v1" ? detailQ.data?.nemesis_1v1 : mode === "2v2" ? detailQ.data?.nemesis_2v2 : detailQ.data?.nemesis_all;
  const favorite = mode === "1v1" ? detailQ.data?.favorite_victim_1v1 : mode === "2v2" ? detailQ.data?.favorite_victim_2v2 : detailQ.data?.favorite_victim_all;
  const selName = selectedId != null ? nameById.get(selectedId) ?? "" : "";

  // 2v2 teammate synergy — real duo stats from the backend (with_2v2 when a player is
  // selected, else best_teammates_2v2). No more client-side recomputation.
  const bestDuos: StatsH2HDuo[] = useMemo(() => q.data?.best_teammates_2v2 ?? [], [q.data]);
  const teamRivalries: StatsH2HTeamRivalry[] = q.data?.team_rivalries_2v2 ?? [];
  const synergyDuos: StatsH2HDuo[] = selectedId != null ? (detailQ.data?.with_2v2 ?? []) : bestDuos;

  // A duo needs exactly two players. Look up their real 2v2 record; if they've never
  // played together, synthesize a zeroed duo so DuoDetail still renders gracefully.
  const selectedDuo: StatsH2HDuo | null = useMemo(() => {
    if (selectedDuoIds.length !== 2) return null;
    const [a, b] = selectedDuoIds;
    const found = bestDuos.find((d) => (d.p1.id === a && d.p2.id === b) || (d.p1.id === b && d.p2.id === a));
    if (found) return found;
    return {
      p1: { id: a, display_name: nameById.get(a) ?? String(a) },
      p2: { id: b, display_name: nameById.get(b) ?? String(b) },
      played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0, pts_per_match: 0, win_rate: 0,
    };
  }, [selectedDuoIds, bestDuos, nameById]);
  const selectedDuoUnplayed = selectedDuo != null && selectedDuo.played === 0;
  const selectedDuoKey = selectedDuoIds.length === 2 ? duoKey(selectedDuoIds[0], selectedDuoIds[1]) : null;

  // Picker: tapping toggles a player in/out; a third tap replaces the oldest of two.
  const toggleDuoPlayer = (id: number) =>
    setSelectedDuoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id],
    );

  // Match-history modal (shared by the duo blocks).
  const clubsQ = useQuery({
    queryKey: qk.clubs(),
    queryFn: () => listClubs(),
    enabled: !!historyModal,
    staleTime: 5 * 60_000,
  });
  const historyQ = useQuery({
    queryKey: qk.stats.h2hMatches(
      historyModal?.req.mode ?? "overall",
      historyModal?.req.relation ?? "opposed",
      (historyModal?.req.left_player_ids ?? []).join("-"),
      (historyModal?.req.right_player_ids ?? []).join("-"),
      historyModal?.req.exact_teams ? "exact" : "subset",
      historyModal?.req.scope ?? "tournaments",
    ),
    queryFn: () => getStatsH2HMatches(historyModal!.req),
    enabled: !!historyModal,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });

  const openDuoTeammates = (d: StatsH2HDuo) =>
    setHistoryModal({
      title: `${d.p1.display_name} / ${d.p2.display_name}`,
      req: { mode, relation: "teammates", left_player_ids: [d.p1.id, d.p2.id], right_player_ids: [], scope },
      focusPlayerId: null,
    });
  const openTeamRivalry = (r: StatsH2HTeamRivalry) =>
    setHistoryModal({
      title: `${r.team1.map((p) => p.display_name).join("/")} vs ${r.team2.map((p) => p.display_name).join("/")}`,
      req: { mode, relation: "opposed", left_player_ids: r.team1.map((p) => p.id), right_player_ids: r.team2.map((p) => p.id), exact_teams: true, scope },
      focusPlayerId: r.team1[0]?.id ?? null,
    });

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;

  const matches = (
    <Modal
      open={historyModal !== null}
      title={historyModal?.title ?? ""}
      subtitle="Match history"
      onClose={() => setHistoryModal(null)}
      fullScreenOnMobile
      maxWidth="max-w-4xl"
      scrollBody
      className="max-h-[88vh] overflow-hidden"
    >
      {historyModal !== null && (
        <>
          <div className="mb-3 shrink-0">
            <ChipGroup<"compact" | "details">
              value={historyDetails ? "details" : "compact"}
              onChange={(v) => setHistoryDetails(v === "details")}
              ariaLabel="History details"
              options={[{ key: "compact", label: "Compact" }, { key: "details", label: "Details" }]}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {historyQ.isLoading ? <InlineLoading label="Loading…" /> : null}
            {!historyQ.isLoading && !(historyQ.data?.tournaments?.length ?? 0) ? (
              <EmptyState title="No matches found for this matchup." className="py-2" />
            ) : null}
            {historyQ.data?.tournaments?.length ? (
              <MatchHistoryList
                tournaments={historyQ.data.tournaments}
                focusId={historyModal.focusPlayerId}
                clubs={clubsQ.data ?? []}
                showMeta={historyDetails}
                showModePill={mode === "overall"}
                matchHref={tournamentMatchHref}
              />
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );

  // ── Duos sub-view (2v2 only) ────────────────────────────────────────────────
  if (effectiveSubView === "duos") {
    return (
      <div className="space-y-5">
        <StatsSection label="Pick a duo">
          <DuoPicker
            players={rows.map((r) => ({ id: r.id, name: r.name }))}
            selectedIds={selectedDuoIds}
            onToggle={toggleDuoPlayer}
            onClear={() => setSelectedDuoIds([])}
          />
        </StatsSection>

        <StatsSection label="Best duos" explainer="Strongest pairings across 2v2 matches — tap a duo for detail.">
          <DuoLeaderboard duos={bestDuos} selectedKey={selectedDuoKey} onSelect={(d) => setSelectedDuoIds([d.p1.id, d.p2.id])} />
        </StatsSection>

        {selectedDuo ? (
          <StatsSection label="Duo detail" explainer={selectedDuoUnplayed ? "No 2v2 matches together yet." : undefined}>
            <DuoDetail duo={selectedDuo} rivalries={teamRivalries} onOpenTeammates={openDuoTeammates} onOpenMatchup={openTeamRivalry} />
          </StatsSection>
        ) : null}

        <StatsSection label="Duo rivalries" explainer="Closest duo-vs-duo matchups — more games and a tighter balance score higher.">
          <DuoRivalries rivalries={teamRivalries} onOpenMatches={openTeamRivalry} />
        </StatsSection>

        {matches}
      </div>
    );
  }

  // ── Players sub-view (default for 1v1 / overall, opt-in for 2v2) ─────────────
  return (
    <div className="space-y-5">
      {/* Full-name square matrix */}
      <StatsSection label="Matrix" explainer={mode === "2v2" ? "Per player across 2v2 matches." : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <ChipGroup<"winrate" | "played" | "gd" | "wdl" | "ppm" | "rivalry">
            value={matrixMetric}
            onChange={setMatrixMetric}
            ariaLabel="Matrix metric"
            options={[{ key: "wdl", label: "W-D-L" }, { key: "winrate", label: "Win %" }, { key: "ppm", label: "PPM" }, { key: "played", label: "Played" }, { key: "gd", label: "Goal diff" }, { key: "rivalry", label: "Rivalry" }]}
          />
        </div>
        {/* The cells are buttons (they open the matchup) — say so, because on a
            phone there is no hover to discover it with. */}
        {matrixRanges.anyPlayed ? (
          <p className="text-xs text-text-muted">Tap a cell for every match between two players.</p>
        ) : null}
        <div className="overflow-x-auto" data-no-swipe-nav>
          <table className="border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-default" />
                {rows.map((c) => (
                  <th key={c.id} className="p-0 align-bottom">
                    <div className="mx-auto flex h-24 w-11 items-center justify-center overflow-visible">
                      <span className="-rotate-90 whitespace-nowrap text-xs font-medium text-text-muted">{c.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th className="sticky left-0 z-10 bg-bg-default pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      title={`Show ${r.name}'s head-to-head`}
                      className={"block max-w-[120px] cursor-pointer truncate text-xs font-medium " + (selectedId === r.id ? "text-accent" : "text-text-normal hover:text-accent")}
                    >
                      {r.name}
                    </button>
                  </th>
                  {rows.map((c) => {
                    if (r.id === c.id) return <td key={c.id} className="h-11 w-11 rounded-md bg-bg-card-chip/30" />;
                    const v = cell(r.id, c.id);
                    if (!v) return <td key={c.id} className="h-11 w-11 rounded-md bg-bg-card-chip/15 text-center text-xs text-text-muted">–</td>;
                    return (
                      <td key={c.id}>
                        <button
                          type="button"
                          onClick={() => onOpenMatchup(r.id, c.id)}
                          title={`${r.name} vs ${c.name} — open matches`}
                          aria-label={`${r.name} vs ${c.name}: ${v.w}-${v.d}-${v.l} — open matches`}
                          className={
                            "focus-ring grid h-11 w-11 cursor-pointer place-items-center rounded-md text-xs font-semibold leading-none text-white transition hover:brightness-125 active:scale-[0.97] " +
                            (matrixMetric === "wdl" ? "tracking-tight" : "")
                          }
                          style={{ backgroundColor: cellColor(v) }}
                        >
                          {cellText(v)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatsSection>

      {/* Per-player detail */}
      <StatsSection label="Head-to-head by player">
        <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selectedId} onSelect={onSelect} />
        {selectedId == null ? (
          <EmptyState title="Pick a player." className="py-2" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <RivalCard icon={<Smile size={14} aria-hidden="true" />} label="Favorite" row={favorite ?? null} onOpen={(id) => onOpenMatchup(selectedId, id)} />
              <RivalCard icon={<HeartCrack size={14} aria-hidden="true" />} label="Nemesis" row={nemesis ?? null} onOpen={(id) => onOpenMatchup(selectedId, id)} />
            </div>
            {detailQ.isLoading && !detailQ.data ? (
              <InlineLoading label="Loading…" />
            ) : vs.length ? (
              <div className="list-divided">
                {vs.map((o) => (
                  /* The row opens the matchup (stretched button); the opponent's name
                     opens their profile — two targets, never a nested link. */
                  <div key={o.opponent.id} className="row row-tap relative">
                    <button
                      type="button"
                      onClick={() => onOpenMatchup(selectedId, o.opponent.id)}
                      aria-label={`All matches against ${o.opponent.display_name}`}
                      className="absolute inset-0 z-0 rounded-xl focus-ring"
                    />
                    <span className="pointer-events-none relative z-10 flex w-full items-center gap-3">
                      <span className="min-w-0 flex-1">
                        {/* The link hugs the name so the rest of the row stays the matchup. */}
                        <PlayerLink playerId={o.opponent.id} name={o.opponent.display_name} className="pointer-events-auto inline-block max-w-full">
                          <span className="block truncate text-sm text-text-normal">{o.opponent.display_name}</span>
                        </PlayerLink>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                        {o.played}P · <span className="text-win">{o.wins}</span>-<span className="text-draw">{o.draws}</span>-<span className="text-loss">{o.losses}</span>
                      </span>
                      <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{o.played ? Math.round(o.win_rate * 100) : 0}%</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title={`No head-to-head matches for ${selName}.`} className="py-2" />
            )}
          </>
        )}
      </StatsSection>

      {/* Teammate synergy (2v2) — real duo stats from the backend. */}
      {mode === "2v2" ? (
        <StatsSection
          label="Teammate synergy"
          explainer={selectedId != null
            ? `How ${selName} performs with each partner (points per match as a duo).`
            : "Strongest 2v2 pairings (points per match as a duo)."}
        >
          {selectedId != null && detailQ.isLoading && !detailQ.data ? (
            <InlineLoading label="Loading…" />
          ) : synergyDuos.length ? (
            <>
              <div className="space-y-2">
                {synergyDuos.map((d) => (
                  <DuoRow
                    key={`syn-${duoKey(d.p1.id, d.p2.id)}`}
                    r={d}
                    focusPlayerId={selectedId}
                    onOpenMatches={openDuoTeammates}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="No 2v2 matches with a partner yet." className="py-2" />
          )}
        </StatsSection>
      ) : null}

      {/* Top rivalries (player-based in this sub-view) */}
      <StatsSection
        label="Top rivalries"
        explainer="Most-played and closest matchups — a higher rivalry score means more games and a tighter win balance."
        action={sortedRivalries.length > 8 ? (
          <Button variant="ghost" size="sm" onClick={() => setRivalriesExpanded((v) => !v)}>
            {rivalriesExpanded ? "Top 8" : "Show all"}
          </Button>
        ) : null}
      >
        <ChipGroup<"rivalry" | "played">
          value={rivalryOrder}
          onChange={setRivalryOrder}
          ariaLabel="Rivalry order"
          options={[{ key: "rivalry", label: "Rivalry" }, { key: "played", label: "Played" }]}
        />
        {topRivalries.map((p) => (
          <button key={`${p.a.id}-${p.b.id}`} type="button" onClick={() => onOpenMatchup(p.a.id, p.b.id)}
            className="inset flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-hover-default/30">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-normal">
                {nameById.get(p.a.id) ?? p.a.display_name} <span className="text-text-muted">vs</span> {nameById.get(p.b.id) ?? p.b.display_name}
              </div>
              <div className="text-xs text-text-muted">{p.played} matches · {p.a_wins}-{p.draws}-{p.b_wins}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold tabular-nums text-accent">{Math.round(p.rivalry_score)}</div>
              <div className="text-xs text-text-muted">rivalry</div>
            </div>
          </button>
        ))}
        {!topRivalries.length ? <EmptyState title="No rivalries yet." className="py-2" /> : null}
      </StatsSection>

      {matches}
    </div>
  );
}
