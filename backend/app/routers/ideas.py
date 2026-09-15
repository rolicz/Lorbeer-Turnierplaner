"""The Ideas board (R5): ideas, change requests and bug reports from the group.

Reading is public. Writing needs a login; the author owns their own request, and an
admin owns the board — the rule itself lives in `services/authorization.py` next to
A10's grace window, and every payload carries the same answer as `can_edit` /
`can_delete` / `can_set_status` so the page never re-derives it.
"""
from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlmodel import Session, select

from ..api_utils import bad_request, get_or_404
from ..auth import decode_token, require_auth_claims, require_editor_claims
from ..db import get_engine, get_session
from ..feature_areas import area_defs, area_label, normalize_areas
from ..models import (
    FeatureRequest,
    FeatureRequestArea,
    FeatureRequestImageFile,
    FeatureRequestVote,
    Player,
)
from ..schemas import IdeaCreateBody, IdeaPatchBody, IdeaStatusBody, IdeaVoteBody
from ..schemas.responses import IdeaAreasOut, IdeaListOut, IdeaOut, OkResponse, VoteResultOut, VotersOut
from ..services.authorization import (
    ensure_can_edit_feature_request,
    ensure_can_set_feature_request_status,
)
from ..services.file_storage import (
    delete_media,
    media_path_for_idea,
    read_media,
    upsert_media_row,
)
from ..services.ideas_view import (
    IDEA_KINDS,
    IDEA_STATUSES,
    MAX_IDEA_BODY_LEN,
    MAX_IDEA_STATUS_NOTE_LEN,
    MAX_IDEA_TITLE_LEN,
    list_ideas,
    one_idea_dict,
)
from ..services.notifications import push_idea_created

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
    claims: dict | None = Depends(decode_token),
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
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
) -> dict:
    """Triage. Admin only — the status is the group's answer, not the asker's."""
    fr = get_or_404(s, FeatureRequest, idea_id, name="Idea")
    ensure_can_set_feature_request_status(claims)

    fr.status = _clean_status(body.status)
    if "note" in body.model_fields_set:
        note = " ".join(str(body.note or "").split())
        if len(note) > MAX_IDEA_STATUS_NOTE_LEN:
            bad_request(f"Note must be at most {MAX_IDEA_STATUS_NOTE_LEN} characters")
        fr.status_note = note
    fr.updated_at = datetime.utcnow()
    s.add(fr)
    s.commit()
    s.refresh(fr)
    return one_idea_dict(s, fr, claims)


@router.put("/ideas/{idea_id}/vote", response_model=VoteResultOut)
def vote_idea(
    idea_id: int,
    body: IdeaVoteBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """A "+1", toggled. `value` is 1 or 0; -1 is not a thing an idea can take."""
    get_or_404(s, FeatureRequest, idea_id, name="Idea")
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
            s.commit()
    elif row is None:
        s.add(
            FeatureRequestVote(
                request_id=int(idea_id), player_id=player_id, created_at=datetime.utcnow()
            )
        )
        s.commit()
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
