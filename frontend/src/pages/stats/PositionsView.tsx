/** Positions tab — players × tournaments grid with cup-lineage overlay. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsPlayers } from "../../api/stats.api";
import { getCup, listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { fmtRank } from "../../utils/format";
import type { StatsMode } from "./StatsControls";

export default function PositionsView({ mode }: { mode: StatsMode }) {
  const q = useQuery({
    queryKey: qk.stats.players(mode, "positions"),
    queryFn: () => getStatsPlayers({ mode }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
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
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const onColDown = (e: React.PointerEvent, pid: number) => {
    dragRef.current = pid; setDragId(pid); setOverId(pid);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onColMove = (e: React.PointerEvent) => {
    if (dragRef.current == null) return;
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
  if (!tournaments.length) return <div className="text-sm text-text-muted">No tournaments yet.</div>;

  return (
    <div>
      <div className="section-head"><span className="section-label">Tournament positions</span></div>
      <div className="mb-1.5 text-[11px] text-text-muted">Drag a player's icon to reorder the columns.</div>
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
                  <AvatarCircle playerId={p.player_id} name={p.display_name} updatedAt={avatarUpdatedAtById.get(p.player_id) ?? null} sizeClass="h-6 w-6" />
                  <span className="w-full truncate text-center text-[11px] text-text-muted">{p.display_name}</span>
                </div>
              );
            })}
            {tournaments.map((t) => {
              const noWinner = t.status === "done" && t.winner_player_id == null;
              const showModePill = mode === "overall";
              return (
              <Fragment key={t.id}>
                <div style={{ height: cellH }} className="flex items-start gap-1 pr-1.5">
                  <Link
                    to={`/live/${t.id}`}
                    title={`${t.name}${showModePill ? ` · ${t.mode}` : ""}${noWinner ? " · kein eindeutiger Sieger" : ""} — open tournament`}
                    className="block min-w-0 flex-1 text-xs leading-tight text-text-normal no-underline transition hover:text-accent"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {t.name}
                  </Link>
                  {showModePill || noWinner ? (
                    <span className="flex shrink-0 flex-col items-end gap-0.5 pt-px">
                      {showModePill ? (
                        <span
                          className="rounded-full bg-bg-card-chip/60 px-1 text-[9px] leading-tight text-text-muted"
                          title={`Mode: ${t.mode}`}
                        >
                          {t.mode}
                        </span>
                      ) : null}
                      {noWinner ? (
                        <span
                          className="rounded-full bg-bg-card-chip/60 px-1 text-[9px] leading-tight text-text-muted"
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
                    return <div key={p.player_id} style={{ height: cellH }} className="grid place-items-center rounded bg-bg-card-chip/15 text-xs text-text-muted">·</div>;
                  const total = t.players_count || 1;
                  const frac = total > 1 ? (pos - 1) / (total - 1) : 0;
                  const stakes = t.cup_stakes ?? [];
                  const isWinner = pos === 1 && t.winner_player_id === p.player_id;
                  return (
                    <Link
                      key={p.player_id}
                      to={`/live/${t.id}`}
                      style={{ height: cellH, ["--pos-p"]: frac } as React.CSSProperties}
                      className="pos-tile relative grid place-items-center rounded border text-[11px] font-semibold tabular-nums no-underline transition hover:z-10 hover:ring-2 hover:ring-inset hover:ring-accent/70"
                      title={`${p.display_name} · ${t.name}: ${fmtRank(pos, total)}${isWinner && stakes.length ? ` · won ${stakes.map((s) => s.name).join(", ")}` : ""}${pos === 1 && t.status === "done" && t.winner_player_id == null ? " · kein eindeutiger Sieger" : ""} — open tournament`}
                    >
                      {isWinner && stakes.length ? (
                        <span className="absolute right-0.5 top-0.5 inline-flex gap-px">
                          {stakes.map((s) => (
                            <i key={s.key} className="fa-solid fa-crown text-[8px]" style={{ color: cupColor(s.key) }} aria-hidden="true" />
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
    </div>
  );
}
