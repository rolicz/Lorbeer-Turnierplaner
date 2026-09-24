import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .auth_gate import AuthGate
from .cup_defs import read_cups_file
from .db import configure_db, get_engine, init_db
from .logging_config import setup_logging
from .routers.admin import router as admin_router
from .routers.auth import router as auth_router
from .routers.clubs import router as clubs_router
from .routers.comments import router as comments_router
from .routers.cup import router as cup_router
from .routers.friendlies import router as friendlies_router
from .routers.ideas import router as ideas_router
from .routers.matches import router as matches_router
from .routers.me import router as me_router
from .routers.players import router as players_router
from .routers.push import router as push_router
from .routers.stats import router as stats_router
from .routers.tournaments import router as tournaments_router
from .services.mail import mail_transport_for
from .services.notifications import NotificationDispatcher
from .services.rate_limit import RateLimiter
from .settings import Settings, assert_auth_config_safe
from .ws import ws_manager, ws_manager_player_profiles, ws_manager_update_tournaments

log = logging.getLogger(__name__)

def create_app(settings: Settings) -> FastAPI:
    setup_logging(settings.log_level)

    # Refuse an unsafe auth configuration before anything is configured or listening (L1).
    assert_auth_config_safe(settings)

    # IMPORTANT: configure DB BEFORE init_db / Session usage
    configure_db(settings.db_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Fail fast on a malformed cups config (eras etc.) instead of 500ing
        # every tournament/stats request at runtime. The file is the seed since L12
        # (`init_db` imports it once), and a malformed seed still refuses to boot.
        read_cups_file()
        log.info("Cup defs validated")

        init_db(settings)
        log.info("DB initialized")
        log.info("Mail: %s", app.state.mail.description)

        push_dispatcher = NotificationDispatcher(get_engine(), settings)
        app.state.push_dispatcher = push_dispatcher
        await push_dispatcher.start()

        yield

        await push_dispatcher.stop()

    app = FastAPI(
        title="EA FC Tournament Planner",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.state.settings = settings
    # The one mail transport (E0): off, a file sink, or SMTP — the guard above has already
    # refused the unsafe shapes. Tests replace it with a `CaptureTransport`.
    app.state.mail = mail_transport_for(settings)
    # The one rate limiter (L2): login, exchange and — from L3/L8 — redeem, reset, passkeys.
    app.state.rate_limiter = RateLimiter()

    # The gate (L2): default-deny, outermost. No CORS any more — dev is same-origin through
    # vite's proxy (L0) and production through Caddy, so no cross-origin request is expected
    # and a browser that makes one gets no permission to read the answer.
    app.add_middleware(AuthGate)

    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(me_router)
    app.include_router(tournaments_router)
    app.include_router(matches_router)
    app.include_router(clubs_router)
    app.include_router(players_router)
    app.include_router(cup_router)
    app.include_router(stats_router)
    app.include_router(comments_router)
    app.include_router(friendlies_router)
    app.include_router(ideas_router)
    app.include_router(push_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        # Loopback only (the gate): Docker's healthcheck calls from inside the container.
        return {"status": "ok"}

    def _ws_authorized(ws: WebSocket) -> bool:
        # Defence in depth: the gate has already refused a socket without a live session
        # (it closes with 1008 before any accept). This is the one-line second check.
        return bool((ws.scope.get("state") or {}).get("claims"))

    @app.websocket("/ws/tournaments/{tournament_id}")
    async def ws_tournament(ws: WebSocket, tournament_id: int) -> None:
        if not _ws_authorized(ws):
            await ws.close(code=1008)
            return
        await ws_manager.connect(tournament_id, ws)
        try:
            await ws.send_json({"event": "connected", "payload": {"tournament_id": tournament_id}})
            while True:
                _ = await ws.receive_text()
                await ws.send_json({"event": "pong", "payload": {}})
        except WebSocketDisconnect:
            ws_manager.disconnect(tournament_id, ws)

    @app.websocket("/ws/tournaments")
    async def ws_new_tournament(ws: WebSocket) -> None:
        if not _ws_authorized(ws):
            await ws.close(code=1008)
            return
        await ws_manager_update_tournaments.connect(ws)
        try:
            await ws.send_json({"event": "connected", "payload": {}})
            while True:
                _ = await ws.receive_text()
                await ws.send_json({"event": "pong", "payload": {}})
        except WebSocketDisconnect:
            ws_manager_update_tournaments.disconnect(ws)

    @app.websocket("/ws/players/{player_id}")
    async def ws_player_profile(ws: WebSocket, player_id: int) -> None:
        if not _ws_authorized(ws):
            await ws.close(code=1008)
            return
        await ws_manager_player_profiles.connect(player_id, ws)
        try:
            await ws.send_json({"event": "connected", "payload": {"player_id": player_id}})
            while True:
                _ = await ws.receive_text()
                await ws.send_json({"event": "pong", "payload": {}})
        except WebSocketDisconnect:
            ws_manager_player_profiles.disconnect(player_id, ws)

    return app
