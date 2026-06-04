import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..auth import require_editor
from ..db import get_session
from ..models import Club, Match, MatchSide, Tournament
from ..schemas import MatchPatchBody, MatchSidePatchBody
from ..services.events import broadcast_match_patched, broadcast_match_updated
from ..services.notifications import enqueue_global_push, localized_push_message
from ..tournament_status import compute_status_for_tournament, find_other_live_tournament_id

router = APIRouter(prefix="/matches", tags=["matches"])
log = logging.getLogger(__name__)


def _match_or_404(s: Session, match_id: int) -> Match:
    m = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.id == match_id)
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
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
    body: MatchPatchBody,
    request: Request,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    m = _match_or_404(s, match_id)
    t = s.exec(select(Tournament).where(Tournament.id == m.tournament_id)).first()
    old_state = m.state
    old_scores = {side.side: int(side.goals or 0) for side in m.sides}

    fields = body.model_fields_set

    # Automatic tournament status: block editing if tournament is DONE
    # Exception: editor may patch ONLY the *last* match in order (to recover from accidental finish).
    status_before = compute_status_for_tournament(s, m.tournament_id)

    if status_before == "done" and role != "admin":
        # Find last match by order_index (stable tie-breaker by id)
        last_match_id = s.exec(
            select(Match.id)
            .where(Match.tournament_id == m.tournament_id)
            .order_by(Match.order_index.desc(), Match.id.desc())
        ).first()

        if last_match_id is None or last_match_id != m.id:
            raise HTTPException(status_code=403, detail="Tournament is done (admin required to edit)")

        # Optional safety: only allow changing state/goals/clubs on that last match (no other admin-like actions)
        if "leg" in fields:
            raise HTTPException(status_code=403, detail="Changing match leg is admin-only")


    # --- leg reassignment is ADMIN ONLY (as agreed) ---
    if "leg" in fields:
        if role != "admin":
            raise HTTPException(status_code=403, detail="Changing match leg is admin-only")
        new_leg = int(body.leg)
        if new_leg not in (1, 2):
            raise HTTPException(status_code=400, detail="leg must be 1 or 2")
        if m.state != "scheduled":
            raise HTTPException(status_code=409, detail="Cannot move a match between legs once it has started")
        m.leg = new_leg

    # --- state transitions ---
    if "state" in fields:
        new_state = body.state
        if new_state not in ("scheduled", "playing", "finished"):
            raise HTTPException(status_code=400, detail="Invalid state")

        # If we go backwards, clear timestamps appropriately.
        if new_state == "scheduled":
            m.started_at = None
            m.finished_at = None

        if new_state == "playing":
            # reopening a finished match: clear finished_at
            m.finished_at = None
            if m.started_at is None:
                m.started_at = datetime.utcnow()

        if new_state == "finished":
            if m.started_at is None:
                m.started_at = datetime.utcnow()
            if m.finished_at is None:
                m.finished_at = datetime.utcnow()

        m.state = new_state
        _validate_tournament_state_order(s, m.tournament_id)


    # goals/club updates
    sides = {side.side: side for side in m.sides}

    if "sideA" in fields and "A" in sides:
        a = body.sideA or MatchSidePatchBody()
        a_fields = a.model_fields_set if isinstance(a, MatchSidePatchBody) else set()
        if "club_id" in a_fields:
            cid = a.club_id
            if cid is None:
                sides["A"].club_id = None
            else:
                cid = int(cid)
                _club_exists(s, cid)
                sides["A"].club_id = cid
        if "goals" in a_fields:
            sides["A"].goals = int(a.goals)

    if "sideB" in fields and "B" in sides:
        b = body.sideB or MatchSidePatchBody()
        b_fields = b.model_fields_set if isinstance(b, MatchSidePatchBody) else set()
        if "club_id" in b_fields:
            cid = b.club_id
            if cid is None:
                sides["B"].club_id = None
            else:
                cid = int(cid)
                _club_exists(s, cid)
                sides["B"].club_id = cid
        if "goals" in b_fields:
            sides["B"].goals = int(b.goals)

    # Compute status AFTER modifications (autoflush happens before queries)
    status_after = compute_status_for_tournament(s, m.tournament_id)

    # Enforce: only one tournament may be LIVE
    if status_after == "live":
        other_live = find_other_live_tournament_id(s, m.tournament_id)
        if other_live is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Another tournament is live (tournament_id={other_live}). Finish it before starting/continuing this one.",
            )

    # Keep DB column in sync (even though status is derived)
    if t is not None:
        t.status = status_after
        t.updated_at = datetime.utcnow()
        s.add(t)

    s.add(m)
    for side in m.sides:
        s.add(side)

    s.commit()
    s.refresh(m)

    log.info("Match patched: match_id=%s tournament_id=%s state=%s status=%s by=%s",
             m.id, m.tournament_id, m.state, status_after, role)

    await broadcast_match_patched(m.tournament_id, m.id, tournament_status=status_after)

    new_scores = {side.side: int(side.goals or 0) for side in m.sides}
    scoreline = f"{new_scores.get('A', 0)}:{new_scores.get('B', 0)}"
    tournament_name = t.name if t is not None else f"Tournament {m.tournament_id}"
    match_label = f"Match {int(m.order_index) + 1}"

    if old_state != "playing" and m.state == "playing":
        enqueue_global_push(
            request,
            localized_push_message(
                "match_started",
                path=f"/live/{int(m.tournament_id)}",
                tag=f"match-start-{int(m.id)}",
                event_type="match_started",
                data={"tournament_id": int(m.tournament_id), "match_id": int(m.id)},
                tournament_name=tournament_name,
                match_label=match_label,
            ),
        )

    if old_state != "finished" and m.state == "finished":
        enqueue_global_push(
            request,
            localized_push_message(
                "match_finished",
                path=f"/live/{int(m.tournament_id)}",
                tag=f"match-finished-{int(m.id)}",
                event_type="match_finished",
                data={"tournament_id": int(m.tournament_id), "match_id": int(m.id)},
                tournament_name=tournament_name,
                match_label=match_label,
                scoreline=scoreline,
            ),
        )

    if status_before != "done" and status_after == "done":
        enqueue_global_push(
            request,
            localized_push_message(
                "tournament_finished",
                path=f"/live/{int(m.tournament_id)}",
                tag=f"tournament-finished-{int(m.tournament_id)}",
                event_type="tournament_finished",
                data={"tournament_id": int(m.tournament_id), "match_id": int(m.id)},
                tournament_name=tournament_name,
            ),
        )

    goals_changed = new_scores.get("A", 0) != old_scores.get("A", 0) or new_scores.get("B", 0) != old_scores.get("B", 0)
    goals_added = max(0, new_scores.get("A", 0) - old_scores.get("A", 0)) + max(
        0, new_scores.get("B", 0) - old_scores.get("B", 0)
    )
    if goals_changed:
        text_key = "match_goal" if goals_added == 1 else "match_score_changed"
        enqueue_global_push(
            request,
            localized_push_message(
                text_key,
                path=f"/live/{int(m.tournament_id)}",
                tag=f"match-score-{int(m.id)}",
                event_type="match_score_changed",
                data={
                    "tournament_id": int(m.tournament_id),
                    "match_id": int(m.id),
                    "score_a": new_scores.get("A", 0),
                    "score_b": new_scores.get("B", 0),
                    "goals_added": goals_added,
                },
                tournament_name=tournament_name,
                match_label=match_label,
                scoreline=scoreline,
            ),
        )

    return {"ok": True, "id": m.id, "state": m.state, "leg": m.leg, "tournament_status": status_after}


@router.patch("/{match_id}/swap-sides", dependencies=[Depends(require_editor)])
async def swap_sides(
    match_id: int,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    Swap home/away (Side A <-> Side B) by swapping the side labels.

    Editor/admin:
      - allowed while tournament not done
    Admin:
      - allowed even after tournament done
    """
    m = _match_or_404(s, match_id)

    status_now = compute_status_for_tournament(s, m.tournament_id)
    if status_now == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to swap sides)")

    sides = {side.side: side for side in m.sides}
    a = sides.get("A")
    b = sides.get("B")
    if not a or not b:
        raise HTTPException(status_code=409, detail="Match must have exactly sides A and B")

    # Swap labels using a temporary value (assumes no DB CHECK constraint on side)
    a.side = "X"
    s.add(a)
    s.flush()

    b.side = "A"
    s.add(b)
    s.flush()

    a.side = "B"
    s.add(a)

    s.commit()

    await broadcast_match_updated(m.tournament_id, m.id)
    return {"ok": True}
