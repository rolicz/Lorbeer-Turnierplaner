import logging
import datetime as dt

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlmodel import Session, select

from ..auth import require_admin, require_editor_claims
from ..db import get_session
from ..models import Player, PlayerAvatarFile, PlayerGuestbookEntry, PlayerHeaderImageFile, PlayerProfile
from ..schemas import PlayerCreateBody, PlayerGuestbookCreateBody, PlayerPatchBody, PlayerProfilePatchBody
from ..services.file_storage import (
    delete_media,
    media_path_for_avatar,
    media_path_for_profile_header,
    read_media,
    write_media,
)
from ..services.guestbook_summary import player_guestbook_summary

log = logging.getLogger(__name__)
router = APIRouter(prefix="/players", tags=["players"])

MAX_AVATAR_BYTES = 2_000_000  # 2MB is plenty for a cropped 512x512 webp/png
MAX_HEADER_IMAGE_BYTES = 8_000_000  # 16:9 full-hd images are larger than avatars
MAX_GUESTBOOK_BODY_CHARS = 2000


def _upsert_avatar_file(
    s: Session,
    *,
    player_id: int,
    content_type: str,
    data: bytes,
    updated_at: dt.datetime | None = None,
) -> PlayerAvatarFile:
    now = updated_at or dt.datetime.utcnow()
    rel_path = media_path_for_avatar(player_id, content_type)
    file_size = write_media(rel_path, data)

    row = s.get(PlayerAvatarFile, player_id)
    if row is None:
        row = PlayerAvatarFile(
            player_id=player_id,
            content_type=content_type,
            file_path=rel_path,
            file_size=file_size,
            updated_at=now,
        )
    else:
        if row.file_path != rel_path:
            delete_media(row.file_path)
        row.content_type = content_type
        row.file_path = rel_path
        row.file_size = file_size
        row.updated_at = now
    s.add(row)
    return row


def _profile_payload(player: Player, profile: PlayerProfile | None) -> dict:
    return {
        "player_id": int(player.id),
        "display_name": player.display_name,
        "bio": (profile.bio if profile else "") or "",
        "extras_json": (profile.extras_json if profile else "{}") or "{}",
        "header_image_updated_at": None,
        "updated_at": profile.updated_at if profile else None,
    }


def _upsert_profile_header_file(
    s: Session,
    *,
    player_id: int,
    content_type: str,
    data: bytes,
    updated_at: dt.datetime | None = None,
) -> PlayerHeaderImageFile:
    now = updated_at or dt.datetime.utcnow()
    rel_path = media_path_for_profile_header(player_id, content_type)
    file_size = write_media(rel_path, data)

    row = s.get(PlayerHeaderImageFile, player_id)
    if row is None:
        row = PlayerHeaderImageFile(
            player_id=player_id,
            content_type=content_type,
            file_path=rel_path,
            file_size=file_size,
            updated_at=now,
        )
    else:
        if row.file_path != rel_path:
            delete_media(row.file_path)
        row.content_type = content_type
        row.file_path = rel_path
        row.file_size = file_size
        row.updated_at = now
    s.add(row)
    return row


@router.get("")
def list_players(s: Session = Depends(get_session)):
    return s.exec(select(Player).order_by(Player.display_name)).all()


@router.post("", dependencies=[Depends(require_admin)])
def create_player(body: PlayerCreateBody, s: Session = Depends(get_session)):
    name = (body.display_name or "").strip()
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
    body: PlayerPatchBody,
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

    if "display_name" not in body.model_fields_set:
        raise HTTPException(status_code=400, detail="Missing display_name")

    new_name = (body.display_name or "").strip()
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


@router.get("/profiles")
def list_player_profiles(s: Session = Depends(get_session)):
    rows = s.exec(select(PlayerProfile).order_by(PlayerProfile.player_id)).all()
    header_rows = s.exec(select(PlayerHeaderImageFile.player_id, PlayerHeaderImageFile.updated_at)).all()
    header_updated_by_player_id = {int(player_id): updated_at for player_id, updated_at in header_rows}
    return [
        {
            "player_id": int(row.player_id),
            "bio": row.bio or "",
            "extras_json": row.extras_json or "{}",
            "header_image_updated_at": header_updated_by_player_id.get(int(row.player_id)),
            "updated_at": row.updated_at,
        }
        for row in rows
    ]


@router.get("/guestbook-summary")
def list_player_guestbook_summary(s: Session = Depends(get_session)) -> list[dict]:
    return player_guestbook_summary(s)


@router.get("/{player_id}/profile")
def get_player_profile(player_id: int, s: Session = Depends(get_session)):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    profile = s.get(PlayerProfile, player_id)
    payload = _profile_payload(player, profile)
    header = s.get(PlayerHeaderImageFile, player_id)
    payload["header_image_updated_at"] = header.updated_at if header else None
    return payload


@router.patch("/{player_id}/profile")
def patch_player_profile(
    player_id: int,
    body: PlayerProfilePatchBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    if int(claims.get("player_id")) != int(player_id):
        raise HTTPException(status_code=403, detail="Only the profile owner can edit this profile")

    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    profile = s.get(PlayerProfile, player_id)
    if profile is None:
        profile = PlayerProfile(player_id=player_id, bio="", extras_json="{}", updated_at=dt.datetime.utcnow())

    fields = body.model_fields_set
    if "bio" in fields:
        profile.bio = str(body.bio or "").strip()
    profile.updated_at = dt.datetime.utcnow()

    s.add(profile)
    s.commit()
    s.refresh(profile)
    return _profile_payload(player, profile)


@router.get("/avatars")
def list_player_avatar_meta(s: Session = Depends(get_session)):
    """
    Lightweight avatar metadata used by the frontend to avoid spamming 404 requests.
    Returns only player_id + updated_at for players who have an avatar.
    """
    rows = s.exec(select(PlayerAvatarFile.player_id, PlayerAvatarFile.updated_at)).all()
    return [{"player_id": int(pid), "updated_at": updated_at} for pid, updated_at in rows]


@router.get("/headers")
def list_player_header_meta(s: Session = Depends(get_session)):
    rows = s.exec(select(PlayerHeaderImageFile.player_id, PlayerHeaderImageFile.updated_at)).all()
    return [{"player_id": int(pid), "updated_at": updated_at} for pid, updated_at in rows]


@router.get("/{player_id}/avatar")
def get_player_avatar(player_id: int, s: Session = Depends(get_session)):
    fs_row = s.get(PlayerAvatarFile, player_id)
    if not fs_row:
        raise HTTPException(status_code=404, detail="Avatar not found")
    data = read_media(fs_row.file_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Avatar file missing")

    # Cache: avatar changes rarely; frontend uses updated_at as a cache buster.
    headers = {"Cache-Control": "public, max-age=604800"}
    return Response(content=data, media_type=fs_row.content_type, headers=headers)


@router.put("/{player_id}/avatar")
async def put_player_avatar(
    player_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    if int(claims.get("player_id")) != int(player_id):
        raise HTTPException(status_code=403, detail="Only the profile owner can edit this avatar")

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

    av_file = _upsert_avatar_file(
        s,
        player_id=player_id,
        content_type=ct,
        data=data,
        updated_at=dt.datetime.utcnow(),
    )
    s.commit()
    s.refresh(av_file)
    return {"player_id": av_file.player_id, "updated_at": av_file.updated_at}


@router.delete("/{player_id}/avatar")
def delete_player_avatar(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    if int(claims.get("player_id")) != int(player_id):
        raise HTTPException(status_code=403, detail="Only the profile owner can edit this avatar")

    av_file = s.get(PlayerAvatarFile, player_id)
    if not av_file:
        return Response(status_code=204)
    delete_media(av_file.file_path)
    s.delete(av_file)
    s.commit()
    return Response(status_code=204)


@router.get("/{player_id}/header-image")
def get_player_header_image(player_id: int, s: Session = Depends(get_session)):
    fs_row = s.get(PlayerHeaderImageFile, player_id)
    if not fs_row:
        raise HTTPException(status_code=404, detail="Header image not found")
    data = read_media(fs_row.file_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Header image file missing")
    headers = {"Cache-Control": "public, max-age=604800"}
    return Response(content=data, media_type=fs_row.content_type, headers=headers)


@router.put("/{player_id}/header-image")
async def put_player_header_image(
    player_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    if int(claims.get("player_id")) != int(player_id):
        raise HTTPException(status_code=403, detail="Only the profile owner can edit this header image")

    p = s.get(Player, player_id)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_HEADER_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"Header image too large (max {MAX_HEADER_IMAGE_BYTES} bytes)")

    row = _upsert_profile_header_file(
        s,
        player_id=player_id,
        content_type=ct,
        data=data,
        updated_at=dt.datetime.utcnow(),
    )
    s.commit()
    s.refresh(row)
    return {"player_id": row.player_id, "updated_at": row.updated_at}


@router.delete("/{player_id}/header-image")
def delete_player_header_image(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    if int(claims.get("player_id")) != int(player_id):
        raise HTTPException(status_code=403, detail="Only the profile owner can edit this header image")

    row = s.get(PlayerHeaderImageFile, player_id)
    if not row:
        return Response(status_code=204)
    delete_media(row.file_path)
    s.delete(row)
    s.commit()
    return Response(status_code=204)


def _guestbook_entry_payload(
    *,
    entry: PlayerGuestbookEntry,
    author_display_name: str,
) -> dict:
    return {
        "id": int(entry.id),
        "profile_player_id": int(entry.profile_player_id),
        "author_player_id": int(entry.author_player_id),
        "author_display_name": author_display_name,
        "body": entry.body,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }


@router.get("/{player_id}/guestbook")
def list_player_guestbook(player_id: int, s: Session = Depends(get_session)):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    rows = s.exec(
        select(PlayerGuestbookEntry)
        .where(PlayerGuestbookEntry.profile_player_id == player_id)
        .order_by(PlayerGuestbookEntry.created_at.desc(), PlayerGuestbookEntry.id.desc())
    ).all()
    author_ids = sorted({int(row.author_player_id) for row in rows})
    authors = s.exec(select(Player).where(Player.id.in_(author_ids))).all() if author_ids else []
    author_name_by_id = {int(p.id): p.display_name for p in authors}
    return [
        _guestbook_entry_payload(
            entry=row,
            author_display_name=author_name_by_id.get(int(row.author_player_id), f"Player #{int(row.author_player_id)}"),
        )
        for row in rows
    ]


@router.post("/{player_id}/guestbook")
def create_player_guestbook_entry(
    player_id: int,
    body: PlayerGuestbookCreateBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    text = str(body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="body is required")
    if len(text) > MAX_GUESTBOOK_BODY_CHARS:
        raise HTTPException(status_code=413, detail=f"body too long (max {MAX_GUESTBOOK_BODY_CHARS} chars)")

    author_player_id = int(claims.get("player_id"))
    author_player = s.get(Player, author_player_id)
    if not author_player:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    now = dt.datetime.utcnow()
    row = PlayerGuestbookEntry(
        profile_player_id=int(player_id),
        author_player_id=author_player_id,
        body=text,
        created_at=now,
        updated_at=now,
    )
    s.add(row)
    s.commit()
    s.refresh(row)
    return _guestbook_entry_payload(entry=row, author_display_name=author_player.display_name)


@router.delete("/guestbook/{entry_id}")
def delete_player_guestbook_entry(
    entry_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    row = s.get(PlayerGuestbookEntry, entry_id)
    if not row:
        raise HTTPException(status_code=404, detail="Guestbook entry not found")

    claims_player_id = int(claims.get("player_id"))
    role = str(claims.get("role") or "")
    allowed = role == "admin" or claims_player_id == int(row.author_player_id) or claims_player_id == int(row.profile_player_id)
    if not allowed:
        raise HTTPException(status_code=403, detail="Insufficient privileges")

    s.delete(row)
    s.commit()
    return Response(status_code=204)
