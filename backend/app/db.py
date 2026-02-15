from __future__ import annotations

from sqlmodel import SQLModel, Session, create_engine
from typing import Optional
from sqlalchemy.pool import NullPool, StaticPool

_engine = None

def configure_db(db_url: str) -> None:
    global _engine
    is_sqlite = db_url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    engine_kwargs = {"echo": False, "connect_args": connect_args}

    if is_sqlite:
        # SQLite in deployment: avoid QueuePool exhaustion under concurrent API/image requests.
        # For in-memory SQLite (mainly tests), keep a single shared connection.
        if ":memory:" in db_url or "mode=memory" in db_url:
            engine_kwargs["poolclass"] = StaticPool
        else:
            engine_kwargs["poolclass"] = NullPool

    _engine = create_engine(db_url, **engine_kwargs)

def init_db() -> None:
    if _engine is None:
        raise RuntimeError("DB not configured. Call configure_db(db_url) first.")
    SQLModel.metadata.create_all(_engine)

def get_session():
    if _engine is None:
        raise RuntimeError("DB not configured. Call configure_db(db_url) first.")
    with Session(_engine) as s:
        yield s

def get_engine():
    if _engine is None:
        raise RuntimeError("DB not configured")
    return _engine
