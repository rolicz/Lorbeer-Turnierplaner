from tests.conftest import create_player, create_tournament, generate


def _matches_by_leg(tournament: dict, leg: int) -> list[dict]:
    return [m for m in tournament["matches"] if m["leg"] == leg]


def test_second_leg_enable_disable_and_block_after_start(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["A", "B", "C"]]

    tid = create_tournament(client, editor_headers, "second-leg", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    r1 = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": True}, headers=editor_headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["created"] == 3

    t = client.get(f"/tournaments/{tid}").json()
    assert len(_matches_by_leg(t, 2)) == 3

    r2 = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": False}, headers=editor_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["deleted"] is True

    r3 = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": True}, headers=editor_headers)
    assert r3.status_code == 200, r3.text
    assert r3.json()["created"] == 3

    t2 = client.get(f"/tournaments/{tid}").json()
    leg2_match_id = _matches_by_leg(t2, 2)[0]["id"]

    r4 = client.patch(
        f"/matches/{leg2_match_id}",
        json={"sideA": {"goals": 1}, "sideB": {"goals": 0}},
        headers=editor_headers,
    )
    assert r4.status_code == 200, r4.text

    r5 = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": False}, headers=editor_headers)
    assert r5.status_code == 403
