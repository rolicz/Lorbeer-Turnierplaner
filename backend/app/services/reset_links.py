"""Admin-issued password reset links (L3): long, one hour, single use. No email.

The token is 32 random bytes (base64url), stored as sha256, and travels in the URL
**fragment** — `{origin}/g/<slug>/reset#<token>` — so it never reaches a server log or a
`Referer`. The reset page strips it from the address bar before its first request.
Delivered however the admin likes (WhatsApp). Unknown, expired and used tokens are one
generic refusal, each logged with its real reason.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import secrets

from sqlalchemy import update
from sqlmodel import Session, select

from ..api_utils import bad_request
from ..models import Account, PasswordResetToken
from .groups import DEFAULT_GROUP_SLUG

log = logging.getLogger(__name__)

RESET_TTL = dt.timedelta(hours=1)
INVALID_LINK = "That reset link is not valid"


def _now() -> dt.datetime:
    """Naive UTC, like every `*_at` column. Tests monkeypatch this."""
    return dt.datetime.utcnow()


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(str(token or "").strip().encode("utf-8")).hexdigest()


def create_reset(s: Session, *, player_id: int, created_by: int | None) -> tuple[PasswordResetToken, str]:
    """Mint a token for `player_id`; returns the row and the clear token. The caller commits.

    Any earlier unused link of that player is deleted: the newest link is the only one that
    works, so a link sent to the wrong chat can be killed by sending a new one."""
    for old in s.exec(
        select(PasswordResetToken).where(PasswordResetToken.player_id == int(player_id), PasswordResetToken.used_at.is_(None))
    ).all():
        s.delete(old)
    token = secrets.token_urlsafe(32)
    now = _now()
    row = PasswordResetToken(
        player_id=int(player_id),
        token_hash=hash_reset_token(token),
        created_by=int(created_by) if created_by is not None else None,
        created_at=now,
        expires_at=now + RESET_TTL,
    )
    s.add(row)
    s.flush()
    return row, token


def link_origin(request) -> str:
    """Where a link the app hands out points — a reset link, an email verification link:
    the pinned `auth_origin` in production; in dev-origin mode the request's own `Origin`
    when it sent one (the admin page on the phone's LAN address). Moved here from
    `routers/admin.py` by E1, so the auth router does not import a router."""
    settings = request.app.state.settings
    origin = str(request.headers.get("origin") or "").strip()
    if settings.auth_dev_origin and origin:
        return origin
    return settings.auth_origin


def reset_url(origin: str, token: str, *, group_slug: str = DEFAULT_GROUP_SLUG) -> str:
    """`{origin}/g/<slug>/reset#<token>` — the page L5 builds reads the fragment."""
    return f"{str(origin or '').rstrip('/')}/g/{group_slug}/reset#{token}"


def recovery_url(origin: str, token: str, *, group_slug: str = DEFAULT_GROUP_SLUG) -> str:
    """The link an email recovery (E2) carries — **the reset link**, byte for byte: one
    token table, one consumer (`consume_reset`), one page. The admin's link, the CLI's and
    the emailed one are three ways of delivering the same thing; this name only says which."""
    return reset_url(origin, token, group_slug=group_slug)


def find_live_reset(s: Session, token: str) -> PasswordResetToken:
    """The unexpired, unused row behind `token`, or the generic 400. Spends nothing."""
    clean = str(token or "").strip()
    row = s.exec(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(clean))).first() if clean else None
    if row is None:
        log.info("Reset refused: unknown token")
        bad_request(INVALID_LINK)
    if row.used_at is not None:
        log.info("Reset refused: token %s already used at %s", row.id, row.used_at.isoformat())
        bad_request(INVALID_LINK)
    if row.expires_at <= _now():
        log.info("Reset refused: token %s expired at %s", row.id, row.expires_at.isoformat())
        bad_request(INVALID_LINK)
    return row


def consume_reset(s: Session, token: str) -> Account:
    """Spend the token (a conditional UPDATE — two racing requests cannot both win) and
    return the account it resets. The caller sets the password and commits."""
    row = find_live_reset(s, token)
    result = s.exec(
        update(PasswordResetToken)
        .where(PasswordResetToken.id == int(row.id), PasswordResetToken.used_at.is_(None))
        .values(used_at=_now())
    )
    if int(result.rowcount or 0) != 1:
        log.info("Reset refused: token %s was used concurrently", row.id)
        bad_request(INVALID_LINK)
    account = s.get(Account, int(row.player_id))
    if account is None:
        log.warning("Reset refused: token %s names player %s, who has no account", row.id, row.player_id)
        bad_request(INVALID_LINK)
    return account
