import type { SeriesPoint } from "../trendsMath";

export type Segment = {
  i1: number;
  y1: number;
  i2: number;
  y2: number;
  muted: boolean;
  opacity: number;
};

/** Build the solid and muted connector segments for a single series' point list. */
export function buildSeriesSegments(pts: SeriesPoint[]): Segment[] {
  const segments: Segment[] = [];
  let lastIdx: number | null = null;
  let lastY: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    if (lastIdx != null && lastY != null) {
      const gap = i - lastIdx;
      const muted = gap > 1 || !p.present || !(pts[lastIdx]?.present ?? true);
      segments.push({
        i1: lastIdx,
        y1: lastY,
        i2: i,
        y2: p.y,
        muted,
        opacity: muted ? 0.55 : 0.88,
      });
    }
    lastIdx = i;
    lastY = p.y;
  }
  return segments;
}

/**
 * Compute per-index lane offsets for series whose y-coordinates are too close to
 * distinguish. Offsets spread overlapping dots/lines into parallel lanes so each
 * player's color remains visible.
 */
export function computeLaneOffsets(
  n: number,
  series: ReadonlyArray<{ id: number; points: SeriesPoint[] }>,
  yAtFn: (v: number) => number
): Map<number, Map<number, number>> {
  const threshold = 2.25;
  const laneGap = 5;
  const out = new Map<number, Map<number, number>>();

  for (let i = 0; i < n; i++) {
    const atI: Array<{ id: number; y: number }> = [];
    for (const s of series) {
      const p = s.points[i];
      if (!p) continue;
      atI.push({ id: s.id, y: yAtFn(p.y) });
    }
    if (atI.length <= 1) continue;
    atI.sort((a, b) => a.y - b.y);

    const groups: Array<Array<{ id: number; y: number }>> = [];
    let cur: Array<{ id: number; y: number }> = [];
    for (const item of atI) {
      if (!cur.length) {
        cur = [item];
        continue;
      }
      const prev = cur[cur.length - 1];
      if (Math.abs(item.y - prev.y) <= threshold) cur.push(item);
      else {
        groups.push(cur);
        cur = [item];
      }
    }
    if (cur.length) groups.push(cur);

    const m = new Map<number, number>();
    let any = false;
    for (const g of groups) {
      if (g.length <= 1) continue;
      any = true;
      const mid = (g.length - 1) / 2;
      for (let j = 0; j < g.length; j++) {
        m.set(g[j].id, (j - mid) * laneGap);
      }
    }
    if (any) out.set(i, m);
  }
  return out;
}
