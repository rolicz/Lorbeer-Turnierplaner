/**
 * API types — generated shapes derived from the backend OpenAPI schema,
 * plus purely frontend-side types and enums.
 *
 * To regenerate: run `make gen-types` from the repo root after changing
 * backend response models, then re-run `npm run check`.
 */
import type { components } from "./generated/schema";

type S = components["schemas"];

// ---- FE-only enums / literals ------------------------------------------
export type Role = "reader" | "editor" | "admin";
export type TournamentMode = "1v1" | "2v2";
export type TournamentStatus = "draft" | "live" | "done";
export type MatchState = "scheduled" | "playing" | "finished";
export type StatsScope = "tournaments" | "both" | "friendlies";
export type DeciderType = "none" | "penalties" | "match" | "scheresteinpapier";
export type PushNotificationLanguage = "english" | "deutsch" | "steirisch";
export type PushNotificationMode = "finished_only" | "all" | "off";

// ---- Aliases from generated schema -------------------------------------

// Players
export type Player = S["PlayerRef"];
export type VoteVoter = S["PlayerRef"];
export type VoteVotersResponse = S["VotersOut"];
export type PlayerProfile = S["ProfileOut"];
export type PlayerProfileMeta = S["ProfileMetaOut"];
export type PlayerMediaMeta = S["PlayerMediaMetaOut"];

// Guestbook
export type PlayerGuestbookEntry = S["GuestbookEntryOut"];
export type PlayerGuestbookSummary = S["GuestbookSummaryOut"];
export type PlayerGuestbookReadIds = S["EntryIdsOut"];
export type PlayerGuestbookReadMapRow = S["GuestbookReadMapOut"];

// Pokes
export type PlayerPoke = S["PokeOut"];
export type PlayerPokeSummary = S["PokeSummaryOut"];
export type PlayerPokeAuthoredUnreadSummary = S["PokeAuthoredUnreadOut"];
export type PlayerPokeReadIds = S["PokeIdsOut"];
export type PlayerPokeReadMapRow = S["PokeReadMapOut"];

// Clubs / Leagues
export type League = S["LeagueOut"];
export type Club = S["ClubOut"];

// Matches / Tournaments
export type MatchSide = S["MatchSideOut"];
export type MatchOdds = S["OddsOut"];
// state/leg are typed as string/int in generated schema; backend only returns these exact values.
// started_at/finished_at are nullable strings (generated schema may say string | null already, but we make it explicit).
export type Match = Omit<S["MatchOut"], "state" | "leg" | "started_at" | "finished_at"> & {
  state: MatchState;
  leg: 1 | 2;
  started_at: string | null;
  finished_at: string | null;
};
export type TournamentCupStake = S["CupStakeOut"];
// cup_stakes is absent from some list endpoints; mode/status are narrowed from string to the known literal unions.
export type TournamentSummary = Omit<S["TournamentListItemOut"], "cup_stakes" | "mode" | "status"> & {
  cup_stakes?: TournamentCupStake[];
  mode: TournamentMode;
  status: TournamentStatus;
};
// matches typed as Match[] (our narrowed type) instead of the generated MatchOut[]; mode/status same as TournamentSummary.
export type TournamentDetail = Omit<S["TournamentDetailOut"], "mode" | "status" | "matches"> & {
  mode: TournamentMode;
  status: TournamentStatus;
  matches: Match[];
};
// mode/status same as TournamentSummary — backend guarantees these values.
export type TournamentLive = Omit<S["TournamentLiveOut"], "mode" | "status"> & {
  mode: TournamentMode;
  status: TournamentStatus;
};

// my_vote: generated schema uses int; backend only ever returns -1, 0, or 1.
export type Comment = Omit<S["CommentOut"], "my_vote"> & { my_vote: -1 | 0 | 1 };
export type TournamentCommentsResponse = S["CommentListOut"];
export type TournamentCommentsSummary = S["CommentSummaryOut"];
export type TournamentCommentReadIds = S["CommentIdsOut"];
export type TournamentCommentReadMapRow = S["CommentReadMapOut"];

// Auth
// Login endpoint never returns "reader" (that is the unauthenticated default, not a credential).
export type LoginResponse = Omit<S["LoginOut"], "role"> & { role: Exclude<Role, "reader"> };
// /me returns role: null when the caller has no player profile yet.
export type MeResponse = Omit<S["MeOut"], "role"> & { role: Role | null };

// Push notification language/mode are typed as string in the generated schema; narrow to the known values.
// If the backend adds a new language or mode, add it to PushNotificationLanguage/PushNotificationMode above.
export type PushConfigResponse = Omit<S["PushConfigOut"], "notification_languages" | "notification_modes" | "default_notification_language" | "default_notification_mode"> & {
  default_notification_language?: PushNotificationLanguage;
  notification_languages?: { key: PushNotificationLanguage; label: string }[];
  default_notification_mode?: PushNotificationMode;
  notification_modes?: { key: PushNotificationMode; label: string }[];
};
// Same reason as PushConfigResponse — backend returns known literals, not arbitrary strings.
export type PushSubscriptionPutResponse = Omit<S["PushSubscriptionResultOut"], "notification_language" | "notification_mode"> & {
  notification_language: PushNotificationLanguage;
  notification_mode: PushNotificationMode;
};
// Same reason as PushConfigResponse — language/mode in each subscription are known literals.
export type PushSubscriptionsMineResponse = Omit<S["PushSubscriptionsListOut"], "subscriptions"> & {
  subscriptions: {
    endpoint: string;
    notification_language: PushNotificationLanguage;
    notification_mode: PushNotificationMode;
    app_platform?: string | null;
    app_standalone?: boolean;
  }[];
};

// Cup
export type CupDef = S["CupDefOut"];
export type CupOut = S["CupOut"];

// Friendlies
export type FriendlyMatch = S["FriendlyOut"];
export type FriendlySide = S["FriendlySideOut"];

// Stats
export type StatsPlayerRow = S["StatsPlayerRowOut"];
// cup_stakes is omitted from some stats responses; make it optional rather than required.
export type StatsTournamentLite = Omit<S["StatsPlayersTournamentOut"], "cup_stakes"> & {
  cup_stakes?: TournamentCupStake[];
};
export type StatsPlayersResponse = S["StatsPlayersOut"];
export type StatsRatingsRow = S["RatingRowOut"];
export type StatsRatingsResponse = S["StatsRatingsOut"];
export type StatsStreakRun = S["StreakRunOut"];
export type StatsStreakRow = S["StreakRunOut"];
export type StatsStreakCategory = S["StreakCategoryOut"];
export type StatsStreaksResponse = S["StatsStreaksOut"];

// ---- FE-only types not derivable from generated schema -----------------

// Request body helpers
export type PatchMatchBody = {
  state?: MatchState;
  sideA?: { club_id?: number | null; goals?: number };
  sideB?: { club_id?: number | null; goals?: number };
};

// H2H / player-matches responses are intentionally untyped in the backend
// (conditionally shaped payloads); hand-written types remain the contract here.
export type StatsH2HPlayerLite = {
  id: number;
  display_name: string;
};

export type StatsH2HTeamRivalry = {
  team1: StatsH2HPlayerLite[];
  team2: StatsH2HPlayerLite[];
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
  win_share_a: number;
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
  scope?: StatsScope;
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
  nemesis_1v1?: StatsH2HOpponentRow | null;
  favorite_victim_1v1?: StatsH2HOpponentRow | null;
  nemesis_2v2?: StatsH2HOpponentRow | null;
  favorite_victim_2v2?: StatsH2HOpponentRow | null;
};

export type StatsPlayerMatchesTournament = {
  id: number;
  name: string;
  date: string;
  mode: "1v1" | "2v2";
  status: string;
  cup_stakes?: TournamentCupStake[];
  matches: Match[];
};

export type StatsH2HMatchesResponse = {
  generated_at: string;
  mode: "overall" | "1v1" | "2v2";
  relation: "opposed" | "teammates";
  scope?: StatsScope;
  left_player_ids: number[];
  right_player_ids: number[];
  tournaments: StatsPlayerMatchesTournament[];
};

export type StatsPlayerMatchesResponse = {
  generated_at: string;
  scope?: StatsScope;
  player: StatsH2HPlayerLite | null;
  tournaments: StatsPlayerMatchesTournament[];
};
