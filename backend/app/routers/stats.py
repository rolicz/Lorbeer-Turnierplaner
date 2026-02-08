# backend/app/routers/stats.py
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..db import get_session
from ..services.stats.players import compute_stats_players
from ..services.stats.registry import stats_overview
from ..services.stats.h2h import compute_stats_h2h
from ..services.stats.streaks import compute_stats_streaks

router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("/overview")
def stats_overview_endpoint() -> dict[str, Any]:
    return stats_overview()


@router.get("/players")
def stats_players(
    lastN: int = Query(10, ge=0, le=100, description="How many recent matches to average (0 disables)"),
    s: Session = Depends(get_session)) -> dict[str, Any]:
    return compute_stats_players(s, lastN=lastN)


@router.get("/h2h")
def stats_h2h(
    player_id: int | None = Query(None, ge=1, description="Optional player to focus on"),
    limit: int = Query(12, ge=1, le=200, description="Max entries per section"),
    order: str = Query("rivalry", description='Sorting for "rivalries" lists: "rivalry" (default) or "played"'),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_h2h(s, player_id=player_id, limit=limit, order=order)


@router.get("/streaks")
def stats_streaks(
    mode: str = Query("overall", description='Match mode filter: "overall" (default), "1v1", or "2v2"'),
    player_id: int | None = Query(None, ge=1, description="Optional player to focus on"),
    limit: int = Query(10, ge=1, le=200, description="Max rows per section"),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_streaks(s, mode=mode, player_id=player_id, limit=limit)
