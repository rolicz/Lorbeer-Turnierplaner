import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    settings = Settings(
        db_url=f"sqlite:///{db_path}",
        editor_password="editor-secret",
        admin_password="admin-secret",
        jwt_secret="test-jwt-secret",
        ws_require_auth=False,
        log_level="DEBUG",
    )
    app = create_app(settings)

    with TestClient(app) as c:
        yield c


def login(client: TestClient, password: str) -> str:
    r = client.post("/auth/login", json={"password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture()
def editor_headers(client):
    token = login(client, "editor-secret")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers(client):
    token = login(client, "admin-secret")
    return {"Authorization": f"Bearer {token}"}


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
