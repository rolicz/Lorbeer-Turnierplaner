from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LoginBody(BaseModel):
    username: str = ""
    password: str = ""


class PlayerCreateBody(BaseModel):
    display_name: str


class PlayerPatchBody(BaseModel):
    display_name: str | None = None


class PlayerProfilePatchBody(BaseModel):
    bio: str | None = None


class PlayerGuestbookCreateBody(BaseModel):
    body: str = ""
    parent_entry_id: int | None = None
    author_player_id: int | None = None


class PlayerGuestbookVoteBody(BaseModel):
    value: int | str | None = 0


class PlayerPokeCreateBody(BaseModel):
    author_player_id: int | None = None


class TournamentCreateBody(BaseModel):
    name: str
    mode: Literal["1v1", "2v2"]
    settings: dict[str, Any] = Field(default_factory=dict)
    player_ids: list[int] = Field(default_factory=list)
    auto_generate: bool = False
    randomize: bool = True
    date: str | None = None


class TournamentPatchBody(BaseModel):
    name: str | None = None
    settings: dict[str, Any] | None = None


class TournamentDatePatchBody(BaseModel):
    date: str


class TournamentGenerateBody(BaseModel):
    randomize: bool = True


class TournamentReorderBody(BaseModel):
    match_ids: list[int] = Field(default_factory=list)


class TournamentSecondLegBody(BaseModel):
    enabled: bool = False


class TournamentReassignBody(BaseModel):
    randomize_order: bool = True


class TournamentDeciderPatchBody(BaseModel):
    type: str | None = "none"
    winner_player_id: int | str | None = None
    loser_player_id: int | str | None = None
    winner_goals: int | str | None = None
    loser_goals: int | str | None = None


class CommentCreateBody(BaseModel):
    body: str = ""
    match_id: int | None = None
    author_player_id: int | None = None
    has_image: bool = False
    event_type: str | None = None
    goal_minute: int | str | None = None
    goal_player_id: int | str | None = None
    goal_player_name: str | None = None
    result_score_a: int | str | None = None
    result_score_b: int | str | None = None


class CommentPatchBody(BaseModel):
    body: str | None = None
    author_player_id: int | None = None


class CommentVoteBody(BaseModel):
    value: int | str | None = 0


class CommentsPinBody(BaseModel):
    comment_id: int | None = None


class LeagueCreateBody(BaseModel):
    name: str


class ClubCreateBody(BaseModel):
    name: str
    game: str
    star_rating: float | int | str | None = None
    league_id: int | str | None = None


class ClubPatchBody(BaseModel):
    name: str | None = None
    game: str | None = None
    star_rating: float | int | str | None = None
    league_id: int | str | None = None


class MatchSidePatchBody(BaseModel):
    club_id: int | str | None = None
    goals: int | str | None = None


class MatchPatchBody(BaseModel):
    leg: int | str | None = None
    state: str | None = None
    sideA: MatchSidePatchBody | None = None
    sideB: MatchSidePatchBody | None = None


class FriendlyMatchCreateBody(BaseModel):
    mode: Literal["1v1", "2v2"]
    teamA_player_ids: list[int] = Field(default_factory=list)
    teamB_player_ids: list[int] = Field(default_factory=list)
    clubA_id: int | str | None = None
    clubB_id: int | str | None = None
    a_goals: int | str = 0
    b_goals: int | str = 0


class PushSubscriptionKeysBody(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionBody(BaseModel):
    endpoint: str
    expirationTime: int | float | None = None
    keys: PushSubscriptionKeysBody
    contentEncoding: str | None = "aes128gcm"
    app_platform: str | None = None
    app_standalone: bool | None = False
    user_agent: str | None = None
    notification_language: str | None = None
    notification_mode: str | None = None


class PushSubscriptionDeleteBody(BaseModel):
    endpoint: str
