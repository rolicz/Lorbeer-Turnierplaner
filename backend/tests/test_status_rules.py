def test_status_patch_rules(client, editor_headers, admin_headers):
    # create 3 players
    ids = []
    for n in ["P1", "P2", "P3"]:
        r = client.post("/players", json={"display_name": n}, headers=admin_headers)
        assert r.status_code == 200
        ids.append(r.json()["id"])

    r = client.post("/tournaments", json={"name": "status", "mode": "1v1", "player_ids": ids}, headers=editor_headers)
    assert r.status_code == 200
    tid = r.json()["id"]

    # draft -> live (editor ok)
    r1 = client.patch(f"/tournaments/{tid}/status", json={"status": "live"}, headers=editor_headers)
    assert r1.status_code == 200

    # live -> draft (editor forbidden)
    r2 = client.patch(f"/tournaments/{tid}/status", json={"status": "draft"}, headers=editor_headers)
    assert r2.status_code == 403

    # live -> done (editor ok)
    r3 = client.patch(f"/tournaments/{tid}/status", json={"status": "done"}, headers=editor_headers)
    assert r3.status_code == 200

    # done -> live (editor forbidden)
    r4 = client.patch(f"/tournaments/{tid}/status", json={"status": "live"}, headers=editor_headers)
    assert r4.status_code == 403

    # admin can reopen (done -> live)
    r5 = client.patch(f"/tournaments/{tid}/status", json={"status": "live"}, headers=admin_headers)
    assert r5.status_code == 200
