// frontend/src/api/types.ts

export type Role = "reader" | "editor" | "admin";

export type TournamentMode = "1v1" | "2v2";
export type TournamentStatus = "draft" | "live" | "done";
export type MatchState = "scheduled" | "playing" | "finished";

export type DeciderType = "none" | "penalties" | "match";

export type Player = {
  id: number;
  display_name: string;
};

export type Club = {
  id: number;
  name: string;
  game: string; // e.g. "EA FC 26"
  star_rating: number; // 0.5 .. 5.0 (steps of 0.5)
  created_at?: string;
  updated_at?: string;
};

export type MatchSide = {
  id: number;
  side: "A" | "B";
  players: Player[];
  club_id: number | null;
  goals: number | null;
};

export type Match = {
  id: number;
  tournament_id: number;
  order_index: number;
  leg: 1 | 2;
  state: MatchState;
  started_at?: string | null;
  finished_at?: string | null;
  sides: MatchSide[];
};

export type TournamentSummary = {
  id: number;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;

  // yyyy-mm-dd (you added this)
  date?: string | null;

  created_at?: string;
  updated_at?: string;

  // Optional decider fields (used in overview/dashboard)
  decider_type?: DeciderType;
  decider_winner_player_id?: number | null;
  decider_loser_player_id?: number | null;
  decider_winner_goals?: number | null;
  decider_loser_goals?: number | null;
};

export type TournamentDetail = {
  id: number;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;

  date?: string | null;

  created_at?: string;
  updated_at?: string;

  // IMPORTANT: your LiveTournamentPage expects this
  players: Player[];

  matches: Match[];

  // Optional settings blob (if you use it)
  settings?: Record<string, unknown> | null;

  // Optional decider fields (so live view can show current decider too)
  decider_type?: DeciderType;
  decider_winner_player_id?: number | null;
  decider_loser_player_id?: number | null;
  decider_winner_goals?: number | null;
  decider_loser_goals?: number | null;
};

// ---- Auth / Me ----
export type LoginResponse = {
  token: string;
  role: Exclude<Role, "reader">; // tokens are for editor/admin
};

export type MeResponse = {
  role: Role;
};

// ---- API payload helpers ----
export type PatchMatchBody = {
  state: MatchState;
  sideA: { club_id: number | null; goals: number };
  sideB: { club_id: number | null; goals: number };
};

export type PatchTournamentStatusBody = {
  status: TournamentStatus;
};

// ---- Challenge Cup ----
export type CupHistoryEntry = {
  tournament_id: number;
  tournament_name: string;
  tournament_date: string | null;

  from_player_id: number;
  from_player_name: string;

  to_player_id: number;
  to_player_name: string;

  // e.g. "owner_beaten" / "draw_keep_owner" etc (whatever your backend emits)
  reason: string;

  // include decider info if the backend provides it
  decider_type?: DeciderType;
  decider_winner_goals?: number | null;
  decider_loser_goals?: number | null;
};

export type CupState = {
  owner_player_id: number;
  owner_player_name: string;

  // "streak duration (in tournaments the player participated)"
  streak_tournaments: number;

  history: CupHistoryEntry[];
};
