from __future__ import annotations

from sqlmodel import SQLModel, Session, create_engine
from typing import Optional

_engine = None

def configure_db(db_url: str) -> None:
    global _engine
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    _engine = create_engine(db_url, echo=False, connect_args=connect_args)

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