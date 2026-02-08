from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import Match, MatchSide, MatchSidePlayer, Player, Tournament


def compute_stats_player_matches(s: Session, *, player_id: int) -> dict[str, Any]:
    p = s.get(Player, player_id)
    if not p:
        # Keep consistent JSON response shape (frontend can show "not found" if ever needed).
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "player": None,
            "tournaments": [],
        }

    # Load all matches where the player participates.
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

    matches = list(s.exec(stmt).all())

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

    # Preserve the same ordering as the SQL query (date desc, id desc).
    tournaments_out = list(grouped.values())
    tournaments_out.sort(key=lambda x: (x.get("date"), int(x.get("id") or 0)), reverse=True)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "player": player_dict(p),
        "tournaments": tournaments_out,
    }
