def test_clubs_public_read_editor_write(client, editor_headers):
    # list is public
    r = client.get("/clubs")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    # create: no token -> forbidden/unauth
    r = client.post("/clubs", json={"name": "FC Test", "game": "EA FC 26", "star_rating": 4.5})
    assert r.status_code in (401, 403)

    # create: editor ok
    r = client.post("/clubs", json={"name": "FC Test", "game": "EA FC 26", "star_rating": 4.5}, headers=editor_headers)
    assert r.status_code == 200, r.text
    club = r.json()
    assert club["name"] == "FC Test"
    assert club["game"] == "EA FC 26"
    assert club["star_rating"] == 4.5
    cid = club["id"]

    # patch: editor ok
    r2 = client.patch(f"/clubs/{cid}", json={"star_rating": 5.0}, headers=editor_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["star_rating"] == 5.0


def test_clubs_star_rating_validation(client, editor_headers):
    # out of range
    r = client.post("/clubs", json={"name": "Bad", "game": "EA FC 26", "star_rating": 0.0}, headers=editor_headers)
    assert r.status_code == 400

    r = client.post("/clubs", json={"name": "Bad2", "game": "EA FC 26", "star_rating": 5.5}, headers=editor_headers)
    assert r.status_code == 400

    # wrong step
    r = client.post("/clubs", json={"name": "Bad3", "game": "EA FC 26", "star_rating": 4.2}, headers=editor_headers)
    assert r.status_code == 400


def test_clubs_uniqueness_by_name_and_game(client, editor_headers):
    r1 = client.post("/clubs", json={"name": "Real", "game": "EA FC 26", "star_rating": 4.5}, headers=editor_headers)
    assert r1.status_code == 200
    id1 = r1.json()["id"]

    # creating same (name, game) should return existing (per your router behaviour)
    r2 = client.post("/clubs", json={"name": "Real", "game": "EA FC 26", "star_rating": 3.0}, headers=editor_headers)
    assert r2.status_code == 200
    id2 = r2.json()["id"]
    assert id2 == id1


def test_clubs_filter_by_game(client, editor_headers):
    client.post("/clubs", json={"name": "Team25", "game": "EA FC 25", "star_rating": 3.5}, headers=editor_headers)
    client.post("/clubs", json={"name": "Team26", "game": "EA FC 26", "star_rating": 4.0}, headers=editor_headers)

    r = client.get("/clubs?game=EA FC 26")
    assert r.status_code == 200
    names = {c["name"] for c in r.json()}
    assert "Team26" in names
    assert "Team25" not in names
