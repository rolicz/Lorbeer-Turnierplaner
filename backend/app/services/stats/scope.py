from __future__ import annotations

from typing import Literal

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

