"""Pydantic response models — the typed API contract used for response_model=
and (via OpenAPI) frontend type generation.

These mirror the exact JSON shapes the routers already return; attaching them
as response_model= documents the contract without changing the payloads.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    """Base for models populated from ORM objects (SQLModel rows)."""
    model_config = ConfigDict(from_attributes=True)


# ---- shared ------------------------------------------------------------
class OkResponse(BaseModel):
    ok: bool


class MarkedResponse(BaseModel):
    ok: bool
    marked: int


class VoteResultOut(BaseModel):
    ok: bool
    value: int


class PlayerRef(ORMModel):
    id: int
    display_name: str


class VotersOut(BaseModel):
    upvoters: list[PlayerRef]
    downvoters: list[PlayerRef]


# ---- auth / me ---------------------------------------------------------
class LoginOut(BaseModel):
    token: str
    role: str
    player_id: int
    player_name: str


class MeOut(BaseModel):
    role: str | None
    player_id: int | None
    player_name: str | None
    sub: str | None
    iat: int | None
    exp: int | None


# ---- players / profiles ------------------------------------------------
class ProfileMetaOut(BaseModel):
    player_id: int
    bio: str
    extras_json: str
    header_image_updated_at: datetime | None
    updated_at: datetime | None


class ProfileOut(ProfileMetaOut):
    display_name: str


class PlayerMediaMetaOut(BaseModel):
    player_id: int
    updated_at: datetime


# ---- guestbook / pokes -------------------------------------------------
class GuestbookEntryOut(BaseModel):
    id: int
    profile_player_id: int
    author_player_id: int
    author_display_name: str
    parent_entry_id: int | None
    body: str
    created_at: datetime
    updated_at: datetime
    upvotes: int
    downvotes: int
    my_vote: int
    # Per-viewer: the requester may edit this entry right now (author within the
    # edit window, or an admin). Defaults to False on viewer-less paths.
    can_edit: bool = False


class PokeOut(BaseModel):
    id: int
    profile_player_id: int
    author_player_id: int
    author_display_name: str
    created_at: datetime
    seen_by_profile_owner: bool


class GuestbookSummaryOut(BaseModel):
    profile_player_id: int
    total_entries: int
    latest_entry_id: int
    latest_created_at: datetime | None
    entry_ids: list[int]


class PokeSummaryOut(BaseModel):
    profile_player_id: int
    total_pokes: int
    unread_by_profile_owner_count: int
    latest_poke_id: int
    latest_created_at: datetime | None
    poke_ids: list[int]


class PokeAuthoredUnreadOut(BaseModel):
    profile_player_id: int
    unread_count: int
    latest_created_at: datetime | None
    poke_ids: list[int]


class GuestbookReadMapOut(BaseModel):
    profile_player_id: int
    entry_ids: list[int]


class PokeReadMapOut(BaseModel):
    profile_player_id: int
    poke_ids: list[int]


class EntryIdsOut(BaseModel):
    entry_ids: list[int]


class PokeIdsOut(BaseModel):
    poke_ids: list[int]


# ---- clubs / leagues ---------------------------------------------------
class LeagueOut(ORMModel):
    id: int
    name: str


class ClubColumnsOut(ORMModel):
    """Raw Club row columns (create/patch responses)."""
    id: int
    name: str
    game: str
    star_rating: float
    league_id: int


class ClubOut(BaseModel):
    """Club joined with its league name (list response)."""
    id: int
    name: str
    game: str
    star_rating: float
    league_id: int
    league_name: str | None


# ---- friendlies --------------------------------------------------------
class FriendlySideOut(BaseModel):
    id: int
    side: str
    club_id: int | None
    goals: int
    players: list[PlayerRef]


class FriendlyOut(BaseModel):
    id: int
    mode: str
    state: str
    date: date
    created_at: datetime
    updated_at: datetime
    sides: list[FriendlySideOut]


# ---- matches -----------------------------------------------------------
class MatchPatchResultOut(BaseModel):
    ok: bool
    id: int
    state: str
    leg: int
    tournament_status: str


# ---- comments ----------------------------------------------------------
class CommentOut(BaseModel):
    id: int
    tournament_id: int
    match_id: int | None
    parent_comment_id: int | None = None
    author_player_id: int | None
    body: str
    created_at: datetime
    updated_at: datetime
    has_image: bool
    image_updated_at: datetime | None
    upvotes: int
    downvotes: int
    my_vote: int
    # Per-viewer: the requester may edit this comment right now (author within the
    # edit window, or an admin). Defaults to False on viewer-less paths (e.g. WS upserts).
    can_edit: bool = False


class CommentListOut(BaseModel):
    pinned_comment_id: int | None
    comments: list[CommentOut]


class CommentSummaryOut(BaseModel):
    tournament_id: int
    comment_ids: list[int]
    latest_comment_id: int
    latest_updated_at: datetime | None
    total_comments: int


class CommentIdsOut(BaseModel):
    comment_ids: list[int]


class CommentReadMapOut(BaseModel):
    tournament_id: int
    comment_ids: list[int]


class PinnedCommentOut(BaseModel):
    pinned_comment_id: int | None


# ---- tournaments -------------------------------------------------------
class OddsOut(BaseModel):
    home: float
    draw: float
    away: float
    p_home: float
    p_draw: float
    p_away: float
    model: str
    updated_at: datetime


class MatchSideOut(BaseModel):
    id: int
    side: str
    club_id: int | None
    goals: int
    players: list[PlayerRef]


class MatchOut(BaseModel):
    id: int
    tournament_id: int
    leg: int
    order_index: int
    state: str
    started_at: datetime | None
    finished_at: datetime | None
    sides: list[MatchSideOut]
    odds: OddsOut | None


class CupStakeOut(BaseModel):
    key: str
    name: str
    owner_player_id: int | None
    owner_player_name: str | None


class TournamentSummaryOut(ORMModel):
    """Raw Tournament row columns (create/patch responses)."""
    id: int
    name: str
    mode: str
    status: str
    date: date
    created_at: datetime
    updated_at: datetime
    settings_json: str
    decider_type: str
    decider_winner_player_id: int | None
    decider_loser_player_id: int | None
    decider_winner_goals: int | None
    decider_loser_goals: int | None


class TournamentDetailOut(BaseModel):
    id: int
    name: str
    mode: str
    status: str
    settings_json: str
    date: date
    created_at: datetime
    updated_at: datetime
    players: list[PlayerRef]
    matches: list[MatchOut]
    decider_type: str
    decider_winner_player_id: int | None
    decider_loser_player_id: int | None
    decider_winner_goals: int | None
    decider_loser_goals: int | None


class TournamentListItemOut(TournamentSummaryOut):
    cup_stakes: list[CupStakeOut]
    winner_string: str | None
    winner_decider_string: str | None
    participants: list[PlayerRef]


class TournamentLiveOut(BaseModel):
    id: int
    name: str
    mode: str
    date: date
    created_at: datetime
    updated_at: datetime
    status: str


class TournamentDateOut(BaseModel):
    ok: bool
    date: date


class ScheduleGeneratedOut(BaseModel):
    ok: bool
    matches: int
    labels: dict[str, str]


class DeciderResultOut(BaseModel):
    ok: bool
    decider_type: str
    decider_winner_player_id: int | None
    decider_loser_player_id: int | None
    decider_winner_goals: int | None
    decider_loser_goals: int | None


class ReassignResultOut(BaseModel):
    ok: bool
    matches: int
    second_leg: bool
    status: str


class TournamentStatsPlayerOut(BaseModel):
    player_id: int
    name: str
    played: int
    wins: int
    draws: int
    losses: int
    gf: int
    ga: int
    gd: int
    pts: int
    lastN_avg_pts: float
    lastN_pts: list[int]
    lastN_gf: list[int]
    lastN_ga: list[int]


class TournamentStatsOut(BaseModel):
    players: list[TournamentStatsPlayerOut]


# ---- cup ---------------------------------------------------------------
class CupDefOut(BaseModel):
    key: str
    name: str
    since_date: str | None


class CupDefsOut(BaseModel):
    cups: list[CupDefOut]


class CupStreakSinceOut(BaseModel):
    tournament_id: int | None
    tournament_name: str | None
    date: date | None


class CupStreakOut(BaseModel):
    tournaments_participated: int
    since: CupStreakSinceOut


class CupHistoryItemOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    tournament_id: int
    tournament_name: str
    date: date
    from_player: PlayerRef = Field(alias="from")
    to: PlayerRef
    streak_duration: int


class CupOut(BaseModel):
    cup: CupDefOut
    owner: PlayerRef | None
    streak: CupStreakOut
    history: list[CupHistoryItemOut]


# ---- push --------------------------------------------------------------
class KeyLabelOut(BaseModel):
    key: str
    label: str


class PushConfigOut(BaseModel):
    enabled: bool
    configured: bool
    vapid_public_key: str
    reason: str | None
    ios_home_screen_required: bool
    default_notification_language: str
    notification_languages: list[KeyLabelOut]
    default_notification_mode: str
    notification_modes: list[KeyLabelOut]


class PushSubscriptionResultOut(BaseModel):
    ok: bool
    id: int
    player_id: int
    endpoint: str
    disabled: bool
    updated_at: datetime
    notification_language: str
    notification_mode: str


class PushDisableOut(BaseModel):
    ok: bool
    disabled: bool


class PushSubscriptionItemOut(BaseModel):
    endpoint: str
    notification_language: str
    notification_mode: str
    app_platform: str
    app_standalone: bool


class PushSubscriptionsListOut(BaseModel):
    count: int
    endpoints: list[str]
    subscriptions: list[PushSubscriptionItemOut]


# ---- stats (simple, fully-typed endpoints) -----------------------------
class StatsBlockOut(BaseModel):
    key: str
    name: str
    description: str
    version: int


class StatsOverviewOut(BaseModel):
    blocks: list[StatsBlockOut]


class OddsResponseOut(BaseModel):
    odds: OddsOut


# NOTE: stats h2h, h2h-matches and player-matches are intentionally NOT typed.
# Their payloads are conditionally shaped: /h2h omits all player-focused fields
# when no player_id is given, and the *-matches endpoints mix real tournaments
# (with cup_stakes) and friendly pseudo-tournaments (without) under scope=both.
# A single strict response_model cannot reproduce those heterogeneous shapes.

# ---- stats: players ----------------------------------------------------
class StatsPlayersTournamentOut(BaseModel):
    id: int
    name: str
    date: date
    players_count: int
    cup_stakes: list[CupStakeOut]


class StatsPlayerRowOut(BaseModel):
    player_id: int
    display_name: str
    played: int
    wins: int
    draws: int
    losses: int
    gf: int
    ga: int
    gd: int
    pts: int
    lastN_pts: list[int]
    lastN_gf: list[int]
    lastN_ga: list[int]
    lastN_avg_pts: float
    positions_by_tournament: dict[int, int | None]


class StatsPlayersOut(BaseModel):
    generated_at: datetime
    mode: str
    cup_owner_player_id: int | None
    tournaments: list[StatsPlayersTournamentOut]
    players: list[StatsPlayerRowOut]
    lastN: int


# ---- stats: ratings ----------------------------------------------------
class RatingRowOut(BaseModel):
    player: PlayerRef
    played: int
    wins: int
    draws: int
    losses: int
    gf: int
    ga: int
    gd: int
    pts: int
    rating: float


class StatsRatingsOut(BaseModel):
    generated_at: datetime
    mode: str
    scope: str
    base_rating: float
    k: float
    rows: list[RatingRowOut]


# ---- stats: streaks ----------------------------------------------------
class StreakRunOut(BaseModel):
    player: PlayerRef
    length: int
    start_ts: datetime | None
    end_ts: datetime | None
    ongoing: bool


class StreakCategoryOut(BaseModel):
    key: str
    name: str
    description: str
    records: list[StreakRunOut]
    current: list[StreakRunOut]
    records_total: int
    current_total: int


class StatsStreaksOut(BaseModel):
    generated_at: datetime
    mode: str
    scope: str
    player: PlayerRef | None
    categories: list[StreakCategoryOut]
