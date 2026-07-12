import { apiFetch } from "./client";

export type CupEra = { since: string; mode: "1v1" | "2v2" | "any" };

export type CupDef = { key: string; name: string; since_date: string | null; eras?: CupEra[] };

export type CupOwner = { id: number; display_name: string };

export type CupHistoryItem = {
  tournament_id: number;
  tournament_name: string;
  date: string;
  from: CupOwner;
  to: CupOwner;
  streak_duration: number;
};

export type CupResponse = {
  cup: CupDef;
  owner: CupOwner | null;
  streak: {
    tournaments_participated: number;
    since: {
      tournament_id: number | null;
      tournament_name: string | null;
      date: string | null;
    };
  };
  history: CupHistoryItem[];
};

/**
 * Mode of the cup's era active on `today` (the last era with `since <= today`);
 * `"any"` when there are no eras or none has started yet. Mirrors the backend's
 * `CupDef.active_era_mode`. Robust to unsorted input.
 */
export function currentEraMode(eras: CupEra[] | undefined, today: Date = new Date()): CupEra["mode"] {
  const iso = today.toISOString().slice(0, 10);
  let best: CupEra | null = null;
  for (const e of eras ?? []) {
    if (e.since <= iso && (!best || e.since > best.since)) best = e;
  }
  return best?.mode ?? "any";
}

export function listCupDefs(): Promise<{ cups: CupDef[] }> {
  return apiFetch(`/cup/defs`, { method: "GET" });
}

export function getCup(key?: string | null): Promise<CupResponse> {
  const q = key ? `?key=${encodeURIComponent(key)}` : "";
  return apiFetch(`/cup${q}`, { method: "GET" });
}
