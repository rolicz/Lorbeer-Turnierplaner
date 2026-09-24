"""The gate (L2): a pure-ASGI middleware that denies by default.

Every `http` and `websocket` scope passes through here before routing. The gate reads the
session cookie — **nothing else in the app parses it** — resolves the row, the account, the
memberships and the current group, and writes `scope["state"]["claims"]` (see
`services/groups.py::build_claims`) for `app/auth.py::require_auth_claims` to read. Then it
decides by path, longest match first:

- `LOOPBACK_ONLY_PATHS` — answered only to a loopback peer (Docker's healthcheck calls
  `/health` from inside the container; Caddy's forwarded request is not loopback), else 401.
- `PUBLIC_PATHS` — no session needed (login, the exchange, register, reset, passkey sign-in,
  opening an email verification link).
- `ACCOUNT_PATHS` — a session, no membership needed (logout, my sessions, my password, my
  passkeys, redeem a code, this device's push).
- **everything else** — a session *and* a membership in the current group: 401 with no
  session, 403 with one and no membership. Unknown paths included, so a stranger cannot
  tell a route from a 404.

`tests/test_auth_gate.py` walks `app.routes` and asserts every route × method lands in one
of those four classes with the expected answer — a route added next year is gated by
construction and *listed* only by editing a tuple the test walks.

The three tuples: an entry ending in `/` is a prefix, any other entry is an exact path.
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlmodel import Session
from starlette.concurrency import run_in_threadpool
from starlette.requests import cookie_parser
from starlette.responses import JSONResponse, Response

from .db import get_engine
from .services import sessions as sessions_service
from .services.groups import build_claims
from .services.sessions import (
    SESSION_COOKIE,
    clear_session_cookie,
    cookie_secure_for,
    resolve_session,
    session_cookie_header,
    session_ttl,
    touch_session,
)

log = logging.getLogger(__name__)

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]

#: Answered only when the socket peer is loopback. Docker's healthcheck, and the API docs
#: through vite's proxy in dev (which connects from 127.0.0.1).
LOOPBACK_ONLY_PATHS: tuple[str, ...] = ("/health", "/docs", "/docs/oauth2-redirect", "/openapi.json", "/redoc")
#: No session needed. Only paths that exist may be listed (the audit test asserts it) — a
#: new `/auth/…` route is an account path (session required) by construction until it is
#: named here. The passkey sign-in pair (L8) is public because it *is* a way in; the
#: register pair and `/auth/passkeys` are account paths, reached with a session.
#: `/auth/redeem` is deliberately *not* here: redeeming a code as an existing account needs
#: that account's session (a stranger registers instead).
PUBLIC_PATHS: tuple[str, ...] = (
    "/auth/login",
    "/auth/exchange",
    "/auth/register",
    "/auth/reset",
    "/auth/passkeys/login/options",
    "/auth/passkeys/login/verify",
    # E1: the link from a verification mail opens in a browser with no session.
    "/auth/email/verify",
    # E2: asking for a recovery link, and the two ceremonies that hold a token or an invite
    # code instead of a session — a passkey from a reset link, a passkey-only registration.
    "/auth/recover",
    "/auth/reset/passkey/options",
    "/auth/reset/passkey/verify",
    "/auth/register/passkey/options",
    "/auth/register/passkey/verify",
)
#: A session, no membership needed.
ACCOUNT_PATHS: tuple[str, ...] = ("/auth/", "/me", "/me/notifications", "/push/")

#: The gate's own refusals, spelled once so the audit test can tell them from a route's.
NOT_LOGGED_IN = "Not logged in"
NOT_A_MEMBER = "Not a member of this group"

_COOKIE_PREFIX = f"{SESSION_COOKIE}=".encode("latin-1")

CLASS_LOOPBACK = "loopback"
CLASS_PUBLIC = "public"
CLASS_ACCOUNT = "account"
CLASS_MEMBER = "member"


def _matches(path: str, entries: tuple[str, ...]) -> bool:
    for entry in entries:
        if entry.endswith("/"):
            if path.startswith(entry):
                return True
        elif path == entry:
            return True
    return False


def classify(path: str) -> str:
    """Which of the four classes a path falls in. Exact entries beat prefixes, so
    `/auth/login` is public although `/auth/` is an account prefix."""
    if _matches(path, LOOPBACK_ONLY_PATHS):
        return CLASS_LOOPBACK
    if _matches(path, PUBLIC_PATHS):
        return CLASS_PUBLIC
    if _matches(path, ACCOUNT_PATHS):
        return CLASS_ACCOUNT
    return CLASS_MEMBER


def _peer_host(scope: Scope) -> str | None:
    client = scope.get("client")
    if not client:
        return None
    return str(client[0] or "") or None


def is_loopback(scope: Scope) -> bool:
    """Is the socket peer 127.0.0.0/8 or ::1? A missing peer is *not* loopback."""
    host = _peer_host(scope)
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or ():
        if key == name:
            return value.decode("latin-1")
    return None


def client_ip(scope: Scope, hops: int) -> str:
    """The client's address behind `hops` trusted reverse proxies.

    `X-Forwarded-For` is read from the **right**: with `hops` proxies in front, the entry
    `hops` from the end is the one the outermost trusted proxy observed and wrote itself;
    everything left of it is client-supplied and forgeable. Reading the first entry is the
    bug racer found in its own server. A loopback peer always counts as one hop (vite's dev
    proxy, a local tunnel), so dev needs no setting. A chain shorter than `hops` falls back
    to the socket peer — setting the count too high degrades accuracy, never safety."""
    peer = _peer_host(scope) or ""
    effective = int(hops or 0)
    if is_loopback(scope):
        effective = max(effective, 1)
    if effective <= 0:
        return peer
    raw = _header(scope, b"x-forwarded-for") or ""
    entries = [e.strip() for e in raw.split(",") if e.strip()]
    if len(entries) < effective:
        return peer
    return entries[-effective]


def _cookie_token(scope: Scope) -> str | None:
    raw = _header(scope, b"cookie")
    if not raw:
        return None
    value = cookie_parser(raw).get(SESSION_COOKIE)
    return value or None


@dataclass
class _Resolved:
    claims: dict | None
    #: The token to re-send with a fresh Max-Age, when the session was touched.
    renew: str | None


def _resolve(token: str, ttl_days: int, allow_touch: bool) -> _Resolved:
    """One short DB session: the row, the account, the memberships, the current group; the
    touch (a rare write) commits in the same session. Runs in the threadpool."""
    from datetime import timedelta

    ttl = timedelta(days=ttl_days)
    with Session(get_engine()) as s:
        row = resolve_session(s, token)
        if row is None:
            return _Resolved(None, None)
        claims = build_claims(s, player_id=int(row.player_id), session_id=int(row.id))
        if claims is None:
            return _Resolved(None, None)
        renew: str | None = None
        if allow_touch and touch_session(s, row, sessions_service._now(), ttl):
            s.commit()
            renew = token
        return _Resolved(claims, renew)


class AuthGate:
    """`app.add_middleware(AuthGate)` — the outermost layer, outside the exception handlers,
    so a refusal is a response it sends itself rather than an exception it raises."""

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        kind = scope.get("type")
        if kind not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        settings = scope["app"].state.settings
        state: dict = scope.setdefault("state", {})
        state["client_ip"] = client_ip(scope, int(settings.trusted_proxy_hops or 0))
        state["claims"] = None

        token = _cookie_token(scope)
        resolved = _Resolved(None, None)
        if token:
            resolved = await run_in_threadpool(_resolve, token, int(settings.session_ttl_days or 90), kind == "http")
            state["claims"] = resolved.claims

        secure = cookie_secure_for(settings, origin=_header(scope, b"origin"), scheme=str(scope.get("scheme") or ""))
        path_class = classify(str(scope.get("path") or ""))

        if path_class == CLASS_LOOPBACK:
            if not is_loopback(scope):
                await self._refuse(scope, receive, send, 401, NOT_LOGGED_IN, clear_cookie=False, secure=secure)
                return
        elif path_class != CLASS_PUBLIC:
            if resolved.claims is None:
                # A cookie that names no live session is cleared on the way out, so a browser
                # stops presenting a token the server will never accept again.
                await self._refuse(scope, receive, send, 401, NOT_LOGGED_IN, clear_cookie=bool(token), secure=secure)
                return
            if path_class == CLASS_MEMBER and resolved.claims.get("role") == "none":
                await self._refuse(scope, receive, send, 403, NOT_A_MEMBER, clear_cookie=False, secure=secure)
                return

        if resolved.renew and kind == "http":
            header = session_cookie_header(resolved.renew, secure=secure, max_age=int(session_ttl(settings).total_seconds()))

            async def send_with_cookie(message: dict) -> None:
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers") or [])
                    # A route that sets the cookie itself — a login replacing this session, a
                    # logout clearing it — has the last word; renewing the old value after it
                    # would hand the browser a token that was just revoked.
                    if not any(k == b"set-cookie" and v.startswith(_COOKIE_PREFIX) for k, v in headers):
                        headers.append(header)
                    message = {**message, "headers": headers}
                await send(message)

            await self.app(scope, receive, send_with_cookie)
            return

        await self.app(scope, receive, send)

    @staticmethod
    async def _refuse(
        scope: Scope,
        receive: Receive,
        send: Send,
        status: int,
        detail: str,
        *,
        clear_cookie: bool,
        secure: bool,
    ) -> None:
        if scope["type"] == "websocket":
            # Before any accept: the client sees a failed handshake (HTTP 403 from uvicorn).
            await send({"type": "websocket.close", "code": 1008})
            return
        response: Response = JSONResponse({"detail": detail}, status_code=status)
        if clear_cookie:
            clear_session_cookie(response, secure=secure)
        await response(scope, receive, send)
