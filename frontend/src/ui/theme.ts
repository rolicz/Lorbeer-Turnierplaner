export type MatchState = "scheduled" | "playing" | "finished";
export type TournamentStatus = "draft" | "live" | "done";

export type MatchState = "scheduled" | "playing" | "finished";
export type TournamentStatus = "draft" | "live" | "done";

// --- Pills ---
// Default is used for "finished" or other neutral states
function pillDefault() {
  return "bg-status-bg-default text-status-text-default border-status-border-default";
}

function pillGreen() {
  return "bg-status-bg-green text-status-text-green border-status-border-green";
}

function pillBlue() {
  return "bg-status-bg-blue text-status-text-blue border-status-border-blue";
}

export function pillDateClass() {
  return `font-mono tabular-nums ${pillDefault()}`;
}

// --- Statuses (for Pills) ---
export function matchStatusPill(state: MatchState) {
  if (state === "playing") return pillGreen();
  if (state === "scheduled") return pillBlue();
  return pillDefault();
}

export function tournamentStatusPill(status: TournamentStatus) {
  if (status === "live") return pillGreen();
  if (status === "draft") return pillBlue();
  return pillDefault();
}


// --- UI Colors (for bars, backgrounds etc. - not pills) ---

export function tournamentStatusUI(status: TournamentStatus) {
  switch (status) {
    case "live":
      return { bar: "bg-status-bar-green", label: "Live" };
    case "draft":
      return { bar: "bg-status-bar-blue", label: "Draft" };
    case "done":
    default:
      return { bar: "bg-status-bar-default", label: "Done" };
  }
}

export function matchPalette(state: MatchState) {
  switch (state) {
    case "playing":
      return {
        wrap: "border-status-border-green bg-status-bg-green hover:bg-hover-green",
        bar: "bg-status-bar-green",
        win: "text-status-text-green",
        lose: "text-text-normal/80",
      };
    case "scheduled":
      return {
        wrap: "border-status-border-blue bg-status-bg-blue hover:bg-hover-blue",
        bar: "bg-status-bar-blue",
        win: "text-text-normal",
        lose: "text-text-normal/80",
      };
    case "finished":
    default:
      return {
        wrap: "border-status-border-default bg-status-bg-default hover:bg-hover-default",
        bar: "bg-status-bar-default",
        win: "text-status-text-green", // Winner is still highlighted
        lose: "text-text-muted",
      };
  }
}

// Legacy exports, keeping them to avoid breaking imports for now,
// but they are deprecated in favor of the more specific functions above.
export const colorMatch = matchStatusPill;
export const colorTournament = tournamentStatusPill;
export const pillBaseClass = pillDefault;
export { matchColor, tournamentColor } from "./theme-legacy";

