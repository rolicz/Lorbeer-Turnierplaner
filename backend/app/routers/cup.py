from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session

from ..db import get_session
from ..services.cup import compute_cup

router = APIRouter(prefix="/cup", tags=["cup"])


@router.get("")
def get_cup(request: Request, s: Session = Depends(get_session)):
    try:
        res = compute_cup(s)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {
        "owner": {"id": res.owner_id, "display_name": res.owner_name},
        "streak": {
            "tournaments_participated": res.streak_tournaments_participated,
            "since": {
                "tournament_id": res.streak_since_tournament_id,
                "tournament_name": res.streak_since_tournament_name,
                "date": res.streak_since_date,
            },
        },
        "history": [
            {
                "tournament_id": h.tournament_id,
                "tournament_name": h.tournament_name,
                "date": h.date,
                "from": {"id": h.from_player_id, "display_name": h.from_player_name},
                "to": {"id": h.to_player_id, "display_name": h.to_player_name},
                "streak_duration": h.streak_duration,
            }
            for h in res.history
        ],
    }
