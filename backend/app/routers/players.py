import datetime as dt
import logging

from anyio import from_thread
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlmodel import Session, select

from ..api_utils import bad_request, conflict, forbidden
from ..auth import require_admin, require_auth_claims, require_editor_claims
from ..db import get_engine, get_session
from ..models import (
    Account,
    GroupMembership,
    Player,
    PlayerAvatarFile,
    PlayerGuestbookEntry,
    PlayerGuestbookRead,
    PlayerGuestbookThreadLink,
    PlayerGuestbookVote,
    PlayerHeaderImageFile,
    PlayerPoke,
    PlayerPokeRead,
    PlayerProfile,
    PlayerSubjectSnapshot,
)
from ..schemas import (
    PlayerCreateBody,
    PlayerGuestbookCreateBody,
    PlayerGuestbookPatchBody,
    PlayerGuestbookVoteBody,
    PlayerPatchBody,
    PlayerPokeCreateBody,
    PlayerProfilePatchBody,
)
from ..schemas.responses import (
    EntryIdsOut,
    GuestbookEntryOut,
    GuestbookReadMapOut,
    GuestbookSummaryOut,
    MarkedResponse,
    OkResponse,
    PlayerMediaMetaOut,
    PlayerRef,
    PokeAuthoredUnreadOut,
    PokeIdsOut,
    PokeOut,
    PokeReadMapOut,
    PokeSummaryOut,
    ProfileMetaOut,
    ProfileOut,
    VoteResultOut,
    VotersOut,
)
from ..services.accounts import create_account_for, ensure_name_free, name_key
from ..services.authorization import require_profile_owner, require_self_or_admin
from ..services.file_storage import (
    delete_media,
    media_path_for_avatar,
    media_path_for_profile_header,
    upsert_media_row,
)
from ..services.groups import current_group, ensure_shared_group, roster_for
from ..services.guestbook import guestbook_can_edit, guestbook_entry_payload, list_guestbook_entries
from ..services.guestbook_subjects import (
    SubjectUnavailable,
    attach_subject,
    find_or_create_snapshot,
    normalize_subject_kind,
    release_subjects,
    subject_payload,
    subjects_for_entries,
)
from ..services.guestbook_summary import player_guestbook_summary
from ..services.media_derivatives import MediaWidthParam, media_response, version_token
from ..services.notifications import enqueue_poke_push, push_guestbook_created
from ..services.poke_summary import player_poke_summary
from ..ws import ws_manager_player_profiles

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
    return upsert_media_row(s, row_cls=PlayerAvatarFile, row_id=player_id, id_field="player_id", content_type=content_type, data=data, path_builder=media_path_for_avatar, updated_at=updated_at)


def _profile_payload(player: Player, profile: PlayerProfile | None) -> dict:
    return {
        "player_id": int(player.id),
        "display_name": player.display_name,
        "bio": (profile.bio if profile else "") or "",
        "extras_json": (profile.extras_json if profile else "{}") or "{}",
        "header_image_updated_at": None,
        "updated_at": profile.updated_at if profile else None,
    }


def _broadcast_player_profile_event(player_id: int, *, event: str, payload: dict) -> None:
    """Push one profile-channel event (`/ws/players/{id}`) — pokes and guestbook both use it."""
    try:
        from_thread.run(
            ws_manager_player_profiles.broadcast,
            int(player_id),
            event,
            payload,
        )
    except Exception:
        # WS notifications are best-effort and must never break API writes.
        return


def _broadcast_guestbook_event(profile_player_id: int, *, action: str, entry_id: int) -> None:
    """A guestbook write changes what every viewer of that profile sees — say so on the channel (A5)."""
    _broadcast_player_profile_event(
        int(profile_player_id),
        event="player:guestbook:update",
        payload={
            "player_id": int(profile_player_id),
            "action": action,
            "entry_id": int(entry_id),
        },
    )


def _upsert_profile_header_file(
    s: Session,
    *,
    player_id: int,
    content_type: str,
    data: bytes,
    updated_at: dt.datetime | None = None,
) -> PlayerHeaderImageFile:
    return upsert_media_row(s, row_cls=PlayerHeaderImageFile, row_id=player_id, id_field="player_id", content_type=content_type, data=data, path_builder=media_path_for_profile_header, updated_at=updated_at)


@router.get("", response_model=list[PlayerRef])
def list_players(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)):
    """The roster: members of the caller's groups (a site admin sees everyone), so an account
    nobody has invited yet is in no picker and no stat (L3)."""
    return roster_for(s, claims)


@router.post("", response_model=PlayerRef, dependencies=[Depends(require_admin)])
def create_player(body: PlayerCreateBody, s: Session = Depends(get_session)):
    """An admin-created player: the `Player`, its passwordless `Account` and its membership
    in the current group, in one transaction (a player committed without an account would be
    swept into the group by the next boot's migration anyway — but a name that clashes by
    case would stop that boot). 409 when the name is taken, compared case-insensitively.
    The player gets a login through a reset link."""
    name = (body.display_name or "").strip()
    if not name:
        bad_request("Missing display_name")
    ensure_name_free(s, name)

    p = Player(display_name=name)
    s.add(p)
    s.flush()
    create_account_for(s, p)
    s.add(GroupMembership(group_id=int(current_group(s).id), player_id=int(p.id), role="member"))
    s.commit()
    s.refresh(p)
    log.info("Created player '%s' (id=%s)", p.display_name, p.id)
    return p

@router.patch("/{player_id}", response_model=PlayerRef, dependencies=[Depends(require_admin)])
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
        bad_request("Missing display_name")

    new_name = (body.display_name or "").strip()
    if not new_name:
        bad_request("display_name cannot be empty")

    # The display name is the login name: unique case-insensitively, and the account's
    # `name_key` follows a rename in the same transaction (L3).
    ensure_name_free(s, new_name, except_player_id=player_id)

    p.display_name = new_name
    s.add(p)
    account = s.get(Account, int(player_id))
    if account is not None:
        account.name_key = name_key(new_name)
        account.updated_at = dt.datetime.utcnow()
        s.add(account)
    s.commit()
    s.refresh(p)

    log.info("Player renamed: id=%s name=%s", player_id, new_name)
    return p


@router.get("/profiles", response_model=list[ProfileMetaOut])
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


@router.get("/guestbook-summary", response_model=list[GuestbookSummaryOut])
def list_player_guestbook_summary(s: Session = Depends(get_session)) -> list[dict]:
    return player_guestbook_summary(s)


@router.get("/pokes-summary", response_model=list[PokeSummaryOut])
def list_player_poke_summary(s: Session = Depends(get_session)) -> list[dict]:
    return player_poke_summary(s)


@router.get("/pokes-authored-unread-summary", response_model=list[PokeAuthoredUnreadOut])
def list_player_pokes_authored_unread_summary(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> list[dict]:
    author_player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(
            PlayerPoke.profile_player_id,
            PlayerPoke.id,
            PlayerPoke.created_at,
        )
        .outerjoin(
            PlayerPokeRead,
            (PlayerPokeRead.poke_id == PlayerPoke.id)
            & (PlayerPokeRead.player_id == PlayerPoke.profile_player_id),
        )
        .where(
            PlayerPoke.author_player_id == author_player_id,
            PlayerPokeRead.poke_id.is_(None),
        )
        .order_by(
            PlayerPoke.profile_player_id,
            PlayerPoke.created_at,
            PlayerPoke.id,
        )
    ).all()

    out: dict[int, dict] = {}
    for profile_player_id, poke_id, created_at in rows:
        pid = int(profile_player_id)
        eid = int(poke_id)
        item = out.get(pid)
        if not item:
            item = {
                "profile_player_id": pid,
                "unread_count": 0,
                "latest_created_at": None,
                "poke_ids": [],
            }
            out[pid] = item

        item["unread_count"] += 1
        item["latest_created_at"] = (
            created_at
            if item["latest_created_at"] is None
            else max(item["latest_created_at"], created_at)
        )
        item["poke_ids"].append(eid)

    return list(out.values())


@router.get("/guestbook-read-map", response_model=list[GuestbookReadMapOut])
def list_player_guestbook_read_map(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> list[dict]:
    player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(PlayerGuestbookEntry.profile_player_id, PlayerGuestbookRead.guestbook_entry_id)
        .join(PlayerGuestbookEntry, PlayerGuestbookEntry.id == PlayerGuestbookRead.guestbook_entry_id)
        .where(PlayerGuestbookRead.player_id == player_id)
        .order_by(PlayerGuestbookEntry.profile_player_id, PlayerGuestbookRead.guestbook_entry_id)
    ).all()
    out: dict[int, list[int]] = {}
    for profile_player_id, entry_id in rows:
        pid = int(profile_player_id)
        out.setdefault(pid, []).append(int(entry_id))
    return [{"profile_player_id": pid, "entry_ids": ids} for pid, ids in out.items()]


@router.get("/pokes-read-map", response_model=list[PokeReadMapOut])
def list_player_poke_read_map(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> list[dict]:
    player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(PlayerPoke.profile_player_id, PlayerPokeRead.poke_id)
        .join(PlayerPoke, PlayerPoke.id == PlayerPokeRead.poke_id)
        .where(PlayerPokeRead.player_id == player_id)
        .order_by(PlayerPoke.profile_player_id, PlayerPokeRead.poke_id)
    ).all()
    out: dict[int, list[int]] = {}
    for profile_player_id, poke_id in rows:
        pid = int(profile_player_id)
        out.setdefault(pid, []).append(int(poke_id))
    return [{"profile_player_id": pid, "poke_ids": ids} for pid, ids in out.items()]


@router.get("/{player_id}/profile", response_model=ProfileOut)
def get_player_profile(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)
    profile = s.get(PlayerProfile, player_id)
    payload = _profile_payload(player, profile)
    header = s.get(PlayerHeaderImageFile, player_id)
    payload["header_image_updated_at"] = header.updated_at if header else None
    return payload


@router.patch("/{player_id}/profile", response_model=ProfileOut)
def patch_player_profile(
    player_id: int,
    body: PlayerProfilePatchBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    require_profile_owner(claims, player_id, what="profile")

    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

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


def _roster_ids(s: Session, claims: dict) -> list[int]:
    return [int(p.id) for p in roster_for(s, claims)]


@router.get("/avatars", response_model=list[PlayerMediaMetaOut])
def list_player_avatar_meta(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)):
    """
    Lightweight avatar metadata used by the frontend to avoid spamming 404 requests.
    Returns only player_id + updated_at for players who have an avatar — and only for the
    caller's roster (L11): the picture itself is refused to anyone outside it
    (`ensure_shared_group`), so a stranger's avatar must never be *announced* either, or the
    browser asks for it, gets a 403 and draws a broken image where the monogram belongs.
    """
    rows = s.exec(
        select(PlayerAvatarFile.player_id, PlayerAvatarFile.updated_at).where(PlayerAvatarFile.player_id.in_(_roster_ids(s, claims)))
    ).all()
    return [{"player_id": int(pid), "updated_at": updated_at} for pid, updated_at in rows]


@router.get("/headers", response_model=list[PlayerMediaMetaOut])
def list_player_header_meta(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)):
    """The same for header images, and for the same reason."""
    rows = s.exec(
        select(PlayerHeaderImageFile.player_id, PlayerHeaderImageFile.updated_at).where(
            PlayerHeaderImageFile.player_id.in_(_roster_ids(s, claims))
        )
    ).all()
    return [{"player_id": int(pid), "updated_at": updated_at} for pid, updated_at in rows]


@router.get("/{player_id}/avatar")
def get_player_avatar(
    player_id: int,
    w: MediaWidthParam = None,
    claims: dict = Depends(require_auth_claims),
):
    with Session(get_engine()) as s:
        ensure_shared_group(s, claims, player_id)
        fs_row = s.get(PlayerAvatarFile, player_id)
        if not fs_row:
            raise HTTPException(status_code=404, detail="Avatar not found")
        content_type = fs_row.content_type
        file_path = fs_row.file_path
        updated_at = fs_row.updated_at

    # Cache: avatar changes rarely; frontend uses updated_at as a cache buster — and the
    # derived size on disk is keyed on that same `updated_at`, never on the caller's `?v=`.
    return media_response(
        source_rel_path=file_path,
        content_type=content_type,
        token=version_token(updated_at),
        width=w,
        cache_control="public, max-age=604800",
        missing="Avatar file missing",
    )


@router.put("/{player_id}/avatar", response_model=PlayerMediaMetaOut)
async def put_player_avatar(
    player_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    require_profile_owner(claims, player_id, what="avatar")

    p = s.get(Player, player_id)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        bad_request("Invalid file type")

    data = await file.read()
    if not data:
        bad_request("Empty file")
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
    require_profile_owner(claims, player_id, what="avatar")

    av_file = s.get(PlayerAvatarFile, player_id)
    if not av_file:
        return Response(status_code=204)
    delete_media(av_file.file_path)
    s.delete(av_file)
    s.commit()
    return Response(status_code=204)


@router.get("/{player_id}/header-image")
def get_player_header_image(
    player_id: int,
    w: MediaWidthParam = None,
    claims: dict = Depends(require_auth_claims),
):
    with Session(get_engine()) as s:
        ensure_shared_group(s, claims, player_id)
        fs_row = s.get(PlayerHeaderImageFile, player_id)
        if not fs_row:
            raise HTTPException(status_code=404, detail="Header image not found")
        content_type = fs_row.content_type
        file_path = fs_row.file_path
        updated_at = fs_row.updated_at

    return media_response(
        source_rel_path=file_path,
        content_type=content_type,
        token=version_token(updated_at),
        width=w,
        cache_control="public, max-age=604800",
        missing="Header image file missing",
    )


@router.get("/guestbook-subjects/{snapshot_id}/image")
def get_guestbook_subject_image(
    snapshot_id: int,
    w: MediaWidthParam = None,
    claims: dict = Depends(require_auth_claims),
):
    """The pinned copy a guestbook entry is about (K1).

    Read like the avatar: only by someone who shares a group with its player (L11). Immutable: a snapshot never changes and its URL carries
    its id, so the browser may keep it for a year — this is the one picture in the app
    that is *guaranteed* not to be replaced under its own URL. A `?w=` derivative of it is
    exactly as immutable, which is why it carries the same header (W1).
    """
    with Session(get_engine()) as s:
        snap = s.get(PlayerSubjectSnapshot, snapshot_id)
        if not snap or not snap.file_path:
            raise HTTPException(status_code=404, detail="Guestbook subject image not found")
        ensure_shared_group(s, claims, int(snap.player_id))
        content_type = snap.content_type
        file_path = snap.file_path
        captured_at = snap.captured_at

    return media_response(
        source_rel_path=file_path,
        content_type=content_type,
        token=version_token(captured_at),
        width=w,
        cache_control="public, max-age=31536000, immutable",
        missing="Guestbook subject image file missing",
    )


@router.put("/{player_id}/header-image", response_model=PlayerMediaMetaOut)
async def put_player_header_image(
    player_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    require_profile_owner(claims, player_id, what="header image")

    p = s.get(Player, player_id)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")

    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        bad_request("Invalid file type")

    data = await file.read()
    if not data:
        bad_request("Empty file")
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
    require_profile_owner(claims, player_id, what="header image")

    row = s.get(PlayerHeaderImageFile, player_id)
    if not row:
        return Response(status_code=204)
    delete_media(row.file_path)
    s.delete(row)
    s.commit()
    return Response(status_code=204)



def _poke_payload(
    *,
    poke: PlayerPoke,
    author_display_name: str,
    seen_by_profile_owner: bool = False,
) -> dict:
    return {
        "id": int(poke.id),
        "profile_player_id": int(poke.profile_player_id),
        "author_player_id": int(poke.author_player_id),
        "author_display_name": author_display_name,
        "created_at": poke.created_at,
        "seen_by_profile_owner": bool(seen_by_profile_owner),
    }


@router.get("/{player_id}/guestbook", response_model=list[GuestbookEntryOut])
def list_player_guestbook(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)
    return list_guestbook_entries(s, player_id, claims)


@router.get("/{player_id}/pokes", response_model=list[PokeOut])
def list_player_pokes(
    player_id: int,
    limit: int = 40,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    lim = max(1, min(int(limit), 250))
    rows = s.exec(
        select(PlayerPoke)
        .where(PlayerPoke.profile_player_id == player_id)
        .order_by(PlayerPoke.created_at.desc(), PlayerPoke.id.desc())
        .limit(lim)
    ).all()
    poke_ids = [int(row.id) for row in rows]
    seen_by_owner_ids: set[int] = set()
    if poke_ids:
        seen_by_owner_ids = {
            int(pid)
            for pid in s.exec(
                select(PlayerPokeRead.poke_id).where(
                    PlayerPokeRead.player_id == int(player_id),
                    PlayerPokeRead.poke_id.in_(poke_ids),
                )
            ).all()
        }
    author_ids = sorted({int(row.author_player_id) for row in rows})
    authors = s.exec(select(Player).where(Player.id.in_(author_ids))).all() if author_ids else []
    author_name_by_id = {int(p.id): p.display_name for p in authors}
    return [
        _poke_payload(
            poke=row,
            author_display_name=author_name_by_id.get(int(row.author_player_id), f"Player #{int(row.author_player_id)}"),
            seen_by_profile_owner=int(row.id) in seen_by_owner_ids,
        )
        for row in rows
    ]


@router.get("/{player_id}/guestbook/read", response_model=EntryIdsOut)
def list_player_guestbook_reads(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    viewer_player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(PlayerGuestbookRead.guestbook_entry_id)
        .join(PlayerGuestbookEntry, PlayerGuestbookEntry.id == PlayerGuestbookRead.guestbook_entry_id)
        .where(
            PlayerGuestbookRead.player_id == viewer_player_id,
            PlayerGuestbookEntry.profile_player_id == player_id,
        )
        .order_by(PlayerGuestbookRead.guestbook_entry_id)
    ).all()
    return {"entry_ids": [int(x) for x in rows]}


@router.get("/{player_id}/pokes/read", response_model=PokeIdsOut)
def list_player_poke_reads(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    viewer_player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(PlayerPokeRead.poke_id)
        .join(PlayerPoke, PlayerPoke.id == PlayerPokeRead.poke_id)
        .where(
            PlayerPokeRead.player_id == viewer_player_id,
            PlayerPoke.profile_player_id == player_id,
        )
        .order_by(PlayerPokeRead.poke_id)
    ).all()
    return {"poke_ids": [int(x) for x in rows]}


@router.post("/{player_id}/guestbook", response_model=GuestbookEntryOut)
def create_player_guestbook_entry(
    player_id: int,
    body: PlayerGuestbookCreateBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    text = str(body.body or "").strip()
    if not text:
        bad_request("body is required")
    if len(text) > MAX_GUESTBOOK_BODY_CHARS:
        raise HTTPException(status_code=413, detail=f"body too long (max {MAX_GUESTBOOK_BODY_CHARS} chars)")

    claims_player_id = int(claims.get("player_id"))
    req_author_player_id = None if body.author_player_id in (None, "") else int(body.author_player_id)
    author_player_id = req_author_player_id if req_author_player_id is not None else claims_player_id
    require_self_or_admin(claims, author_player_id, message="You can only post guestbook messages as yourself")
    author_player = s.get(Player, author_player_id)
    if not author_player:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    now = dt.datetime.utcnow()
    parent_entry_id: int | None = None
    if body.parent_entry_id is not None:
        parent_entry_id = int(body.parent_entry_id)
        parent_row = s.get(PlayerGuestbookEntry, parent_entry_id)
        if parent_row is None:
            raise HTTPException(status_code=404, detail="Parent guestbook entry not found")
        if int(parent_row.profile_player_id) != int(player_id):
            bad_request("Parent entry belongs to a different profile")

    # What this entry is about (K1). Pinned *before* the entry is inserted, so a subject
    # that is not on the profile any more costs nothing but the 409.
    try:
        subject_kind = normalize_subject_kind(body.subject_kind)
    except ValueError:
        bad_request("Unknown subject")
    if subject_kind is not None and parent_entry_id is not None:
        bad_request("A reply cannot carry a subject")
    snapshot = None
    if subject_kind is not None:
        try:
            snapshot = find_or_create_snapshot(s, player_id=int(player_id), kind=subject_kind, now=now)
        except SubjectUnavailable as exc:
            conflict(str(exc))

    row = PlayerGuestbookEntry(
        profile_player_id=int(player_id),
        author_player_id=author_player_id,
        body=text,
        created_at=now,
        updated_at=now,
    )
    s.add(row)
    s.flush()

    if snapshot is not None:
        attach_subject(s, entry_id=int(row.id), snapshot_id=int(snapshot.id))

    if parent_entry_id is not None:
        s.add(
            PlayerGuestbookThreadLink(
                entry_id=int(row.id),
                parent_entry_id=parent_entry_id,
            )
        )

    read_row = s.get(PlayerGuestbookRead, (author_player_id, int(row.id)))
    if read_row is None:
        s.add(PlayerGuestbookRead(player_id=author_player_id, guestbook_entry_id=int(row.id), read_at=now))
    s.commit()
    s.refresh(row)
    _broadcast_guestbook_event(int(player_id), action="created", entry_id=int(row.id))
    preview = text if len(text) <= 120 else text[:117].rstrip() + "..."
    push_guestbook_created(
        request,
        profile_player_id=int(player_id),
        entry_id=int(row.id),
        profile_player_name=player.display_name,
        author_name=author_player.display_name,
        preview=preview,
    )
    return guestbook_entry_payload(
        entry=row,
        author_display_name=author_player.display_name,
        parent_entry_id=parent_entry_id,
        subject=subject_payload(snapshot, current=True) if snapshot is not None else None,
    )


@router.patch("/guestbook/{entry_id}", response_model=GuestbookEntryOut)
def patch_player_guestbook_entry(
    entry_id: int,
    body: PlayerGuestbookPatchBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    row = s.get(PlayerGuestbookEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Guestbook entry not found")

    viewer_id = int(claims.get("player_id"))
    is_admin = str(claims.get("role") or "") == "admin"
    if not guestbook_can_edit(row, viewer_id=viewer_id, is_admin=is_admin):
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own message within an hour of posting",
        )

    if "body" in body.model_fields_set:
        text = str(body.body or "").strip()
        if not text:
            bad_request("body is required")
        if len(text) > MAX_GUESTBOOK_BODY_CHARS:
            raise HTTPException(status_code=413, detail=f"body too long (max {MAX_GUESTBOOK_BODY_CHARS} chars)")
        row.body = text

    row.updated_at = dt.datetime.utcnow()
    s.add(row)
    s.commit()
    s.refresh(row)
    _broadcast_guestbook_event(int(row.profile_player_id), action="updated", entry_id=int(row.id))

    author = s.get(Player, int(row.author_player_id))
    parent_link = s.get(PlayerGuestbookThreadLink, int(row.id))
    parent_entry_id = int(parent_link.parent_entry_id) if parent_link else None
    vote_values = s.exec(
        select(PlayerGuestbookVote.value).where(PlayerGuestbookVote.guestbook_entry_id == int(row.id))
    ).all()
    up = sum(1 for v in vote_values if int(v) > 0)
    down = sum(1 for v in vote_values if int(v) < 0)
    my_vote_row = s.get(PlayerGuestbookVote, (viewer_id, int(row.id)))
    return guestbook_entry_payload(
        entry=row,
        author_display_name=author.display_name if author else f"Player #{int(row.author_player_id)}",
        parent_entry_id=parent_entry_id,
        upvotes=up,
        downvotes=down,
        my_vote=int(my_vote_row.value) if my_vote_row else 0,
        can_edit=guestbook_can_edit(row, viewer_id=viewer_id, is_admin=is_admin),
        subject=subjects_for_entries(
            s, player_id=int(row.profile_player_id), entry_ids=[int(row.id)]
        ).get(int(row.id)),
    )


@router.post("/{player_id}/pokes", response_model=PokeOut)
def create_player_poke(
    player_id: int,
    request: Request,
    body: PlayerPokeCreateBody | None = None,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    claims_player_id = int(claims.get("player_id"))
    req_author_player_id = None if body is None or body.author_player_id in (None, "") else int(body.author_player_id)
    author_player_id = req_author_player_id if req_author_player_id is not None else claims_player_id
    require_self_or_admin(claims, author_player_id, message="You can only poke as yourself")
    if author_player_id == int(player_id):
        bad_request("Cannot poke yourself")

    author_player = s.get(Player, author_player_id)
    if not author_player:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    now = dt.datetime.utcnow()
    row = PlayerPoke(
        profile_player_id=int(player_id),
        author_player_id=author_player_id,
        created_at=now,
    )
    s.add(row)
    s.commit()
    s.refresh(row)

    # Author's own poke is considered "read" for themselves.
    read_row = s.get(PlayerPokeRead, (author_player_id, int(row.id)))
    if read_row is None:
        s.add(PlayerPokeRead(player_id=author_player_id, poke_id=int(row.id), read_at=now))
        s.commit()

    _broadcast_player_profile_event(
        int(player_id),
        event="player:pokes:update",
        payload={
            "player_id": int(player_id),
            "action": "created",
            "poke_id": int(row.id),
            "author_player_id": int(author_player_id),
        },
    )

    enqueue_poke_push(
        request,
        profile_player_id=int(player_id),
        profile_player_name=player.display_name,
        author_player_name=author_player.display_name,
        poke_id=int(row.id),
    )

    return _poke_payload(poke=row, author_display_name=author_player.display_name)


@router.put("/guestbook/{entry_id}/read", response_model=OkResponse)
def mark_player_guestbook_entry_read(
    entry_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    row = s.get(PlayerGuestbookEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Guestbook entry not found")
    ensure_shared_group(s, claims, int(row.profile_player_id))
    player_id = int(claims.get("player_id"))
    now = dt.datetime.utcnow()
    read_row = s.get(PlayerGuestbookRead, (player_id, int(entry_id)))
    if read_row is None:
        read_row = PlayerGuestbookRead(player_id=player_id, guestbook_entry_id=int(entry_id), read_at=now)
    else:
        read_row.read_at = now
    s.add(read_row)
    s.commit()
    return {"ok": True}


@router.put("/guestbook/{entry_id}/vote", response_model=VoteResultOut)
def vote_player_guestbook_entry(
    entry_id: int,
    body: PlayerGuestbookVoteBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    row = s.get(PlayerGuestbookEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Guestbook entry not found")
    ensure_shared_group(s, claims, int(row.profile_player_id))

    player_id = int(claims.get("player_id"))
    raw = body.value
    try:
        value = int(0 if raw in (None, "") else raw)
    except Exception:
        bad_request("Invalid vote value")
    if value not in (-1, 0, 1):
        bad_request("vote value must be one of -1, 0, 1")

    now = dt.datetime.utcnow()
    vote_row = s.get(PlayerGuestbookVote, (player_id, int(entry_id)))
    if value == 0:
        if vote_row is not None:
            s.delete(vote_row)
            s.commit()
    else:
        if vote_row is None:
            vote_row = PlayerGuestbookVote(
                player_id=player_id,
                guestbook_entry_id=int(entry_id),
                value=value,
                updated_at=now,
            )
        else:
            vote_row.value = value
            vote_row.updated_at = now
        s.add(vote_row)
        s.commit()
    _broadcast_guestbook_event(int(row.profile_player_id), action="voted", entry_id=int(entry_id))
    return {"ok": True, "value": value}


@router.get("/guestbook/{entry_id}/voters", response_model=VotersOut)
def list_player_guestbook_entry_voters(
    entry_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    row = s.get(PlayerGuestbookEntry, entry_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Guestbook entry not found")
    ensure_shared_group(s, claims, int(row.profile_player_id))
    votes = s.exec(
        select(PlayerGuestbookVote.value, Player.id, Player.display_name)
        .join(Player, Player.id == PlayerGuestbookVote.player_id)
        .where(PlayerGuestbookVote.guestbook_entry_id == int(entry_id))
        .order_by(Player.display_name.asc(), Player.id.asc())
    ).all()
    upvoters: list[dict] = []
    downvoters: list[dict] = []
    for value, player_id, display_name in votes:
        payload = {"id": int(player_id), "display_name": display_name}
        if int(value) > 0:
            upvoters.append(payload)
        elif int(value) < 0:
            downvoters.append(payload)
    return {"upvoters": upvoters, "downvoters": downvoters}


@router.put("/{player_id}/guestbook/read-all", response_model=MarkedResponse)
def mark_player_guestbook_read_all(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    viewer_player_id = int(claims.get("player_id"))
    entry_ids = [
        int(eid)
        for eid in s.exec(select(PlayerGuestbookEntry.id).where(PlayerGuestbookEntry.profile_player_id == player_id)).all()
    ]
    if not entry_ids:
        return {"ok": True, "marked": 0}

    existing = {
        int(eid)
        for eid in s.exec(
            select(PlayerGuestbookRead.guestbook_entry_id).where(
                PlayerGuestbookRead.player_id == viewer_player_id,
                PlayerGuestbookRead.guestbook_entry_id.in_(entry_ids),
            )
        ).all()
    }
    now = dt.datetime.utcnow()
    marked = 0
    for eid in entry_ids:
        if eid in existing:
            continue
        s.add(PlayerGuestbookRead(player_id=viewer_player_id, guestbook_entry_id=eid, read_at=now))
        marked += 1
    if marked:
        s.commit()
    return {"ok": True, "marked": marked}


@router.put("/{player_id}/pokes/read-all", response_model=MarkedResponse)
def mark_player_poke_read_all(
    player_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    player = s.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    ensure_shared_group(s, claims, player_id)

    viewer_player_id = int(claims.get("player_id"))
    poke_ids = [
        int(eid)
        for eid in s.exec(select(PlayerPoke.id).where(PlayerPoke.profile_player_id == player_id)).all()
    ]
    if not poke_ids:
        return {"ok": True, "marked": 0}

    existing = {
        int(eid)
        for eid in s.exec(
            select(PlayerPokeRead.poke_id).where(
                PlayerPokeRead.player_id == viewer_player_id,
                PlayerPokeRead.poke_id.in_(poke_ids),
            )
        ).all()
    }
    now = dt.datetime.utcnow()
    marked = 0
    for eid in poke_ids:
        if eid in existing:
            continue
        s.add(PlayerPokeRead(player_id=viewer_player_id, poke_id=eid, read_at=now))
        marked += 1
    if marked:
        s.commit()
        _broadcast_player_profile_event(
            int(player_id),
            event="player:pokes:update",
            payload={
                "player_id": int(player_id),
                "action": "read_all",
                "viewer_player_id": int(viewer_player_id),
                "marked": int(marked),
            },
        )
    return {"ok": True, "marked": marked}


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
        forbidden("Insufficient privileges")

    root_id = int(entry_id)
    profile_player_id = int(row.profile_player_id)

    links = s.exec(
        select(PlayerGuestbookThreadLink.entry_id, PlayerGuestbookThreadLink.parent_entry_id)
        .join(PlayerGuestbookEntry, PlayerGuestbookEntry.id == PlayerGuestbookThreadLink.entry_id)
        .where(PlayerGuestbookEntry.profile_player_id == profile_player_id)
    ).all()
    children_by_parent: dict[int, list[int]] = {}
    for child_id, parent_id in links:
        pid = int(parent_id)
        children_by_parent.setdefault(pid, []).append(int(child_id))

    to_delete: set[int] = set()
    stack = [root_id]
    while stack:
        current = stack.pop()
        if current in to_delete:
            continue
        to_delete.add(current)
        stack.extend(children_by_parent.get(current, []))

    if not to_delete:
        return Response(status_code=204)

    link_rows = s.exec(
        select(PlayerGuestbookThreadLink).where(
            PlayerGuestbookThreadLink.entry_id.in_(list(to_delete))
        )
    ).all()
    for lrow in link_rows:
        s.delete(lrow)

    read_rows = s.exec(
        select(PlayerGuestbookRead).where(
            PlayerGuestbookRead.guestbook_entry_id.in_(list(to_delete))
        )
    ).all()
    for rr in read_rows:
        s.delete(rr)

    vote_rows = s.exec(
        select(PlayerGuestbookVote).where(
            PlayerGuestbookVote.guestbook_entry_id.in_(list(to_delete))
        )
    ).all()
    for vrow in vote_rows:
        s.delete(vrow)

    # A pinned copy dies with the last entry that names it (K1) — rows now, files after
    # the commit.
    subject_paths = release_subjects(s, entry_ids=list(to_delete))

    entry_rows = s.exec(
        select(PlayerGuestbookEntry).where(PlayerGuestbookEntry.id.in_(list(to_delete)))
    ).all()
    for erow in entry_rows:
        s.delete(erow)

    s.commit()
    # Files only after the rows are safely gone, so a failed commit leaves no hole.
    for path in subject_paths:
        delete_media(path)
    _broadcast_guestbook_event(profile_player_id, action="deleted", entry_id=root_id)
    return Response(status_code=204)
