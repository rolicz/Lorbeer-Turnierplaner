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


def test_live_score_updates_do_not_change_odds(client, editor_headers, admin_headers):
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
    pre = t["matches"][0].get("odds") or {}
    assert isinstance(pre, dict)

    # Set match to playing with a huge score advantage.
    rpatch = client.patch(
        f"/matches/{mid}",
        json={"state": "playing", "sideA": {"club_id": None, "goals": 10}, "sideB": {"club_id": None, "goals": 0}},
        headers=editor_headers,
    )
    assert rpatch.status_code == 200, rpatch.text

    t2 = client.get(f"/tournaments/{tid}").json()
    m2 = next(m for m in t2["matches"] if m["id"] == mid)
    post = m2.get("odds") or {}
    assert isinstance(post, dict)
    for k in ("home", "draw", "away"):
        assert abs(float(post.get(k, 0.0)) - float(pre.get(k, 0.0))) <= 0.01


def test_single_match_odds_ignore_live_score_state(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "M1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "M2"}, headers=admin_headers).json()["id"]
    p3 = client.post("/players", json={"display_name": "M3"}, headers=admin_headers).json()["id"]

    # Ad-hoc endpoint should use pre-match model regardless of live score.
    payload_scheduled = {
        "mode": "1v1",
        "teamA_player_ids": [p1],
        "teamB_player_ids": [p2],
        "state": "scheduled",
        "a_goals": 0,
        "b_goals": 0,
    }
    payload_playing = {
        "mode": "1v1",
        "teamA_player_ids": [p1],
        "teamB_player_ids": [p2],
        "state": "playing",
        "a_goals": 7,
        "b_goals": 0,
    }

    r0 = client.post("/stats/odds", json=payload_scheduled)
    r1 = client.post("/stats/odds", json=payload_playing)
    assert r0.status_code == 200, r0.text
    assert r1.status_code == 200, r1.text
    o0 = (r0.json() or {}).get("odds") or {}
    o1 = (r1.json() or {}).get("odds") or {}
    for k in ("home", "draw", "away"):
        assert abs(float(o0.get(k, 0.0)) - float(o1.get(k, 0.0))) <= 0.01
