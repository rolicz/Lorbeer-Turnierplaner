from __future__ import annotations

from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import Match, MatchSide, Tournament
from .core import compute_overall_and_lastN


def compute_tournament_stats(s: Session, tournament_id: int) -> dict[str, Any]:
    """
    Stats payload scoped to a single tournament (GET /tournaments/{id}/stats).
    """
    t = s.exec(select(Tournament).where(Tournament.id == tournament_id)).first()
    if not t:
        return {"players": []}

    _ = t.players  # lazy-load tournament players (t already fetched)
    players = sorted(list(t.players), key=lambda p: p.display_name)

    matches = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index)
    ).all()

    per = compute_overall_and_lastN(matches, players, lastN=10)
    return {
        "players": [
            {
                "player_id": pid,
                "name": row["name"],
                "played": row["played"],
                "wins": row["wins"],
                "draws": row["draws"],
                "losses": row["losses"],
                "gf": row["gf"],
                "ga": row["ga"],
                "gd": row["gd"],
                "pts": row["pts"],
                "lastN_avg_pts": row["lastN_avg_pts"],
                "lastN_pts": row["lastN_pts"],
                "lastN_gf": row.get("lastN_gf", []),
                "lastN_ga": row.get("lastN_ga", []),
            }
            for pid, row in per.items()
        ]
    }
