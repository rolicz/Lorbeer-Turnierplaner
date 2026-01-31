from tests.conftest import create_club, create_league, create_player, create_tournament, generate


def test_assign_club_per_match_side(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "La Liga")

    p1 = create_player(client, admin_headers, "Roland")
    p2 = create_player(client, admin_headers, "Hias")
    p3 = create_player(client, admin_headers, "Lenny")

    tid = create_tournament(client, editor_headers, "Club Assignment", "1v1", [p1, p2, p3])
    generate(client, editor_headers, tid, randomize=False)

    c1 = create_club(client, editor_headers, "Rapid Wien", "EA FC 26", 3.5, league_id)
    c2 = create_club(client, editor_headers, "Boca Juniors", "EA FC 26", 4.0, league_id)

    t = client.get(f"/tournaments/{tid}").json()
    match_id = t["matches"][0]["id"]

    r = client.patch(
        f"/matches/{match_id}",
        json={"sideA": {"club_id": c1}, "sideB": {"club_id": c2}},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    t2 = client.get(f"/tournaments/{tid}").json()
    match = next(m for m in t2["matches"] if m["id"] == match_id)
    side_a = next(s for s in match["sides"] if s["side"] == "A")
    side_b = next(s for s in match["sides"] if s["side"] == "B")
    assert side_a["club_id"] == c1
    assert side_b["club_id"] == c2
