"""The Ideas board (R5): the permission matrix, the area rules and the admin push.

The matrix is the point of this file. Every verb is tried by all four callers —
a reader with no token, a logged-in player who did not write the idea, the author,
and an admin — and the payload's `can_*` flags are asserted to agree with the
status codes, because the page renders its controls from those flags.
"""
from __future__ import annotations

import io

from fastapi.testclient import TestClient


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


def _png() -> bytes:
    # 1x1 transparent PNG.
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000a49444154789c6360000002000100ffff03000006000557bfabd400"
        "00000049454e44ae426082"
    )


# ---- reading is public --------------------------------------------------


def test_another_member_can_read_and_gets_no_capabilities(client, anon, editor_headers, editor2_headers):
    created = _create(client, editor_headers)

    # No session: no board (L2 — there is no reader any more).
    assert anon.get("/ideas").status_code == 401

    r = client.get("/ideas", headers=editor2_headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["ideas"]) == 1
    idea = body["ideas"][0]
    assert idea["title"] == "Dark mode for the match page"
    assert idea["author_display_name"] == "Editor"
    assert idea["areas"] == ["match"]
    assert idea["status"] == "new"
    assert idea["votes"] == 0 and idea["my_vote"] == 0
    assert idea["can_edit"] is False
    assert idea["can_delete"] is False
    assert idea["can_set_status"] is False
    assert idea["id"] == created["id"]


def test_area_catalog_is_public_and_labels_every_key(client):
    r = client.get("/ideas/areas")
    assert r.status_code == 200
    areas = r.json()["areas"]
    keys = [a["key"] for a in areas]
    assert keys[:2] == ["general", "several"]
    assert "stats" in keys and "match" in keys
    assert all(a["label"] for a in areas)
    assert all(a["selectable"] for a in areas)


# ---- the permission matrix ---------------------------------------------


def test_nobody_may_write_anything(client, anon, editor_headers):
    idea = _create(client, editor_headers)
    iid = idea["id"]

    assert anon.post("/ideas", json={"title": "x", "areas": ["stats"]}).status_code == 401
    assert anon.patch(f"/ideas/{iid}", json={"title": "x"}).status_code == 401
    assert anon.delete(f"/ideas/{iid}").status_code == 401
    assert anon.put(f"/ideas/{iid}/vote", json={"value": 1}).status_code == 401
    assert anon.put(f"/ideas/{iid}/status", json={"status": "done"}).status_code == 401
    assert anon.put(f"/ideas/{iid}/image", files={"file": ("a.png", _png(), "image/png")}).status_code == 401


def test_logged_in_non_author_may_create_and_vote_but_not_edit(client, editor_headers, editor2_headers):
    idea = _create(client, editor_headers)
    iid = idea["id"]

    # Their own idea is fine.
    mine = _create(client, editor2_headers, title="Friendlies need a filter", areas=["friendlies"])
    assert mine["author_display_name"] == "Editor2"

    # Someone else's is not.
    assert client.patch(f"/ideas/{iid}", json={"title": "hijack"}, headers=editor2_headers).status_code == 403
    assert client.delete(f"/ideas/{iid}", headers=editor2_headers).status_code == 403
    assert client.put(f"/ideas/{iid}/status", json={"status": "done"}, headers=editor2_headers).status_code == 403
    assert (
        client.put(f"/ideas/{iid}/image", files={"file": ("a.png", _png(), "image/png")}, headers=editor2_headers).status_code
        == 403
    )

    # Voting on it is.
    assert client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers).status_code == 200

    seen = _get(client, iid, editor2_headers)
    assert seen["votes"] == 1 and seen["my_vote"] == 1
    assert seen["can_edit"] is False and seen["can_delete"] is False and seen["can_set_status"] is False


def test_only_a_text_edit_makes_an_idea_edited(client, editor_headers, admin_headers):
    """A status change is not an edit — the byline must not claim the author rewrote it."""
    iid = _create(client, editor_headers)["id"]
    assert _get(client, iid)["edited_at"] is None

    client.put(f"/ideas/{iid}/status", json={"status": "planned", "note": "soon"}, headers=admin_headers)
    after_status = _get(client, iid)
    assert after_status["edited_at"] is None
    assert after_status["updated_at"] > after_status["created_at"]

    client.put(f"/ideas/{iid}/image", files={"file": ("s.png", _png(), "image/png")}, headers=editor_headers)
    assert _get(client, iid)["edited_at"] is None

    client.patch(f"/ideas/{iid}", json={"body": "rewritten"}, headers=editor_headers)
    assert _get(client, iid)["edited_at"] is not None


def test_author_may_edit_and_delete_their_own(client, editor_headers):
    idea = _create(client, editor_headers)
    iid = idea["id"]
    assert idea["can_edit"] is True and idea["can_delete"] is True and idea["can_set_status"] is False

    r = client.patch(
        f"/ideas/{iid}",
        json={"title": "Dark mode everywhere", "kind": "change", "areas": ["several"]},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    patched = r.json()
    assert patched["title"] == "Dark mode everywhere"
    assert patched["kind"] == "change"
    assert patched["areas"] == ["several"]

    # ...but not the status: that is the admin's answer, not the asker's.
    assert client.put(f"/ideas/{iid}/status", json={"status": "planned"}, headers=editor_headers).status_code == 403

    assert client.delete(f"/ideas/{iid}", headers=editor_headers).status_code == 200
    assert client.get("/ideas").json()["ideas"] == []


def test_author_edit_has_no_time_window(client, editor_headers):
    """An idea is a document, not a result: A10's hour does not apply to it."""
    import datetime as dt

    from sqlmodel import Session

    from app.db import get_engine
    from app.models import FeatureRequest

    iid = _create(client, editor_headers)["id"]
    with Session(get_engine()) as s:
        fr = s.get(FeatureRequest, iid)
        fr.created_at = dt.datetime.utcnow() - dt.timedelta(days=30)
        fr.updated_at = fr.created_at
        s.add(fr)
        s.commit()

    assert client.patch(f"/ideas/{iid}", json={"body": "still mine"}, headers=editor_headers).status_code == 200
    assert _get(client, iid, editor_headers)["can_edit"] is True


def test_admin_may_do_anything_including_status(client, editor_headers, admin_headers):
    iid = _create(client, editor_headers)["id"]

    seen = _get(client, iid, admin_headers)
    assert seen["can_edit"] is True and seen["can_delete"] is True and seen["can_set_status"] is True

    r = client.patch(f"/ideas/{iid}", json={"body": "rewritten by admin"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["body"] == "rewritten by admin"

    r = client.put(
        f"/ideas/{iid}/status",
        json={"status": "declined", "note": "Stats already answers this"},
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "declined"
    assert r.json()["status_note"] == "Stats already answers this"

    assert client.delete(f"/ideas/{iid}", headers=admin_headers).status_code == 200


def test_status_must_be_a_known_value(client, editor_headers, admin_headers):
    iid = _create(client, editor_headers)["id"]
    assert client.put(f"/ideas/{iid}/status", json={"status": "maybe"}, headers=admin_headers).status_code == 400
    for status in ("new", "planned", "doing", "done", "declined"):
        assert client.put(f"/ideas/{iid}/status", json={"status": status}, headers=admin_headers).status_code == 200


# ---- voting -------------------------------------------------------------


def test_vote_toggles_and_counts_once_per_player(client, editor_headers, editor2_headers, admin_headers):
    iid = _create(client, editor_headers)["id"]

    for headers in (editor_headers, editor2_headers, admin_headers):
        assert client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=headers).status_code == 200
    # Voting twice is not two votes.
    assert client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor_headers).status_code == 200
    assert _get(client, iid)["votes"] == 3

    r = client.put(f"/ideas/{iid}/vote", json={"value": 0}, headers=editor_headers)
    assert r.status_code == 200 and r.json()["value"] == 0
    assert _get(client, iid, editor_headers)["my_vote"] == 0
    assert _get(client, iid)["votes"] == 2

    voters = client.get(f"/ideas/{iid}/voters").json()
    assert sorted(v["display_name"] for v in voters["upvoters"]) == ["Admin", "Editor2"]
    assert voters["downvoters"] == []


def test_an_idea_takes_no_downvote(client, editor_headers, editor2_headers):
    iid = _create(client, editor_headers)["id"]
    assert client.put(f"/ideas/{iid}/vote", json={"value": -1}, headers=editor2_headers).status_code == 400


# ---- the areas ----------------------------------------------------------


def test_areas_are_required_validated_and_kept_in_catalog_order(client, editor_headers):
    assert client.post("/ideas", json={"title": "x", "areas": []}, headers=editor_headers).status_code == 400
    assert client.post("/ideas", json={"title": "x", "areas": ["nowhere"]}, headers=editor_headers).status_code == 400

    idea = _create(client, editor_headers, areas=["stats", "dashboard", "stats"])
    assert idea["areas"] == ["dashboard", "stats"]


def test_a_scope_answer_stands_alone(client, editor_headers):
    for scope in ("general", "several"):
        r = client.post(
            "/ideas", json={"title": "x", "areas": [scope, "stats"]}, headers=editor_headers
        )
        assert r.status_code == 400, r.text
        assert "cannot be combined" in r.json()["detail"]
    assert _create(client, editor_headers, areas=["general"])["areas"] == ["general"]


def test_a_retired_area_still_labels_old_requests_but_cannot_be_chosen(client, editor_headers, monkeypatch):
    """The point of the string column: the app may drop a page, the idea survives it."""
    from app import feature_areas

    iid = _create(client, editor_headers, areas=["stats"])["id"]

    retired = tuple(
        feature_areas.AreaDef(a.key, a.label, retired=(a.key == "stats")) for a in feature_areas.AREA_DEFS
    )
    monkeypatch.setattr(feature_areas, "AREA_DEFS", retired)
    monkeypatch.setattr(feature_areas, "_BY_KEY", {a.key: a for a in retired})

    # The old request keeps its area and its label.
    assert _get(client, iid)["areas"] == ["stats"]
    catalog = {a["key"]: a for a in client.get("/ideas/areas").json()["areas"]}
    assert catalog["stats"]["label"] == "Stats"
    assert catalog["stats"]["selectable"] is False

    # A new one cannot name it any more.
    r = client.post("/ideas", json={"title": "x", "areas": ["stats"]}, headers=editor_headers)
    assert r.status_code == 400
    assert "no longer available" in r.json()["detail"]


# ---- validation ---------------------------------------------------------


def test_title_is_required_and_bounded(client, editor_headers):
    assert client.post("/ideas", json={"title": "   ", "areas": ["stats"]}, headers=editor_headers).status_code == 400
    assert (
        client.post("/ideas", json={"title": "x" * 200, "areas": ["stats"]}, headers=editor_headers).status_code == 400
    )
    assert client.post("/ideas", json={"title": "x", "kind": "wish", "areas": ["stats"]}, headers=editor_headers).status_code == 400


# ---- the image ----------------------------------------------------------


def test_image_upload_read_and_delete_follow_the_edit_rule(client, editor_headers, editor2_headers, admin_headers):
    iid = _create(client, editor_headers)["id"]

    assert client.get(f"/ideas/{iid}/image").status_code == 404

    r = client.put(f"/ideas/{iid}/image", files={"file": ("shot.png", io.BytesIO(_png()), "image/png")}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert r.json()["has_image"] is True

    got = client.get(f"/ideas/{iid}/image")
    assert got.status_code == 200 and got.headers["content-type"].startswith("image/png")
    assert _get(client, iid)["has_image"] is True

    # A stranger cannot replace or remove it; the admin can.
    assert client.delete(f"/ideas/{iid}/image", headers=editor2_headers).status_code == 403
    assert client.delete(f"/ideas/{iid}/image", headers=admin_headers).status_code == 200
    assert client.get(f"/ideas/{iid}/image").status_code == 404
    assert _get(client, iid)["has_image"] is False


def test_deleting_an_idea_takes_its_image_areas_and_votes(client, editor_headers, editor2_headers):
    from sqlmodel import Session, select

    from app.db import get_engine
    from app.models import FeatureRequestArea, FeatureRequestImageFile, FeatureRequestVote

    iid = _create(client, editor_headers, areas=["stats", "players"])["id"]
    client.put(f"/ideas/{iid}/image", files={"file": ("s.png", _png(), "image/png")}, headers=editor_headers)
    client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)

    assert client.delete(f"/ideas/{iid}", headers=editor_headers).status_code == 200
    with Session(get_engine()) as s:
        assert s.exec(select(FeatureRequestArea).where(FeatureRequestArea.request_id == iid)).all() == []
        assert s.exec(select(FeatureRequestVote).where(FeatureRequestVote.request_id == iid)).all() == []
        assert s.get(FeatureRequestImageFile, iid) is None


# ---- the push to the admin ---------------------------------------------


def test_a_new_idea_is_pushed_to_the_admins_only_and_never_to_its_author(client, editor_headers, admin_headers):
    sent: list[tuple[int, object]] = []

    class _Recorder:
        def enqueue(self, message):  # pragma: no cover - the wrong path
            sent.append((-1, message))

        def enqueue_for_player(self, player_id, message):  # pragma: no cover - fallback path
            sent.append((int(player_id), message))

        def enqueue_personal_for_player(self, player_id, message):
            sent.append((int(player_id), message))

    client.app.state.push_dispatcher = _Recorder()

    admin_id = client.get("/me", headers=admin_headers).json()["player_id"]
    editor_id = client.get("/me", headers=editor_headers).json()["player_id"]

    _create(client, editor_headers, title="Ideas page", kind="bug", areas=["stats", "players"])
    assert [pid for pid, _ in sent] == [admin_id]
    message = sent[0][1]
    assert message.event_type == "idea_created"
    assert message.path.startswith("/g/altherren/ideas?idea=")
    assert message.text_context["author_name"] == "Editor"
    assert message.text_context["title"] == "Ideas page"
    assert message.text_context["meta_line"] == "Bug · Stats, Players"
    # Every language renders, and the default one says who and what.
    for language in ("steirisch", "deutsch", "english"):
        payload = message.to_payload(language)
        assert "Editor" in payload["title"]
        assert "Ideas page" in payload["body"]
        assert "Bug · Stats, Players" in payload["body"]

    # The admin posting their own idea is not told about it.
    sent.clear()
    _create(client, admin_headers, title="Admin's own", areas=["general"])
    assert sent == []
    assert admin_id != editor_id


def test_idea_push_reaches_the_default_notification_mode(client):
    """`idea_created` is a personal event, so a default subscription still gets it."""
    from app.services.notifications import FINISHED_ONLY_EVENT_TYPES, PERSONAL_DEFAULT_EVENT_TYPES

    assert "idea_created" in PERSONAL_DEFAULT_EVENT_TYPES
    assert "idea_created" not in FINISHED_ONLY_EVENT_TYPES


def test_admin_player_ids_matches_accounts_case_insensitively(client, admin_headers):
    from sqlmodel import Session

    from app.db import get_engine
    from app.services.notifications import admin_player_ids

    class _Req:
        app = client.app

    with Session(get_engine()) as s:
        ids = admin_player_ids(_Req(), s)
    assert ids == [client.get("/me", headers=admin_headers).json()["player_id"]]


def test_the_idea_push_is_delivered_to_the_admin_devices_in_each_language(client, editor_headers, admin_headers, monkeypatch):
    """The other half of the chain: the queued message actually reaches the right devices.

    The real `NotificationDispatcher` runs, with only the HTTPS POST faked — so the
    subscription lookup, the per-device mode filter and the per-device language all
    do their real work. (`cryptography` is not installed on the dev Pi, so the
    encryption itself is the one step a local run cannot exercise.)
    """
    import asyncio

    from sqlmodel import Session

    from app.db import get_engine
    from app.models import PushSubscription, PushSubscriptionPreference
    from app.services import notifications as notifications_service
    from app.services.notifications import NotificationDispatcher
    from app.settings import Settings

    admin_id = client.get("/me", headers=admin_headers).json()["player_id"]
    editor_id = client.get("/me", headers=editor_headers).json()["player_id"]

    with Session(get_engine()) as s:
        rows = []
        for language in ("steirisch", "deutsch", "english"):
            row = PushSubscription(
                player_id=admin_id,
                endpoint=f"https://push.example.test/admin-{language}",
                endpoint_hash=f"admin-{language}",
                p256dh="p256dh",
                auth="auth",
            )
            s.add(row)
            rows.append((row, language))
        editor_row = PushSubscription(
            player_id=editor_id,
            endpoint="https://push.example.test/editor",
            endpoint_hash="editor",
            p256dh="p256dh",
            auth="auth",
        )
        s.add(editor_row)
        s.flush()
        for row, language in rows:
            s.add(PushSubscriptionPreference(subscription_id=int(row.id), notification_language=language))
        s.commit()

    queued: list[tuple[int, object]] = []

    class _Recorder:
        def enqueue(self, message):  # pragma: no cover - the wrong path
            queued.append((-1, message))

        def enqueue_for_player(self, player_id, message):  # pragma: no cover - fallback path
            queued.append((int(player_id), message))

        def enqueue_personal_for_player(self, player_id, message):
            queued.append((int(player_id), message))

    client.app.state.push_dispatcher = _Recorder()
    _create(client, editor_headers, title="One dialog everywhere", kind="change", areas=["general"])
    assert [pid for pid, _ in queued] == [admin_id]

    sent: list[tuple[str, str, str]] = []

    async def fake_send(http_client, config, subscription, payload):
        sent.append((str(subscription.endpoint), payload["title"], payload["body"]))

        class FakeResponse:
            status_code = 201
            text = ""

        return FakeResponse()

    monkeypatch.setattr(notifications_service, "send_web_push_message", fake_send)

    async def run() -> None:
        dispatcher = NotificationDispatcher(
            get_engine(),
            Settings(
                db_url="sqlite://",
                player_accounts=(),
                log_level="DEBUG",
                push_vapid_public_key="test-public-key",
                push_vapid_private_key="test-private-key",
                push_vapid_subject="mailto:test@example.com",
            ),
        )
        dispatcher._client = object()
        dispatcher._runtime_ready = True
        for player_id, message in queued:
            await dispatcher._deliver(
                notifications_service._QueuedPushMessage(
                    message=message, player_id=player_id, default_mode_player_id=player_id
                )
            )

    asyncio.run(run())

    endpoints = sorted(endpoint for endpoint, _, _ in sent)
    assert endpoints == [
        "https://push.example.test/admin-deutsch",
        "https://push.example.test/admin-english",
        "https://push.example.test/admin-steirisch",
    ]
    by_endpoint = {endpoint: (title, body) for endpoint, title, body in sent}
    assert by_endpoint["https://push.example.test/admin-english"][0] == "New idea from Editor"
    assert by_endpoint["https://push.example.test/admin-deutsch"][0] == "Neue Idee von Editor"
    assert by_endpoint["https://push.example.test/admin-steirisch"][0] == "A neiche Idee vo Editor"
    for title, body in by_endpoint.values():
        assert "One dialog everywhere" in body
        assert "Change · Not about one page" in body


# ---- P2: push for a comment, a vote, and a status ------------------------
#
# Audience for all three comes from `idea_event_audience` (P1) — imported, never
# re-derived. For a two-person thread (author + one commenter/voter/admin) that
# collapses to "the author alone", which is what these tests see; the "everyone who
# has already commented" half of the `comment` rule is P1's own audience matrix
# (`test_idea_comments.py`), not re-proven here.


def test_a_comment_a_vote_and_a_status_are_pushed_to_the_idea_author_only(
    client, editor_headers, editor2_headers, admin_headers
):
    sent: list[tuple[int, object]] = []

    class _Recorder:
        def enqueue(self, message):  # pragma: no cover - the wrong path
            sent.append((-1, message))

        def enqueue_for_player(self, player_id, message):  # pragma: no cover - fallback path
            sent.append((int(player_id), message))

        def enqueue_personal_for_player(self, player_id, message):
            sent.append((int(player_id), message))

    client.app.state.push_dispatcher = _Recorder()

    editor_id = client.get("/me", headers=editor_headers).json()["player_id"]

    idea = _create(client, editor_headers, title="Filter the friendlies list")
    iid = idea["id"]
    sent.clear()  # drop the "created" push to the admins — not this test's subject

    # A comment from someone else reaches the author (nobody else has said
    # anything in this thread yet, so the audience is just the author).
    r = client.post(f"/ideas/{iid}/comments", json={"body": "Would love this too."}, headers=editor2_headers)
    assert r.status_code == 200, r.text
    comment_id = r.json()["id"]
    assert [pid for pid, _ in sent] == [editor_id]
    message = sent[0][1]
    assert message.event_type == "idea_commented"
    assert message.path == f"/g/altherren/ideas?idea={iid}"
    assert message.tag == f"idea-comment-{iid}"
    assert message.data == {"idea_id": iid, "comment_id": comment_id}
    assert message.text_context["author_name"] == "Editor2"
    assert message.text_context["title"] == "Filter the friendlies list"
    assert message.text_context["preview"] == "Would love this too."
    for language in ("steirisch", "deutsch", "english"):
        payload = message.to_payload(language)
        assert "Editor2" in payload["title"]
        assert "Filter the friendlies list" in payload["body"]
        assert "Would love this too." in payload["body"]

    # A vote from someone else reaches the author alone.
    sent.clear()
    r = client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers)
    assert r.status_code == 200
    assert [pid for pid, _ in sent] == [editor_id]
    message = sent[0][1]
    assert message.event_type == "idea_voted"
    assert message.tag == f"idea-vote-{iid}"
    assert message.data == {"idea_id": iid, "vote_count": 1}
    assert message.text_context["author_name"] == "Editor2"
    for language in ("steirisch", "deutsch", "english"):
        payload = message.to_payload(language)
        assert "Editor2" in payload["title"]
        assert "Filter the friendlies list" in payload["body"]

    # A status change from the admin reaches the author alone, with the status word
    # translated per language.
    sent.clear()
    r = client.put(f"/ideas/{iid}/status", json={"status": "planned", "note": "soon"}, headers=admin_headers)
    assert r.status_code == 200
    assert [pid for pid, _ in sent] == [editor_id]
    message = sent[0][1]
    assert message.event_type == "idea_status"
    assert message.tag == f"idea-status-{iid}"
    assert message.data == {"idea_id": iid, "status": "planned"}
    assert message.text_context["status"] == "planned"
    assert message.text_context["status_note_line"] == "\nsoon"
    expected_status_word = {"steirisch": "eiplant", "deutsch": "geplant", "english": "planned"}
    for language, word in expected_status_word.items():
        payload = message.to_payload(language)
        assert word in payload["title"]
        assert "soon" in payload["body"]
        assert "Filter the friendlies list" in payload["body"]


def test_nothing_is_pushed_for_ones_own_action(client, editor_headers, admin_headers):
    sent: list[tuple[int, object]] = []

    class _Recorder:
        def enqueue(self, message):  # pragma: no cover - the wrong path
            sent.append((-1, message))

        def enqueue_for_player(self, player_id, message):  # pragma: no cover - fallback path
            sent.append((int(player_id), message))

        def enqueue_personal_for_player(self, player_id, message):
            sent.append((int(player_id), message))

    client.app.state.push_dispatcher = _Recorder()

    idea = _create(client, editor_headers)
    iid = idea["id"]
    sent.clear()

    assert client.post(f"/ideas/{iid}/comments", json={"body": "Note to self."}, headers=editor_headers).status_code == 200
    assert sent == []

    assert client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor_headers).status_code == 200
    assert sent == []

    admin_idea = _create(client, admin_headers, title="Admin's own")["id"]
    sent.clear()
    assert client.put(f"/ideas/{admin_idea}/status", json={"status": "planned"}, headers=admin_headers).status_code == 200
    assert sent == []


def test_idea_events_reach_the_default_notification_mode(client):
    """`idea_commented`/`idea_voted`/`idea_status` are personal events too, so a
    default "Results & personal" subscription still gets them."""
    from app.services.notifications import FINISHED_ONLY_EVENT_TYPES, PERSONAL_DEFAULT_EVENT_TYPES

    for key in ("idea_commented", "idea_voted", "idea_status"):
        assert key in PERSONAL_DEFAULT_EVENT_TYPES
        assert key not in FINISHED_ONLY_EVENT_TYPES


def test_the_idea_comment_push_is_delivered_to_the_author_and_not_the_commenter(
    client, editor_headers, editor2_headers, monkeypatch
):
    """The other half of the chain, this file's own precedent for `idea_created`:
    the queued message reaches the author's devices, never the commenter's own."""
    import asyncio

    from sqlmodel import Session

    from app.db import get_engine
    from app.models import PushSubscription, PushSubscriptionPreference
    from app.services import notifications as notifications_service
    from app.services.notifications import NotificationDispatcher
    from app.settings import Settings

    editor_id = client.get("/me", headers=editor_headers).json()["player_id"]
    editor2_id = client.get("/me", headers=editor2_headers).json()["player_id"]

    with Session(get_engine()) as s:
        author_row = PushSubscription(
            player_id=editor_id,
            endpoint="https://push.example.test/author",
            endpoint_hash="author",
            p256dh="p256dh",
            auth="auth",
        )
        commenter_row = PushSubscription(
            player_id=editor2_id,
            endpoint="https://push.example.test/commenter",
            endpoint_hash="commenter",
            p256dh="p256dh",
            auth="auth",
        )
        s.add(author_row)
        s.add(commenter_row)
        s.flush()
        s.add(PushSubscriptionPreference(subscription_id=int(author_row.id), notification_language="english"))
        s.add(PushSubscriptionPreference(subscription_id=int(commenter_row.id), notification_language="english"))
        s.commit()

    queued: list[tuple[int, object]] = []

    class _Recorder:
        def enqueue(self, message):  # pragma: no cover - the wrong path
            queued.append((-1, message))

        def enqueue_for_player(self, player_id, message):  # pragma: no cover - fallback path
            queued.append((int(player_id), message))

        def enqueue_personal_for_player(self, player_id, message):
            queued.append((int(player_id), message))

    client.app.state.push_dispatcher = _Recorder()

    iid = _create(client, editor_headers, title="Sort ideas by votes")["id"]
    queued.clear()
    r = client.post(f"/ideas/{iid}/comments", json={"body": "Big yes."}, headers=editor2_headers)
    assert r.status_code == 200, r.text
    assert [pid for pid, _ in queued] == [editor_id]

    sent: list[tuple[str, str, str]] = []

    async def fake_send(http_client, config, subscription, payload):
        sent.append((str(subscription.endpoint), payload["title"], payload["body"]))

        class FakeResponse:
            status_code = 201
            text = ""

        return FakeResponse()

    monkeypatch.setattr(notifications_service, "send_web_push_message", fake_send)

    async def run() -> None:
        dispatcher = NotificationDispatcher(
            get_engine(),
            Settings(
                db_url="sqlite://",
                player_accounts=(),
                log_level="DEBUG",
                push_vapid_public_key="test-public-key",
                push_vapid_private_key="test-private-key",
                push_vapid_subject="mailto:test@example.com",
            ),
        )
        dispatcher._client = object()
        dispatcher._runtime_ready = True
        for player_id, message in queued:
            await dispatcher._deliver(
                notifications_service._QueuedPushMessage(
                    message=message, player_id=player_id, default_mode_player_id=player_id
                )
            )

    asyncio.run(run())

    endpoints = sorted(endpoint for endpoint, _, _ in sent)
    assert endpoints == ["https://push.example.test/author"]
    _, title, body = sent[0]
    assert title == "Editor2 commented on your idea"
    assert "Sort ideas by votes" in body
    assert "Big yes." in body
