"""Centralized authorization guards.

Small, explicit helpers for the owner/admin and "tournament is done" permission checks that
were previously inlined across the routers. Each raises the same status code and detail string
as the inline check it replaces, so behavior (and the auth tests) is unchanged.
"""
from __future__ import annotations

from ..api_utils import forbidden


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


def ensure_not_done_or_admin(status: str, role: str | None, *, action: str) -> None:
    """Block edits to a finished ("done") tournament unless the caller is an admin.

    Raises 403 "Tournament is done (admin required to {action})".
    """
    if status == "done" and role != "admin":
        forbidden(f"Tournament is done (admin required to {action})")
