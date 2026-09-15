"""
R4 — a club's stars remember when they changed.

Two halves: the write (every star edit appends a row, `Club.star_rating` stays current)
and the read (a match is counted at the rating in force on the day it was played).
"""

import datetime as dt

from sqlmodel import Session, select

from app.db import get_engine
from app.models import ClubStarRating, FriendlyMatch
from app.services.club_stars import (
    SOURCE_SEED,
    StarRatingResolver,
    backfill_club_star_history,
    record_star_rating,
)
from tests.conftest import create_club, create_league, create_player, create_tournament, generate

# ---- helpers ---------------------------------------------------------------


def backdate_star_rows(club_id: int, days: int) -> None:
    """
    Move a club's recorded ratings back in time.

    The history keeps one row per club per day, so a club created and re-rated in the
    same test run would otherwise collapse into a single row — which is correct
    behaviour and useless for testing the timeline.
    """
    with Session(get_engine()) as s:
        for row in s.exec(select(ClubStarRating).where(ClubStarRating.club_id == club_id)).all():
            row.valid_from = row.valid_from - dt.timedelta(days=days)
            s.add(row)
        s.commit()


def set_friendly_date(friendly_id: int, day: dt.date) -> None:
    with Session(get_engine()) as s:
        fm = s.get(FriendlyMatch, friendly_id)
        fm.date = day
        s.add(fm)
        s.commit()


def history(client, club_id: int) -> dict:
    r = client.get(f"/clubs/{club_id}/star-history")
    assert r.status_code == 200, r.text
    return r.json()


def finished_1v1_with_club(client, admin_headers, editor_headers, *, names, club_id, tname):
    """
    One finished 1v1 match whose side A plays `club_id`.

    Returns (tournament id, match id, side A's player id, side B's player id) — a
    generated schedule decides who meets whom, so the pair comes from the match itself.
    """
    ids = [create_player(client, admin_headers, n) for n in names]
    tid = create_tournament(client, editor_headers, tname, "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    first = client.get(f"/tournaments/{tid}").json()["matches"][0]
    r = client.patch(
        f"/matches/{first['id']}",
        json={
            "state": "finished",
            "sideA": {"goals": 2, "club_id": club_id},
            "sideB": {"goals": 1},
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    sides = {s["side"]: s for s in first["sides"]}
    return tid, int(first["id"]), int(sides["A"]["players"][0]["id"]), int(sides["B"]["players"][0]["id"])


def side_stars(payload: dict, *, match_id: int | None = None, side: str = "A") -> float | None:
    matches = [m for t in payload["tournaments"] for m in t["matches"]]
    match = next(m for m in matches if match_id is None or int(m["id"]) == match_id)
    (row,) = [s for s in match["sides"] if s["side"] == side]
    return row["club_stars"]


# ---- the write path --------------------------------------------------------


def test_creating_a_club_opens_its_history(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "History League")
    cid = create_club(client, editor_headers, "Opening FC", "EA FC 26", 3.0, league_id)

    out = history(client, cid)
    assert out["current_stars"] == 3.0
    assert [e["stars"] for e in out["entries"]] == [3.0]
    assert out["entries"][0]["valid_from"] == dt.datetime.utcnow().date().isoformat()


def test_a_star_edit_appends_and_leaves_the_current_value_current(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Append League")
    cid = create_club(client, editor_headers, "Append FC", "EA FC 26", 2.0, league_id)
    backdate_star_rows(cid, 30)

    r = client.patch(f"/clubs/{cid}", json={"star_rating": 2.5}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert r.json()["star_rating"] == 2.5

    out = history(client, cid)
    assert [e["stars"] for e in out["entries"]] == [2.0, 2.5]
    assert out["current_stars"] == 2.5
    # The club row still carries the current value — nothing else in the app changes.
    listed = [c for c in client.get("/clubs").json() if c["id"] == cid]
    assert listed[0]["star_rating"] == 2.5


def test_two_edits_on_one_day_are_that_days_value_not_two_entries(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Same Day League")
    cid = create_club(client, editor_headers, "SameDay FC", "EA FC 26", 3.0, league_id)
    backdate_star_rows(cid, 10)

    client.patch(f"/clubs/{cid}", json={"star_rating": 4.0}, headers=editor_headers)
    client.patch(f"/clubs/{cid}", json={"star_rating": 4.5}, headers=editor_headers)

    out = history(client, cid)
    assert [e["stars"] for e in out["entries"]] == [3.0, 4.5]


def test_saving_the_same_rating_writes_nothing(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "No-op League")
    cid = create_club(client, editor_headers, "Noop FC", "EA FC 26", 3.0, league_id)
    backdate_star_rows(cid, 5)

    client.patch(f"/clubs/{cid}", json={"star_rating": 3.0}, headers=editor_headers)

    assert [e["stars"] for e in history(client, cid)["entries"]] == [3.0]


def test_editing_something_else_does_not_touch_the_history(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Rename League")
    cid = create_club(client, editor_headers, "Rename FC", "EA FC 26", 3.5, league_id)
    backdate_star_rows(cid, 5)

    r = client.patch(f"/clubs/{cid}", json={"name": "Renamed FC"}, headers=admin_headers)
    assert r.status_code == 200, r.text

    assert len(history(client, cid)["entries"]) == 1


def test_history_of_an_unknown_club_is_404(client):
    assert client.get("/clubs/999999/star-history").status_code == 404


def test_backfill_seeds_once_and_is_idempotent(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Backfill League")
    cid = create_club(client, editor_headers, "Backfill FC", "EA FC 26", 4.0, league_id)

    engine = get_engine()
    # The club already has its opening row from the endpoint, so a boot adds nothing.
    assert backfill_club_star_history(engine) == 0

    with Session(engine) as s:
        for row in s.exec(select(ClubStarRating).where(ClubStarRating.club_id == cid)).all():
            s.delete(row)
        s.commit()

    assert backfill_club_star_history(engine) == 1
    assert backfill_club_star_history(engine) == 0

    out = history(client, cid)
    assert [e["stars"] for e in out["entries"]] == [4.0]
    assert out["entries"][0]["source"] == SOURCE_SEED


# ---- the as-of resolution --------------------------------------------------


def _resolver() -> StarRatingResolver:
    return StarRatingResolver(
        {
            7: [
                (dt.date(2026, 3, 28), 2.0),
                (dt.date(2026, 5, 31), 2.5),
                (dt.date(2026, 9, 12), 3.0),
            ]
        },
        {7: 3.0, 8: 4.5},
    )


def test_as_of_picks_the_row_in_force():
    r = _resolver()
    assert r.as_of(7, dt.date(2026, 3, 28)) == 2.0  # the day itself
    assert r.as_of(7, dt.date(2026, 4, 30)) == 2.0  # inside the first row's reign
    assert r.as_of(7, dt.date(2026, 5, 31)) == 2.5  # the day it changed
    assert r.as_of(7, dt.date(2026, 7, 1)) == 2.5
    assert r.as_of(7, dt.date(2026, 12, 24)) == 3.0  # after the last row


def test_as_of_before_the_first_row_uses_that_first_row():
    r = _resolver()
    # Tournaments start 2025-10-18; the record starts 2026-03-28. The oldest value known
    # is the best answer there is — never today's rating, and never nothing.
    assert r.as_of(7, dt.date(2025, 10, 18)) == 2.0
    assert r.as_of(7, dt.date(2020, 1, 1)) == 2.0


def test_as_of_without_a_date_or_a_history_falls_back_to_the_current_rating():
    r = _resolver()
    assert r.as_of(7, None) == 3.0  # no date: "now" is the only date there is
    assert r.as_of(8, dt.date(2026, 1, 1)) == 4.5  # no history recorded for this club
    assert r.as_of(None, dt.date(2026, 1, 1)) is None  # a side played without a club


def test_as_of_reads_a_date_string_or_a_datetime():
    r = _resolver()
    assert r.as_of(7, "2026-06-01") == 2.5
    assert r.as_of(7, dt.datetime(2026, 6, 1, 20, 30)) == 2.5


def test_record_star_rating_can_backdate_and_stays_ordered(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Backdate League")
    cid = create_club(client, editor_headers, "Backdate FC", "EA FC 26", 3.0, league_id)

    with Session(get_engine()) as s:
        assert record_star_rating(s, cid, 1.5, valid_from=dt.date(2026, 1, 5)) is not None
        assert record_star_rating(s, cid, 2.0, valid_from=dt.date(2026, 2, 5)) is not None
        # Same value as the row before it: nothing to record.
        assert record_star_rating(s, cid, 2.0, valid_from=dt.date(2026, 3, 5)) is None
        s.commit()

    out = history(client, cid)
    assert [e["stars"] for e in out["entries"]] == [1.5, 2.0, 3.0]


# ---- stats read the rating of the day --------------------------------------


def test_a_tournament_match_counts_the_rating_of_its_own_date(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "As-Of League")
    cid = create_club(client, editor_headers, "AsOf FC", "EA FC 26", 2.0, league_id)
    backdate_star_rows(cid, 60)

    tid, mid, a_pid, b_pid = finished_1v1_with_club(
        client, admin_headers, editor_headers, names=["AO1", "AO2", "AO3"], club_id=cid, tname="as-of"
    )
    played_on = dt.datetime.utcnow().date() - dt.timedelta(days=30)
    assert client.patch(f"/tournaments/{tid}/date", json={"date": played_on.isoformat()}, headers=admin_headers).status_code == 200

    # Re-rate the club *today*: the club is worth 4.5 now, the match still counted 2.0.
    assert client.patch(f"/clubs/{cid}", json={"star_rating": 4.5}, headers=editor_headers).status_code == 200

    payload = client.get(f"/stats/player-matches?player_id={a_pid}").json()
    assert side_stars(payload, match_id=mid) == 2.0

    h2h = client.post(
        "/stats/h2h-matches",
        json={"mode": "1v1", "relation": "opposed", "left_player_ids": [a_pid], "right_player_ids": [b_pid]},
    ).json()
    assert side_stars(h2h, match_id=mid) == 2.0

    # A match played today sees the new value.
    today = dt.datetime.utcnow().date()
    client.patch(f"/tournaments/{tid}/date", json={"date": today.isoformat()}, headers=admin_headers)
    assert side_stars(client.get(f"/stats/player-matches?player_id={a_pid}").json(), match_id=mid) == 4.5


def test_a_match_older_than_the_record_counts_the_oldest_rating(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Older League")
    cid = create_club(client, editor_headers, "Older FC", "EA FC 26", 3.0, league_id)
    backdate_star_rows(cid, 30)

    tid, mid, a_pid, _b_pid = finished_1v1_with_club(
        client, admin_headers, editor_headers, names=["OL1", "OL2", "OL3"], club_id=cid, tname="older"
    )
    client.patch(f"/clubs/{cid}", json={"star_rating": 5.0}, headers=editor_headers)

    long_before = (dt.datetime.utcnow().date() - dt.timedelta(days=400)).isoformat()
    client.patch(f"/tournaments/{tid}/date", json={"date": long_before}, headers=admin_headers)

    payload = client.get(f"/stats/player-matches?player_id={a_pid}").json()
    assert side_stars(payload, match_id=mid) == 3.0


def test_a_friendly_counts_the_rating_of_its_own_date(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Friendly League")
    cid = create_club(client, editor_headers, "Friendly FC", "EA FC 26", 1.5, league_id)
    backdate_star_rows(cid, 45)

    p1 = create_player(client, admin_headers, "FS1")
    p2 = create_player(client, admin_headers, "FS2")
    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": cid,
            "clubB_id": None,
            "a_goals": 3,
            "b_goals": 1,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    fid = r.json()["id"]

    # A friendly carries its own date, not a tournament's.
    set_friendly_date(fid, dt.datetime.utcnow().date() - dt.timedelta(days=20))
    client.patch(f"/clubs/{cid}", json={"star_rating": 4.0}, headers=editor_headers)

    payload = client.get(f"/stats/player-matches?player_id={p1}&scope=friendlies").json()
    assert side_stars(payload) == 1.5

    # Moved to today, the same friendly counts the new rating.
    set_friendly_date(fid, dt.datetime.utcnow().date())
    payload = client.get(f"/stats/player-matches?player_id={p1}&scope=friendlies").json()
    assert side_stars(payload) == 4.0


def test_a_side_without_a_club_has_no_rating(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "No Club League")
    cid = create_club(client, editor_headers, "NoClub FC", "EA FC 26", 3.0, league_id)
    _tid, mid, a_pid, _b_pid = finished_1v1_with_club(
        client, admin_headers, editor_headers, names=["NC1", "NC2", "NC3"], club_id=cid, tname="no-club"
    )
    payload = client.get(f"/stats/player-matches?player_id={a_pid}").json()
    assert side_stars(payload, match_id=mid, side="B") is None


def test_odds_keep_reading_the_current_rating(client, editor_headers, admin_headers):
    """Odds are a prematch estimate — they price the club as it is today (R4)."""
    league_id = create_league(client, admin_headers, "Odds As-Of League")
    strong = create_club(client, editor_headers, "OddsStrong", "EA FC 26", 0.5, league_id)
    weak = create_club(client, editor_headers, "OddsWeak", "EA FC 26", 0.5, league_id)
    backdate_star_rows(strong, 30)
    backdate_star_rows(weak, 30)

    # The model only listens to the clubs once there are finished matches to weigh.
    ids = [create_player(client, admin_headers, n) for n in ["OD1", "OD2", "OD3"]]
    tid = create_tournament(client, editor_headers, "odds-as-of", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    for m in client.get(f"/tournaments/{tid}").json()["matches"]:
        client.patch(
            f"/matches/{m['id']}",
            json={"state": "finished", "sideA": {"goals": 2}, "sideB": {"goals": 1}},
            headers=editor_headers,
        )

    body = {
        "mode": "1v1",
        "teamA_player_ids": [ids[0]],
        "teamB_player_ids": [ids[1]],
        "clubA_id": strong,
        "clubB_id": weak,
        "state": "scheduled",
        "a_goals": 0,
        "b_goals": 0,
    }
    level = client.post("/stats/odds", json=body).json()["odds"]

    assert client.patch(f"/clubs/{strong}", json={"star_rating": 5.0}, headers=editor_headers).status_code == 200
    after = client.post("/stats/odds", json=body).json()["odds"]

    # Today's upgrade is priced in at once; the history is never consulted here.
    assert float(after["home"]) < float(level["home"])
