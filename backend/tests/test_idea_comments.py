"""Comments on an idea, the event log under them, and **who an event reaches** (P1).

Three things are being pinned here:

* the comment endpoints and their one permission rule (the author or an admin, no
  window, and the *idea's* author does not moderate other people's comments);
* the event log — written with the actor already marked read, removed when the thing
  it describes is removed;
* `services/idea_events.idea_event_audience`, which is the piece both channels trust.
  The push (P2) and the bell (P3) each import it; if they ever answered "who cares
  about this" differently, a phone would buzz for something the bell never shows and
  nobody would notice, because the two are never compared. So the audience gets its
  own section below, with the actor, the participants and the admins all exercised.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import get_engine
from app.models import (
    FeatureRequestComment,
    FeatureRequestEvent,
    FeatureRequestEventRead,
)
from app.services.idea_events import idea_event_audience, idea_event_reaches


def _create(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "title": "Dark mode for the match page",
        "body": "The score panel glows at night.",
        "kind": "feature",
        "areas": ["match"],
    }
    payload.update(overrides)
    r = client.post("/ideas", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _get(client: TestClient, idea_id: int, headers: dict | None = None) -> dict:
    r = client.get("/ideas", headers=headers or {})
    assert r.status_code == 200, r.text
    ideas = {int(i["id"]): i for i in r.json()["ideas"]}
    assert idea_id in ideas
    return ideas[idea_id]


def _comment(client: TestClient, idea_id: int, headers: dict, body: str) -> dict:
    r = client.post(f"/ideas/{idea_id}/comments", json={"body": body}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _me(client: TestClient, headers: dict) -> int:
    return int(client.get("/me", headers=headers).json()["player_id"])


def _events(idea_id: int) -> list[FeatureRequestEvent]:
    with Session(get_engine()) as s:
        return list(
            s.exec(
                select(FeatureRequestEvent)
                .where(FeatureRequestEvent.request_id == int(idea_id))
                .order_by(FeatureRequestEvent.id.asc())
            ).all()
        )


# ---- the comment list ---------------------------------------------------


def test_comments_ride_on_the_idea_payload_oldest_first(client, editor_headers, editor2_headers):
    """One payload, one query key: the board never fetches a comment separately."""
    iid = _create(client, editor_headers)["id"]
    assert _get(client, iid)["comments"] == []

    first = _comment(client, iid, editor_headers, "It is bright at night.")
    second = _comment(client, iid, editor2_headers, "Agreed, and on the dashboard too.")

    idea = _get(client, iid, editor_headers)
    bodies = [c["body"] for c in idea["comments"]]
    assert bodies == ["It is bright at night.", "Agreed, and on the dashboard too."]
    assert [c["id"] for c in idea["comments"]] == [first["id"], second["id"]]
    assert [c["author_display_name"] for c in idea["comments"]] == ["Editor", "Editor2"]
    assert all(c["request_id"] == iid for c in idea["comments"])
    # No editing anywhere: nothing ever moves `updated_at` away from `created_at`.
    assert all(c["updated_at"] == c["created_at"] for c in idea["comments"])


def test_nobody_may_not_comment_and_another_member_sees_no_comment_capabilities(client, anon, editor_headers, editor2_headers):
    iid = _create(client, editor_headers)["id"]
    c = _comment(client, iid, editor_headers, "Mine.")

    # No session: nothing at all, reading included (L2 — there is no reader any more).
    assert anon.post(f"/ideas/{iid}/comments", json={"body": "x"}).status_code == 401
    assert anon.delete(f"/ideas/comments/{c['id']}").status_code == 401
    assert anon.put(f"/ideas/{iid}/read").status_code == 401
    assert anon.get("/ideas").status_code == 401

    # A member who did not write the comment reads it and may not delete it.
    seen = next(i for i in client.get("/ideas", headers=editor2_headers).json()["ideas"] if i["id"] == iid)["comments"]
    assert [x["body"] for x in seen] == ["Mine."]
    assert seen[0]["can_delete"] is False


def test_comment_delete_is_the_author_or_an_admin_and_nobody_else(
    client, editor_headers, editor2_headers, admin_headers
):
    """The idea's author does **not** moderate other people's comments on it."""
    iid = _create(client, editor_headers)["id"]  # Editor owns the idea
    theirs = _comment(client, iid, editor2_headers, "Editor2 said this.")

    # The idea's author is not the comment's author: 403, and the flag agrees.
    assert [c["can_delete"] for c in _get(client, iid, editor_headers)["comments"]] == [False]
    assert client.delete(f"/ideas/comments/{theirs['id']}", headers=editor_headers).status_code == 403

    # Its own author may, and so may an admin.
    assert [c["can_delete"] for c in _get(client, iid, editor2_headers)["comments"]] == [True]
    assert [c["can_delete"] for c in _get(client, iid, admin_headers)["comments"]] == [True]
    assert client.delete(f"/ideas/comments/{theirs['id']}", headers=editor2_headers).status_code == 200

    other = _comment(client, iid, editor2_headers, "And this.")
    assert client.delete(f"/ideas/comments/{other['id']}", headers=admin_headers).status_code == 200
    assert _get(client, iid)["comments"] == []


def test_a_comment_has_no_delete_window(client, editor_headers):
    """A comment is a document, not a result: A10's hour does not apply (R5's rule)."""
    import datetime as dt

    iid = _create(client, editor_headers)["id"]
    c = _comment(client, iid, editor_headers, "Said a month ago.")
    with Session(get_engine()) as s:
        row = s.get(FeatureRequestComment, int(c["id"]))
        row.created_at = dt.datetime.utcnow() - dt.timedelta(days=30)
        row.updated_at = row.created_at
        s.add(row)
        s.commit()

    assert _get(client, iid, editor_headers)["comments"][0]["can_delete"] is True
    assert client.delete(f"/ideas/comments/{c['id']}", headers=editor_headers).status_code == 200


def test_comment_body_is_required_and_bounded(client, editor_headers):
    iid = _create(client, editor_headers)["id"]

    r = client.post(f"/ideas/{iid}/comments", json={"body": "   "}, headers=editor_headers)
    assert r.status_code == 400 and "required" in r.json()["detail"].lower()

    r = client.post(f"/ideas/{iid}/comments", json={"body": "x" * 2001}, headers=editor_headers)
    assert r.status_code == 400 and "2000" in r.json()["detail"]

    assert client.post("/ideas/999/comments", json={"body": "x"}, headers=editor_headers).status_code == 404
    assert client.delete("/ideas/comments/999", headers=editor_headers).status_code == 404
    assert client.put("/ideas/999/read", headers=editor_headers).status_code == 404


# ---- the event log ------------------------------------------------------


def test_events_are_recorded_with_the_actor_already_read(
    client, editor_headers, editor2_headers, admin_headers
):
    iid = _create(client, editor_headers)["id"]
    _comment(client, iid, editor2_headers, "Yes please.")
    client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)
    client.put(
        f"/ideas/{iid}/status", json={"status": "planned", "note": "after FC 27"}, headers=admin_headers
    )

    events = _events(iid)
    assert [e.kind for e in events] == ["created", "comment", "vote", "status"]
    assert [e.actor_player_id for e in events] == [
        _me(client, editor_headers),
        _me(client, editor2_headers),
        _me(client, editor2_headers),
        _me(client, admin_headers),
    ]
    assert events[1].comment_id is not None
    assert (events[3].status, events[3].status_note) == ("planned", "after FC 27")

    # Every actor already has a read row: nobody is told about their own action.
    with Session(get_engine()) as s:
        for e in events:
            assert s.get(FeatureRequestEventRead, (int(e.actor_player_id), int(e.id))) is not None


def test_unvote_removes_the_vote_event_and_a_status_resave_records_nothing(
    client, editor_headers, editor2_headers, admin_headers
):
    iid = _create(client, editor_headers)["id"]
    client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)
    assert [e.kind for e in _events(iid)] == ["created", "vote"]

    client.put(f"/ideas/{iid}/vote", json={"value": 0}, headers=editor2_headers)
    assert [e.kind for e in _events(iid)] == ["created"]

    body = {"status": "planned", "note": "soon"}
    assert client.put(f"/ideas/{iid}/status", json=body, headers=admin_headers).status_code == 200
    assert [e.kind for e in _events(iid)] == ["created", "status"]
    # The same answer saved again is not news.
    assert client.put(f"/ideas/{iid}/status", json=body, headers=admin_headers).status_code == 200
    assert [e.kind for e in _events(iid)] == ["created", "status"]
    # A different note is.
    client.put(f"/ideas/{iid}/status", json={"status": "planned", "note": "next week"}, headers=admin_headers)
    assert [e.kind for e in _events(iid)] == ["created", "status", "status"]


def test_mark_read_covers_every_event_and_is_idempotent(
    client, editor_headers, editor2_headers, admin_headers
):
    iid = _create(client, editor_headers)["id"]
    _comment(client, iid, editor2_headers, "Yes please.")
    client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)
    client.put(f"/ideas/{iid}/status", json={"status": "doing"}, headers=admin_headers)

    r = client.put(f"/ideas/{iid}/read", headers=editor_headers)
    assert r.status_code == 200
    # Everything except the one event Editor caused themselves ("created").
    assert r.json() == {"ok": True, "marked": 3}
    assert client.put(f"/ideas/{iid}/read", headers=editor_headers).json() == {"ok": True, "marked": 0}


def test_deleting_a_comment_takes_its_event(client, editor_headers, editor2_headers):
    iid = _create(client, editor_headers)["id"]
    keep = _comment(client, iid, editor2_headers, "First.")
    drop = _comment(client, iid, editor2_headers, "Second.")
    assert [e.kind for e in _events(iid)] == ["created", "comment", "comment"]

    assert client.delete(f"/ideas/comments/{drop['id']}", headers=editor2_headers).status_code == 200
    events = _events(iid)
    assert [e.kind for e in events] == ["created", "comment"]
    assert events[1].comment_id == keep["id"]
    with Session(get_engine()) as s:
        # ...and the read rows of the event that went with it.
        assert s.exec(
            select(FeatureRequestEventRead).where(
                FeatureRequestEventRead.event_id.not_in([int(e.id) for e in events])
            )
        ).all() == []


def test_deleting_an_idea_takes_comments_events_and_reads(
    client, editor_headers, editor2_headers, admin_headers
):
    iid = _create(client, editor_headers)["id"]
    _comment(client, iid, editor2_headers, "Yes please.")
    client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)
    client.put(f"/ideas/{iid}/status", json={"status": "done"}, headers=admin_headers)
    client.put(f"/ideas/{iid}/read", headers=editor_headers)

    assert client.delete(f"/ideas/{iid}", headers=editor_headers).status_code == 200
    with Session(get_engine()) as s:
        assert s.exec(select(FeatureRequestComment)).all() == []
        assert s.exec(select(FeatureRequestEvent)).all() == []
        assert s.exec(select(FeatureRequestEventRead)).all() == []


# ---- the audience: the one answer both channels use ---------------------


def test_the_actor_is_never_in_the_audience(
    client, editor_headers, editor2_headers, admin_headers
):
    """Every kind, asked with the actor in every role it can have."""
    editor = _me(client, editor_headers)
    editor2 = _me(client, editor2_headers)
    admin = _me(client, admin_headers)
    iid = _create(client, editor_headers)["id"]
    _comment(client, iid, editor_headers, "The author's own remark.")
    _comment(client, iid, editor2_headers, "And a reply.")

    with Session(get_engine()) as s:
        for kind in ("created", "comment", "vote", "status"):
            for actor in (editor, editor2, admin):
                audience = idea_event_audience(
                    s,
                    request_id=iid,
                    kind=kind,
                    actor_player_id=actor,
                    admin_player_ids=(admin,),
                )
                assert actor not in audience, (kind, actor, audience)


def test_a_comment_reaches_the_author_and_everyone_who_has_commented(
    client, editor_headers, editor2_headers, admin_headers
):
    """Participation, not permission — and an admin who said nothing hears nothing."""
    editor = _me(client, editor_headers)
    editor2 = _me(client, editor2_headers)
    admin = _me(client, admin_headers)
    iid = _create(client, editor_headers)["id"]  # Editor is the author

    with Session(get_engine()) as s:
        # Nobody has commented yet: the first comment reaches the author alone.
        assert idea_event_audience(
            s, request_id=iid, kind="comment", actor_player_id=editor2, admin_player_ids=(admin,)
        ) == [editor]

    _comment(client, iid, editor2_headers, "Editor2 joins in.")

    with Session(get_engine()) as s:
        # A third voice now reaches the author *and* the first commenter.
        assert idea_event_audience(
            s, request_id=iid, kind="comment", actor_player_id=admin
        ) == sorted([editor, editor2])
        # ...and the admin still is not addressed for having commented nowhere.
        assert admin not in idea_event_audience(
            s, request_id=iid, kind="comment", actor_player_id=editor2
        )

    # Once the admin has commented they are a participant like anyone else.
    _comment(client, iid, admin_headers, "Admin joins in.")
    with Session(get_engine()) as s:
        assert idea_event_audience(
            s, request_id=iid, kind="comment", actor_player_id=editor2
        ) == sorted([editor, admin])


def test_a_deleted_comment_drops_its_author_from_the_audience(
    client, editor_headers, editor2_headers, admin_headers
):
    """The set is read from the rows, so taking a comment back takes the voice back."""
    editor = _me(client, editor_headers)
    editor2 = _me(client, editor2_headers)
    admin = _me(client, admin_headers)
    iid = _create(client, editor_headers)["id"]

    only = _comment(client, iid, editor2_headers, "One remark.")
    also = _comment(client, iid, admin_headers, "Another voice.")
    with Session(get_engine()) as s:
        assert idea_event_audience(s, request_id=iid, kind="comment", actor_player_id=editor) == sorted(
            [editor2, admin]
        )

    assert client.delete(f"/ideas/comments/{only['id']}", headers=editor2_headers).status_code == 200
    with Session(get_engine()) as s:
        assert idea_event_audience(s, request_id=iid, kind="comment", actor_player_id=editor) == [admin]

    # A commenter with a second comment left keeps hearing the thread.
    kept = _comment(client, iid, admin_headers, "Still here.")
    assert client.delete(f"/ideas/comments/{also['id']}", headers=admin_headers).status_code == 200
    with Session(get_engine()) as s:
        assert idea_event_audience(s, request_id=iid, kind="comment", actor_player_id=editor) == [admin]
    assert client.delete(f"/ideas/comments/{kept['id']}", headers=admin_headers).status_code == 200
    with Session(get_engine()) as s:
        assert idea_event_audience(s, request_id=iid, kind="comment", actor_player_id=editor) == []


def test_a_vote_and_a_status_reach_the_idea_author_alone(
    client, editor_headers, editor2_headers, admin_headers
):
    """A like is about the idea, not the conversation; triage answers the author."""
    editor = _me(client, editor_headers)
    editor2 = _me(client, editor2_headers)
    admin = _me(client, admin_headers)
    iid = _create(client, editor_headers)["id"]
    _comment(client, iid, editor2_headers, "A commenter who must not be buzzed for a vote.")

    with Session(get_engine()) as s:
        assert idea_event_audience(s, request_id=iid, kind="vote", actor_player_id=admin) == [editor]
        assert idea_event_audience(s, request_id=iid, kind="status", actor_player_id=admin) == [editor]
        # The author's own vote or status change addresses nobody.
        assert idea_event_audience(s, request_id=iid, kind="vote", actor_player_id=editor) == []
        assert idea_event_audience(s, request_id=iid, kind="status", actor_player_id=editor) == []
        assert editor2 not in idea_event_audience(s, request_id=iid, kind="vote", actor_player_id=admin)


def test_created_reaches_the_admins_the_caller_names_and_an_unknown_kind_nobody(
    client, editor_headers, admin_headers
):
    editor = _me(client, editor_headers)
    admin = _me(client, admin_headers)
    iid = _create(client, editor_headers)["id"]

    with Session(get_engine()) as s:
        assert idea_event_audience(
            s, request_id=iid, kind="created", actor_player_id=editor, admin_player_ids=(admin,)
        ) == [admin]
        # An admin posting their own idea is not told about it.
        assert idea_event_audience(
            s, request_id=iid, kind="created", actor_player_id=admin, admin_player_ids=(admin,)
        ) == []
        # Who is an admin is the caller's business; with nobody named, nobody hears.
        assert idea_event_audience(s, request_id=iid, kind="created", actor_player_id=editor) == []
        assert idea_event_audience(s, request_id=iid, kind="huh", actor_player_id=editor) == []


def test_idea_event_reaches_answers_exactly_the_same_question(
    client, editor_headers, editor2_headers, admin_headers
):
    """The membership form is the list form asked about one person — by construction.

    P3 filters the bell with `idea_event_reaches` while P2 addresses the push from
    `idea_event_audience`; this is the test that keeps those two honest.
    """
    editor = _me(client, editor_headers)
    editor2 = _me(client, editor2_headers)
    admin = _me(client, admin_headers)
    iid = _create(client, editor_headers)["id"]
    _comment(client, iid, editor2_headers, "A participant.")
    client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)
    client.put(f"/ideas/{iid}/status", json={"status": "planned"}, headers=admin_headers)

    with Session(get_engine()) as s:
        for event in _events(iid):
            for player, is_admin in ((editor, False), (editor2, False), (admin, True)):
                audience = idea_event_audience(
                    s,
                    request_id=int(event.request_id),
                    kind=str(event.kind),
                    actor_player_id=int(event.actor_player_id),
                    admin_player_ids=(player,) if is_admin else (),
                )
                assert idea_event_reaches(
                    s, event, player_id=player, is_admin=is_admin
                ) is (player in audience), (event.kind, player)

    # The concrete answers, spelled out: the comment and the vote reach the idea's
    # author, the status too, and the admin only hears about the idea being created.
    with Session(get_engine()) as s:
        by_kind = {str(e.kind): e for e in _events(iid)}
        assert idea_event_reaches(s, by_kind["comment"], player_id=editor, is_admin=False) is True
        assert idea_event_reaches(s, by_kind["vote"], player_id=editor, is_admin=False) is True
        assert idea_event_reaches(s, by_kind["status"], player_id=editor, is_admin=False) is True
        assert idea_event_reaches(s, by_kind["created"], player_id=admin, is_admin=True) is True
        assert idea_event_reaches(s, by_kind["comment"], player_id=admin, is_admin=True) is False
        assert idea_event_reaches(s, by_kind["created"], player_id=editor2, is_admin=False) is False


def test_the_audience_takes_the_author_from_the_row_when_it_is_not_handed_one(
    client, editor_headers, editor2_headers
):
    """Both call shapes agree — P2 has the idea row, P3 has a join, P1 has neither."""
    editor = _me(client, editor_headers)
    editor2 = _me(client, editor2_headers)
    iid = _create(client, editor_headers)["id"]

    with Session(get_engine()) as s:
        looked_up = idea_event_audience(s, request_id=iid, kind="vote", actor_player_id=editor2)
        handed = idea_event_audience(
            s, request_id=iid, kind="vote", actor_player_id=editor2, idea_author_player_id=editor
        )
        assert looked_up == handed == [editor]
        # An idea that is gone addresses nobody rather than raising.
        assert idea_event_audience(s, request_id=999, kind="comment", actor_player_id=editor2) == []
