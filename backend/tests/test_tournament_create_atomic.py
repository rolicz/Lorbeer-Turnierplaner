from tests.conftest import create_player


def test_create_auto_generate_rolls_back_on_schedule_error(client, editor_headers, admin_headers):
    p1 = create_player(client, admin_headers, "A")
    p2 = create_player(client, admin_headers, "B")

    r = client.post(
        "/tournaments",
        json={
            "name": "atomic-fail",
            "mode": "1v1",
            "player_ids": [p1, p2],  # invalid for schedule generation (needs 3-5)
            "auto_generate": True,
            "randomize": False,
        },
        headers=editor_headers,
    )
    assert r.status_code == 400, r.text

    rs = client.get("/tournaments")
    assert rs.status_code == 200, rs.text
    assert rs.json() == []


def test_create_auto_generate_success(client, editor_headers, admin_headers):
    p1 = create_player(client, admin_headers, "A")
    p2 = create_player(client, admin_headers, "B")
    p3 = create_player(client, admin_headers, "C")

    r = client.post(
        "/tournaments",
        json={
            "name": "atomic-ok",
            "mode": "1v1",
            "player_ids": [p1, p2, p3],
            "auto_generate": True,
            "randomize": False,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    rd = client.get(f"/tournaments/{tid}")
    assert rd.status_code == 200, rd.text
    data = rd.json()
    assert isinstance(data.get("matches"), list)
    assert len(data["matches"]) > 0

