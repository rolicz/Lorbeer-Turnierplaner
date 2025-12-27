from __future__ import annotations

from typing import Any, Dict, Tuple, Optional

from .models import Match, Player


def compute_stats(matches: list[Match]) -> Dict[str, Any]:
    finished = [m for m in matches if m.state == "finished"]

    per_player: Dict[int, Dict[str, Any]] = {}
    partners: Dict[Tuple[int, int], int] = {}

    def ensure(pid: int, name: str) -> None:
        if pid not in per_player:
            per_player[pid] = {
                "player_id": pid,
                "name": name,
                "games": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "goals_for": 0,
                "goals_against": 0,
            }

    for m in finished:
        sides = {s.side: s for s in m.sides}
        if "A" not in sides or "B" not in sides:
            continue

        a = sides["A"]
        b = sides["B"]

        if a.goals > b.goals:
            a_res, b_res = "win", "loss"
        elif a.goals < b.goals:
            a_res, b_res = "loss", "win"
        else:
            a_res = b_res = "draw"

        for side_obj, opp_obj, res in ((a, b, a_res), (b, a, b_res)):
            ps = side_obj.players

            for p in ps:
                ensure(p.id, p.display_name)
                row = per_player[p.id]
                row["games"] += 1
                row["goals_for"] += side_obj.goals
                row["goals_against"] += opp_obj.goals
                if res == "win":
                    row["wins"] += 1
                elif res == "loss":
                    row["losses"] += 1
                else:
                    row["draws"] += 1

            if len(ps) == 2:
                p1, p2 = sorted((ps[0].id, ps[1].id))
                partners[(p1, p2)] = partners.get((p1, p2), 0) + 1

    return {
        "finished_matches": len(finished),
        "players": sorted(per_player.values(), key=lambda r: (-r["wins"], r["losses"], -r["goals_for"])),
        "partner_stats": [
            {"player_id_1": a, "player_id_2": b, "games_as_partners": n}
            for (a, b), n in sorted(partners.items(), key=lambda x: (-x[1], x[0]))
        ],
    }


def compute_player_standings(matches: list[Match], participants: list[Player]) -> list[dict]:
    """
    Standings used for 'tournament winner' decisions.
    Points per player:
      win=3, draw=1, loss=0
    Works for 1v1 and 2v2 (both teammates receive the result points).
    Only counts finished matches.
    Includes all participants even if they played 0 matches.
    """
    finished = [m for m in matches if m.state == "finished"]

    per: Dict[int, dict] = {}
    for p in participants:
        per[p.id] = {
            "player_id": p.id,
            "name": p.display_name,
            "played": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "gf": 0,
            "ga": 0,
            "gd": 0,
            "pts": 0,
        }

    for m in finished:
        sides = {s.side: s for s in m.sides}
        if "A" not in sides or "B" not in sides:
            continue

        a = sides["A"]
        b = sides["B"]

        a_goals = int(a.goals or 0)
        b_goals = int(b.goals or 0)

        if a_goals > b_goals:
            a_res, b_res = "win", "loss"
        elif a_goals < b_goals:
            a_res, b_res = "loss", "win"
        else:
            a_res = b_res = "draw"

        for side_obj, opp_obj, res, side_goals, opp_goals in (
            (a, b, a_res, a_goals, b_goals),
            (b, a, b_res, b_goals, a_goals),
        ):
            for p in side_obj.players:
                if p.id not in per:
                    # safety: if DB contains players not listed as participants
                    per[p.id] = {
                        "player_id": p.id,
                        "name": p.display_name,
                        "played": 0,
                        "wins": 0,
                        "draws": 0,
                        "losses": 0,
                        "gf": 0,
                        "ga": 0,
                        "gd": 0,
                        "pts": 0,
                    }

                row = per[p.id]
                row["played"] += 1
                row["gf"] += side_goals
                row["ga"] += opp_goals
                if res == "win":
                    row["wins"] += 1
                    row["pts"] += 3
                elif res == "draw":
                    row["draws"] += 1
                    row["pts"] += 1
                else:
                    row["losses"] += 1

    # finalize gd
    for r in per.values():
        r["gd"] = int(r["gf"]) - int(r["ga"])

    rows = list(per.values())

    # sort by pts desc, gd desc, gf desc, then name asc
    rows.sort(key=lambda r: (-r["pts"], -r["gd"], -r["gf"], str(r["name"]).lower()))
    return rows


def unique_winner_player_id(rows: list[dict]) -> Optional[int]:
    """
    Returns player_id if there is a UNIQUE winner.
    If first place is tied on tie-break keys (pts, gd, gf) => None (draw).
    """
    if not rows:
        return None
    if len(rows) == 1:
        return int(rows[0]["player_id"])

    a, b = rows[0], rows[1]
    if (a["pts"], a["gd"], a["gf"]) == (b["pts"], b["gd"], b["gf"]):
        return None
    return int(a["player_id"])
