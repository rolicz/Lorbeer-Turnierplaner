from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..api_utils import get_or_404
from ..auth import decode_token, require_admin, require_auth_claims, require_editor, require_editor_claims
from ..db import get_engine, get_session
from ..models import (
    Comment,
    CommentAuthorLink,
    CommentImageFile,
    CommentRead,
    CommentThreadLink,
    CommentVote,
    Match,
    MatchSide,
    Player,
    Tournament,
    TournamentPinnedComment,
    TournamentPlayer,
)
from ..schemas import CommentCreateBody, CommentPatchBody, CommentsPinBody, CommentVoteBody
from ..schemas.responses import (
    CommentIdsOut,
    CommentListOut,
    CommentOut,
    CommentReadMapOut,
    CommentSummaryOut,
    MarkedResponse,
    OkResponse,
    PinnedCommentOut,
    VoteResultOut,
    VotersOut,
)
from ..services.comments_summary import tournament_comments_summary
from ..services.events import (
    broadcast_tournament,
    push_comment_deleted,
    push_comment_meta,
    push_comment_upsert,
)
from ..services.file_storage import (
    delete_media,
    media_exists,
    media_path_for_comment,
    read_media,
    write_media,
)
from ..services.notifications import enqueue_global_push, localized_push_message

log = logging.getLogger(__name__)
router = APIRouter(tags=["comments"])
MAX_COMMENT_IMAGE_BYTES = 8_000_000  # enough for cropped 1920x1440 webp/png
# A comment may be edited by its real author only within this window after posting.
COMMENT_EDIT_WINDOW = timedelta(hours=1)


def _real_author_map(s: Session, comment_ids: list[int]) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = s.exec(
        select(CommentAuthorLink.comment_id, CommentAuthorLink.real_author_player_id).where(
            CommentAuthorLink.comment_id.in_(comment_ids)
        )
    ).all()
    return {int(cid): int(pid) for cid, pid in rows}


def _parent_comment_map(s: Session, comment_ids: list[int]) -> dict[int, int]:
    if not comment_ids:
        return {}
    rows = s.exec(
        select(CommentThreadLink.comment_id, CommentThreadLink.parent_comment_id).where(
            CommentThreadLink.comment_id.in_(comment_ids)
        )
    ).all()
    return {int(cid): int(pid) for cid, pid in rows}


def _comment_can_edit(
    c: Comment,
    *,
    viewer_id: int | None,
    is_admin: bool,
    real_author_id: int | None,
    now: datetime | None = None,
) -> bool:
    """Admins always; otherwise the real author (recorded, or the legacy named author)
    only within COMMENT_EDIT_WINDOW of posting. Legacy "General" comments without a
    recorded author are admin-only."""
    if is_admin:
        return True
    if viewer_id is None:
        return False
    author = real_author_id if real_author_id is not None else c.author_player_id
    if author is None or int(author) != int(viewer_id):
        return False
    return (now or datetime.utcnow()) - c.created_at <= COMMENT_EDIT_WINDOW
_GOAL_SCORELINE_RE = re.compile(r"^\s*\d{1,3}'\s+(?P<a>\d{1,3})-(?P<b>\d{1,3})\s+.+$")
_PLAIN_SCORELINE_RE = re.compile(r"^\s*(?P<a>\d{1,3})[:\-](?P<b>\d{1,3})\s*$")


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


def _comment_dict(
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


def _to_goal_minute(value: int | str | None) -> int:
    if value in (None, ""):
        raise HTTPException(status_code=400, detail="goal_minute is required for goal events")
    try:
        minute = int(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="goal_minute must be an integer") from exc
    if minute <= 0 or minute > 999:
        raise HTTPException(status_code=400, detail="goal_minute must be between 1 and 999")
    return minute


def _to_score_value(value: int | str | None, *, field: str) -> int:
    if value in (None, ""):
        raise HTTPException(status_code=400, detail=f"{field} is required")
    try:
        score = int(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{field} must be an integer") from exc
    if score < 0 or score > 999:
        raise HTTPException(status_code=400, detail=f"{field} must be between 0 and 999")
    return score


def _goal_scorer_name_for_match(
    s: Session,
    match_id: int,
    goal_player_id: int | str | None,
    goal_player_name: str | None,
) -> str:
    custom_name = str(goal_player_name or "").strip()
    if custom_name:
        return custom_name
    if goal_player_id in (None, ""):
        raise HTTPException(status_code=400, detail="goal_player_name or goal_player_id is required for goal events")
    try:
        scorer_id = int(goal_player_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="goal_player_id must be an integer") from exc
    match = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.id == match_id)
    ).first()
    if match is None:
        raise HTTPException(status_code=400, detail=f"Unknown match_id {match_id}")
    for side in match.sides:
        for player in side.players:
            if int(player.id or 0) == scorer_id:
                return player.display_name
    raise HTTPException(status_code=400, detail="goal_player_id must belong to the selected match")


def _format_scoreline(score_a: int, score_b: int) -> str:
    return f"{score_a}-{score_b}"


def _recorded_scoreline_from_comment_body(body: str | None) -> tuple[int, int] | None:
    text = str(body or "").strip()
    if not text:
        return None
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return None
    first_line = lines[0]
    for pattern in (_GOAL_SCORELINE_RE, _PLAIN_SCORELINE_RE):
        match = pattern.match(first_line)
        if match:
            return int(match.group("a")), int(match.group("b"))
    if len(lines) >= 2 and lines[0].upper() == "RESULT":
        match = _PLAIN_SCORELINE_RE.match(lines[1])
        if match:
            return int(match.group("a")), int(match.group("b"))
    return None


def _ensure_match_scoreline_is_new(s: Session, match_id: int, score_a: int, score_b: int) -> None:
    existing_bodies = s.exec(select(Comment.body).where(Comment.match_id == match_id)).all()
    target = (score_a, score_b)
    for existing_body in existing_bodies:
        if _recorded_scoreline_from_comment_body(existing_body) == target:
            raise HTTPException(status_code=409, detail="This score is already recorded for this match")


def _match_score(match: Match) -> tuple[int, int]:
    sides = {side.side: side for side in match.sides}
    return int(sides.get("A").goals if sides.get("A") is not None else 0), int(
        sides.get("B").goals if sides.get("B") is not None else 0
    )


def _set_match_score(match: Match, score_a: int, score_b: int) -> bool:
    sides = {side.side: side for side in match.sides}
    side_a = sides.get("A")
    side_b = sides.get("B")
    if side_a is None or side_b is None:
        raise HTTPException(status_code=409, detail="Match must have sides A and B")
    old_score = _match_score(match)
    side_a.goals = score_a
    side_b.goals = score_b
    return old_score != (score_a, score_b)


def _validate_goal_score_progression(match: Match, score_a: int, score_b: int) -> None:
    current_a, current_b = _match_score(match)
    if (current_a, current_b) == (score_a, score_b):
        raise HTTPException(status_code=409, detail="This score is already recorded for this match")
    delta_a = score_a - current_a
    delta_b = score_b - current_b
    if (delta_a, delta_b) not in ((1, 0), (0, 1)):
        raise HTTPException(status_code=409, detail="Goal events must increase exactly one side by 1")


def _format_goal_comment_body(goal_minute: int, score_a: int, score_b: int, scorer_name: str, note: str = "") -> str:
    goal_line = f"{goal_minute}' {_format_scoreline(score_a, score_b)} {scorer_name}"
    note_text = str(note or "").strip()
    return f"{goal_line}\n{note_text}" if note_text else goal_line


def _format_score_comment_body(score_a: int, score_b: int) -> str:
    return _format_scoreline(score_a, score_b)


def _format_shots_comment_body(shots_a: int, shots_b: int) -> str:
    # Shots are an informational stat, not the match score, so they render as
    # plain comment text ("Shots: 1-3") and never touch the scoreline.
    return f"Shots: {_format_scoreline(shots_a, shots_b)}"


@router.get("/tournaments/{tournament_id}/comments", response_model=CommentListOut)
def list_comments(
    tournament_id: int,
    s: Session = Depends(get_session),
    claims: dict | None = Depends(decode_token),
) -> dict:
    get_or_404(s, Tournament, tournament_id, name="Tournament")

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

    parent_map = _parent_comment_map(s, comment_ids)
    real_author_map = _real_author_map(s, comment_ids)
    viewer_id = int(claims["player_id"]) if claims and claims.get("player_id") is not None else None
    is_admin = bool(claims and str(claims.get("role") or "") == "admin")
    now = datetime.utcnow()

    return {
        "pinned_comment_id": pinned_comment_id,
        "comments": [
            _comment_dict(
                c,
                image_meta.get(int(c.id)),
                upvotes=votes_by_comment_id.get(int(c.id), {}).get("up", 0),
                downvotes=votes_by_comment_id.get(int(c.id), {}).get("down", 0),
                my_vote=my_vote_by_comment_id.get(int(c.id), 0),
                parent_comment_id=parent_map.get(int(c.id)),
                can_edit=_comment_can_edit(
                    c,
                    viewer_id=viewer_id,
                    is_admin=is_admin,
                    real_author_id=real_author_map.get(int(c.id)),
                    now=now,
                ),
            )
            for c in comments
        ],
    }


@router.get("/comments/tournaments-summary", response_model=list[CommentSummaryOut])
def comments_summary(s: Session = Depends(get_session)) -> list[dict]:
    return tournament_comments_summary(s)


@router.get("/tournaments/{tournament_id}/comments/read", response_model=CommentIdsOut)
def list_tournament_comment_reads(
    tournament_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    get_or_404(s, Tournament, tournament_id, name="Tournament")
    player_id = int(claims.get("player_id"))
    rows = s.exec(
        select(CommentRead.comment_id)
        .join(Comment, Comment.id == CommentRead.comment_id)
        .where(CommentRead.player_id == player_id, Comment.tournament_id == tournament_id)
        .order_by(CommentRead.comment_id)
    ).all()
    return {"comment_ids": [int(cid) for cid in rows]}


@router.get("/comments/read-map", response_model=list[CommentReadMapOut])
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


@router.put("/comments/{comment_id}/read", response_model=OkResponse)
def mark_comment_read(
    comment_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    get_or_404(s, Comment, comment_id, name="Comment")
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


@router.put("/comments/{comment_id}/vote", response_model=VoteResultOut)
async def vote_comment(
    comment_id: int,
    body: CommentVoteBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    c = get_or_404(s, Comment, comment_id, name="Comment")
    player_id = int(claims.get("player_id"))
    raw = body.value
    try:
        value = int(0 if raw in (None, "") else raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid vote value")
    if value not in (-1, 0, 1):
        raise HTTPException(status_code=400, detail="vote value must be one of -1, 0, 1")

    now = datetime.utcnow()
    row = s.get(CommentVote, (player_id, comment_id))
    if value == 0:
        if row is not None:
            s.delete(row)
            s.commit()
    else:
        if row is None:
            row = CommentVote(
                player_id=player_id,
                comment_id=comment_id,
                value=value,
                updated_at=now,
            )
        else:
            row.value = value
            row.updated_at = now
        s.add(row)
        s.commit()

    await push_comment_meta(c.tournament_id, action="voted", comment_id=c.id)
    return {"ok": True, "value": value}


@router.get("/comments/{comment_id}/voters", response_model=VotersOut)
def list_comment_voters(comment_id: int, s: Session = Depends(get_session)) -> dict:
    get_or_404(s, Comment, comment_id, name="Comment")
    rows = s.exec(
        select(CommentVote.value, Player.id, Player.display_name)
        .join(Player, Player.id == CommentVote.player_id)
        .where(CommentVote.comment_id == comment_id)
        .order_by(Player.display_name.asc(), Player.id.asc())
    ).all()
    upvoters: list[dict] = []
    downvoters: list[dict] = []
    for value, player_id, display_name in rows:
        payload = {"id": int(player_id), "display_name": display_name}
        if int(value) > 0:
            upvoters.append(payload)
        elif int(value) < 0:
            downvoters.append(payload)
    return {"upvoters": upvoters, "downvoters": downvoters}


@router.put("/tournaments/{tournament_id}/comments/read-all", response_model=MarkedResponse)
def mark_tournament_comments_read_all(
    tournament_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    get_or_404(s, Tournament, tournament_id, name="Tournament")
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


@router.post("/tournaments/{tournament_id}/comments", response_model=CommentOut)
async def create_comment(
    tournament_id: int,
    body: CommentCreateBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    tournament = get_or_404(s, Tournament, tournament_id, name="Tournament")

    event_type = str(body.event_type or "").strip().lower()
    text = str(body.body or "").strip()
    has_image_hint = bool(body.has_image)

    match_id = None if body.match_id in (None, "") else int(body.match_id)
    author_player_id = None if body.author_player_id in (None, "") else int(body.author_player_id)
    parent_comment_id = None if body.parent_comment_id in (None, "") else int(body.parent_comment_id)

    is_admin = str(claims.get("role") or "") == "admin"
    if author_player_id is not None and author_player_id != int(claims.get("player_id")) and not is_admin:
        raise HTTPException(status_code=403, detail="You can only post comments as yourself or General")

    _validate_match_ref(s, tournament_id, match_id)
    _validate_author(s, tournament_id, author_player_id)

    if parent_comment_id is not None:
        if event_type in ("goal", "score_update", "shots"):
            raise HTTPException(status_code=400, detail="Replies cannot be goal, score or shots events")
        parent = s.get(Comment, parent_comment_id)
        if parent is None:
            raise HTTPException(status_code=400, detail=f"Unknown parent_comment_id {parent_comment_id}")
        if parent.tournament_id != tournament_id:
            raise HTTPException(status_code=400, detail="parent_comment_id does not belong to this tournament")

    goal_minute: int | None = None
    goal_scorer_name: str | None = None
    goal_line: str | None = None
    goal_note: str = ""
    scoreline: str | None = None
    match_for_event: Match | None = (
        s.exec(
            select(Match)
            .options(selectinload(Match.sides))
            .where(Match.id == match_id)
        ).first()
        if match_id is not None
        else None
    )
    match_score_changed = False
    if event_type == "goal":
        if match_id is None:
            raise HTTPException(status_code=400, detail="Goal events require a match_id")
        if match_for_event is None:
            raise HTTPException(status_code=400, detail=f"Unknown match_id {match_id}")
        goal_note = text
        goal_minute = _to_goal_minute(body.goal_minute)
        goal_scorer_name = _goal_scorer_name_for_match(s, match_id, body.goal_player_id, body.goal_player_name)
        score_a = _to_score_value(body.result_score_a, field="result_score_a")
        score_b = _to_score_value(body.result_score_b, field="result_score_b")
        _validate_goal_score_progression(match_for_event, score_a, score_b)
        _ensure_match_scoreline_is_new(s, match_id, score_a, score_b)
        match_score_changed = _set_match_score(match_for_event, score_a, score_b)
        scoreline = _format_scoreline(score_a, score_b)
        goal_line = f"{goal_minute}' {scoreline} {goal_scorer_name}"
        text = _format_goal_comment_body(goal_minute, score_a, score_b, goal_scorer_name, goal_note)
        has_image_hint = False
    elif event_type == "score_update":
        if match_id is None:
            raise HTTPException(status_code=400, detail="Score update events require a match_id")
        if match_for_event is None:
            raise HTTPException(status_code=400, detail=f"Unknown match_id {match_id}")
        score_a = _to_score_value(body.result_score_a, field="result_score_a")
        score_b = _to_score_value(body.result_score_b, field="result_score_b")
        _ensure_match_scoreline_is_new(s, match_id, score_a, score_b)
        match_score_changed = _set_match_score(match_for_event, score_a, score_b)
        scoreline = _format_scoreline(score_a, score_b)
        text = _format_score_comment_body(score_a, score_b)
        has_image_hint = False
    elif event_type == "shots":
        if match_id is None:
            raise HTTPException(status_code=400, detail="Shots events require a match_id")
        if match_for_event is None:
            raise HTTPException(status_code=400, detail=f"Unknown match_id {match_id}")
        # Shots don't change the match score — just record an informational comment.
        shots_a = _to_score_value(body.result_score_a, field="result_score_a")
        shots_b = _to_score_value(body.result_score_b, field="result_score_b")
        text = _format_shots_comment_body(shots_a, shots_b)
        has_image_hint = False

    if not text and not has_image_hint:
        raise HTTPException(status_code=400, detail="body is required (or attach an image)")

    now = datetime.utcnow()
    c = Comment(
        tournament_id=tournament_id,
        match_id=match_id,
        author_player_id=author_player_id,
        body=text,
        created_at=now,
        updated_at=now,
    )
    if match_for_event is not None and match_score_changed:
        s.add(match_for_event)
        for side in match_for_event.sides:
            s.add(side)
    s.add(c)
    s.commit()
    s.refresh(c)

    # Record the real author (even when displayed as General) so author-only editing
    # can be enforced, and link the thread parent for replies. Both additive tables.
    creator_player_id = int(claims.get("player_id"))
    s.add(CommentAuthorLink(comment_id=int(c.id), real_author_player_id=creator_player_id))
    if parent_comment_id is not None:
        s.add(CommentThreadLink(comment_id=int(c.id), parent_comment_id=parent_comment_id))
    s.commit()

    if c.author_player_id is not None:
        pid = int(c.author_player_id)
        row = s.get(CommentRead, (pid, int(c.id)))
        if row is None:
            s.add(CommentRead(player_id=pid, comment_id=int(c.id), read_at=now))
            s.commit()

    await push_comment_upsert(tournament_id, _comment_dict(c, None, parent_comment_id=parent_comment_id))
    if match_for_event is not None and match_score_changed:
        await broadcast_tournament(s, tournament_id, reason="comment-score")

    author_name = "General"
    if c.author_player_id is not None:
        author = s.get(Player, int(c.author_player_id))
        if author is not None:
            author_name = author.display_name
    preview = text if text else "Image comment"
    if len(preview) > 120:
        preview = preview[:117].rstrip() + "..."
    push_key = "comment_created"
    push_event_type = "comment_created"
    push_context: dict[str, object] = {
        "tournament_name": tournament.name,
        "author_name": author_name,
        "preview": preview if text else "",
        "preview_is_image_only": not bool(text),
    }
    if event_type == "goal" and goal_minute is not None and goal_scorer_name:
        match = s.get(Match, match_id) if match_id is not None else None
        match_label = f"Match {int(match.order_index) + 1}" if match is not None else f"Match {int(match_id or 0)}"
        push_key = "goal_comment_created"
        push_event_type = "goal_comment_created"
        push_context = {
            "tournament_name": tournament.name,
            "match_label": match_label,
            "scorer_name": goal_scorer_name,
            "goal_minute": goal_minute,
            "scoreline": scoreline or "",
            "goal_line": goal_line or "",
            "goal_note_line": f"\n{goal_note}" if goal_note else "",
        }
    elif event_type == "score_update" and scoreline:
        match = s.get(Match, match_id) if match_id is not None else None
        match_label = f"Match {int(match.order_index) + 1}" if match is not None else f"Match {int(match_id or 0)}"
        push_key = "score_comment_created"
        push_event_type = "score_comment_created"
        push_context = {
            "tournament_name": tournament.name,
            "match_label": match_label,
            "scoreline": scoreline,
        }
    enqueue_global_push(
        request,
        localized_push_message(
            push_key,
            path=f"/live/{tournament_id}?comment={int(c.id)}",
            tag=f"comment-{tournament_id}",
            event_type=push_event_type,
            data={"tournament_id": tournament_id, "comment_id": int(c.id), "match_id": match_id},
            **push_context,
        ),
    )

    # The creator can edit their fresh comment (real author, within the window).
    return _comment_dict(c, None, parent_comment_id=parent_comment_id, can_edit=True)


@router.patch("/comments/{comment_id}", response_model=CommentOut)
async def patch_comment(
    comment_id: int,
    body: CommentPatchBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    c = get_or_404(s, Comment, comment_id, name="Comment")
    image_updated_at = _comment_image_updated_at(s, comment_id)
    fields = body.model_fields_set

    viewer_id = int(claims.get("player_id"))
    is_admin = str(claims.get("role") or "") == "admin"
    real_author_link = s.get(CommentAuthorLink, comment_id)
    real_author_id = int(real_author_link.real_author_player_id) if real_author_link else None
    if not _comment_can_edit(c, viewer_id=viewer_id, is_admin=is_admin, real_author_id=real_author_id):
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own comment within an hour of posting",
        )

    if "body" in fields:
        text = str(body.body or "").strip()
        if not text and image_updated_at is None:
            raise HTTPException(status_code=400, detail="body cannot be empty")
        c.body = text

    if "author_player_id" in fields:
        author_player_id = None if body.author_player_id in (None, "") else int(body.author_player_id)
        if author_player_id is not None and author_player_id != viewer_id and not is_admin:
            raise HTTPException(status_code=403, detail="You can only post comments as yourself or General")
        _validate_author(s, c.tournament_id, author_player_id)
        c.author_player_id = author_player_id

    c.updated_at = datetime.utcnow()
    s.add(c)
    s.commit()
    s.refresh(c)

    parent_comment_id = _parent_comment_map(s, [int(c.id)]).get(int(c.id))
    await push_comment_upsert(
        c.tournament_id, _comment_dict(c, image_updated_at, parent_comment_id=parent_comment_id)
    )

    can_edit = _comment_can_edit(c, viewer_id=viewer_id, is_admin=is_admin, real_author_id=real_author_id)
    return _comment_dict(c, image_updated_at, parent_comment_id=parent_comment_id, can_edit=can_edit)


@router.delete("/comments/{comment_id}", response_model=OkResponse, dependencies=[Depends(require_admin)])
async def delete_comment(
    comment_id: int,
    s: Session = Depends(get_session),
) -> dict:
    c = get_or_404(s, Comment, comment_id, name="Comment")
    tournament_id = int(c.tournament_id)

    # Cascade: delete this comment and the whole reply subtree beneath it.
    links = s.exec(
        select(CommentThreadLink.comment_id, CommentThreadLink.parent_comment_id)
        .join(Comment, Comment.id == CommentThreadLink.comment_id)
        .where(Comment.tournament_id == tournament_id)
    ).all()
    children_by_parent: dict[int, list[int]] = {}
    for child_id, parent_id in links:
        children_by_parent.setdefault(int(parent_id), []).append(int(child_id))

    to_delete: set[int] = set()
    stack = [int(comment_id)]
    while stack:
        current = stack.pop()
        if current in to_delete:
            continue
        to_delete.add(current)
        stack.extend(children_by_parent.get(current, []))

    ids = list(to_delete)

    pin = s.get(TournamentPinnedComment, tournament_id)
    if pin and pin.comment_id in to_delete:
        s.delete(pin)

    for img_row in s.exec(select(CommentImageFile).where(CommentImageFile.comment_id.in_(ids))).all():
        delete_media(img_row.file_path)
        s.delete(img_row)
    for rr in s.exec(select(CommentRead).where(CommentRead.comment_id.in_(ids))).all():
        s.delete(rr)
    for vr in s.exec(select(CommentVote).where(CommentVote.comment_id.in_(ids))).all():
        s.delete(vr)
    for lk in s.exec(select(CommentThreadLink).where(CommentThreadLink.comment_id.in_(ids))).all():
        s.delete(lk)
    for al in s.exec(select(CommentAuthorLink).where(CommentAuthorLink.comment_id.in_(ids))).all():
        s.delete(al)
    for cm in s.exec(select(Comment).where(Comment.id.in_(ids))).all():
        s.delete(cm)
    s.commit()

    for cid in ids:
        await push_comment_deleted(tournament_id, cid)

    return {"ok": True}


@router.get("/comments/{comment_id}/image")
def get_comment_image(comment_id: int):
    with Session(get_engine()) as s:
        get_or_404(s, Comment, comment_id, name="Comment")
        img_file = s.get(CommentImageFile, comment_id)
        if not img_file:
            raise HTTPException(status_code=404, detail="Comment image not found")
        content_type = img_file.content_type
        file_path = img_file.file_path

    data = read_media(file_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Comment image file missing")

    headers = {"Cache-Control": "public, max-age=604800"}
    return Response(content=data, media_type=content_type, headers=headers)


@router.put("/comments/{comment_id}/image", response_model=CommentOut, dependencies=[Depends(require_editor)])
async def put_comment_image(
    comment_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
) -> dict:
    c = get_or_404(s, Comment, comment_id, name="Comment")
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

    parent_comment_id = _parent_comment_map(s, [int(c.id)]).get(int(c.id))
    await push_comment_upsert(
        c.tournament_id, _comment_dict(c, img_file.updated_at, parent_comment_id=parent_comment_id)
    )
    return _comment_dict(c, img_file.updated_at, parent_comment_id=parent_comment_id)


@router.delete("/comments/{comment_id}/image", response_model=OkResponse, dependencies=[Depends(require_editor)])
async def delete_comment_image(comment_id: int, s: Session = Depends(get_session)) -> dict:
    c = get_or_404(s, Comment, comment_id, name="Comment")
    img_file = s.get(CommentImageFile, comment_id)
    if img_file is None:
        return {"ok": True}

    delete_media(img_file.file_path)
    s.delete(img_file)
    c.updated_at = datetime.utcnow()
    s.add(c)
    s.commit()

    parent_comment_id = _parent_comment_map(s, [int(c.id)]).get(int(c.id))
    await push_comment_upsert(c.tournament_id, _comment_dict(c, None, parent_comment_id=parent_comment_id))
    return {"ok": True}


@router.put("/tournaments/{tournament_id}/comments/pin", response_model=PinnedCommentOut, dependencies=[Depends(require_editor)])
async def set_pinned_comment(
    tournament_id: int,
    body: CommentsPinBody,
    s: Session = Depends(get_session),
) -> dict:
    get_or_404(s, Tournament, tournament_id, name="Tournament")

    comment_id_raw = body.comment_id
    comment_id = None if comment_id_raw in (None, "") else int(comment_id_raw)

    if comment_id is None:
        pin = s.get(TournamentPinnedComment, tournament_id)
        if pin:
            s.delete(pin)
            s.commit()
        await push_comment_meta(tournament_id, action="unpinned")
        return {"pinned_comment_id": None}

    c = get_or_404(s, Comment, comment_id, name="Comment")
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

    await push_comment_meta(tournament_id, action="pinned", comment_id=comment_id)

    return {"pinned_comment_id": comment_id}
