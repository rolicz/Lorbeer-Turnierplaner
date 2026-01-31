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


def test_websocket_requires_auth_when_enabled(tmp_path):
    import pytest
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.settings import Settings
    from fastapi import WebSocketDisconnect

    db_path = tmp_path / "test.db"
    settings = Settings(
        db_url=f"sqlite:///{db_path}",
        editor_password="editor-secret",
        admin_password="admin-secret",
        jwt_secret="test-jwt-secret",
        ws_require_auth=True,
        log_level="DEBUG",
    )
    app = create_app(settings)

    with TestClient(app) as client:
        def login_local(password: str) -> dict:
            r = client.post("/auth/login", json={"password": password})
            assert r.status_code == 200, r.text
            return {"Authorization": f"Bearer {r.json()['token']}"}

        admin_headers = login_local("admin-secret")
        editor_headers = login_local("editor-secret")

        # create minimal tournament
        ids = []
        for n in ["W1", "W2", "W3"]:
            r = client.post("/players", json={"display_name": n}, headers=admin_headers)
            assert r.status_code == 200
            ids.append(r.json()["id"])

        r = client.post("/tournaments", json={"name": "ws", "mode": "1v1", "player_ids": ids}, headers=editor_headers)
        tid = r.json()["id"]

        with pytest.raises(WebSocketDisconnect):
            client.websocket_connect(f"/ws/tournaments/{tid}")

        with client.websocket_connect(f"/ws/tournaments/{tid}", headers=editor_headers) as ws:
            msg = ws.receive_json()
            assert msg["event"] == "connected"
