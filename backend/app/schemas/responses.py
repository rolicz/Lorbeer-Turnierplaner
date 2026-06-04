"""Pydantic response models — the typed API contract used for response_model=
and (via OpenAPI) frontend type generation.

These mirror the exact JSON shapes the routers already return; attaching them
as response_model= documents the contract without changing the payloads.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Base for models populated from ORM objects (SQLModel rows)."""
    model_config = ConfigDict(from_attributes=True)


# ---- shared ------------------------------------------------------------
class OkResponse(BaseModel):
    ok: bool


class PlayerRef(ORMModel):
    id: int
    display_name: str


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
