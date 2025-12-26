export type Role = "reader" | "editor" | "admin";

export type Player = { id: number; display_name: string };

export type Club = { id: number; name: string; game: string; star_rating: number };

export type Tournament = {
  id: number;
  name: string;
  mode: "1v1" | "2v2";
  status: string;
};

export type MatchSide = {
  id: number;
  side: "A" | "B";
  goals: number;
  club_id: number | null;
  players: Player[];
};

export type Match = {
  id: number;
  leg: number;
  order_index: number;
  state: "scheduled" | "playing" | "finished";
  sides: MatchSide[];
};

export type TournamentDetail = Tournament & { matches: Match[] };

export type LoginResponse = { token: string; role: Role };
