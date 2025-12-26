import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import require_admin
from ..db import get_session
from ..models import Player

log = logging.getLogger(__name__)
router = APIRouter(prefix="/players", tags=["players"])


@router.get("")
def list_players(s: Session = Depends(get_session)):
    return s.exec(select(Player).order_by(Player.display_name)).all()


@router.post("", dependencies=[Depends(require_admin)])
def create_player(body: dict, s: Session = Depends(get_session)):
    name = (body.get("display_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing display_name")

    existing = s.exec(select(Player).where(Player.display_name == name)).first()
    if existing:
        return existing

    p = Player(display_name=name)
    s.add(p)
    s.commit()
    s.refresh(p)
    log.info("Created player '%s' (id=%s)", p.display_name, p.id)
    return p
