from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import (
    FriendlyMatch,
    FriendlyMatchSide,
    FriendlyMatchSidePlayer,
    Match,
    MatchSide,
    MatchSidePlayer,
    Player,
    Tournament,
)
from .scope import (
    friendlies_schema_ready,
    include_friendlies,
    include_tournaments,
    normalize_scope,
    safe_exec_all,
)


def compute_stats_player_matches(s: Session, *, player_id: int, scope: str = "tournaments") -> dict[str, Any]:
    p = s.get(Player, player_id)
    if not p:
        # Keep consistent JSON response shape (frontend can show "not found" if ever needed).
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "player": None,
            "tournaments": [],
        }
    scope_norm = normalize_scope(scope)

    matches: list[Match] = []
    if include_tournaments(scope_norm):
        stmt = (
            select(Match)
            .join(MatchSide, MatchSide.match_id == Match.id)
            .join(MatchSidePlayer, MatchSidePlayer.match_side_id == MatchSide.id)
            .join(Tournament, Tournament.id == Match.tournament_id)
            .where(MatchSidePlayer.player_id == player_id)
            .distinct()
            # Most recent tournaments first, and within a tournament most recent matches first.
            .order_by(Tournament.date.desc(), Tournament.id.desc(), Match.order_index.desc(), Match.id.desc())
            .options(
                selectinload(Match.tournament),
                selectinload(Match.sides).selectinload(MatchSide.players),
            )
        )
        matches = safe_exec_all(s, stmt)

    friendlies: list[FriendlyMatch] = []
    if include_friendlies(scope_norm) and friendlies_schema_ready(s):
        fstmt = (
            select(FriendlyMatch)
            .join(FriendlyMatchSide, FriendlyMatchSide.friendly_match_id == FriendlyMatch.id)
            .join(FriendlyMatchSidePlayer, FriendlyMatchSidePlayer.friendly_match_side_id == FriendlyMatchSide.id)
            .where(FriendlyMatchSidePlayer.player_id == player_id)
            .distinct()
            .order_by(FriendlyMatch.date.desc(), FriendlyMatch.id.desc())
            .options(
                selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players),
            )
        )
        friendlies = safe_exec_all(s, fstmt)

    def player_dict(pp: Player) -> dict[str, Any]:
        return {"id": int(pp.id), "display_name": pp.display_name}

    def match_dict(m: Match) -> dict[str, Any]:
        sides = []
        for side in sorted(m.sides, key=lambda x: x.side):
            sides.append(
                {
                    "id": int(side.id),
                    "side": side.side,
                    "club_id": side.club_id,
                    "goals": int(side.goals or 0),
                    "players": [player_dict(pp) for pp in side.players],
                }
            )
        return {
            "id": int(m.id),
            "leg": int(m.leg),
            "order_index": int(m.order_index or 0),
            "state": m.state,
            "started_at": m.started_at,
            "finished_at": m.finished_at,
            "sides": sides,
        }

    def friendly_match_dict(fm: FriendlyMatch) -> dict[str, Any]:
        sides = []
        for side in sorted(fm.sides, key=lambda x: x.side):
            sides.append(
                {
                    "id": int(side.id),
                    "side": side.side,
                    "club_id": side.club_id,
                    "goals": int(side.goals or 0),
                    "players": [player_dict(pp) for pp in side.players],
                }
            )
        fid = int(fm.id or 0)
        return {
            "id": 2_000_000_000 + fid,
            "leg": 1,
            "order_index": 0,
            "state": fm.state,
            "started_at": fm.created_at,
            "finished_at": fm.updated_at,
            "sides": sides,
        }

    grouped: dict[int, dict[str, Any]] = {}
    for m in matches:
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
        g["matches"].append(match_dict(m))

    for fm in friendlies:
        fid = int(fm.id or 0)
        # keep ids unique from real tournaments so frontend keys stay deterministic
        gid = -(1_000_000 + fid)
        g = grouped.get(gid)
        if not g:
            grouped[gid] = g = {
                "id": gid,
                "name": f"Friendly #{fid}",
                "date": fm.date,
                "mode": fm.mode,
                "status": "friendly",
                "_sort_id": 1_000_000_000 + fid,
                "matches": [],
            }
        g["matches"].append(friendly_match_dict(fm))

    # Preserve the same ordering as the SQL query (date desc, id desc).
    tournaments_out = list(grouped.values())
    tournaments_out.sort(key=lambda x: (x.get("date"), int(x.get("_sort_id") or x.get("id") or 0)), reverse=True)
    for row in tournaments_out:
        row.pop("_sort_id", None)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "scope": scope_norm,
        "player": player_dict(p),
        "tournaments": tournaments_out,
    }
