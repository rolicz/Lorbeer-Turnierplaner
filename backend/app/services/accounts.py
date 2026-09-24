"""Accounts (L3): who may take which name, registering by invite, and the password.

Display names are the login identifier, **unique app-wide, case-insensitively**, with the
original casing kept for display ("Flo" displays, "flo" logs in). `Account.name_key` holds
the casefolded name under a unique index; `ensure_name_free` is the one check every path
that writes a display name goes through (register, the admin's `POST /players` and
`PATCH /players/{id}`), so two players whose names differ only in case can never be
written — which matters beyond tidiness, because the boot migration refuses to boot a
database that holds such a pair.

An account and its player are **always written in one transaction**: a `Player` committed
without its `Account` would be swept into the default group by the next boot's migration.

The rule for the password is "always retain at least one way in": a password can be
removed only when a passkey exists (L8 writes those rows).
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import TYPE_CHECKING

from argon2 import PasswordHasher
from sqlmodel import Session, select

from ..api_utils import bad_request, conflict, forbidden
from ..models import Account, AuthSession, GroupMembership, Passkey, Player, RegistrationIntent
from .auth_migration import name_key, new_webauthn_user_handle
from .invites import find_live_invite, find_live_invite_by_id, spend_invite
from .passkeys import store_passkey
from .passwords import hash_password, validate_new_password, verify_password

if TYPE_CHECKING:
    from webauthn.helpers.structs import RegistrationCredential
    from webauthn.registration.verify_registration_response import VerifiedRegistration

log = logging.getLogger(__name__)

MIN_NAME_LENGTH = 2
MAX_NAME_LENGTH = 40
NAME_TAKEN = "That name is taken"
WRONG_CURRENT_PASSWORD = "The current password is wrong"

__all__ = [
    "NAME_TAKEN",
    "change_password",
    "create_account_for",
    "ensure_name_free",
    "find_account_by_name",
    "has_passkey",
    "live_session_stats",
    "name_key",
    "register",
    "register_with_passkey",
    "remove_password",
    "session_out",
    "set_password",
    "validate_display_name",
]


def _now() -> dt.datetime:
    return dt.datetime.utcnow()


def find_account_by_name(s: Session, name: str) -> Account | None:
    """The account whose login name is `name`, compared case-insensitively."""
    key = name_key(name)
    if not key:
        return None
    return s.exec(select(Account).where(Account.name_key == key)).first()


def ensure_name_free(s: Session, name: str, *, except_player_id: int | None = None) -> None:
    """409 "That name is taken" when any account **or** any player (an old-code row that
    has no account yet) already answers to `name` case-insensitively."""
    key = name_key(name)
    account = find_account_by_name(s, name)
    if account is not None and (except_player_id is None or int(account.player_id) != int(except_player_id)):
        conflict(NAME_TAKEN)
    for pid, display in s.exec(select(Player.id, Player.display_name)).all():
        if except_player_id is not None and int(pid) == int(except_player_id):
            continue
        if name_key(display) == key:
            conflict(NAME_TAKEN)


def validate_display_name(raw: str | None) -> str:
    """Stripped, 2–40 characters; 400 otherwise. Returns the cleaned name."""
    name = str(raw or "").strip()
    if len(name) < MIN_NAME_LENGTH or len(name) > MAX_NAME_LENGTH:
        bad_request(f"The name must be {MIN_NAME_LENGTH} to {MAX_NAME_LENGTH} characters long")
    return name


def create_account_for(
    s: Session,
    player: Player,
    *,
    password_hash: str | None = None,
    password_origin: str = "none",
    site_admin: bool = False,
    user_handle: str | None = None,
) -> Account:
    """The account row of a player that is being created in the same transaction. Flushes.

    `user_handle`: the WebAuthn user handle to store — a passkey-only registration (E2)
    minted it before the account existed, because the authenticator already holds it;
    `None` mints a fresh one, as before."""
    now = _now()
    account = Account(
        player_id=int(player.id),
        name_key=name_key(player.display_name),
        password_hash=password_hash,
        password_origin=password_origin,
        password_updated_at=now if password_hash else None,
        site_admin=bool(site_admin),
        webauthn_user_handle=str(user_handle) if user_handle else new_webauthn_user_handle(),
        created_at=now,
        updated_at=now,
    )
    s.add(account)
    s.flush()
    return account


def register(s: Session, *, code: str, display_name: str, password: str, hasher: PasswordHasher) -> Player:
    """Redeem an invite as a new account: `Player` + `Account(password_origin="set")` +
    `GroupMembership(member)` in the code's group, and the code spent — one transaction,
    which the caller commits (together with the session it mints).

    The code is checked **first**, so somebody without a valid code learns nothing — not
    even whether a name is taken — and a refusal after that (name taken, password too
    short) leaves the code unspent."""
    invite = find_live_invite(s, code)
    name = validate_display_name(display_name)
    ensure_name_free(s, name)
    validate_new_password(password)

    player = Player(display_name=name)
    s.add(player)
    s.flush()
    create_account_for(s, player, password_hash=hash_password(hasher, password), password_origin="set")
    spend_invite(s, invite, player_id=int(player.id))
    s.add(GroupMembership(group_id=int(invite.group_id), player_id=int(player.id), role="member", created_at=_now()))
    s.flush()
    log.info("Registered player %r (id=%s) with invite %s", name, player.id, invite.id)
    return player


def register_with_passkey(
    s: Session,
    *,
    intent: RegistrationIntent,
    parsed: RegistrationCredential,
    verified: VerifiedRegistration,
    label: str,
    user_agent_label: str,
) -> Player:
    """A new account from a **verified** passkey ceremony (E2): `Player` + `Account` with
    no password and the intent's user handle + the `Passkey` + `GroupMembership(member)`
    in the invite's group, and the code spent — one transaction, which the caller commits
    together with the session it mints. **Nothing here commits**: any refusal or crash
    before the caller's commit rolls the whole account back, so an account can never exist
    without its way in.

    What was checked at `options` is checked again here from the *intent* — never from the
    client: the invite by its id (spent or expired meanwhile → the generic 400), the name
    (taken meanwhile → 409). The spend is `spend_invite`'s conditional UPDATE, so two
    ceremonies racing for one code cannot both win."""
    invite = find_live_invite_by_id(s, int(intent.invite_id))
    name = validate_display_name(intent.display_name)
    ensure_name_free(s, name)

    player = Player(display_name=name)
    s.add(player)
    s.flush()
    account = create_account_for(s, player, password_hash=None, password_origin="none", user_handle=intent.user_handle)
    passkey = store_passkey(s, account, parsed, verified, label=label, user_agent_label=user_agent_label)
    spend_invite(s, invite, player_id=int(player.id))
    s.add(GroupMembership(group_id=int(invite.group_id), player_id=int(player.id), role="member", created_at=_now()))
    s.flush()
    log.info(
        "Registered player %r (id=%s) with invite %s by passkey (%s, backed_up=%s)",
        name,
        player.id,
        invite.id,
        passkey.device_type,
        passkey.backed_up,
    )
    return player


def set_password(s: Session, account: Account, plain: str, hasher: PasswordHasher, *, origin: str = "set") -> None:
    """Validate (`validate_new_password`: at least 15 and at most 200 characters) and store
    an argon2id hash. The caller commits."""
    validate_new_password(plain)
    now = _now()
    account.password_hash = hash_password(hasher, plain)
    account.password_origin = origin
    account.password_updated_at = now
    account.updated_at = now
    s.add(account)


def change_password(s: Session, account: Account, current: str | None, new: str, hasher: PasswordHasher) -> None:
    """With a password on the account the current one must be given and right (403 on a
    wrong one); an account without one (reset pending, passkey only) sets its first."""
    if account.password_hash:
        ok, _ = verify_password(hasher, account.password_hash, str(current or ""))
        if not ok:
            forbidden(WRONG_CURRENT_PASSWORD)
    set_password(s, account, new, hasher, origin="set")


def has_passkey(s: Session, player_id: int) -> bool:
    return s.exec(select(Passkey.id).where(Passkey.player_id == int(player_id)).limit(1)).first() is not None


def remove_password(s: Session, account: Account) -> None:
    """Drop the password — only when a passkey remains, so the account keeps a way in (409)."""
    if not account.password_hash:
        conflict("There is no password to remove")
    if not has_passkey(s, int(account.player_id)):
        conflict("Add a passkey before removing the password — an account needs one way in")
    now = _now()
    account.password_hash = None
    account.password_origin = "none"
    account.password_updated_at = now
    account.updated_at = now
    s.add(account)


def live_session_stats(s: Session) -> dict[int, tuple[int, dt.datetime | None]]:
    """player_id → (live session count, latest `last_seen_at`) — one query for the admin list."""
    stats: dict[int, tuple[int, dt.datetime | None]] = {}
    for pid, last_seen in s.exec(select(AuthSession.player_id, AuthSession.last_seen_at).where(AuthSession.expires_at > _now())).all():
        count, latest = stats.get(int(pid), (0, None))
        stats[int(pid)] = (count + 1, last_seen if latest is None or last_seen > latest else latest)
    return stats


def session_out(row: AuthSession, current_id: int | None) -> dict:
    """`SessionOut` for one row — the caller's own list and the admin's list alike.
    `current` marks the session the request itself arrived on."""
    return {
        "id": int(row.id),
        "kind": row.kind,
        "device_label": row.device_label or "",
        "created_at": row.created_at,
        "last_seen_at": row.last_seen_at,
        "current": current_id is not None and int(row.id) == int(current_id),
    }
