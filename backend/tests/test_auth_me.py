def test_login_and_me(anon):
    # /me with no session
    r0 = anon.get("/me")
    assert r0.status_code == 401

    # bad password
    r = anon.post("/auth/login", json={"username": "Editor", "password": "wrong"})
    assert r.status_code == 401
    assert anon.get("/me").status_code == 401  # a refused login sets no cookie

    # editor: the body is MeOut, the credential is the cookie (L2) — which the client's
    # jar now carries, so the next /me is a logged-in call
    r = anon.post("/auth/login", json={"username": "Editor", "password": "editor-secret"})
    assert r.status_code == 200
    assert r.json()["role"] == "editor"
    assert r.json()["player_name"] == "Editor"
    assert "token" not in r.json()

    r3 = anon.get("/me")
    assert r3.status_code == 200
    assert r3.json()["role"] == "editor"
    assert r3.json()["player_name"] == "Editor"
    assert "session_id" in r3.json()
