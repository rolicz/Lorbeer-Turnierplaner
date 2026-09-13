import { Loader2 } from "lucide-react";

import { cn } from "../cn";

/**
 * Compact spinner + label for inline/contextual loading (buttons, small rows, status text).
 * For a full skeleton that reserves a card body's height (no layout shift) use
 * {@link LoadingPlaceholder} instead — the two are a deliberate split, not redundant.
 */
export default function InlineLoading({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 px-1 py-1 text-sm text-text-muted", className)} aria-live="polite">
      <Loader2 size={14} className="animate-spin text-accent" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
