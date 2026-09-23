from tests.conftest import create_player, create_tournament


def test_websocket_connects_with_the_session_cookie(client, editor_headers, admin_headers):
    """The shared client's jar carries Editor's cookie, which is what authenticates the
    handshake since L2 (an anonymous handshake is refused — `test_auth_gate.py`)."""
    ids = [create_player(client, admin_headers, n) for n in ["W1", "W2", "W3"]]
    tid = create_tournament(client, editor_headers, "ws", "1v1", ids)

    with client.websocket_connect(f"/ws/tournaments/{tid}") as ws:
        msg = ws.receive_json()
        assert msg["event"] == "connected"
        ws.send_text("ping")
        pong = ws.receive_json()
        assert pong["event"] == "pong"
