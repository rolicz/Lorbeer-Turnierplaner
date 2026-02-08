from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from typing import Any

from .models import Match, MatchSide, Player


def _side_by(m: Match, side: str) -> MatchSide | None:
    for s in m.sides:
        if s.side == side:
            return s
    return None


def compute_player_standings(matches: list[Match], participants: list[Player]) -> list[dict]:
    """
    Standings used for winner/position decisions.
    Points per player: win=3, draw=1, loss=0
    Works for 1v1 and 2v2 (both teammates receive result points).
    Only counts finished matches.
    """
    finished = [m for m in matches if m.state == "finished"]

    per: dict[int, dict] = {}
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
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue

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

    for r in per.values():
        r["gd"] = int(r["gf"]) - int(r["ga"])

    rows = list(per.values())
    rows.sort(key=lambda r: (-r["pts"], -r["gd"], -r["gf"], str(r["name"]).lower()))
    return rows


def positions_from_standings(rows: list[dict]) -> dict[int, int]:
    """
    Competition ranking (1,1,3) on (pts, gd, gf).
    """
    pos_by_pid: dict[int, int] = {}
    last_key: tuple[int, int, int] | None = None
    last_pos = 0

    for idx, r in enumerate(rows):
        key = (int(r["pts"]), int(r["gd"]), int(r["gf"]))
        if last_key is None:
            last_pos = 1
        elif key != last_key:
            last_pos = idx + 1  # competition rank
        pos_by_pid[int(r["player_id"])] = last_pos
        last_key = key

    return pos_by_pid


def iter_finished_match_points(matches: list[Match]) -> list[tuple[datetime, int, int]]:
    """
    Returns events: (timestamp, player_id, points_for_that_match).
    Used for lastN avg points.
    """
    out: list[tuple[tuple[datetime, int, int, int], int, int]] = []

    def sort_key(m: Match) -> tuple[datetime, int, int, int]:
        """
        Sorting for "recent matches" should follow tournament chronology, not
        "when the result was entered". Many matches share started/finished timestamps.
        """
        t = getattr(m, "tournament", None)
        tdate = getattr(t, "date", None) if t else None
        if isinstance(tdate, date):
            base = datetime.combine(tdate, time.min)
        else:
            # fallback: prefer finished_at/started_at, else epoch
            if m.finished_at:
                base = m.finished_at if isinstance(m.finished_at, datetime) else datetime.fromisoformat(str(m.finished_at))
            elif m.started_at:
                base = m.started_at if isinstance(m.started_at, datetime) else datetime.fromisoformat(str(m.started_at))
            else:
                base = datetime(1970, 1, 1)

        tid = int(getattr(t, "id", 0) or 0) if t else 0
        order_index = int(getattr(m, "order_index", 0) or 0)
        mid = int(getattr(m, "id", 0) or 0)
        return (base, tid, order_index, mid)

    for m in matches:
        if m.state != "finished":
            continue
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue

        a_goals = int(a.goals or 0)
        b_goals = int(b.goals or 0)

        if a_goals > b_goals:
            pts_a, pts_b = 3, 0
        elif a_goals < b_goals:
            pts_a, pts_b = 0, 3
        else:
            pts_a = pts_b = 1

        key = sort_key(m)
        for p in a.players:
            out.append((key, int(p.id), int(pts_a)))
        for p in b.players:
            out.append((key, int(p.id), int(pts_b)))

    out.sort(key=lambda x: x[0])
    return [(k[0], pid, pts) for k, pid, pts in out]


def compute_overall_and_lastN(matches: list[Match], all_players: list[Player], lastN: int = 5) -> dict[int, dict[str, Any]]:
    """
    Returns per player:
      played, wins/draws/losses, gf/ga/gd, pts, lastN_pts(list), lastN_avg_pts(float)
    """
    # lastN=0 is allowed and means "disable recent form".
    lastN_eff = int(lastN or 0)
    if lastN_eff < 0:
      lastN_eff = 0

    # base standings-like from all finished matches
    base = compute_player_standings(matches, all_players)
    per: dict[int, dict[str, Any]] = {int(r["player_id"]): dict(r) for r in base}

    # timeline points
    events = iter_finished_match_points(matches)
    pts_hist: dict[int, list[int]] = defaultdict(list)
    for _, pid, pts in events:
        pts_hist[pid].append(int(pts))

    for p in all_players:
        pid = int(p.id)
        if pid not in per:
            per[pid] = {
                "player_id": pid,
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
        if lastN_eff <= 0:
            per[pid]["lastN_pts"] = []
            per[pid]["lastN_avg_pts"] = 0.0
            continue

        lastN_pts = pts_hist.get(pid, [])[-lastN_eff:]
        per[pid]["lastN_pts"] = lastN_pts
        per[pid]["lastN_avg_pts"] = (sum(lastN_pts) / lastN_eff) if lastN_pts else 0.0

    return per

def unique_winner_player_id(standings_rows: list[dict]) -> int | None:
    """
    Returns the unique winner's player_id if there is exactly one clear #1.
    Returns None if:
      - standings is empty
      - there is a tie for first place (same pts, gd, gf)
    Expects rows sorted by (-pts, -gd, -gf, name) like compute_player_standings().
    """
    if not standings_rows:
        return None

    top = standings_rows[0]
    top_key = (int(top["pts"]), int(top["gd"]), int(top["gf"]))

    # if any other row matches top_key, first place is tied
    for r in standings_rows[1:]:
        key = (int(r["pts"]), int(r["gd"]), int(r["gf"]))
        if key == top_key:
            return None
        break  # rows are sorted; once key differs, no tie at the top

    return int(top["player_id"])
