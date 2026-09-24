"""L16: the push dispatcher holds no database transaction across a network call.

Before L16, `_deliver` kept one `Session` open over a player's whole fan-out and committed
once at the end. From the second subscription on, the loop's next read autoflushed the
previous row's pending UPDATE — which takes SQLite's write lock — and that lock then rode
across every remaining HTTP call to the push service. Any other writer (a login writes a
session row) waited out the busy timeout and failed with "database is locked".

The first test proves the lock is gone by writing *from inside* a slow push call; the
second pins every field `_deliver` writes after a send, per outcome.
"""

import asyncio
from datetime import datetime

from sqlalchemy.pool import NullPool
from sqlmodel import Session, create_engine, select

from app.db import get_engine
from app.models import AuthSession, Player, PushSubscription
from app.services import notifications as notifications_service
from app.services.notifications import NotificationDispatcher, localized_push_message
from app.services.sessions import create_session
from app.services.webpush import WebPushUnavailableError
from app.settings import Settings

# How long a competing writer is willing to wait for the lock. Well under pysqlite's
# default 5 s busy timeout, so the unfixed code fails fast instead of hanging the suite.
WRITER_BUSY_TIMEOUT_S = 0.5
# How long each fake push "is on the wire" after the competing write.
FAKE_SEND_SECONDS = 0.05


def _dispatcher() -> NotificationDispatcher:
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
    dispatcher._client = object()  # never used: the transport is faked below
    dispatcher._runtime_ready = True
    return dispatcher


def _subscription(player_id: int, name: str, **fields) -> PushSubscription:
    return PushSubscription(
        player_id=player_id,
        endpoint=f"https://push.example.test/{name}",
        endpoint_hash=name,
        p256dh="p256dh",
        auth="auth",
        content_encoding="aes128gcm",
        **fields,
    )


def _finished_message():
    # A FINISHED_ONLY event, so a default-mode subscription is sent to.
    return notifications_service._QueuedPushMessage(
        message=localized_push_message("tournament_finished", event_type="tournament_finished", tournament_name="Lock Cup")
    )


class _Response:
    def __init__(self, status_code: int, text: str = "") -> None:
        self.status_code = status_code
        self.text = text


def test_a_write_succeeds_while_a_push_fan_out_is_on_the_wire(client, monkeypatch):
    engine = get_engine()
    with Session(engine) as s:
        player_id = int(s.exec(select(Player.id).where(Player.display_name == "Editor")).one())
        for i in range(3):
            s.add(_subscription(player_id, f"lock-{i}"))
        s.commit()

    # An ordinary writer on its own connection, as a request handler would be: it mints a
    # session row, exactly what every login does since L2.
    writer_engine = create_engine(
        str(engine.url),
        poolclass=NullPool,
        connect_args={"check_same_thread": False, "timeout": WRITER_BUSY_TIMEOUT_S},
    )
    write_results: list[tuple[str, float]] = []

    def write_a_session_row() -> None:
        started = datetime.utcnow()
        try:
            with Session(writer_engine) as ws:
                create_session(ws, player_id=player_id, kind="password", user_agent="lock-test", ip="127.0.0.1")
                ws.commit()
            outcome = "ok"
        except Exception as exc:  # the unfixed code lands here: "database is locked"
            outcome = f"{type(exc).__name__}: {exc}"
        write_results.append((outcome, (datetime.utcnow() - started).total_seconds()))

    calls: list[str] = []

    async def slow_send(http_client, config, subscription, payload):
        calls.append(str(subscription.endpoint))
        # From the second call on, the old code already held the write lock (the first
        # row's UPDATE was autoflushed by the second row's reads). Write *now*, while this
        # push is in flight — on a thread, like a request handler would.
        if len(calls) >= 2:
            await asyncio.to_thread(write_a_session_row)
        await asyncio.sleep(FAKE_SEND_SECONDS)
        return _Response(201)

    monkeypatch.setattr(notifications_service, "send_web_push_message", slow_send)

    asyncio.run(_dispatcher()._deliver(_finished_message()))

    assert len(calls) == 3
    assert len(write_results) == 2
    for outcome, seconds in write_results:
        assert outcome == "ok", outcome
        assert seconds < WRITER_BUSY_TIMEOUT_S, seconds

    with Session(engine) as s:
        assert len(s.exec(select(AuthSession).where(AuthSession.user_agent == "lock-test")).all()) == 2
        rows = s.exec(select(PushSubscription).where(PushSubscription.endpoint_hash.startswith("lock-"))).all()
        assert len(rows) == 3
        for row in rows:
            assert row.last_http_status == 201
            assert row.last_success_at is not None
            assert row.failure_count == 0
    writer_engine.dispose()


def test_every_field_written_after_a_send_per_outcome(client, monkeypatch):
    """Success, a 5xx, a 404, a 410, the push runtime missing, and a transport that raises —
    each written exactly as before L16, in one fan-out."""
    engine = get_engine()
    with Session(engine) as s:
        player_id = int(s.exec(select(Player.id).where(Player.display_name == "Editor")).one())
        for name in ("ok", "err500", "gone404", "gone410", "unavailable", "boom"):
            s.add(_subscription(player_id, f"f-{name}", failure_count=2, last_error="old", last_http_status=999))
        s.commit()

    async def fake_send(http_client, config, subscription, payload):
        name = str(subscription.endpoint).rsplit("/f-", 1)[1]
        if name == "ok":
            return _Response(201)
        if name == "err500":
            return _Response(500, "x" * 1000)
        if name == "gone404":
            return _Response(404, "not found")
        if name == "gone410":
            return _Response(410, "gone")
        if name == "unavailable":
            raise WebPushUnavailableError("runtime missing")
        raise RuntimeError("socket closed")

    monkeypatch.setattr(notifications_service, "send_web_push_message", fake_send)
    before = datetime.utcnow()
    asyncio.run(_dispatcher()._deliver(_finished_message()))

    with Session(engine) as s:
        rows = {
            r.endpoint_hash: r
            for r in s.exec(select(PushSubscription).where(PushSubscription.endpoint_hash.startswith("f-"))).all()
        }
    for r in rows.values():
        assert r.updated_at >= before

    ok = rows["f-ok"]
    assert ok.last_http_status == 201
    assert ok.last_success_at is not None and ok.last_success_at >= before
    assert ok.last_error == ""
    assert ok.failure_count == 0
    assert ok.last_failure_at is None
    assert ok.disabled_at is None

    e500 = rows["f-err500"]
    assert e500.last_http_status == 500
    assert e500.last_failure_at is not None and e500.last_failure_at >= before
    assert e500.last_error == "500 " + "x" * 400
    assert e500.failure_count == 3
    assert e500.last_success_at is None
    assert e500.disabled_at is None

    for key, status, text in (("f-gone404", 404, "not found"), ("f-gone410", 410, "gone")):
        r = rows[key]
        assert r.last_http_status == status
        assert r.last_error == f"{status} {text}"
        assert r.failure_count == 3
        assert r.disabled_at is not None and r.disabled_at >= before
        assert r.last_failure_at == r.disabled_at

    unavailable = rows["f-unavailable"]
    assert unavailable.last_error == "runtime missing"
    assert unavailable.failure_count == 3
    assert unavailable.last_http_status == 999  # an exception never reached a status
    assert unavailable.last_failure_at is not None
    assert unavailable.disabled_at is None

    boom = rows["f-boom"]
    assert boom.last_error == "RuntimeError: socket closed"
    assert boom.failure_count == 3
    assert boom.last_http_status == 999
    assert boom.last_failure_at is not None
    assert boom.disabled_at is None


def test_a_subscription_deleted_mid_fan_out_is_not_resurrected(client, monkeypatch):
    """The result is written to a fresh read of the row, so an unsubscribe that lands while
    the push is on the wire stays unsubscribed (the old code would have raised on flush)."""
    engine = get_engine()
    with Session(engine) as s:
        player_id = int(s.exec(select(Player.id).where(Player.display_name == "Editor")).one())
        s.add(_subscription(player_id, "del-a"))
        s.add(_subscription(player_id, "del-b"))
        s.commit()

    async def fake_send(http_client, config, subscription, payload):
        if subscription.endpoint.endswith("del-a"):
            with Session(engine) as s:
                row = s.exec(select(PushSubscription).where(PushSubscription.endpoint_hash == "del-a")).one()
                s.delete(row)
                s.commit()
        return _Response(201)

    monkeypatch.setattr(notifications_service, "send_web_push_message", fake_send)
    asyncio.run(_dispatcher()._deliver(_finished_message()))

    with Session(engine) as s:
        hashes = {r.endpoint_hash: r for r in s.exec(select(PushSubscription).where(PushSubscription.endpoint_hash.startswith("del-"))).all()}
    assert set(hashes) == {"del-b"}
    assert hashes["del-b"].last_http_status == 201
