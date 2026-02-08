from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import require_admin, require_editor
from ..db import get_session
from ..models import (
    Comment,
    Match,
    Player,
    Tournament,
    TournamentPinnedComment,
    TournamentPlayer,
)
from ..services.comments_summary import tournament_comments_summary
from ..ws import ws_manager

log = logging.getLogger(__name__)
router = APIRouter(tags=["comments"])


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


def _comment_dict(c: Comment) -> dict:
    return {
        "id": c.id,
        "tournament_id": c.tournament_id,
        "match_id": c.match_id,
        "author_player_id": c.author_player_id,
        "body": c.body,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
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

    return {"pinned_comment_id": pinned_comment_id, "comments": [_comment_dict(c) for c in comments]}


@router.get("/comments/tournaments-summary")
def comments_summary(s: Session = Depends(get_session)) -> list[dict]:
    return tournament_comments_summary(s)


@router.post("/tournaments/{tournament_id}/comments", dependencies=[Depends(require_editor)])
async def create_comment(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
) -> dict:
    _tournament_or_404(s, tournament_id)

    text = str(body.get("body", "")).strip()
    if not text:
        raise HTTPException(status_code=400, detail="body is required")

    match_id_raw = body.get("match_id", None)
    match_id = None if match_id_raw in (None, "") else int(match_id_raw)

    author_raw = body.get("author_player_id", None)
    author_player_id = None if author_raw in (None, "") else int(author_raw)

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

    await ws_manager.broadcast(
        tournament_id,
        "comments_updated",
        {"tournament_id": tournament_id, "comment_id": c.id, "action": "created"},
    )

    return _comment_dict(c)


@router.patch("/comments/{comment_id}", dependencies=[Depends(require_editor)])
async def patch_comment(
    comment_id: int,
    body: dict,
    s: Session = Depends(get_session),
) -> dict:
    c = _comment_or_404(s, comment_id)

    if "body" in body:
        text = str(body.get("body", "")).strip()
        if not text:
            raise HTTPException(status_code=400, detail="body cannot be empty")
        c.body = text

    if "author_player_id" in body:
        author_raw = body.get("author_player_id", None)
        author_player_id = None if author_raw in (None, "") else int(author_raw)
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

    return _comment_dict(c)


@router.delete("/comments/{comment_id}", dependencies=[Depends(require_admin)])
async def delete_comment(
    comment_id: int,
    s: Session = Depends(get_session),
) -> dict:
    c = _comment_or_404(s, comment_id)

    pin = s.get(TournamentPinnedComment, c.tournament_id)
    if pin and pin.comment_id == c.id:
        s.delete(pin)

    s.delete(c)
    s.commit()

    await ws_manager.broadcast(
        c.tournament_id,
        "comments_updated",
        {"tournament_id": c.tournament_id, "comment_id": c.id, "action": "deleted"},
    )

    return {"ok": True}


@router.put("/tournaments/{tournament_id}/comments/pin", dependencies=[Depends(require_editor)])
async def set_pinned_comment(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
) -> dict:
    _tournament_or_404(s, tournament_id)

    comment_id_raw = body.get("comment_id", None)
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
