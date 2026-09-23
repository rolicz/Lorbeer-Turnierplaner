"""Passkeys (L8): the two WebAuthn ceremonies, server side, over `webauthn` 2.7.1.

Four rules, each in exactly one place here:

- **The relying party is decided once**, in `relying_party_for`. Pinned in production
  (`Settings.auth_origin` / `auth_rp_id`), where a request whose `Origin` disagrees is
  refused; derived from the request's own `Origin` — never `Host`, which vite rewrites —
  only under `auth_dev_origin`, and even then `http` is admitted for `localhost` and
  `127.0.0.1` alone (the only plain-http secure contexts a browser knows). There is no
  bypass flag of any kind; the boot guard in `settings.py` refuses the dev flag in production.
- **A challenge is server-minted, single-use and consumed by `DELETE` before it is
  verified** (`_take_challenge`): a replayed or reused challenge fails by not existing,
  and two requests racing for one row cannot both win, because the delete is conditional
  and SQLite serialises writers. An expired row is refused the same way.
- **Sign-in asks for no identifier and sends no `allowCredentials`** — discoverable
  credentials only, which is why registration requires a resident key. The server learns
  who is signing in from the credential the authenticator chose, never from the client's
  claim, and every refusal on the sign-in pair is the caller's one generic answer.
- **Revocation is by ownership**: `remove_passkey` looks the id up among the caller's own
  rows and 404s otherwise. Removing a passkey ends **every** session of that player, and
  "always keep one way in" is enforced on both sides — the last passkey cannot go while
  there is no password (here), and the password cannot go while there is no passkey
  (`accounts.remove_password`).

Nothing here parses the cookie or mints a session; the router hands the verified account
to the sessions service like any other way in.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from sqlalchemy import delete
from sqlmodel import Session, select
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import (
    base64url_to_bytes,
    bytes_to_base64url,
    options_to_json_dict,
    parse_authentication_credential_json,
    parse_client_data_json,
    parse_registration_credential_json,
)
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ..models import Account, Passkey, Player, WebAuthnChallenge
from .sessions import revoke_all_sessions

if TYPE_CHECKING:
    from ..settings import Settings

log = logging.getLogger(__name__)

#: How long a minted challenge may be answered.
CHALLENGE_TTL = dt.timedelta(minutes=5)
MAX_LABEL_LENGTH = 60
#: `http` origins a browser treats as a secure context — the only ones dev-origin mode admits.
_PLAIN_HTTP_HOSTS = ("localhost", "127.0.0.1")

__all__ = [
    "CHALLENGE_TTL",
    "PasskeyConflict",
    "PasskeyRefused",
    "RelyingParty",
    "authentication_options",
    "list_passkeys",
    "passkey_out",
    "registration_options",
    "relying_party_for",
    "remove_passkey",
    "sweep_expired_challenges",
    "verify_authentication",
    "verify_registration",
]


class PasskeyRefused(Exception):
    """A ceremony that did not verify. `reason` is for the server log **only**; the router
    answers its own generic message — the reason is an oracle, the log is not."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class PasskeyConflict(Exception):
    """A credential id that is already registered (409)."""


@dataclass(frozen=True)
class RelyingParty:
    rp_id: str
    origin: str
    rp_name: str


def _now() -> dt.datetime:
    """Naive UTC, like every `*_at` column. Tests monkeypatch this."""
    return dt.datetime.utcnow()


# ---- the relying party ---------------------------------------------------------------------


def _normalise_origin(raw: str | None) -> str | None:
    """`scheme://host[:port]`, lowercased, or None for anything that is not an origin
    (missing, `null`, a path, a userinfo, an unknown scheme)."""
    value = str(raw or "").strip().rstrip("/")
    if not value or value.lower() == "null":
        return None
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return None
    if parts.path or parts.query or parts.fragment or parts.username or parts.password:
        return None
    try:
        port = parts.port
    except ValueError:
        return None
    host = parts.hostname.lower()
    return f"{parts.scheme.lower()}://{host}" + (f":{port}" if port is not None else "")


def relying_party_for(settings: Settings, *, origin: str | None) -> RelyingParty | None:
    """The one place the rpID and the expected origin are decided.

    Pinned mode (production): the configured pair — when the request carries an `Origin`
    it must equal the configured one, else None. Dev-origin mode: the request's own
    `Origin`, `https` on any host or `http` on `localhost` / `127.0.0.1` only; anything
    else (a LAN address over plain http, no header at all) is None. None means the router
    refuses; it never falls back to a guess."""
    if not settings.auth_dev_origin:
        pinned = _normalise_origin(settings.auth_origin)
        if pinned is None:
            return None
        if origin is not None and _normalise_origin(origin) != pinned:
            return None
        return RelyingParty(rp_id=str(settings.auth_rp_id), origin=pinned, rp_name=str(settings.auth_rp_name))

    derived = _normalise_origin(origin)
    if derived is None:
        return None
    parts = urlsplit(derived)
    host = str(parts.hostname)
    if parts.scheme == "http" and host not in _PLAIN_HTTP_HOSTS:
        return None
    return RelyingParty(rp_id=host, origin=derived, rp_name=str(settings.auth_rp_name))


# ---- challenges ----------------------------------------------------------------------------


def _mint_challenge(s: Session, *, challenge: bytes, kind: str, player_id: int | None) -> None:
    now = _now()
    s.add(
        WebAuthnChallenge(
            challenge=bytes_to_base64url(challenge),
            kind=kind,
            player_id=player_id,
            expires_at=now + CHALLENGE_TTL,
            created_at=now,
        )
    )
    s.commit()


def _take_challenge(s: Session, *, challenge: bytes, kind: str, player_id: int | None) -> None:
    """Consume the challenge — **delete it and commit before anything is verified** — or
    refuse. The delete is conditional on the row still being there, so two requests
    presenting the same challenge cannot both pass; an expired row, a row of the other
    ceremony, or a registration challenge minted for another account is refused *and*
    consumed, so it cannot be tried again either."""
    key = bytes_to_base64url(challenge)
    row = s.exec(select(WebAuthnChallenge).where(WebAuthnChallenge.challenge == key)).first()
    if row is None:
        raise PasskeyRefused("challenge unknown or already used")
    stale = row.expires_at <= _now()
    wrong_kind = row.kind != kind
    wrong_owner = kind == "register" and (player_id is None or row.player_id != int(player_id))
    result = s.exec(delete(WebAuthnChallenge).where(WebAuthnChallenge.id == int(row.id)))
    s.commit()
    if int(getattr(result, "rowcount", 0) or 0) != 1:
        raise PasskeyRefused("challenge consumed by a concurrent request")
    if stale:
        raise PasskeyRefused("challenge expired")
    if wrong_kind:
        raise PasskeyRefused(f"challenge is a {row.kind} challenge, not {kind}")
    if wrong_owner:
        raise PasskeyRefused("registration challenge belongs to another account")


def sweep_expired_challenges(s: Session) -> int:
    """Drop every challenge past its expiry. Called from the options endpoints — cheap, and
    it keeps the table the size of the last five minutes."""
    result = s.exec(delete(WebAuthnChallenge).where(WebAuthnChallenge.expires_at <= _now()))
    s.commit()
    return int(getattr(result, "rowcount", 0) or 0)


# ---- registration --------------------------------------------------------------------------


def _user_handle_bytes(account: Account) -> bytes:
    return base64url_to_bytes(str(account.webauthn_user_handle))


def registration_options(s: Session, account: Account, player: Player, rp: RelyingParty) -> dict[str, Any]:
    """Mint a registration challenge and answer the options JSON for
    `navigator.credentials.create()`: a resident key and user verification **required**
    (discoverable, Face ID / PIN enforced at verification too), the account's own random
    user handle as `user.id`, and the player's existing credentials excluded."""
    existing = list_passkeys(s, int(account.player_id))
    options = generate_registration_options(
        rp_id=rp.rp_id,
        rp_name=rp.rp_name,
        user_id=_user_handle_bytes(account),
        user_name=str(player.display_name),
        user_display_name=str(player.display_name),
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(row.credential_id), transports=_transports(row)) for row in existing
        ],
    )
    _mint_challenge(s, challenge=options.challenge, kind="register", player_id=int(account.player_id))
    return options_to_json_dict(options)


def _transports(row: Passkey) -> list[AuthenticatorTransport] | None:
    """The stored transports as the library's enum, for `excludeCredentials`; unknown
    values are dropped, an empty list becomes None (the JSON then omits the key)."""
    try:
        raw = json.loads(row.transports or "[]")
    except ValueError:
        return None
    out = []
    for value in raw if isinstance(raw, list) else []:
        try:
            out.append(AuthenticatorTransport(str(value)))
        except ValueError:
            continue
    return out or None


def verify_registration(s: Session, account: Account, rp: RelyingParty, credential: Any, *, label: str, user_agent_label: str) -> Passkey:
    """Verify the browser's `create()` answer and store the credential.

    Order matters: the challenge is taken (deleted, committed) **before** the library
    verifies anything; a credential id that is already stored is a `PasskeyConflict`
    (409); every other failure is `PasskeyRefused` with the reason for the log."""
    try:
        parsed = parse_registration_credential_json(credential)
        client_data = parse_client_data_json(parsed.response.client_data_json)
    except (WebAuthnException, ValueError, TypeError) as exc:
        raise PasskeyRefused(f"malformed registration credential: {exc}") from exc

    _take_challenge(s, challenge=client_data.challenge, kind="register", player_id=int(account.player_id))

    try:
        verified = verify_registration_response(
            credential=parsed,
            expected_challenge=client_data.challenge,
            expected_origin=rp.origin,
            expected_rp_id=rp.rp_id,
            require_user_verification=True,
        )
    except WebAuthnException as exc:
        raise PasskeyRefused(f"registration did not verify: {exc}") from exc

    credential_id = bytes_to_base64url(verified.credential_id)
    if s.exec(select(Passkey.id).where(Passkey.credential_id == credential_id)).first() is not None:
        raise PasskeyConflict()

    clean_label = str(label or "").strip()[:MAX_LABEL_LENGTH] or str(user_agent_label or "").strip()[:MAX_LABEL_LENGTH] or "Passkey"
    row = Passkey(
        player_id=int(account.player_id),
        credential_id=credential_id,
        public_key=bytes_to_base64url(verified.credential_public_key),
        sign_count=int(verified.sign_count),
        transports=json.dumps([t.value for t in (parsed.response.transports or [])]),
        aaguid=str(verified.aaguid),
        device_type=str(verified.credential_device_type.value),
        backed_up=bool(verified.credential_backed_up),
        label=clean_label,
        created_at=_now(),
    )
    s.add(row)
    s.commit()
    s.refresh(row)
    log.info("Passkey %s registered for player %s (%s, backed_up=%s)", row.id, account.player_id, row.device_type, row.backed_up)
    return row


# ---- sign-in -------------------------------------------------------------------------------


def authentication_options(s: Session, rp: RelyingParty) -> dict[str, Any]:
    """Mint a sign-in challenge and answer the options JSON for `navigator.credentials.get()`.
    **No `allowCredentials`** — the authenticator offers its discoverable credentials for
    this rpID and the server learns nothing about who is asking."""
    options = generate_authentication_options(rp_id=rp.rp_id, user_verification=UserVerificationRequirement.REQUIRED)
    _mint_challenge(s, challenge=options.challenge, kind="login", player_id=None)
    payload = options_to_json_dict(options)
    # The library spells "none" as an empty list; the wire says nothing at all, so a reader
    # of the JSON (or of a network trace) cannot mistake it for a list that was filtered.
    if not payload.get("allowCredentials"):
        payload.pop("allowCredentials", None)
    return payload


def verify_authentication(s: Session, rp: RelyingParty, credential: Any) -> tuple[Account, Passkey]:
    """Verify the browser's `get()` answer: the challenge taken first, the credential found
    by the assertion's own `rawId` (an unknown one is refused like any other failure), the
    signature, origin, rpID hash, user-verified flag and the counter checked by the
    library, the returned user handle checked against the account's, and the counter and
    `last_used_at` stored. Every refusal is `PasskeyRefused` — the router says one thing."""
    try:
        parsed = parse_authentication_credential_json(credential)
        client_data = parse_client_data_json(parsed.response.client_data_json)
    except (WebAuthnException, ValueError, TypeError) as exc:
        raise PasskeyRefused(f"malformed assertion: {exc}") from exc

    _take_challenge(s, challenge=client_data.challenge, kind="login", player_id=None)

    credential_id = bytes_to_base64url(parsed.raw_id)
    row = s.exec(select(Passkey).where(Passkey.credential_id == credential_id)).first()
    if row is None:
        raise PasskeyRefused("unknown credential")
    account = s.get(Account, int(row.player_id))
    if account is None:
        raise PasskeyRefused("credential has no account")

    try:
        verified = verify_authentication_response(
            credential=parsed,
            expected_challenge=client_data.challenge,
            expected_origin=rp.origin,
            expected_rp_id=rp.rp_id,
            credential_public_key=base64url_to_bytes(row.public_key),
            credential_current_sign_count=int(row.sign_count),
            require_user_verification=True,
        )
    except WebAuthnException as exc:
        reason = str(exc)
        if "sign count" in reason:
            reason = f"{reason} — clone?"
        raise PasskeyRefused(f"assertion did not verify: {reason}") from exc

    handle = parsed.response.user_handle
    if handle is not None and handle != _user_handle_bytes(account):
        raise PasskeyRefused("user handle does not match the credential's account")

    row.sign_count = int(verified.new_sign_count)
    row.backed_up = bool(verified.credential_backed_up)
    row.last_used_at = _now()
    s.add(row)
    s.commit()
    s.refresh(row)
    return account, row


# ---- my passkeys ---------------------------------------------------------------------------


def list_passkeys(s: Session, player_id: int) -> list[Passkey]:
    return list(s.exec(select(Passkey).where(Passkey.player_id == int(player_id)).order_by(Passkey.created_at.asc(), Passkey.id.asc())).all())


def remove_passkey(s: Session, account: Account, passkey_id: int) -> bool:
    """Delete one of the caller's **own** passkeys and end every session of that player.

    Ownership by listing: the id is looked for among the caller's rows, never deleted by
    itself — returns False when it is not theirs (the router 404s). Refused with a
    `PasskeyConflict` when it is the last passkey and the account has no password: an
    account always keeps one way in. The caller commits and clears its own cookie."""
    mine = list_passkeys(s, int(account.player_id))
    row = next((p for p in mine if int(p.id) == int(passkey_id)), None)
    if row is None:
        return False
    if len(mine) == 1 and not account.password_hash:
        raise PasskeyConflict()
    s.delete(row)
    revoked = revoke_all_sessions(s, int(account.player_id), keep=None)
    log.info("Passkey %s removed for player %s; %s session(s) ended", passkey_id, account.player_id, revoked)
    return True


def passkey_out(row: Passkey) -> dict:
    """`PasskeyOut` for one row."""
    return {
        "id": int(row.id),
        "label": row.label or "",
        "device_type": row.device_type or "",
        "backed_up": bool(row.backed_up),
        "created_at": row.created_at,
        "last_used_at": row.last_used_at,
    }
