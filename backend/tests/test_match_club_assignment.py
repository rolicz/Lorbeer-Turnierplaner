from tests.conftest import create_player, create_tournament, generate, create_club


def test_assign_club_per_match_side(client, editor_headers, admin_headers):
    # players + tournament
    p1 = create_player(client, admin_headers, "Roland")
    p2 = create_player(client, admin_headers, "Hias")
    p3 = create_player(client, admin_headers, "Lenny")

    tid = create_tournament(client, editor_headers, "Club Assignment", "1v1", [p1, p2, p3])
    generate(client, editor_headers, tid, randomize=False)

    # create clubs (editor allowed)
    c1 = create_club(client, editor_headers, "Rapid Wien", "EA FC 26", 3.5)
    c2 = create_club(client, editor_headers, "Sturm Graz", "EA FC 26", 4.0)

    # get a match id
    t = client.get(f"/tournaments/{tid}").json()
    mid = next(m["id"] for m in t["matches"] if m["leg"] == 1)

    # set club ids on both sides + goals
    r = client.patch(
        f"/matches/{mid}",
        json={
            "sideA": {"club_id": c1, "goals": 2},
            "sideB": {"club_id": c2, "goals": 1},
            "state": "finished",
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    # verify persisted via tournament fetch
    t2 = client.get(f"/tournaments/{tid}").json()
    m2 = next(m for m in t2["matches"] if m["id"] == mid)
    sides = {s["side"]: s for s in m2["sides"]}
    assert sides["A"]["club_id"] == c1
    assert sides["B"]["club_id"] == c2


def test_assign_unknown_club_fails(client, editor_headers, admin_headers):
    p1 = create_player(client, admin_headers, "A")
    p2 = create_player(client, admin_headers, "B")
    p3 = create_player(client, admin_headers, "C")

    tid = create_tournament(client, editor_headers, "Bad Club", "1v1", [p1, p2, p3])
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}").json()
    mid = next(m["id"] for m in t["matches"] if m["leg"] == 1)

    r = client.patch(
        f"/matches/{mid}",
        json={"sideA": {"club_id": 999999}},
        headers=editor_headers,
    )
    assert r.status_code == 400
