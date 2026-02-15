import { cn } from "../cn";

export default function PageLoadingScreen({
  className,
  sectionCount = 3,
}: {
  className?: string;
  sectionCount?: number;
}) {
  const sections = Array.from({ length: Math.max(1, sectionCount) }, (_, i) => i);
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      <div className="card-outer p-3">
        <div className="space-y-2 animate-pulse">
          <div className="h-8 w-full rounded-xl bg-bg-card-chip/45" />
          <div className="h-9 w-44 rounded-xl bg-bg-card-chip/35" />
        </div>
      </div>

      {sections.map((i) => (
        <div key={i} className="panel-subtle p-3 animate-pulse">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-bg-card-chip/45" />
            <div className="h-10 w-full rounded-xl bg-bg-card-chip/30" />
          </div>
        </div>
      ))}
    </div>
  );
}
