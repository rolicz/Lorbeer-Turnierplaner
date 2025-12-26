import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import require_editor
from ..db import get_session
from ..models import Club
from ..validation import validate_star_rating

log = logging.getLogger(__name__)
router = APIRouter(prefix="/clubs", tags=["clubs"])


@router.get("")
def list_clubs(game: str | None = None, s: Session = Depends(get_session)):
    q = select(Club).order_by(Club.game, Club.name)
    if game:
        q = q.where(Club.game == game)
    return s.exec(q).all()


@router.post("", dependencies=[Depends(require_editor)])
def create_club(body: dict, s: Session = Depends(get_session)):
    name = (body.get("name") or "").strip()
    game = (body.get("game") or "").strip()
    stars = body.get("star_rating", 3.0)

    if not name or not game:
        raise HTTPException(status_code=400, detail="Missing name or game")

    try:
        stars = validate_star_rating(stars)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # (name, game) unique
    existing = s.exec(select(Club).where(Club.name == name, Club.game == game)).first()
    if existing:
        return existing

    c = Club(name=name, game=game, star_rating=stars)
    s.add(c)
    s.commit()
    s.refresh(c)
    log.info("Created club %s (%s) stars=%s", name, game, stars)
    return c


@router.patch("/{club_id}", dependencies=[Depends(require_editor)])
def patch_club(club_id: int, body: dict, s: Session = Depends(get_session)):
    c = s.get(Club, club_id)
    if not c:
        raise HTTPException(status_code=404, detail="Club not found")

    if "name" in body:
        c.name = (body["name"] or "").strip()
    if "game" in body:
        c.game = (body["game"] or "").strip()
    if "star_rating" in body:
        try:
            c.star_rating = validate_star_rating(body["star_rating"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if not c.name or not c.game:
        raise HTTPException(status_code=400, detail="name and game cannot be empty")

    s.add(c)
    s.commit()
    s.refresh(c)
    return c
