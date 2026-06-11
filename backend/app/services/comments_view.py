from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from ..models import (
    Comment,
    CommentAuthorLink,
    CommentImageFile,
    CommentThreadLink,
    CommentVote,
    TournamentPinnedComment,
)
from .file_storage import media_exists

COMMENT_EDIT_WINDOW = timedelta(hours=1)


def real_author_map(s: Session, comment_ids: list[int]) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = s.exec(
        select(CommentAuthorLink.comment_id, CommentAuthorLink.real_author_player_id).where(
            CommentAuthorLink.comment_id.in_(comment_ids)
        )
    ).all()
    return {int(cid): int(pid) for cid, pid in rows}


def parent_comment_map(s: Session, comment_ids: list[int]) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = s.exec(
        select(CommentThreadLink.comment_id, CommentThreadLink.parent_comment_id).where(
            CommentThreadLink.comment_id.in_(comment_ids)
        )
    ).all()
    return {int(cid): int(pid) for cid, pid in rows}


def comment_can_edit(
    c: Comment,
    *,
    viewer_id: int | None,
    is_admin: bool,
    real_author_id: int | None,
    now: datetime | None = None,
) -> bool:
    """Admins always; otherwise the real author only within COMMENT_EDIT_WINDOW of posting."""
    if is_admin:
        return True
    if viewer_id is None:
        return False
    author = real_author_id if real_author_id is not None else c.author_player_id
    if author is None or int(author) != int(viewer_id):
        return False
    return (now or datetime.utcnow()) - c.created_at <= COMMENT_EDIT_WINDOW


def comment_image_meta_map(s: Session, tournament_id: int) -> dict[int, datetime]:
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


def comment_dict(
    c: Comment,
    image_updated_at: datetime | None = None,
    *,
    upvotes: int = 0,
    downvotes: int = 0,
    my_vote: int | None = None,
    parent_comment_id: int | None = None,
    can_edit: bool = False,
) -> dict:
    return {
        "id": c.id,
        "tournament_id": c.tournament_id,
        "match_id": c.match_id,
        "parent_comment_id": parent_comment_id,
        "author_player_id": c.author_player_id,
        "body": c.body,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "has_image": image_updated_at is not None,
        "image_updated_at": image_updated_at,
        "upvotes": int(upvotes),
        "downvotes": int(downvotes),
        "my_vote": int(my_vote) if my_vote in (-1, 1) else 0,
        "can_edit": bool(can_edit),
    }


def list_comments_for_tournament(s: Session, tournament_id: int, claims: dict | None) -> dict:
    pin = s.get(TournamentPinnedComment, tournament_id)
    pinned_comment_id = pin.comment_id if pin and pin.comment_id else None

    if pinned_comment_id is not None:
        exists = s.get(Comment, pinned_comment_id)
        if not exists:
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
    image_meta = comment_image_meta_map(s, tournament_id)
    comment_ids = [int(c.id) for c in comments]

    votes_by_comment_id: dict[int, dict[str, int]] = {}
    my_vote_by_comment_id: dict[int, int] = {}
    if comment_ids:
        vote_rows = s.exec(
            select(CommentVote.comment_id, CommentVote.value).where(CommentVote.comment_id.in_(comment_ids))
        ).all()
        for cid, value in vote_rows:
            cid_i = int(cid)
            slot = votes_by_comment_id.setdefault(cid_i, {"up": 0, "down": 0})
            if int(value) > 0:
                slot["up"] += 1
            elif int(value) < 0:
                slot["down"] += 1

        if claims and claims.get("player_id") is not None:
            viewer_player_id = int(claims.get("player_id"))
            my_rows = s.exec(
                select(CommentVote.comment_id, CommentVote.value).where(
                    CommentVote.player_id == viewer_player_id,
                    CommentVote.comment_id.in_(comment_ids),
                )
            ).all()
            my_vote_by_comment_id = {int(cid): int(value) for cid, value in my_rows}

    p_map = parent_comment_map(s, comment_ids)
    ra_map = real_author_map(s, comment_ids)
    viewer_id = int(claims["player_id"]) if claims and claims.get("player_id") is not None else None
    is_admin = bool(claims and str(claims.get("role") or "") == "admin")
    now = datetime.utcnow()

    return {
        "pinned_comment_id": pinned_comment_id,
        "comments": [
            comment_dict(
                c,
                image_meta.get(int(c.id)),
                upvotes=votes_by_comment_id.get(int(c.id), {}).get("up", 0),
                downvotes=votes_by_comment_id.get(int(c.id), {}).get("down", 0),
                my_vote=my_vote_by_comment_id.get(int(c.id), 0),
                parent_comment_id=p_map.get(int(c.id)),
                can_edit=comment_can_edit(
                    c,
                    viewer_id=viewer_id,
                    is_admin=is_admin,
                    real_author_id=ra_map.get(int(c.id)),
                    now=now,
                ),
            )
            for c in comments
        ],
    }
