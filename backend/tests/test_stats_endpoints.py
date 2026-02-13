from tests.conftest import create_league
from tests.conftest import create_player, create_tournament, generate


def test_stats_overview(client):
    r = client.get("/stats/overview")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "blocks" in data
    assert isinstance(data["blocks"], list)
    assert any(b.get("key") == "players" for b in data["blocks"])
    assert any(b.get("key") == "h2h" for b in data["blocks"])
    assert any(b.get("key") == "streaks" for b in data["blocks"])
    assert any(b.get("key") == "ratings" for b in data["blocks"])


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


def test_stats_players_includes_live_tournament_when_matches_finished(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["S1", "S2", "S3"]]
    tid = create_tournament(client, editor_headers, "stats-live", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    # No finished match yet -> should not appear in per-tournament trends.
    before = client.get("/stats/players")
    assert before.status_code == 200, before.text
    tids_before = {int(t["id"]) for t in before.json().get("tournaments", [])}
    assert tid not in tids_before

    t = client.get(f"/tournaments/{tid}")
    assert t.status_code == 200, t.text
    first_mid = t.json()["matches"][0]["id"]

    # Mark one match finished while tournament remains live.
    rp = client.patch(f"/matches/{first_mid}", json={"state": "playing"}, headers=editor_headers)
    assert rp.status_code == 200, rp.text
    rf = client.patch(f"/matches/{first_mid}", json={"state": "finished"}, headers=editor_headers)
    assert rf.status_code == 200, rf.text

    t_live = client.get(f"/tournaments/{tid}")
    assert t_live.status_code == 200, t_live.text
    assert t_live.json()["status"] == "live"

    after = client.get("/stats/players")
    assert after.status_code == 200, after.text
    tids_after = {int(t["id"]) for t in after.json().get("tournaments", [])}
    assert tid in tids_after


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


def test_stats_player_matches_requires_player_id(client):
    r = client.get("/stats/player-matches")
    assert r.status_code in (400, 422), r.text


def test_stats_odds_endpoint_basic(client, admin_headers, editor_headers):
    league_id = create_league(client, admin_headers, "Odds League")

    p1 = client.post("/players", json={"display_name": "OA"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "OB"}, headers=admin_headers).json()["id"]

    c_strong = client.post(
        "/clubs",
        json={"name": "Strong", "game": "EA FC 26", "star_rating": 5.0, "league_id": league_id},
        headers=editor_headers,
    ).json()["id"]
    c_weak = client.post(
        "/clubs",
        json={"name": "Weak", "game": "EA FC 26", "star_rating": 0.5, "league_id": league_id},
        headers=editor_headers,
    ).json()["id"]

    r = client.post(
        "/stats/odds",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": c_strong,
            "clubB_id": c_weak,
            "state": "scheduled",
            "a_goals": 0,
            "b_goals": 0,
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    odds = data.get("odds")
    assert isinstance(odds, dict)
    assert float(odds.get("home")) >= 1.01
    assert float(odds.get("draw")) >= 1.01
    assert float(odds.get("away")) >= 1.01


def test_stats_ratings_empty(client):
    r = client.get("/stats/ratings")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "generated_at" in data
    assert data.get("mode") in ("overall", "1v1", "2v2")
    assert "rows" in data
    assert isinstance(data["rows"], list)
