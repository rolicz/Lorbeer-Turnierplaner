from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import FriendlyMatch, FriendlyMatchSide, Match, MatchSide, Player, Tournament
from .scope import (
    friendlies_schema_ready,
    include_friendlies,
    include_tournaments,
    normalize_scope,
    safe_exec_all,
)


def _side_by(m: Any, side: str) -> Any | None:
    for s in m.sides:
        if s.side == side:
            return s
    return None


def _player_dict(p: Player) -> dict[str, Any]:
    return {"id": int(p.id), "display_name": p.display_name}


def _match_dict(m: Any) -> dict[str, Any]:
    sides: list[dict[str, Any]] = []
    for side in sorted(m.sides, key=lambda x: x.side):
        sides.append(
            {
                "id": int(side.id),
                "side": side.side,
                "club_id": side.club_id,
                "goals": int(side.goals or 0),
                "players": [_player_dict(pp) for pp in side.players],
            }
        )
    return {
        "id": int(getattr(m, "id", 0) or 0),
        "leg": int(getattr(m, "leg", 1) or 1),
        "order_index": int(m.order_index or 0),
        "state": m.state,
        "started_at": getattr(m, "started_at", None),
        "finished_at": getattr(m, "finished_at", None),
        "sides": sides,
    }


def _mode_ok(t_mode: str | None, mode: str) -> bool:
    if mode == "overall":
        return t_mode in ("1v1", "2v2")
    return t_mode == mode


def _normalize_ids(values: list[int]) -> list[int]:
    out = sorted({int(v) for v in values if int(v) > 0})
    return out


def _is_opposed(
    *,
    a_ids: set[int],
    b_ids: set[int],
    left_ids: set[int],
    right_ids: set[int],
    exact_teams: bool,
) -> bool:
    if exact_teams:
        return (a_ids == left_ids and b_ids == right_ids) or (a_ids == right_ids and b_ids == left_ids)
    return (left_ids <= a_ids and right_ids <= b_ids) or (left_ids <= b_ids and right_ids <= a_ids)


def _is_teammates(*, a_ids: set[int], b_ids: set[int], left_ids: set[int]) -> bool:
    return left_ids <= a_ids or left_ids <= b_ids


def _friendly_as_match_like(fm: FriendlyMatch) -> Any:
    fid = int(fm.id or 0)
    t = SimpleNamespace(
        id=-(1_000_000 + fid),
        name=f"Friendly #{fid}",
        date=fm.date,
        mode=fm.mode,
        status="friendly",
    )
    return SimpleNamespace(
        id=2_000_000_000 + fid,
        leg=1,
        order_index=0,
        state=fm.state,
        started_at=fm.created_at,
        finished_at=fm.updated_at,
        tournament=t,
        sides=fm.sides,
    )


def compute_stats_h2h_matches(
    s: Session,
    *,
    mode: str,
    relation: str,
    left_player_ids: list[int],
    right_player_ids: list[int],
    exact_teams: bool,
    scope: str = "tournaments",
) -> dict[str, Any]:
    mode_norm = str(mode or "overall").strip().lower()
    if mode_norm not in ("overall", "1v1", "2v2"):
        mode_norm = "overall"

    relation_norm = str(relation or "opposed").strip().lower()
    if relation_norm not in ("opposed", "teammates"):
        relation_norm = "opposed"
    scope_norm = normalize_scope(scope)

    left_ids = _normalize_ids(left_player_ids)
    right_ids = _normalize_ids(right_player_ids)

    if not left_ids:
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "mode": mode_norm,
            "relation": relation_norm,
            "scope": scope_norm,
            "left_player_ids": [],
            "right_player_ids": [],
            "tournaments": [],
        }

    if relation_norm == "opposed" and not right_ids:
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "mode": mode_norm,
            "relation": relation_norm,
            "scope": scope_norm,
            "left_player_ids": left_ids,
            "right_player_ids": [],
            "tournaments": [],
        }

    matches: list[Any] = []
    if include_tournaments(scope_norm):
        stmt = (
            select(Match)
            .where(Match.state == "finished")
            .options(
                selectinload(Match.tournament),
                selectinload(Match.sides).selectinload(MatchSide.players),
            )
        )
        matches.extend(safe_exec_all(s, stmt))

    if include_friendlies(scope_norm) and friendlies_schema_ready(s):
        fstmt = (
            select(FriendlyMatch)
            .where(FriendlyMatch.state == "finished")
            .options(
                selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players),
            )
        )
        matches.extend(_friendly_as_match_like(fm) for fm in safe_exec_all(s, fstmt))

    left_set = set(left_ids)
    right_set = set(right_ids)

    filtered: list[Any] = []
    for m in matches:
        t: Tournament | None = getattr(m, "tournament", None)
        if not t or not _mode_ok(getattr(t, "mode", None), mode_norm):
            continue

        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue

        a_ids = {int(p.id) for p in a.players if p.id is not None}
        b_ids = {int(p.id) for p in b.players if p.id is not None}
        if not a_ids or not b_ids:
            continue

        if relation_norm == "opposed":
            if _is_opposed(
                a_ids=a_ids,
                b_ids=b_ids,
                left_ids=left_set,
                right_ids=right_set,
                exact_teams=bool(exact_teams),
            ):
                filtered.append(m)
        elif _is_teammates(a_ids=a_ids, b_ids=b_ids, left_ids=left_set):
            filtered.append(m)

    filtered.sort(
        key=lambda m: (
            getattr(getattr(m, "tournament", None), "date", "") or "",
            int(getattr(getattr(m, "tournament", None), "id", 0) or 0),
            int(m.order_index or 0),
            int(m.id or 0),
        ),
        reverse=True,
    )

    grouped: dict[int, dict[str, Any]] = {}
    for m in filtered:
        t = getattr(m, "tournament", None)
        if not t or t.id is None:
            continue
        tid = int(t.id)
        g = grouped.get(tid)
        if not g:
            grouped[tid] = g = {
                "id": tid,
                "name": t.name,
                "date": t.date,
                "mode": t.mode,
                "status": t.status,
                "matches": [],
            }
        g["matches"].append(_match_dict(m))

    tournaments_out = list(grouped.values())
    tournaments_out.sort(key=lambda x: (x.get("date"), int(x.get("id") or 0)), reverse=True)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "mode": mode_norm,
        "relation": relation_norm,
        "scope": scope_norm,
        "left_player_ids": left_ids,
        "right_player_ids": right_ids,
        "tournaments": tournaments_out,
    }
