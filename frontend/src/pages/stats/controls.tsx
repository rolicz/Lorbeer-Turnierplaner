/** Small shared stats controls (used by StatsInsights and the extracted StatsTable). */
import type { ReactNode } from "react";

export function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={"rounded-full px-2.5 py-1 text-xs transition focus-ring " + (on ? "bg-accent/15 font-medium text-accent ring-1 ring-inset ring-accent/40" : "bg-bg-card-chip/50 text-text-muted hover:text-text-normal")}
    >
      {children}
    </button>
  );
}

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
