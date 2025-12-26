from typing import Any, Dict, Tuple

from .models import Match


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
