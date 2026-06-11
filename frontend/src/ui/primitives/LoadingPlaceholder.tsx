import { cn } from "../cn";

/**
 * Skeleton block that reserves a card/section body's height while it loads, preventing layout
 * shift. Use for sized card bodies. For a compact inline spinner (buttons, small rows, status
 * text) use {@link InlineLoading} instead — the two are a deliberate split, not redundant.
 */
export default function LoadingPlaceholder({ heightClassName, className }: {
  heightClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("skeleton rounded-xl", heightClassName ?? "h-12", className)}
      role="status"
      aria-label="Loading…"
    />
  );
}
