"""Q5 — re-assign must not be blocked by leftovers, and must not leave debris either.

The dead end this fixes: reset put a match back to `scheduled` but left its goals behind,
re-assign refused on exactly that, and nothing in the app could clear a club again. So a
2v2 schedule could be frozen for good, with deleting the tournament the only way out.
"""
import io

from sqlmodel import Session, select

from app.db import get_engine
from app.models import (
    Comment,
    CommentAuthorLink,
    CommentImageFile,
    CommentRead,
    CommentThreadLink,
    CommentVote,
    Match,
    MatchSide,
    TournamentPinnedComment,
)
from app.services.file_storage import media_exists
from tests.conftest import create_club, create_league, create_player, create_tournament, generate

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d4944415478da63fccf00000302010005a3c3f30000000049454e44ae426082"
)


def _matches(client, tid: int) -> list[dict]:
    return client.get(f"/tournaments/{tid}").json()["matches"]


def _strand_a_schedule(client, headers, tid: int, club_id: int) -> None:
    """Recreate Roli's DB: every match scheduled, but goals and clubs left on the sides.

    Written straight to the DB because the point is that rows like these exist — they were
    produced by an older reset path, and the API is not supposed to be able to make more.
    """
    with Session(get_engine()) as s:
        matches = s.exec(select(Match).where(Match.tournament_id == tid).order_by(Match.order_index)).all()
        for m in matches[:2]:
            for side in s.exec(select(MatchSide).where(MatchSide.match_id == m.id)).all():
                side.goals = 3 if side.side == "A" else 1
                side.club_id = club_id
                s.add(side)
        s.commit()


def test_reassign_clears_leftover_goals_clubs_and_timestamps(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["QA1", "QA2", "QA3", "QA4"]]
    tid = create_tournament(client, editor_headers, "q5-leftovers", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)

    league = create_league(client, admin_headers, "Q5 League")
    club = create_club(client, editor_headers, "Q5 FC", "FC26", 4.5, league)
    _strand_a_schedule(client, editor_headers, tid, club)

    # The state the old guards refused on: all scheduled, but goals and clubs left behind.
    before = _matches(client, tid)
    assert all(m["state"] == "scheduled" for m in before)
    assert any(s["goals"] != 0 for m in before for s in m["sides"])
    assert any(s["club_id"] is not None for m in before for s in m["sides"])

    r = client.post(f"/tournaments/{tid}/reassign", json={"randomize_order": False}, headers=editor_headers)
    assert r.status_code == 200, r.text

    after = _matches(client, tid)
    assert len(after) == len(before)
    for m in after:
        assert m["state"] == "scheduled"
        assert [s["goals"] for s in m["sides"]] == [0, 0]
        assert [s["club_id"] for s in m["sides"]] == [None, None]
    assert client.get(f"/tournaments/{tid}").json()["status"] == "draft"


def test_reassign_still_refuses_a_match_that_is_not_scheduled(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["QB1", "QB2", "QB3", "QB4"]]
    tid = create_tournament(client, editor_headers, "q5-played", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)

    first = _matches(client, tid)[0]
    assert client.patch(f"/matches/{first['id']}", json={"state": "playing"}, headers=editor_headers).status_code == 200
    before_ids = [m["id"] for m in _matches(client, tid)]

    r = client.post(f"/tournaments/{tid}/reassign", json={}, headers=editor_headers)
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    # The message names the match and what re-assign would have done, not "results stored".
    assert "Match 1 is playing" in detail
    assert "new schedule" in detail

    # The schedule is untouched: same match rows, same state.
    after = _matches(client, tid)
    assert [m["id"] for m in after] == before_ids
    assert after[0]["state"] == "playing"


def test_reassign_deletes_match_comments_and_keeps_tournament_wide_ones(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["QC1", "QC2", "QC3", "QC4"]]
    tid = create_tournament(client, editor_headers, "q5-comments", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)

    matches = _matches(client, tid)
    mid = matches[0]["id"]

    wide = client.post(f"/tournaments/{tid}/comments", json={"body": "good evening"}, headers=editor_headers).json()
    wide_reply = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "and a good night", "parent_comment_id": wide["id"]},
        headers=editor_headers,
    ).json()
    tied = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "what a goal", "match_id": mid},
        headers=editor_headers,
    ).json()
    tied_reply = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "offside!", "match_id": mid, "parent_comment_id": tied["id"]},
        headers=editor_headers,
    ).json()

    # Everything that hangs off a comment: an image (row + file), a vote, a read mark.
    assert client.put(
        f"/comments/{tied['id']}/image",
        files={"file": ("px.png", io.BytesIO(PNG_1PX), "image/png")},
        headers=editor_headers,
    ).status_code == 200
    assert client.put(f"/comments/{tied['id']}/vote", json={"value": 1}, headers=editor_headers).status_code == 200
    assert client.put(f"/comments/{tied['id']}/read", json={}, headers=editor_headers).status_code == 200
    assert client.put(
        f"/tournaments/{tid}/comments/pin", json={"comment_id": wide["id"]}, headers=editor_headers
    ).status_code == 200

    with Session(get_engine()) as s:
        image_path = s.get(CommentImageFile, int(tied["id"])).file_path
    assert media_exists(image_path)

    preview = client.get(f"/tournaments/{tid}/reassign-preview", headers=editor_headers).json()
    assert preview["matches"] == len(matches)
    assert preview["comments"] == 2  # the tied one and its reply, not the tournament-wide pair

    assert client.post(
        f"/tournaments/{tid}/reassign", json={"randomize_order": False}, headers=editor_headers
    ).status_code == 200

    listed = client.get(f"/tournaments/{tid}/comments").json()
    assert sorted(c["id"] for c in listed["comments"]) == sorted([wide["id"], wide_reply["id"]])
    assert listed["pinned_comment_id"] == wide["id"]

    gone = {int(tied["id"]), int(tied_reply["id"])}
    with Session(get_engine()) as s:
        assert not s.exec(select(Comment.id).where(Comment.id.in_(gone))).all()
        assert not s.exec(select(CommentImageFile.comment_id).where(CommentImageFile.comment_id.in_(gone))).all()
        assert not s.exec(select(CommentVote.comment_id).where(CommentVote.comment_id.in_(gone))).all()
        assert not s.exec(select(CommentRead.comment_id).where(CommentRead.comment_id.in_(gone))).all()
        assert not s.exec(select(CommentThreadLink.comment_id).where(CommentThreadLink.comment_id.in_(gone))).all()
        assert not s.exec(select(CommentAuthorLink.comment_id).where(CommentAuthorLink.comment_id.in_(gone))).all()
        # No comment is left pointing at a match id that no longer exists — the whole
        # reason these have to go: ids are reused, so a stale row would reattach itself.
        live_match_ids = {int(i) for i in s.exec(select(Match.id).where(Match.tournament_id == tid)).all()}
        for c in s.exec(select(Comment).where(Comment.tournament_id == tid)).all():
            assert c.match_id is None or int(c.match_id) in live_match_ids
    assert not media_exists(image_path)


def test_deleting_a_tournament_takes_its_comments_with_it(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["QD1", "QD2", "QD3"]]
    tid = create_tournament(client, editor_headers, "q5-delete", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    mid = _matches(client, tid)[0]["id"]
    wide = client.post(f"/tournaments/{tid}/comments", json={"body": "wide"}, headers=editor_headers).json()
    tied = client.post(
        f"/tournaments/{tid}/comments", json={"body": "tied", "match_id": mid}, headers=editor_headers
    ).json()
    assert client.put(
        f"/tournaments/{tid}/comments/pin", json={"comment_id": wide["id"]}, headers=editor_headers
    ).status_code == 200

    assert client.delete(f"/tournaments/{tid}", headers=admin_headers).status_code in (200, 204)

    with Session(get_engine()) as s:
        assert not s.exec(select(Comment.id).where(Comment.tournament_id == tid)).all()
        assert not s.exec(
            select(CommentAuthorLink.comment_id).where(
                CommentAuthorLink.comment_id.in_([int(wide["id"]), int(tied["id"])])
            )
        ).all()
        assert s.get(TournamentPinnedComment, tid) is None


def test_a_reset_never_leaves_goals_behind(client, editor_headers, admin_headers):
    """Every route back to `scheduled` clears the score — that is what agreeing means here.

    The match page sends the state alone (its goal steppers are disabled while scheduled),
    the current-game section sends state and goals together; both have to land the same way.
    """
    ids = [create_player(client, admin_headers, n) for n in ["QE1", "QE2", "QE3"]]
    tid = create_tournament(client, editor_headers, "q5-reset", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    league = create_league(client, admin_headers, "Q5 Reset League")
    club = create_club(client, editor_headers, "Reset FC", "FC26", 3.0, league)

    mid = _matches(client, tid)[0]["id"]
    # Same match twice: a tournament's matches have to finish in order, and both reset
    # shapes have to land the same way.
    for reset_body in (
        {"state": "scheduled"},
        {"state": "scheduled", "sideA": {"goals": 0}, "sideB": {"goals": 0}},
    ):
        assert client.patch(
            f"/matches/{mid}",
            json={
                "state": "finished",
                "sideA": {"goals": 2, "club_id": club},
                "sideB": {"goals": 1, "club_id": club},
            },
            headers=editor_headers,
        ).status_code == 200

        assert client.patch(f"/matches/{mid}", json=reset_body, headers=editor_headers).status_code == 200

        m = next(x for x in _matches(client, tid) if x["id"] == mid)
        assert m["state"] == "scheduled"
        assert [s["goals"] for s in m["sides"]] == [0, 0]
        # The clubs survive a reset: the same fixture is usually replayed with them.
        assert [s["club_id"] for s in m["sides"]] == [club, club]

        with Session(get_engine()) as s:
            row = s.get(Match, int(mid))
            assert row.started_at is None and row.finished_at is None

    # And the schedule is free again, which is the whole point.
    assert client.get(f"/tournaments/{tid}").json()["status"] == "draft"
