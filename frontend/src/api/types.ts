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

export type League = {
  id: number;
  name: string;
}

export type Club = {
  id: number;
  name: string;
  league_name: string;
  game: string; // e.g. "EA FC 26"
  league_id: number;
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

export type Comment = {
  id: number;
  tournament_id: number;
  match_id: number | null;
  author_player_id: number | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type TournamentCommentsResponse = {
  pinned_comment_id: number | null;
  comments: Comment[];
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

export type StatsTournamentLite = {
  id: number;
  name: string;
  date?: string | null;
  players_count: number;
};

export type StatsPlayerRow = {
  player_id: number;
  display_name: string;

  // overall
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;

  // last N matches (points per match: 3/1/0)
  lastN_pts: number[];
  lastN_avg_pts: number;

  // tournament_id -> position (1 = best). null if player did not participate.
  positions_by_tournament: Record<number, number | null>;
};

export type StatsPlayersResponse = {
  generated_at: string;
  cup_owner_player_id: number | null;
  tournaments: StatsTournamentLite[];
  players: StatsPlayerRow[];
  lastN: number;
};

export type StatsH2HPlayerLite = {
  id: number;
  display_name: string;
};

export type StatsH2HTeamRivalry = {
  team1: StatsH2HPlayerLite[]; // length 2
  team2: StatsH2HPlayerLite[]; // length 2
  played: number;
  team1_wins: number;
  draws: number;
  team2_wins: number;
  team1_gf: number;
  team1_ga: number;
  team2_gf: number;
  team2_ga: number;
  win_share_team1: number;
  rivalry_score: number;
  dominance_score: number;
};

export type StatsH2HPair = {
  a: StatsH2HPlayerLite;
  b: StatsH2HPlayerLite;

  played: number;
  a_wins: number;
  draws: number;
  b_wins: number;

  a_gf: number;
  a_ga: number;
  b_gf: number;
  b_ga: number;

  win_share_a: number; // 0..1 (excluding draws)
  rivalry_score: number;
  dominance_score: number;
};

export type StatsH2HDuo = {
  p1: StatsH2HPlayerLite;
  p2: StatsH2HPlayerLite;

  played: number;
  wins: number;
  draws: number;
  losses: number;

  gf: number;
  ga: number;
  gd: number;

  pts: number;
  pts_per_match: number;
  win_rate: number;
};

export type StatsH2HOpponentRow = {
  opponent: StatsH2HPlayerLite;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  pts_per_match: number;
  win_rate: number;
};

export type StatsH2HResponse = {
  generated_at: string;
  limit: number;
  order?: "rivalry" | "played";
  player: StatsH2HPlayerLite | null;

  rivalries_all: StatsH2HPair[];
  rivalries_1v1: StatsH2HPair[];
  rivalries_2v2: StatsH2HPair[];
  team_rivalries_2v2: StatsH2HTeamRivalry[];
  dominance_1v1: StatsH2HPair[];
  best_teammates_2v2: StatsH2HDuo[];

  vs_all?: StatsH2HOpponentRow[];
  vs_1v1?: StatsH2HOpponentRow[];
  vs_2v2?: StatsH2HOpponentRow[];
  with_2v2?: StatsH2HDuo[];
  team_rivalries_2v2_for_player?: StatsH2HTeamRivalry[];
  nemesis_all?: StatsH2HOpponentRow | null;
  favorite_victim_all?: StatsH2HOpponentRow | null;
};

export type StatsStreaksPlayerLite = {
  id: number;
  display_name: string;
};

export type StatsStreakRun = {
  length: number;
  start_ts: string | null;
  end_ts: string | null;
};

export type StatsStreakRow = StatsStreakRun & {
  player: StatsStreaksPlayerLite;
};

export type StatsStreakCategory = {
  key: string;
  name: string;
  description: string;
  records: StatsStreakRow[];
  records_total: number;
  current: StatsStreakRow[];
  current_total: number;
};

export type StatsStreaksResponse = {
  generated_at: string;
  mode: "overall" | "1v1" | "2v2";
  player: StatsStreaksPlayerLite | null;
  categories: StatsStreakCategory[];
};
