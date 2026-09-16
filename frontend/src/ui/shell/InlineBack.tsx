import { ChevronLeft } from "lucide-react";

import { useBack } from "./backNavigation";

/**
 * Compact desktop back chevron. `PageLayout` renders it for any page the reader
 * went *into* — the same question the mobile top bar asks (`useBack().hasBack`),
 * so the two chevrons cannot appear on different sets of pages. Below `lg` the
 * top bar owns the control, so this stays hidden there.
 */
export default function InlineBack({ className = "" }: { className?: string }) {
  const { goBack } = useBack();
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      title="Back"
      className={
        "hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl text-text-muted transition hover:bg-bg-card-chip/50 hover:text-text-normal focus-ring lg:inline-flex " +
        className
      }
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
