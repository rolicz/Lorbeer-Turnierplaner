def test_leg_reassignment_admin_only(client, editor_headers, admin_headers):
    # 3 players => 1v1: 3 matches
    ids = []
    for n in ["X", "Y", "Z"]:
        r = client.post("/players", json={"display_name": n}, headers=admin_headers)
        assert r.status_code == 200
        ids.append(r.json()["id"])

    r = client.post("/tournaments", json={"name": "leg", "mode": "1v1", "player_ids": ids}, headers=editor_headers)
    assert r.status_code == 200
    tid = r.json()["id"]

    r = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert r.status_code == 200

    t = client.get(f"/tournaments/{tid}").json()
    mid = next(m["id"] for m in t["matches"] if m["leg"] == 1)

    # editor cannot change leg
    r1 = client.patch(f"/matches/{mid}", json={"leg": 2}, headers=editor_headers)
    assert r1.status_code == 403

    # admin can change leg (only if scheduled; your code uses 409 if started)
    r2 = client.patch(f"/matches/{mid}", json={"leg": 2}, headers=admin_headers)
    assert r2.status_code == 200
