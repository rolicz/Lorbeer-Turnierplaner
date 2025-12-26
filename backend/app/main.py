import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .logging_config import setup_logging
from .db import configure_db, init_db
from .settings import Settings
from .config import CORS_ALLOW_ORIGINS

from .ws import ws_manager
from .routers.auth import router as auth_router
from .routers.me import router as me_router
from .routers.tournaments import router as tournaments_router
from .routers.matches import router as matches_router
from .routers.clubs import router as clubs_router
from .routers.players import router as players_router

log = logging.getLogger(__name__)


def create_app(settings: Settings) -> FastAPI:
    setup_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        log.info("DB initialized")
        yield

    app = FastAPI(
        title="EA FC Tournament Planner",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.state.settings = settings
    configure_db(settings.db_url)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ALLOW_ORIGINS if CORS_ALLOW_ORIGINS != ["*"] else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers (unchanged)
    app.include_router(auth_router)
    app.include_router(me_router)
    app.include_router(tournaments_router)
    app.include_router(matches_router)
    app.include_router(clubs_router)
    app.include_router(players_router)

    # Websocket (unchanged)
    @app.websocket("/ws/tournaments/{tournament_id}")
    async def ws_tournament(ws: WebSocket, tournament_id: int) -> None:
        await ws_manager.connect(tournament_id, ws)
        try:
            await ws.send_json({"event": "connected", "payload": {"tournament_id": tournament_id}})
            while True:
                _ = await ws.receive_text()
                await ws.send_json({"event": "pong", "payload": {}})
        except WebSocketDisconnect:
            ws_manager.disconnect(tournament_id, ws)

    return app

