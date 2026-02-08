from __future__ import annotations

from sqlalchemy import func
from sqlmodel import Session, select

from ..models import Comment


def tournament_comments_summary(s: Session) -> list[dict]:
    """
    Aggregated comment info per tournament (including ids).
    Used for "unseen comments" indicators without fetching every tournament's full comment bodies.
    """
    rows = s.exec(
        select(
            Comment.tournament_id,
            Comment.id,
            func.coalesce(Comment.updated_at, Comment.created_at).label("ts"),
        ).order_by(Comment.tournament_id, Comment.created_at, Comment.id)
    ).all()

    out: dict[int, dict] = {}
    for tid, cid, ts in rows:
        tid_i = int(tid)
        cid_i = int(cid)
        item = out.get(tid_i)
        if not item:
            item = {
                "tournament_id": tid_i,
                "total_comments": 0,
                "latest_comment_id": 0,
                "latest_updated_at": None,
                "comment_ids": [],
            }
            out[tid_i] = item

        item["total_comments"] += 1
        item["latest_comment_id"] = max(int(item["latest_comment_id"]), cid_i)
        item["latest_updated_at"] = ts if item["latest_updated_at"] is None else max(item["latest_updated_at"], ts)
        item["comment_ids"].append(cid_i)

    return list(out.values())

