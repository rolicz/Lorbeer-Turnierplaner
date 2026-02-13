from tests.conftest import create_player, create_tournament, generate


def test_generate_1v1_with_six_players(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["A", "B", "C", "D", "E", "F"]]
    tid = create_tournament(client, editor_headers, "1v1-6p", "1v1", ids)

    out = generate(client, editor_headers, tid, randomize=False)
    assert out["ok"] is True
    assert out["matches"] == 15  # C(6,2)

    td = client.get(f"/tournaments/{tid}")
    assert td.status_code == 200, td.text
    data = td.json()
    assert len(data.get("matches", [])) == 15

