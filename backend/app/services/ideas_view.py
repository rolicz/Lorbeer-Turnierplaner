"""Serialization for the Ideas board (R5) — the `comments_view` of feature requests.

The router stays thin: everything that turns rows into a payload (areas, votes, the
attached image, the flat comment list, the per-caller capability flags) lives here,
and the flags come from `services.authorization` so the rule has exactly one home.

Comments ride **inside** the idea (`comments`, oldest first), not behind a second
endpoint: the board is tens of ideas, so one query and one invalidation beat an
expand-fetch per card (P1).
"""
from __future__ import annotations

from datetime import datetime

from sqlmodel import Session, select

from ..feature_areas import sort_areas
from ..models import (
    FeatureRequest,
    FeatureRequestArea,
    FeatureRequestComment,
    FeatureRequestImageFile,
    FeatureRequestVote,
    Player,
)
from .file_storage import media_exists

#: Status values, in the order a request travels through them.
IDEA_STATUSES: tuple[str, ...] = ("new", "planned", "doing", "done", "declined")
#: What kind of change is being asked for.
IDEA_KINDS: tuple[str, ...] = ("feature", "change", "bug")

MAX_IDEA_TITLE_LEN = 120
MAX_IDEA_BODY_LEN = 4000
MAX_IDEA_STATUS_NOTE_LEN = 300
#: The guestbook's ceiling — a comment is a remark, not a second idea.
MAX_IDEA_COMMENT_LEN = 2000


def areas_map(s: Session, request_ids: list[int]) -> dict[int, list[str]]:
    if not request_ids:
        return {}
    rows = s.exec(
        select(FeatureRequestArea.request_id, FeatureRequestArea.area).where(
            FeatureRequestArea.request_id.in_(request_ids)
        )
    ).all()
    out: dict[int, list[str]] = {}
    for rid, area in rows:
        out.setdefault(int(rid), []).append(str(area))
    return {rid: sort_areas(areas) for rid, areas in out.items()}


def areas_for(s: Session, request_id: int) -> list[str]:
    return areas_map(s, [int(request_id)]).get(int(request_id), [])


def vote_maps(
    s: Session, request_ids: list[int], viewer_id: int | None
) -> tuple[dict[int, int], set[int]]:
    """``(votes per request, the requests this viewer has voted for)``."""
    if not request_ids:
        return {}, set()
    counts: dict[int, int] = {}
    mine: set[int] = set()
    rows = s.exec(
        select(FeatureRequestVote.request_id, FeatureRequestVote.player_id).where(
            FeatureRequestVote.request_id.in_(request_ids)
        )
    ).all()
    for rid, pid in rows:
        rid_i = int(rid)
        counts[rid_i] = counts.get(rid_i, 0) + 1
        if viewer_id is not None and int(pid) == int(viewer_id):
            mine.add(rid_i)
    return counts, mine


def image_meta_map(s: Session, request_ids: list[int]) -> dict[int, datetime]:
    if not request_ids:
        return {}
    rows = s.exec(
        select(
            FeatureRequestImageFile.request_id,
            FeatureRequestImageFile.updated_at,
            FeatureRequestImageFile.file_path,
        ).where(FeatureRequestImageFile.request_id.in_(request_ids))
    ).all()
    return {int(rid): updated_at for rid, updated_at, path in rows if media_exists(path)}


def image_updated_at(s: Session, request_id: int) -> datetime | None:
    row = s.get(FeatureRequestImageFile, int(request_id))
    if row and media_exists(row.file_path):
        return row.updated_at
    return None


def author_name_map(s: Session, player_ids: list[int]) -> dict[int, str]:
    if not player_ids:
        return {}
    rows = s.exec(select(Player.id, Player.display_name).where(Player.id.in_(player_ids))).all()
    return {int(pid): str(name) for pid, name in rows}


def comment_dict(
    c: FeatureRequestComment,
    *,
    author_display_name: str,
    capabilities: dict[str, bool] | None = None,
) -> dict:
    """One comment as the payload carries it. `can_delete` is the whole permission
    surface — an idea comment cannot be edited (Roli, 2026-09-19)."""
    caps = capabilities or {}
    return {
        "id": int(c.id),
        "request_id": int(c.request_id),
        "author_player_id": int(c.author_player_id),
        "author_display_name": author_display_name,
        "body": c.body,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "can_delete": bool(caps.get("can_delete")),
    }


def comments_map(s: Session, request_ids: list[int], claims: dict | None) -> dict[int, list[dict]]:
    """``{request_id: [comment, ...]}`` — oldest first, a flat conversation read
    top-down. One query for the rows, one for the names."""
    from .authorization import feature_request_comment_capabilities

    if not request_ids:
        return {}
    rows = s.exec(
        select(FeatureRequestComment)
        .where(FeatureRequestComment.request_id.in_([int(r) for r in request_ids]))
        .order_by(FeatureRequestComment.created_at.asc(), FeatureRequestComment.id.asc())
    ).all()
    if not rows:
        return {}
    names = author_name_map(s, [int(c.author_player_id) for c in rows])
    out: dict[int, list[dict]] = {}
    for c in rows:
        out.setdefault(int(c.request_id), []).append(
            comment_dict(
                c,
                author_display_name=names.get(
                    int(c.author_player_id), f"Player #{int(c.author_player_id)}"
                ),
                capabilities=feature_request_comment_capabilities(c, claims=claims),
            )
        )
    return out


def comments_for(s: Session, request_id: int, claims: dict | None) -> list[dict]:
    return comments_map(s, [int(request_id)], claims).get(int(request_id), [])


def idea_dict(
    fr: FeatureRequest,
    *,
    author_display_name: str,
    areas: list[str],
    votes: int = 0,
    my_vote: int = 0,
    image_updated_at: datetime | None = None,
    capabilities: dict[str, bool] | None = None,
    comments: list[dict] | None = None,
) -> dict:
    caps = capabilities or {}
    return {
        "id": int(fr.id),
        "author_player_id": int(fr.author_player_id),
        "author_display_name": author_display_name,
        "title": fr.title,
        "body": fr.body,
        "kind": fr.kind,
        "status": fr.status,
        "status_note": fr.status_note,
        "areas": list(areas),
        "created_at": fr.created_at,
        "updated_at": fr.updated_at,
        "edited_at": fr.edited_at,
        "has_image": image_updated_at is not None,
        "image_updated_at": image_updated_at,
        "votes": int(votes),
        "my_vote": 1 if my_vote else 0,
        "can_edit": bool(caps.get("can_edit")),
        "can_delete": bool(caps.get("can_delete")),
        "can_set_status": bool(caps.get("can_set_status")),
        # Oldest first, and always present: a client never has to guess whether the
        # list was left out or is empty.
        "comments": list(comments or []),
    }


def list_ideas(s: Session, claims: dict | None) -> dict:
    """Every request, newest first. Filtering and sorting are the page's job."""
    # Imported here: `authorization` imports `comments_view`, and keeping the
    # capability helpers out of this module's import time avoids a cycle when the
    # rule later wants anything from here.
    from .authorization import feature_request_capabilities

    requests = s.exec(
        select(FeatureRequest).order_by(FeatureRequest.created_at.desc(), FeatureRequest.id.desc())
    ).all()
    ids = [int(fr.id) for fr in requests]
    viewer_id = int(claims["player_id"]) if claims and claims.get("player_id") is not None else None

    areas = areas_map(s, ids)
    votes, my_votes = vote_maps(s, ids, viewer_id)
    images = image_meta_map(s, ids)
    comments = comments_map(s, ids, claims)
    names = author_name_map(s, [int(fr.author_player_id) for fr in requests])

    return {
        "ideas": [
            idea_dict(
                fr,
                author_display_name=names.get(int(fr.author_player_id), f"Player #{int(fr.author_player_id)}"),
                areas=areas.get(int(fr.id), []),
                votes=votes.get(int(fr.id), 0),
                my_vote=1 if int(fr.id) in my_votes else 0,
                image_updated_at=images.get(int(fr.id)),
                capabilities=feature_request_capabilities(fr, claims=claims),
                comments=comments.get(int(fr.id), []),
            )
            for fr in requests
        ]
    }


def one_idea_dict(s: Session, fr: FeatureRequest, claims: dict | None) -> dict:
    from .authorization import feature_request_capabilities

    rid = int(fr.id)
    votes, my_votes = vote_maps(s, [rid], int(claims["player_id"]) if claims and claims.get("player_id") is not None else None)
    names = author_name_map(s, [int(fr.author_player_id)])
    return idea_dict(
        fr,
        author_display_name=names.get(int(fr.author_player_id), f"Player #{int(fr.author_player_id)}"),
        areas=areas_for(s, rid),
        votes=votes.get(rid, 0),
        my_vote=1 if rid in my_votes else 0,
        image_updated_at=image_updated_at(s, rid),
        capabilities=feature_request_capabilities(fr, claims=claims),
        comments=comments_for(s, rid, claims),
    )
