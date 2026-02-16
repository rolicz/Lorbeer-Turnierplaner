import { cn } from "../cn";

export default function InlineLoading({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 px-1 py-1 text-sm text-text-muted", className)} aria-live="polite">
      <i className="fa-solid fa-circle-notch fa-spin text-[11px] text-accent" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
