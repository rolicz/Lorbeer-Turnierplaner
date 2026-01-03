from datetime import datetime
from typing import Any, Dict, List

from fastapi import WebSocket


class WSManager:
    def __init__(self) -> None:
        self._conns: Dict[int, List[WebSocket]] = {}

    async def connect(self, tournament_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._conns.setdefault(tournament_id, []).append(ws)

    def disconnect(self, tournament_id: int, ws: WebSocket) -> None:
        if tournament_id not in self._conns:
            return
        self._conns[tournament_id] = [c for c in self._conns[tournament_id] if c is not ws]
        if not self._conns[tournament_id]:
            del self._conns[tournament_id]

    async def broadcast(self, tournament_id: int, event: str, payload: Any) -> None:
        msg = {"event": event, "payload": payload, "ts": datetime.utcnow().isoformat()}
        for ws in list(self._conns.get(tournament_id, [])):
            try:
                await ws.send_json(msg)
            except Exception:
                self.disconnect(tournament_id, ws)


ws_manager = WSManager()

class WSManagerUpdateAllTournaments:
    def __init__(self) -> None:
        self._conns: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._conns.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._conns = [c for c in self._conns if c is not ws]

    async def broadcast(self, event: str, payload: Any) -> None:
        msg = {"event": event, "payload": payload, "ts": datetime.utcnow().isoformat()}
        for ws in self._conns:
            try:
                await ws.send_json(msg)
            except Exception:
                self.disconnect(ws)

ws_manager_update_tournaments  = WSManagerUpdateAllTournaments()