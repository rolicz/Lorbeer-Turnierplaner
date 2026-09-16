from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from typing import Any

from ...models import Match, MatchSide, Player


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
    """Competition ranking (1,1,3) on (pts, gd, gf)."""
    pos_by_pid: dict[int, int] = {}
    last_key: tuple[int, int, int] | None = None
    last_pos = 0

    for idx, r in enumerate(rows):
        key = (int(r["pts"]), int(r["gd"]), int(r["gf"]))
        if last_key is None:
            last_pos = 1
        elif key != last_key:
            last_pos = idx + 1
        pos_by_pid[int(r["player_id"])] = last_pos
        last_key = key

    return pos_by_pid


def iter_finished_match_points(matches: list[Match]) -> list[tuple[datetime, int, int]]:
    """Returns events: (timestamp, player_id, points_for_that_match)."""
    out: list[tuple[tuple[datetime, int, int, int], int, int]] = []

    def sort_key(m: Match) -> tuple[datetime, int, int, int]:
        t = getattr(m, "tournament", None)
        tdate = getattr(t, "date", None) if t else None
        if isinstance(tdate, date):
            base = datetime.combine(tdate, time.min)
        else:
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


def iter_finished_match_goals(matches: list[Match]) -> list[tuple[datetime, int, int, int]]:
    """Returns events: (timestamp, player_id, goals_for_that_match, goals_against_that_match)."""
    out: list[tuple[tuple[datetime, int, int, int], int, int, int]] = []

    def sort_key(m: Match) -> tuple[datetime, int, int, int]:
        t = getattr(m, "tournament", None)
        tdate = getattr(t, "date", None) if t else None
        if isinstance(tdate, date):
            base = datetime.combine(tdate, time.min)
        else:
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
        key = sort_key(m)

        for p in a.players:
            out.append((key, int(p.id), a_goals, b_goals))
        for p in b.players:
            out.append((key, int(p.id), b_goals, a_goals))

    out.sort(key=lambda x: x[0])
    return [(k[0], pid, gf, ga) for k, pid, gf, ga in out]


def compute_overall_and_lastN(matches: list[Match], all_players: list[Player], lastN: int = 5) -> dict[int, dict[str, Any]]:
    """
    Per player: played, wins/draws/losses, gf/ga/gd, pts, lastN_pts, lastN_gf, lastN_ga, lastN_avg_pts.

    `lastN_avg_pts` is points **per match played** in the window: it divides by the
    matches that are actually there, not by `lastN` (A9). Dividing by `lastN` made
    a newcomer's perfect run read as a third of what it was, which is not "form" —
    it is a prior, and one surface's chart axis is the wrong place to hide it. The
    odds model still wants that shrinkage and applies it itself (`odds.py`).
    """
    lastN_eff = int(lastN or 0)
    if lastN_eff < 0:
        lastN_eff = 0

    base = compute_player_standings(matches, all_players)
    per: dict[int, dict[str, Any]] = {int(r["player_id"]): dict(r) for r in base}

    events = iter_finished_match_points(matches)
    pts_hist: dict[int, list[int]] = defaultdict(list)
    for _, pid, pts in events:
        pts_hist[pid].append(int(pts))

    goal_events = iter_finished_match_goals(matches)
    gf_hist: dict[int, list[int]] = defaultdict(list)
    ga_hist: dict[int, list[int]] = defaultdict(list)
    for _, pid, gf, ga in goal_events:
        gf_hist[pid].append(int(gf))
        ga_hist[pid].append(int(ga))

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
            per[pid]["lastN_gf"] = []
            per[pid]["lastN_ga"] = []
            per[pid]["lastN_avg_pts"] = 0.0
            continue

        lastN_pts = pts_hist.get(pid, [])[-lastN_eff:]
        lastN_gf = gf_hist.get(pid, [])[-lastN_eff:]
        lastN_ga = ga_hist.get(pid, [])[-lastN_eff:]
        per[pid]["lastN_pts"] = lastN_pts
        per[pid]["lastN_gf"] = lastN_gf
        per[pid]["lastN_ga"] = lastN_ga
        per[pid]["lastN_avg_pts"] = (sum(lastN_pts) / len(lastN_pts)) if lastN_pts else 0.0

    return per


def unique_winner_player_id(standings_rows: list[dict]) -> int | None:
    """Returns the unique winner's player_id if exactly one clear #1, else None."""
    if not standings_rows:
        return None

    top = standings_rows[0]
    top_key = (int(top["pts"]), int(top["gd"]), int(top["gf"]))

    for r in standings_rows[1:]:
        key = (int(r["pts"]), int(r["gd"]), int(r["gf"]))
        if key == top_key:
            return None
        break

    return int(top["player_id"])


def resolve_tournament_winner_player_id(
    standings_rows: list[dict],
    *,
    decider_type: str,
    decider_winner_player_id: int | None,
    participant_ids: set[int],
) -> int | None:
    """Unique winner from standings, falling back to an explicit tournament decider.

    Mirrors the winner-resolution logic used for cup ownership transfers
    (see ``services/cup.py``): a tied top-of-table defers to the tournament's
    decider, and any resolved winner must actually be a participant.
    """
    winner_id = unique_winner_player_id(standings_rows)
    if winner_id is None:
        if decider_type != "none" and decider_winner_player_id:
            winner_id = int(decider_winner_player_id)
    if winner_id not in participant_ids:
        winner_id = None
    return winner_id


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
