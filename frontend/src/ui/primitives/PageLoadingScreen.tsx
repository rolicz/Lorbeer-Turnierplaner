import { cn } from "../cn";

export default function PageLoadingScreen({
  className,
  sectionCount = 3,
}: {
  className?: string;
  sectionCount?: number;
}) {
  const dots = Math.max(3, Math.min(7, sectionCount + 1));
  return (
    <div className={cn("min-h-[38svh] grid place-items-center", className)} aria-hidden="true">
      <div className="inline-flex flex-col items-center gap-2 text-sm text-text-muted">
        <span className="relative inline-flex h-10 w-10 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-border-card-chip/80" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent border-r-accent motion-safe:animate-spin" />
          <span className="absolute inset-[9px] rounded-full bg-accent/20 motion-safe:animate-pulse" />
        </span>
        <span className="inline-flex items-center gap-2">
          <span>Loading</span>
          <span className="inline-flex items-center gap-1">
            {Array.from({ length: dots }, (_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-bg-card-chip/70 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}
