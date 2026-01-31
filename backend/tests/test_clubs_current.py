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
