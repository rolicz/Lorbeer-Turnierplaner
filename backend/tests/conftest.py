"""Fixtures (rewritten by L2 for cookie sessions).

The mechanics rest on one measured fact: with httpx 0.27 / Starlette 0.41 **an explicit
`Cookie` header on a request beats the `TestClient` jar**. So `editor_headers` and friends
are `{"Cookie": "lk_session=<token>"}` and every existing `headers=` call stays as it was,
while the `client` fixture logs itself in as **Editor** and keeps that cookie in its jar —
which is what turns the old "public read" calls (no headers) into editor calls. A test that
means "nobody" reaches for the `anon` fixture (an empty jar); one that means "a session
without a membership" reaches for `nogroup_headers`.
"""

from http.cookies import SimpleCookie

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import get_engine, init_db
from app.main import create_app
from app.models import Account, Player
from app.services.auth_migration import name_key, new_webauthn_user_handle
from app.services.mail import CaptureTransport, MailMessage, OffTransport
from app.services.sessions import SESSION_COOKIE, create_session
from app.settings import PlayerAccount, Settings

TEST_ACCOUNTS = (
    PlayerAccount(name="Editor", password="editor-secret", admin=False),
    # A second editor, so "an editor who is not the creator" is testable (A10).
    PlayerAccount(name="Editor2", password="editor2-secret", admin=False),
    PlayerAccount(name="Admin", password="admin-secret", admin=True),
)


def make_settings(db_path, **overrides) -> Settings:
    """The one `Settings(...)` every test app boots with: the fast argon2 profile, dev-origin
    mode (so the cookie is not `Secure` and the http test client sends it), `app_env="test"`,
    and a `jwt_secret` so the exchange can be exercised."""
    base = dict(
        db_url=f"sqlite:///{db_path}",
        player_accounts=TEST_ACCOUNTS,
        log_level="DEBUG",
        jwt_secret="test-jwt-secret",
        password_hash_profile="test",
        auth_dev_origin=True,
        auth_origin="http://testserver",
        app_env="test",
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    settings = make_settings(db_path)
    app = create_app(settings)
    # No test ever sends mail (E0): the capture transport keeps every message in memory.
    # Only tests construct it — no setting, flag or env var can select it.
    app.state.mail = CaptureTransport()
    # Tables only; the lifespan's `init_db(settings)` then runs the migration, which
    # attaches accounts to the three players below (it never mints players itself).
    init_db()

    with Session(get_engine()) as s:
        for acc in TEST_ACCOUNTS:
            exists = s.exec(select(Player).where(Player.display_name == acc.name)).first()
            if exists is None:
                s.add(Player(display_name=acc.name))
        s.commit()

    with TestClient(app) as c:
        token = login(c, "Editor", "editor-secret")
        c.cookies.set(SESSION_COOKIE, token)
        yield c


@pytest.fixture()
def anon(client) -> TestClient:
    """Nobody: a second client on the same app with a jar that is empty until it logs in."""
    return TestClient(client.app)


class LoopbackScope:
    """An ASGI shim that makes every request look like it came from 127.0.0.1 — Docker's
    healthcheck, or the API docs behind vite's proxy. `TestClient(LoopbackScope(client.app))`
    is how a test reaches `/health` (the gate answers it to a loopback peer only)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        scope["client"] = ("127.0.0.1", 0)
        await self.app(scope, receive, send)


def _cookie_from_response(r) -> str | None:
    for raw in r.headers.get_list("set-cookie"):
        jar = SimpleCookie()
        jar.load(raw)
        if SESSION_COOKIE in jar:
            return jar[SESSION_COOKIE].value
    return None


def _jar_value(client: TestClient) -> str | None:
    for ck in client.cookies.jar:
        if ck.name == SESSION_COOKIE:
            return ck.value
    return None


def login(client: TestClient, username: str, password: str) -> str:
    """Log in and return the session cookie's value.

    The request presents **no** cookie (an explicit empty header beats the jar), because a
    login that carries a live session revokes it — the browser is about to overwrite that
    cookie — and the shared client's own Editor session must survive. Afterwards the jar
    is put back exactly as it was, so the shared client is never silently the last caller."""
    keep = _jar_value(client)
    r = client.post("/auth/login", json={"username": username, "password": password}, headers={"Cookie": ""})
    assert r.status_code == 200, r.text
    token = _cookie_from_response(r)
    assert token, "login set no session cookie"
    client.cookies.delete(SESSION_COOKIE)
    if keep:
        client.cookies.set(SESSION_COOKIE, keep)
    return token


def mail_sent(client: TestClient) -> list[MailMessage]:
    """Every message the app has "sent" so far, oldest first (the capture transport)."""
    return client.app.state.mail.sent


def mail_off(client: TestClient) -> None:
    """Make this app a server with email switched off."""
    client.app.state.mail = OffTransport()


def cookie_headers(token: str) -> dict:
    return {"Cookie": f"{SESSION_COOKIE}={token}"}


@pytest.fixture()
def editor_headers(client):
    return cookie_headers(login(client, "Editor", "editor-secret"))


@pytest.fixture()
def editor2_headers(client):
    """A second editor account — used to test "an editor who did not create this row"."""
    return cookie_headers(login(client, "Editor2", "editor2-secret"))


@pytest.fixture()
def admin_headers(client):
    return cookie_headers(login(client, "Admin", "admin-secret"))


def mint_session(player_id: int, *, kind: str = "password") -> str:
    """A session cookie value minted straight into the table — no login, no password."""
    with Session(get_engine()) as s:
        _row, token = create_session(s, player_id=int(player_id), kind=kind, user_agent="tests", ip="testclient")
        s.commit()
    return token


def create_nogroup_account(name: str = "NoGroup") -> int:
    """A `Player` with an `Account` and **no** membership — what registration by invite
    creates before the code is redeemed (L3). Built directly for now."""
    with Session(get_engine()) as s:
        player = s.exec(select(Player).where(Player.display_name == name)).first()
        if player is None:
            player = Player(display_name=name)
            s.add(player)
            s.flush()
        if s.get(Account, int(player.id)) is None:
            s.add(Account(player_id=int(player.id), name_key=name_key(name), webauthn_user_handle=new_webauthn_user_handle()))
        s.commit()
        return int(player.id)


@pytest.fixture()
def nogroup_headers(client):
    """A live session whose account is in no group: 401 nowhere, 403 everywhere but the
    account paths."""
    return cookie_headers(mint_session(create_nogroup_account()))


def create_player(client: TestClient, admin_headers: dict, name: str) -> int:
    r = client.post("/players", json={"display_name": name}, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def create_tournament(client: TestClient, editor_headers: dict, name: str, mode: str, player_ids: list[int]) -> int:
    r = client.post(
        "/tournaments",
        json={"name": name, "mode": mode, "player_ids": player_ids},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def generate(client: TestClient, editor_headers: dict, tournament_id: int, randomize: bool = False):
    r = client.post(
        f"/tournaments/{tournament_id}/generate",
        json={"randomize": randomize},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()

def create_league(client: TestClient, admin_headers: dict, name: str) -> int:
    r = client.post("/clubs/leagues", json={"name": name}, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def create_club(
    client: TestClient,
    editor_headers: dict,
    name: str,
    game: str,
    star_rating: float,
    league_id: int,
) -> int:
    r = client.post(
        "/clubs",
        json={"name": name, "game": game, "star_rating": star_rating, "league_id": league_id},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]
