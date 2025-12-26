from datetime import datetime
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

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    settings_json: str = Field(default="{}")

    # IMPORTANT: use typing.List + forward refs only for the class name
    players: List["Player"] = Relationship(back_populates="tournaments", link_model=TournamentPlayer)
    matches: List["Match"] = Relationship(back_populates="tournament")


class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    display_name: str = Field(index=True, unique=True)

    tournaments: List["Tournament"] = Relationship(back_populates="players", link_model=TournamentPlayer)


class Club(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("name", "game", name="uq_club_name_game"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    game: str = Field(index=True)
    star_rating: float = Field(default=3.0, ge=0.5, le=5.0)


class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id", index=True)

    leg: int = Field(default=1, index=True)  # 1 or 2

    order_index: int = Field(default=0, index=True)
    state: str = Field(default="scheduled", index=True)  # scheduled/playing/finished

    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

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
