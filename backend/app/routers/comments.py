from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlmodel import Session, select

from ..auth import require_admin, require_auth_claims, require_editor, require_editor_claims
from ..db import get_session
from ..schemas import CommentCreateBody, CommentPatchBody, CommentsPinBody
from ..models import (
    Comment,
    CommentRead,
    CommentImageFile,
    Match,
    Player,
    Tournament,
    TournamentPinnedComment,
    TournamentPlayer,
)
from ..services.file_storage import (
    delete_media,
    media_exists,
    media_path_for_comment,
    read_media,
    write_media,
)
from ..services.comments_summary import tournament_comments_summary
from ..ws import ws_manager

log = logging.getLogger(__name__)
router = APIRouter(tags=["comments"])
MAX_COMMENT_IMAGE_BYTES = 8_000_000  # enough for cropped 1920x1440 webp/png


def _upsert_comment_image_file(
    s: Session,
    *,
    comment_id: int,
    content_type: str,
    data: bytes,
    updated_at: datetime | None = None,
) -> CommentImageFile:
    now = updated_at or datetime.utcnow()
    rel_path = media_path_for_comment(comment_id, content_type)
    file_size = write_media(rel_path, data)

    row = s.get(CommentImageFile, comment_id)
    if row is None:
        row = CommentImageFile(
            comment_id=comment_id,
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


def _comment_image_updated_at(s: Session, comment_id: int) -> datetime | None:
    fs_row = s.get(CommentImageFile, comment_id)
    if fs_row and media_exists(fs_row.file_path):
        return fs_row.updated_at
    return None


def _tournament_or_404(s: Session, tournament_id: int) -> Tournament:
    t = s.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


def _comment_or_404(s: Session, comment_id: int) -> Comment:
    c = s.get(Comment, comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    return c


def _comment_image_meta_map(s: Session, tournament_id: int) -> dict[int, datetime]:
    rows_fs = s.exec(
        select(CommentImageFile.comment_id, CommentImageFile.updated_at, CommentImageFile.file_path)
        .join(Comment, Comment.id == CommentImageFile.comment_id)
        .where(Comment.tournament_id == tournament_id)
    ).all()
    out: dict[int, datetime] = {}
    for comment_id, updated_at, file_path in rows_fs:
        if media_exists(file_path):
            out[int(comment_id)] = updated_at
    return out


def _comment_dict(c: Comment, image_updated_at: datetime | None = None) -> dict:
    return {
        "id": c.id,
        "tournament_id": c.tournament_id,
        "match_id": c.match_id,
        "author_player_id": c.author_player_id,
        "body": c.body,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "has_image": image_updated_at is not None,
        "image_updated_at": image_updated_at,
    }


def _validate_author(s: Session, tournament_id: int, author_player_id: int | None) -> None:
    if author_player_id is None:
        return
    p = s.get(Player, author_player_id)
    if not p:
        raise HTTPException(status_code=400, detail=f"Unknown author_player_id {author_player_id}")
    link = s.exec(
        select(TournamentPlayer).where(
            TournamentPlayer.tournament_id == tournament_id,
            TournamentPlayer.player_id == author_player_id,
        )
    ).first()
    if not link:
        raise HTTPException(status_code=400, detail="author_player_id is not a participant of this tournament")


def _validate_match_ref(s: Session, tournament_id: int, match_id: int | None) -> None:
    if match_id is None:
        return
    m = s.get(Match, match_id)
    if not m:
        raise HTTPException(status_code=400, detail=f"Unknown match_id {match_id}")
    if m.tournament_id != tournament_id:
        raise HTTPException(status_code=400, detail="match_id does not belong to this tournament")


@router.get("/tournaments/{tournament_id}/comments")
def list_comments(tournament_id: int, s: Session = Depends(get_session)) -> dict:
    _tournament_or_404(s, tournament_id)

    pin = s.get(TournamentPinnedComment, tournament_id)
    pinned_comment_id = pin.comment_id if pin and pin.comment_id else None

    if pinned_comment_id is not None:
        exists = s.get(Comment, pinned_comment_id)
        if not exists:
            # Keep response consistent even if storage is stale.
            try:
                s.delete(pin)
                s.commit()
            except Exception:
                s.rollback()
            pinned_comment_id = None

    comments = s.exec(
        select(Comment)
        .where(Comment.tournament_id == tournament_id)
        .order_by(Comment.created_at, Comment.id)
    ).all()
    image_meta = _comment_image_meta_map(s, tournament_id)

    return {
        "pinned_comment_id": pinned_comment_id,
        "comments": [_comment_dict(c, image_meta.get(int(c.id))) for c in comments],
    }


@router.get("/comments/tournaments-summary")
def comments_summary(s: Session = Depends(get_session)) -> list[dict]:
    return tournament_comments_summary(s)


@router.get("/tournaments/{tournament_id}/comments/read")
def list_tournament_comment_reads(
    tournament_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    _tournament_or_404(s, tournament_id)
    player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(CommentRead.comment_id)
        .join(Comment, Comment.id == CommentRead.comment_id)
        .where(CommentRead.player_id == player_id, Comment.tournament_id == tournament_id)
        .order_by(CommentRead.comment_id)
    ).all()
    return {"comment_ids": [int(cid) for cid in rows]}


@router.get("/comments/read-map")
def list_comment_read_map(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> list[dict]:
    player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(Comment.tournament_id, CommentRead.comment_id)
        .join(Comment, Comment.id == CommentRead.comment_id)
        .where(CommentRead.player_id == player_id)
        .order_by(Comment.tournament_id, CommentRead.comment_id)
    ).all()
    out: dict[int, list[int]] = {}
    for tid, cid in rows:
        tid_i = int(tid)
        out.setdefault(tid_i, []).append(int(cid))
    return [{"tournament_id": tid, "comment_ids": ids} for tid, ids in out.items()]


@router.put("/comments/{comment_id}/read")
def mark_comment_read(
    comment_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    _comment_or_404(s, comment_id)
    player_id = int(claims.get("player_id"))
    now = datetime.utcnow()
    row = s.get(CommentRead, (player_id, comment_id))
    if row is None:
        row = CommentRead(player_id=player_id, comment_id=comment_id, read_at=now)
    else:
        row.read_at = now
    s.add(row)
    s.commit()
    return {"ok": True}


@router.put("/tournaments/{tournament_id}/comments/read-all")
def mark_tournament_comments_read_all(
    tournament_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    _tournament_or_404(s, tournament_id)
    player_id = int(claims.get("player_id"))

    comment_ids = [int(cid) for cid in s.exec(select(Comment.id).where(Comment.tournament_id == tournament_id)).all()]
    if not comment_ids:
        return {"ok": True, "marked": 0}

    existing = {
        int(cid)
        for cid in s.exec(
            select(CommentRead.comment_id).where(
                CommentRead.player_id == player_id,
                CommentRead.comment_id.in_(comment_ids),
            )
        ).all()
    }

    now = datetime.utcnow()
    marked = 0
    for cid in comment_ids:
        if cid in existing:
            continue
        s.add(CommentRead(player_id=player_id, comment_id=cid, read_at=now))
        marked += 1
    if marked:
        s.commit()
    return {"ok": True, "marked": marked}


@router.post("/tournaments/{tournament_id}/comments")
async def create_comment(
    tournament_id: int,
    body: CommentCreateBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    _tournament_or_404(s, tournament_id)

    text = str(body.body or "").strip()
    has_image_hint = bool(body.has_image)
    if not text and not has_image_hint:
        raise HTTPException(status_code=400, detail="body is required (or attach an image)")

    match_id = None if body.match_id in (None, "") else int(body.match_id)
    author_player_id = None if body.author_player_id in (None, "") else int(body.author_player_id)

    if author_player_id is not None and author_player_id != int(claims.get("player_id")):
        raise HTTPException(status_code=403, detail="You can only post comments as yourself or General")

    _validate_match_ref(s, tournament_id, match_id)
    _validate_author(s, tournament_id, author_player_id)

    now = datetime.utcnow()
    c = Comment(
        tournament_id=tournament_id,
        match_id=match_id,
        author_player_id=author_player_id,
        body=text,
        created_at=now,
        updated_at=now,
    )
    s.add(c)
    s.commit()
    s.refresh(c)

    if c.author_player_id is not None:
        pid = int(c.author_player_id)
        row = s.get(CommentRead, (pid, int(c.id)))
        if row is None:
            s.add(CommentRead(player_id=pid, comment_id=int(c.id), read_at=now))
            s.commit()

    await ws_manager.broadcast(
        tournament_id,
        "comments_updated",
        {"tournament_id": tournament_id, "comment_id": c.id, "action": "created"},
    )

    return _comment_dict(c, None)


@router.patch("/comments/{comment_id}")
async def patch_comment(
    comment_id: int,
    body: CommentPatchBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    c = _comment_or_404(s, comment_id)
    image_updated_at = _comment_image_updated_at(s, comment_id)
    fields = body.model_fields_set

    if "body" in fields:
        text = str(body.body or "").strip()
        if not text and image_updated_at is None:
            raise HTTPException(status_code=400, detail="body cannot be empty")
        c.body = text

    if "author_player_id" in fields:
        author_player_id = None if body.author_player_id in (None, "") else int(body.author_player_id)
        if author_player_id is not None and author_player_id != int(claims.get("player_id")):
            raise HTTPException(status_code=403, detail="You can only post comments as yourself or General")
        _validate_author(s, c.tournament_id, author_player_id)
        c.author_player_id = author_player_id

    c.updated_at = datetime.utcnow()
    s.add(c)
    s.commit()
    s.refresh(c)

    await ws_manager.broadcast(
        c.tournament_id,
        "comments_updated",
        {"tournament_id": c.tournament_id, "comment_id": c.id, "action": "updated"},
    )

    return _comment_dict(c, image_updated_at)


@router.delete("/comments/{comment_id}", dependencies=[Depends(require_admin)])
async def delete_comment(
    comment_id: int,
    s: Session = Depends(get_session),
) -> dict:
    c = _comment_or_404(s, comment_id)

    pin = s.get(TournamentPinnedComment, c.tournament_id)
    if pin and pin.comment_id == c.id:
        s.delete(pin)

    image_row_fs = s.get(CommentImageFile, comment_id)
    if image_row_fs:
        delete_media(image_row_fs.file_path)
        s.delete(image_row_fs)

    read_rows = s.exec(select(CommentRead).where(CommentRead.comment_id == int(comment_id))).all()
    for rr in read_rows:
        s.delete(rr)

    s.delete(c)
    s.commit()

    await ws_manager.broadcast(
        c.tournament_id,
        "comments_updated",
        {"tournament_id": c.tournament_id, "comment_id": c.id, "action": "deleted"},
    )

    return {"ok": True}


@router.get("/comments/{comment_id}/image")
def get_comment_image(comment_id: int, s: Session = Depends(get_session)):
    c = _comment_or_404(s, comment_id)
    img_file = s.get(CommentImageFile, comment_id)
    if not img_file:
        raise HTTPException(status_code=404, detail="Comment image not found")
    data = read_media(img_file.file_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Comment image file missing")

    headers = {"Cache-Control": "public, max-age=604800"}
    return Response(content=data, media_type=img_file.content_type, headers=headers)


@router.put("/comments/{comment_id}/image", dependencies=[Depends(require_editor)])
async def put_comment_image(
    comment_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
) -> dict:
    c = _comment_or_404(s, comment_id)
    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_COMMENT_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Comment image too large (max {MAX_COMMENT_IMAGE_BYTES} bytes)",
        )

    now = datetime.utcnow()
    img_file = _upsert_comment_image_file(
        s,
        comment_id=comment_id,
        content_type=ct,
        data=data,
        updated_at=now,
    )

    c.updated_at = now
    s.add(c)
    s.commit()
    s.refresh(c)
    s.refresh(img_file)

    await ws_manager.broadcast(
        c.tournament_id,
        "comments_updated",
        {"tournament_id": c.tournament_id, "comment_id": c.id, "action": "image_updated"},
    )
    return _comment_dict(c, img_file.updated_at)


@router.delete("/comments/{comment_id}/image", dependencies=[Depends(require_editor)])
async def delete_comment_image(comment_id: int, s: Session = Depends(get_session)) -> dict:
    c = _comment_or_404(s, comment_id)
    img_file = s.get(CommentImageFile, comment_id)
    if img_file is None:
        return {"ok": True}

    delete_media(img_file.file_path)
    s.delete(img_file)
    c.updated_at = datetime.utcnow()
    s.add(c)
    s.commit()

    await ws_manager.broadcast(
        c.tournament_id,
        "comments_updated",
        {"tournament_id": c.tournament_id, "comment_id": c.id, "action": "image_deleted"},
    )
    return {"ok": True}


@router.put("/tournaments/{tournament_id}/comments/pin", dependencies=[Depends(require_editor)])
async def set_pinned_comment(
    tournament_id: int,
    body: CommentsPinBody,
    s: Session = Depends(get_session),
) -> dict:
    _tournament_or_404(s, tournament_id)

    comment_id_raw = body.comment_id
    comment_id = None if comment_id_raw in (None, "") else int(comment_id_raw)

    if comment_id is None:
        pin = s.get(TournamentPinnedComment, tournament_id)
        if pin:
            s.delete(pin)
            s.commit()
        await ws_manager.broadcast(
            tournament_id,
            "comments_updated",
            {"tournament_id": tournament_id, "comment_id": None, "action": "unpinned"},
        )
        return {"pinned_comment_id": None}

    c = _comment_or_404(s, comment_id)
    if c.tournament_id != tournament_id:
        raise HTTPException(status_code=400, detail="comment does not belong to this tournament")
    if c.match_id is not None:
        raise HTTPException(status_code=400, detail="Only tournament comments can be pinned")

    pin = s.get(TournamentPinnedComment, tournament_id)
    if not pin:
        pin = TournamentPinnedComment(tournament_id=tournament_id, comment_id=comment_id, updated_at=datetime.utcnow())
    else:
        pin.comment_id = comment_id
        pin.updated_at = datetime.utcnow()
    s.add(pin)
    s.commit()

    await ws_manager.broadcast(
        tournament_id,
        "comments_updated",
        {"tournament_id": tournament_id, "comment_id": comment_id, "action": "pinned"},
    )

    return {"pinned_comment_id": comment_id}
