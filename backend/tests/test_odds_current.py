def test_tournament_match_odds_present_for_scheduled_matches(client, editor_headers, admin_headers):
    # Create players and a small tournament
    p1 = client.post("/players", json={"display_name": "O1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "O2"}, headers=admin_headers).json()["id"]
    p3 = client.post("/players", json={"display_name": "O3"}, headers=admin_headers).json()["id"]

    tid = client.post(
        "/tournaments",
        json={"name": "odds", "mode": "1v1", "player_ids": [p1, p2, p3]},
        headers=editor_headers,
    ).json()["id"]

    rgen = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert rgen.status_code == 200, rgen.text

    t = client.get(f"/tournaments/{tid}").json()
    assert isinstance(t.get("matches"), list)
    assert t["matches"], "expected schedule to create matches"

    for m in t["matches"]:
        assert m.get("tournament_id") == tid
        assert m.get("state") in ("scheduled", "playing", "finished")
        if m.get("state") in ("scheduled", "playing"):
            odds = m.get("odds")
            assert isinstance(odds, dict), f"missing odds for match {m.get('id')}"
            for k in ("home", "draw", "away"):
                v = odds.get(k)
                assert isinstance(v, (int, float)), f"odds.{k} not numeric: {v}"
                assert float(v) >= 1.01


def test_live_odds_move_strongly_with_big_score_delta(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "L1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "L2"}, headers=admin_headers).json()["id"]
    p3 = client.post("/players", json={"display_name": "L3"}, headers=admin_headers).json()["id"]

    tid = client.post(
        "/tournaments",
        json={"name": "odds-live", "mode": "1v1", "player_ids": [p1, p2, p3]},
        headers=editor_headers,
    ).json()["id"]
    rgen = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert rgen.status_code == 200, rgen.text

    t = client.get(f"/tournaments/{tid}").json()
    mid = t["matches"][0]["id"]

    # Set match to playing with a huge score advantage.
    rpatch = client.patch(
        f"/matches/{mid}",
        json={"state": "playing", "sideA": {"club_id": None, "goals": 10}, "sideB": {"club_id": None, "goals": 0}},
        headers=editor_headers,
    )
    assert rpatch.status_code == 200, rpatch.text

    t2 = client.get(f"/tournaments/{tid}").json()
    m2 = next(m for m in t2["matches"] if m["id"] == mid)
    odds = m2.get("odds") or {}
    assert isinstance(odds, dict)
    # With 10:0 lead, draw odds should be very high (i.e., prob tiny).
    assert float(odds.get("draw", 0.0)) >= 8.0
