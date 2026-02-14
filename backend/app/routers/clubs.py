import logging

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from pydantic import BaseModel

from ..auth import require_editor, require_admin
from ..db import get_session
from ..models import Club, MatchSide, League
from ..schemas import ClubCreateBody, ClubPatchBody, LeagueCreateBody
from ..validation import validate_star_rating

log = logging.getLogger(__name__)
router = APIRouter(prefix="/clubs", tags=["clubs"])


class ClubOut(BaseModel):
    id: int
    name: str
    game: str
    star_rating: float
    league_id: int
    league_name: str | None

# ---- leagues (backend-managed lookup) ----
@router.get("/leagues")
def list_leagues(s: Session = Depends(get_session)):
    return s.exec(select(League).order_by(League.name)).all()


@router.post("/leagues", dependencies=[Depends(require_admin)])
def create_league(body: LeagueCreateBody, s: Session = Depends(get_session), role: str = Depends(require_admin)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing league name")

    existing = s.exec(select(League).where(League.name == name)).first()
    if existing:
        return existing

    lg = League(name=name)
    s.add(lg)
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        # race-safe: someone else created it
        lg = s.exec(select(League).where(League.name == name)).first()
        if lg:
            return lg
        raise HTTPException(status_code=409, detail="League already exists")
    s.refresh(lg)

    log.info("Created league: name=%s by=%s", name, role)
    return lg



@router.get("", response_model=list[ClubOut])
def list_clubs(game: str | None = None, s: Session = Depends(get_session)):
    q = (
        select(Club, League.name)
        .join(League, Club.league_id == League.id, isouter=True)
        .order_by(Club.game, Club.name)
    )
    if game:
        q = q.where(Club.game == game)

    rows = s.exec(q).all()  # list[tuple[Club, str|None]]

    out: list[ClubOut] = []
    for club, league_name in rows:
        out.append(
            ClubOut(
                id=club.id,
                name=club.name,
                game=club.game,
                star_rating=club.star_rating,
                league_id=club.league_id,
                league_name=league_name,
            )
        )
    return out


@router.post("", dependencies=[Depends(require_editor)])
def create_club(body: ClubCreateBody, s: Session = Depends(get_session)):
    name = (body.name or "").strip()
    game = (body.game or "").strip()
    stars = body.star_rating
    league_id_raw = body.league_id

    if not name or not game:
        raise HTTPException(status_code=400, detail="Missing name or game")
    if stars in (None, ""):
        raise HTTPException(status_code=400, detail="Missing star_rating")
    if league_id_raw is not None:
        try:
            league_id = int(league_id_raw)
        except Exception:
            raise HTTPException(status_code=400, detail="league_id must be an integer")
        # validate league exists
        if s.get(League, league_id) is None:
            raise HTTPException(status_code=400, detail=f"Unknown league_id {league_id}")
    else:
        raise HTTPException(status_code=400, detail="Missing league_id")

    try:
        stars = validate_star_rating(stars)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # (name, game) unique
    existing = s.exec(select(Club).where(Club.name == name, Club.game == game)).first()
    if existing:
        return existing

    c = Club(name=name, game=game, star_rating=stars, league_id=league_id)
    s.add(c)
    s.commit()
    s.refresh(c)
    log.info("Created club %s (%s) stars=%s", name, game, stars)
    return c


@router.patch("/{club_id}", dependencies=[Depends(require_editor)])
def patch_club(
    club_id: int,
    body: ClubPatchBody,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    Editor:
      - can update star_rating (and optionally game)
    Admin:
      - can also rename clubs (name)
      - can set league_id (optional)
    """
    c = s.get(Club, club_id)
    if not c:
        raise HTTPException(status_code=404, detail="Club not found")

    fields = body.model_fields_set

    # --- name changes: admin only ---
    if "name" in fields:
        if role != "admin":
            raise HTTPException(status_code=403, detail="Changing club name is admin-only")
        c.name = (body.name or "").strip()

    # game (currently editor-allowed, keep as-is)
    if "game" in fields:
        c.game = (body.game or "").strip()

    if "star_rating" in fields:
        try:
            c.star_rating = validate_star_rating(body.star_rating)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # --- league assignment: admin-only, optional, must exist ---
    if "league_id" in fields:
        lid = body.league_id
        if lid is None or lid == "":
            c.league_id = None
        else:
            try:
                lid_int = int(lid)
            except Exception:
                raise HTTPException(status_code=400, detail="league_id must be an integer or null")
            if s.get(League, lid_int) is None:
                raise HTTPException(status_code=400, detail=f"Unknown league_id {lid_int}")
            c.league_id = lid_int

    if not c.name or not c.game:
        raise HTTPException(status_code=400, detail="name and game cannot be empty")

    # nice uniqueness check for (name, game)
    other = s.exec(
        select(Club).where(
            Club.id != club_id,
            Club.name == c.name,
            Club.game == c.game,
        )
    ).first()
    if other:
        raise HTTPException(status_code=409, detail="Club with same name and game already exists")

    try:
        s.add(c)
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(status_code=409, detail="Club with same name and game already exists")

    s.refresh(c)
    return c

@router.delete("/{club_id}", dependencies=[Depends(require_admin)])
def delete_club(
    club_id: int,
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    """
    Admin only:
      - deletes a club (team)
      - refuses if club is referenced by any match side (to protect history)
    """
    c = s.get(Club, club_id)
    if not c:
        raise HTTPException(status_code=404, detail="Club not found")

    used = s.exec(select(MatchSide.id).where(MatchSide.club_id == club_id)).first()
    if used is not None:
        raise HTTPException(status_code=409, detail="Club is used in matches; cannot delete")

    s.delete(c)
    s.commit()
    log.info("Club deleted: club_id=%s by=%s", club_id, role)
    return Response(status_code=204)
