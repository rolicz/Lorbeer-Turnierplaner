import type { MatchState, TournamentStatus } from "../api/types";
export type { MatchState, TournamentStatus } from "../api/types";

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

export function tournamentPalette(status: TournamentStatus) {
  switch (status) {
    case "live":
      return {
        wrap: "border-status-border-green bg-status-bg-green hover:bg-hover-green/20",
        bar: "bg-status-bar-green",
      };
    case "draft":
      return {
        wrap: "border-status-border-blue bg-status-bg-blue hover:bg-hover-blue/20",
        bar: "bg-status-bar-blue",
      };
    case "done":
    default:
      return {
        wrap: "border-status-border-default bg-status-bg-default hover:bg-hover-default/40",
        bar: "bg-status-bar-default",
      };
  }
}

// --- Decider type (the tournament's tie-break) ---
// One spelling for the type (C7, Rule 8): was an inline ternary at AdminPanel.tsx's
// decider chips; extracted here so the confirm dialog that removes a saved decider
// can name it without writing a second one.
const DECIDER_TYPE_LABEL: Record<"none" | "penalties" | "match" | "scheresteinpapier", string> = {
  none: "Keep draw",
  scheresteinpapier: "Schere-Stein-Papier Turnier",
  match: "Match",
  penalties: "Penalties",
};

export function deciderTypeLabel(type: "none" | "penalties" | "match" | "scheresteinpapier"): string {
  return DECIDER_TYPE_LABEL[type] ?? type;
}

export const pillBaseClass = pillDefault;
