from tests.util import match_signature, matches_by_leg


def test_1v1_generate_and_second_leg_idempotent(client, editor_headers, admin_headers):
    p1 = _mk_player(client, admin_headers, "Roland")
    p2 = _mk_player(client, admin_headers, "Hias")
    p3 = _mk_player(client, admin_headers, "Lenny")

    tid = _mk_tournament(client, editor_headers, "Test 1v1", "1v1", [p1, p2, p3])

    # deterministic schedule
    client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)

    t = client.get(f"/tournaments/{tid}").json()
    leg1 = matches_by_leg(t, 1)
    leg2 = matches_by_leg(t, 2)
    assert len(leg1) == 3  # 3 choose 2
    assert len(leg2) == 0

    sig_leg1 = {match_signature(m) for m in leg1}

    # enable second leg -> full copy (same orientation), appended
    r = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": True}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 3

    t2 = client.get(f"/tournaments/{tid}").json()
    leg1b = matches_by_leg(t2, 1)
    leg2b = matches_by_leg(t2, 2)
    assert len(leg1b) == 3
    assert len(leg2b) == 3

    sig_leg2 = {match_signature(m) for m in leg2b}
    assert sig_leg2 == sig_leg1  # no mirroring, no loss

    # enabling again does nothing
    r2 = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": True}, headers=editor_headers)
    assert r2.status_code == 200
    assert r2.json().get("created", 0) == 0

    # editor cannot disable if leg2 started
    some_leg2 = leg2b[0]
    mid = some_leg2["id"]
    rp = client.patch(f"/matches/{mid}", json={"state": "playing", "sideA": {"goals": 0}, "sideB": {"goals": 0}},
                      headers=editor_headers)
    assert rp.status_code == 200

    rd = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": False}, headers=editor_headers)
    assert rd.status_code == 403

    # admin can disable (even if started) - destructive, but allowed
    rd2 = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": False}, headers=admin_headers)
    assert rd2.status_code == 200

    t3 = client.get(f"/tournaments/{tid}").json()
    assert len(matches_by_leg(t3, 2)) == 0


def _mk_player(client, admin_headers, name):
    r = client.post("/players", json={"display_name": name}, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _mk_tournament(client, editor_headers, name, mode, player_ids):
    r = client.post("/tournaments", json={"name": name, "mode": mode, "player_ids": player_ids}, headers=editor_headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]
