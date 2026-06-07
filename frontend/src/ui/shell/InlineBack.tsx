import { ChevronLeft } from "lucide-react";

import { useContextualBack } from "./routeMeta";

/**
 * Compact desktop-only back chevron for detail pages. On mobile the top bar
 * shows the contextual back control, so this stays hidden below `lg`.
 */
export default function InlineBack({ className = "" }: { className?: string }) {
  const { goBack } = useContextualBack();
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      title="Back"
      className={
        "hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-card-chip/50 hover:text-text-normal focus-ring lg:inline-flex " +
        className
      }
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
