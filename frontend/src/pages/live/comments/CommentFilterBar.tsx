/** The scope filter for the comments feed: an "All"/"General" pair plus one chip per match with comments. */

export type CommentFilterValue = "all" | "general" | number;

/** A match chip descriptor, precomputed by the coordinator (label + unseen state resolved). */
export type CommentMatchChip = {
  matchId: number;
  label: string;
  count: number;
  unseen: boolean;
};

/** A single scope filter chip. */
function FilterChip({
  active,
  onClick,
  label,
  count,
  unseen = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  unseen?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition focus-ring " +
        (active
          ? "bg-accent/15 text-accent font-medium"
          : "bg-bg-card-chip/60 text-text-muted hover:text-text-normal")
      }
    >
      <span className="whitespace-nowrap">{label}</span>
      {typeof count === "number" ? <span className="tabular-nums text-xs opacity-80">{count}</span> : null}
      {unseen ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
    </button>
  );
}

export default function CommentFilterBar({
  filter,
  onChange,
  totalCount,
  generalCount,
  generalUnseen,
  matchChips,
}: {
  filter: CommentFilterValue;
  onChange: (filter: CommentFilterValue) => void;
  totalCount: number;
  generalCount: number;
  generalUnseen: boolean;
  matchChips: CommentMatchChip[];
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5" data-no-swipe-nav>
      <FilterChip active={filter === "all"} onClick={() => onChange("all")} label="All" count={totalCount} />
      <FilterChip
        active={filter === "general"}
        onClick={() => onChange("general")}
        label="General"
        count={generalCount}
        unseen={generalUnseen}
      />
      {matchChips.map((chip) => (
        <FilterChip
          key={chip.matchId}
          active={filter === chip.matchId}
          onClick={() => onChange(chip.matchId)}
          label={chip.label}
          count={chip.count}
          unseen={chip.unseen}
        />
      ))}
    </div>
  );
}
