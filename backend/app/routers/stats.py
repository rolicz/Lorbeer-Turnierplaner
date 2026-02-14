# backend/app/routers/stats.py
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel, Field
from sqlmodel import Session

from ..db import get_session
from ..services.stats.players import compute_stats_players
from ..services.stats.registry import stats_overview
from ..services.stats.h2h import compute_stats_h2h
from ..services.stats.h2h_matches import compute_stats_h2h_matches
from ..services.stats.streaks import compute_stats_streaks
from ..services.stats.player_matches import compute_stats_player_matches
from ..services.stats.odds import compute_single_match_odds
from ..services.stats.ratings import compute_stats_ratings

router = APIRouter(prefix="/stats", tags=["stats"])


class StatsOddsRequest(BaseModel):
    mode: str = Field("1v1", description='Match mode: "1v1" or "2v2"')
    teamA_player_ids: list[int] = Field(default_factory=list, description="Team A player ids")
    teamB_player_ids: list[int] = Field(default_factory=list, description="Team B player ids")
    clubA_id: int | None = Field(None, description="Optional club for team A")
    clubB_id: int | None = Field(None, description="Optional club for team B")
    state: str = Field("scheduled", description='Match state: "scheduled" or "playing"')
    a_goals: int = Field(0, ge=0, le=99)
    b_goals: int = Field(0, ge=0, le=99)


class StatsH2HMatchesRequest(BaseModel):
    mode: Literal["overall", "1v1", "2v2"] = Field("overall")
    relation: Literal["opposed", "teammates"] = Field("opposed")
    left_player_ids: list[int] = Field(default_factory=list, min_length=1, max_length=2)
    right_player_ids: list[int] = Field(default_factory=list, max_length=2)
    exact_teams: bool = False


@router.get("/overview")
def stats_overview_endpoint() -> dict[str, Any]:
    return stats_overview()


@router.get("/players")
def stats_players(
    mode: str = Query("overall", description='Match mode filter: "overall" (default), "1v1", or "2v2"'),
    lastN: int = Query(10, ge=0, le=100, description="How many recent matches to average (0 disables)"),
    s: Session = Depends(get_session)) -> dict[str, Any]:
    return compute_stats_players(s, mode=mode, lastN=lastN)


@router.get("/h2h")
def stats_h2h(
    player_id: int | None = Query(None, ge=1, description="Optional player to focus on"),
    limit: int = Query(12, ge=1, le=200, description="Max entries per section"),
    order: str = Query("rivalry", description='Sorting for "rivalries" lists: "rivalry" (default) or "played"'),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_h2h(s, player_id=player_id, limit=limit, order=order)


@router.post("/h2h-matches")
def stats_h2h_matches(
    req: StatsH2HMatchesRequest = Body(...),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_h2h_matches(
        s,
        mode=req.mode,
        relation=req.relation,
        left_player_ids=req.left_player_ids,
        right_player_ids=req.right_player_ids,
        exact_teams=req.exact_teams,
    )


@router.get("/streaks")
def stats_streaks(
    mode: str = Query("overall", description='Match mode filter: "overall" (default), "1v1", or "2v2"'),
    player_id: int | None = Query(None, ge=1, description="Optional player to focus on"),
    limit: int = Query(10, ge=1, le=200, description="Max rows per section"),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_streaks(s, mode=mode, player_id=player_id, limit=limit)


@router.get("/player-matches")
def stats_player_matches(
    player_id: int = Query(..., ge=1, description="Player id"),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_player_matches(s, player_id=player_id)

@router.get("/ratings")
def stats_ratings(
    mode: str = Query("overall", description='Match mode filter: "overall" (default), "1v1", or "2v2"'),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    return compute_stats_ratings(s, mode=mode)


@router.post("/odds")
def stats_odds(
    req: StatsOddsRequest = Body(...),
    s: Session = Depends(get_session),
) -> dict[str, Any]:
    payload = compute_single_match_odds(
        s,
        mode=req.mode,
        teamA_player_ids=req.teamA_player_ids,
        teamB_player_ids=req.teamB_player_ids,
        clubA_id=req.clubA_id,
        clubB_id=req.clubB_id,
        state=req.state,
        a_goals=req.a_goals,
        b_goals=req.b_goals,
    )
    # Keep response shape stable for the UI; clients treat missing as "no odds yet".
    return {"odds": payload}
