from tests.conftest import create_player, create_tournament, generate


def _finish_tournament_with_winner(client, editor_headers, tournament_id: int, winner_id: int) -> None:
    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200, detail.text

    for match in detail.json()["matches"]:
        side_a_ids = {int(p["id"]) for p in match["sides"][0]["players"]}
        side_b_ids = {int(p["id"]) for p in match["sides"][1]["players"]}
        if winner_id in side_a_ids:
            goals_a, goals_b = 1, 0
        elif winner_id in side_b_ids:
            goals_a, goals_b = 0, 1
        else:
            goals_a, goals_b = 0, 0

        res = client.patch(
            f"/matches/{match['id']}",
            json={"state": "finished", "sideA": {"goals": goals_a}, "sideB": {"goals": goals_b}},
            headers=editor_headers,
        )
        assert res.status_code == 200, res.text


def test_tournament_list_marks_cups_at_stake(client, editor_headers, admin_headers):
    owner = create_player(client, admin_headers, "CupOwner")
    p2 = create_player(client, admin_headers, "CupOpponentA")
    p3 = create_player(client, admin_headers, "CupOpponentB")

    first_tid = create_tournament(client, editor_headers, "first cup owner", "1v1", [owner, p2, p3])
    generate(client, editor_headers, first_tid, randomize=False)
    _finish_tournament_with_winner(client, editor_headers, first_tid, owner)

    cup_res = client.get("/cup")
    assert cup_res.status_code == 200, cup_res.text
    assert cup_res.json()["owner"]["id"] == owner

    challenger_a = create_player(client, admin_headers, "CupChallengerA")
    challenger_b = create_player(client, admin_headers, "CupChallengerB")
    at_stake_tid = create_tournament(client, editor_headers, "cup at stake", "1v1", [owner, challenger_a, challenger_b])
    generate(client, editor_headers, at_stake_tid, randomize=False)

    no_stake_a = create_player(client, admin_headers, "CupNoStakeA")
    no_stake_b = create_player(client, admin_headers, "CupNoStakeB")
    no_stake_c = create_player(client, admin_headers, "CupNoStakeC")
    no_stake_tid = create_tournament(client, editor_headers, "cup not at stake", "1v1", [no_stake_a, no_stake_b, no_stake_c])

    listed = client.get("/tournaments")
    assert listed.status_code == 200, listed.text
    by_id = {int(row["id"]): row for row in listed.json()}

    first_stakes = by_id[first_tid]["cup_stakes"]
    assert any(stake["key"] == "default" and stake["owner_player_id"] == owner for stake in first_stakes)

    stakes = by_id[at_stake_tid]["cup_stakes"]
    assert any(stake["key"] == "default" and stake["owner_player_id"] == owner for stake in stakes)
    assert by_id[no_stake_tid]["cup_stakes"] == []

    player_matches = client.get(f"/stats/player-matches?player_id={owner}")
    assert player_matches.status_code == 200, player_matches.text
    stats_by_id = {int(row["id"]): row for row in player_matches.json()["tournaments"]}
    assert any(stake["key"] == "default" for stake in stats_by_id[at_stake_tid]["cup_stakes"])
