// This file contains deprecated theme functions to avoid breaking imports
// during the refactoring. These should be removed once all components
// are updated to use the new theme functions.

export function matchColor(state: any) {
  if (state === "playing") return "bg-status-bg-green text-status-text-green";
  if (state === "scheduled") return "bg-status-bg-blue text-status-text-blue";
  return "bg-status-bg-default text-status-text-default";
}

export function tournamentColor(status: any) {
  if (status === "live") return "bg-status-bg-green text-status-text-green";
  if (status === "draft") return "bg-status-bg-blue text-status-text-blue";
  return "bg-status-bg-default text-status-text-default";
}
