/** Tiny from-scratch SVG chart kit for the stats dashboard (mobile-first). */

const GREEN = "rgb(34 197 94)";
const AMBER = "rgb(234 179 8)";
const RED = "rgb(239 68 68)";

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

/** Win/Draw/Loss donut. */
export function WDLDonut({ w, d, l, size = 96 }: { w: number; d: number; l: number; size?: number }) {
  const total = Math.max(1, w + d + l);
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: w, color: GREEN },
    { v: d, color: AMBER },
    { v: l, color: RED },
  ];
  let offset = 0;
  const cx = size / 2;
  const winPct = Math.round((w / total) * 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgb(var(--color-bg-card-chip))" strokeWidth="10" />
      {segs.map((s, i) => {
        if (s.v <= 0) return null;
        const len = (s.v / total) * c;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="10"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cx})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cx - 2} textAnchor="middle" className="fill-text-normal" style={{ fontSize: 20, fontWeight: 700 }}>
        {winPct}%
      </text>
      <text x={cx} y={cx + 16} textAnchor="middle" className="fill-text-muted" style={{ fontSize: 10 }}>
        win rate
      </text>
    </svg>
  );
}

/** Horizontal labelled value bar (for goals for/against etc.). */
export function StatBar({ label, value, max, color = "rgb(var(--color-accent))" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-text-muted">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-card-chip/50">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-text-normal">{value}</span>
    </div>
  );
}

/**
 * Multi-series line chart (points/form over tournaments). Mobile-first, responsive
 * width via viewBox. series: { name, color, points: (number|null)[] } aligned to xLabels.
 */
export function MultiLine({
  series,
  xLabels,
  yMax,
  height = 200,
  yTicks,
}: {
  series: { id: number; name: string; color: string; points: (number | null)[] }[];
  xLabels: string[];
  yMax: number;
  height?: number;
  yTicks?: number[];
}) {
  const W = 320;
  const H = height;
  const padL = 24;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const n = xLabels.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - (Math.max(0, Math.min(yMax, v)) / (yMax || 1)) * innerH;
  const ticks = yTicks ?? [0, Math.round(yMax / 2), yMax];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block" role="img" aria-label="Trend chart">
      {/* grid */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="rgb(var(--color-border-card-chip) / 0.4)" strokeWidth="1" />
          <text x={2} y={yAt(t) + 3} className="fill-text-muted" style={{ fontSize: 9 }}>{t}</text>
        </g>
      ))}
      {/* series */}
      {series.map((s) => {
        const segs: string[] = [];
        let cur: string[] = [];
        s.points.forEach((p, i) => {
          if (p == null) {
            if (cur.length) segs.push(cur.join(" "));
            cur = [];
          } else {
            cur.push(`${xAt(i).toFixed(1)},${yAt(p).toFixed(1)}`);
          }
        });
        if (cur.length) segs.push(cur.join(" "));
        return segs.map((pts, k) => (
          <polyline key={`${s.id}-${k}`} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        ));
      })}
    </svg>
  );
}
