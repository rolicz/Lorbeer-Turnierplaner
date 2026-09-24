"""The password floor (E0): 15 characters for every password being **set** — register,
reset, change, `manage.py set-password` — and **no** length check at login, so the migrated
passwords (nine characters on production) keep working."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import get_engine, init_db
from app.main import create_app
from app.models import Account, Player
from app.services.mail import CaptureTransport
from app.services.passwords import MIN_PASSWORD_LENGTH
from app.settings import PlayerAccount
from tests.conftest import TEST_ACCOUNTS, cookie_headers, login, make_settings
from tests.test_accounts import _mint_code, _mint_reset, _player_id, _register
from tests.test_admin import _manage

FOURTEEN = "fourteen-chars"  # 14
FIFTEEN = "fifteen-chars-x"  # 15
REFUSAL = "The password must be at least 15 characters long"


def test_the_floor_is_fifteen():
    assert MIN_PASSWORD_LENGTH == 15
    assert (len(FOURTEEN), len(FIFTEEN)) == (14, 15)


def test_register_refuses_fourteen_and_accepts_fifteen(anon):
    code = _mint_code()
    r = _register(anon, code, "Floor", FOURTEEN)
    assert r.status_code == 400 and r.json()["detail"] == REFUSAL
    assert _register(anon, code, "Floor", FIFTEEN).status_code == 200  # the code was not spent
    login(anon, "Floor", FIFTEEN)


def test_reset_refuses_fourteen_and_accepts_fifteen(anon):
    token = _mint_reset(_player_id("Editor2"))
    r = anon.post("/auth/reset", json={"token": token, "password": FOURTEEN})
    assert r.status_code == 400 and r.json()["detail"] == REFUSAL
    assert anon.post("/auth/reset", json={"token": token, "password": FIFTEEN}).status_code == 200
    login(anon, "Editor2", FIFTEEN)


def test_changing_my_password_refuses_fourteen_and_accepts_fifteen(anon):
    headers = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    short = anon.post("/auth/password", json={"current_password": "editor2-secret", "new_password": FOURTEEN}, headers=headers)
    assert short.status_code == 400 and short.json()["detail"] == REFUSAL
    ok = anon.post("/auth/password", json={"current_password": "editor2-secret", "new_password": FIFTEEN}, headers=headers)
    assert ok.status_code == 200, ok.text
    login(anon, "Editor2", FIFTEEN)


def test_manage_set_password_refuses_fourteen_and_accepts_fifteen(client, anon, tmp_path):
    short = _manage(client, tmp_path, "set-password", "--player", "Editor2", stdin=f"{FOURTEEN}\n{FOURTEEN}\n")
    assert short.returncode == 1 and "at least 15" in short.stderr
    ok = _manage(client, tmp_path, "set-password", "--player", "Editor2", stdin=f"{FIFTEEN}\n{FIFTEEN}\n")
    assert ok.returncode == 0, ok.stderr
    login(anon, "Editor2", FIFTEEN)


# ---- login never checks length ---------------------------------------------------------------

MIGRATED_NINE = "nine-char"  # the length of the six migrated passwords on production


@pytest.fixture()
def nine_client(tmp_path, monkeypatch):
    """An app whose `player_accounts` migrate a nine-character password, as production's do."""
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    accounts = (*TEST_ACCOUNTS, PlayerAccount(name="Shorty", password=MIGRATED_NINE, admin=False))
    app = create_app(make_settings(tmp_path / "nine.db", player_accounts=accounts))
    app.state.mail = CaptureTransport()
    init_db()
    with Session(get_engine()) as s:
        for acc in accounts:
            s.add(Player(display_name=acc.name))
        s.commit()
    with TestClient(app) as c:
        yield c


def test_login_never_checks_length(nine_client):
    assert len(MIGRATED_NINE) == 9
    with Session(get_engine()) as s:
        pid = int(s.exec(select(Player).where(Player.display_name == "Shorty")).one().id)
        assert s.get(Account, pid).password_origin == "migrated"
    r = nine_client.post("/auth/login", json={"username": "Shorty", "password": MIGRATED_NINE}, headers={"Cookie": ""})
    assert r.status_code == 200, r.text
    me = nine_client.get("/me", headers=cookie_headers(login(nine_client, "Shorty", MIGRATED_NINE)))
    assert me.status_code == 200
    # …and it still logs in after a second, third login (a rehash on login never re-validates).
    for _ in range(2):
        login(nine_client, "Shorty", MIGRATED_NINE)
