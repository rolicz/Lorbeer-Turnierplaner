"""The gate (L2): every route is either refused anonymously or listed — walked, not asserted.

`test_every_route_is_gated_or_listed` enumerates `app.routes` × methods and checks each one
against the three tuples in `app/auth_gate.py`. A route added next year is gated by
construction; listing it as public means editing a tuple this test walks, and a listed path
that does not exist is a failure. That is the "audited exactly once" property.
"""

from __future__ import annotations

import datetime as dt
import re

import pytest
from fastapi.routing import APIRoute, APIWebSocketRoute
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from starlette.routing import Route
from starlette.websockets import WebSocketDisconnect

from app.auth_gate import (
    ACCOUNT_PATHS,
    CLASS_ACCOUNT,
    CLASS_LOOPBACK,
    CLASS_MEMBER,
    CLASS_PUBLIC,
    LOOPBACK_ONLY_PATHS,
    NOT_A_MEMBER,
    NOT_LOGGED_IN,
    PUBLIC_PATHS,
    classify,
    client_ip,
    is_loopback,
)
from app.db import get_engine
from app.models import AuthSession
from app.services import sessions as sessions_service
from app.services.sessions import SESSION_COOKIE, TOUCH_INTERVAL
from tests.conftest import (
    LoopbackScope,
    cookie_headers,
    create_nogroup_account,
    create_player,
    create_tournament,
    login,
    mint_session,
)


def _fill(path: str) -> str:
    """`/tournaments/{tournament_id}` -> `/tournaments/1`."""
    return re.sub(r"\{[^}]+\}", "1", path)


def _gate_refused(r, status: int, detail: str) -> bool:
    """The gate's own refusal, told apart from a route's by its spelled-once detail."""
    if r.status_code != status:
        return False
    try:
        return r.json().get("detail") == detail
    except ValueError:
        return False


def _http_routes(app) -> list[tuple[str, str]]:
    """Every (method, path) the app serves over HTTP. Fails loudly on a route object it
    cannot classify — a mount or a custom route type must be looked at, not skipped."""
    out: list[tuple[str, str]] = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in sorted(route.methods or ()):
                out.append((method, route.path))
        elif isinstance(route, APIWebSocketRoute):
            continue  # walked separately
        elif type(route) is Route:
            # FastAPI's own /docs, /redoc, /openapi.json, /docs/oauth2-redirect.
            for method in sorted(route.methods or ("GET",)):
                if method != "HEAD":
                    out.append((method, route.path))
        else:
            raise AssertionError(f"unclassifiable route object {route!r} — teach test_auth_gate.py about it")
    return out


def _ws_routes(app) -> list[str]:
    return [r.path for r in app.routes if isinstance(r, APIWebSocketRoute)]


def test_every_route_is_gated_or_listed(client, anon):
    app = client.app
    routes = _http_routes(app)
    # 113 routes × methods at cfc1669 plus L2's five; a walk that found a handful would be
    # a broken enumeration, not a small app.
    assert len(routes) >= 113, len(routes)
    loopback = TestClient(LoopbackScope(app))

    # 1. Nobody: 401 everywhere except the public and loopback paths.
    for method, path in routes:
        url = _fill(path)
        r = anon.request(method, url)
        kind = classify(url)
        if kind == CLASS_LOOPBACK:
            assert _gate_refused(r, 401, NOT_LOGGED_IN), (method, path, r.status_code, r.text[:80])
            r2 = loopback.request(method, url)
            assert not _gate_refused(r2, 401, NOT_LOGGED_IN), (method, path, r2.status_code)
        elif kind == CLASS_PUBLIC:
            assert not _gate_refused(r, 401, NOT_LOGGED_IN), (method, path, r.status_code)
        else:
            assert _gate_refused(r, 401, NOT_LOGGED_IN), (method, path, r.status_code, r.text[:80])

    # 2. A session with no membership: 403 everywhere except the public, account and
    #    loopback paths. A fresh session per route, because the walk passes /auth/logout
    #    and DELETE /auth/sessions/1, which would otherwise end the walker's own session.
    pid = create_nogroup_account("Gatecrasher")
    for method, path in routes:
        url = _fill(path)
        kind = classify(url)
        r = client.request(method, url, headers=cookie_headers(mint_session(pid)))
        if kind == CLASS_MEMBER:
            assert _gate_refused(r, 403, NOT_A_MEMBER), (method, path, r.status_code, r.text[:80])
        elif kind == CLASS_ACCOUNT:
            assert r.status_code not in (401, 403), (method, path, r.status_code, r.text[:80])
        elif kind == CLASS_PUBLIC:
            assert not _gate_refused(r, 401, NOT_LOGGED_IN) and r.status_code != 403, (method, path, r.status_code)
        else:  # loopback: the peer decides, not the session
            assert _gate_refused(r, 401, NOT_LOGGED_IN), (method, path, r.status_code)

    # 3. The websocket endpoints refuse an anonymous handshake.
    ws_paths = _ws_routes(app)
    assert len(ws_paths) == 3, ws_paths
    for path in ws_paths:
        with pytest.raises(WebSocketDisconnect):
            with anon.websocket_connect(_fill(path)):
                pass

    # 4. The three tuples name only paths that exist (a prefix must match at least one).
    all_paths = {r.path for r in app.routes if hasattr(r, "path")}
    for entry in LOOPBACK_ONLY_PATHS + PUBLIC_PATHS + ACCOUNT_PATHS:
        if entry.endswith("/"):
            assert any(p.startswith(entry) for p in all_paths), f"{entry!r} is a prefix of no route"
        else:
            assert entry in all_paths, f"{entry!r} is listed but is not a route"


def test_the_classes_are_exact_then_prefix():
    assert classify("/auth/login") == CLASS_PUBLIC
    assert classify("/auth/exchange") == CLASS_PUBLIC
    assert classify("/auth/logout") == CLASS_ACCOUNT
    assert classify("/auth/sessions/3") == CLASS_ACCOUNT
    assert classify("/authx") == CLASS_MEMBER
    assert classify("/me") == CLASS_ACCOUNT
    assert classify("/me/notifications") == CLASS_ACCOUNT
    assert classify("/meh") == CLASS_MEMBER
    assert classify("/push/config") == CLASS_ACCOUNT
    assert classify("/health") == CLASS_LOOPBACK
    assert classify("/healthz") == CLASS_MEMBER
    assert classify("/docs") == CLASS_LOOPBACK
    assert classify("/") == CLASS_MEMBER
    assert classify("/tournaments") == CLASS_MEMBER


def test_health_answers_loopback_only(client, anon):
    assert anon.get("/health").status_code == 401
    # Even a member is refused from a non-loopback peer: the rule is the peer, not the session.
    assert client.get("/health").status_code == 401
    assert TestClient(LoopbackScope(client.app)).get("/health").json() == {"status": "ok"}
    assert TestClient(LoopbackScope(client.app)).get("/openapi.json").status_code == 200


def test_an_unknown_path_is_401_to_a_stranger_and_404_to_a_member(client, anon):
    assert anon.get("/no/such/route").status_code == 401
    assert client.get("/no/such/route").status_code == 404


# ---- the touch rule -----------------------------------------------------------------------


def _row(token: str) -> AuthSession:
    with Session(get_engine()) as s:
        row = s.exec(select(AuthSession).where(AuthSession.token_hash == sessions_service.hash_token(token))).first()
        assert row is not None
        s.expunge(row)
        return row


def test_a_session_is_touched_only_when_stale(client, monkeypatch):
    t0 = dt.datetime(2026, 9, 23, 12, 0, 0)
    monkeypatch.setattr(sessions_service, "_now", lambda: t0)
    token = login(client, "Editor2", "editor2-secret")
    headers = cookie_headers(token)
    row0 = _row(token)
    assert row0.last_seen_at == t0 and row0.expires_at == t0 + dt.timedelta(days=90)

    # Inside the interval: no write, no cookie.
    monkeypatch.setattr(sessions_service, "_now", lambda: t0 + dt.timedelta(minutes=1))
    r = client.get("/me", headers=headers)
    assert r.status_code == 200
    assert not [h for h in r.headers.get_list("set-cookie") if h.startswith(SESSION_COOKIE)]
    assert _row(token).last_seen_at == t0

    # Past it: last_seen moves, expiry is pushed out, and the cookie is re-sent with the
    # same value and a fresh Max-Age — that is what makes the session rolling.
    later = t0 + TOUCH_INTERVAL + dt.timedelta(seconds=1)
    monkeypatch.setattr(sessions_service, "_now", lambda: later)
    r = client.get("/me", headers=headers)
    assert r.status_code == 200
    cookies = [h for h in r.headers.get_list("set-cookie") if h.startswith(SESSION_COOKIE)]
    assert len(cookies) == 1, r.headers.get_list("set-cookie")
    assert f"{SESSION_COOKIE}={token};" in cookies[0]
    assert "Max-Age=7776000" in cookies[0] and "HttpOnly" in cookies[0]
    row1 = _row(token)
    assert row1.last_seen_at == later and row1.expires_at == later + dt.timedelta(days=90)


def test_a_route_that_sets_the_cookie_itself_wins_over_the_touch(client, anon, monkeypatch):
    """A stale session that logs out, or logs in as someone else, must not have its old
    value renewed *after* the route's own Set-Cookie — the browser would keep a revoked token."""
    t0 = dt.datetime(2026, 9, 23, 12, 0, 0)
    monkeypatch.setattr(sessions_service, "_now", lambda: t0)
    stale = login(client, "Editor2", "editor2-secret")
    monkeypatch.setattr(sessions_service, "_now", lambda: t0 + TOUCH_INTERVAL + dt.timedelta(seconds=1))

    r = anon.post("/auth/logout", headers=cookie_headers(stale))
    assert r.status_code == 200
    cookies = [h for h in r.headers.get_list("set-cookie") if h.startswith(SESSION_COOKIE)]
    assert len(cookies) == 1 and "Max-Age=0" in cookies[0], cookies

    stale2 = login(client, "Editor2", "editor2-secret")
    monkeypatch.setattr(sessions_service, "_now", lambda: t0 + 2 * TOUCH_INTERVAL + dt.timedelta(seconds=2))
    r = anon.post("/auth/login", json={"username": "Admin", "password": "admin-secret"}, headers=cookie_headers(stale2))
    assert r.status_code == 200
    cookies = [h for h in r.headers.get_list("set-cookie") if h.startswith(SESSION_COOKIE)]
    assert len(cookies) == 1 and f"{SESSION_COOKIE}={stale2};" not in cookies[0], cookies
    assert anon.get("/me", headers=cookie_headers(stale2)).status_code == 401


def test_an_expired_session_is_401_and_not_touched(client, anon, monkeypatch):
    t0 = dt.datetime(2026, 9, 23, 12, 0, 0)
    monkeypatch.setattr(sessions_service, "_now", lambda: t0)
    token = login(client, "Editor2", "editor2-secret")
    monkeypatch.setattr(sessions_service, "_now", lambda: t0 + dt.timedelta(days=90, seconds=1))
    r = anon.get("/me", headers=cookie_headers(token))
    assert r.status_code == 401
    # The dead row is gone, and the browser is told to drop the cookie.
    with Session(get_engine()) as s:
        assert s.exec(select(AuthSession).where(AuthSession.token_hash == sessions_service.hash_token(token))).first() is None
    assert any("Max-Age=0" in h for h in r.headers.get_list("set-cookie"))


# ---- websockets ---------------------------------------------------------------------------


def test_a_websocket_authenticates_by_the_cookie(client, anon, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["WA1", "WA2", "WA3"]]
    tid = create_tournament(client, editor_headers, "ws-gate", "1v1", ids)
    with client.websocket_connect(f"/ws/tournaments/{tid}") as ws:  # the jar carries the cookie
        assert ws.receive_json()["event"] == "connected"
    with anon.websocket_connect(f"/ws/tournaments/{tid}", headers=editor_headers) as ws:
        assert ws.receive_json()["event"] == "connected"
    with pytest.raises(WebSocketDisconnect) as refused:
        with anon.websocket_connect(f"/ws/tournaments/{tid}"):
            pass
    assert refused.value.code == 1008
    with pytest.raises(WebSocketDisconnect):
        with anon.websocket_connect(f"/ws/tournaments/{tid}", headers=cookie_headers("not-a-session")):
            pass


def test_a_websocket_needs_a_membership_too(anon, nogroup_headers):
    with pytest.raises(WebSocketDisconnect):
        with anon.websocket_connect("/ws/tournaments", headers=nogroup_headers):
            pass


# ---- client_ip ----------------------------------------------------------------------------


def _scope(peer: str | None, xff: str | None = None) -> dict:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return {"type": "http", "client": (peer, 1234) if peer else None, "headers": headers}


def test_client_ip_counts_from_the_right():
    # Behind one trusted proxy the rightmost entry is the one the proxy wrote itself.
    assert client_ip(_scope("172.18.0.3", "1.2.3.4, 10.0.0.9"), 1) == "10.0.0.9"
    # Whatever the client put in front of it is ignored — it cannot pick its own bucket.
    assert client_ip(_scope("172.18.0.3", "6.6.6.6, 7.7.7.7, 10.0.0.9"), 1) == "10.0.0.9"
    assert client_ip(_scope("172.18.0.3", "1.2.3.4, 10.0.0.9"), 2) == "1.2.3.4"


def test_client_ip_loopback_peer_counts_as_one_hop():
    assert client_ip(_scope("127.0.0.1", "1.2.3.4, 10.0.0.9"), 0) == "10.0.0.9"
    assert client_ip(_scope("::1", "10.0.0.9"), 0) == "10.0.0.9"
    # vite's proxy sends no X-Forwarded-For at all: the peer it is.
    assert client_ip(_scope("127.0.0.1"), 0) == "127.0.0.1"


def test_client_ip_falls_back_to_the_peer():
    # No proxies configured: the header is untrusted and the socket peer is the answer.
    assert client_ip(_scope("203.0.113.5", "1.2.3.4"), 0) == "203.0.113.5"
    # A chain shorter than the configured hops: the peer, never a client-chosen entry.
    assert client_ip(_scope("172.18.0.3", "10.0.0.9"), 2) == "172.18.0.3"
    assert client_ip(_scope("172.18.0.3"), 1) == "172.18.0.3"
    assert client_ip(_scope(None), 1) == ""


def test_is_loopback():
    assert is_loopback(_scope("127.0.0.1")) and is_loopback(_scope("127.0.0.53")) and is_loopback(_scope("::1"))
    assert not is_loopback(_scope("172.18.0.3")) and not is_loopback(_scope("testclient")) and not is_loopback(_scope(None))


def test_the_gate_records_the_client_ip_on_the_session(client, editor_headers):
    r = client.get("/auth/sessions", headers=editor_headers)
    assert r.status_code == 200
    with Session(get_engine()) as s:
        rows = s.exec(select(AuthSession)).all()
    assert rows and all(row.ip == "testclient" for row in rows)
