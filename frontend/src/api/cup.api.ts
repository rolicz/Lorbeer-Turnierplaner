import { apiFetch } from "./client";

export type CupDef = { key: string; name: string; since_date: string | null };

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

export function listCupDefs(): Promise<{ cups: CupDef[] }> {
  return apiFetch(`/cup/defs`, { method: "GET" });
}

export function getCup(key?: string | null): Promise<CupResponse> {
  const q = key ? `?key=${encodeURIComponent(key)}` : "";
  return apiFetch(`/cup${q}`, { method: "GET" });
}
