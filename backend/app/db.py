from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.pool import NullPool, StaticPool
from sqlmodel import Session, SQLModel, create_engine

from .league_nations import backfill_league_nations

log = logging.getLogger(__name__)

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
    _ensure_runtime_columns()

    changed = backfill_league_nations(_engine)
    if changed > 0:
        log.info("League nations backfilled: %s", changed)


# Columns added to existing deployments after the fact: (table, column, DDL type/default).
# Additive only — old code keeps working against a migrated DB.
_RUNTIME_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("pushsubscriptionpreference", "notification_mode", "VARCHAR NOT NULL DEFAULT 'finished_only'"),
    ("league", "nation", "VARCHAR"),
)


def _ensure_runtime_columns() -> None:
    if _engine is None:
        return
    inspector = inspect(_engine)
    tables = set(inspector.get_table_names())
    for table, column, ddl in _RUNTIME_COLUMNS:
        if table not in tables:
            continue
        columns = {col["name"] for col in inspector.get_columns(table)}
        if column in columns:
            continue
        with _engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))

def get_session():
    if _engine is None:
        raise RuntimeError("DB not configured. Call configure_db(db_url) first.")
    with Session(_engine) as s:
        yield s

def get_engine():
    if _engine is None:
        raise RuntimeError("DB not configured")
    return _engine
