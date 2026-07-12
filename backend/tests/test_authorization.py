"""Unit tests for the centralized authorization guards (no HTTP client needed)."""
import pytest
from fastapi import HTTPException

from app.services.authorization import require_self_or_admin


def test_require_self_or_admin_none_subject_without_allow_missing_is_403():
    """A ``None`` subject without ``allow_missing=True`` must 403, not raise a TypeError (500)."""
    claims = {"player_id": 1, "role": "editor"}
    with pytest.raises(HTTPException) as exc_info:
        require_self_or_admin(claims, None, message="You can only post as yourself")
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "You can only post as yourself"


def test_require_self_or_admin_none_subject_without_allow_missing_is_403_for_admin_too():
    """The missing-subject guard applies even to admins: ``allow_missing`` is the only escape hatch."""
    claims = {"player_id": 1, "role": "admin"}
    with pytest.raises(HTTPException) as exc_info:
        require_self_or_admin(claims, None, message="You can only post as yourself")
    assert exc_info.value.status_code == 403


def test_require_self_or_admin_none_subject_with_allow_missing_is_ok():
    claims = {"player_id": 1, "role": "editor"}
    # Should not raise.
    require_self_or_admin(claims, None, message="unused", allow_missing=True)
