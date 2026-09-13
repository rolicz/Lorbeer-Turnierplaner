/** Small "what does this mean?" helpers shared by the stats sections: an info
 *  toggle button and the notes it reveals. */
import { Info } from "lucide-react";

/** Info icon button that toggles an explainer block. */
export function InfoButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={on}
      aria-label={label}
      title={label}
      className={
        "inline-flex h-5 w-5 items-center justify-center rounded-full align-middle transition focus-ring " +
        (on ? "text-accent" : "text-text-muted hover:text-text-normal")
      }
    >
      <Info size={12} aria-hidden="true" />
    </button>
  );
}

/** How the Elo-like rating is computed (shown next to the Elo column and the Elo trend). */
export function EloNote() {
  return (
    <div className="inset px-3 py-2 text-xs text-text-muted">
      Elo-like ladder: start <span className="font-mono text-text-normal">1000</span>, expected score uses the standard{" "}
      <span className="font-mono text-text-normal">400</span>-scale logistic curve,{" "}
      <span className="font-mono text-text-normal">K=24</span>. Goal difference boosts the update up to{" "}
      <span className="font-mono text-text-normal">3x</span> (capped). In 2v2, team rating is the average and the change is
      split across teammates.
    </div>
  );
}
