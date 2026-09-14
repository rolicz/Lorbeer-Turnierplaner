import datetime as dt
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from ..auth import require_admin, require_editor
from ..db import get_engine, get_session
from ..models import Club, ClubCrestFile, FriendlyMatchSide, League, MatchSide
from ..schemas import ClubCreateBody, ClubPatchBody, LeagueCreateBody
from ..schemas.responses import ClubColumnsOut, ClubCrestMetaOut, ClubOut, LeagueOut
from ..services.file_storage import (
    delete_media,
    media_path_for_club_crest,
    read_media,
    upsert_media_row,
)
from ..validation import validate_nation_code, validate_star_rating

MAX_CREST_BYTES = 1_000_000

log = logging.getLogger(__name__)
router = APIRouter(prefix="/clubs", tags=["clubs"])


# ---- leagues (backend-managed lookup) ----
@router.get("/leagues", response_model=list[LeagueOut])
def list_leagues(s: Session = Depends(get_session)):
    return s.exec(select(League).order_by(League.name)).all()


@router.post("/leagues", response_model=LeagueOut, dependencies=[Depends(require_admin)])
def create_league(body: LeagueCreateBody, s: Session = Depends(get_session), role: str = Depends(require_admin)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing league name")

    nation: str | None = None
    if body.nation is not None:
        try:
            nation = validate_nation_code(body.nation)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    existing = s.exec(select(League).where(League.name == name)).first()
    if existing:
        return existing

    lg = League(name=name, nation=nation)
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
        select(Club, League.name, League.nation, ClubCrestFile.updated_at)
        .join(League, Club.league_id == League.id, isouter=True)
        .join(ClubCrestFile, ClubCrestFile.club_id == Club.id, isouter=True)
        .order_by(Club.game, Club.name)
    )
    if game:
        q = q.where(Club.game == game)

    rows = s.exec(q).all()  # list[tuple[Club, str|None, str|None, datetime|None]]

    out: list[ClubOut] = []
    for club, league_name, league_nation, crest_updated_at in rows:
        out.append(
            ClubOut(
                id=club.id,
                name=club.name,
                game=club.game,
                star_rating=club.star_rating,
                league_id=club.league_id,
                league_name=league_name,
                league_nation=league_nation,
                crest_updated_at=crest_updated_at,
            )
        )
    return out


# ---- club crests (metadata in DB, bytes on disk — see PlayerAvatarFile) ----
@router.get("/{club_id}/crest")
def get_club_crest(club_id: int):
    with Session(get_engine()) as s:
        fs_row = s.get(ClubCrestFile, club_id)
        if not fs_row:
            raise HTTPException(status_code=404, detail="Crest not found")
        content_type = fs_row.content_type
        file_path = fs_row.file_path

    data = read_media(file_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Crest file missing")

    # Crests change basically never; the frontend appends updated_at as a cache buster.
    headers = {"Cache-Control": "public, max-age=2592000"}
    return Response(content=data, media_type=content_type, headers=headers)


@router.put("/{club_id}/crest", response_model=ClubCrestMetaOut)
async def put_club_crest(
    club_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    club = s.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_CREST_BYTES:
        raise HTTPException(status_code=413, detail=f"Crest too large (max {MAX_CREST_BYTES} bytes)")

    row = upsert_media_row(
        s,
        row_cls=ClubCrestFile,
        row_id=club_id,
        id_field="club_id",
        content_type=ct,
        data=data,
        path_builder=media_path_for_club_crest,
        updated_at=dt.datetime.utcnow(),
    )
    s.commit()
    s.refresh(row)
    log.info("Club crest uploaded: club_id=%s by=%s", club_id, role)
    return {"club_id": row.club_id, "updated_at": row.updated_at}


@router.delete("/{club_id}/crest", dependencies=[Depends(require_admin)])
def delete_club_crest(club_id: int, s: Session = Depends(get_session)):
    row = s.get(ClubCrestFile, club_id)
    if not row:
        return Response(status_code=204)
    delete_media(row.file_path)
    s.delete(row)
    s.commit()
    return Response(status_code=204)


@router.post("", response_model=ClubColumnsOut, dependencies=[Depends(require_editor)])
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


@router.patch("/{club_id}", response_model=ClubColumnsOut, dependencies=[Depends(require_editor)])
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
      - refuses if the club is referenced by any recorded match — tournament **or
        friendly** (to protect history)
      - takes its crest with it (row + file)

    Friendlies count: they are matches with a club just as much as tournament
    matches are, and in the real data there are clubs referenced *only* by a
    friendly. Deleting such a club used to succeed and leave the friendly pointing
    at a club id that no longer exists (SQLite does not enforce the foreign key).

    The crest has to go too: `club.id` is not AUTOINCREMENT, so SQLite hands the
    freed id to the next club created — which would then inherit the deleted
    club's crest row and its file on disk.
    """
    c = s.get(Club, club_id)
    if not c:
        raise HTTPException(status_code=404, detail="Club not found")

    used = s.exec(select(MatchSide.id).where(MatchSide.club_id == club_id)).first()
    if used is not None:
        raise HTTPException(status_code=409, detail="Club is used in matches; cannot delete")

    used_friendly = s.exec(select(FriendlyMatchSide.id).where(FriendlyMatchSide.club_id == club_id)).first()
    if used_friendly is not None:
        raise HTTPException(status_code=409, detail="Club is used in friendlies; cannot delete")

    crest = s.get(ClubCrestFile, club_id)
    if crest is not None:
        delete_media(crest.file_path)
        s.delete(crest)

    s.delete(c)
    s.commit()
    log.info("Club deleted: club_id=%s by=%s", club_id, role)
    return Response(status_code=204)
