# backend/app/stats.py
from __future__ import annotations

from typing import Any
from sqlmodel import Session, select

from .models import Match, Player, Tournament
from .stats_core import compute_overall_and_lastN


def compute_stats(s: Session) -> dict[str, Any]:
    """
    Backwards-compatible stats function for the old /players/stats endpoint.
    Keep this so existing imports like `from .stats import compute_stats` keep working.
    """
    players = s.exec(select(Player).order_by(Player.display_name)).all()

    matches = s.exec(select(Match)).all()
    for m in matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    per = compute_overall_and_lastN(matches, players, lastN=10)

    # Keep this payload compatible with what your old /players/stats returned.
    # If your old endpoint returned a different structure, paste it and I’ll map 1:1.
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
            }
            for pid, row in per.items()
        ]
    }


def compute_tournament_stats(s: Session, tournament_id: int) -> dict[str, Any]:
    """
    Stats payload scoped to a single tournament.
    Shape intentionally matches compute_stats() for backwards compatibility.
    """
    t = s.exec(select(Tournament).where(Tournament.id == tournament_id)).first()
    if not t:
        return {"players": []}

    _ = t.players
    players = sorted(list(t.players), key=lambda p: p.display_name)

    matches = s.exec(
        select(Match).where(Match.tournament_id == tournament_id).order_by(Match.order_index)
    ).all()
    for m in matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

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
            }
            for pid, row in per.items()
        ]
    }
