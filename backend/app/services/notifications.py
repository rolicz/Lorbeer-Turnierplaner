from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, cast

import httpx
from fastapi import Request
from sqlmodel import Session, select

from ..models import PushSubscription
from ..settings import Settings
from .webpush import (
    WebPushConfig,
    WebPushConfigError,
    WebPushSubscriptionData,
    WebPushUnavailableError,
    send_web_push_message,
    web_push_runtime_ready,
)

log = logging.getLogger(__name__)


def hash_push_endpoint(endpoint: str) -> str:
    return hashlib.sha256(str(endpoint or "").encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PushMessage:
    title: str
    body: str
    path: str = "/"
    tag: str | None = None
    event_type: str = "generic"
    icon: str = "/android-chrome-192x192.png"
    badge: str = "/favicon-32x32.png"
    data: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        payload = {
            "title": self.title,
            "body": self.body,
            "icon": self.icon,
            "badge": self.badge,
            "tag": self.tag,
            "data": {"path": self.path, "event_type": self.event_type, **self.data},
        }
        return payload


@dataclass(frozen=True)
class _QueuedPushMessage:
    message: PushMessage
    player_id: int | None = None


@dataclass
class _PokeDigestState:
    profile_player_id: int
    profile_player_name: str
    latest_poke_id: int
    extra_count: int = 0
    extra_authors: list[str] = field(default_factory=list)
    flush_task: asyncio.Task[None] | None = field(default=None, repr=False)


def _poke_push_message(*, profile_player_id: int, profile_player_name: str, author_player_name: str, poke_id: int) -> PushMessage:
    return PushMessage(
        title=f"New anpöbeln for {profile_player_name}",
        body=f"{author_player_name} hat {profile_player_name} angepöbelt.",
        path=f"/profiles/{profile_player_id}",
        tag=f"poke-{profile_player_id}",
        event_type="poke_created",
        data={"profile_player_id": profile_player_id, "poke_id": poke_id},
    )


def _poke_summary_text(extra_count: int, profile_player_name: str, author_names: list[str]) -> str:
    unique_authors = [name for name in dict.fromkeys(str(name or "").strip() for name in author_names) if name]
    if extra_count <= 0:
        return ""
    if extra_count == 1 and len(unique_authors) == 1:
        return f"{unique_authors[0]} hat {profile_player_name} noch einmal angepöbelt."
    if len(unique_authors) == 1:
        return f"{unique_authors[0]} hat {profile_player_name} in der letzten Minute noch {extra_count}x angepöbelt."
    if len(unique_authors) == 2:
        authors_text = f"{unique_authors[0]} und {unique_authors[1]}"
    elif len(unique_authors) == 3:
        authors_text = f"{unique_authors[0]}, {unique_authors[1]} und {unique_authors[2]}"
    elif len(unique_authors) > 3:
        authors_text = f"{unique_authors[0]}, {unique_authors[1]} und {len(unique_authors) - 2} weitere"
    else:
        authors_text = ""
    if authors_text:
        return f"{authors_text} haben {profile_player_name} in der letzten Minute noch {extra_count}x angepöbelt."
    return f"{extra_count} weitere Anpöbeleien für {profile_player_name} in der letzten Minute."


def _poke_summary_message(*, profile_player_id: int, profile_player_name: str, latest_poke_id: int, extra_count: int, author_names: list[str]) -> PushMessage:
    body = _poke_summary_text(extra_count, profile_player_name, author_names)
    return PushMessage(
        title=f"More anpöbeln for {profile_player_name}",
        body=body,
        path=f"/profiles/{profile_player_id}",
        tag=f"poke-{profile_player_id}",
        event_type="poke_summary",
        data={
            "profile_player_id": profile_player_id,
            "poke_id": latest_poke_id,
            "extra_count": extra_count,
            "author_names": [name for name in dict.fromkeys(author_names) if name],
        },
    )


def push_dispatcher_from_request(request: Request) -> "NotificationDispatcher | None":
    dispatcher = getattr(request.app.state, "push_dispatcher", None)
    if dispatcher is None:
        return None
    if not hasattr(dispatcher, "enqueue") or not hasattr(dispatcher, "enqueue_for_player"):
        return None
    return cast(NotificationDispatcher, dispatcher)


def enqueue_global_push(request: Request, message: PushMessage) -> None:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is not None:
        dispatcher.enqueue(message)


def enqueue_player_push(request: Request, player_id: int, message: PushMessage) -> None:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is not None:
        dispatcher.enqueue_for_player(player_id, message)


def enqueue_poke_push(
    request: Request,
    *,
    profile_player_id: int,
    profile_player_name: str,
    author_player_name: str,
    poke_id: int,
) -> None:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is None:
        return
    if hasattr(dispatcher, "enqueue_poke"):
        dispatcher.enqueue_poke(
            profile_player_id=int(profile_player_id),
            profile_player_name=str(profile_player_name or ""),
            author_player_name=str(author_player_name or ""),
            poke_id=int(poke_id),
        )
        return
    dispatcher.enqueue(
        _poke_push_message(
            profile_player_id=int(profile_player_id),
            profile_player_name=str(profile_player_name or ""),
            author_player_name=str(author_player_name or ""),
            poke_id=int(poke_id),
        )
    )


def upsert_push_subscription(
    s: Session,
    *,
    player_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    content_encoding: str = "aes128gcm",
    user_agent: str = "",
    app_platform: str = "",
    app_standalone: bool = False,
) -> PushSubscription:
    endpoint_norm = str(endpoint or "").strip()
    p256dh_norm = str(p256dh or "").strip()
    auth_norm = str(auth or "").strip()
    if not endpoint_norm or not p256dh_norm or not auth_norm:
        raise ValueError("Invalid push subscription payload")
    if str(content_encoding or "aes128gcm").strip().lower() != "aes128gcm":
        raise ValueError("Only aes128gcm subscriptions are supported")

    row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint_norm)).first()
    now = datetime.utcnow()
    if row is None:
        row = PushSubscription(
            player_id=player_id,
            endpoint=endpoint_norm,
            endpoint_hash=hash_push_endpoint(endpoint_norm),
            p256dh=p256dh_norm,
            auth=auth_norm,
            content_encoding="aes128gcm",
            user_agent=str(user_agent or "")[:1024],
            app_platform=str(app_platform or "")[:64],
            app_standalone=bool(app_standalone),
            created_at=now,
            updated_at=now,
        )
    else:
        row.player_id = player_id
        row.endpoint_hash = hash_push_endpoint(endpoint_norm)
        row.p256dh = p256dh_norm
        row.auth = auth_norm
        row.content_encoding = "aes128gcm"
        row.user_agent = str(user_agent or "")[:1024]
        row.app_platform = str(app_platform or "")[:64]
        row.app_standalone = bool(app_standalone)
        row.updated_at = now
        row.last_error = ""
        row.last_http_status = None
        row.disabled_at = None
    s.add(row)
    return row


def disable_push_subscription(
    s: Session,
    *,
    player_id: int,
    endpoint: str,
) -> bool:
    endpoint_norm = str(endpoint or "").strip()
    if not endpoint_norm:
        return False
    row = s.exec(
        select(PushSubscription).where(
            PushSubscription.player_id == int(player_id),
            PushSubscription.endpoint == endpoint_norm,
        )
    ).first()
    if row is None:
        return False
    row.disabled_at = datetime.utcnow()
    row.updated_at = row.disabled_at
    row.last_error = "disabled by client"
    s.add(row)
    return True


class NotificationDispatcher:
    POKE_PUSH_COOLDOWN_SECONDS = 60.0

    def __init__(self, engine, settings: Settings) -> None:
        self._engine = engine
        self._settings = settings
        self._queue: asyncio.Queue[_QueuedPushMessage | None] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._client: httpx.AsyncClient | None = None
        self._poke_digests: dict[int, _PokeDigestState] = {}
        self._config = WebPushConfig(
            public_key=settings.push_vapid_public_key,
            private_key_pem=settings.push_vapid_private_key,
            subject=settings.push_vapid_subject,
            ttl_seconds=settings.push_ttl_seconds,
        )
        self._runtime_ready = web_push_runtime_ready(self._config)

    @property
    def configured(self) -> bool:
        return bool(
            self._settings.push_vapid_public_key
            and self._settings.push_vapid_private_key
            and self._settings.push_vapid_subject
        )

    @property
    def enabled(self) -> bool:
        return self.configured and self._runtime_ready

    @property
    def public_key(self) -> str:
        return self._settings.push_vapid_public_key

    @property
    def disabled_reason(self) -> str | None:
        if not self.configured:
            return "Push notifications are not configured on the server."
        if not self._runtime_ready:
            return "Push runtime dependency is missing on the server."
        return None

    async def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._client = httpx.AsyncClient(timeout=10.0)
        self._task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        for state in list(self._poke_digests.values()):
            if state.flush_task is not None:
                state.flush_task.cancel()
        self._poke_digests.clear()
        if self._task is not None:
            await self._queue.put(None)
            await self._task
            self._task = None
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def enqueue(self, message: PushMessage) -> None:
        self._enqueue(_QueuedPushMessage(message=message, player_id=None))

    def enqueue_for_player(self, player_id: int, message: PushMessage) -> None:
        self._enqueue(_QueuedPushMessage(message=message, player_id=int(player_id)))

    def enqueue_poke(
        self,
        *,
        profile_player_id: int,
        profile_player_name: str,
        author_player_name: str,
        poke_id: int,
    ) -> None:
        if not self.enabled or self._loop is None:
            return
        self._loop.call_soon_threadsafe(
            self._ingest_poke,
            int(profile_player_id),
            str(profile_player_name or ""),
            str(author_player_name or ""),
            int(poke_id),
        )

    def _enqueue(self, item: _QueuedPushMessage) -> None:
        if not self.enabled or self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._put_nowait, item)

    def _put_nowait(self, item: _QueuedPushMessage) -> None:
        self._queue.put_nowait(item)

    def _ingest_poke(
        self,
        profile_player_id: int,
        profile_player_name: str,
        author_player_name: str,
        poke_id: int,
    ) -> None:
        state = self._poke_digests.get(int(profile_player_id))
        if state is None:
            self._put_nowait(
                _QueuedPushMessage(
                    message=_poke_push_message(
                        profile_player_id=int(profile_player_id),
                        profile_player_name=profile_player_name,
                        author_player_name=author_player_name,
                        poke_id=int(poke_id),
                    ),
                    player_id=None,
                )
            )
            state = _PokeDigestState(
                profile_player_id=int(profile_player_id),
                profile_player_name=profile_player_name,
                latest_poke_id=int(poke_id),
            )
            state.flush_task = asyncio.create_task(self._flush_poke_digest_after_delay(int(profile_player_id)))
            self._poke_digests[int(profile_player_id)] = state
            return

        state.latest_poke_id = int(poke_id)
        state.extra_count += 1
        if author_player_name.strip():
            state.extra_authors.append(author_player_name.strip())

    async def _flush_poke_digest_after_delay(self, profile_player_id: int) -> None:
        try:
            await asyncio.sleep(float(self.POKE_PUSH_COOLDOWN_SECONDS))
            self._flush_poke_digest(int(profile_player_id))
        except asyncio.CancelledError:
            return

    def _flush_poke_digest(self, profile_player_id: int) -> None:
        state = self._poke_digests.pop(int(profile_player_id), None)
        if state is None or state.extra_count <= 0:
            return
        self._put_nowait(
            _QueuedPushMessage(
                message=_poke_summary_message(
                    profile_player_id=state.profile_player_id,
                    profile_player_name=state.profile_player_name,
                    latest_poke_id=state.latest_poke_id,
                    extra_count=state.extra_count,
                    author_names=state.extra_authors,
                ),
                player_id=None,
            )
        )

    async def _worker(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None:
                break
            try:
                await self._deliver(item)
            except Exception:
                log.exception("Push delivery worker failed for %s", item.message.event_type)

    async def _deliver(self, item: _QueuedPushMessage) -> None:
        if not self.enabled or self._client is None:
            return
        with Session(self._engine) as s:
            stmt = select(PushSubscription).where(PushSubscription.disabled_at.is_(None))
            if item.player_id is not None:
                stmt = stmt.where(PushSubscription.player_id == item.player_id)
            rows = list(s.exec(stmt).all())
            if not rows:
                return
            for row in rows:
                await self._deliver_one(s, row, item.message)
            s.commit()

    async def _deliver_one(self, s: Session, row: PushSubscription, message: PushMessage) -> None:
        now = datetime.utcnow()
        try:
            response = await send_web_push_message(
                self._client,
                self._config,
                WebPushSubscriptionData(
                    endpoint=row.endpoint,
                    p256dh=row.p256dh,
                    auth=row.auth,
                    content_encoding=row.content_encoding,
                ),
                message.to_payload(),
            )
            row.updated_at = now
            row.last_http_status = response.status_code
            if 200 <= response.status_code < 300:
                row.last_success_at = now
                row.last_error = ""
                row.failure_count = 0
                s.add(row)
                return

            row.last_failure_at = now
            row.last_error = f"{response.status_code} {response.text[:400]}"
            row.failure_count += 1
            if response.status_code in (404, 410):
                row.disabled_at = now
        except (WebPushUnavailableError, WebPushConfigError) as exc:
            row.last_failure_at = now
            row.last_error = str(exc)[:400]
            row.failure_count += 1
        except Exception as exc:
            row.last_failure_at = now
            row.last_error = f"{type(exc).__name__}: {exc}"[:400]
            row.failure_count += 1
        row.updated_at = now
        s.add(row)
