"""Centralized authorization guards.

Small, explicit helpers for the owner/admin permission checks that were previously inlined
across the routers.

Since A10 this module is also the **single** home of the editor's grace window: who may edit,
delete or decide a tournament or a friendly, and for how long. The routers guard with
``ensure_can_*`` and the payloads carry the same answer as ``can_edit`` / ``can_delete`` /
``can_set_decider``, so no client re-derives the rule (which is how the docstring, the server
and the UI drifted apart before A1).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import func
from sqlmodel import Session, select

from ..api_utils import forbidden
from ..models import (
    FeatureRequest,
    FeatureRequestComment,
    FriendlyCreatorLink,
    FriendlyMatch,
    Match,
    Tournament,
    TournamentCreatorLink,
)
from ..tournament_status import compute_status_for_tournament
from .comments_view import COMMENT_EDIT_WINDOW


def require_profile_owner(claims: dict, owner_player_id: int, *, what: str) -> None:
    """Only the profile owner may perform this action (no admin override).

    Raises 403 "Only the profile owner can edit this {what}".
    """
    if int(claims.get("player_id")) != int(owner_player_id):
        forbidden(f"Only the profile owner can edit this {what}")


def require_self_or_admin(
    claims: dict,
    subject_player_id: int | None,
    *,
    message: str,
    allow_missing: bool = False,
) -> None:
    """Permit acting as ``subject_player_id`` only when the caller IS that player or an admin.

    With ``allow_missing=True`` a ``None`` subject is allowed (e.g. an unattributed / "General"
    author). Raises 403 with ``message`` otherwise (including when the subject is ``None`` and
    ``allow_missing`` is False, rather than letting ``int(None)`` raise a 500).
    """
    if subject_player_id is None:
        if allow_missing:
            return
        forbidden(message)
    is_admin = str(claims.get("role") or "") == "admin"
    if int(subject_player_id) != int(claims.get("player_id")) and not is_admin:
        forbidden(message)


# ---------------------------------------------------------------------------
# A10 — the editor's grace window.
# Every question below is answered against server time, which is why the payload
# flags (and not a client clock) are what the UI renders its controls from.
# ---------------------------------------------------------------------------

#: An editor gets exactly as long to fix a tournament or a friendly as a comment's
#: author gets to fix a comment. One constant, imported, never redefined.
GRACE_WINDOW = COMMENT_EDIT_WINDOW


def _role(claims: dict | None) -> str:
    return str((claims or {}).get("role") or "")


def _is_admin(claims: dict | None) -> bool:
    return _role(claims) == "admin"


def _is_editor_or_admin(claims: dict | None) -> bool:
    return _role(claims) in ("editor", "admin")


def _viewer_id(claims: dict | None) -> int | None:
    try:
        return int((claims or {}).get("player_id"))
    except (TypeError, ValueError):
        return None


def _within_window(moment: dt.datetime | None, now: dt.datetime | None = None) -> bool:
    """True while ``moment`` is less than GRACE_WINDOW ago. ``None`` never is."""
    if moment is None:
        return False
    return (now or dt.datetime.utcnow()) - moment <= GRACE_WINDOW


def _is_creator(claims: dict | None, creator_player_id: int | None) -> bool:
    viewer = _viewer_id(claims)
    return viewer is not None and creator_player_id is not None and int(creator_player_id) == viewer


def tournament_finished_at(
    s: Session, tournament_id: int, *, matches: list[Match] | None = None
) -> dt.datetime | None:
    """The latest ``Match.finished_at`` of a tournament's matches, or ``None``.

    ``matches`` lets a caller that already loaded them (the tournament list) skip the query.
    """
    if matches is not None:
        stamps = [m.finished_at for m in matches if m.finished_at is not None]
        return max(stamps) if stamps else None
    return s.exec(
        select(func.max(Match.finished_at)).where(Match.tournament_id == tournament_id)
    ).one()


def tournament_grace_anchor(
    s: Session, t: Tournament, *, matches: list[Match] | None = None
) -> dt.datetime:
    """When the hour starts running on a *done* tournament.

    The latest finished match, because that is when the tournament actually ended. A
    tournament can be done with no timestamp at all (matches finished before
    ``finished_at`` was recorded, or backfilled history), and then the row's own
    ``updated_at`` is the only evidence of when it last changed — so that is the
    fallback, rather than "no window at all".
    """
    return tournament_finished_at(s, int(t.id), matches=matches) or t.updated_at


def can_edit_tournament(
    s: Session,
    t: Tournament,
    *,
    claims: dict | None,
    status: str | None = None,
    matches: list[Match] | None = None,
    now: dt.datetime | None = None,
) -> bool:
    """Admin always; an editor while the tournament is not done, and for one hour after."""
    if _is_admin(claims):
        return True
    if not _is_editor_or_admin(claims):
        return False
    status_now = status if status is not None else compute_status_for_tournament(s, int(t.id))
    if status_now != "done":
        return True
    return _within_window(tournament_grace_anchor(s, t, matches=matches), now)


def can_delete_tournament(
    t: Tournament,
    *,
    claims: dict | None,
    creator_player_id: int | None,
    now: dt.datetime | None = None,
) -> bool:
    """Admin always; otherwise only the editor who created it, within their first hour.

    Deleting is allowed even when results exist (Roli's call) — which is exactly why
    every delete asks for confirmation, an admin's included.
    """
    if _is_admin(claims):
        return True
    if not _is_editor_or_admin(claims):
        return False
    if not _is_creator(claims, creator_player_id):
        return False
    return _within_window(t.created_at, now)


def can_touch_friendly(
    fm: FriendlyMatch,
    *,
    claims: dict | None,
    creator_player_id: int | None,
    now: dt.datetime | None = None,
) -> bool:
    """Admin always; otherwise only the editor who created it, within their first hour.

    A friendly is one row entered in one go — there is no schedule to run down and no
    "done" to wait for — so editing it and deleting it answer the same question.
    """
    if _is_admin(claims):
        return True
    if not _is_editor_or_admin(claims):
        return False
    if not _is_creator(claims, creator_player_id):
        return False
    return _within_window(fm.created_at, now)


def tournament_creator_id(s: Session, tournament_id: int) -> int | None:
    link = s.get(TournamentCreatorLink, int(tournament_id))
    return int(link.creator_player_id) if link else None


def tournament_creator_map(s: Session, tournament_ids: list[int]) -> dict[int, int]:
    """One query for a whole list's creators (mirrors ``comments_view.real_author_map``)."""
    if not tournament_ids:
        return {}
    rows = s.exec(
        select(TournamentCreatorLink.tournament_id, TournamentCreatorLink.creator_player_id).where(
            TournamentCreatorLink.tournament_id.in_(tournament_ids)
        )
    ).all()
    return {int(tid): int(pid) for tid, pid in rows}


def friendly_creator_id(s: Session, friendly_id: int) -> int | None:
    link = s.get(FriendlyCreatorLink, int(friendly_id))
    return int(link.creator_player_id) if link else None


def friendly_creator_map(s: Session, friendly_ids: list[int]) -> dict[int, int]:
    if not friendly_ids:
        return {}
    rows = s.exec(
        select(FriendlyCreatorLink.friendly_match_id, FriendlyCreatorLink.creator_player_id).where(
            FriendlyCreatorLink.friendly_match_id.in_(friendly_ids)
        )
    ).all()
    return {int(fid): int(pid) for fid, pid in rows}


def tournament_capabilities(
    s: Session,
    t: Tournament,
    *,
    claims: dict | None,
    creator_player_id: int | None,
    status: str | None = None,
    matches: list[Match] | None = None,
    now: dt.datetime | None = None,
) -> dict[str, bool]:
    """What this caller may do with this tournament right now — the payload's flags.

    A viewer-less caller (a reader, and the websocket broadcast, which has no single
    viewer) gets all-False, the same default ``CommentOut.can_edit`` uses.
    """
    editable = can_edit_tournament(s, t, claims=claims, status=status, matches=matches, now=now)
    return {
        "can_edit": editable,
        # Setting the decider IS editing the result; it never had a rule of its own.
        "can_set_decider": editable,
        "can_delete": can_delete_tournament(
            t, claims=claims, creator_player_id=creator_player_id, now=now
        ),
    }


def friendly_capabilities(
    fm: FriendlyMatch,
    *,
    claims: dict | None,
    creator_player_id: int | None,
    now: dt.datetime | None = None,
) -> dict[str, bool]:
    """``can_set_decider`` has no meaning for a friendly, so a friendly carries two flags."""
    allowed = can_touch_friendly(fm, claims=claims, creator_player_id=creator_player_id, now=now)
    return {"can_edit": allowed, "can_delete": allowed}


# ---------------------------------------------------------------------------
# R5 — the Ideas board.
# A different question from A10's: a feature request is a document, not a result.
# Nothing about it goes stale an hour after it was written, so there is **no time
# window here** — the author owns their own text for as long as it exists, and the
# admin owns the status. The shape is the same though: one predicate per verb, one
# ``*_capabilities`` that the payload carries, one ``ensure_*`` that raises the 403.
# ---------------------------------------------------------------------------


def _is_idea_author(fr: FeatureRequest, claims: dict | None) -> bool:
    viewer = _viewer_id(claims)
    return viewer is not None and int(fr.author_player_id) == viewer


def can_edit_feature_request(fr: FeatureRequest, *, claims: dict | None) -> bool:
    """Admin always; otherwise the author of this request, with no deadline."""
    if _is_admin(claims):
        return True
    if not _is_editor_or_admin(claims):
        return False
    return _is_idea_author(fr, claims)


def can_delete_feature_request(fr: FeatureRequest, *, claims: dict | None) -> bool:
    """Same answer as editing: it is the author's request, or the admin's board."""
    return can_edit_feature_request(fr, claims=claims)


def can_set_feature_request_status(*, claims: dict | None) -> bool:
    """Only an admin triages: the status is the group's answer, not the asker's."""
    return _is_admin(claims)


def feature_request_capabilities(fr: FeatureRequest, *, claims: dict | None) -> dict[str, bool]:
    """What this caller may do with this request right now — the payload's flags.

    A reader (no claims) gets all-False, so the Ideas page renders its controls from
    the server's answer and never re-derives the rule.
    """
    editable = can_edit_feature_request(fr, claims=claims)
    return {
        "can_edit": editable,
        "can_delete": can_delete_feature_request(fr, claims=claims),
        "can_set_status": can_set_feature_request_status(claims=claims),
    }


def _is_idea_comment_author(c: FeatureRequestComment, claims: dict | None) -> bool:
    viewer = _viewer_id(claims)
    return viewer is not None and int(c.author_player_id) == viewer


def can_delete_feature_request_comment(c: FeatureRequestComment, *, claims: dict | None) -> bool:
    """Admin always; otherwise the author of this comment, with no deadline (P1).

    Deliberately **not** the idea's author: the guestbook lets the wall's owner clear
    a note from their wall, but a comment on an idea is a reply to a document, not a
    note on a wall, and an asker who can delete the answers is a board nobody argues
    on. There is no edit verb at all — a typo is fixed by deleting and reposting
    (Roli, 2026-09-19) — so this is the comment's whole permission surface.
    """
    if _is_admin(claims):
        return True
    if not _is_editor_or_admin(claims):
        return False
    return _is_idea_comment_author(c, claims)


def feature_request_comment_capabilities(
    c: FeatureRequestComment, *, claims: dict | None
) -> dict[str, bool]:
    """What this caller may do with this comment — the flag the payload carries.

    A reader gets all-False; the page renders the flag and never re-derives the rule.
    """
    return {"can_delete": can_delete_feature_request_comment(c, claims=claims)}


# ---- guards: the same answers, raised as 403s -----------------------------


def ensure_can_edit_tournament(
    s: Session,
    t: Tournament,
    *,
    claims: dict | None,
    action: str,
    status: str | None = None,
) -> None:
    """Raises 403 "Tournament finished more than an hour ago (admin required to {action})"."""
    if not can_edit_tournament(s, t, claims=claims, status=status):
        forbidden(f"Tournament finished more than an hour ago (admin required to {action})")


def ensure_can_delete_tournament(s: Session, t: Tournament, *, claims: dict | None) -> None:
    if not can_delete_tournament(
        t, claims=claims, creator_player_id=tournament_creator_id(s, int(t.id))
    ):
        forbidden(
            "Only an admin, or the editor who created it within the last hour, can delete a tournament"
        )


def ensure_can_touch_friendly(
    s: Session, fm: FriendlyMatch, *, claims: dict | None, action: str
) -> None:
    if not can_touch_friendly(
        fm, claims=claims, creator_player_id=friendly_creator_id(s, int(fm.id))
    ):
        forbidden(
            f"Only an admin, or the editor who created it within the last hour, can {action} a friendly"
        )


def ensure_can_edit_feature_request(fr: FeatureRequest, *, claims: dict | None, action: str) -> None:
    if not can_edit_feature_request(fr, claims=claims):
        forbidden(f"Only the author of this idea, or an admin, can {action} it")


def ensure_can_set_feature_request_status(claims: dict | None) -> None:
    if not can_set_feature_request_status(claims=claims):
        forbidden("Only an admin can set the status of an idea")


def ensure_can_delete_feature_request_comment(
    c: FeatureRequestComment, *, claims: dict | None, action: str = "delete"
) -> None:
    if not can_delete_feature_request_comment(c, claims=claims):
        forbidden(f"Only the author of this comment, or an admin, can {action} it")
