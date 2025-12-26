def test_websocket_connect(client, editor_headers, admin_headers):
    # create minimal tournament
    ids = []
    for n in ["W1", "W2", "W3"]:
        r = client.post("/players", json={"display_name": n}, headers=admin_headers)
        assert r.status_code == 200
        ids.append(r.json()["id"])

    r = client.post("/tournaments", json={"name": "ws", "mode": "1v1", "player_ids": ids}, headers=editor_headers)
    tid = r.json()["id"]

    with client.websocket_connect(f"/ws/tournaments/{tid}") as ws:
        msg = ws.receive_json()
        assert msg["event"] == "connected"
        ws.send_text("ping")
        pong = ws.receive_json()
        assert pong["event"] == "pong"
