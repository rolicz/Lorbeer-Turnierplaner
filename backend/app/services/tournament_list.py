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

    # One query for every match (+ its sides/players via selectinload) instead of one query
    # per tournament; group by tournament id in Python, preserving order_index ordering.
    all_matches = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .order_by(Match.tournament_id, Match.order_index)
    ).all()
    matches_by_tid: dict[int, list[Match]] = {}
    for m in all_matches:
        matches_by_tid.setdefault(int(m.tournament_id), []).append(m)

    # Reuse the batched matches for cup-stake standings instead of re-querying matches
    # once per (cup × done-tournament).
    cup_stakes_by_tid = compute_all_cup_tournament_stakes_by_tournament(s, matches_by_tid=matches_by_tid)

    # First pass: everything that is pure-Python from the grouped matches. Defer winner/decider
    # name resolution by collecting the player ids so they can be fetched in one batched query.
    rows: list[dict] = []
    name_pids: set[int] = set()
    for t in ts:
        matches = matches_by_tid.get(int(t.id), [])
        status = status_by_tid.get(t.id, "draft")

        pt = compute_points_table_finished(matches)
        top = top_group(pt)
        winner_pid = top[0] if (status == "done" and len(top) == 1) else None
        decider_pid = t.decider_winner_player_id if (len(top) > 1 and t.decider_winner_player_id is not None) else None
        if winner_pid is not None:
            name_pids.add(int(winner_pid))
        if decider_pid is not None:
            name_pids.add(int(decider_pid))

        standings = compute_player_standings(matches, [])
        pos_map = positions_from_standings(standings)
        pid_name: dict[int, str] = {}
        for m in matches:
            for side in m.sides:
                for p in side.players:
                    pid = int(p.id)
                    if pid not in pid_name:
                        pid_name[pid] = p.display_name
        participants: list[dict] = [{"id": pid, "display_name": name} for pid, name in pid_name.items()]
        participants.sort(key=lambda x: (pos_map.get(x["id"], 9999), x["display_name"].lower()))

        rows.append(
            {
                "t": t,
                "status": status,
                "winner_pid": winner_pid,
                "decider_pid": decider_pid,
                "participants": participants,
            }
        )

    # One query for all winner/decider names instead of up to two name lookups per tournament.
    named = s.exec(select(Player).where(Player.id.in_(sorted(name_pids)))).all() if name_pids else []
    name_by_pid = {int(p.id): p.display_name for p in named}

    out = []
    for r in rows:
        t = r["t"]
        winner_pid = r["winner_pid"]
        decider_pid = r["decider_pid"]
        d = t.model_dump()
        d["status"] = r["status"]
        d["winner_string"] = name_by_pid.get(int(winner_pid)) if winner_pid is not None else None
        d["winner_decider_string"] = name_by_pid.get(int(decider_pid)) if decider_pid is not None else None
        d["cup_stakes"] = cup_stakes_by_tid.get(int(t.id), [])
        d["participants"] = r["participants"]
        out.append(d)

    return out
