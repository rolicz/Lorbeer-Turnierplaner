"""
Tests for the GET /stats/ratings/history endpoint.

Key invariant: the final rating_after for each player in the history must
equal the rating returned by GET /stats/ratings for the same (mode, scope).
"""
from __future__ import annotations

from tests.conftest import create_player, create_tournament, generate


def _finish_match(client, editor_headers: dict, match_id: int, a_goals: int, b_goals: int):
    client.patch(f"/matches/{match_id}", json={"state": "playing"}, headers=editor_headers)
    client.patch(f"/matches/{match_id}", json={"goals_a": a_goals, "goals_b": b_goals, "state": "finished"}, headers=editor_headers)


def test_history_empty(client):
    r = client.get("/stats/ratings/history")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "players" in data
    assert data["players"] == []


def test_history_final_matches_ratings(client, editor_headers, admin_headers):
    """Final rating_after per player must equal /stats/ratings rating."""
    ids = [create_player(client, admin_headers, n) for n in ["H1", "H2", "H3", "H4"]]
    tid = create_tournament(client, editor_headers, "hist-t1", "1v1", ids)
    generate(client, editor_headers, tid)

    # Finish all matches.
    t = client.get(f"/tournaments/{tid}")
    assert t.status_code == 200
    for m in t.json()["matches"]:
        _finish_match(client, editor_headers, m["id"], 2, 1)

    ratings_r = client.get("/stats/ratings?mode=overall&scope=tournaments")
    assert ratings_r.status_code == 200
    history_r = client.get("/stats/ratings/history?mode=overall&scope=tournaments")
    assert history_r.status_code == 200

    ratings_by_pid = {row["player"]["id"]: row["rating"] for row in ratings_r.json()["rows"]}
    for entry in history_r.json()["players"]:
        pid = entry["player"]["id"]
        final = entry["history"][-1]["rating_after"]
        expected = ratings_by_pid.get(pid)
        assert expected is not None, f"player {pid} in history but not ratings"
        assert abs(final - expected) < 0.02, f"player {pid}: history {final} != ratings {expected}"


def test_history_delta_consistency(client, editor_headers, admin_headers):
    """rating_after[i] - rating_after[i-1] == delta[i] (within rounding)."""
    ids = [create_player(client, admin_headers, n) for n in ["D1", "D2", "D3"]]
    tid = create_tournament(client, editor_headers, "hist-t2", "1v1", ids)
    generate(client, editor_headers, tid)

    t = client.get(f"/tournaments/{tid}")
    for m in t.json()["matches"]:
        _finish_match(client, editor_headers, m["id"], 3, 0)

    r = client.get("/stats/ratings/history")
    assert r.status_code == 200
    data = r.json()
    base = data["base_rating"]
    for entry in data["players"]:
        prev = base
        for snap in entry["history"]:
            expected = round(prev + snap["delta"], 2)
            assert abs(snap["rating_after"] - expected) < 0.02, (
                f"player {entry['player']['id']}: "
                f"prev={prev} + delta={snap['delta']} != rating_after={snap['rating_after']}"
            )
            prev = snap["rating_after"]
