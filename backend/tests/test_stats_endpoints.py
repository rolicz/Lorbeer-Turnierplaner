from tests.conftest import create_league, create_player, create_tournament, generate
from tests.util import backdate_tournament_finish


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


def test_stats_players_includes_last_n_goal_arrays(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["LG1", "LG2", "LG3"]]
    tid = create_tournament(client, editor_headers, "last-n-goals", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}")
    assert t.status_code == 200, t.text
    first = t.json()["matches"][0]
    mid = first["id"]
    left = int(first["sides"][0]["players"][0]["id"])
    right = int(first["sides"][1]["players"][0]["id"])

    rp = client.patch(f"/matches/{mid}", json={"state": "playing"}, headers=editor_headers)
    assert rp.status_code == 200, rp.text
    rf = client.patch(
        f"/matches/{mid}",
        json={
            "state": "finished",
            "sideA": {"goals": 4},
            "sideB": {"goals": 1},
        },
        headers=editor_headers,
    )
    assert rf.status_code == 200, rf.text

    r = client.get("/stats/players?lastN=5")
    assert r.status_code == 200, r.text
    data = r.json()
    rows = {int(row["player_id"]): row for row in data.get("players", [])}

    assert rows[left]["lastN_gf"] == [4]
    assert rows[left]["lastN_ga"] == [1]
    assert rows[right]["lastN_gf"] == [1]
    assert rows[right]["lastN_ga"] == [4]


def test_stats_players_mode_and_winner_player_id(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["W1", "W2", "W3"]]
    tid = create_tournament(client, editor_headers, "stats-mode-winner", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    detail = client.get(f"/tournaments/{tid}")
    assert detail.status_code == 200, detail.text
    matches = detail.json()["matches"]

    # Finish every match as a 0:0 draw -> tied top, no unique winner.
    for match in matches:
        r = client.patch(
            f"/matches/{match['id']}",
            json={"state": "finished", "sideA": {"goals": 0}, "sideB": {"goals": 0}},
            headers=editor_headers,
        )
        assert r.status_code == 200, r.text

    tied = client.get("/stats/players")
    assert tied.status_code == 200, tied.text
    by_id = {int(t["id"]): t for t in tied.json()["tournaments"]}
    assert by_id[tid]["mode"] == "1v1"
    assert by_id[tid]["winner_player_id"] is None

    # Tournament is now "done" (all matches finished). An editor may still set the decider
    # for one hour (A10); past that hour only an admin can, and an admin can at any time.
    p1, p2 = ids[0], ids[1]
    decider_body = {
        "type": "penalties",
        "winner_player_id": p1,
        "loser_player_id": p2,
        "winner_goals": 5,
        "loser_goals": 3,
    }
    inside_window = client.patch(f"/tournaments/{tid}/decider", json=decider_body, headers=editor_headers)
    assert inside_window.status_code == 200, inside_window.text

    backdate_tournament_finish(tid)
    blocked = client.patch(f"/tournaments/{tid}/decider", json=decider_body, headers=editor_headers)
    assert blocked.status_code == 403, blocked.text

    dec = client.patch(f"/tournaments/{tid}/decider", json=decider_body, headers=admin_headers)
    assert dec.status_code == 200, dec.text

    decided = client.get("/stats/players")
    assert decided.status_code == 200, decided.text
    by_id2 = {int(t["id"]): t for t in decided.json()["tournaments"]}
    assert by_id2[tid]["winner_player_id"] == p1


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


def test_stats_h2h_matches_endpoint_basic(client, admin_headers, editor_headers):
    ids = [create_player(client, admin_headers, n) for n in ["HM1", "HM2", "HM3"]]
    tid = create_tournament(client, editor_headers, "h2h-matches", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}")
    assert t.status_code == 200, t.text
    first = t.json()["matches"][0]
    mid = first["id"]
    left = int(first["sides"][0]["players"][0]["id"])
    right = int(first["sides"][1]["players"][0]["id"])

    rp = client.patch(f"/matches/{mid}", json={"state": "playing"}, headers=editor_headers)
    assert rp.status_code == 200, rp.text
    rf = client.patch(f"/matches/{mid}", json={"state": "finished"}, headers=editor_headers)
    assert rf.status_code == 200, rf.text

    r = client.post(
        "/stats/h2h-matches",
        json={
            "mode": "1v1",
            "relation": "opposed",
            "left_player_ids": [left],
            "right_player_ids": [right],
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "tournaments" in data
    tournaments = data["tournaments"]
    assert isinstance(tournaments, list)
    assert tournaments
    assert int(tournaments[0]["id"]) == tid
    assert tournaments[0]["matches"]


def _finish_all_matches(client, editor_headers, tournament_id: int) -> None:
    for m in client.get(f"/tournaments/{tournament_id}").json()["matches"]:
        r = client.patch(
            f"/matches/{m['id']}",
            json={"state": "finished", "sideA": {"goals": 2}, "sideB": {"goals": 1}},
            headers=editor_headers,
        )
        assert r.status_code == 200, r.text


def _match_ids(payload: dict) -> set[int]:
    return {int(m["id"]) for t in payload["tournaments"] for m in t["matches"]}


def _h2h_matches(client, **body):
    r = client.post("/stats/h2h-matches", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_stats_h2h_matches_exact_teams_and_teammates(client, admin_headers, editor_headers):
    ids = [create_player(client, admin_headers, n) for n in ["HX1", "HX2", "HX3", "HX4"]]
    tid = create_tournament(client, editor_headers, "h2h-2v2", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)
    _finish_all_matches(client, editor_headers, tid)

    matches = client.get(f"/tournaments/{tid}").json()["matches"]
    first = matches[0]
    team_a = [int(p["id"]) for p in first["sides"][0]["players"]]
    team_b = [int(p["id"]) for p in first["sides"][1]["players"]]
    assert len(team_a) == len(team_b) == 2

    def sides_of(m: dict) -> list[set[int]]:
        return [{int(p["id"]) for p in side["players"]} for side in m["sides"]]

    def opposed(m: dict, left: int, right: int) -> bool:
        a, b = sides_of(m)
        return (left in a and right in b) or (left in b and right in a)

    # Subset: one player per side matches every meeting of those two, not just the exact teams.
    subset = _h2h_matches(
        client,
        mode="2v2",
        relation="opposed",
        left_player_ids=[team_a[0]],
        right_player_ids=[team_b[0]],
        exact_teams=False,
    )
    expected_subset = {int(m["id"]) for m in matches if opposed(m, team_a[0], team_b[0])}
    assert _match_ids(subset) == expected_subset
    assert int(first["id"]) in expected_subset

    # exact_teams: the same one-per-side request matches nothing (teams are pairs).
    exact_partial = _h2h_matches(
        client,
        mode="2v2",
        relation="opposed",
        left_player_ids=[team_a[0]],
        right_player_ids=[team_b[0]],
        exact_teams=True,
    )
    assert exact_partial["tournaments"] == []

    # exact_teams with both full teams: only the meeting of exactly those two duos.
    exact_full = _h2h_matches(
        client,
        mode="2v2",
        relation="opposed",
        left_player_ids=team_a,
        right_player_ids=team_b,
        exact_teams=True,
    )
    expected_exact = {
        int(m["id"])
        for m in matches
        if sides_of(m) in ([set(team_a), set(team_b)], [set(team_b), set(team_a)])
    }
    assert _match_ids(exact_full) == expected_exact
    assert int(first["id"]) in expected_exact

    # relation=teammates: every match where the two share a side (right ids are ignored).
    mates = _h2h_matches(
        client,
        mode="2v2",
        relation="teammates",
        left_player_ids=team_a,
        right_player_ids=[],
    )
    assert mates["relation"] == "teammates"
    assert mates["right_player_ids"] == []
    expected_mates = {int(m["id"]) for m in matches if any(set(team_a) <= side for side in sides_of(m))}
    assert _match_ids(mates) == expected_mates
    assert int(first["id"]) in expected_mates
    assert expected_mates != expected_subset


def test_stats_h2h_matches_mode_and_scope_filters(client, admin_headers, editor_headers):
    ids = [create_player(client, admin_headers, n) for n in ["HY1", "HY2", "HY3", "HY4"]]
    left, right = ids[0], ids[2]

    tid_2v2 = create_tournament(client, editor_headers, "h2h-mode-2v2", "2v2", ids)
    generate(client, editor_headers, tid_2v2, randomize=False)
    _finish_all_matches(client, editor_headers, tid_2v2)

    tid_1v1 = create_tournament(client, editor_headers, "h2h-mode-1v1", "1v1", [left, right, ids[1]])
    generate(client, editor_headers, tid_1v1, randomize=False)
    _finish_all_matches(client, editor_headers, tid_1v1)

    rf = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [left],
            "teamB_player_ids": [right],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 4,
            "b_goals": 2,
        },
        headers=editor_headers,
    )
    assert rf.status_code == 200, rf.text

    base = {"relation": "opposed", "left_player_ids": [left], "right_player_ids": [right]}

    overall = _h2h_matches(client, mode="overall", **base)
    assert {int(t["id"]) for t in overall["tournaments"]} == {tid_1v1, tid_2v2}

    # mode=1v1 drops the 2v2 tournament even though both players met there.
    only_1v1 = _h2h_matches(client, mode="1v1", **base)
    assert [int(t["id"]) for t in only_1v1["tournaments"]] == [tid_1v1]
    assert {t["mode"] for t in only_1v1["tournaments"]} == {"1v1"}

    only_2v2 = _h2h_matches(client, mode="2v2", **base)
    assert [int(t["id"]) for t in only_2v2["tournaments"]] == [tid_2v2]

    # Default scope stays on tournaments; scope=both adds the friendly.
    assert only_1v1["scope"] == "tournaments"
    both = _h2h_matches(client, mode="1v1", scope="both", **base)
    assert both["scope"] == "both"
    friendlies = [t for t in both["tournaments"] if t["status"] == "friendly"]
    assert len(friendlies) == 1
    assert int(friendlies[0]["id"]) < 0
    assert len(friendlies[0]["matches"]) == 1
    assert {int(t["id"]) for t in both["tournaments"]} == {tid_1v1, int(friendlies[0]["id"])}

    only_friendlies = _h2h_matches(client, mode="1v1", scope="friendlies", **base)
    assert [t["status"] for t in only_friendlies["tournaments"]] == ["friendly"]


def test_tournament_stats_are_scoped_to_tournament(client, editor_headers, admin_headers):
    # Tournament A players
    a1 = create_player(client, admin_headers, "TA1")
    a2 = create_player(client, admin_headers, "TA2")
    a3 = create_player(client, admin_headers, "TA3")
    tid_a = create_tournament(client, editor_headers, "T-A", "1v1", [a1, a2, a3])
    generate(client, editor_headers, tid_a, randomize=False)

    # Tournament B players
    b1 = create_player(client, admin_headers, "TB1")
    b2 = create_player(client, admin_headers, "TB2")
    b3 = create_player(client, admin_headers, "TB3")
    tid_b = create_tournament(client, editor_headers, "T-B", "1v1", [b1, b2, b3])
    generate(client, editor_headers, tid_b, randomize=False)

    ra = client.get(f"/tournaments/{tid_a}/stats")
    assert ra.status_code == 200, ra.text
    names_a = {row["name"] for row in ra.json().get("players", [])}
    assert names_a == {"TA1", "TA2", "TA3"}

    rb = client.get(f"/tournaments/{tid_b}/stats")
    assert rb.status_code == 200, rb.text
    names_b = {row["name"] for row in rb.json().get("players", [])}
    assert names_b == {"TB1", "TB2", "TB3"}


def test_stats_ratings_empty(client):
    r = client.get("/stats/ratings")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "generated_at" in data
    assert data.get("mode") in ("overall", "1v1", "2v2")
    assert "rows" in data
    assert isinstance(data["rows"], list)
