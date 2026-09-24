"""An account's email address — set, verify, remove, and what `/me` says about it (E1).

Two tables, and this module is the only reader and writer of both:

- `AccountEmail` — the **verified** address, one row per account. It is what recovery
  resolves (E2), so only an address whose mailbox answered lives here: a typo in a change
  of address never displaces the address that works.
- `EmailVerification` — a pending (change of) address: a 24-hour, single-use link token,
  stored as its sha256. The newest one is the only one that works; it is consumed by a
  conditional `UPDATE … WHERE used_at IS NULL`, so two racing taps cannot both win.

**Uniqueness is case-insensitive** and lives in `email_key` (`strip().casefold()`): an
address verified on one account, or pending on one, is refused on any other at entry
(409 — a member with a session is one of the friends, and the sentence is only an oracle
to them). The public recovery endpoint (E2) is where enumeration is closed. A race past
the entry check — two accounts with the same address pending — is settled at
verification: the second tap finds the key taken and gets the generic refusal.

**The token proves the mailbox, not the session.** The verify endpoint is public (the
link opens in a mail app's browser, which has no PWA cookie) and it is a POST: the page
the link opens asks for a tap, because mail scanners follow links and a GET that
confirmed would be confirmed by the scanner.

Nothing here sends mail. The caller commits the token row, then sends — the L16 rule:
no database transaction is open across a network call.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import secrets

from sqlalchemy import delete, update
from sqlmodel import Session, select

from ..api_utils import bad_request, conflict
from ..models import Account, AccountEmail, EmailVerification
from .groups import DEFAULT_GROUP_SLUG

log = logging.getLogger(__name__)

VERIFY_TTL = dt.timedelta(hours=24)
MAX_EMAIL_LENGTH = 254

INVALID_LINK = "That link is not valid"
EMAIL_TAKEN = "That email address is used by another account"
NOT_AN_EMAIL = "That does not look like an email address"
MAIL_OFF = "Email is not set up on this server"
SEND_FAILED = "Could not send the email — try again in a moment"
NOTHING_TO_SEND = "Nothing to send"


def _now() -> dt.datetime:
    """Naive UTC, like every `*_at` column. Tests monkeypatch this."""
    return dt.datetime.utcnow()


def normalize_email(raw: str | None) -> str:
    """The address as typed, stripped — what is stored and what the mail is sent to."""
    return str(raw or "").strip()


def email_key(raw: str | None) -> str:
    """`strip().casefold()` — where "unique, case-insensitively" lives."""
    return normalize_email(raw).casefold()


def is_plausible_email(value: str) -> bool:
    """Exactly one `@`, a non-empty local part, a domain with a dot, no whitespace, at most
    254 characters. Deliverability decides the rest — the link either arrives or it does not."""
    if not value or len(value) > MAX_EMAIL_LENGTH:
        return False
    if any(ch.isspace() for ch in value):
        return False
    if value.count("@") != 1:
        return False
    local, _, domain = value.partition("@")
    if not local or not domain:
        return False
    if "." not in domain or domain.startswith(".") or domain.endswith("."):
        return False
    return True


def validate_email(raw: str | None) -> str:
    """The stripped address, or 400 `NOT_AN_EMAIL`."""
    value = normalize_email(raw)
    if not is_plausible_email(value):
        bad_request(NOT_AN_EMAIL)
    return value


def hash_verification_token(token: str) -> str:
    return hashlib.sha256(str(token or "").strip().encode("utf-8")).hexdigest()


def _live_verifications(s: Session, *, player_id: int | None = None, key: str | None = None):
    """Unused, unexpired `EmailVerification` rows, newest first."""
    stmt = select(EmailVerification).where(EmailVerification.used_at.is_(None), EmailVerification.expires_at > _now())
    if player_id is not None:
        stmt = stmt.where(EmailVerification.player_id == int(player_id))
    if key is not None:
        stmt = stmt.where(EmailVerification.email_key == key)
    return s.exec(stmt.order_by(EmailVerification.created_at.desc(), EmailVerification.id.desc())).all()


def email_taken_reason(s: Session, key: str, *, except_player_id: int, include_pending: bool = True) -> str | None:
    """Why `key` cannot be this player's, or None when it is free. The reason is for a log
    line, never for the caller."""
    owner = s.exec(select(AccountEmail.player_id).where(AccountEmail.email_key == key)).first()
    if owner is not None and int(owner) != int(except_player_id):
        return f"verified on player {owner}"
    if include_pending:
        for row in _live_verifications(s, key=key):
            if int(row.player_id) != int(except_player_id):
                return f"pending on player {row.player_id}"
    return None


def ensure_email_free(s: Session, key: str, *, except_player_id: int) -> None:
    """409 `EMAIL_TAKEN` when the address is verified on another account, or pending
    (a live, unused verification) on another account."""
    reason = email_taken_reason(s, key, except_player_id=except_player_id)
    if reason is not None:
        log.info("Email refused for player %s: the address is %s", except_player_id, reason)
        conflict(EMAIL_TAKEN)


def request_verification(s: Session, account: Account, email: str) -> tuple[EmailVerification, str]:
    """Mint a 24-hour token for `email` on this account; returns the row and the clear token.

    The player's earlier unused verifications are deleted — the newest link is the only one
    that works (the reset-link precedent). Flushes; **the caller commits before sending**."""
    pid = int(account.player_id)
    s.exec(delete(EmailVerification).where(EmailVerification.player_id == pid, EmailVerification.used_at.is_(None)))
    token = secrets.token_urlsafe(32)
    now = _now()
    row = EmailVerification(
        player_id=pid,
        email=email,
        email_key=email_key(email),
        token_hash=hash_verification_token(token),
        created_at=now,
        expires_at=now + VERIFY_TTL,
    )
    s.add(row)
    s.flush()
    return row, token


def discard_verification(s: Session, row_id: int) -> None:
    """Delete one token row — a verification mail that could not be sent must leave no
    live link behind. The caller commits."""
    s.exec(delete(EmailVerification).where(EmailVerification.id == int(row_id)))


def cancel_pending(s: Session, player_id: int) -> int:
    """Delete the player's unused tokens (a pending change given up). The caller commits."""
    result = s.exec(delete(EmailVerification).where(EmailVerification.player_id == int(player_id), EmailVerification.used_at.is_(None)))
    return int(result.rowcount or 0)


def verification_url(origin: str, token: str, *, group_slug: str = DEFAULT_GROUP_SLUG) -> str:
    """`{origin}/g/<slug>/verify-email#<token>` — the token in the fragment, so it never
    reaches a server log or a `Referer`."""
    return f"{str(origin or '').rstrip('/')}/g/{group_slug}/verify-email#{token}"


def find_live_verification(s: Session, token: str) -> EmailVerification:
    """The unexpired, unused row behind `token`, or the generic 400. Spends nothing."""
    clean = str(token or "").strip()
    row = (
        s.exec(select(EmailVerification).where(EmailVerification.token_hash == hash_verification_token(clean))).first()
        if clean
        else None
    )
    if row is None:
        log.info("Email verification refused: unknown token")
        bad_request(INVALID_LINK)
    if row.used_at is not None:
        log.info("Email verification refused: token %s already used at %s", row.id, row.used_at.isoformat())
        bad_request(INVALID_LINK)
    if row.expires_at <= _now():
        log.info("Email verification refused: token %s expired at %s", row.id, row.expires_at.isoformat())
        bad_request(INVALID_LINK)
    return row


def _upsert_verified(s: Session, player_id: int, email: str) -> str | None:
    """Make `email` the player's verified address; returns the previous verified address
    when it was a different one (by key), else None."""
    now = _now()
    key = email_key(email)
    row = s.get(AccountEmail, int(player_id))
    previous: str | None = None
    if row is None:
        row = AccountEmail(player_id=int(player_id), email=email, email_key=key, verified_at=now, created_at=now, updated_at=now)
    else:
        if row.email_key != key:
            previous = row.email
        row.email = email
        row.email_key = key
        row.verified_at = now
        row.updated_at = now
    s.add(row)
    s.exec(delete(EmailVerification).where(EmailVerification.player_id == int(player_id), EmailVerification.used_at.is_(None)))
    s.flush()
    return previous


def consume_verification(s: Session, token: str) -> tuple[Account, str | None]:
    """Spend the token and make its address the account's verified one. Returns the account
    and the **previous** verified address when it differed (the caller tells it, with no
    link). The caller commits.

    The address is checked again here, against verified addresses only: a race past the
    entry check (the same address pending on two accounts) is lost by the second tap, which
    gets the same generic refusal as an unknown token — logged with the real reason."""
    row = find_live_verification(s, token)
    reason = email_taken_reason(s, row.email_key, except_player_id=int(row.player_id), include_pending=False)
    if reason is not None:
        log.info("Email verification refused: token %s names an address that is %s", row.id, reason)
        bad_request(INVALID_LINK)
    result = s.exec(
        update(EmailVerification)
        .where(EmailVerification.id == int(row.id), EmailVerification.used_at.is_(None))
        .values(used_at=_now())
    )
    if int(result.rowcount or 0) != 1:
        log.info("Email verification refused: token %s was used concurrently", row.id)
        bad_request(INVALID_LINK)
    account = s.get(Account, int(row.player_id))
    if account is None:
        log.warning("Email verification refused: token %s names player %s, who has no account", row.id, row.player_id)
        bad_request(INVALID_LINK)
    previous = _upsert_verified(s, int(row.player_id), row.email)
    log.info("Email verified for player %s (token %s)", row.player_id, row.id)
    return account, previous


def remove_email(s: Session, account: Account) -> str | None:
    """Delete the verified address and every unused token; returns the removed verified
    address (or None). The caller commits, then tells the removed address."""
    pid = int(account.player_id)
    row = s.get(AccountEmail, pid)
    removed = row.email if row is not None else None
    if row is not None:
        s.delete(row)
    s.exec(delete(EmailVerification).where(EmailVerification.player_id == pid, EmailVerification.used_at.is_(None)))
    s.flush()
    return removed


def verified_email_for(s: Session, player_id: int) -> str | None:
    row = s.get(AccountEmail, int(player_id))
    return row.email if row is not None else None


def pending_email_for(s: Session, player_id: int) -> str | None:
    rows = _live_verifications(s, player_id=player_id)
    return rows[0].email if rows else None


def email_status(s: Session, player_id: int) -> dict:
    """`EmailStatusOut` — and three of `MeOut`'s fields."""
    verified = verified_email_for(s, player_id)
    return {"email": verified, "email_pending": pending_email_for(s, player_id), "email_verified": verified is not None}


def email_state(s: Session, player_id: int) -> str:
    """`none` | `pending` | `verified` — a verified address wins over a pending change."""
    if verified_email_for(s, player_id) is not None:
        return "verified"
    return "pending" if pending_email_for(s, player_id) is not None else "none"


def email_states(s: Session) -> dict[int, str]:
    """`email_state` for every player at once (the admin page): two queries, not 2 × N.
    A player missing from the map is `none`."""
    states: dict[int, str] = {}
    for pid in s.exec(select(EmailVerification.player_id).where(EmailVerification.used_at.is_(None), EmailVerification.expires_at > _now())).all():
        states[int(pid)] = "pending"
    for pid in s.exec(select(AccountEmail.player_id)).all():
        states[int(pid)] = "verified"
    return states


def account_by_verified_email(s: Session, key: str) -> Account | None:
    """The account whose **verified** address has this key — what recovery resolves (E2).
    A pending address buys nothing."""
    row = s.exec(select(AccountEmail).where(AccountEmail.email_key == email_key(key))).first()
    return s.get(Account, int(row.player_id)) if row is not None else None


def mark_verified_by_hand(s: Session, account: Account, email: str) -> str | None:
    """`manage.py verify-email`: the DNS-is-broken hatch — the same trust as a reset link,
    which the CLI already mints. The caller has validated the address and checked it is
    free; returns the previous verified address when it differed. The caller commits."""
    previous = _upsert_verified(s, int(account.player_id), email)
    log.info("Email verified by hand for player %s", account.player_id)
    return previous


def sweep_expired_verifications(s: Session) -> int:
    """Delete every expired verification row, used or not — a token past its expiry is
    refused anyway. Cheap; called from `PUT /auth/email`. The caller commits."""
    result = s.exec(delete(EmailVerification).where(EmailVerification.expires_at <= _now()))
    return int(result.rowcount or 0)
