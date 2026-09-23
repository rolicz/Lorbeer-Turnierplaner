def test_players_admin_only(client, anon, editor_headers, admin_headers):
    # list players: any member (the shared client is logged in as Editor); nobody: 401
    r = client.get("/players")
    assert r.status_code == 200
    assert anon.get("/players").status_code == 401

    # create player: no session
    r = anon.post("/players", json={"display_name": "A"})
    assert r.status_code == 401

    # create player: editor forbidden
    r = client.post("/players", json={"display_name": "A"}, headers=editor_headers)
    assert r.status_code == 403

    # create player: admin ok
    r = client.post("/players", json={"display_name": "A"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["display_name"] == "A"
