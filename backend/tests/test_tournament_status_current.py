from tests.conftest import create_player, create_tournament, generate


def test_status_is_derived_from_matches(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["P1", "P2", "P3"]]

    tid = create_tournament(client, editor_headers, "status", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}").json()
    assert t["status"] == "draft"

    match_ids = [m["id"] for m in t["matches"]]
    first_match_id = match_ids[0]

    r1 = client.patch(f"/matches/{first_match_id}", json={"state": "playing"}, headers=editor_headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["tournament_status"] == "live"

    r2 = client.patch(f"/matches/{first_match_id}", json={"state": "finished"}, headers=editor_headers)
    assert r2.status_code == 200, r2.text

    for mid in match_ids[1:]:
        r = client.patch(f"/matches/{mid}", json={"state": "finished"}, headers=editor_headers)
        assert r.status_code == 200, r.text

    t2 = client.get(f"/tournaments/{tid}").json()
    assert t2["status"] == "done"
