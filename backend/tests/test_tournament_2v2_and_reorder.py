def test_2v2_generate_reorder_permissions_and_effect(client, editor_headers, admin_headers):
    # 4 players => 3 matches
    ids = []
    for n in ["A", "B", "C", "D"]:
        r = client.post("/players", json={"display_name": n}, headers=admin_headers)
        assert r.status_code == 200
        ids.append(r.json()["id"])

    r = client.post("/tournaments", json={"name": "2v2", "mode": "2v2", "player_ids": ids}, headers=editor_headers)
    assert r.status_code == 200
    tid = r.json()["id"]

    r = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert r.status_code == 200

    t = client.get(f"/tournaments/{tid}").json()
    match_ids = [m["id"] for m in t["matches"] if m["leg"] == 1]
    assert len(match_ids) == 3

    # editor cannot reorder
    rr = client.patch(f"/tournaments/{tid}/reorder", json={"match_ids": match_ids[::-1]}, headers=editor_headers)
    assert rr.status_code == 403

    # admin can reorder
    rr2 = client.patch(f"/tournaments/{tid}/reorder", json={"match_ids": match_ids[::-1]}, headers=admin_headers)
    assert rr2.status_code == 200

    t2 = client.get(f"/tournaments/{tid}").json()
    new_order = [m["id"] for m in sorted(t2["matches"], key=lambda x: x["order_index"]) if m["leg"] == 1]
    assert new_order == match_ids[::-1]
