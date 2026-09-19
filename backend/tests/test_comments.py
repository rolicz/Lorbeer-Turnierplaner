"""The comment box must not rewrite a result that is already recorded."""

def test_a_goal_comment_cannot_rewrite_a_finished_match(client, editor_headers):
    """A finished result is corrected on the match page, never through the comment box.

    `_set_match_score` writes real goals and the goal branch never looked at the match's
    state, so a goal comment on a finished match silently rewrote a recorded result —
    and its websocket envelope carries no `global_action`, so no other device heard.
    Found by M2 while wiring `after_result_change`, closed by Roli's call (2026-09-19).
    """
    players = client.get("/players").json()
    ids = [int(p["id"]) for p in players][:3]  # 1v1 wants 3-6
    t = client.post(
        "/tournaments",
        json={"name": "Finished-match guard", "mode": "1v1", "player_ids": ids},
        headers=editor_headers,
    )
    assert t.status_code in (200, 201), t.text
    tid = t.json()["id"]
    gen = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert gen.status_code == 200, gen.text
    match_id = client.get(f"/tournaments/{tid}").json()["matches"][0]["id"]

    client.patch(f"/matches/{match_id}", json={"state": "playing"}, headers=editor_headers)
    ok = client.post(
        f"/tournaments/{tid}/comments",
        json={"text": "", "match_id": match_id, "event_type": "goal", "goal_minute": 12, "goal_player_name": "Someone", "result_score_a": 1, "result_score_b": 0},
        headers=editor_headers,
    )
    assert ok.status_code in (200, 201), ok.text  # a goal in a *playing* match is fine

    client.patch(f"/matches/{match_id}", json={"state": "finished"}, headers=editor_headers)
    refused = client.post(
        f"/tournaments/{tid}/comments",
        json={"text": "", "match_id": match_id, "event_type": "goal", "goal_minute": 40, "goal_player_name": "Someone", "result_score_a": 2, "result_score_b": 0},
        headers=editor_headers,
    )
    assert refused.status_code == 409, refused.text
    assert "match page" in refused.json()["detail"]

    after = client.get(f"/tournaments/{tid}").json()["matches"][0]
    assert [side["goals"] for side in after["sides"]] == [1, 0]  # the recorded result stands
