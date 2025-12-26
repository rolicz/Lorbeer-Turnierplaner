def test_players_admin_only(client, editor_headers, admin_headers):
    # list players is public
    r = client.get("/players")
    assert r.status_code == 200

    # create player: no token
    r = client.post("/players", json={"display_name": "A"})
    assert r.status_code in (401, 403)

    # create player: editor forbidden
    r = client.post("/players", json={"display_name": "A"}, headers=editor_headers)
    assert r.status_code == 403

    # create player: admin ok
    r = client.post("/players", json={"display_name": "A"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["display_name"] == "A"
