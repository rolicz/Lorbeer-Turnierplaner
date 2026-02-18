from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import selectinload
from sqlmodel import Session, delete, select

from ..auth import require_admin, require_editor
from ..db import get_session
from ..models import Club, FriendlyMatch, FriendlyMatchSide, FriendlyMatchSidePlayer, Player
from ..schemas import FriendlyMatchCreateBody, MatchPatchBody, MatchSidePatchBody

router = APIRouter(prefix="/friendlies", tags=["friendlies"])


def _to_non_negative_int(value: int | str, *, field: str) -> int:
    try:
        n = int(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be an integer") from exc
    if n < 0:
        raise HTTPException(status_code=400, detail=f"{field} must be >= 0")
    return n


def _to_optional_int(value: int | str | None, *, field: str) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be an integer") from exc


def _normalize_player_ids(values: list[int], *, field: str) -> list[int]:
    out: list[int] = []
    for raw in values:
        try:
            pid = int(raw)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"{field} contains invalid id") from exc
        if pid <= 0:
            raise HTTPException(status_code=400, detail=f"{field} contains invalid id")
        out.append(pid)
    if len(set(out)) != len(out):
        raise HTTPException(status_code=400, detail=f"{field} contains duplicates")
    return out


def _player_dict(p: Player) -> dict[str, int | str]:
    return {"id": int(p.id), "display_name": p.display_name}


def _friendly_dict(fm: FriendlyMatch) -> dict:
    sides_out = []
    for side in sorted(fm.sides, key=lambda s: s.side):
        sides_out.append(
            {
                "id": int(side.id),
                "side": side.side,
                "club_id": side.club_id,
                "goals": side.goals,
                "players": [_player_dict(p) for p in side.players],
            }
        )
    return {
        "id": int(fm.id),
        "mode": fm.mode,
        "state": fm.state,
        "date": fm.date,
        "created_at": fm.created_at,
        "updated_at": fm.updated_at,
        "sides": sides_out,
    }


@router.get("")
def list_friendlies(
    mode: str | None = Query(None, description='Optional mode filter: "1v1" or "2v2"'),
    limit: int = Query(200, ge=1, le=2000, description="Max rows"),
    s: Session = Depends(get_session),
):
    mode_norm = str(mode or "").strip().lower()
    stmt = (
        select(FriendlyMatch)
        .options(selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players))
        .order_by(FriendlyMatch.date.desc(), FriendlyMatch.id.desc())
        .limit(limit)
    )
    if mode_norm in ("1v1", "2v2"):
        stmt = stmt.where(FriendlyMatch.mode == mode_norm)
    rows = list(s.exec(stmt).all())
    return [_friendly_dict(fm) for fm in rows]


@router.post("", dependencies=[Depends(require_editor)])
def create_friendly_match(
    body: FriendlyMatchCreateBody,
    s: Session = Depends(get_session),
):
    mode = str(body.mode or "").strip().lower()
    if mode not in ("1v1", "2v2"):
        raise HTTPException(status_code=400, detail='mode must be "1v1" or "2v2"')

    a_ids = _normalize_player_ids(list(body.teamA_player_ids or []), field="teamA_player_ids")
    b_ids = _normalize_player_ids(list(body.teamB_player_ids or []), field="teamB_player_ids")
    all_ids = a_ids + b_ids
    if len(set(all_ids)) != len(all_ids):
        raise HTTPException(status_code=400, detail="Players must be unique across both teams")

    need = 1 if mode == "1v1" else 2
    if len(a_ids) != need or len(b_ids) != need:
        raise HTTPException(status_code=400, detail=f"{mode} requires exactly {need} player(s) per team")

    a_goals = _to_non_negative_int(body.a_goals, field="a_goals")
    b_goals = _to_non_negative_int(body.b_goals, field="b_goals")

    club_a_id = _to_optional_int(body.clubA_id, field="clubA_id")
    club_b_id = _to_optional_int(body.clubB_id, field="clubB_id")

    if club_a_id is not None and s.get(Club, club_a_id) is None:
        raise HTTPException(status_code=400, detail=f"Unknown clubA_id {club_a_id}")
    if club_b_id is not None and s.get(Club, club_b_id) is None:
        raise HTTPException(status_code=400, detail=f"Unknown clubB_id {club_b_id}")

    players = list(s.exec(select(Player).where(Player.id.in_(all_ids))).all())
    players_by_id = {int(p.id): p for p in players if p.id is not None}
    missing = [pid for pid in all_ids if pid not in players_by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown player id(s): {', '.join(str(x) for x in sorted(set(missing)))}")

    now = dt.datetime.utcnow()
    fm = FriendlyMatch(
        mode=mode,
        state="finished",
        source="tools",
        date=dt.date.today(),
        created_at=now,
        updated_at=now,
    )
    s.add(fm)
    s.flush()

    side_a = FriendlyMatchSide(
        friendly_match_id=int(fm.id),
        side="A",
        club_id=club_a_id,
        goals=a_goals,
    )
    side_a.players = [players_by_id[pid] for pid in a_ids]

    side_b = FriendlyMatchSide(
        friendly_match_id=int(fm.id),
        side="B",
        club_id=club_b_id,
        goals=b_goals,
    )
    side_b.players = [players_by_id[pid] for pid in b_ids]

    s.add(side_a)
    s.add(side_b)
    s.commit()
    s.refresh(fm)
    s.refresh(side_a)
    s.refresh(side_b)

    # Reuse list serializer for a stable response shape.
    fm.sides = [side_a, side_b]
    return _friendly_dict(fm)


@router.delete("/{friendly_id}", dependencies=[Depends(require_admin)])
def delete_friendly(
    friendly_id: int,
    s: Session = Depends(get_session),
):
    fm = s.get(FriendlyMatch, friendly_id)
    if not fm:
        raise HTTPException(status_code=404, detail="Friendly match not found")

    side_ids = [int(row) for row in s.exec(select(FriendlyMatchSide.id).where(FriendlyMatchSide.friendly_match_id == friendly_id)).all()]
    if side_ids:
        s.exec(delete(FriendlyMatchSidePlayer).where(FriendlyMatchSidePlayer.friendly_match_side_id.in_(side_ids)))
        s.exec(delete(FriendlyMatchSide).where(FriendlyMatchSide.id.in_(side_ids)))
    s.exec(delete(FriendlyMatch).where(FriendlyMatch.id == friendly_id))
    s.commit()
    return {"ok": True}


@router.patch("/{friendly_id}", dependencies=[Depends(require_admin)])
def patch_friendly(
    friendly_id: int,
    body: MatchPatchBody,
    s: Session = Depends(get_session),
):
    fm = s.get(FriendlyMatch, friendly_id)
    if not fm:
        raise HTTPException(status_code=404, detail="Friendly match not found")

    _ = fm.sides
    fields = body.model_fields_set

    if "state" in fields:
        new_state = str(body.state or "").strip().lower()
        if new_state not in ("scheduled", "playing", "finished"):
            raise HTTPException(status_code=400, detail="Invalid state")
        fm.state = new_state

    sides = {side.side: side for side in fm.sides}

    if "sideA" in fields and "A" in sides:
        a = body.sideA or MatchSidePatchBody()
        a_fields = a.model_fields_set if isinstance(a, MatchSidePatchBody) else set()
        if "club_id" in a_fields:
            cid = _to_optional_int(a.club_id, field="sideA.club_id")
            if cid is not None and s.get(Club, cid) is None:
                raise HTTPException(status_code=400, detail=f"Unknown club_id {cid}")
            sides["A"].club_id = cid
        if "goals" in a_fields:
            sides["A"].goals = _to_non_negative_int(a.goals, field="sideA.goals")

    if "sideB" in fields and "B" in sides:
        b = body.sideB or MatchSidePatchBody()
        b_fields = b.model_fields_set if isinstance(b, MatchSidePatchBody) else set()
        if "club_id" in b_fields:
            cid = _to_optional_int(b.club_id, field="sideB.club_id")
            if cid is not None and s.get(Club, cid) is None:
                raise HTTPException(status_code=400, detail=f"Unknown club_id {cid}")
            sides["B"].club_id = cid
        if "goals" in b_fields:
            sides["B"].goals = _to_non_negative_int(b.goals, field="sideB.goals")

    fm.updated_at = dt.datetime.utcnow()
    s.add(fm)
    for side in fm.sides:
        s.add(side)
    s.commit()

    row = s.exec(
        select(FriendlyMatch)
        .where(FriendlyMatch.id == friendly_id)
        .options(selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players))
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Friendly match not found")
    return _friendly_dict(row)
