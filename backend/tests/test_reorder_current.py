from tests.conftest import create_player, create_tournament, generate


def test_reorder_allows_editor_and_persists(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["A", "B", "C", "D"]]

    tid = create_tournament(client, editor_headers, "2v2", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}").json()
    match_ids = [m["id"] for m in t["matches"]]
    reversed_ids = list(reversed(match_ids))

    r = client.patch(
        f"/tournaments/{tid}/reorder",
        json={"match_ids": reversed_ids},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    t2 = client.get(f"/tournaments/{tid}").json()
    reordered = [m["id"] for m in t2["matches"]]
    assert reordered == reversed_ids


def test_reorder_requires_all_match_ids(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["E", "F", "G", "H"]]

    tid = create_tournament(client, editor_headers, "2v2", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}").json()
    match_ids = [m["id"] for m in t["matches"]]

    r = client.patch(
        f"/tournaments/{tid}/reorder",
        json={"match_ids": match_ids[:-1]},
        headers=editor_headers,
    )
    assert r.status_code == 400
