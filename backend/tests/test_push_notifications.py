import asyncio

from sqlmodel import Session, select

from app.db import get_engine
from app.models import PushSubscription
from app.routers import comments as comments_router
from app.routers import friendlies as friendlies_router
from app.routers import matches as matches_router
from app.routers import players as players_router
from app.routers import tournaments as tournaments_router
from app.services.notifications import NotificationDispatcher
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
    assert config.json()["vapid_public_key"] == "test-public-key"

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
        },
        headers=editor_headers,
    )
    assert put_res.status_code == 200, put_res.text
    assert put_res.json()["endpoint"] == endpoint
    assert put_res.json()["disabled"] is False

    mine = client.get("/push/subscriptions/me", headers=editor_headers)
    assert mine.status_code == 200, mine.text
    assert mine.json()["count"] == 1
    assert mine.json()["endpoints"] == [endpoint]

    test_res = client.post("/push/test", headers=editor_headers)
    assert test_res.status_code == 200, test_res.text
    assert len(dispatcher.player_messages) == 1
    _, message = dispatcher.player_messages[0]
    assert message.event_type == "push_test"

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


def test_guestbook_and_poke_enqueue_push(client, editor_headers, admin_headers, monkeypatch):
    guestbook_messages = []
    poke_events = []
    monkeypatch.setattr(players_router, "enqueue_global_push", lambda request, message: guestbook_messages.append(message))
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

        messages = []
        dispatcher._put_nowait = lambda item: messages.append(item.message)  # type: ignore[assignment]

        dispatcher._ingest_poke(7, "Target", "Alice", 101)
        dispatcher._ingest_poke(7, "Target", "Bob", 102)
        dispatcher._ingest_poke(7, "Target", "Carl", 103)

        await asyncio.sleep(0.03)

        assert [m.event_type for m in messages] == ["poke_created", "poke_summary"]
        assert messages[0].data["poke_id"] == 101
        assert messages[1].data["poke_id"] == 103
        assert messages[1].data["extra_count"] == 2
        assert "Bob" in messages[1].body
        assert "Carl" in messages[1].body

    asyncio.run(run())


def test_tournament_and_match_events_enqueue_push(client, editor_headers, admin_headers, monkeypatch):
    tournament_messages = []
    match_messages = []
    monkeypatch.setattr(tournaments_router, "enqueue_global_push", lambda request, message: tournament_messages.append(message))
    monkeypatch.setattr(matches_router, "enqueue_global_push", lambda request, message: match_messages.append(message))

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
    monkeypatch.setattr(friendlies_router, "enqueue_global_push", lambda request, message: messages.append(message))

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
