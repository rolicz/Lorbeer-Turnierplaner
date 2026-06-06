import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Prominent, consistent back affordance for detail/sub pages.
 * Bigger tap target + clear label than a bare text link, so it's not overlooked.
 */
export default function PageBack({
  to,
  label,
  state,
}: {
  /** Destination; if omitted, uses history back. */
  to?: string;
  label: string;
  state?: unknown;
}) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (to ? nav(to, state !== undefined ? { state } : undefined) : nav(-1))}
      className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border-card-chip/60 bg-bg-card-outer/70 py-2 pl-2.5 pr-4 text-sm font-medium text-text-normal shadow-sm transition hover:bg-hover-default/50 focus-ring"
    >
      <ChevronLeft className="h-[18px] w-[18px] shrink-0 text-accent" aria-hidden="true" />
      <span className="max-w-[60vw] truncate">Back<span className="hidden sm:inline">{` · ${label}`}</span></span>
    </button>
  );
}
