"""Unit tests for the pure stats helpers (no DB / no TestClient)."""
import datetime as dt

from app.models import Match, MatchSide, Player
from app.services.stats.registry import stats_overview
from app.services.stats.streaks import Event, _best_and_current_run
from app.stats_core import (
    compute_player_standings,
    positions_from_standings,
    unique_winner_player_id,
)


def _player(pid: int, name: str) -> Player:
    return Player(id=pid, display_name=name)


def _match(side_a: tuple[list[Player], int], side_b: tuple[list[Player], int], *, state: str = "finished") -> Match:
    a_players, a_goals = side_a
    b_players, b_goals = side_b
    m = Match(state=state)
    m.sides = [
        MatchSide(side="A", goals=a_goals, players=list(a_players)),
        MatchSide(side="B", goals=b_goals, players=list(b_players)),
    ]
    return m


# ---- compute_player_standings -----------------------------------------
def test_standings_points_and_order():
    p1, p2, p3 = _player(1, "P1"), _player(2, "P2"), _player(3, "P3")
    matches = [
        _match(([p1], 3), ([p2], 0)),  # p1 win
        _match(([p1], 1), ([p3], 1)),  # draw
        _match(([p2], 2), ([p3], 0)),  # p2 win
    ]
    rows = compute_player_standings(matches, [p1, p2, p3])
    by_id = {r["player_id"]: r for r in rows}
    assert by_id[1]["pts"] == 4  # 3 + 1
    assert by_id[2]["pts"] == 3
    assert by_id[3]["pts"] == 1
    assert rows[0]["player_id"] == 1  # sorted leader first


def test_standings_ignores_unfinished():
    p1, p2 = _player(1, "P1"), _player(2, "P2")
    rows = compute_player_standings([_match(([p1], 5), ([p2], 0), state="playing")], [p1, p2])
    assert all(r["pts"] == 0 and r["played"] == 0 for r in rows)


def test_standings_2v2_both_teammates_score():
    p1, p2, p3, p4 = (_player(i, f"P{i}") for i in (1, 2, 3, 4))
    rows = compute_player_standings([_match(([p1, p2], 2), ([p3, p4], 1))], [p1, p2, p3, p4])
    by_id = {r["player_id"]: r for r in rows}
    assert by_id[1]["pts"] == 3 and by_id[2]["pts"] == 3
    assert by_id[3]["pts"] == 0 and by_id[4]["pts"] == 0
    assert by_id[1]["gd"] == 1 and by_id[3]["gd"] == -1


# ---- positions_from_standings -----------------------------------------
def test_positions_competition_ranking():
    rows = [
        {"player_id": 1, "pts": 6, "gd": 3, "gf": 5},
        {"player_id": 2, "pts": 6, "gd": 3, "gf": 5},  # tied for 1st
        {"player_id": 3, "pts": 1, "gd": -3, "gf": 1},
    ]
    pos = positions_from_standings(rows)
    assert pos[1] == 1 and pos[2] == 1  # tie => both rank 1
    assert pos[3] == 3  # competition ranking skips 2


# ---- unique_winner_player_id ------------------------------------------
def test_unique_winner():
    rows = [
        {"player_id": 7, "pts": 6, "gd": 3, "gf": 5},
        {"player_id": 8, "pts": 3, "gd": 0, "gf": 2},
    ]
    assert unique_winner_player_id(rows) == 7


def test_no_unique_winner_on_tie():
    rows = [
        {"player_id": 7, "pts": 6, "gd": 3, "gf": 5},
        {"player_id": 8, "pts": 6, "gd": 3, "gf": 5},
    ]
    assert unique_winner_player_id(rows) is None


def test_no_winner_when_empty():
    assert unique_winner_player_id([]) is None


# ---- registry ----------------------------------------------------------
def test_stats_overview_blocks():
    overview = stats_overview()
    keys = [b["key"] for b in overview["blocks"]]
    assert keys == ["players", "h2h", "streaks", "ratings"]
    assert all({"key", "name", "version", "description"} <= set(b) for b in overview["blocks"])


# ---- streaks: _best_and_current_run -----------------------------------
def _ev(seq: int, result: str) -> Event:
    return Event(seq=seq, ts=dt.datetime(2024, 1, 1) + dt.timedelta(days=seq), match_id=seq, result=result, gf=0, ga=0)


def test_best_and_current_run_wins():
    events = [_ev(0, "win"), _ev(1, "win"), _ev(2, "loss"), _ev(3, "win")]
    best, current = _best_and_current_run(events, lambda e: e.result == "win")
    assert best.length == 2  # the initial WW
    assert current.length == 1  # trailing single W


def test_current_run_zero_when_last_fails_pred():
    events = [_ev(0, "win"), _ev(1, "win"), _ev(2, "loss")]
    best, current = _best_and_current_run(events, lambda e: e.result == "win")
    assert best.length == 2
    assert current.length == 0


def test_runs_empty_events():
    best, current = _best_and_current_run([], lambda e: True)
    assert best.length == 0 and current.length == 0
