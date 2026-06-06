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
      className="-ml-2 mb-3 inline-flex items-center gap-1 rounded-lg py-2 pl-1.5 pr-3 text-sm font-medium text-text-muted transition hover:bg-hover-default/40 hover:text-text-normal focus-ring"
    >
      <ChevronLeft className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
