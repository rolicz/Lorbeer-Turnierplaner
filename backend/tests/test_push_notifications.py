import asyncio
import json
from pathlib import Path

from sqlmodel import Session, select

from app.db import get_engine
from app.models import PushSubscription, PushSubscriptionPreference
from app.routers import comments as comments_router
from app.routers import players as players_router
from app.services import notifications as notifications_service
from app.services.notification_texts import (
    default_notification_language,
    notification_language_options,
    render_notification_text,
)
from app.services.notifications import NotificationDispatcher, localized_push_message, notification_mode_options
from app.settings import Settings


class StubPushDispatcher:
    def __init__(self) -> None:
        self.enabled = True
        self.configured = True
        self.public_key = "test-public-key"
        self.disabled_reason = None
        self.global_messages = []
        self.player_messages = []

    def enqueue(self, message) -> None:
        self.global_messages.append(message)

    def enqueue_for_player(self, player_id: int, message) -> None:
        self.player_messages.append((int(player_id), message))


def _player_id_by_name(client, name: str) -> int:
    rows = client.get("/players").json()
    return next(int(row["id"]) for row in rows if row["display_name"] == name)


def test_push_subscription_crud_and_test_notification(client, editor_headers):
    dispatcher = StubPushDispatcher()
    client.app.state.push_dispatcher = dispatcher

    config = client.get("/push/config")
    assert config.status_code == 200, config.text
    assert config.json()["enabled"] is True
    assert config.json()["configured"] is True
    assert config.json()["vapid_public_key"] == "test-public-key"
    assert config.json()["default_notification_language"] == "steirisch"
    assert config.json()["notification_languages"] == [
        {"key": "steirisch", "label": "Steirisch"},
        {"key": "deutsch", "label": "Deutsch"},
        {"key": "english", "label": "English"},
    ]
    assert config.json()["default_notification_mode"] == "finished_only"
    assert config.json()["notification_modes"] == [
        {"key": "finished_only", "label": "Finished + your anpoebeln"},
        {"key": "all", "label": "Everything"},
        {"key": "off", "label": "Off"},
    ]

    endpoint = "https://push.example.test/subscriptions/device-1"
    put_res = client.put(
        "/push/subscription",
        json={
            "endpoint": endpoint,
            "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
            "contentEncoding": "aes128gcm",
            "app_platform": "android",
            "app_standalone": True,
            "user_agent": "pytest",
            "notification_language": "english",
            "notification_mode": "all",
        },
        headers=editor_headers,
    )
    assert put_res.status_code == 200, put_res.text
    assert put_res.json()["endpoint"] == endpoint
    assert put_res.json()["disabled"] is False
    assert put_res.json()["notification_language"] == "english"
    assert put_res.json()["notification_mode"] == "all"

    mine = client.get("/push/subscriptions/me", headers=editor_headers)
    assert mine.status_code == 200, mine.text
    assert mine.json()["count"] == 1
    assert mine.json()["endpoints"] == [endpoint]
    assert mine.json()["subscriptions"] == [
        {
            "endpoint": endpoint,
            "notification_language": "english",
            "notification_mode": "all",
            "app_platform": "android",
            "app_standalone": True,
        }
    ]

    test_res = client.post("/push/test", headers=editor_headers)
    assert test_res.status_code == 200, test_res.text
    assert len(dispatcher.player_messages) == 1
    _, message = dispatcher.player_messages[0]
    assert message.event_type == "push_test"
    assert message.to_payload("english")["title"] == "Push is working"
    assert "Hi Editor" in message.to_payload("english")["body"]

    delete_res = client.request(
        "DELETE",
        "/push/subscription",
        json={"endpoint": endpoint},
        headers=editor_headers,
    )
    assert delete_res.status_code == 200, delete_res.text
    assert delete_res.json()["disabled"] is True

    mine_after = client.get("/push/subscriptions/me", headers=editor_headers)
    assert mine_after.status_code == 200, mine_after.text
    assert mine_after.json()["count"] == 0

    with Session(get_engine()) as s:
        row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint)).first()
        assert row is not None
        assert row.disabled_at is not None


def test_notification_text_catalog_is_complete_and_renderable():
    catalog_path = Path(__file__).resolve().parents[1] / "app" / "notification_texts.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    languages = catalog["languages"]
    expected_keys = set(languages[default_notification_language()]["messages"].keys())

    assert [row["key"] for row in notification_language_options()] == ["steirisch", "deutsch", "english"]
    assert [row["key"] for row in notification_mode_options()] == ["finished_only", "all", "off"]

    context = {
        "tournament_name": "Feierabend Cup",
        "author_name": "Alice",
        "preview": "Der Thread laeuft schon heiss.",
        "preview_is_image_only": False,
        "scorer_name": "Alice",
        "goal_minute": 45,
        "goal_line": "45' 3-2 Alice",
        "goal_note_line": "\nA richtige Fackel ins Kreizeck.",
        "profile_player_name": "Berti",
        "extra_count": 3,
        "author_names": ["Alice", "Bob", "Carl"],
        "tournament_date": "2026-04-03",
        "match_count": 9,
        "match_label": "Match 2",
        "scoreline": "3-2",
        "mode": "2v2",
        "player_name": "Editor",
    }

    for language, payload in languages.items():
        assert set(payload["messages"].keys()) == expected_keys
        for message_key in expected_keys:
            title, body = render_notification_text(message_key, language, context)
            assert title.strip()
            assert body.strip()


def test_localized_push_message_renders_each_language():
    message = localized_push_message(
        "push_test",
        path="/dashboard",
        tag="push-test",
        event_type="push_test",
        player_name="Editor",
    )

    assert message.to_payload("steirisch")["title"] == "Push passt bei dir"
    assert "Servus Editor" in message.to_payload("steirisch")["body"]
    assert message.to_payload("deutsch")["title"] == "Push funktioniert"
    assert "Hallo Editor" in message.to_payload("deutsch")["body"]
    assert message.to_payload("english")["title"] == "Push is working"
    assert "Hi Editor" in message.to_payload("english")["body"]


def test_notification_modes_filter_delivery(client, monkeypatch):
    async def run() -> None:
        sent: list[tuple[str, str]] = []

        async def fake_send(client, config, subscription, payload):
            sent.append((str(subscription.endpoint), str(payload["data"]["event_type"])))

            class FakeResponse:
                status_code = 201
                text = ""

            return FakeResponse()

        monkeypatch.setattr(notifications_service, "send_web_push_message", fake_send)

        dispatcher = NotificationDispatcher(
            get_engine(),
            Settings(
                db_url="sqlite://",
                player_accounts=(),
                jwt_secret="test-jwt-secret",
                ws_require_auth=False,
                log_level="DEBUG",
                push_vapid_public_key="test-public-key",
                push_vapid_private_key="test-private-key",
                push_vapid_subject="mailto:test@example.com",
            ),
        )
        dispatcher._client = object()
        dispatcher._runtime_ready = True

        with Session(get_engine()) as s:
            rows = [
                PushSubscription(
                    player_id=1,
                    endpoint="https://push.example.test/default-mode",
                    endpoint_hash="default-mode",
                    p256dh="p256dh",
                    auth="auth",
                    content_encoding="aes128gcm",
                ),
                PushSubscription(
                    player_id=2,
                    endpoint="https://push.example.test/other-default-mode",
                    endpoint_hash="other-default-mode",
                    p256dh="p256dh",
                    auth="auth",
                    content_encoding="aes128gcm",
                ),
                PushSubscription(
                    player_id=3,
                    endpoint="https://push.example.test/all-mode",
                    endpoint_hash="all-mode",
                    p256dh="p256dh",
                    auth="auth",
                    content_encoding="aes128gcm",
                ),
                PushSubscription(
                    player_id=4,
                    endpoint="https://push.example.test/off-mode",
                    endpoint_hash="off-mode",
                    p256dh="p256dh",
                    auth="auth",
                    content_encoding="aes128gcm",
                ),
            ]
            for row in rows:
                s.add(row)
            s.flush()
            s.add(PushSubscriptionPreference(subscription_id=int(rows[2].id), notification_mode="all"))
            s.add(PushSubscriptionPreference(subscription_id=int(rows[3].id), notification_mode="off"))
            s.commit()

        await dispatcher._deliver(
            notifications_service._QueuedPushMessage(
                message=localized_push_message(
                    "comment_created",
                    event_type="comment_created",
                    tournament_name="Mode Cup",
                    author_name="Alice",
                    preview="hello",
                    preview_is_image_only=False,
                )
            )
        )
        assert sent == [("https://push.example.test/all-mode", "comment_created")]

        sent.clear()
        await dispatcher._deliver(
            notifications_service._QueuedPushMessage(
                message=localized_push_message(
                    "tournament_finished",
                    event_type="tournament_finished",
                    tournament_name="Mode Cup",
                )
            )
        )
        assert sent == [
            ("https://push.example.test/default-mode", "tournament_finished"),
            ("https://push.example.test/other-default-mode", "tournament_finished"),
            ("https://push.example.test/all-mode", "tournament_finished"),
        ]

        sent.clear()
        await dispatcher._deliver(
            notifications_service._QueuedPushMessage(
                message=localized_push_message(
                    "poke_created",
                    event_type="poke_created",
                    profile_player_name="Target",
                    author_name="Alice",
                ),
                default_mode_player_id=1,
            )
        )
        assert sent == [
            ("https://push.example.test/default-mode", "poke_created"),
            ("https://push.example.test/all-mode", "poke_created"),
        ]

    asyncio.run(run())


def test_comment_creation_enqueues_push(client, editor_headers, admin_headers, monkeypatch):
    messages = []
    monkeypatch.setattr(comments_router, "enqueue_global_push", lambda request, message: messages.append(message))

    p1 = client.post("/players", json={"display_name": "Comment-A"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "Comment-B"}, headers=admin_headers).json()["id"]
    tournament_id = client.post(
        "/tournaments",
        json={"name": "Push Comments", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]

    created = client.post(
        f"/tournaments/{tournament_id}/comments",
        json={"body": "Goal commentary incoming"},
        headers=editor_headers,
    )
    assert created.status_code == 200, created.text
    comment_id = created.json()["id"]

    assert len(messages) == 1
    message = messages[0]
    assert message.event_type == "comment_created"
    assert message.path == f"/live/{tournament_id}?comment={comment_id}"
    assert "Push Comments" in message.title


def test_goal_comment_creation_enqueues_goal_push(client, editor_headers, admin_headers, monkeypatch):
    messages = []
    monkeypatch.setattr(comments_router, "enqueue_global_push", lambda request, message: messages.append(message))

    p1 = client.post("/players", json={"display_name": "Goal-A"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "Goal-B"}, headers=admin_headers).json()["id"]
    p3 = client.post("/players", json={"display_name": "Goal-C"}, headers=admin_headers).json()["id"]
    tournament_id = client.post(
        "/tournaments",
        json={"name": "Push Goal Comments", "mode": "1v1", "player_ids": [p1, p2, p3], "auto_generate": True},
        headers=editor_headers,
    ).json()["id"]

    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200, detail.text
    first_match = detail.json()["matches"][0]
    match_id = int(first_match["id"])
    scorer_name = "Ronaldo"

    created = client.post(
        f"/tournaments/{tournament_id}/comments",
        json={
            "match_id": match_id,
            "event_type": "goal",
            "goal_minute": 12,
            "goal_player_name": scorer_name,
            "result_score_a": 1,
            "result_score_b": 0,
            "body": "What a finish",
        },
        headers=editor_headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["body"] == f"12' 1-0 {scorer_name}\nWhat a finish"

    assert len(messages) == 1
    message = messages[0]
    assert message.event_type == "goal_comment_created"
    assert message.path == f"/live/{tournament_id}?comment={created.json()['id']}"
    payload = message.to_payload("english")
    assert payload["title"] == "Goal update in Match 1"
    assert "12' 1-0 Ronaldo" in payload["body"]
    assert "What a finish" in payload["body"]

    updated_detail = client.get(f"/tournaments/{tournament_id}")
    assert updated_detail.status_code == 200, updated_detail.text
    updated_match = next(row for row in updated_detail.json()["matches"] if int(row["id"]) == match_id)
    updated_sides = {side["side"]: int(side["goals"]) for side in updated_match["sides"]}
    assert updated_sides == {"A": 1, "B": 0}


def test_goal_comment_creation_rejects_duplicate_scoreline(client, editor_headers, admin_headers, monkeypatch):
    messages = []
    monkeypatch.setattr(comments_router, "enqueue_global_push", lambda request, message: messages.append(message))

    player_ids = [
        client.post("/players", json={"display_name": name}, headers=admin_headers).json()["id"]
        for name in ("Dup-A", "Dup-B", "Dup-C")
    ]
    tournament_id = client.post(
        "/tournaments",
        json={"name": "Duplicate Goal Comments", "mode": "1v1", "player_ids": player_ids, "auto_generate": True},
        headers=editor_headers,
    ).json()["id"]

    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200, detail.text
    match_id = int(detail.json()["matches"][0]["id"])

    first = client.post(
        f"/tournaments/{tournament_id}/comments",
        json={
            "match_id": match_id,
            "event_type": "goal",
            "goal_minute": 12,
            "goal_player_name": "Krankl",
            "result_score_a": 1,
            "result_score_b": 0,
            "body": "A sauberer Abschluss",
        },
        headers=editor_headers,
    )
    assert first.status_code == 200, first.text

    duplicate = client.post(
        f"/tournaments/{tournament_id}/comments",
        json={
            "match_id": match_id,
            "event_type": "goal",
            "goal_minute": 55,
            "goal_player_name": "Krankl",
            "result_score_a": 1,
            "result_score_b": 0,
        },
        headers=editor_headers,
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["detail"] == "This score is already recorded for this match"
    assert len(messages) == 1


def test_score_comment_creation_enqueues_score_push(client, editor_headers, admin_headers, monkeypatch):
    messages = []
    monkeypatch.setattr(comments_router, "enqueue_global_push", lambda request, message: messages.append(message))

    player_ids = [
        client.post("/players", json={"display_name": name}, headers=admin_headers).json()["id"]
        for name in ("Score-A", "Score-B", "Score-C")
    ]
    tournament_id = client.post(
        "/tournaments",
        json={"name": "Push Score Comments", "mode": "1v1", "player_ids": player_ids, "auto_generate": True},
        headers=editor_headers,
    ).json()["id"]

    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200, detail.text
    match_id = int(detail.json()["matches"][0]["id"])

    created = client.post(
        f"/tournaments/{tournament_id}/comments",
        json={
            "match_id": match_id,
            "event_type": "score_update",
            "result_score_a": 3,
            "result_score_b": 2,
        },
        headers=editor_headers,
    )
    assert created.status_code == 200, created.text
    assert created.json()["body"] == "3-2"

    assert len(messages) == 1
    message = messages[0]
    assert message.event_type == "score_comment_created"
    payload = message.to_payload("english")
    assert payload["title"] == "Score update in Match 1"
    assert "Current score: 3-2." in payload["body"]

    updated_detail = client.get(f"/tournaments/{tournament_id}")
    assert updated_detail.status_code == 200, updated_detail.text
    updated_match = next(row for row in updated_detail.json()["matches"] if int(row["id"]) == match_id)
    updated_sides = {side["side"]: int(side["goals"]) for side in updated_match["sides"]}
    assert updated_sides == {"A": 3, "B": 2}


def test_guestbook_and_poke_enqueue_push(client, editor_headers, admin_headers, monkeypatch):
    guestbook_messages = []
    poke_events = []
    monkeypatch.setattr(notifications_service, "enqueue_global_push", lambda request, message: guestbook_messages.append(message))
    monkeypatch.setattr(
        players_router,
        "enqueue_poke_push",
        lambda request, **payload: poke_events.append(payload),
    )

    editor_player_id = _player_id_by_name(client, "Editor")
    target_player_id = client.post("/players", json={"display_name": "PushTarget"}, headers=admin_headers).json()["id"]

    guestbook_res = client.post(
        f"/players/{target_player_id}/guestbook",
        json={"body": "Guestbook ping", "author_player_id": editor_player_id},
        headers=editor_headers,
    )
    assert guestbook_res.status_code == 200, guestbook_res.text

    poke_res = client.post(
        f"/players/{target_player_id}/pokes",
        json={"author_player_id": editor_player_id},
        headers=editor_headers,
    )
    assert poke_res.status_code == 200, poke_res.text

    event_types = [message.event_type for message in guestbook_messages]
    assert "guestbook_created" in event_types
    assert len(poke_events) == 1
    assert poke_events[0]["profile_player_id"] == target_player_id
    assert poke_events[0]["poke_id"] > 0


def test_poke_push_digest_summarizes_within_cooldown(tmp_path):
    async def run() -> None:
        dispatcher = NotificationDispatcher(
            engine=None,
            settings=Settings(
                db_url=f"sqlite:///{tmp_path / 'poke-digest.db'}",
                player_accounts=(),
                jwt_secret="test-jwt-secret",
                ws_require_auth=False,
                log_level="DEBUG",
                push_vapid_public_key="test-public",
                push_vapid_private_key="test-private",
                push_vapid_subject="mailto:test@example.com",
            ),
        )
        dispatcher._runtime_ready = True
        dispatcher._loop = asyncio.get_running_loop()
        dispatcher.POKE_PUSH_COOLDOWN_SECONDS = 0.01

        items = []
        dispatcher._put_nowait = lambda item: items.append(item)  # type: ignore[assignment]

        dispatcher._ingest_poke(7, "Target", "Alice", 101)
        dispatcher._ingest_poke(7, "Target", "Bob", 102)
        dispatcher._ingest_poke(7, "Target", "Carl", 103)

        await asyncio.sleep(0.03)

        messages = [item.message for item in items]
        assert [m.event_type for m in messages] == ["poke_created", "poke_summary"]
        assert [item.default_mode_player_id for item in items] == [7, 7]
        assert messages[0].data["poke_id"] == 101
        assert messages[1].data["poke_id"] == 103
        assert messages[1].data["extra_count"] == 2
        assert "Bob" in messages[1].body
        assert "Carl" in messages[1].body

    asyncio.run(run())


def test_tournament_and_match_events_enqueue_push(client, editor_headers, admin_headers, monkeypatch):
    all_messages = []
    monkeypatch.setattr(notifications_service, "enqueue_global_push", lambda request, message: all_messages.append(message))
    tournament_messages = all_messages
    match_messages = all_messages

    player_ids = [
        client.post("/players", json={"display_name": f"Push-T{i}"}, headers=admin_headers).json()["id"]
        for i in range(1, 4)
    ]
    created = client.post(
        "/tournaments",
        json={"name": "Push Tournament", "mode": "1v1", "player_ids": player_ids},
        headers=editor_headers,
    )
    assert created.status_code == 200, created.text
    tournament_id = created.json()["id"]

    generated = client.post(f"/tournaments/{tournament_id}/generate", json={"randomize": False}, headers=editor_headers)
    assert generated.status_code == 200, generated.text

    tournament_event_types = [message.event_type for message in tournament_messages]
    assert "tournament_created" in tournament_event_types
    assert "schedule_generated" in tournament_event_types

    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200, detail.text
    first_match_id = int(detail.json()["matches"][0]["id"])

    started = client.patch(
        f"/matches/{first_match_id}",
        json={"state": "playing", "sideA": {"goals": 1}, "sideB": {"goals": 0}},
        headers=editor_headers,
    )
    assert started.status_code == 200, started.text

    finished = client.patch(
        f"/matches/{first_match_id}",
        json={"state": "finished"},
        headers=editor_headers,
    )
    assert finished.status_code == 200, finished.text

    match_event_types = [message.event_type for message in match_messages]
    assert "match_started" in match_event_types
    assert "match_score_changed" in match_event_types
    assert "match_finished" in match_event_types


def test_friendly_events_enqueue_push(client, editor_headers, admin_headers, monkeypatch):
    messages = []
    monkeypatch.setattr(notifications_service, "enqueue_global_push", lambda request, message: messages.append(message))

    p1 = client.post("/players", json={"display_name": "Friendly-A"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "Friendly-B"}, headers=admin_headers).json()["id"]

    created = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 1,
            "b_goals": 0,
        },
        headers=editor_headers,
    )
    assert created.status_code == 200, created.text
    friendly_id = int(created.json()["id"])

    playing = client.patch(
        f"/friendlies/{friendly_id}",
        json={"state": "playing", "sideA": {"goals": 2}, "sideB": {"goals": 1}},
        headers=admin_headers,
    )
    assert playing.status_code == 200, playing.text

    finished = client.patch(
        f"/friendlies/{friendly_id}",
        json={"state": "finished"},
        headers=admin_headers,
    )
    assert finished.status_code == 200, finished.text

    event_types = [message.event_type for message in messages]
    assert "friendly_created" in event_types
    assert "friendly_started" in event_types
    assert "friendly_score_changed" in event_types
    assert "friendly_finished" in event_types
