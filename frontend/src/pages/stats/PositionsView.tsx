/** Positions tab — players × tournaments grid with cup-lineage overlay. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { Clock, Crown, Flag } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import PlayerLink from "../../ui/primitives/PlayerLink";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsPlayers } from "../../api/stats.api";
import { getCup, listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { fmtRank } from "../../utils/format";
import StatsSection from "./StatsSection";
import { InfoButton } from "./explainers";
import { POS_CELL_H, POS_GAP, POS_HEADER_H, positionsGridWidths } from "./microGrid";
import { useStickyTop } from "../../ui/shell/useStickyTop";
import type { StatsMode } from "./statsMode";

/** What the cell colours, the "—" tile, the cup lineage and the column shading mean. */
function InfoLegend({ cups }: { cups: { key: string; name: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2">
          <Flag size={12} aria-hidden="true" />
          Tournament positions
        </span>

        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-md border pos-best" />
          <span>best</span>
          <span className="h-2.5 w-2.5 rounded-md border pos-mid" />
          <span className="h-2.5 w-2.5 rounded-md border pos-bad" />
          <span className="h-2.5 w-2.5 rounded-md border pos-worst" />
          <span>worst</span>
        </span>

        <span className="inline-flex items-center gap-2">
          <span className="pos-none inline-flex h-6 w-7 items-center justify-center rounded-md border text-xs font-mono tabular-nums">
            —
          </span>
          <span>not played</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="pos-winner inline-flex h-6 w-7 items-center justify-center rounded-md border text-xs font-mono tabular-nums">
            1
          </span>
          <span>winner</span>
        </span>
        {cups.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-2">
            {/* The swatch is the line itself — a diagonal hop, drawn with the stroke and
                the cap the grid uses, because a vertical bar would promise the rails the
                lineage stopped being. */}
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <line x1="1.5" y1="10.5" x2="14.5" y2="1.5" stroke={c.color} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
            </svg>
            <span>held the {c.name}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2">
          <Clock size={12} aria-hidden="true" />
          <span>Old</span>
        </span>
        <div className="h-2 w-20 rounded-full border border-border-card-inner bg-gradient-to-r from-bg-card-chip to-bg-card-inner" />
        <span className="inline-flex items-center gap-2">
          <span>New</span>
          <Clock size={12} className="text-text-normal" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

export default function PositionsView({ mode }: { mode: StatsMode }) {
  const q = useQuery({
    queryKey: qk.stats.players(mode, "positions"),
    queryFn: () => getStatsPlayers({ mode }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  // Always-overall counts for the "N tournaments · N× 1v1 · N× 2v2" line — independent of
  // the active Mode filter. Keyed identically to the main query when mode is already
  // "overall" so react-query dedupes the request.
  const overallQ = useQuery({
    queryKey: qk.stats.players("overall", "positions"),
    queryFn: () => getStatsPlayers({ mode: "overall" }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const modeCounts = useMemo(() => {
    const ts = overallQ.data?.tournaments ?? [];
    const counts = new Map<string, number>();
    for (const t of ts) counts.set(t.mode, (counts.get(t.mode) ?? 0) + 1);
    return { total: ts.length, byMode: counts };
  }, [overallQ.data]);
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  // Include the main (default-keyed, gold) cup too — it has its own lineage line.
  const cupDefs = useMemo(() => defsQ.data?.cups ?? [], [defsQ.data]);
  const cupsQ = useQueries({ queries: cupDefs.map((c) => ({ queryKey: qk.cup(c.key), queryFn: () => getCup(c.key), staleTime: 30_000 })) });

  const players = useMemo(() => (q.data?.players ?? []).slice().sort((a, b) => b.pts - a.pts), [q.data]);
  const tournaments = useMemo(
    () => (q.data?.tournaments ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)),
    [q.data],
  );

  // Custom (drag-reorderable) column order; null = default (pts desc). Reset on mode.
  const baseOrder = useMemo(() => players.map((p) => p.player_id), [players]);
  const [order, setOrder] = useState<number[] | null>(null);
  const [legend, setLegend] = useState(false);
  useEffect(() => { setOrder(null); }, [mode]);
  const orderedPlayers = useMemo(() => {
    const byId = new Map(players.map((p) => [p.player_id, p]));
    const ids = order ?? baseOrder;
    const out = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    for (const p of players) if (!ids.includes(p.player_id)) out.push(p); // any new players
    return out;
  }, [order, baseOrder, players]);
  const colByPlayer = useMemo(() => new Map(orderedPlayers.map((p, j) => [p.player_id, j])), [orderedPlayers]);
  const cupColor = (key: string) => rgbFromCssVar(cupColorVarForKey(key));

  // Pointer-based column drag (works on touch).
  const dragRef = useRef<number | null>(null);
  // A column header is both a drag handle and a link to the player's profile: a
  // pointer that actually moved is a drag, and its click must not navigate.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const onColDown = (e: React.PointerEvent, pid: number) => {
    dragRef.current = pid; setDragId(pid); setOverId(pid);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
    // Pointer capture is taken on the first real move, not here: a captured pointer
    // retargets the following click to this element, which would swallow the tap on
    // the header's profile link.
  };
  const onColMove = (e: React.PointerEvent) => {
    if (dragRef.current == null) return;
    const start = dragStartRef.current;
    if (start && !draggedRef.current && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      draggedRef.current = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-col-pid]");
    const pid = cell?.getAttribute("data-col-pid");
    if (pid) setOverId(Number(pid));
  };
  const onColUp = () => {
    const src = dragRef.current;
    const dst = overId;
    dragRef.current = null; setDragId(null); setOverId(null);
    if (src == null || dst == null || src === dst) return;
    const ids = (order ?? baseOrder).slice();
    const from = ids.indexOf(src);
    const to = ids.indexOf(dst);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, src);
    setOrder(ids);
  };

  // Per-cup owner-after-tournament timeline, reconstructed from transfer history.
  const ownerByCup = useMemo(() => {
    const out = new Map<string, Map<number, number>>();
    const chrono = (q.data?.tournaments ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    cupDefs.forEach((def, ci) => {
      const data = cupsQ[ci]?.data;
      if (!data) return;
      const hist = (data.history ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.tournament_id - b.tournament_id));
      const transfers = new Map<number, number>();
      for (const h of hist) if (h.to?.id && h.to.id > 0) transfers.set(h.tournament_id, h.to.id);
      let owner: number | null = hist[0]?.from?.id && hist[0].from.id > 0 ? hist[0].from.id : data.owner?.id ?? null;
      if (owner != null && owner <= 0) owner = null;
      const at = new Map<number, number>();
      for (const t of chrono) {
        if (transfers.has(t.id)) owner = transfers.get(t.id)!;
        if (owner != null && owner > 0) at.set(t.id, owner);
      }
      out.set(def.key, at);
    });
    return out;
  }, [cupDefs, cupsQ, q.data?.tournaments]);

  /**
   * Grid geometry (Q3). The column widths are **measured**, not fixed: the grid takes the
   * width the page gives it (`positionsGridWidths`), so it needs no `overflow-x-auto` box
   * — and without that box the header can stick to the page instead of to a wrapper that
   * never scrolls. The overlay below is still positioned analytically; it just reads the
   * same two numbers the grid tracks are built from.
   *
   * Only the box is observed. Nothing inside the grid feeds back into its width (every
   * track is an explicit pixel value), so there is no loop to get into.
   */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const boxRoRef = useRef<ResizeObserver | null>(null);
  const [boxW, setBoxW] = useState(0);
  const measureBox = useCallback(() => {
    const w = boxRef.current?.clientWidth ?? 0;
    setBoxW((prev) => (prev === w ? prev : w));
  }, []);
  /* A callback ref, not a dependency array: this view unmounts whenever another stats
     sub-view is up and comes back with unchanged data, so an effect keyed on the data
     would hand the returning grid a stale zero (R1b hit the same thing on the matrix). */
  const attachBox = useCallback((el: HTMLDivElement | null) => {
    boxRef.current = el;
    boxRoRef.current?.disconnect();
    boxRoRef.current = null;
    if (!el) return;
    measureBox();
    if (typeof ResizeObserver === "undefined") return; // jsdom: the read above is enough
    const ro = new ResizeObserver(measureBox);
    ro.observe(el);
    boxRoRef.current = ro;
  }, [measureBox]);
  useEffect(() => () => boxRoRef.current?.disconnect(), []);
  /* The header docks under the mobile top bar and rides to the very top when that bar
     auto-hides; on desktop there is no bar and this is 0. */
  const stickyTop = useStickyTop();

  const { nameW, cellW, gridW, fits } = positionsGridWidths(boxW, orderedPlayers.length);
  const headerH = POS_HEADER_H, cellH = POS_CELL_H, gap = POS_GAP;
  const gridH = headerH + gap + tournaments.length * (cellH + gap);
  const colX = (j: number) => nameW + gap + j * (cellW + gap) + cellW / 2;
  const rowY = (i: number) => headerH + gap + i * (cellH + gap) + cellH / 2;
  /**
   * The cup's lineage is a line from the holder's cell to the holder's cell — the
   * diagonal hop *is* the handover, which is why Roli wanted it back after A7
   * replaced it (first with a gutter path that jogged sideways and read as brackets
   * drawn around random blocks of cells, then with straight rails that said nothing
   * about movement at all).
   *
   * It no longer strikes through the numbers, because it is painted **under** the
   * tiles rather than over them: a tile is `hsl(... / 0.22)`, so the line still
   * reads through it, while the digit and the crown sit on top untouched. That also
   * settles the second half of A7's complaint — crossing a cell of a tournament the
   * holder never played is fine when the line passes behind it.
   *
   * Rows where the cup was not at stake are skipped, so one segment can span several
   * rows; each cup gets its own 3px-wide lane through the cell centres, so the two
   * lines run parallel instead of one hiding the other while a single player holds both.
   */
  const laneX = (ci: number) => (cupDefs.length < 2 ? 0 : (ci - (cupDefs.length - 1) / 2) * 3);

  const laurelPolylines = useMemo(() => {
    return cupDefs
      .map((def, ci) => {
        const at = ownerByCup.get(def.key);
        const pts: string[] = [];
        tournaments.forEach((t, i) => {
          if (!at || !(t.cup_stakes ?? []).some((s) => s.key === def.key)) return;
          const owner = at.get(t.id);
          if (owner == null) return;
          const j = colByPlayer.get(owner);
          if (j == null) return;
          pts.push(`${colX(j) + laneX(ci)},${rowY(i)}`);
        });
        return { key: def.key, color: cupColor(def.key), pts: pts.join(" ") };
      })
      .filter((l) => l.pts.includes(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupDefs, ownerByCup, tournaments, colByPlayer, players.length, nameW, cellW]);

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  if (!tournaments.length) return <EmptyState title="No tournaments yet." className="py-6" />;

  return (
    <StatsSection
      label="Tournament positions"
      explainer="Drag a player's icon to reorder the columns."
      action={<InfoButton on={legend} onClick={() => setLegend((v) => !v)} label="What the colours mean" />}
    >
      {legend ? <InfoLegend cups={cupDefs.map((d) => ({ key: d.key, name: d.name, color: cupColor(d.key) }))} /> : null}
      {modeCounts.total > 0 ? (
        <div className="text-xs text-text-muted">
          {modeCounts.total} tournament{modeCounts.total === 1 ? "" : "s"}
          {["1v1", "2v2", ...Array.from(modeCounts.byMode.keys()).filter((m) => m !== "1v1" && m !== "2v2")]
            .filter((m) => (modeCounts.byMode.get(m) ?? 0) > 0)
            .map((m) => ` · ${modeCounts.byMode.get(m)}× ${m}`)
            .join("")}
        </div>
      ) : null}
      {/* The scroll box exists **only** when the grid cannot fit (`fits === false`), because
          a box with `overflow-x` set is a scroll container in both axes and would take the
          sticky header's page-scrolling away from it. `data-no-swipe-nav` is unconditional:
          it is not here for the scroller but for the column drag, whose horizontal pointer
          travel would otherwise read as a swipe-back gesture. */}
      <div ref={attachBox} className={fits ? undefined : "overflow-x-auto"} data-no-swipe-nav>
        {/* `mx-auto` centres the grid once the name column and the tiles are both at their
            ceiling — every realistic count on desktop. When it does not fit, the
            over-constrained auto margins resolve to 0 and the box scrolls from column 1. */}
        <div className="relative mx-auto" style={{ width: gridW }}>
          {/* Before the grid on purpose: both are positioned with `z-index: auto`, so DOM
              order decides which paints on top, and the lineage has to go underneath. */}
          {laurelPolylines.length ? (
            <svg className="pointer-events-none absolute left-0 top-0" width={gridW} height={gridH} aria-hidden="true">
              {laurelPolylines.map((l) => (
                <polyline key={l.key} points={l.pts} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              ))}
            </svg>
          ) : null}
          <div
            className="relative"
            style={{ display: "grid", gridTemplateColumns: `${nameW}px repeat(${orderedPlayers.length}, ${cellW}px)`, columnGap: gap, rowGap: gap }}
          >
            {/* The corner: sticky in both axes, and the one cell that has to beat the
                name column (z-10). Nothing in the grid goes above z-20 — the app's top
                bar is z-30 and must stay in front while the two cross during its
                auto-hide transition. */}
            <div style={{ height: headerH, top: stickyTop }} className="sticky left-0 z-20 bg-bg-default transition-[top] duration-300 ease-out-expo" />
            {orderedPlayers.map((p) => {
              const isDragging = dragId === p.player_id;
              const isOver = dragId != null && overId === p.player_id && !isDragging;
              return (
                <div
                  key={p.player_id}
                  data-col-pid={p.player_id}
                  onPointerDown={(e) => onColDown(e, p.player_id)}
                  onPointerMove={onColMove}
                  onPointerUp={onColUp}
                  /* `-gap` margin + `gap` padding: the header must be an unbroken opaque
                     band, or the cup lineage (an SVG across the whole grid, rows included)
                     shows through the 4px column gutters while the rows scroll behind it.
                     The negative margin makes each cell cover the gutter to its left; the
                     matching padding puts its content box back on the track, so the avatars
                     stay centred over their columns. */
                  style={{ height: headerH, top: stickyTop, marginLeft: -gap, paddingLeft: gap }}
                  className={
                    /* No `rounded-t` on the resting cell: its 4px corner notches are holes
                       in a band that now really is pinned, and the grid — tiles and cup
                       lineage — shows through them. The radius comes back with the drop
                       ring, which is a surface of its own rather than a hole in this one. */
                    "sticky z-20 flex cursor-grab touch-none select-none flex-col items-center justify-end gap-1 pb-1 bg-bg-default transition-[top] duration-300 ease-out-expo " +
                    (isDragging ? "opacity-40" : isOver ? "rounded-t ring-2 ring-accent ring-inset" : "")
                  }
                  title="Drag to reorder"
                >
                  <PlayerLink
                    playerId={p.player_id}
                    name={p.display_name}
                    title={`Open ${p.display_name}'s profile · drag to reorder`}
                    className="flex w-full flex-col items-center gap-1"
                    onClick={(e) => { if (draggedRef.current) e.preventDefault(); }}
                  >
                    <AvatarCircle playerId={p.player_id} name={p.display_name} updatedAt={avatarUpdatedAtById.get(p.player_id) ?? null} sizeClass="h-6 w-6" />
                    <span className="w-full truncate text-center text-xs text-text-muted">{p.display_name}</span>
                  </PlayerLink>
                </div>
              );
            })}
            {tournaments.map((t) => {
              const noWinner = t.status === "done" && t.winner_player_id == null;
              const showModePill = mode === "overall";
              return (
              <Fragment key={t.id}>
                {/* `sticky left-0`: inert while the grid fits (nothing scrolls it), and the
                    thing that keeps the rows identifiable past the boundary, where the box
                    scrolls sideways again. `z-10` puts it over the tiles and the lineage
                    but under the header, which owns the corner. */}
                <div
                  /* Same trick as the header, one axis over: the column is an unbroken
                     opaque band, so the cup lineage cannot show through the 4px row gaps
                     while the grid is scrolled sideways behind it. The extra height is
                     eaten by the negative margin, so the row track stays `cellH` and the
                     padding puts the content box back exactly on it. */
                  style={{ height: cellH + gap, marginTop: -gap, paddingTop: gap }}
                  className="sticky left-0 z-10 flex flex-col justify-center gap-0.5 bg-bg-default pr-1.5"
                >
                  <Link
                    to={`/live/${t.id}`}
                    title={`${t.name}${showModePill ? ` · ${t.mode}` : ""}${noWinner ? " · kein eindeutiger Sieger" : ""} — open tournament`}
                    className="block min-w-0 truncate text-xs leading-tight text-text-normal no-underline transition hover:text-accent"
                  >
                    {t.name}
                  </Link>
                  {showModePill || noWinner ? (
                    <span className="flex items-center gap-1">
                      {showModePill ? (
                        <span
                          className="rounded-full bg-bg-card-chip/60 px-1 text-micro leading-tight text-text-muted"
                          title={`Mode: ${t.mode}`}
                        >
                          {t.mode}
                        </span>
                      ) : null}
                      {noWinner ? (
                        <span
                          className="rounded-full bg-bg-card-chip/60 px-1 text-micro leading-tight text-text-muted"
                          title="Kein eindeutiger Sieger"
                          aria-label="Kein eindeutiger Sieger"
                        >
                          =
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {orderedPlayers.map((p) => {
                  const pos = p.positions_by_tournament?.[String(t.id)];
                  if (pos == null)
                    return <div key={p.player_id} style={{ height: cellH }} className="grid place-items-center rounded-md bg-bg-card-chip/15 text-xs text-text-muted">·</div>;
                  const total = t.players_count || 1;
                  const frac = total > 1 ? (pos - 1) / (total - 1) : 0;
                  const stakes = t.cup_stakes ?? [];
                  const isWinner = pos === 1 && t.winner_player_id === p.player_id;
                  return (
                    <Link
                      key={p.player_id}
                      to={`/live/${t.id}`}
                      style={{ height: cellH, ["--pos-p"]: frac } as React.CSSProperties}
                      className="pos-tile relative grid place-items-center rounded-md border text-xs font-semibold tabular-nums no-underline transition hover:z-10 hover:ring-2 hover:ring-inset hover:ring-accent/70"
                      title={`${p.display_name} · ${t.name}: ${fmtRank(pos, total)}${isWinner && stakes.length ? ` · won ${stakes.map((s) => s.name).join(", ")}` : ""}${pos === 1 && t.status === "done" && t.winner_player_id == null ? " · kein eindeutiger Sieger" : ""} — open tournament`}
                    >
                      {isWinner && stakes.length ? (
                        <span className="absolute right-0.5 top-0.5 inline-flex gap-px">
                          {stakes.map((s) => (
                            <Crown key={s.key} size={9} fill="currentColor" style={{ color: cupColor(s.key) }} aria-hidden="true" />
                          ))}
                        </span>
                      ) : null}
                      {pos}
                    </Link>
                  );
                })}
              </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </StatsSection>
  );
}
