"""
Tournament serialization shared by the GET endpoint and the websocket push
layer, so a pushed `tournament.sync` payload is byte-for-byte the same shape
the frontend already fetches (lets clients replace the cache wholesale).
"""
from __future__ import annotations

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..models import Match, MatchSide, Player, Tournament
from ..tournament_status import compute_status_for_tournament
from .stats.odds import compute_match_odds_for_tournament


def serialize_tournament(s: Session, t: Tournament) -> dict:
    matches = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.tournament_id == t.id)
        .order_by(Match.order_index)
    ).all()
    _ = t.players  # load tournament players (no selectinload — t is already fetched)

    status = compute_status_for_tournament(s, t.id)
    odds_by_match_id = compute_match_odds_for_tournament(s, tournament=t, matches_in_tournament=matches)

    def player_dict(p: Player) -> dict:
        return {"id": p.id, "display_name": p.display_name}

    def match_dict(m: Match) -> dict:
        sides = []
        for side in sorted(m.sides, key=lambda x: x.side):
            sides.append({
                "id": side.id,
                "side": side.side,
                "club_id": side.club_id,
                "goals": side.goals,
                "players": [player_dict(p) for p in side.players],
            })
        return {
            "id": m.id,
            "tournament_id": m.tournament_id,
            "leg": m.leg,
            "order_index": m.order_index,
            "state": m.state,
            "started_at": m.started_at,
            "finished_at": m.finished_at,
            "sides": sides,
            "odds": odds_by_match_id.get(int(m.id)) if m.id is not None else None,
        }

    return {
        "id": t.id,
        "name": t.name,
        "mode": t.mode,
        "status": status,  # computed
        "settings_json": t.settings_json,
        "date": t.date,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "players": [player_dict(p) for p in t.players],
        "matches": [match_dict(m) for m in matches],
        "decider_type": t.decider_type,
        "decider_winner_player_id": t.decider_winner_player_id,
        "decider_loser_player_id": t.decider_loser_player_id,
        "decider_winner_goals": t.decider_winner_goals,
        "decider_loser_goals": t.decider_loser_goals,
    }
