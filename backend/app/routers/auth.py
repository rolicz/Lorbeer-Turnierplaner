"""The login surface (L2): password login, logout, the legacy-token exchange, my sessions.

Thin: the rules live in `services/sessions.py` (the row and the cookie),
`services/rate_limit.py` (slowing an attacker down), `services/groups.py` (what the session
means) and `services/passwords.py` (argon2id). L3 adds register / redeem / reset / password
here; L8 adds the passkey ceremonies.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlmodel import Session, select

from ..auth import require_auth_claims
from ..db import get_session
from ..models import Account, Player
from ..schemas import LoginBody, LogoutBody
from ..schemas.responses import MeOut, OkResponse, RevokedOut, SessionOut
from ..services.auth_migration import name_key
from ..services.groups import build_claims
from ..services.legacy_jwt import claims_from_legacy_token
from ..services.notifications import disable_push_subscription
from ..services.passwords import hash_password, hasher_for, verify_password
from ..services.rate_limit import enforce, limits_for, record_failure, record_success
from ..services.sessions import (
    clear_session_cookie,
    cookie_secure_for,
    create_session,
    list_sessions,
    me_payload,
    revoke_all_sessions,
    revoke_session,
    session_ttl,
    set_session_cookie,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

WRONG_LOGIN = "Wrong username or password"

#: A hash to verify against when the name is unknown or the account has no password, so
#: an unknown name costs the same argon2 time as a wrong password — no timing oracle on
#: whether a name exists. Built once per hasher, lazily.
_DUMMY_HASHES: dict[int, str] = {}


def _dummy_hash(ph) -> str:
    key = id(ph)
    if key not in _DUMMY_HASHES:
        _DUMMY_HASHES[key] = hash_password(ph, "not-a-real-password")
    return _DUMMY_HASHES[key]


def _cookie_secure(request: Request) -> bool:
    return cookie_secure_for(request.app.state.settings, origin=request.headers.get("origin"), scheme=request.url.scheme)


def _start_session(request: Request, response: Response, s: Session, *, player: Player, kind: str) -> dict:
    """Mint the session, set the cookie, answer `MeOut`. One path for every way in.

    A live session the request already carries is revoked first: the browser is about to
    overwrite that cookie, so its row could never be used again and would only sit in the
    device list for 90 days."""
    settings = request.app.state.settings
    old = getattr(request.state, "claims", None)
    if old and old.get("session_id") is not None:
        revoke_session(s, int(old["player_id"]), int(old["session_id"]))

    ttl = session_ttl(settings)
    row, token = create_session(
        s,
        player_id=int(player.id),
        kind=kind,
        user_agent=request.headers.get("user-agent", ""),
        ip=str(getattr(request.state, "client_ip", "") or ""),
        ttl=ttl,
    )
    s.commit()
    claims = build_claims(s, player_id=int(player.id), session_id=int(row.id))
    if claims is None:  # the account vanished between the check and the mint — not a login
        raise HTTPException(status_code=401, detail=WRONG_LOGIN)
    set_session_cookie(response, token, secure=_cookie_secure(request), max_age=int(ttl.total_seconds()))
    return me_payload(s, claims)


@router.post("/login", response_model=MeOut)
def login(request: Request, response: Response, body: LoginBody, s: Session = Depends(get_session)) -> dict:
    settings = request.app.state.settings
    username = str(body.username or "").strip()
    password = str(body.password or "")
    key = name_key(username)

    limits = limits_for("login", ip=str(getattr(request.state, "client_ip", "") or ""), account=key or None)
    enforce(request, limits)

    ph = hasher_for(settings.password_hash_profile)
    account = s.exec(select(Account).where(Account.name_key == key)).first() if key else None
    if account is None or not account.password_hash:
        # Same work as a real check, same answer: a wrong name and a wrong password are one 401.
        verify_password(ph, _dummy_hash(ph), password)
        ok, needs_rehash = False, False
    else:
        ok, needs_rehash = verify_password(ph, account.password_hash, password)

    if not ok:
        record_failure(request, limits)
        log.info("Login refused for %r from %s", username, getattr(request.state, "client_ip", "?"))
        raise HTTPException(status_code=401, detail=WRONG_LOGIN)

    record_success(request, limits)
    if needs_rehash:
        account.password_hash = hash_password(ph, password)
        s.add(account)

    player = s.get(Player, int(account.player_id))
    if player is None:
        raise HTTPException(status_code=401, detail=WRONG_LOGIN)
    return _start_session(request, response, s, player=player, kind="password")


@router.post("/logout", response_model=OkResponse)
def logout(
    request: Request,
    response: Response,
    body: LogoutBody | None = None,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """End this device's session. With `push_endpoint`, also disable that device's push
    subscription in the same request, so no client-side hook has to race the session's end."""
    pid = int(claims["player_id"])
    if claims.get("session_id") is not None:
        revoke_session(s, pid, int(claims["session_id"]))
    endpoint = str((body.push_endpoint if body else "") or "").strip()
    if endpoint:
        disable_push_subscription(s, player_id=pid, endpoint=endpoint)
    s.commit()
    clear_session_cookie(response, secure=_cookie_secure(request))
    return {"ok": True}


@router.post("/exchange", response_model=MeOut)
def exchange(request: Request, response: Response, s: Session = Depends(get_session)) -> dict:
    """Trade the pre-batch JWT (`Authorization: Bearer <token>`) for one cookie session.

    This is what keeps "nobody is logged out by the deploy" true: the first boot of the new
    frontend finds the old token in `localStorage` and comes here. Answers **410** once
    `jwt_secret` is empty — the day a later batch retires the legacy login for good."""
    settings = request.app.state.settings
    if not settings.jwt_secret:
        raise HTTPException(status_code=410, detail="The old login has been retired — log in again")

    auth = str(request.headers.get("authorization") or "")
    token = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    limits = limits_for("login", ip=str(getattr(request.state, "client_ip", "") or ""))
    enforce(request, limits)

    legacy = claims_from_legacy_token(settings.jwt_secret, token)
    account = s.get(Account, int(legacy["player_id"])) if legacy else None
    player = s.get(Player, int(account.player_id)) if account else None
    if legacy is None or account is None or player is None:
        record_failure(request, limits)
        raise HTTPException(status_code=401, detail="Invalid token")

    record_success(request, limits)
    return _start_session(request, response, s, player=player, kind="exchange")


# ---- my sessions -----------------------------------------------------------------------


def _session_out(row, current_id: int | None) -> dict:
    return {
        "id": int(row.id),
        "kind": row.kind,
        "device_label": row.device_label or "",
        "created_at": row.created_at,
        "last_seen_at": row.last_seen_at,
        "current": current_id is not None and int(row.id) == int(current_id),
    }


@router.get("/sessions", response_model=list[SessionOut])
def my_sessions(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> list[dict]:
    """The caller's own live sessions, newest activity first."""
    current = claims.get("session_id")
    return [_session_out(row, current) for row in list_sessions(s, int(claims["player_id"]))]


@router.delete("/sessions/{session_id}", response_model=OkResponse)
def revoke_my_session(
    session_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Sign one of my devices out. An id that is not mine is a 404, not a 403 — there is
    nothing to learn about other people's sessions here."""
    if not revoke_session(s, int(claims["player_id"]), int(session_id)):
        raise HTTPException(status_code=404, detail="Session not found")
    s.commit()
    return {"ok": True}


@router.post("/sessions/revoke-others", response_model=RevokedOut)
def revoke_my_other_sessions(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """Sign every other device out; this one stays."""
    keep = claims.get("session_id")
    revoked = revoke_all_sessions(s, int(claims["player_id"]), keep=int(keep) if keep is not None else None)
    s.commit()
    return {"revoked": revoked}
