from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session

from ..db import get_session
from ..cup_defs import get_cup_def, load_cup_defs
from ..services.cup import compute_cup

router = APIRouter(prefix="/cup", tags=["cup"])

@router.get("/defs")
def list_cup_defs():
    defs = load_cup_defs()
    return {
        "cups": [
            {
                "key": d.key,
                "name": d.name,
                "since_date": d.since_date.isoformat() if d.since_date else None,
            }
            for d in defs
        ]
    }


@router.get("")
def get_cup(request: Request, key: str | None = None, s: Session = Depends(get_session)):
    try:
        d = get_cup_def(key)
        res = compute_cup(s, since_date=d.since_date)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=404, detail="Cup not found")

    return {
        "cup": {"key": d.key, "name": d.name, "since_date": d.since_date.isoformat() if d.since_date else None},
        "owner": {"id": res.owner_id, "display_name": res.owner_name} if res.owner_id else None,
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
