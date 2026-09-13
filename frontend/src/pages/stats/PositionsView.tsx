/** Positions tab — players × tournaments grid with cup-lineage overlay. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { useCupHolders } from "../../hooks/useCupHolders";
import { fmtRank } from "../../utils/format";
import StatsSection from "./StatsSection";
import { InfoButton } from "./explainers";
import type { StatsMode } from "./statsMode";

/** What the cell colours, the "—" tile and the column shading mean. */
function InfoLegend() {
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
  const { cupsHeldByPlayerId } = useCupHolders();
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

  // Grid geometry (fixed sizes so the overlay line can be positioned analytically).
  const nameW = 128, headerH = 60, cellW = 40, cellH = 42, gap = 4;
  const gridW = nameW + players.length * (cellW + gap);
  const gridH = headerH + gap + tournaments.length * (cellH + gap);
  const colX = (j: number) => nameW + gap + j * (cellW + gap) + cellW / 2;
  const rowY = (i: number) => headerH + gap + i * (cellH + gap) + cellH / 2;

  const laurelPolylines = useMemo(() => {
    return cupDefs
      .map((def) => {
        const at = ownerByCup.get(def.key);
        const pts: string[] = [];
        tournaments.forEach((t, i) => {
          if (!at || !(t.cup_stakes ?? []).some((s) => s.key === def.key)) return;
          const owner = at.get(t.id);
          if (owner == null) return;
          const j = colByPlayer.get(owner);
          if (j == null) return;
          pts.push(`${colX(j)},${rowY(i)}`);
        });
        return { key: def.key, color: cupColor(def.key), pts: pts.join(" ") };
      })
      .filter((l) => l.pts.includes(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupDefs, ownerByCup, tournaments, colByPlayer, players.length]);

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  if (!tournaments.length) return <EmptyState title="No tournaments yet." className="py-6" />;

  return (
    <StatsSection
      label="Tournament positions"
      explainer="Drag a player's icon to reorder the columns."
      action={<InfoButton on={legend} onClick={() => setLegend((v) => !v)} label="What the colours mean" />}
    >
      {legend ? <InfoLegend /> : null}
      {modeCounts.total > 0 ? (
        <div className="text-xs text-text-muted">
          {modeCounts.total} tournament{modeCounts.total === 1 ? "" : "s"}
          {["1v1", "2v2", ...Array.from(modeCounts.byMode.keys()).filter((m) => m !== "1v1" && m !== "2v2")]
            .filter((m) => (modeCounts.byMode.get(m) ?? 0) > 0)
            .map((m) => ` · ${modeCounts.byMode.get(m)}× ${m}`)
            .join("")}
        </div>
      ) : null}
      <div className="overflow-x-auto" data-no-swipe-nav>
        <div className="relative" style={{ width: gridW }}>
          <div
            className="relative"
            style={{ display: "grid", gridTemplateColumns: `${nameW}px repeat(${orderedPlayers.length}, ${cellW}px)`, columnGap: gap, rowGap: gap }}
          >
            <div style={{ height: headerH }} className="sticky top-0 z-30 bg-bg-default" />
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
                  style={{ height: headerH }}
                  className={
                    "sticky top-0 z-30 flex cursor-grab touch-none select-none flex-col items-center justify-end gap-1 rounded-t pb-1 bg-bg-default " +
                    (isDragging ? "opacity-40" : isOver ? "ring-2 ring-accent ring-inset" : "")
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
                    <AvatarCircle playerId={p.player_id} name={p.display_name} updatedAt={avatarUpdatedAtById.get(p.player_id) ?? null} sizeClass="h-6 w-6" cups={cupsHeldByPlayerId.get(p.player_id)} />
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
                <div style={{ height: cellH }} className="flex flex-col justify-center gap-0.5 pr-1.5">
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
          {laurelPolylines.length ? (
            <svg className="pointer-events-none absolute left-0 top-0" width={gridW} height={gridH} aria-hidden="true">
              {laurelPolylines.map((l) => (
                <polyline key={l.key} points={l.pts} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              ))}
            </svg>
          ) : null}
        </div>
      </div>
    </StatsSection>
  );
}
