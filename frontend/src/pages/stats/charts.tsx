/** Tiny from-scratch SVG chart kit for the stats dashboard (mobile-first). */
import { useId } from "react";

const GREEN = "rgb(34 197 94)";
const AMBER = "rgb(234 179 8)";
const RED = "rgb(239 68 68)";

/** Wrapping pill selector — never overflows (unlike a fixed segmented switch). */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={String(o.key)}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={
              "rounded-full px-3 py-1.5 text-sm transition focus-ring " +
              (on
                ? "bg-accent/15 font-medium text-accent ring-1 ring-inset ring-accent/40"
                : "bg-bg-card-chip/50 text-text-muted hover:text-text-normal")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Radar / spider chart. axes: { label, value 0..1 }. */
export function Radar({ axes, size = 240 }: { axes: { label: string; value: number }[]; size?: number }) {
  const n = axes.length;
  if (n < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, radius: number) => [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))];
  const rings = [0.25, 0.5, 0.75, 1];
  const dataPts = axes.map((a, i) => pt(i, r * Math.max(0.02, Math.min(1, a.value))));
  const accent = "rgb(var(--color-accent))";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Player radar" role="img">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, i) => pt(i, r * ring).join(",")).join(" ")}
          fill="none"
          stroke="rgb(var(--color-border-card-chip) / 0.4)"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, r);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgb(var(--color-border-card-chip) / 0.3)" strokeWidth="1" />;
      })}
      <polygon points={dataPts.map((p) => p.join(",")).join(" ")} fill={accent} fillOpacity="0.22" stroke={accent} strokeWidth="2" />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={accent} />
      ))}
      {axes.map((a, i) => {
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

/** Win-rate heatmap matrix (rows beat cols). cell returns {pct, label} or null (self/no data). */
export function Heatmap({
  players,
  cell,
  onCell,
}: {
  players: { id: number; name: string }[];
  cell: (rowId: number, colId: number) => { pct: number; label: string } | null;
  onCell?: (rowId: number, colId: number) => void;
}) {
  const initials = (n: string) => (n || "?").trim().slice(0, 3);
  const toneFor = (pct: number) => {
    // 0 -> red, 50 -> neutral, 100 -> green
    const t = Math.max(0, Math.min(1, pct / 100));
    const hue = t * 130; // 0=red .. 130=green
    return `hsl(${hue} 60% 42% / 0.85)`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-bg-card-inner" />
            {players.map((p) => (
              <th key={p.id} className="px-1 pb-1 text-[10px] font-medium text-text-muted">{initials(p.name)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((rp) => (
            <tr key={rp.id}>
              <th className="sticky left-0 z-10 bg-bg-card-inner pr-2 text-right text-[11px] font-semibold text-text-normal">{initials(rp.name)}</th>
              {players.map((cp) => {
                if (rp.id === cp.id) return <td key={cp.id} className="h-9 w-9 rounded bg-bg-card-chip/30" />;
                const c = cell(rp.id, cp.id);
                if (!c) return <td key={cp.id} className="h-9 w-9 rounded bg-bg-card-chip/20 text-center text-[10px] text-text-muted">–</td>;
                return (
                  <td key={cp.id}>
                    <button
                      type="button"
                      onClick={() => onCell?.(rp.id, cp.id)}
                      title={`${rp.name} vs ${cp.name}: ${c.label}`}
                      className="grid h-9 w-9 place-items-center rounded text-[10px] font-semibold text-white"
                      style={{ backgroundColor: toneFor(c.pct) }}
                    >
                      {Math.round(c.pct)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  if (!n) return <div className="grid h-40 place-items-center text-sm text-text-muted">No data in range.</div>;

  const MONTH = 30.44 * 864e5;
  const span = Math.max(MONTH / 2, viewT1 - viewT0);
  const xAt = (ts: number) => padL + ((ts - viewT0) / span) * innerW;
  const yspan = yMax - yMin || 1;
  const yAt = (v: number) => padT + innerH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / yspan) * innerH;
  const ticks = [...new Set(yTicks ?? [yMin, Math.round((yMin + yMax) / 2), yMax])];
  const inX = (x: number) => x >= padL - 0.5 && x <= W - padR + 0.5;

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
      label: jan ? String(d.getFullYear()) : d.toLocaleDateString(undefined, { month: "short" }),
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
          <text x={2} y={yAt(t) + 3} className="fill-text-muted" style={{ fontSize: 9 }}>{t}</text>
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
            const x = xAt(e.ts);
            if (!inX(x)) return null;
            const y = padT + innerH + 24;
            return (
              <text key={`tl${i}`} x={x} y={y} transform={`rotate(45 ${x} ${y})`} className="fill-text-muted" style={{ fontSize: 8 }}>
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

/**
 * Multi-series line chart (points/form over tournaments). Mobile-first, responsive
 * width via viewBox. series: { name, color, points: (number|null)[] } aligned to xLabels.
 */
export function MultiLine({
  series,
  xLabels,
  yMax,
  yMin = 0,
  height = 200,
  yTicks,
}: {
  series: { id: number; name: string; color: string; points: (number | null)[] }[];
  xLabels: string[];
  yMax: number;
  yMin?: number;
  height?: number;
  yTicks?: number[];
}) {
  const W = 320;
  const H = height;
  const padL = 26;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const n = xLabels.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const span = yMax - yMin || 1;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / span) * innerH;
  const ticks = [...new Set(yTicks ?? [yMin, Math.round((yMin + yMax) / 2), yMax])];

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
          <polyline key={`${s.id}-${k}`} points={pts} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
        ));
      })}
      {/* end-of-line dots */}
      {series.map((s) => {
        let lastI = -1;
        for (let i = s.points.length - 1; i >= 0; i--) { if (s.points[i] != null) { lastI = i; break; } }
        if (lastI < 0) return null;
        return <circle key={`dot-${s.id}`} cx={xAt(lastI)} cy={yAt(s.points[lastI] as number)} r="2.6" fill={s.color} />;
      })}
    </svg>
  );
}
