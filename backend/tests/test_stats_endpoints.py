def test_stats_overview(client):
    r = client.get("/stats/overview")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "blocks" in data
    assert isinstance(data["blocks"], list)
    assert any(b.get("key") == "players" for b in data["blocks"])
    assert any(b.get("key") == "h2h" for b in data["blocks"])
    assert any(b.get("key") == "streaks" for b in data["blocks"])


def test_stats_players_empty(client):
    r = client.get("/stats/players")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "generated_at" in data
    assert "players" in data
    assert "tournaments" in data
    assert "lastN" in data
    assert isinstance(data["players"], list)
    assert isinstance(data["tournaments"], list)


def test_stats_h2h_empty(client):
    r = client.get("/stats/h2h")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "generated_at" in data
    assert "rivalries_all" in data
    assert "best_teammates_2v2" in data
    assert "team_rivalries_2v2" in data
    assert isinstance(data["rivalries_all"], list)
    assert isinstance(data["best_teammates_2v2"], list)
    assert isinstance(data["team_rivalries_2v2"], list)


def test_stats_h2h_order_param(client):
    r = client.get("/stats/h2h?order=played")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("order") in ("played", "rivalry")


def test_stats_streaks_empty(client):
    r = client.get("/stats/streaks")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "generated_at" in data
    assert "mode" in data
    assert "categories" in data
    assert isinstance(data["categories"], list)
