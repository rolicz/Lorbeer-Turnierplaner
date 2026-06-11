from __future__ import annotations

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..models import Match, MatchSide, Player, Tournament
from ..stats_core import compute_player_standings, positions_from_standings
from ..tournament_status import compute_status_map
from .cup import compute_all_cup_tournament_stakes_by_tournament


def compute_points_table_finished(matches: list[Match]) -> dict[int, tuple[int, int, int]]:
    """Per-player (points, goal_diff, goals_for) using ONLY finished matches."""
    pts: dict[int, int] = {}
    gf: dict[int, int] = {}
    ga: dict[int, int] = {}

    def ensure(pid: int) -> None:
        pts.setdefault(pid, 0)
        gf.setdefault(pid, 0)
        ga.setdefault(pid, 0)

    for m in matches:
        if m.state != "finished":
            continue
        sides = {s.side: s for s in m.sides}
        a = sides.get("A")
        b = sides.get("B")
        if not a or not b:
            continue
        ag = int(a.goals or 0)
        bg = int(b.goals or 0)
        a_pids = [p.id for p in a.players]
        b_pids = [p.id for p in b.players]
        for pid in a_pids + b_pids:
            ensure(pid)
        for pid in a_pids:
            gf[pid] += ag
            ga[pid] += bg
        for pid in b_pids:
            gf[pid] += bg
            ga[pid] += ag
        if ag > bg:
            for pid in a_pids:
                pts[pid] += 3
        elif bg > ag:
            for pid in b_pids:
                pts[pid] += 3
        else:
            for pid in a_pids + b_pids:
                pts[pid] += 1

    return {pid: (pts[pid], gf[pid] - ga[pid], gf[pid]) for pid in pts}


def top_group(points_table: dict[int, tuple[int, int, int]]) -> list[int]:
    """Returns player_ids tied for #1 by (points, gd, gf)."""
    if not points_table:
        return []
    items = sorted(points_table.items(), key=lambda kv: (kv[1][0], kv[1][1], kv[1][2]), reverse=True)
    best = items[0][1]
    return [pid for pid, triple in items if triple == best]


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
