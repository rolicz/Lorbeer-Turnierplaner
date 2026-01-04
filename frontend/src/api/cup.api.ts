import { apiFetch } from "./client";

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
  owner: CupOwner;
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

export function getCup(): Promise<CupResponse> {
  return apiFetch(`/cup`, { method: "GET" });
}
