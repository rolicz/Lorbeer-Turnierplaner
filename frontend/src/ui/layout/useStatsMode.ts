import { useSyncExternalStore } from "react";

/**
 * Stats experience toggle (Classic vs Insights), persisted in localStorage and
 * reactive across components in the same tab via a custom event.
 */
export type StatsMode = "classic" | "insights";

const KEY = "stats-experience";
const EVENT = "stats-experience-change";

function read(): StatsMode {
  return localStorage.getItem(KEY) === "insights" ? "insights" : "classic";
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
