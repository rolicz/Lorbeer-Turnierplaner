import logging
import datetime as dt

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlmodel import Session, select

from ..auth import require_admin
from ..db import get_session
from ..models import Player, PlayerAvatar

log = logging.getLogger(__name__)
router = APIRouter(prefix="/players", tags=["players"])

MAX_AVATAR_BYTES = 2_000_000  # 2MB is plenty for a cropped 512x512 webp/png


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

@router.patch("/{player_id}", dependencies=[Depends(require_admin)])
def patch_player(
    player_id: int,
    body: dict,
    s: Session = Depends(get_session),
):
    """
    body: { "display_name": "New Name" }

    Admin only:
      - rename players (safe: relations use player_id)
    """
    p = s.get(Player, player_id)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    if "display_name" not in body:
        raise HTTPException(status_code=400, detail="Missing display_name")

    new_name = (body["display_name"] or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="display_name cannot be empty")

    # Avoid duplicate names (important if you treat names as “identity” in UI)
    existing = s.exec(select(Player).where(Player.display_name == new_name, Player.id != player_id)).first()
    if existing:
        raise HTTPException(status_code=409, detail="A player with this name already exists")

    p.display_name = new_name
    s.add(p)
    s.commit()
    s.refresh(p)

    log.info("Player renamed: id=%s name=%s", player_id, new_name)
    return p


@router.get("/avatars")
def list_player_avatar_meta(s: Session = Depends(get_session)):
    """
    Lightweight avatar metadata used by the frontend to avoid spamming 404 requests.
    Returns only player_id + updated_at for players who have an avatar.
    """
    rows = s.exec(select(PlayerAvatar.player_id, PlayerAvatar.updated_at)).all()
    return [{"player_id": pid, "updated_at": updated_at} for (pid, updated_at) in rows]


@router.get("/{player_id}/avatar")
def get_player_avatar(player_id: int, s: Session = Depends(get_session)):
    av = s.get(PlayerAvatar, player_id)
    if not av:
        raise HTTPException(status_code=404, detail="Avatar not found")

    # Cache: avatar changes rarely; frontend uses updated_at as a cache buster.
    headers = {"Cache-Control": "public, max-age=604800"}
    return Response(content=av.data, media_type=av.content_type, headers=headers)


@router.put("/{player_id}/avatar", dependencies=[Depends(require_admin)])
async def put_player_avatar(
    player_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
):
    p = s.get(Player, player_id)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail=f"Avatar too large (max {MAX_AVATAR_BYTES} bytes)")

    av = s.get(PlayerAvatar, player_id)
    now = dt.datetime.utcnow()
    if av is None:
        av = PlayerAvatar(player_id=player_id, content_type=ct, data=data, updated_at=now)
    else:
        av.content_type = ct
        av.data = data
        av.updated_at = now

    s.add(av)
    s.commit()
    s.refresh(av)
    return {"player_id": av.player_id, "updated_at": av.updated_at}


@router.delete("/{player_id}/avatar", dependencies=[Depends(require_admin)])
def delete_player_avatar(player_id: int, s: Session = Depends(get_session)):
    av = s.get(PlayerAvatar, player_id)
    if not av:
        return Response(status_code=204)
    s.delete(av)
    s.commit()
    return Response(status_code=204)
