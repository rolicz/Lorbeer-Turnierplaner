# backend/app/routers/stats.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..db import get_session
from ..services.stats.players import compute_stats_players
from ..services.stats.registry import stats_overview

router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("/overview")
def stats_overview_endpoint() -> dict[str, Any]:
    return stats_overview()


@router.get("/players")
def stats_players(
    lastN: int = Query(10, ge=0, le=100, description="How many recent matches to average (0 disables)"),
    s: Session = Depends(get_session)) -> dict[str, Any]:
    return compute_stats_players(s, lastN=lastN)
