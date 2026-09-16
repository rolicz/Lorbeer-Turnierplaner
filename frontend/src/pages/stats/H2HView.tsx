/** H2H section — full matrix, per-player detail, teammate synergy and rivalries.
 *  In 2v2 mode the Players | Duos sub-view chips (owned by StatsInsights) expose the
 *  backend's real duo stats (best_teammates_2v2 / team_rivalries_2v2) instead of a
 *  client-side recompute. The selected player is shared with the other sections. */
import { HeartCrack, Smile } from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import Modal from "../../ui/primitives/Modal";
import PlayerLink from "../../ui/primitives/PlayerLink";
import RecordLine, { recordWidths, type RecordWidths } from "../../ui/primitives/RecordLine";
import { getStatsH2H, getStatsH2HMatches, type StatsH2HMatchesRequest } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { ChipGroup } from "../../ui/primitives/Chip";
import { PlayerPicker } from "./PlayerPicker";
import StatsSection from "./StatsSection";
import { MatchHistoryList, tournamentMatchHref } from "./MatchHistoryList";
import { DuoRow } from "./HeadToHeadRows";
import { duoKey } from "./h2hHelpers";
import { MATRIX_GAP, matrixCellSize, matrixFits } from "./microGrid";
import { useStickyTop } from "../../ui/shell/useStickyTop";
import { DuoLeaderboard } from "./h2h/DuoLeaderboard";
import { DuoPicker } from "./h2h/DuoPicker";
import { DuoRivalries } from "./h2h/DuoRivalries";
import { DuoDetail } from "./h2h/DuoDetail";
import type { Row } from "./standings";
import type { H2HSub } from "./statsNav";
import type { StatsMode } from "./statsMode";
import type { StatsScope, StatsH2HPair, StatsH2HOpponentRow, StatsH2HDuo, StatsH2HTeamRivalry } from "../../api/types";

/** A matrix cell's colour, as the two inputs the shared micro-tile ramp takes
 *  (`.h2h-cell` in `styles.css`, the positions grid's mechanism — DESIGN.md §4):
 *  a hue that carries the meaning and a 0..1 strength. The ramp itself, and the ink
 *  that reads on it in each theme, belong to the stylesheet — a component that mixes
 *  its own HSL has no way to know it is being painted on a light page. */
const H2H_HUE_LOSS = 0; // red
const H2H_HUE_WIN = 120; // green
const H2H_HUE_NEUTRAL = 210; // blue: a magnitude, not a verdict
/** Win-rate paints with the hue alone, so those cells all carry the same weight. */
const H2H_VERDICT_STRENGTH = 0.7;

function rampStyle(hue: number, strength: number): CSSProperties {
  const t = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0));
  return { "--h2h-h": `${Math.round(hue)}deg`, "--h2h-t": t.toFixed(2) } as CSSProperties;
}

type HistoryModalState = { title: string; req: StatsH2HMatchesRequest; focusPlayerId: number | null };

/** Favorite / Nemesis chip — taps into the matchup when the opponent is known. */
function RivalCard({ icon, label, row, widths, onOpen }: {
  icon: ReactNode; label: string; row: StatsH2HOpponentRow | null; widths: RecordWidths; onOpen: (opponentId: number) => void;
}) {
  const body = (
    <>
      <div className="inline-flex items-center gap-2 text-text-muted">{icon}<span>{label}</span></div>
      <div className="mt-0.5 font-semibold">{row?.opponent.display_name ?? "—"}</div>
      {row ? (
        <RecordLine
          wins={row.wins}
          draws={row.draws}
          losses={row.losses}
          widths={widths}
          extra={`${row.pts_per_match.toFixed(2)} ppm`}
          className="mt-0.5 text-text-muted"
        />
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

  /**
   * Matrix geometry (R1b). The cell edge is computed, never fixed: it is what the scroll
   * box has left once the sticky name column is paid for, clamped by `matrixCellSize`.
   *
   * Both inputs are **measured**. The name column is content-sized (a `truncate` capped at
   * 120px), so this player set's five short names hand the tiles the ~60px a hard-coded
   * 120 would have thrown away — and a long name still gets its room instead of eating
   * into the cells. Nothing in that column depends on the cell size, so measuring one to
   * size the other cannot oscillate; only the box is observed for resizes, and the name
   * column is re-read with it.
   */
  const matrixBoxRef = useRef<HTMLDivElement | null>(null);
  const nameColRef = useRef<HTMLTableCellElement | null>(null);
  const matrixRoRef = useRef<ResizeObserver | null>(null);
  const [matrixBox, setMatrixBox] = useState({ boxW: 0, nameW: 0 });
  const measureMatrix = useCallback(() => {
    const boxW = matrixBoxRef.current?.clientWidth ?? 0;
    const nameW = nameColRef.current?.getBoundingClientRect().width ?? 0;
    setMatrixBox((prev) => (prev.boxW === boxW && prev.nameW === nameW ? prev : { boxW, nameW }));
  }, []);
  /* A callback ref, not a dependency array: the matrix leaves the DOM entirely whenever
     the Duos sub-view is up, and `rows` does not change when it comes back — an effect
     keyed on the data would hand the returning table a stale zero and leave it at the
     floor until the next window resize. Tying the measurement to the element's life
     cannot go stale. */
  const attachMatrixBox = useCallback((el: HTMLDivElement | null) => {
    matrixBoxRef.current = el;
    matrixRoRef.current?.disconnect();
    matrixRoRef.current = null;
    if (!el) return;
    measureMatrix();
    // jsdom has no ResizeObserver; the measurement above is enough there.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measureMatrix);
    ro.observe(el);
    matrixRoRef.current = ro;
  }, [measureMatrix]);
  useEffect(() => () => matrixRoRef.current?.disconnect(), []);
  // The name column is content-sized, so a different player set can resize it without the
  // box ever changing: re-read both whenever the rows change.
  useLayoutEffect(measureMatrix, [measureMatrix, rows]);
  const matrixCell = matrixCellSize(matrixBox.boxW, matrixBox.nameW, rows.length);
  /* Below the floor the table is wider than its box and needs a scroll box again — and a
     box with `overflow-x` set is a scroll container in *both* axes, which is exactly what
     stops the column headers below from sticking to the page (Q3). So the box exists only
     when it is earning its keep, and `data-no-swipe-nav` with it: without a scroller there
     is no scroll edge to protect, and a swipe over the matrix should navigate like a swipe
     anywhere else. */
  const matrixScrolls = !matrixFits(matrixBox.boxW, matrixBox.nameW, rows.length);
  /* The header docks under the mobile top bar and rides to the top when it auto-hides;
     0 on desktop, where there is no bar. */
  const stickyTop = useStickyTop();

  const cellRamp = (v: ReturnType<typeof cell>): CSSProperties => {
    if (!v) return {};
    switch (matrixMetric) {
      case "played": return rampStyle(H2H_HUE_NEUTRAL, v.played / matrixRanges.maxPlayed);
      case "rivalry": return rampStyle(H2H_HUE_NEUTRAL, v.rivalry / matrixRanges.maxRivalry);
      case "gd": {
        if (matrixRanges.maxAbsGd === 0) return rampStyle(H2H_HUE_NEUTRAL, 0);
        const t = Math.max(-1, Math.min(1, v.gd / matrixRanges.maxAbsGd));
        return rampStyle(t >= 0 ? H2H_HUE_WIN : H2H_HUE_LOSS, Math.abs(t));
      }
      // Win %, W-D-L and PPM all read the same tone: red at 0%, green at 100%.
      default: return rampStyle((Math.max(0, Math.min(100, v.pct)) / 100) * H2H_HUE_WIN, H2H_VERDICT_STRENGTH);
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

  // One set of column widths per list, so the meta lines line up down the list (T14).
  const vsWidths = useMemo(() => recordWidths(vs), [vs]);
  const rivalWidths = useMemo(() => recordWidths([favorite ?? null, nemesis ?? null]), [favorite, nemesis]);
  const synergyWidths = recordWidths(synergyDuos);
  const rivalryWidths = useMemo(
    () => recordWidths(topRivalries.map((p) => ({ played: p.played, wins: p.a_wins, draws: p.draws, losses: p.b_wins }))),
    [topRivalries],
  );

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
        <div ref={attachMatrixBox} className={matrixScrolls ? "overflow-x-auto" : undefined} data-no-swipe-nav={matrixScrolls ? true : undefined}>
          {/* `mx-auto` centres the table once the ceiling caps it — every realistic count
              on desktop. It is not a second layout: when the floor makes the table wider
              than the box, the over-constrained auto margins resolve to 0, so the matrix
              goes back to starting at x=0 and the box scrolls from its first column. */}
          <table className="mx-auto border-separate" style={{ borderSpacing: MATRIX_GAP }}>
            <thead>
              <tr>
                {/* The corner is sticky in both axes: `left` for the (rare) sideways
                    scroll, `top` so the rotated names stay on screen while the rows
                    below them scroll past. z stays under the app's top bar (z-30). */}
                <th style={{ top: stickyTop }} className="sticky left-0 z-20 bg-bg-default transition-[top] duration-300 ease-out-expo" />
                {rows.map((c) => (
                  <th key={c.id} style={{ top: stickyTop }} className="sticky z-10 bg-bg-default p-0 align-bottom transition-[top] duration-300 ease-out-expo">
                    {/* The block's *width* follows the cell; its height does not. A rotated
                        label's vertical extent is the length of the name, which the cell
                        width has nothing to say about — and an elastic height would make
                        the whole matrix jump up and down as the Mode filter changes the
                        player set. 96px is the budget for the longest name. */}
                    <div className="mx-auto flex h-24 items-center justify-center overflow-visible" style={{ width: matrixCell }}>
                      <span className="-rotate-90 whitespace-nowrap text-xs font-medium text-text-muted">{c.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <th ref={i === 0 ? nameColRef : undefined} className="sticky left-0 z-10 bg-bg-default pr-2 text-right">
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
                    const box = { width: matrixCell, height: matrixCell };
                    // `p-0`: a `<td>` carries 1px of user-agent padding, which made every
                    // column two pixels wider than it asked to be — invisible while the
                    // cell was a fixed 44, fatal to arithmetic that has to add up to the
                    // box's width. The gutter is now `border-spacing` and nothing else.
                    if (r.id === c.id) return <td key={c.id} style={box} className="p-0 rounded-md bg-bg-card-chip/30" />;
                    const v = cell(r.id, c.id);
                    if (!v) return <td key={c.id} style={box} className="p-0 rounded-md bg-bg-card-chip/15 text-center text-xs text-text-muted">–</td>;
                    return (
                      <td key={c.id} style={box} className="p-0">
                        <button
                          type="button"
                          onClick={() => onOpenMatchup(r.id, c.id)}
                          title={`${r.name} vs ${c.name} — open matches`}
                          aria-label={`${r.name} vs ${c.name}: ${v.w}-${v.d}-${v.l} — open matches`}
                          className={
                            "h2h-cell focus-ring grid cursor-pointer place-items-center rounded-md text-xs font-semibold leading-none transition active:scale-[0.97] " +
                            (matrixMetric === "wdl" ? "tracking-tight" : "")
                          }
                          style={{ ...cellRamp(v), ...box }}
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
              <RivalCard icon={<Smile size={14} aria-hidden="true" />} label="Favorite" row={favorite ?? null} widths={rivalWidths} onOpen={(id) => onOpenMatchup(selectedId, id)} />
              <RivalCard icon={<HeartCrack size={14} aria-hidden="true" />} label="Nemesis" row={nemesis ?? null} widths={rivalWidths} onOpen={(id) => onOpenMatchup(selectedId, id)} />
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
                      <RecordLine
                        played={o.played}
                        wins={o.wins}
                        draws={o.draws}
                        losses={o.losses}
                        widths={vsWidths}
                        className="shrink-0 font-mono text-xs text-text-muted"
                      />
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
                    widths={synergyWidths}
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
              <RecordLine
                played={p.played}
                wins={p.a_wins}
                draws={p.draws}
                losses={p.b_wins}
                widths={rivalryWidths}
                playedLabel="matches"
                className="text-xs text-text-muted"
              />
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
