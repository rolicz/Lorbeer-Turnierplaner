import itertools
import logging
from datetime import datetime
from typing import Any, Dict, Hashable, List

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

log = logging.getLogger(__name__)

# Global channel key, so one manager can hold a keyless channel too.
_GLOBAL = "*"


def _envelope(event: str, payload: Any, seq: int) -> dict:
    # Encode the payload to JSON-safe primitives (datetimes -> ISO strings, etc.)
    # so it matches the REST response shape and ws.send_json never raises on a
    # rich object — an uncaught raise here would silently drop the message and
    # disconnect the client.
    return {
        "event": event,
        "payload": jsonable_encoder(payload),
        "ts": datetime.utcnow().isoformat(),
        "seq": seq,
    }


async def _close_quietly(ws: WebSocket) -> None:
    """Close a socket we have given up on; it may already be gone."""
    try:
        await ws.close(code=1011)
    except Exception:  # noqa: BLE001 - the socket is dead either way
        pass


class _Channels:
    """
    Sockets and a sequence counter **per channel**.

    The sequence is what lets a client notice it missed something: it counts 1, 2,
    3… *within one channel*, so a client that sees 7 after 5 knows a message never
    arrived and resyncs. A single process-wide counter (what this used to be)
    could not carry that meaning — three managers shared it, so the numbers a
    client saw skipped every time anything else in the app broadcast, and the gap
    check would have fired constantly. Counters start at 1 on every process start;
    a restart also closes every socket, and the client baselines again on connect.
    """

    def __init__(self) -> None:
        self._conns: Dict[Hashable, List[WebSocket]] = {}
        self._seq: Dict[Hashable, "itertools.count[int]"] = {}

    def add(self, key: Hashable, ws: WebSocket) -> None:
        self._conns.setdefault(key, []).append(ws)

    def remove(self, key: Hashable, ws: WebSocket) -> None:
        if key not in self._conns:
            return
        self._conns[key] = [c for c in self._conns[key] if c is not ws]
        if not self._conns[key]:
            del self._conns[key]

    def sockets(self, key: Hashable) -> List[WebSocket]:
        return list(self._conns.get(key, []))

    def next_seq(self, key: Hashable) -> int:
        counter = self._seq.get(key)
        if counter is None:
            counter = itertools.count(1)
            self._seq[key] = counter
        return next(counter)

    async def send(self, key: Hashable, event: str, payload: Any) -> None:
        targets = self.sockets(key)
        if not targets:
            return
        msg = _envelope(event, payload, self.next_seq(key))
        for ws in targets:
            try:
                await ws.send_json(msg)
            except Exception:  # noqa: BLE001 - one bad socket must not stop the broadcast
                # Forgetting the socket is not enough: the endpoint's receive loop
                # keeps answering its pings, so the client believes it is live and
                # never resyncs — it just stops being told anything. Close it, and
                # the client's reconnect + resync does the rest.
                self.remove(key, ws)
                await _close_quietly(ws)
                log.debug("Dropped a websocket that failed to receive a broadcast (channel=%r)", key)


class WSManager:
    """One channel per id (a tournament id, a player id)."""

    def __init__(self) -> None:
        self._channels = _Channels()

    async def connect(self, key: int, ws: WebSocket) -> None:
        await ws.accept()
        self._channels.add(key, ws)

    def disconnect(self, key: int, ws: WebSocket) -> None:
        self._channels.remove(key, ws)

    async def broadcast(self, key: int, event: str, payload: Any) -> None:
        await self._channels.send(key, event, payload)


ws_manager = WSManager()
ws_manager_player_profiles = WSManager()


class WSManagerUpdateAllTournaments:
    """The one keyless channel: coarse "something changed" for every listener."""

    def __init__(self) -> None:
        self._channels = _Channels()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._channels.add(_GLOBAL, ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._channels.remove(_GLOBAL, ws)

    async def broadcast(self, event: str, payload: Any) -> None:
        await self._channels.send(_GLOBAL, event, payload)


ws_manager_update_tournaments = WSManagerUpdateAllTournaments()
