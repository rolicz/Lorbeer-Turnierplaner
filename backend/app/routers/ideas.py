"""The Ideas board (R5): ideas, change requests and bug reports from the group.

Reading is public. Writing needs a login; the author owns their own request, and an
admin owns the board — the rule itself lives in `services/authorization.py` next to
A10's grace window, and every payload carries the same answer as `can_edit` /
`can_delete` / `can_set_status` so the page never re-derives it.

Since P1 an idea also carries a **flat comment list** in its own payload (no second
endpoint, no second query key) and every notable thing that happens to it is logged
as a `FeatureRequestEvent` — created, commented, voted, status — which is what the
bell and the push both read. Writing all four goes through
`services/idea_events.py`; deleting an idea takes its comments and events with it.
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlmodel import Session, select

from ..api_utils import bad_request, get_or_404
from ..auth import require_auth_claims, require_editor_claims
from ..db import get_engine, get_session
from ..feature_areas import area_defs, area_label, normalize_areas
from ..models import (
    FeatureRequest,
    FeatureRequestArea,
    FeatureRequestComment,
    FeatureRequestImageFile,
    FeatureRequestVote,
    Player,
)
from ..schemas import (
    IdeaCommentCreateBody,
    IdeaCreateBody,
    IdeaPatchBody,
    IdeaStatusBody,
    IdeaVoteBody,
)
from ..schemas.responses import (
    IdeaAreasOut,
    IdeaCommentOut,
    IdeaListOut,
    IdeaOut,
    MarkedResponse,
    OkResponse,
    VoteResultOut,
    VotersOut,
)
from ..services.authorization import (
    ensure_can_delete_feature_request_comment,
    ensure_can_edit_feature_request,
    ensure_can_set_feature_request_status,
    feature_request_comment_capabilities,
)
from ..services.file_storage import (
    delete_media,
    media_path_for_idea,
    read_media,
    upsert_media_row,
)
from ..services.idea_events import (
    delete_idea_comments,
    delete_idea_events,
    mark_idea_events_read,
    record_idea_event,
)
from ..services.ideas_view import (
    IDEA_KINDS,
    IDEA_STATUSES,
    MAX_IDEA_BODY_LEN,
    MAX_IDEA_COMMENT_LEN,
    MAX_IDEA_STATUS_NOTE_LEN,
    MAX_IDEA_TITLE_LEN,
    comment_dict,
    list_ideas,
    one_idea_dict,
)
from ..services.notifications import (
    push_idea_commented,
    push_idea_created,
    push_idea_status,
    push_idea_voted,
)

log = logging.getLogger(__name__)
router = APIRouter(tags=["ideas"])

# Same ceiling as a comment image: a cropped screenshot, not a photo library.
MAX_IDEA_IMAGE_BYTES = 8_000_000


def _clean_title(raw: str | None) -> str:
    title = " ".join(str(raw or "").split())
    if not title:
        bad_request("Title is required")
    if len(title) > MAX_IDEA_TITLE_LEN:
        bad_request(f"Title must be at most {MAX_IDEA_TITLE_LEN} characters")
    return title


def _clean_body(raw: str | None) -> str:
    body = str(raw or "").strip()
    if len(body) > MAX_IDEA_BODY_LEN:
        bad_request(f"Details must be at most {MAX_IDEA_BODY_LEN} characters")
    return body


def _clean_kind(raw: str | None) -> str:
    kind = str(raw or "").strip().lower()
    if kind not in IDEA_KINDS:
        bad_request(f"kind must be one of {', '.join(IDEA_KINDS)}")
    return kind


def _clean_status(raw: str | None) -> str:
    status = str(raw or "").strip().lower()
    if status not in IDEA_STATUSES:
        bad_request(f"status must be one of {', '.join(IDEA_STATUSES)}")
    return status


def _clean_comment_body(raw: str | None) -> str:
    body = str(raw or "").strip()
    if not body:
        bad_request("Comment is required")
    if len(body) > MAX_IDEA_COMMENT_LEN:
        bad_request(f"Comment must be at most {MAX_IDEA_COMMENT_LEN} characters")
    return body


def _clean_areas(raw: list[str] | None) -> list[str]:
    areas, error = normalize_areas(raw)
    if error:
        bad_request(error)
    return areas


def _write_areas(s: Session, request_id: int, areas: list[str]) -> None:
    for row in s.exec(
        select(FeatureRequestArea).where(FeatureRequestArea.request_id == int(request_id))
    ).all():
        s.delete(row)
    for area in areas:
        s.add(FeatureRequestArea(request_id=int(request_id), area=area))


def _meta_line(kind: str, areas: list[str]) -> str:
    """`Bug · Stats, Players` — what the push says the idea is about.

    Deliberately untranslated: kinds and areas are the app's own page names, which
    read the same in all three notification languages because the UI is English.
    """
    kind_label = {"feature": "Feature", "change": "Change", "bug": "Bug"}.get(kind, kind.title())
    where = ", ".join(area_label(a) for a in areas)
    return f"{kind_label} · {where}" if where else kind_label


def _upsert_idea_image_file(
    s: Session, *, request_id: int, content_type: str, data: bytes, updated_at: datetime | None = None
) -> FeatureRequestImageFile:
    return upsert_media_row(
        s,
        row_cls=FeatureRequestImageFile,
        row_id=int(request_id),
        id_field="request_id",
        content_type=content_type,
        data=data,
        path_builder=media_path_for_idea,
        updated_at=updated_at,
    )


# ---- read ---------------------------------------------------------------


@router.get("/ideas/areas", response_model=IdeaAreasOut)
def list_idea_areas() -> dict:
    """The area catalog, so the page never keeps a hand-written copy of it."""
    return {
        "areas": [
            {"key": a.key, "label": a.label, "selectable": not a.retired} for a in area_defs()
        ]
    }


@router.get("/ideas", response_model=IdeaListOut)
def list_all_ideas(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    return list_ideas(s, claims)


@router.get("/ideas/{idea_id}/voters", response_model=VotersOut)
def list_idea_voters(idea_id: int, s: Session = Depends(get_session)) -> dict:
    get_or_404(s, FeatureRequest, idea_id, name="Idea")
    rows = s.exec(
        select(Player.id, Player.display_name)
        .join(FeatureRequestVote, FeatureRequestVote.player_id == Player.id)
        .where(FeatureRequestVote.request_id == int(idea_id))
        .order_by(Player.display_name.asc(), Player.id.asc())
    ).all()
    # An idea takes a "+1" and nothing else, so the downvote list is always empty —
    # the shape stays VotersOut so the vote modal is the one the comments use.
    return {
        "upvoters": [{"id": int(pid), "display_name": name} for pid, name in rows],
        "downvoters": [],
    }


@router.get("/ideas/{idea_id}/image")
def get_idea_image(idea_id: int):
    with Session(get_engine()) as s:
        get_or_404(s, FeatureRequest, idea_id, name="Idea")
        img_file = s.get(FeatureRequestImageFile, int(idea_id))
        if not img_file:
            raise HTTPException(status_code=404, detail="Idea image not found")
        content_type = img_file.content_type
        file_path = img_file.file_path

    data = read_media(file_path)
    if data is None:
        raise HTTPException(status_code=404, detail="Idea image file missing")
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "public, max-age=604800"})


# ---- write --------------------------------------------------------------


@router.post("/ideas", response_model=IdeaOut)
def create_idea(
    body: IdeaCreateBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    title = _clean_title(body.title)
    text = _clean_body(body.body)
    kind = _clean_kind(body.kind)
    areas = _clean_areas(body.areas)

    author_player_id = int(claims.get("player_id"))
    author = s.get(Player, author_player_id)
    if author is None:
        bad_request("Your account has no player profile")

    now = datetime.utcnow()
    fr = FeatureRequest(
        author_player_id=author_player_id,
        title=title,
        body=text,
        kind=kind,
        status="new",
        status_note="",
        created_at=now,
        updated_at=now,
    )
    s.add(fr)
    s.commit()
    s.refresh(fr)

    _write_areas(s, int(fr.id), areas)
    record_idea_event(s, request_id=int(fr.id), kind="created", actor_player_id=author_player_id)
    s.commit()

    push_idea_created(
        request,
        s,
        idea_id=int(fr.id),
        title=title,
        author_name=author.display_name,
        author_player_id=author_player_id,
        meta_line=_meta_line(kind, areas),
    )

    return one_idea_dict(s, fr, claims)


@router.patch("/ideas/{idea_id}", response_model=IdeaOut)
def patch_idea(
    idea_id: int,
    body: IdeaPatchBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    ensure_can_edit_feature_request(fr, claims=claims, action="edit")

    fields = body.model_fields_set
    if "title" in fields:
        fr.title = _clean_title(body.title)
    if "body" in fields:
        fr.body = _clean_body(body.body)
    if "kind" in fields:
        fr.kind = _clean_kind(body.kind)
    if "areas" in fields:
        _write_areas(s, int(fr.id), _clean_areas(body.areas))

    now = datetime.utcnow()
    fr.updated_at = now
    # Only here: a PATCH is the author's text changing. A status, a screenshot and
    # a vote all move `updated_at` and none of them makes the idea "edited".
    fr.edited_at = now
    s.add(fr)
    s.commit()
    s.refresh(fr)
    return one_idea_dict(s, fr, claims)


@router.put("/ideas/{idea_id}/status", response_model=IdeaOut)
def set_idea_status(
    idea_id: int,
    body: IdeaStatusBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    """Triage. Admin only — the status is the group's answer, not the asker's."""
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    ensure_can_set_feature_request_status(claims)

    before = (fr.status, fr.status_note)
    fr.status = _clean_status(body.status)
    if "note" in body.model_fields_set:
        note = " ".join(str(body.note or "").split())
        if len(note) > MAX_IDEA_STATUS_NOTE_LEN:
            bad_request(f"Note must be at most {MAX_IDEA_STATUS_NOTE_LEN} characters")
        fr.status_note = note
    fr.updated_at = datetime.utcnow()
    s.add(fr)
    # Re-saving the same answer is not news: only a real change is an event.
    changed = (fr.status, fr.status_note) != before
    if changed:
        record_idea_event(
            s,
            request_id=int(fr.id),
            kind="status",
            actor_player_id=int(claims.get("player_id")),
            status=fr.status,
            status_note=fr.status_note,
        )
    s.commit()
    s.refresh(fr)
    if changed:
        push_idea_status(
            request,
            s,
            idea_id=int(fr.id),
            title=fr.title,
            author_player_id=int(fr.author_player_id),
            actor_player_id=int(claims.get("player_id")),
            status=fr.status,
            status_note=fr.status_note,
        )
    return one_idea_dict(s, fr, claims)


@router.put("/ideas/{idea_id}/vote", response_model=VoteResultOut)
def vote_idea(
    idea_id: int,
    body: IdeaVoteBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """A "+1", toggled. `value` is 1 or 0; -1 is not a thing an idea can take."""
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    player_id = int(claims.get("player_id"))
    raw = body.value
    try:
        value = int(0 if raw in (None, "") else raw)
    except Exception:
        bad_request("Invalid vote value")
    if value not in (0, 1):
        bad_request("vote value must be 0 or 1")

    row = s.get(FeatureRequestVote, (int(idea_id), player_id))
    if value == 0:
        if row is not None:
            s.delete(row)
            # An unvote takes its event with it: the bell derives from state, so a
            # "+1" somebody took back must stop showing up.
            delete_idea_events(
                s, request_id=int(idea_id), kind="vote", actor_player_id=player_id
            )
            s.commit()
    elif row is None:
        s.add(
            FeatureRequestVote(
                request_id=int(idea_id), player_id=player_id, created_at=datetime.utcnow()
            )
        )
        record_idea_event(
            s, request_id=int(idea_id), kind="vote", actor_player_id=player_id
        )
        s.commit()
        vote_count = len(
            s.exec(
                select(FeatureRequestVote.player_id).where(
                    FeatureRequestVote.request_id == int(idea_id)
                )
            ).all()
        )
        voter = s.get(Player, player_id)
        push_idea_voted(
            request,
            s,
            idea_id=int(idea_id),
            title=fr.title,
            author_player_id=int(fr.author_player_id),
            actor_player_id=player_id,
            actor_name=voter.display_name if voter is not None else "",
            vote_count=vote_count,
        )
    return {"ok": True, "value": value}


@router.delete("/ideas/{idea_id}", response_model=OkResponse)
def delete_idea(
    idea_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    ensure_can_edit_feature_request(fr, claims=claims, action="delete")

    img_file = s.get(FeatureRequestImageFile, int(idea_id))
    if img_file is not None:
        delete_media(img_file.file_path)
        s.delete(img_file)
    for row in s.exec(
        select(FeatureRequestArea).where(FeatureRequestArea.request_id == int(idea_id))
    ).all():
        s.delete(row)
    for row in s.exec(
        select(FeatureRequestVote).where(FeatureRequestVote.request_id == int(idea_id))
    ).all():
        s.delete(row)
    # The events first: they name the comments, and nothing may be left pointing at
    # a dead id (`featurerequest.id` has no AUTOINCREMENT either — A9).
    delete_idea_events(s, request_id=int(idea_id))
    delete_idea_comments(s, request_id=int(idea_id))
    s.delete(fr)
    s.commit()
    return {"ok": True}


@router.put("/ideas/{idea_id}/image", response_model=IdeaOut)
async def put_idea_image(
    idea_id: int,
    file: UploadFile = File(...),
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    ensure_can_edit_feature_request(fr, claims=claims, action="edit")

    ct = (file.content_type or "").strip().lower()
    if not ct.startswith("image/"):
        bad_request("Invalid file type")
    data = await file.read()
    if not data:
        bad_request("Empty file")
    if len(data) > MAX_IDEA_IMAGE_BYTES:
        raise HTTPException(
            status_code=413, detail=f"Idea image too large (max {MAX_IDEA_IMAGE_BYTES} bytes)"
        )

    now = datetime.utcnow()
    _upsert_idea_image_file(s, request_id=int(idea_id), content_type=ct, data=data, updated_at=now)
    fr.updated_at = now
    s.add(fr)
    s.commit()
    s.refresh(fr)
    return one_idea_dict(s, fr, claims)


@router.delete("/ideas/{idea_id}/image", response_model=OkResponse)
def delete_idea_image(
    idea_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    ensure_can_edit_feature_request(fr, claims=claims, action="edit")

    img_file = s.get(FeatureRequestImageFile, int(idea_id))
    if img_file is None:
        return {"ok": True}
    delete_media(img_file.file_path)
    s.delete(img_file)
    fr.updated_at = datetime.utcnow()
    s.add(fr)
    s.commit()
    return {"ok": True}


# ---- comments & read state ----------------------------------------------
#
# `/ideas/comments/{comment_id}` sits beside `/ideas/{idea_id}/…` the way the
# guestbook's `/players/guestbook/{entry_id}` sits beside `/players/{id}/…`: the
# segment counts and literals differ, so nothing collides.


@router.post("/ideas/{idea_id}/comments", response_model=IdeaCommentOut)
def create_idea_comment(
    idea_id: int,
    body: IdeaCommentCreateBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    """Say something under an idea. Reading the board is public; this needs a login.

    The idea's own `updated_at` is deliberately **not** touched: a comment is neither
    the author's text changing nor the admin's answer, and `updated_at` already
    carries more meanings than it can (R5's `edited_at` note).
    """
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    text = _clean_comment_body(body.body)

    author_player_id = int(claims.get("player_id"))
    author = s.get(Player, author_player_id)
    if author is None:
        bad_request("Your account has no player profile")

    now = datetime.utcnow()
    c = FeatureRequestComment(
        request_id=int(idea_id),
        author_player_id=author_player_id,
        body=text,
        created_at=now,
        updated_at=now,
    )
    s.add(c)
    s.flush()
    record_idea_event(
        s,
        request_id=int(idea_id),
        kind="comment",
        actor_player_id=author_player_id,
        comment_id=int(c.id),
        now=now,
    )
    s.commit()
    s.refresh(c)

    # The guestbook's own preview rule (`players.py`) — not `_snippet`, the bell's own.
    preview = text if len(text) <= 120 else text[:117].rstrip() + "..."
    push_idea_commented(
        request,
        s,
        idea_id=int(idea_id),
        title=fr.title,
        author_player_id=int(fr.author_player_id),
        actor_player_id=author_player_id,
        actor_name=author.display_name,
        preview=preview,
        comment_id=int(c.id),
    )

    return comment_dict(
        c,
        author_display_name=author.display_name,
        # Asked, not assumed: the flag comes from the same predicate the list uses.
        capabilities=feature_request_comment_capabilities(c, claims=claims),
    )


@router.delete("/ideas/comments/{comment_id}", response_model=OkResponse)
def delete_idea_comment(
    comment_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    """The comment's author or an admin, for as long as it exists — no window.

    Not the idea's author: a comment on an idea is a reply to a document, not a note
    on somebody's wall. The comment's event goes with it, so the bell forgets it too.
    """
    c = get_or_404(s, FeatureRequestComment, comment_id, name="Comment")
    ensure_can_delete_feature_request_comment(c, claims=claims)

    delete_idea_events(s, request_id=int(c.request_id), comment_id=int(c.id))
    s.delete(c)
    s.commit()
    return {"ok": True}


@router.put("/ideas/{idea_id}/read", response_model=MarkedResponse)
def mark_idea_read(
    idea_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Read = you opened it: every event on this idea is marked read for the caller.

    The board calls this when the `?idea=` deep link is consumed and when a viewer
    expands an idea's comments. Idempotent — a second call marks 0.
    """
    get_or_404(s, FeatureRequest, idea_id, name="Idea")
    marked = mark_idea_events_read(
        s, player_id=int(claims.get("player_id")), request_id=int(idea_id)
    )
    if marked:
        s.commit()
    return {"ok": True, "marked": marked}
