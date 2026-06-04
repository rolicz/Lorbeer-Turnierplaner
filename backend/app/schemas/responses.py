"""Pydantic response models — the typed API contract used for response_model=
and (via OpenAPI) frontend type generation.

These mirror the exact JSON shapes the routers already return; attaching them
as response_model= documents the contract without changing the payloads.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
