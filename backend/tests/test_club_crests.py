from app.tools.sync_club_crests import match_team
from tests.conftest import create_league

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def _make_club(client, editor_headers, admin_headers, name="FC Test"):
    league_id = create_league(client, admin_headers, "Bundesliga")
    r = client.post(
        "/clubs",
        json={"name": name, "game": "EA FC 26", "star_rating": 4.0, "league_id": league_id},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_crest_upload_serve_delete_roundtrip(client, editor_headers, admin_headers):
    club_id = _make_club(client, editor_headers, admin_headers)

    # no crest yet: 404 + null in list payload
    assert client.get(f"/clubs/{club_id}/crest").status_code == 404
    (club,) = [c for c in client.get("/clubs").json() if c["id"] == club_id]
    assert club["crest_updated_at"] is None

    # admin upload
    r = client.put(
        f"/clubs/{club_id}/crest",
        files={"file": ("crest.png", PNG, "image/png")},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["club_id"] == club_id

    served = client.get(f"/clubs/{club_id}/crest")
    assert served.status_code == 200
    assert served.content == PNG
    assert served.headers["content-type"].startswith("image/png")
    assert "max-age" in served.headers.get("cache-control", "")

    (club,) = [c for c in client.get("/clubs").json() if c["id"] == club_id]
    assert club["crest_updated_at"] is not None

    # delete → gone again
    assert client.delete(f"/clubs/{club_id}/crest", headers=admin_headers).status_code == 204
    assert client.get(f"/clubs/{club_id}/crest").status_code == 404


def test_crest_upload_requires_admin_and_valid_image(client, editor_headers, admin_headers):
    club_id = _make_club(client, editor_headers, admin_headers)

    r = client.put(
        f"/clubs/{club_id}/crest",
        files={"file": ("crest.png", PNG, "image/png")},
        headers=editor_headers,
    )
    assert r.status_code == 403

    r = client.put(
        f"/clubs/{club_id}/crest",
        files={"file": ("crest.txt", b"not an image", "text/plain")},
        headers=admin_headers,
    )
    assert r.status_code == 400

    assert client.put("/clubs/99999/crest", files={"file": ("c.png", PNG, "image/png")}, headers=admin_headers).status_code == 404


# ---- sync matcher (offline) -------------------------------------------------

def _team(name: str, alternate: str = "", short: str = "") -> dict:
    return {"strTeam": name, "strTeamAlternate": alternate, "strTeamShort": short, "strBadge": "x"}


def test_match_team_exact_and_alternate_names():
    teams = [_team("Bayern Munich", "FC Bayern München, Bayern"), _team("Borussia Dortmund", "BVB")]
    assert match_team("FC Bayern München", teams)["strTeam"] == "Bayern Munich"
    assert match_team("Borussia Dortmund", teams)["strTeam"] == "Borussia Dortmund"


def test_match_team_diacritics_and_stop_tokens():
    teams = [_team("FC Koln", "1. FC Köln, Koln"), _team("Union Berlin", "1. FC Union Berlin")]
    assert match_team("1. FC Köln", teams)["strTeam"] == "FC Koln"
    assert match_team("Union Berlin", teams)["strTeam"] == "Union Berlin"


def test_match_team_rejects_weak_matches():
    teams = [_team("Arsenal"), _team("Aston Villa")]
    assert match_team("Real Madrid CF", teams) is None
