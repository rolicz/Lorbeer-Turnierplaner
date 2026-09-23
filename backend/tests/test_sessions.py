"""Sessions and the cookie (L2): login, logout, revocation, the exchange, `MeOut`."""

from __future__ import annotations

import dataclasses
import time

import jwt
from sqlmodel import Session, select

from app.db import get_engine
from app.models import AuthSession, PushSubscription
from app.services.notifications import upsert_push_subscription
from app.services.sessions import SESSION_COOKIE, cookie_secure_for
from tests.conftest import cookie_headers, login, make_settings


def _session_cookie(r) -> str:
    cookies = [h for h in r.headers.get_list("set-cookie") if h.startswith(f"{SESSION_COOKIE}=")]
    assert len(cookies) == 1, r.headers.get_list("set-cookie")
    return cookies[0]


def _rows(player_id: int | None = None) -> list[AuthSession]:
    with Session(get_engine()) as s:
        stmt = select(AuthSession)
        if player_id is not None:
            stmt = stmt.where(AuthSession.player_id == player_id)
        return list(s.exec(stmt).all())


# ---- login ------------------------------------------------------------------------------------


def test_login_sets_the_cookie_with_the_right_attributes(anon):
    r = anon.post("/auth/login", json={"username": "Editor", "password": "editor-secret"})
    assert r.status_code == 200, r.text
    cookie = _session_cookie(r)
    attrs = {a.strip().split("=")[0].lower() for a in cookie.split(";")[1:]}
    assert "httponly" in attrs and "path" in attrs and "max-age" in attrs and "samesite" in attrs
    assert "Path=/" in cookie and "Max-Age=7776000" in cookie
    assert "samesite=lax" in cookie.lower()
    assert "secure" not in attrs  # dev-origin mode over http: no Secure, so the phone on the LAN gets in
    # The body is MeOut and carries no token — the cookie is the credential.
    body = r.json()
    assert "token" not in body
    assert body["role"] == "editor" and body["player_name"] == "Editor"
    # A login is case-insensitive on the name ("flo" logs in, "Flo" displays).
    assert anon.post("/auth/login", json={"username": "  eDiToR ", "password": "editor-secret"}).status_code == 200


def test_a_wrong_name_and_a_wrong_password_are_the_same_401(anon):
    r1 = anon.post("/auth/login", json={"username": "Editor", "password": "nope"})
    r2 = anon.post("/auth/login", json={"username": "Nobody", "password": "nope"})
    r3 = anon.post("/auth/login", json={"username": "", "password": ""})
    assert (r1.status_code, r2.status_code, r3.status_code) == (401, 401, 401)
    assert r1.json()["detail"] == r2.json()["detail"] == r3.json()["detail"]
    assert not r1.headers.get_list("set-cookie")
    assert _rows() == [] or all(row.player_id != 0 for row in _rows())


def test_an_account_without_a_password_cannot_log_in(anon, admin_headers, client):
    # A player an admin creates has an account only once L3 lands; until then there is no
    # account at all — either way, no password, and the same 401 as a wrong password.
    pid = client.post("/players", json={"display_name": "Silent"}, headers=admin_headers).json()["id"]
    assert pid
    r = anon.post("/auth/login", json={"username": "Silent", "password": "anything-at-all"})
    assert r.status_code == 401 and r.json()["detail"] == "Wrong username or password"


def test_logging_in_on_top_of_a_live_session_replaces_it(client):
    before = {row.id for row in _rows()}
    editor_token = login(client, "Editor2", "editor2-secret")
    mid = {row.id for row in _rows()} - before
    assert len(mid) == 1
    # The same browser (the same cookie) logs in as someone else: the old row is revoked,
    # since the cookie it belonged to is being overwritten.
    r = client.post("/auth/login", json={"username": "Admin", "password": "admin-secret"}, headers=cookie_headers(editor_token))
    assert r.status_code == 200
    after = {row.id for row in _rows()}
    assert not (mid & after)
    assert client.get("/me", headers=cookie_headers(editor_token)).status_code == 401


# ---- logout and revocation --------------------------------------------------------------------


def test_logout_clears_the_cookie_and_the_row(client, anon):
    token = login(client, "Editor2", "editor2-secret")
    headers = cookie_headers(token)
    assert anon.get("/me", headers=headers).status_code == 200
    r = anon.post("/auth/logout", headers=headers)
    assert r.status_code == 200 and r.json() == {"ok": True}
    cookie = _session_cookie(r)
    assert "Max-Age=0" in cookie and "HttpOnly" in cookie
    assert anon.get("/me", headers=headers).status_code == 401
    assert all(row.token_hash != token for row in _rows())


def test_logout_disables_this_devices_push_subscription(client, anon):
    token = login(client, "Editor2", "editor2-secret")
    me = anon.get("/me", headers=cookie_headers(token)).json()
    endpoint = "https://push.example/dev-1"
    with Session(get_engine()) as s:
        upsert_push_subscription(
            s,
            player_id=int(me["player_id"]),
            endpoint=endpoint,
            p256dh="p",
            auth="a",
            content_encoding="aes128gcm",
            user_agent="tests",
            app_platform="",
            app_standalone=False,
            notification_language=None,
            notification_mode=None,
        )
        s.commit()
    r = anon.post("/auth/logout", json={"push_endpoint": endpoint}, headers=cookie_headers(token))
    assert r.status_code == 200
    with Session(get_engine()) as s:
        row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint)).first()
        assert row is not None and row.disabled_at is not None


def test_a_revoked_session_is_401_on_its_next_request(client, anon):
    token = login(client, "Editor2", "editor2-secret")
    other = login(client, "Editor2", "editor2-secret")
    mine = anon.get("/auth/sessions", headers=cookie_headers(token)).json()
    assert len(mine) == 2 and sum(1 for x in mine if x["current"]) == 1
    current = next(x for x in mine if x["current"])
    other_row = next(x for x in mine if not x["current"])
    assert current["kind"] == "password" and current["device_label"] == ""

    r = anon.delete(f"/auth/sessions/{other_row['id']}", headers=cookie_headers(token))
    assert r.status_code == 200
    assert anon.get("/me", headers=cookie_headers(other)).status_code == 401
    assert anon.get("/me", headers=cookie_headers(token)).status_code == 200


def test_revoking_someone_elses_session_is_a_404(client, anon, admin_headers):
    token = login(client, "Editor2", "editor2-secret")
    admin_rows = anon.get("/auth/sessions", headers=admin_headers).json()
    assert admin_rows
    r = anon.delete(f"/auth/sessions/{admin_rows[0]['id']}", headers=cookie_headers(token))
    assert r.status_code == 404
    assert anon.get("/me", headers=admin_headers).status_code == 200


def test_revoke_others_keeps_the_current_session(client, anon):
    a = login(client, "Editor2", "editor2-secret")
    b = login(client, "Editor2", "editor2-secret")
    c = login(client, "Editor2", "editor2-secret")
    r = anon.post("/auth/sessions/revoke-others", headers=cookie_headers(b))
    assert r.status_code == 200 and r.json() == {"revoked": 2}
    assert anon.get("/me", headers=cookie_headers(a)).status_code == 401
    assert anon.get("/me", headers=cookie_headers(c)).status_code == 401
    assert anon.get("/me", headers=cookie_headers(b)).status_code == 200
    assert len(anon.get("/auth/sessions", headers=cookie_headers(b)).json()) == 1


# ---- the exchange ----------------------------------------------------------------------------


def _legacy_token(secret: str, *, player_id: int, player_name: str, role: str = "editor") -> str:
    """A JWT exactly as `app/auth.py::create_token` minted it at cfc1669."""
    now = int(time.time())
    payload = {
        "sub": f"player:{player_id}",
        "role": role,
        "player_id": player_id,
        "player_name": player_name,
        "iat": now,
        "exp": now + 60 * 60 * 24 * 180,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def test_the_exchange_trades_the_old_jwt_for_a_session(client, anon, admin_headers):
    admin = anon.get("/me", headers=admin_headers).json()
    token = _legacy_token("test-jwt-secret", player_id=admin["player_id"], player_name="Admin", role="admin")
    r = anon.post("/auth/exchange", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    cookie = _session_cookie(r)
    assert "HttpOnly" in cookie and "Max-Age=7776000" in cookie
    body = r.json()
    assert body["player_id"] == admin["player_id"] and body["role"] == "admin" and body["site_admin"] is True
    value = cookie.split(";")[0].split("=", 1)[1]
    sessions = anon.get("/auth/sessions", headers=cookie_headers(value)).json()
    assert next(x for x in sessions if x["current"])["kind"] == "exchange"


def test_the_exchange_ignores_the_old_tokens_role(client, anon, editor2_headers):
    # The JWT claims "admin"; the account says member. The account wins.
    me = anon.get("/me", headers=editor2_headers).json()
    token = _legacy_token("test-jwt-secret", player_id=me["player_id"], player_name="Editor2", role="admin")
    r = anon.post("/auth/exchange", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["role"] == "editor" and r.json()["site_admin"] is False


def test_the_exchange_refuses_a_bad_token_a_missing_one_and_an_unknown_player(anon):
    assert anon.post("/auth/exchange").status_code == 401
    assert anon.post("/auth/exchange", headers={"Authorization": "Bearer not.a.jwt"}).status_code == 401
    wrong_secret = _legacy_token("another-secret", player_id=1, player_name="Editor")
    assert anon.post("/auth/exchange", headers={"Authorization": f"Bearer {wrong_secret}"}).status_code == 401
    ghost = _legacy_token("test-jwt-secret", player_id=987654, player_name="Ghost")
    assert anon.post("/auth/exchange", headers={"Authorization": f"Bearer {ghost}"}).status_code == 401
    assert _rows() == [] or all(row.kind != "exchange" for row in _rows())


def test_the_exchange_is_410_once_the_secret_is_empty(client, anon, tmp_path):
    client.app.state.settings = dataclasses.replace(client.app.state.settings, jwt_secret="")
    token = _legacy_token("test-jwt-secret", player_id=1, player_name="Editor")
    r = anon.post("/auth/exchange", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 410


# ---- MeOut ------------------------------------------------------------------------------------


def test_me_for_an_admin_an_editor_and_a_no_group_account(anon, admin_headers, editor_headers, nogroup_headers):
    admin = anon.get("/me", headers=admin_headers).json()
    assert admin["role"] == "admin" and admin["site_admin"] is True
    assert [g["slug"] for g in admin["groups"]] == ["altherren"] and admin["groups"][0]["role"] == "owner"
    assert admin["has_password"] is True and admin["password_migrated"] is True and admin["has_passkey"] is False
    assert isinstance(admin["session_id"], int)

    editor = anon.get("/me", headers=editor_headers).json()
    assert editor["role"] == "editor" and editor["site_admin"] is False
    assert editor["groups"][0]["role"] == "member" and editor["groups"][0]["name"] == "Altherren"

    nobody = anon.get("/me", headers=nogroup_headers).json()
    assert nobody["role"] == "none" and nobody["groups"] == [] and nobody["has_password"] is False
    assert nobody["password_migrated"] is False


def test_me_matches_the_login_body(anon):
    r = anon.post("/auth/login", json={"username": "Admin", "password": "admin-secret"})
    value = _session_cookie(r).split(";")[0].split("=", 1)[1]
    assert anon.get("/me", headers=cookie_headers(value)).json() == r.json()


# ---- Secure ----------------------------------------------------------------------------------


def test_secure_follows_the_configured_origin_not_a_proxy_header(tmp_path):
    pinned = make_settings(tmp_path / "x.db", auth_dev_origin=False, auth_origin="https://lorbeerkranz.xyz")
    assert cookie_secure_for(pinned, origin=None, scheme="http") is True  # pinned https: always on
    assert cookie_secure_for(pinned, origin="http://evil", scheme="http") is True
    dev = make_settings(tmp_path / "y.db", auth_dev_origin=True, auth_origin="http://localhost:8253")
    assert cookie_secure_for(dev, origin="http://192.168.178.78:8000", scheme="http") is False
    assert cookie_secure_for(dev, origin="https://localhost", scheme="http") is True
    assert cookie_secure_for(dev, origin=None, scheme="https") is True
    assert cookie_secure_for(dev, origin=None, scheme="http") is False
