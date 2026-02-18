def test_create_friendly_and_stats_scope_filters(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "F-A"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "F-B"}, headers=admin_headers).json()["id"]

    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 3,
            "b_goals": 1,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["mode"] == "1v1"
    assert out["state"] == "finished"
    assert len(out["sides"]) == 2

    # List endpoint includes the created friendly.
    l = client.get("/friendlies")
    assert l.status_code == 200, l.text
    listed = l.json()
    assert len(listed) == 1
    assert listed[0]["id"] == out["id"]

    # Default scope: tournaments only -> no entries.
    s0 = client.get(f"/stats/player-matches?player_id={p1}")
    assert s0.status_code == 200, s0.text
    assert s0.json()["tournaments"] == []

    # Friendlies scope: entry is visible.
    s1 = client.get(f"/stats/player-matches?player_id={p1}&scope=friendlies")
    assert s1.status_code == 200, s1.text
    t_rows = s1.json()["tournaments"]
    assert len(t_rows) == 1
    assert t_rows[0]["status"] == "friendly"
    assert len(t_rows[0]["matches"]) == 1

    # Both scope: friendly is included as well.
    s2 = client.get(f"/stats/player-matches?player_id={p1}&scope=both")
    assert s2.status_code == 200, s2.text
    assert len(s2.json()["tournaments"]) == 1


def test_create_friendly_requires_editor_or_admin(client, admin_headers):
    p1 = client.post("/players", json={"display_name": "F-C"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "F-D"}, headers=admin_headers).json()["id"]

    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 1,
            "b_goals": 0,
        },
    )
    assert r.status_code in (401, 403), r.text


def test_delete_friendly_admin_only(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "F-E"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "F-F"}, headers=admin_headers).json()["id"]

    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 2,
            "b_goals": 0,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    fid = r.json()["id"]

    r_forbidden = client.delete(f"/friendlies/{fid}", headers=editor_headers)
    assert r_forbidden.status_code == 403, r_forbidden.text

    r_ok = client.delete(f"/friendlies/{fid}", headers=admin_headers)
    assert r_ok.status_code == 200, r_ok.text
    assert r_ok.json()["ok"] is True

    rows = client.get("/friendlies").json()
    assert all(int(x["id"]) != fid for x in rows)


def test_patch_friendly_admin_only(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "F-G"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "F-H"}, headers=admin_headers).json()["id"]

    created = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 1,
            "b_goals": 0,
        },
        headers=editor_headers,
    )
    assert created.status_code == 200, created.text
    fid = int(created.json()["id"])

    forbidden = client.patch(
        f"/friendlies/{fid}",
        json={"state": "scheduled", "sideA": {"goals": 2}, "sideB": {"goals": 2}},
        headers=editor_headers,
    )
    assert forbidden.status_code == 403, forbidden.text

    updated = client.patch(
        f"/friendlies/{fid}",
        json={"state": "scheduled", "sideA": {"goals": 2}, "sideB": {"goals": 2}},
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    out = updated.json()
    assert out["id"] == fid
    assert out["state"] == "scheduled"
    sides = sorted(out["sides"], key=lambda x: x["side"])
    assert sides[0]["goals"] == 2
    assert sides[1]["goals"] == 2
