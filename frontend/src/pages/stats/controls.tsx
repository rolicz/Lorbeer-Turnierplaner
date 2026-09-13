/** Small shared stats controls (used by StatsInsights and the extracted StatsTable). */

export function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-bg-card-chip/60 accent-[rgb(var(--color-accent))]"
      />
      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-text-normal">{value}</span>
    </div>
  );
}
