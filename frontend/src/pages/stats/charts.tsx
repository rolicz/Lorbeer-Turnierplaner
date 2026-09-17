/** Tiny from-scratch SVG chart kit for the stats dashboard (mobile-first). */
import { useId } from "react";

import EmptyState from "../../ui/primitives/EmptyState";
import { APP_LOCALE_MONTHS } from "../../utils/format";

const GREEN = "rgb(34 197 94)";
const AMBER = "rgb(234 179 8)";
const RED = "rgb(239 68 68)";

type RadarAxis = { label: string; value: number };
type RadarSeries = { name: string; color: string; axes: RadarAxis[] };

/**
 * Radar / spider chart. Pass a single `axes` array, or `series` to overlay
 * multiple players (each in its own colour). All series must share axis order.
 */
export function Radar({ axes, series, size = 240 }: { axes?: RadarAxis[]; series?: RadarSeries[]; size?: number }) {
  const data: RadarSeries[] = series && series.length
    ? series
    : axes
      ? [{ name: "", color: "rgb(var(--color-accent))", axes }]
      : [];
  const baseAxes = data[0]?.axes ?? [];
  const n = baseAxes.length;
  if (n < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, radius: number) => [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))];
  const rings = [0.25, 0.5, 0.75, 1];
  const multi = data.length > 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Player radar" role="img">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={baseAxes.map((_, i) => pt(i, r * ring).join(",")).join(" ")}
          fill="none"
          stroke="rgb(var(--color-border-card-chip) / 0.4)"
          strokeWidth="1"
        />
      ))}
      {baseAxes.map((_, i) => {
        const [x, y] = pt(i, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(var(--color-border-card-chip) / 0.3)" strokeWidth="1" />;
      })}
      {data.map((s, si) => {
        const dataPts = s.axes.map((a, i) => pt(i, r * Math.max(0.02, Math.min(1, a.value))));
        return (
          <g key={si}>
            <polygon
              points={dataPts.map((p) => p.join(",")).join(" ")}
              fill={s.color}
              fillOpacity={multi ? 0.1 : 0.22}
              stroke={s.color}
              strokeWidth="2"
            />
            {dataPts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={s.color} />
            ))}
          </g>
        );
      })}
      {baseAxes.map((a, i) => {
        const [x, y] = pt(i, r + 16);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-text-muted" style={{ fontSize: 9 }}>
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

/** Form sparkline from per-match points (0/1/3). */
export function Sparkline({ values, w = 64, h = 22 }: { values: number[]; w?: number; h?: number }) {
  if (!values.length) return <div style={{ width: w, height: h }} />;
  const max = 3;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = h - 2 - (Math.max(0, Math.min(max, v)) / max) * (h - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1] ?? 0;
  const tone = last >= 2 ? GREEN : last >= 1 ? AMBER : RED;
  const lastY = h - 2 - (Math.max(0, Math.min(max, last)) / max) * (h - 4);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(values.length - 1) * step} cy={lastY} r="2.5" fill={tone} />
    </svg>
  );
}

/**
 * Time-based multi-series line chart with a **fixed-size plot** and a pan/zoom
 * date window [viewT0, viewT1]. The chart never resizes: zooming only changes the
 * x-axis window (handled by the parent via pinch/drag). Lines that enter/leave the
 * window are clipped at the plot edges. Gaps render as muted dashed segments
 * (non-participation); event ticks mark every tournament; optional name labels.
 * Pass an explicit pixel `width` (measured from the container).
 */
export function TrendChart({
  events,
  series,
  yMax,
  yMin = 0,
  yTicks,
  height = 240,
  width,
  viewT0,
  viewT1,
  showLabels = false,
}: {
  events: { ts: number; label: string }[];
  series: { id: number; name: string; color: string; points: (number | null)[] }[];
  yMax: number;
  yMin?: number;
  yTicks?: number[];
  height?: number;
  width?: number;
  viewT0: number;
  viewT1: number;
  showLabels?: boolean;
}) {
  const clipId = useId();
  const padL = 32;
  const padR = 12;
  const padT = 10;
  const padBBase = 28; // month-axis label area — constant
  const labelArea = showLabels ? 84 : 0; // tournament-name labels appended BELOW the plot
  const innerH = height - padT - padBBase;
  const H = height + labelArea;
  const W = Math.max(240, Math.round(width || 320));
  const innerW = W - padL - padR;
  const n = events.length;
  if (!n) return <EmptyState title="No data in range." className="grid h-40 place-items-center" />;

  const MONTH = 30.44 * 864e5;
  const span = Math.max(MONTH / 2, viewT1 - viewT0);
  const xAt = (ts: number) => padL + ((ts - viewT0) / span) * innerW;
  const yspan = yMax - yMin || 1;
  const yAt = (v: number) => padT + innerH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / yspan) * innerH;
  const ticks = [...new Set(yTicks ?? [yMin, Math.round((yMin + yMax) / 2), yMax])];
  const inX = (x: number) => x >= padL - 0.5 && x <= W - padR + 0.5;

  // Which tournaments get a name label. They are rotated -45° and anchored at their
  // own tick, so any two of them are parallel strips whose distance apart is
  // `dx · sin45°`; below one line height they print into each other, which is what
  // the whole axis did on a phone. Keep the newest label and walk left, dropping
  // every tick that cannot clear the one already kept — so the axis thins itself by
  // the width it actually has (narrow phone: a handful, desktop: most of them) and
  // the most recent tournament is always named.
  const EVENT_LABEL_PX = 8;
  const MIN_LABEL_DX = (EVENT_LABEL_PX * 1.35) / Math.SQRT1_2;
  // A label runs down-LEFT from its tick, so near the y-axis it runs out of the
  // SVG and prints as a fragment ("…zturnier"). The run is estimated from the
  // string — close enough at this size, and only ever consulted within ~60px of
  // the left edge.
  const labelRunX = (label: string) => label.length * EVENT_LABEL_PX * 0.52 * Math.SQRT1_2;
  const labelledEvents = new Set<number>();
  if (showLabels) {
    let keptX = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      const x = xAt(events[i].ts);
      if (!inX(x)) continue;
      if (keptX - x < MIN_LABEL_DX) continue;
      if (x - labelRunX(events[i].label) < 2) continue;
      labelledEvents.add(i);
      keptX = x;
    }
  }

  // Month marks within the window; thin out labels so they never crowd.
  const monthsInView = span / MONTH;
  const everyMonths = Math.max(1, Math.ceil(monthsInView / 7));
  const marks: { ts: number; label: string; major: boolean; show: boolean }[] = [];
  const d = new Date(viewT0);
  d.setDate(1); d.setHours(0, 0, 0, 0);
  let mi = 0;
  while (d.getTime() <= viewT1 + MONTH) {
    const jan = d.getMonth() === 0;
    marks.push({
      ts: d.getTime(),
      label: jan ? String(d.getFullYear()) : d.toLocaleDateString(APP_LOCALE_MONTHS, { month: "short" }),
      major: jan,
      show: mi % everyMonths === 0 || jan,
    });
    mi++;
    d.setMonth(d.getMonth() + 1);
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block touch-none select-none" role="img" aria-label="Trend chart">
      <defs>
        <clipPath id={clipId}>
          <rect x={padL} y={padT - 2} width={innerW} height={innerH + 4} />
        </clipPath>
      </defs>
      {ticks.map((t) => (
        <g key={`y${t}`}>
          <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="rgb(var(--color-border-card-chip) / 0.4)" strokeWidth="1" />
          <text x={padL - 6} y={yAt(t) + 3} textAnchor="end" className="fill-text-muted" style={{ fontSize: 9 }}>{t}</text>
        </g>
      ))}
      {marks.map((m, i) => {
        const x = xAt(m.ts);
        if (!inX(x)) return null;
        return <line key={`m${i}`} x1={x} x2={x} y1={padT} y2={padT + innerH} stroke={`rgb(var(--color-border-card-chip) / ${m.major ? 0.4 : 0.16})`} strokeWidth="1" />;
      })}
      {marks.map((m, i) => {
        const x = xAt(m.ts);
        if (!m.show || !inX(x)) return null;
        return (
          <text key={`ml${i}`} x={x} y={padT + innerH + 13} textAnchor="middle" className={m.major ? "fill-text-normal" : "fill-text-muted"} style={{ fontSize: 9, fontWeight: m.major ? 600 : 400 }}>
            {m.label}
          </text>
        );
      })}
      {/* event ticks (every tournament in view — non-participation reference) */}
      {events.map((e, i) => (inX(xAt(e.ts)) ? <line key={`e${i}`} x1={xAt(e.ts)} x2={xAt(e.ts)} y1={padT + innerH - 4} y2={padT + innerH} stroke="rgb(var(--color-border-card-chip) / 0.6)" strokeWidth="1" /> : null))}
      {showLabels
        ? events.map((e, i) => {
            if (!labelledEvents.has(i)) return null;
            const x = xAt(e.ts);
            const y = padT + innerH + 22;
            // Uniform rotation: text reads bottom-left → top-right and tucks
            // down-LEFT from its tick (end-anchored), so labels never cross/overlap
            // in two directions and the most recent is never clipped on the right.
            return (
              <text key={`tl${i}`} x={x} y={y} textAnchor="end" transform={`rotate(-45 ${x} ${y})`} className="fill-text-muted" style={{ fontSize: EVENT_LABEL_PX }}>
                {e.label}
              </text>
            );
          })
        : null}
      {/* series clipped to the plot window */}
      <g clipPath={`url(#${clipId})`}>
        {series.map((s) => {
          const pres: { i: number; v: number }[] = [];
          s.points.forEach((p, i) => { if (p != null) pres.push({ i, v: p }); });
          return pres.slice(0, -1).map((A, k) => {
            const B = pres[k + 1];
            const skipped = B.i - A.i > 1;
            return (
              <line
                key={`${s.id}-seg-${k}`}
                x1={xAt(events[A.i].ts)}
                y1={yAt(A.v)}
                x2={xAt(events[B.i].ts)}
                y2={yAt(B.v)}
                stroke={s.color}
                strokeWidth="2.25"
                strokeLinecap="round"
                opacity={skipped ? 0.28 : 0.95}
                strokeDasharray={skipped ? "2 4" : undefined}
              />
            );
          });
        })}
        {series.map((s) =>
          s.points.map((p, i) => (p == null || !inX(xAt(events[i].ts)) ? null : <circle key={`d${s.id}-${i}`} cx={xAt(events[i].ts)} cy={yAt(p)} r="2.2" fill={s.color} />)),
        )}
      </g>
    </svg>
  );
}
