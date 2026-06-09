/** Sortable standings table. Used full-featured in Stats and as a fixed-column preview on the dashboard. */
import { useMemo, useState } from "react";
import { keepPreviousData, useQueries } from "@tanstack/react-query";

import { getStatsPlayerMatches } from "../../api/stats.api";
import type { StatsPlayerMatchesTournament, StatsScope } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { Slider, ToggleChip } from "./controls";
import { type Row, TABLE_COLS, DEFAULT_COLS, COL_CHIPS, matchStats } from "./standings";

export default function StatsTable({
  rows,
  loading,
  onSelect,
  mode,
  scope,
  showControls = true,
  fixedColumns,
}: {
  rows: Row[];
  loading: boolean;
  onSelect: (id: number) => void;
  mode: StatsMode;
  scope: StatsScope;
  /** Hide the Last-N toggle + column chips (e.g. the dashboard preview). */
  showControls?: boolean;
  /** Force a fixed visible column set (key order follows TABLE_COLS). */
  fixedColumns?: string[];
}) {
  const controlled = fixedColumns != null;
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const [sortKey, setSortKey] = useState<string>("pts");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(DEFAULT_COLS));
  const [lastN, setLastN] = useState(false);
  const [nWin, setNWin] = useState(5);

  // Last-N: recompute every column over each player's last N tournaments (same
  // unit as Trends' Last-N). Elo is meaningless over a window, so it's hidden.
  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["stats", "playerMatches", r.id, scope],
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: lastN && rows.length > 0,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    })),
  });
  const lastNLoading = lastN && matchesQs.some((q) => q.isLoading && !q.data);
  const lastNRows = useMemo(() => {
    if (!lastN) return rows;
    return rows.map((r, i) => {
      const data = matchesQs[i]?.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
      const ts = (data?.tournaments ?? [])
        .filter((t) => mode === "overall" || t.mode === mode)
        .filter((t) => t.matches.some((m) => matchStats(m, r.id)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, nWin);
      let played = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0, pts = 0;
      for (const t of ts) for (const m of t.matches) {
        const s = matchStats(m, r.id);
        if (!s) continue;
        played++; gf += s.gf; ga += s.ga; pts += s.pts;
        if (s.res === "W") w++; else if (s.res === "D") d++; else l++;
      }
      return { ...r, played, wins: w, draws: d, losses: l, gf, ga, gd: gf - ga, pts };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastN, rows, matchesQs.map((q) => q.dataUpdatedAt).join("|"), mode, nWin]);

  // Elo is unset when Last-N is on. When `fixedColumns` is given, that set wins.
  const effVisible = useMemo(() => {
    if (controlled) return new Set(fixedColumns);
    return lastN ? new Set([...visible].filter((k) => k !== "rating")) : visible;
  }, [controlled, fixedColumns, lastN, visible]);
  const cols = useMemo(() => TABLE_COLS.filter((c) => effVisible.has(c.key)), [effVisible]);
  const colByKey = useMemo(() => new Map(TABLE_COLS.map((c) => [c.key, c])), []);
  const sortCol = colByKey.get(effVisible.has(sortKey) ? sortKey : "pts") ?? TABLE_COLS[0];
  const tableRows = lastN ? lastNRows : rows;
  const sorted = useMemo(
    () => tableRows.slice().sort((a, b) => (sortCol.val(a) - sortCol.val(b)) * dir),
    [tableRows, sortCol, dir],
  );
  const setSort = (k: string) => { if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(-1); } };
  const toggleGroup = (groupCols: string[], on: boolean) =>
    setVisible((prev) => {
      const n = new Set(prev);
      if (on) {
        for (const k of groupCols) n.delete(k);
        if (n.size === 0) n.add("pts");
      } else {
        for (const k of groupCols) n.add(k);
      }
      return n;
    });

  if (loading) return <InlineLoading label="Loading…" />;
  return (
    <div className="space-y-3">
      {showControls && !controlled ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip on={lastN} onClick={() => setLastN((v) => !v)}>Last N</ToggleChip>
            {lastN ? (
              <>
                <span className="text-[11px] text-text-muted">last {nWin} tournaments</span>
                <div className="min-w-[160px] flex-1">
                  <Slider label="" value={nWin} min={2} max={20} onChange={setNWin} />
                </div>
              </>
            ) : (
              <span className="text-[11px] text-text-muted">all-time totals</span>
            )}
          </div>

          <div>
            <div className="section-head"><span className="section-label">Columns</span></div>
            <div className="flex flex-wrap gap-1.5">
              {COL_CHIPS.map((item) => {
                const isElo = item.cols.includes("rating");
                const disabled = lastN && isElo;
                const on = !disabled && item.cols.every((k) => effVisible.has(k));
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleGroup(item.cols, on)}
                    aria-pressed={on}
                    title={disabled ? "Elo isn't available over a Last-N window" : undefined}
                    className={
                      "rounded-full px-2.5 py-1 text-xs transition focus-ring " +
                      (disabled
                        ? "cursor-not-allowed bg-bg-card-chip/30 text-text-muted/40 line-through"
                        : on
                          ? "bg-accent/15 font-medium text-accent ring-1 ring-inset ring-accent/40"
                          : "bg-bg-card-chip/50 text-text-muted hover:text-text-normal")
                    }
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {lastNLoading ? <InlineLoading label="Loading last-N…" /> : null}
        </>
      ) : null}

      <div className="overflow-x-auto" data-no-swipe-nav>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-card-chip/50 text-[11px] uppercase tracking-wide text-text-muted">
              <th className="sticky left-0 z-10 bg-bg-default py-2 pl-1 pr-2 text-left font-medium">Player</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => setSort(c.key)} className={"inline-flex items-center gap-0.5 " + (sortKey === c.key ? "text-accent" : "hover:text-text-normal")}>
                    {c.label}{sortKey === c.key ? <span>{dir === -1 ? "▾" : "▴"}</span> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer border-b border-border-card-inner/40 transition hover:bg-hover-default/30">
                <td className="sticky left-0 z-10 bg-bg-default py-2 pl-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-right text-xs tabular-nums text-text-muted">{i + 1}</span>
                    <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-7 w-7" />
                    <span className="truncate font-medium text-text-normal">{r.name}</span>
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={"px-2 text-right tabular-nums " + (c.bold ? "font-bold " : "") + (c.cls ?? "")}>
                    {c.fmt(c.val(r), r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
