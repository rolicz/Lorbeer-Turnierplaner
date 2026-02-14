import datetime as dt
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel
from sqlalchemy import UniqueConstraint

class TournamentPlayer(SQLModel, table=True):
    tournament_id: int = Field(foreign_key="tournament.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class MatchSidePlayer(SQLModel, table=True):
    __mapper_args__ = {"confirm_deleted_rows": False}
    match_side_id: int = Field(foreign_key="matchside.id", primary_key=True)
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


class PlayerAvatar(SQLModel, table=True):
    """
    Optional player avatar stored as a small blob.
    This is a separate table (not a Player column) because this project uses create_all()
    without migrations, and we don't want to break existing DBs.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    content_type: str
    data: bytes
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerAvatarFile(SQLModel, table=True):
    """
    Preferred avatar storage (metadata in DB, bytes on disk/object storage).
    Kept separate from PlayerAvatar blob table for backward compatibility.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


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


class MatchSide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", index=True)

    side: str = Field(index=True)  # "A" | "B"
    club_id: Optional[int] = Field(default=None, foreign_key="club.id")
    goals: int = Field(default=0)

    match: "Match" = Relationship(back_populates="sides")
    players: List["Player"] = Relationship(link_model=MatchSidePlayer)


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


class CommentImage(SQLModel, table=True):
    """
    Optional image attachment for a comment.
    Separate table to keep existing Comment rows/schema intact in create_all()-based deployments.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    content_type: str
    data: bytes
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentImageFile(SQLModel, table=True):
    """
    Preferred comment image storage (metadata in DB, bytes on disk/object storage).
    Kept separate from CommentImage blob table for backward compatibility.
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
