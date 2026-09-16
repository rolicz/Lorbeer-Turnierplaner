from sqlmodel import Session

from app.db import get_engine
from tests.conftest import create_league


def test_clubs_require_league_id(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Bundesliga")

    r = client.post("/clubs", json={"name": "FC Test", "game": "EA FC 26", "star_rating": 4.5}, headers=editor_headers)
    assert r.status_code == 400
    assert r.json()["detail"] == "Missing league_id"

    r2 = client.post(
        "/clubs",
        json={"name": "FC Test", "game": "EA FC 26", "star_rating": 4.5, "league_id": league_id},
        headers=editor_headers,
    )
    assert r2.status_code == 200, r2.text
    club = r2.json()
    assert club["name"] == "FC Test"
    assert club["league_id"] == league_id

    r3 = client.get("/clubs")
    assert r3.status_code == 200
    names = {c["name"] for c in r3.json()}
    assert "FC Test" in names


def test_clubs_uniqueness_by_name_and_game(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Premier League")
    r1 = client.post(
        "/clubs",
        json={"name": "Real", "game": "EA FC 26", "star_rating": 4.5, "league_id": league_id},
        headers=editor_headers,
    )
    assert r1.status_code == 200
    id1 = r1.json()["id"]

    r2 = client.post(
        "/clubs",
        json={"name": "Real", "game": "EA FC 26", "star_rating": 3.0, "league_id": league_id},
        headers=editor_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == id1


def test_clubs_filter_by_game(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Serie A")
    client.post(
        "/clubs",
        json={"name": "Team25", "game": "EA FC 25", "star_rating": 3.5, "league_id": league_id},
        headers=editor_headers,
    )
    client.post(
        "/clubs",
        json={"name": "Team26", "game": "EA FC 26", "star_rating": 4.0, "league_id": league_id},
        headers=editor_headers,
    )

    r = client.get("/clubs?game=EA FC 26")
    assert r.status_code == 200
    names = {c["name"] for c in r.json()}
    assert "Team26" in names
    assert "Team25" not in names


# ---- delete (A9) ------------------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def _club_with_league(client, editor_headers, admin_headers, name: str) -> int:
    league_id = create_league(client, admin_headers, f"League {name}")
    r = client.post(
        "/clubs",
        json={"name": name, "game": "EA FC 26", "star_rating": 4.0, "league_id": league_id},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_delete_club_refuses_when_only_a_friendly_uses_it(client, editor_headers, admin_headers):
    """A friendly is a recorded match too — 12 clubs in the real DB are referenced only by one."""
    club_id = _club_with_league(client, editor_headers, admin_headers, "Friendly FC")
    p1 = client.post("/players", json={"display_name": "DC-A"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "DC-B"}, headers=admin_headers).json()["id"]

    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": club_id,
            "clubB_id": None,
            "a_goals": 2,
            "b_goals": 1,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    d = client.delete(f"/clubs/{club_id}", headers=admin_headers)
    assert d.status_code == 409, d.text
    assert d.json()["detail"] == "Club is used in friendlies; cannot delete"

    # Still there, and the friendly still points at a club that exists.
    assert club_id in {c["id"] for c in client.get("/clubs").json()}
    (side,) = [s for s in client.get("/friendlies").json()[0]["sides"] if s["side"] == "A"]
    assert side["club_id"] == club_id


def test_delete_unused_club_takes_its_crest_with_it(client, editor_headers, admin_headers):
    """`club.id` is not AUTOINCREMENT: an orphaned crest would be inherited by the next club."""
    club_id = _club_with_league(client, editor_headers, admin_headers, "Crest FC")
    assert client.put(
        f"/clubs/{club_id}/crest",
        files={"file": ("crest.png", PNG, "image/png")},
        headers=admin_headers,
    ).status_code == 200
    assert client.get(f"/clubs/{club_id}/crest").status_code == 200

    from app.models import ClubCrestFile
    from app.services.file_storage import media_exists

    with Session(get_engine()) as s:
        row = s.get(ClubCrestFile, club_id)
        assert row is not None
        rel_path = row.file_path
    assert media_exists(rel_path)

    assert client.delete(f"/clubs/{club_id}", headers=admin_headers).status_code == 204

    with Session(get_engine()) as s:
        assert s.get(ClubCrestFile, club_id) is None
    assert not media_exists(rel_path)
    assert client.get(f"/clubs/{club_id}/crest").status_code == 404
