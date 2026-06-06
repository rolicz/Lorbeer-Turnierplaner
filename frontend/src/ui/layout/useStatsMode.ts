import { useSyncExternalStore } from "react";

/**
 * Stats experience toggle (Classic vs Insights), persisted in localStorage and
 * reactive across components in the same tab via a custom event.
 */
export type StatsMode = "classic" | "insights";

const KEY = "stats-experience";
const EVENT = "stats-experience-change";

function read(): StatsMode {
  // New "insights" dashboard is the default; classic is opt-out.
  return localStorage.getItem(KEY) === "classic" ? "classic" : "insights";
}

export function setStatsExperience(mode: StatsMode) {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useStatsExperience(): StatsMode {
  return useSyncExternalStore(subscribe, read, () => "classic");
}
