from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import require_editor
from ..db import get_session
from ..models import Match, MatchSide, Tournament, Club

router = APIRouter(prefix="/matches", tags=["matches"])


def _match_or_404(s: Session, match_id: int) -> Match:
    m = s.get(Match, match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    # load sides eagerly for updates later
    _ = m.sides
    return m

def _club_exists(s: Session, club_id: int) -> None:
    if s.get(Club, club_id) is None:
        raise HTTPException(status_code=400, detail=f"Unknown club_id {club_id}")

def _state_rank(state: str) -> int:
    # finished first, then playing, then scheduled (monotonic increasing)
    return {"finished": 0, "playing": 1, "scheduled": 2}.get(state, 99)


def _validate_tournament_state_order(s: Session, tournament_id: int) -> None:
    matches = s.exec(
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index)
    ).all()

    ranks = [_state_rank(m.state) for m in matches]
    if any(ranks[i] > ranks[i + 1] for i in range(len(ranks) - 1)):
        raise HTTPException(
            status_code=409,
            detail="Invalid order: must be finished… then (optional) one playing… then scheduled…",
        )

    playing_count = sum(1 for m in matches if m.state == "playing")
    if playing_count > 1:
        raise HTTPException(status_code=409, detail="Only one match can be 'playing' at a time")


@router.patch("/{match_id}", dependencies=[Depends(require_editor)])
async def patch_match(
    match_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    m = _match_or_404(s, match_id)
    t = s.exec(select(Tournament).where(Tournament.id == m.tournament_id)).first()

    if t and t.status == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to edit)")

    # --- leg reassignment is ADMIN ONLY (as agreed) ---
    if "leg" in body:
        if role != "admin":
            raise HTTPException(status_code=403, detail="Changing match leg is admin-only")
        new_leg = int(body["leg"])
        if new_leg not in (1, 2):
            raise HTTPException(status_code=400, detail="leg must be 1 or 2")
        if m.state != "scheduled":
            raise HTTPException(status_code=409, detail="Cannot move a match between legs once it has started")
        m.leg = new_leg

    # --- IMPORTANT: allow playing/finished state transitions ---
    if "state" in body:
        new_state = body["state"]
        if new_state not in ("scheduled", "playing", "finished"):
            raise HTTPException(status_code=400, detail="Invalid state")

        # set timestamps once
        if new_state == "playing" and m.started_at is None:
            m.started_at = datetime.utcnow()
        if new_state == "finished" and m.finished_at is None:
            m.finished_at = datetime.utcnow()

        m.state = new_state
        _validate_tournament_state_order(s, m.tournament_id)

    # Optional: accept goals updates in the simple shape your tests use
    # body: {"sideA": {"goals": 1}, "sideB": {"goals": 2}}
    sides = {side.side: side for side in m.sides}

    if "sideA" in body and "A" in sides:
        a = body["sideA"] or {}
        if "club_id" in a:
            cid = a["club_id"]
            if cid is None:
                sides["A"].club_id = None
            else:
                cid = int(cid)
                _club_exists(s, cid)
                sides["A"].club_id = cid
        if "goals" in a:
            sides["A"].goals = int(a["goals"])

    if "sideB" in body and "B" in sides:
        b = body["sideB"] or {}
        if "club_id" in b:
            cid = b["club_id"]
            if cid is None:
                sides["B"].club_id = None
            else:
                cid = int(cid)
                _club_exists(s, cid)
                sides["B"].club_id = cid
        if "goals" in b:
            sides["B"].goals = int(b["goals"])


    s.add(m)
    for side in m.sides:
        s.add(side)
    s.commit()
    s.refresh(m)

    return {"ok": True, "id": m.id, "state": m.state, "leg": m.leg}

