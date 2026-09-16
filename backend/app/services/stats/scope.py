from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Literal

from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from ...models import FriendlyMatch

StatsScope = Literal["tournaments", "both", "friendlies"]


def normalize_scope(scope: str | None) -> StatsScope:
    v = str(scope or "tournaments").strip().lower()
    if v not in ("tournaments", "both", "friendlies"):
        return "tournaments"
    return v  # type: ignore[return-value]


def include_tournaments(scope: StatsScope) -> bool:
    return scope in ("tournaments", "both")


def include_friendlies(scope: StatsScope) -> bool:
    return scope in ("friendlies", "both")


def friendlies_schema_ready(s: Session) -> bool:
    """
    Deployment-safe guard for optional friendlies tables.
    Prevents 500s on older DB files that predate friendlies.
    """
    try:
        bind = s.get_bind()
        if bind is None:
            return False
        insp = inspect(bind)
        return bool(
            insp.has_table("friendlymatch")
            and insp.has_table("friendlymatchside")
            and insp.has_table("friendlymatchsideplayer")
        )
    except Exception:
        return False


def safe_exec_all(s: Session, stmt: Any) -> list[Any]:
    try:
        return list(s.exec(stmt).all())
    except SQLAlchemyError:
        return []


def friendly_as_match_like(fm: FriendlyMatch) -> Any:
    """
    A friendly, shaped like a tournament `Match` so the shared stats helpers can
    read it. The synthetic ids stay far above any real row so a mixed scope can
    never collide with a tournament match.

    `state`/`tournament_id` exist because `services/stats/core.py` reads them on
    whatever it is handed; the loaders only ever wrap finished friendlies, and a
    friendly belongs to no tournament.
    """
    fid = int(fm.id or 0)
    t = SimpleNamespace(
        id=1_000_000_000 + fid,
        mode=fm.mode,
        date=fm.date,
    )
    return SimpleNamespace(
        id=2_000_000_000 + fid,
        tournament=t,
        tournament_id=None,
        state="finished",
        order_index=0,
        sides=fm.sides,
    )
