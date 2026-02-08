def test_stats_overview(client):
    r = client.get("/stats/overview")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "blocks" in data
    assert isinstance(data["blocks"], list)
    assert any(b.get("key") == "players" for b in data["blocks"])


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

