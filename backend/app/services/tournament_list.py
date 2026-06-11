from __future__ import annotations

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..models import Match, MatchSide, Player, Tournament
from ..tournament_status import compute_status_map
from .cup import compute_all_cup_tournament_stakes_by_tournament
from .stats.core import compute_player_standings, compute_points_table_finished, positions_from_standings, top_group


def build_tournament_list(s: Session) -> list[dict]:
    ts = s.exec(select(Tournament).order_by(Tournament.created_at.desc())).all()
    status_by_tid = compute_status_map(s)
    cup_stakes_by_tid = compute_all_cup_tournament_stakes_by_tournament(s)

    out = []
    for t in ts:
        matches = s.exec(
            select(Match)
            .options(selectinload(Match.sides).selectinload(MatchSide.players))
            .where(Match.tournament_id == t.id)
            .order_by(Match.order_index)
        ).all()

        status = status_by_tid.get(t.id, "draft")

        winner_string = None
        winner_decider_string = None
        pt = compute_points_table_finished(matches)
        top = top_group(pt)
        if status == "done" and len(top) == 1:
            winner_string = s.exec(select(Player.display_name).where(Player.id == top[0])).first()
        if len(top) > 1 and t.decider_winner_player_id is not None:
            winner_decider_string = s.exec(select(Player.display_name).where(Player.id == t.decider_winner_player_id)).first()

        standings = compute_player_standings(matches, [])
        pos_map = positions_from_standings(standings)
        seen_pids: set[int] = set()
        pid_name: dict[int, str] = {}
        for m in matches:
            for side in m.sides:
                for p in side.players:
                    pid = int(p.id)
                    if pid not in seen_pids:
                        seen_pids.add(pid)
                        pid_name[pid] = p.display_name
        participants: list[dict] = [{"id": pid, "display_name": name} for pid, name in pid_name.items()]
        participants.sort(key=lambda x: (pos_map.get(x["id"], 9999), x["display_name"].lower()))

        d = t.model_dump()
        d["status"] = status
        d["winner_string"] = winner_string
        d["winner_decider_string"] = winner_decider_string
        d["cup_stakes"] = cup_stakes_by_tid.get(int(t.id), [])
        d["participants"] = participants
        out.append(d)

    return out
