"""A session — mint, resolve, touch, list, revoke — and the cookie that carries it (L2).

One row per logged-in device (`AuthSession`). The cookie holds a random token; the row
holds only its sha256, so a copy of the database logs nobody in. Revocation is `DELETE`.
The session is *rolling*: a request more than `TOUCH_INTERVAL` after the last one moves
`last_seen_at` and pushes `expires_at` out by the full TTL again — and only then, so SQLite
is not asked to write on every read. No cookie is ever set before an identity is proven,
which is what makes session fixation impossible rather than merely defended against.

`services/sessions.py` is the only module that spells the cookie's attributes; the auth
gate (`app/auth_gate.py`) is the only module that parses it.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from typing import TYPE_CHECKING

from fastapi import Response
from sqlmodel import Session, select

from ..models import Account, AuthSession, Passkey
from .account_email import email_status

if TYPE_CHECKING:
    from ..settings import Settings

SESSION_COOKIE = "lk_session"
DEFAULT_SESSION_TTL = dt.timedelta(days=90)
#: A session is touched (last_seen moved, expiry pushed out, cookie re-sent) at most this often.
TOUCH_INTERVAL = dt.timedelta(minutes=5)
#: What the row records about how the session was minted.
SESSION_KINDS: tuple[str, ...] = ("password", "passkey", "register", "reset", "exchange")


def _now() -> dt.datetime:
    """Naive UTC, like every `*_at` column in `models.py`. Tests monkeypatch this."""
    return dt.datetime.utcnow()


def new_token() -> str:
    """32 random bytes, base64url — the one time the clear token exists is on its way out."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def session_ttl(settings: Settings) -> dt.timedelta:
    return dt.timedelta(days=int(settings.session_ttl_days or 90))


def create_session(
    s: Session,
    *,
    player_id: int,
    kind: str,
    user_agent: str,
    ip: str,
    ttl: dt.timedelta = DEFAULT_SESSION_TTL,
    device_label: str = "",
) -> tuple[AuthSession, str]:
    """Mint a row and return it with the clear token — the only place the token is readable.

    The caller commits; this only adds and flushes so the row has its id."""
    if kind not in SESSION_KINDS:
        raise ValueError(f"unknown session kind: {kind!r}")
    token = new_token()
    now = _now()
    row = AuthSession(
        player_id=int(player_id),
        token_hash=hash_token(token),
        kind=kind,
        user_agent=str(user_agent or "")[:512],
        device_label=str(device_label or "")[:120],
        ip=str(ip or "")[:64],
        created_at=now,
        last_seen_at=now,
        expires_at=now + ttl,
    )
    s.add(row)
    s.flush()
    return row, token


def resolve_session(s: Session, token: str) -> AuthSession | None:
    """The unexpired row behind a clear token, or None. An expired row found here is
    deleted on the spot — it can never be used again, and the table stays small."""
    if not token:
        return None
    row = s.exec(select(AuthSession).where(AuthSession.token_hash == hash_token(token))).first()
    if row is None:
        return None
    if row.expires_at <= _now():
        s.delete(row)
        s.commit()
        return None
    return row


def touch_session(s: Session, row: AuthSession, now: dt.datetime, ttl: dt.timedelta = DEFAULT_SESSION_TTL) -> bool:
    """Move `last_seen_at` and push `expires_at` out, but only when the last touch is older
    than `TOUCH_INTERVAL`. Returns True when it wrote (the caller commits and re-sends the
    cookie), False when the row was left alone."""
    if now - row.last_seen_at < TOUCH_INTERVAL:
        return False
    row.last_seen_at = now
    row.expires_at = now + ttl
    s.add(row)
    return True


def list_sessions(s: Session, player_id: int) -> list[AuthSession]:
    """The player's live sessions, newest activity first."""
    now = _now()
    rows = s.exec(
        select(AuthSession)
        .where(AuthSession.player_id == int(player_id), AuthSession.expires_at > now)
        .order_by(AuthSession.last_seen_at.desc(), AuthSession.id.desc())
    ).all()
    return list(rows)


def revoke_session(s: Session, player_id: int, session_id: int) -> bool:
    """Delete one of the player's **own** sessions. The id is looked for in the player's
    list, never deleted directly — a bare delete would let anyone revoke anyone's device by
    guessing an id. Returns False when the id is not theirs (the router 404s)."""
    row = s.exec(
        select(AuthSession).where(AuthSession.id == int(session_id), AuthSession.player_id == int(player_id))
    ).first()
    if row is None:
        return False
    s.delete(row)
    return True


def revoke_all_sessions(s: Session, player_id: int, *, keep: int | None = None) -> int:
    """Delete every session of the player except `keep` (the current one). Returns the count."""
    rows = s.exec(select(AuthSession).where(AuthSession.player_id == int(player_id))).all()
    n = 0
    for row in rows:
        if keep is not None and int(row.id) == int(keep):
            continue
        s.delete(row)
        n += 1
    return n


# ---- the cookie -------------------------------------------------------------------------


def cookie_secure_for(settings: Settings, *, origin: str | None, scheme: str | None = None) -> bool:
    """Whether the cookie carries `Secure` — decided from configuration, not sniffed from a
    proxy header (FEATURES_2026-09-auth.md, disagreement 3).

    Pinned mode (production): the configured `auth_origin` is https, so always on. Dev-origin
    mode: follow the request's own `Origin` scheme; a request that carries none (a same-origin
    GET, curl) falls back to the scheme the server itself saw — `http` through vite, which is
    what lets `http://192.168.178.78:8000` on the phone keep working."""
    if not settings.auth_dev_origin:
        return str(settings.auth_origin or "").lower().startswith("https://")
    if origin:
        return str(origin).lower().startswith("https://")
    return str(scheme or "").lower() == "https"


def set_session_cookie(response: Response, token: str, *, secure: bool, max_age: int) -> None:
    """`Path=/; HttpOnly; SameSite=Lax; Max-Age=<ttl>` (+ `Secure`). Lax, not Strict: a
    shared link must not show a login to someone already logged in; Lax still refuses the
    cookie on a cross-site POST, which is the CSRF defence (every GET is side-effect free)."""
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=int(max_age),
        path="/",
        httponly=True,
        samesite="lax",
        secure=bool(secure),
    )


def clear_session_cookie(response: Response, *, secure: bool) -> None:
    """The same attributes with `Max-Age=0`, so the browser drops exactly the cookie we set."""
    response.delete_cookie(key=SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=bool(secure))


def session_cookie_header(token: str, *, secure: bool, max_age: int) -> tuple[bytes, bytes]:
    """The raw `set-cookie` header pair for a renewed session, built through
    `set_session_cookie` on a throwaway response so the attributes are spelled once. The
    auth gate appends it to `http.response.start` when it touched the session."""
    scratch = Response()
    set_session_cookie(scratch, token, secure=secure, max_age=max_age)
    for name, value in scratch.raw_headers:
        if name == b"set-cookie":
            return name, value
    raise RuntimeError("set_session_cookie produced no set-cookie header")  # pragma: no cover


# ---- what /me says ----------------------------------------------------------------------


def me_payload(s: Session, claims: dict, *, email_available: bool) -> dict:
    """`MeOut`: the claims plus the account facts the shell needs (`has_password`,
    `has_passkey`, `password_migrated`) and, since E1, whether the account can be recovered
    (`email`, `email_pending`, `email_verified`, `email_available`, `login_secure`). Login,
    exchange and `GET /me` all answer with this, so a fresh login and a reload describe the
    same person the same way — and the frontend reads these, never re-derives them.

    `email_available` is the caller's `request.app.state.mail.configured`: whether this
    server can send at all. `login_secure` is `has_passkey or password_origin == "set"` —
    a way in that is not the password `secrets.json` handed out (the 15-character floor
    ships with the first `set` password production will hold, so "set" implies ≥ 15)."""
    pid = int(claims["player_id"])
    account = s.get(Account, pid)
    has_passkey = s.exec(select(Passkey.id).where(Passkey.player_id == pid).limit(1)).first() is not None
    origin = account.password_origin if account is not None else "none"
    return {
        "role": claims.get("role"),
        "player_id": pid,
        "player_name": claims.get("player_name"),
        "site_admin": bool(claims.get("site_admin")),
        "groups": list(claims.get("groups") or []),
        "has_password": bool(account is not None and account.password_hash),
        "has_passkey": has_passkey,
        "password_migrated": origin == "migrated",
        "session_id": claims.get("session_id"),
        **email_status(s, pid),
        "email_available": bool(email_available),
        "login_secure": bool(has_passkey or origin == "set"),
    }
