export type MatchState = "scheduled" | "playing" | "finished";
export type TournamentStatus = "draft" | "live" | "done";

function pillBase() {
  return "bg-neutral-950 text-zinc-300 border-zinc-600";
}

export function pillBaseClass() {
  return pillBase();
}

export function matchColor(state: MatchState) {
  if (state === "playing") return "bg-status-live/10 text-status-live";
  if (state === "scheduled") return "bg-status-draft/10 text-status-draft";
  return pillBase();
}

export function matchStatusPill(state: MatchState) {
  if (state === "playing") return `${matchColor(state)} border-status-live/40`;
  if (state === "scheduled") return `${matchColor(state)} border-status-draft/40`;
  return pillBase();
}

export function tournamentStatusPill(status: TournamentStatus) {
  if (status === "live") return `${tournamentColor(status)} border-status-live/40`;
  if (status === "draft") return `${tournamentColor(status)} border-status-draft/40`;
  return pillBase();
}

export function tournamentColor(status: TournamentStatus) {
  if (status === "live") return "bg-status-live/10 text-status-live";
  if (status === "draft") return "bg-status-draft/10 text-status-draft";
  return pillBase();
}

export function pillDateClass() {
  return `font-mono tabular-nums ${pillBase()}`;
}

export function tournamentStatusUI(status: TournamentStatus) {
  switch (status) {
    case "live":
      return {
        bar: "bg-status-live/70",
        label: "Live",
      };
    case "draft":
      return {
        bar: "bg-status-draft/70",
        label: "Draft",
      };
    case "done":
    default:
      return {
        bar: "bg-zinc-600",
        label: "Done",
      };
  }
}

export function matchPalette(state: MatchState) {
  switch (state) {
    case "playing":
      return {
        wrap: "border-status-live/60 bg-status-live/10 hover:bg-status-live/15 ring-1 ring-status-live/25",
        bar: "bg-status-live",
        win: "text-status-live",
        lose: "text-zinc-300/80",
      };
    case "scheduled":
      return {
        wrap: "border-status-draft/60 hover:bg-status-draft/15 ring-1 ring-status-draft/25",
        bar: "bg-status-draft/60",
        win: "text-zinc-100",
        lose: "text-zinc-300/80",
      };
    case "finished":
    default:
      return {
        wrap: "hover:bg-zinc-800 ring-1 ring-transparent",
        bar: "bg-zinc-600",
        win: "text-status-live",
        lose: "text-zinc-400",
      };
  }
}
