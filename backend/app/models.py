import datetime as dt
from typing import List, Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class TournamentPlayer(SQLModel, table=True):
    tournament_id: int = Field(foreign_key="tournament.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class MatchSidePlayer(SQLModel, table=True):
    __mapper_args__ = {"confirm_deleted_rows": False}
    match_side_id: int = Field(foreign_key="matchside.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class FriendlyMatchSidePlayer(SQLModel, table=True):
    __mapper_args__ = {"confirm_deleted_rows": False}
    friendly_match_side_id: int = Field(foreign_key="friendlymatchside.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class Tournament(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    name: str
    mode: str = Field(index=True)  # "1v1" | "2v2"
    status: str = Field(default="draft", index=True)

    date: dt.date = Field(default_factory=dt.date.today)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    settings_json: str = Field(default="{}")

    players: List["Player"] = Relationship(back_populates="tournaments", link_model=TournamentPlayer)
    matches: List["Match"] = Relationship(back_populates="tournament")

    # Decider for drawn tournaments
    # type: "none" | "penalties" | "match" | "scheresteinpapier"
    decider_type: str = Field(default="none")

    decider_winner_player_id: int | None = Field(default=None, foreign_key="player.id")
    decider_loser_player_id: int | None = Field(default=None, foreign_key="player.id")

    decider_winner_goals: int | None = Field(default=None)
    decider_loser_goals: int | None = Field(default=None)


class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    display_name: str = Field(index=True, unique=True)

    tournaments: List["Tournament"] = Relationship(back_populates="players", link_model=TournamentPlayer)


class PlayerProfile(SQLModel, table=True):
    """
    Extensible profile payload for player-facing features.
    Keep this separate from Player to avoid destructive schema migrations.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    bio: str = Field(default="")
    extras_json: str = Field(default="{}")
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerAvatarFile(SQLModel, table=True):
    """
    Preferred avatar storage (metadata in DB, bytes on disk/object storage).
    Metadata-only row for filesystem-backed avatar storage.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerHeaderImageFile(SQLModel, table=True):
    """
    Profile header image storage (metadata in DB, bytes on disk/object storage).
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_player_id: int = Field(foreign_key="player.id", index=True)
    author_player_id: int = Field(foreign_key="player.id", index=True)
    body: str
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookThreadLink(SQLModel, table=True):
    """
    Optional parent-child relation for guestbook threads.
    Top-level entries have no row in this table.
    """
    entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    parent_entry_id: int = Field(foreign_key="playerguestbookentry.id", index=True)


class PlayerGuestbookVote(SQLModel, table=True):
    """
    Per-player vote for a guestbook entry.
    value: +1 (upvote) or -1 (downvote)
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    guestbook_entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    value: int = Field(default=1)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookRead(SQLModel, table=True):
    """
    Per-player read tracking for guestbook entries.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    guestbook_entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerPoke(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_player_id: int = Field(foreign_key="player.id", index=True)
    author_player_id: int = Field(foreign_key="player.id", index=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerPokeRead(SQLModel, table=True):
    """
    Per-player read tracking for profile pokes.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    poke_id: int = Field(foreign_key="playerpoke.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class League(SQLModel, table=True):
    """
    Backend-managed lookup table.
    Clubs reference leagues by ID, so renaming a league does not break history.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)

    clubs: List["Club"] = Relationship(back_populates="league")



class Club(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("name", "game", name="uq_club_name_game"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    game: str = Field(index=True)
    star_rating: float = Field(default=3.0, ge=0.5, le=5.0)

    # optional league assignment
    league_id: int = Field(foreign_key="league.id", index=True)
    league: League = Relationship(back_populates="clubs")

class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id", index=True)

    leg: int = Field(default=1, index=True)  # 1 or 2

    order_index: int = Field(default=0, index=True)
    state: str = Field(default="scheduled", index=True)  # scheduled/playing/finished

    started_at: Optional[dt.datetime] = None
    finished_at: Optional[dt.datetime] = None

    tournament: "Tournament" = Relationship(back_populates="matches")
    sides: List["MatchSide"] = Relationship(back_populates="match")


class FriendlyMatch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    mode: str = Field(index=True)  # "1v1" | "2v2"
    state: str = Field(default="finished", index=True)  # scheduled/playing/finished

    date: dt.date = Field(default_factory=dt.date.today, index=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)

    source: str = Field(default="tools", index=True)

    sides: List["FriendlyMatchSide"] = Relationship(back_populates="friendly_match")


class MatchSide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", index=True)

    side: str = Field(index=True)  # "A" | "B"
    club_id: Optional[int] = Field(default=None, foreign_key="club.id")
    goals: int = Field(default=0)

    match: "Match" = Relationship(back_populates="sides")
    players: List["Player"] = Relationship(link_model=MatchSidePlayer)


class FriendlyMatchSide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    friendly_match_id: int = Field(foreign_key="friendlymatch.id", index=True)

    side: str = Field(index=True)  # "A" | "B"
    club_id: Optional[int] = Field(default=None, foreign_key="club.id")
    goals: int = Field(default=0)

    friendly_match: "FriendlyMatch" = Relationship(back_populates="sides")
    players: List["Player"] = Relationship(link_model=FriendlyMatchSidePlayer)


class Comment(SQLModel, table=True):
    """
    Tournament comments.
    - match_id = NULL => tournament-wide comment
    - match_id set => comment tied to a specific match (stable even if order_index changes)
    - author_player_id = NULL => "General"
    """
    id: Optional[int] = Field(default=None, primary_key=True)

    tournament_id: int = Field(foreign_key="tournament.id", index=True)
    match_id: Optional[int] = Field(default=None, foreign_key="match.id", index=True)

    author_player_id: Optional[int] = Field(default=None, foreign_key="player.id", index=True)
    body: str

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentRead(SQLModel, table=True):
    """
    Per-player read tracking for tournament comments.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentVote(SQLModel, table=True):
    """
    Per-player vote for a tournament comment.
    value: +1 (upvote) or -1 (downvote)
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    value: int = Field(default=1)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentImageFile(SQLModel, table=True):
    """
    Preferred comment image storage (metadata in DB, bytes on disk/object storage).
    Metadata-only row for filesystem-backed comment-image storage.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class TournamentPinnedComment(SQLModel, table=True):
    """
    Keep pin state in a dedicated table to avoid altering existing Tournament rows
    (this project uses create_all() without migrations).
    """
    tournament_id: int = Field(foreign_key="tournament.id", primary_key=True)
    comment_id: Optional[int] = Field(default=None, foreign_key="comment.id")
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)


class CommentThreadLink(SQLModel, table=True):
    """
    Optional parent-child relation for comment threads (mirrors PlayerGuestbookThreadLink).
    Top-level comments have no row here. Additive table, so existing comments stay roots.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    parent_comment_id: int = Field(foreign_key="comment.id", index=True)


class CommentAuthorLink(SQLModel, table=True):
    """
    The real author of a comment (the logged-in player who created it), recorded even
    when the comment is displayed as "General". Used to enforce author-only editing.
    Additive: legacy comments have no row and fall back to author_player_id / admin-only.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    real_author_player_id: int = Field(foreign_key="player.id", index=True)


class PushSubscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    player_id: int = Field(foreign_key="player.id", index=True)
    endpoint: str = Field(index=True, unique=True)
    endpoint_hash: str = Field(index=True)
    p256dh: str
    auth: str
    content_encoding: str = Field(default="aes128gcm")

    user_agent: str = Field(default="")
    app_platform: str = Field(default="")
    app_standalone: bool = Field(default=False)

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    last_success_at: Optional[dt.datetime] = Field(default=None, index=True)
    last_failure_at: Optional[dt.datetime] = Field(default=None, index=True)
    last_error: str = Field(default="")
    last_http_status: Optional[int] = Field(default=None)
    failure_count: int = Field(default=0)
    disabled_at: Optional[dt.datetime] = Field(default=None, index=True)


class PushSubscriptionPreference(SQLModel, table=True):
    subscription_id: int = Field(foreign_key="pushsubscription.id", primary_key=True)
    notification_language: str = Field(default="steirisch", index=True)
    notification_mode: str = Field(default="finished_only", index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
