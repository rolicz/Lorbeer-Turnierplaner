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


class MyNotificationOut(BaseModel):
    """One item in the personal notification bell.

    Every kind shares this one shape and fills the fields that apply — the union of
    seven kinds rather than seven models, because the bell renders one row type and
    the client narrows `kind` itself. `created_at` is a **string**: the router has
    always built `.isoformat()` and the wire format does not move for a type.
    """
    #: "comment_reply" | "guestbook" | "poke" | "idea_created" | "idea_comment"
    #: | "idea_vote" | "idea_status"
    kind: str
    #: Unique within its kind — the row the item came from (a comment, a poke, an
    #: idea event). The bell's optimistic drop keys on (kind, id).
    id: int
    author_name: str
    snippet: str
    created_at: str
    #: Client route that opens the item, e.g. `/live/12?comment=34`.
    path: str

    author_player_id: int | None = None
    tournament_id: int | None = None
    match_id: int | None = None
    profile_player_id: int | None = None
    idea_id: int | None = None
    idea_title: str | None = None
    idea_status: str | None = None


class MyNotificationsOut(BaseModel):
    items: list[MyNotificationOut]
    #: Every unread item, not just the ones that fit in `items`.
    unread_count: int


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
    nation: str | None


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
    league_nation: str | None
    # Set when a real crest image exists (served at /clubs/{id}/crest);
    # doubles as the cache buster. None = frontend renders a monogram badge.
    crest_updated_at: datetime | None


class ClubStarHistoryEntryOut(BaseModel):
    """One recorded rating. Valid from `valid_from` until the next entry."""
    stars: float
    valid_from: date
    changed_at: datetime
    # "live" (a star edit), "seed" (the club's opening row) or "recovered"
    # (reconstructed from a backup snapshot — the day is an upper bound, not exact).
    source: str


class ClubStarHistoryOut(BaseModel):
    club_id: int
    current_stars: float
    entries: list[ClubStarHistoryEntryOut]


class ClubCrestMetaOut(BaseModel):
    club_id: int
    updated_at: datetime


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
    # Per-caller capability flags (A10). Computed server-side against server time, so the
    # client renders its controls from these instead of re-deriving the rule. Viewer-less
    # paths (a reader, the websocket broadcast) get False.
    can_edit: bool = False
    can_delete: bool = False


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


# ---- ideas / feature requests ------------------------------------------
class IdeaAreaOut(BaseModel):
    key: str
    label: str
    #: False for a retired area: it still labels the old requests that name it,
    #: but it is not offered when writing a new one (`app/feature_areas.py`).
    selectable: bool


class IdeaAreasOut(BaseModel):
    areas: list[IdeaAreaOut]


class IdeaCommentOut(BaseModel):
    """One flat comment under an idea (P1).

    `can_delete` is the whole permission surface: an idea comment cannot be edited —
    a typo is fixed by deleting and reposting — so there is no `can_edit` here and no
    PATCH behind it. `updated_at` is carried because the row has it; nothing moves it.
    """
    id: int
    request_id: int
    author_player_id: int
    author_display_name: str
    body: str
    created_at: datetime
    updated_at: datetime
    #: The comment's author, or an admin. A reader gets False (R5's pattern).
    can_delete: bool = False


class IdeaOut(BaseModel):
    id: int
    author_player_id: int
    author_display_name: str
    title: str
    body: str
    kind: str
    status: str
    status_note: str
    #: Raw area keys, in catalog order. A key this build no longer knows is still
    #: returned — the client labels it with the key itself rather than dropping it.
    areas: list[str]
    created_at: datetime
    updated_at: datetime
    #: When the author's own text last changed — `updated_at` also moves for a
    #: status change or an image, so only this one may say "edited".
    edited_at: datetime | None
    has_image: bool
    image_updated_at: datetime | None
    votes: int
    #: 0 or 1 — an idea takes a "+1", never a downvote.
    my_vote: int
    # Per-caller capability flags (R5, the A10 pattern). Computed server-side, so the
    # page renders its controls from these and never re-derives the rule. A reader
    # (and every viewer-less path) gets False.
    can_edit: bool = False
    can_delete: bool = False
    can_set_status: bool = False
    #: The idea's comments, oldest first. Required, not defaulted: the list rides in
    #: this payload rather than behind a second endpoint, and a client must never
    #: have to guess whether it was omitted or is genuinely empty.
    comments: list[IdeaCommentOut]


class IdeaListOut(BaseModel):
    ideas: list[IdeaOut]


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
    # Per-caller capability flags (A10). Computed server-side against server time, so the
    # client renders its controls from these instead of re-deriving the rule. Viewer-less
    # paths (a reader, the websocket broadcast) get False.
    can_edit: bool = False
    can_delete: bool = False
    can_set_decider: bool = False


class TournamentListItemOut(TournamentSummaryOut):
    cup_stakes: list[CupStakeOut]
    winner_string: str | None
    winner_decider_string: str | None
    participants: list[PlayerRef]
    # Per-caller capability flags (A10). Computed server-side against server time, so the
    # client renders its controls from these instead of re-deriving the rule. Viewer-less
    # paths (a reader, the websocket broadcast) get False.
    can_edit: bool = False
    can_delete: bool = False
    can_set_decider: bool = False


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


class ReassignPreviewOut(BaseModel):
    """What a 2v2 re-assign would clear, counted before it is asked for (Q5)."""

    matches: int
    matches_with_score: int
    matches_with_club: int
    comments: int


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
class CupEraOut(BaseModel):
    since: str
    mode: str  # "1v1" | "2v2" | "any"


class CupDefOut(BaseModel):
    key: str
    name: str
    since_date: str | None
    eras: list[CupEraOut] = []


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


# ---- stats: H2H and match history -------------------------------------
class StatsMatchSideOut(MatchSideOut):
    """
    A match side as stats sees it: the club's rating **on the day the match was
    played** (R4), not today's. `None` when the side had no club — or, for a very
    old database, when the club has no recorded history at all.

    Deliberately not on `MatchSideOut` itself: a live tournament shows the rating a
    club has *now*, which is the same question the picker and the odds ask.
    """
    club_stars: float | None = None


class StatsMatchOut(BaseModel):
    """Match inside a stats response — no tournament_id or odds."""
    id: int
    leg: int
    order_index: int
    state: str
    started_at: datetime | None
    finished_at: datetime | None
    sides: list[StatsMatchSideOut]


class StatsTournamentMatchesOut(BaseModel):
    """Tournament grouping returned by h2h-matches and player-matches."""
    id: int
    name: str
    date: date
    mode: str
    status: str
    # cup_stakes absent for friendly pseudo-tournaments (scope=both)
    cup_stakes: list[CupStakeOut] | None = None
    matches: list[StatsMatchOut]


class StatsH2HPairOut(BaseModel):
    a: PlayerRef
    b: PlayerRef
    played: int
    a_wins: int
    draws: int
    b_wins: int
    a_gf: int
    a_ga: int
    b_gf: int
    b_ga: int
    win_share_a: float
    rivalry_score: float
    dominance_score: float


class StatsH2HDuoOut(BaseModel):
    p1: PlayerRef
    p2: PlayerRef
    played: int
    wins: int
    draws: int
    losses: int
    gf: int
    ga: int
    gd: int
    pts: int
    pts_per_match: float
    win_rate: float


class StatsH2HTeamRivalryOut(BaseModel):
    team1: list[PlayerRef]
    team2: list[PlayerRef]
    played: int
    team1_wins: int
    draws: int
    team2_wins: int
    team1_gf: int
    team1_ga: int
    team2_gf: int
    team2_ga: int
    win_share_team1: float
    rivalry_score: float
    dominance_score: float


class StatsH2HOpponentRowOut(BaseModel):
    opponent: PlayerRef
    played: int
    wins: int
    draws: int
    losses: int
    gf: int
    ga: int
    gd: int
    pts: int
    pts_per_match: float
    win_rate: float


class StatsH2HOut(BaseModel):
    generated_at: datetime
    scope: str
    limit: int
    order: str
    player: PlayerRef | None
    rivalries_all: list[StatsH2HPairOut]
    rivalries_1v1: list[StatsH2HPairOut]
    rivalries_2v2: list[StatsH2HPairOut]
    team_rivalries_2v2: list[StatsH2HTeamRivalryOut]
    dominance_1v1: list[StatsH2HPairOut]
    best_teammates_2v2: list[StatsH2HDuoOut]
    # present only when player_id was supplied
    vs_all: list[StatsH2HOpponentRowOut] | None = None
    vs_1v1: list[StatsH2HOpponentRowOut] | None = None
    vs_2v2: list[StatsH2HOpponentRowOut] | None = None
    with_2v2: list[StatsH2HDuoOut] | None = None
    team_rivalries_2v2_for_player: list[StatsH2HTeamRivalryOut] | None = None
    nemesis_all: StatsH2HOpponentRowOut | None = None
    favorite_victim_all: StatsH2HOpponentRowOut | None = None
    nemesis_1v1: StatsH2HOpponentRowOut | None = None
    favorite_victim_1v1: StatsH2HOpponentRowOut | None = None
    nemesis_2v2: StatsH2HOpponentRowOut | None = None
    favorite_victim_2v2: StatsH2HOpponentRowOut | None = None


class StatsH2HMatchesOut(BaseModel):
    generated_at: datetime
    mode: str
    relation: str
    scope: str
    left_player_ids: list[int]
    right_player_ids: list[int]
    tournaments: list[StatsTournamentMatchesOut]


class StatsPlayerMatchesOut(BaseModel):
    generated_at: datetime
    scope: str
    player: PlayerRef | None
    tournaments: list[StatsTournamentMatchesOut]


# ---- stats: ratings history --------------------------------------------
class RatingHistorySnapshotOut(BaseModel):
    tournament_id: int
    date: str
    tournament_name: str
    rating_after: float
    delta: float


class PlayerRatingHistoryOut(BaseModel):
    player: PlayerRef
    history: list[RatingHistorySnapshotOut]


class StatsRatingsHistoryOut(BaseModel):
    generated_at: datetime
    mode: str
    scope: str
    base_rating: float
    players: list[PlayerRatingHistoryOut]


# ---- stats: players ----------------------------------------------------
class StatsPlayersTournamentOut(BaseModel):
    id: int
    name: str
    date: date
    mode: str
    status: str
    players_count: int
    cup_stakes: list[CupStakeOut]
    winner_player_id: int | None = None


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
    scope: str
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
