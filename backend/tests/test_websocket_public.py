from tests.conftest import create_player, create_tournament


def test_websocket_public_connect(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["W1", "W2", "W3"]]
    tid = create_tournament(client, editor_headers, "ws", "1v1", ids)

    with client.websocket_connect(f"/ws/tournaments/{tid}") as ws:
        msg = ws.receive_json()
        assert msg["event"] == "connected"
        ws.send_text("ping")
        pong = ws.receive_json()
        assert pong["event"] == "pong"
