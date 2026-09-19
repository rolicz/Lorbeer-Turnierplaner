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
export type ClubStarHistory = S["ClubStarHistoryOut"];
export type ClubStarHistoryEntry = S["ClubStarHistoryEntryOut"];

// Matches / Tournaments
export type MatchSide = S["MatchSideOut"];
/** A match side inside a stats response: `MatchSide` plus the as-of `club_stars` (R4). */
export type StatsMatchSide = S["StatsMatchSideOut"];
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
// What a 2v2 re-assign would clear — the numbers its confirmation names (Q5).
export type ReassignPreview = S["ReassignPreviewOut"];
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

// Ideas / feature requests
export type IdeaKind = "feature" | "change" | "bug";
export type IdeaStatus = "new" | "planned" | "doing" | "done" | "declined";
// kind/status are typed as string in the generated schema; the backend validates them
// against exactly these values (`services/ideas_view.py`), so narrow them here.
export type Idea = Omit<S["IdeaOut"], "kind" | "status" | "my_vote"> & {
  kind: IdeaKind;
  status: IdeaStatus;
  my_vote: 0 | 1;
};
export type IdeaListResponse = Omit<S["IdeaListOut"], "ideas"> & { ideas: Idea[] };
export type IdeaArea = S["IdeaAreaOut"];
export type IdeaAreasResponse = S["IdeaAreasOut"];
// A flat comment under an idea. It rides inside the idea payload (`Idea.comments`,
// oldest first), so there is no list response and no query key of its own — and no
// edit: `can_delete` is its whole permission surface.
export type IdeaComment = S["IdeaCommentOut"];

// Auth
// Login endpoint never returns "reader" (that is the unauthenticated default, not a credential).
export type LoginResponse = Omit<S["LoginOut"], "role"> & { role: Exclude<Role, "reader"> };
// /me returns role: null when the caller has no player profile yet.
export type MeResponse = Omit<S["MeOut"], "role"> & { role: Role | null };

// Personal notifications (the bell). `kind` is a string in the generated schema; the
// backend builds exactly these seven, so narrow it here — once, for every consumer.
export type NotificationKind =
  | "comment_reply"
  | "guestbook"
  | "poke"
  | "idea_created"
  | "idea_comment"
  | "idea_vote"
  | "idea_status";
export type MyNotification = Omit<S["MyNotificationOut"], "kind"> & { kind: NotificationKind };
export type MyNotificationsResponse = Omit<S["MyNotificationsOut"], "items"> & {
  items: MyNotification[];
};

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

// Records (M1) — `/stats/records` is the one computation behind the Records page, the
// Streaks page's top rows and the profile's badge band. The two unions below are the
// deliberate narrowings: the backend types `key` and `group` as plain strings (they are
// `RECORD_DEFS` entries, not enums), and every consumer wants to switch on them.
export type RecordKey =
  | "most_titles" | "highest_elo" | "highest_elo_1v1" | "highest_elo_2v2"
  | "most_points" | "highest_ppm" | "most_played" | "most_goals_per_match"
  | "win_streak" | "unbeaten_streak" | "scoring_streak" | "clean_sheet_streak"
  | "biggest_win" | "highest_scoring_match" | "most_goals_one_side" | "biggest_upset";
export type RecordGroup = "title" | "elo" | "table" | "streak" | "match";
export type StatsRecordHolder = S["RecordHolderOut"];
export type StatsRecordLeader = S["RecordLeaderOut"];
export type StatsRecordMatch = S["StatsRecordMatchOut"];
export type StatsRecord = Omit<S["StatsRecordOut"], "key" | "group"> & { key: RecordKey; group: RecordGroup };
export type StatsRecordsResponse = Omit<S["StatsRecordsOut"], "records"> & { records: StatsRecord[] };

// ---- FE-only types not derivable from generated schema -----------------

// Request body helpers
export type PatchMatchBody = {
  state?: MatchState;
  sideA?: { club_id?: number | null; goals?: number };
  sideB?: { club_id?: number | null; goals?: number };
};

// Stats match: subset of Match without tournament_id/odds (stats endpoints don't include them).
// Unlike Match, `state` stays a plain string here (the stats endpoints type it that way) and the
// raw response data flows directly into StatsMatch slots — so narrowing state to MatchState would
// force an `as MatchState` cast at every data-entry point instead of removing one. The single
// localized cast in MatchHistoryList (ScoreLine's `state`) is the deliberate narrowing boundary.
export type StatsMatch = S["StatsMatchOut"];

// H2H / player-matches — aliases to generated schema types
export type StatsH2HPair = S["StatsH2HPairOut"];
export type StatsH2HDuo = S["StatsH2HDuoOut"];
export type StatsH2HTeamRivalry = S["StatsH2HTeamRivalryOut"];
export type StatsH2HOpponentRow = S["StatsH2HOpponentRowOut"];
export type StatsH2HResponse = S["StatsH2HOut"];
export type StatsPlayerMatchesTournament = S["StatsTournamentMatchesOut"];
export type StatsH2HMatchesResponse = S["StatsH2HMatchesOut"];
export type StatsPlayerMatchesResponse = S["StatsPlayerMatchesOut"];
