import { Flame, Goal, Lock, Shield } from "lucide-react";

export type ActiveStreakKey = "win_streak" | "unbeaten_streak" | "scoring_streak" | "clean_sheet_streak";

export type ActiveStreak = {
  key: ActiveStreakKey;
  length: number;
  highlight?: boolean;
};

function iconFor(key: ActiveStreakKey) {
  switch (key) {
    case "win_streak":
      return { Icon: Flame, label: "Win streak" };
    case "unbeaten_streak":
      return { Icon: Shield, label: "Unbeaten" };
    case "scoring_streak":
      return { Icon: Goal, label: "Scoring streak" };
    case "clean_sheet_streak":
      return { Icon: Lock, label: "Clean sheet streak" };
  }
}

export function StreakPatch({ streak, className = "" }: { streak: ActiveStreak; className?: string }) {
  const meta = iconFor(streak.key);
  const isHot = !!streak.highlight;
  const isCompact = className.includes("streak-compact");
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border font-mono tabular-nums leading-none shadow-sm " +
        (isCompact ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-[11px]") +
        " " +
        className
      }
      style={{
        // Record streak: accent border only (keep the chip surface for readability/consistency).
        borderColor: isHot ? "rgb(var(--color-accent) / 0.55)" : "rgb(var(--color-border-card-chip) / 0.55)",
        backgroundColor: "rgb(var(--color-bg-card-chip) / 0.55)",
        color: "rgb(var(--color-text-normal))",
      }}
      title={`${meta.label}: ${streak.length}`}
    >
      <meta.Icon size={isCompact ? 10 : 12} strokeWidth={2.25} aria-hidden="true" />
      <span>{streak.length}</span>
    </span>
  );
}
