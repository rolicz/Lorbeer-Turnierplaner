def test_login_and_me(client):
    # bad password
    r = client.post("/auth/login", json={"password": "wrong"})
    assert r.status_code == 401

    # editor
    r = client.post("/auth/login", json={"password": "editor-secret"})
    assert r.status_code == 200
    assert r.json()["role"] == "editor"
    token = r.json()["token"]

    # /me without token
    r2 = client.get("/me")
    assert r2.status_code == 401

    # /me with token
    r3 = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["role"] == "editor"
    assert "exp" in r3.json()
