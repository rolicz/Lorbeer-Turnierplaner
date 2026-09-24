"""Invite codes (L3): short, human-typable, single use, one hour, and they carry their group.

A code is 8 characters from a 32-symbol alphabet with no `O`/`0` and no `I`/`1`, shown as
`ABCD-EFGH` and normalised on input (uppercase, `-` and whitespace stripped). The row
stores only its sha256 — the code is readable exactly once, in the response that minted it.
Redeeming one grants **membership, not ownership**, in the code's group.

The defence against guessing is not the code's length but the globally rate-limited redeem
endpoints (`services/rate_limit.py`, family `redeem`: 40 attempts an hour across the whole
internet against 2^40 candidates). Every refusal is **one generic message** — unknown,
expired and spent are logged with their real reason and never told apart to the client.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import secrets

from sqlalchemy import update
from sqlmodel import Session, select

from ..api_utils import bad_request, conflict
from ..models import Group, GroupMembership, InviteCode

log = logging.getLogger(__name__)

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8
INVITE_TTL = dt.timedelta(hours=1)
INVALID_CODE = "That code is not valid"
MAX_NOTE_LENGTH = 120


def _now() -> dt.datetime:
    """Naive UTC, like every `*_at` column. Tests monkeypatch this."""
    return dt.datetime.utcnow()


def new_code() -> str:
    """8 symbols drawn with `secrets` — 2^40 candidates."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def format_code(code: str) -> str:
    """`ABCDEFGH` → `ABCD-EFGH`."""
    c = normalize_code(code)
    return f"{c[:4]}-{c[4:]}" if len(c) > 4 else c


def normalize_code(raw: str | None) -> str:
    """Uppercase, with `-` and every kind of whitespace removed."""
    return "".join(ch for ch in str(raw or "").upper() if ch != "-" and not ch.isspace())


def hash_code(code: str) -> str:
    return hashlib.sha256(normalize_code(code).encode("utf-8")).hexdigest()


def create_invite(s: Session, *, group_id: int, created_by: int | None, note: str = "") -> tuple[InviteCode, str]:
    """Mint a code for `group_id`; returns the row and the clear code (formatted). The
    caller commits."""
    for _ in range(8):  # a collision in 2^40 is not expected; retrying costs nothing
        code = new_code()
        digest = hash_code(code)
        if s.exec(select(InviteCode.id).where(InviteCode.code_hash == digest)).first() is None:
            break
    else:  # pragma: no cover
        raise RuntimeError("could not mint a unique invite code")
    now = _now()
    row = InviteCode(
        code_hash=digest,
        group_id=int(group_id),
        created_by=int(created_by) if created_by is not None else None,
        note=str(note or "").strip()[:MAX_NOTE_LENGTH],
        created_at=now,
        expires_at=now + INVITE_TTL,
    )
    s.add(row)
    s.flush()
    return row, format_code(code)


def _ensure_live(row: InviteCode | None) -> InviteCode:
    """The one liveness rule: unknown, redeemed and expired are one generic 400, each
    logged with its real reason."""
    if row is None:
        log.info("Invite refused: unknown code")
        bad_request(INVALID_CODE)
    if row.redeemed_at is not None:
        log.info("Invite refused: code %s already redeemed by player %s", row.id, row.redeemed_by)
        bad_request(INVALID_CODE)
    if row.expires_at <= _now():
        log.info("Invite refused: code %s expired at %s", row.id, row.expires_at.isoformat())
        bad_request(INVALID_CODE)
    return row


def find_live_invite(s: Session, code: str) -> InviteCode:
    """The unexpired, unredeemed row behind `code`, or the generic 400. Spends nothing."""
    normalized = normalize_code(code)
    row = s.exec(select(InviteCode).where(InviteCode.code_hash == hash_code(normalized))).first() if normalized else None
    return _ensure_live(row)


def find_live_invite_by_id(s: Session, invite_id: int) -> InviteCode:
    """The same rule for a row already known by id — a passkey-only registration (E2)
    re-checks the invite its `RegistrationIntent` names at verify time, because the code may
    have been spent or may have expired between `options` and `verify`. Spends nothing."""
    return _ensure_live(s.get(InviteCode, int(invite_id)))


def spend_invite(s: Session, row: InviteCode, *, player_id: int) -> None:
    """Mark the code redeemed — a conditional UPDATE, so two requests racing for one code
    cannot both win: the loser finds no unredeemed row and gets the generic 400."""
    result = s.exec(
        update(InviteCode)
        .where(InviteCode.id == int(row.id), InviteCode.redeemed_at.is_(None))
        .values(redeemed_by=int(player_id), redeemed_at=_now())
    )
    if int(result.rowcount or 0) != 1:
        log.info("Invite refused: code %s was redeemed concurrently", row.id)
        bad_request(INVALID_CODE)


def redeem_invite(s: Session, *, code: str, player_id: int) -> Group:
    """An existing account joins the code's group as a member. 409 when already in it (the
    code is then left unspent). The caller commits."""
    row = find_live_invite(s, code)
    group = s.get(Group, int(row.group_id))
    if group is None:
        log.warning("Invite refused: code %s names group %s, which does not exist", row.id, row.group_id)
        bad_request(INVALID_CODE)
    if s.get(GroupMembership, (int(group.id), int(player_id))) is not None:
        conflict("You are already in this group")
    spend_invite(s, row, player_id=player_id)
    s.add(GroupMembership(group_id=int(group.id), player_id=int(player_id), role="member", created_at=_now()))
    s.flush()
    log.info("Invite %s redeemed: player %s joined group %s", row.id, player_id, group.slug)
    return group


def list_live_invites(s: Session, group_id: int) -> list[InviteCode]:
    """Unredeemed and unexpired, newest first. Never carries a code — there is none to carry."""
    rows = s.exec(
        select(InviteCode)
        .where(InviteCode.group_id == int(group_id), InviteCode.redeemed_at.is_(None), InviteCode.expires_at > _now())
        .order_by(InviteCode.created_at.desc(), InviteCode.id.desc())
    ).all()
    return list(rows)


def revoke_invite(s: Session, invite_id: int, group_id: int) -> bool:
    """Delete an invite of `group_id`. False when the id is not that group's (the router 404s)."""
    row = s.exec(select(InviteCode).where(InviteCode.id == int(invite_id), InviteCode.group_id == int(group_id))).first()
    if row is None:
        return False
    s.delete(row)
    return True
