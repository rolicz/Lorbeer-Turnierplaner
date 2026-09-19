"""`GET /stats/records` — the one computation (M1).

Every test here pins a *definition*, because the danger this endpoint carries is not
that it breaks (a broken endpoint is loud) but that a record quietly starts meaning
something else while the page keeps rendering. So each record is asserted against the
`/stats/*` payload the page it lives on renders: the table records against
`/stats/ratings`' rows, the streak records against `/stats/streaks`' own list, the
titles against `/stats/players`' `winner_player_id`.
"""
from app.services.stats.records import RECORD_KEYS
from tests.conftest import create_player, create_tournament, generate

# ---- helpers -----------------------------------------------------------


def _matches(client, tid: int) -> list[dict]:
    r = client.get(f"/tournaments/{tid}")
    assert r.status_code == 200, r.text
    return r.json()["matches"]


def _finish(client, headers, mid: int, a: int, b: int) -> None:
    """Play one match out: a score only counts once the match is finished."""
    rp = client.patch(f"/matches/{mid}", json={"state": "playing"}, headers=headers)
    assert rp.status_code == 200, rp.text
    rf = client.patch(
        f"/matches/{mid}",
        json={"state": "finished", "sideA": {"goals": a}, "sideB": {"goals": b}},
        headers=headers,
    )
    assert rf.status_code == 200, rf.text


def _records(client, **params) -> dict[str, dict]:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    r = client.get(f"/stats/records{'?' + qs if qs else ''}")
    assert r.status_code == 200, r.text
    return {row["key"]: row for row in r.json()["records"]}


def _holder_ids(record: dict) -> list[int]:
    return sorted(h["player"]["id"] for h in record["holders"])


def _side_ids(match: dict, side: str) -> list[int]:
    s = next(x for x in match["sides"] if x["side"] == side)
    return sorted(p["id"] for p in s["players"])


# ---- the registry ------------------------------------------------------


def test_records_are_sixteen_in_registry_order_with_no_holders_on_an_empty_db(client):
    r = client.get("/stats/records")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert [row["key"] for row in payload["records"]] == list(RECORD_KEYS)
    assert len(RECORD_KEYS) == 16
    assert payload["finished_matches"] == 0
    assert payload["mode"] == "overall" and payload["scope"] == "tournaments"
    for row in payload["records"]:
        assert row["holders"] == [], row["key"]
        assert row["value"] is None, row["key"]
        assert row["label"] and row["explainer"] and row["path"], row["key"]


def test_record_paths_point_where_the_record_lives(client):
    by_key = _records(client)

    # table / elo -> the Table, sorted by the record's own column
    assert "sub=table" in by_key["most_points"]["path"] and "sort=pts" in by_key["most_points"]["path"]
    assert "sort=ppm" in by_key["highest_ppm"]["path"]
    assert "sort=played" in by_key["most_played"]["path"]
    assert "sort=gpm" in by_key["most_goals_per_match"]["path"]
    assert "sort=rating" in by_key["highest_elo"]["path"]

    # a streak -> the Streaks sub-view, anchored at its section
    for key in ("win_streak", "unbeaten_streak", "scoring_streak", "clean_sheet_streak"):
        assert "sub=streaks" in by_key[key]["path"] and f"record={key}" in by_key[key]["path"]

    # a title or a match record -> the Records sub-view, anchored at its section
    for key in ("most_titles", "biggest_win", "highest_scoring_match", "most_goals_one_side", "biggest_upset"):
        assert "sub=records" in by_key[key]["path"] and f"record={key}" in by_key[key]["path"]

    # the two mode-fixed Elo records name their own mode whatever was asked for
    for requested in ("overall", "1v1", "2v2"):
        rows = _records(client, mode=requested)
        assert "mode=1v1" in rows["highest_elo_1v1"]["path"]
        assert "mode=2v2" in rows["highest_elo_2v2"]["path"]
        assert f"mode={requested}" in rows["highest_elo"]["path"]
        assert "source=tournaments" in rows["highest_elo"]["path"]
    assert "source=friendlies" in _records(client, scope="friendlies")["most_points"]["path"]


# ---- table / elo -------------------------------------------------------


def test_table_records_follow_the_ratings_rows(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["T1", "T2", "T3"]]
    tid = create_tournament(client, editor_headers, "table-records", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    for m in _matches(client, tid):
        _finish(client, editor_headers, m["id"], 3, 0)

    rows = {int(r["player"]["id"]): r for r in client.get("/stats/ratings").json()["rows"]}
    by_key = _records(client)

    for key, value_of in (
        ("most_points", lambda r: float(r["pts"])),
        ("most_played", lambda r: float(r["played"])),
        ("highest_elo", lambda r: float(r["rating"])),
        ("highest_ppm", lambda r: r["pts"] / r["played"]),
        ("most_goals_per_match", lambda r: r["gf"] / r["played"]),
    ):
        played = [r for r in rows.values() if r["played"] > 0]
        top = max(value_of(r) for r in played)
        assert by_key[key]["value"] == top, key
        assert _holder_ids(by_key[key]) == sorted(int(r["player"]["id"]) for r in played if value_of(r) == top), key

    # "Most played" is the tie every round robin produces: everyone played every round.
    assert _holder_ids(by_key["most_played"]) == sorted(ids)


def test_a_player_who_never_played_holds_no_table_record(client, editor_headers, admin_headers):
    """The empty-column rule: an entry in the column, not a minimum-matches floor.

    Three players draw everything, so everyone who played sits at the base rating —
    and so does a fourth who never played. The ratings row lists them at 1000 and the
    Table would sort them to the top; the record does not follow it there.
    """
    ids = [create_player(client, admin_headers, n) for n in ["N1", "N2", "N3"]]
    newcomer = create_player(client, admin_headers, "Newcomer")
    tid = create_tournament(client, editor_headers, "all-draws", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    for m in _matches(client, tid):
        _finish(client, editor_headers, m["id"], 1, 1)

    rows = {int(r["player"]["id"]): r for r in client.get("/stats/ratings").json()["rows"]}
    assert rows[newcomer]["played"] == 0
    assert rows[newcomer]["rating"] == max(r["rating"] for r in rows.values())  # ties the top of the column

    by_key = _records(client)
    for key in ("highest_elo", "most_points", "highest_ppm", "most_played", "most_goals_per_match"):
        assert newcomer not in _holder_ids(by_key[key]), key
    # Everyone who did play and drew everything ties Highest Elo — all of them hold it.
    assert _holder_ids(by_key["highest_elo"]) == sorted(ids)
    # Nobody scored, so "most points" is a real 3-way tie on 3 draws each.
    assert _holder_ids(by_key["most_points"]) == sorted(ids)


# ---- streaks -----------------------------------------------------------


def test_streak_holders_are_the_top_ties_of_the_streaks_list(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["S1", "S2", "S3"]]
    tid = create_tournament(client, editor_headers, "streak-records", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    for m in _matches(client, tid):
        _finish(client, editor_headers, m["id"], 2, 0)

    cats = {c["key"]: c for c in client.get("/stats/streaks?limit=200").json()["categories"]}
    by_key = _records(client)

    for key in ("win_streak", "unbeaten_streak", "scoring_streak", "clean_sheet_streak"):
        runs = cats[key]["records"]
        top = runs[0]["length"]
        assert by_key[key]["value"] == float(top), key
        assert _holder_ids(by_key[key]) == sorted(r["player"]["id"] for r in runs if r["length"] == top), key
        # `ongoing` is carried through from the same run, never re-derived.
        ongoing = {r["player"]["id"]: r["ongoing"] for r in runs if r["length"] == top}
        assert {h["player"]["id"]: h["ongoing"] for h in by_key[key]["holders"]} == ongoing, key

    # A run that is still alive says so — every match here was won by side A in order.
    assert any(h["ongoing"] for h in by_key["win_streak"]["holders"])


# ---- titles ------------------------------------------------------------


def _win_everything(client, headers, tid: int, winner_id: int) -> None:
    """Finish every match so the given player wins each of theirs 5:0 and the rest draw."""
    for m in _matches(client, tid):
        a_ids = _side_ids(m, "A")
        b_ids = _side_ids(m, "B")
        if winner_id in a_ids:
            _finish(client, headers, m["id"], 5, 0)
        elif winner_id in b_ids:
            _finish(client, headers, m["id"], 0, 5)
        else:
            _finish(client, headers, m["id"], 1, 1)


def test_titles_agree_with_stats_players(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["W1", "W2", "W3"]]
    for i, winner in enumerate((ids[0], ids[0], ids[1])):
        tid = create_tournament(client, editor_headers, f"title-{i}", "1v1", ids)
        generate(client, editor_headers, tid, randomize=False)
        _win_everything(client, editor_headers, tid, winner)

    players = client.get("/stats/players").json()
    wins: dict[int, int] = {}
    for t in players["tournaments"]:
        if t["status"] == "done" and t["winner_player_id"] is not None:
            wins[t["winner_player_id"]] = wins.get(t["winner_player_id"], 0) + 1
    assert wins == {ids[0]: 2, ids[1]: 1}

    rec = _records(client)["most_titles"]
    assert rec["value"] == 2.0
    assert _holder_ids(rec) == [ids[0]]
    assert [(row["player"]["id"], row["count"], row["rank"]) for row in rec["leaders"]] == [
        (ids[0], 2, 1),
        (ids[1], 1, 2),
    ]
    # Each leader carries their most recent title.
    assert rec["leaders"][0]["latest"]["name"] == "title-1"


def test_a_tie_at_the_top_gives_two_title_holders_at_rank_one(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["V1", "V2", "V3"]]
    for i, winner in enumerate((ids[0], ids[1], ids[2])):
        tid = create_tournament(client, editor_headers, f"tie-{i}", "1v1", ids)
        generate(client, editor_headers, tid, randomize=False)
        _win_everything(client, editor_headers, tid, winner)

    rec = _records(client)["most_titles"]
    assert rec["value"] == 1.0
    assert _holder_ids(rec) == sorted(ids)
    # Competition ranking: three on one title each are all rank 1.
    assert {row["rank"] for row in rec["leaders"]} == {1}


# ---- match superlatives ------------------------------------------------


def test_match_records_name_the_right_sides(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["M1", "M2", "M3"]]
    tid = create_tournament(client, editor_headers, "match-records", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    ms = _matches(client, tid)
    # 7:0 is the biggest win and the biggest single-side tally; 5:4 is the goal fest.
    _finish(client, editor_headers, ms[0]["id"], 7, 0)
    _finish(client, editor_headers, ms[1]["id"], 5, 4)
    _finish(client, editor_headers, ms[2]["id"], 1, 0)

    by_key = _records(client)
    blowout_a = _side_ids(ms[0], "A")
    fest_a, fest_b = _side_ids(ms[1], "A"), _side_ids(ms[1], "B")

    assert by_key["biggest_win"]["value"] == 7.0
    assert _holder_ids(by_key["biggest_win"]) == blowout_a  # the winners only
    assert [m["match"]["id"] for m in by_key["biggest_win"]["matches"]] == [ms[0]["id"]]

    assert by_key["most_goals_one_side"]["value"] == 7.0
    assert _holder_ids(by_key["most_goals_one_side"]) == blowout_a  # the side that scored it

    # Both sides hold the goal fest — the loser of a 5:4 made it too (Roli).
    assert by_key["highest_scoring_match"]["value"] == 9.0
    assert _holder_ids(by_key["highest_scoring_match"]) == sorted(fest_a + fest_b)
    assert [m["match"]["id"] for m in by_key["highest_scoring_match"]["matches"]] == [ms[1]["id"]]

    # A record match row is a `/stats/player-matches` row: same fields, same club_stars key.
    row = by_key["biggest_win"]["matches"][0]
    assert row["tournament"]["id"] == tid and row["tournament"]["status"] in ("done", "live")
    assert {"id", "leg", "order_index", "state", "started_at", "finished_at", "sides"} <= set(row["match"])
    assert "club_stars" in row["match"]["sides"][0]


def test_the_favourite_winning_is_not_an_upset(client, editor_headers, admin_headers):
    """`biggest_upset` needs a positive Elo gap; a one-sided tournament has none."""
    ids = [create_player(client, admin_headers, n) for n in ["U1", "U2", "U3"]]
    tid = create_tournament(client, editor_headers, "no-upset", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    ms = _matches(client, tid)
    # Every match is won by the player who is already ahead: no underdog ever wins.
    _finish(client, editor_headers, ms[0]["id"], 3, 0)

    rec = _records(client)["biggest_upset"]
    assert rec["value"] is None and rec["holders"] == [] and rec["matches"] == []


def test_an_underdog_win_is_the_upset_and_the_winners_hold_it(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["X1", "X2", "X3"]]
    tid = create_tournament(client, editor_headers, "upset", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    ms = _matches(client, tid)
    for m in ms:
        _finish(client, editor_headers, m["id"], 3, 0)

    ratings = {int(r["player"]["id"]): r["rating"] for r in client.get("/stats/ratings").json()["rows"]}
    rec = _records(client)["biggest_upset"]
    if rec["holders"]:
        # Whatever the schedule produced, the record match must be a win by the lower-rated side.
        row = rec["matches"][0]
        winners = _holder_ids(rec)
        losers = [
            p["id"]
            for s in row["match"]["sides"]
            for p in s["players"]
            if p["id"] not in winners
        ]
        assert sum(ratings[i] for i in losers) / len(losers) > sum(ratings[i] for i in winners) / len(winners)
        assert rec["value"] > 0


# ---- scope -------------------------------------------------------------


def test_friendlies_scope_has_no_titles_and_negative_tournament_ids(client, editor_headers, admin_headers):
    p1 = create_player(client, admin_headers, "FR1")
    p2 = create_player(client, admin_headers, "FR2")
    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 6,
            "b_goals": 2,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    by_key = _records(client, scope="friendlies")
    assert by_key["most_titles"]["leaders"] == [] and by_key["most_titles"]["holders"] == []

    win = by_key["biggest_win"]
    assert win["value"] == 4.0 and _holder_ids(win) == [p1]
    row = win["matches"][0]
    # A friendly is grouped under the same pseudo-tournament /stats/player-matches uses.
    assert row["tournament"]["id"] < 0 and row["tournament"]["status"] == "friendly"
    assert row["tournament"]["name"].startswith("Friendly #")
    assert row["match"]["id"] >= 2_000_000_000

    # `scope=tournaments` — every badge, no exceptions — never sees it.
    assert _records(client)["biggest_win"]["holders"] == []


def test_player_matches_output_is_unchanged_by_the_lift(client, editor_headers, admin_headers):
    """The three dict builders moved to module level (M1); the wire shape did not.

    Asserted against the fields rather than a literal blob, so this fails on a changed
    *contract* and not on a new tournament name.
    """
    ids = [create_player(client, admin_headers, n) for n in ["L1", "L2", "L3"]]
    tid = create_tournament(client, editor_headers, "lift", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    _finish(client, editor_headers, _matches(client, tid)[0]["id"], 2, 1)
    client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [ids[0]],
            "teamB_player_ids": [ids[1]],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 1,
            "b_goals": 0,
        },
        headers=editor_headers,
    )

    payload = client.get(f"/stats/player-matches?player_id={ids[0]}&scope=both").json()
    assert set(payload) == {"generated_at", "scope", "player", "tournaments"}
    groups = {g["status"]: g for g in payload["tournaments"]}
    assert set(groups) == {"live", "friendly"}

    real = groups["live"]
    assert set(real) >= {"id", "name", "date", "mode", "status", "cup_stakes", "matches"}
    assert real["id"] == tid
    friendly = groups["friendly"]
    assert friendly["id"] == -(1_000_000 + (friendly["matches"][0]["id"] - 2_000_000_000))
    assert friendly["name"].startswith("Friendly #")
    assert friendly.get("cup_stakes") is None

    for group in payload["tournaments"]:
        for m in group["matches"]:
            assert set(m) == {"id", "leg", "order_index", "state", "started_at", "finished_at", "sides"}
            for side in m["sides"]:
                assert set(side) == {"id", "side", "club_id", "club_stars", "goals", "players"}
                for p in side["players"]:
                    assert set(p) == {"id", "display_name"}
