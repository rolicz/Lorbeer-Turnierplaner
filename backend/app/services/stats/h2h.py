from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import Match, MatchSide, Player, Tournament


def _side_by(m: Match, side: str) -> MatchSide | None:
    for s in m.sides:
        if s.side == side:
            return s
    return None


@dataclass
class PairAgg:
    a_id: int
    b_id: int
    played: int = 0
    draws: int = 0
    a_wins: int = 0
    b_wins: int = 0
    a_gf: int = 0
    a_ga: int = 0

    def as_dict(self, players_by_id: dict[int, Player]) -> dict[str, Any]:
        a = players_by_id.get(self.a_id)
        b = players_by_id.get(self.b_id)

        # closeness: 1.0 if wins are equal, 0.0 if one-sided
        wins_total = self.a_wins + self.b_wins
        win_share = (self.a_wins / wins_total) if wins_total else 0.5
        closeness = 1.0 - min(1.0, abs(win_share - 0.5) * 2.0)

        return {
            "a": {"id": self.a_id, "display_name": a.display_name if a else str(self.a_id)},
            "b": {"id": self.b_id, "display_name": b.display_name if b else str(self.b_id)},
            "played": self.played,
            "a_wins": self.a_wins,
            "draws": self.draws,
            "b_wins": self.b_wins,
            "a_gf": self.a_gf,
            "a_ga": self.a_ga,
            "b_gf": self.a_ga,  # symmetric
            "b_ga": self.a_gf,
            "win_share_a": win_share,
            "rivalry_score": float(self.played) * closeness,
            "dominance_score": float(self.played) * (1.0 - closeness),
        }


@dataclass
class DuoAgg:
    p1_id: int
    p2_id: int
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    gf: int = 0
    ga: int = 0

    def as_dict(self, players_by_id: dict[int, Player]) -> dict[str, Any]:
        p1 = players_by_id.get(self.p1_id)
        p2 = players_by_id.get(self.p2_id)
        pts = self.wins * 3 + self.draws
        ppm = (pts / self.played) if self.played else 0.0
        return {
            "p1": {"id": self.p1_id, "display_name": p1.display_name if p1 else str(self.p1_id)},
            "p2": {"id": self.p2_id, "display_name": p2.display_name if p2 else str(self.p2_id)},
            "played": self.played,
            "wins": self.wins,
            "draws": self.draws,
            "losses": self.losses,
            "gf": self.gf,
            "ga": self.ga,
            "gd": self.gf - self.ga,
            "pts": pts,
            "pts_per_match": ppm,
            "win_rate": (self.wins / self.played) if self.played else 0.0,
        }

@dataclass
class TeamAgg:
    t1: tuple[int, int]
    t2: tuple[int, int]
    played: int = 0
    draws: int = 0
    t1_wins: int = 0
    t2_wins: int = 0
    t1_gf: int = 0
    t1_ga: int = 0

    def as_dict(self, players_by_id: dict[int, Player]) -> dict[str, Any]:
        p1a = players_by_id.get(self.t1[0])
        p1b = players_by_id.get(self.t1[1])
        p2a = players_by_id.get(self.t2[0])
        p2b = players_by_id.get(self.t2[1])

        wins_total = self.t1_wins + self.t2_wins
        win_share = (self.t1_wins / wins_total) if wins_total else 0.5
        closeness = 1.0 - min(1.0, abs(win_share - 0.5) * 2.0)

        return {
            "team1": [
                {"id": self.t1[0], "display_name": p1a.display_name if p1a else str(self.t1[0])},
                {"id": self.t1[1], "display_name": p1b.display_name if p1b else str(self.t1[1])},
            ],
            "team2": [
                {"id": self.t2[0], "display_name": p2a.display_name if p2a else str(self.t2[0])},
                {"id": self.t2[1], "display_name": p2b.display_name if p2b else str(self.t2[1])},
            ],
            "played": self.played,
            "team1_wins": self.t1_wins,
            "draws": self.draws,
            "team2_wins": self.t2_wins,
            "team1_gf": self.t1_gf,
            "team1_ga": self.t1_ga,
            "team2_gf": self.t1_ga,
            "team2_ga": self.t1_gf,
            "win_share_team1": win_share,
            "rivalry_score": float(self.played) * closeness,
            "dominance_score": float(self.played) * (1.0 - closeness),
        }


def _pair_key(p1_id: int, p2_id: int) -> tuple[int, int]:
    return (p1_id, p2_id) if p1_id < p2_id else (p2_id, p1_id)


def _duo_key(p1_id: int, p2_id: int) -> tuple[int, int]:
    return _pair_key(p1_id, p2_id)


def _iter_opponent_pairs(a_ids: Iterable[int], b_ids: Iterable[int]) -> Iterable[tuple[int, int]]:
    for pid in a_ids:
        for qid in b_ids:
            yield pid, qid


def _load_finished_matches(s: Session) -> list[Match]:
    stmt = (
        select(Match)
        .where(Match.state == "finished")
        .options(
            selectinload(Match.tournament),
            selectinload(Match.sides).selectinload(MatchSide.players),
        )
    )
    return list(s.exec(stmt).all())


def _load_players_by_id(s: Session) -> dict[int, Player]:
    players = list(s.exec(select(Player)).all())
    return {int(p.id): p for p in players}


def _update_pair(agg: PairAgg, *, winner: str | None, a_goals: int, b_goals: int, a_is_left: bool):
    agg.played += 1
    if winner is None:
        agg.draws += 1
    else:
        if winner == "left":
            agg.a_wins += 1 if a_is_left else 0
            agg.b_wins += 1 if not a_is_left else 0
        else:
            agg.a_wins += 1 if not a_is_left else 0
            agg.b_wins += 1 if a_is_left else 0

    # goals from A-perspective
    gf = a_goals if a_is_left else b_goals
    ga = b_goals if a_is_left else a_goals
    agg.a_gf += int(gf)
    agg.a_ga += int(ga)


def _update_duo(agg: DuoAgg, *, res: str | None, gf: int, ga: int):
    agg.played += 1
    if res is None:
        agg.draws += 1
    elif res == "win":
        agg.wins += 1
    else:
        agg.losses += 1
    agg.gf += int(gf)
    agg.ga += int(ga)

def _team_matchup_key(t1: tuple[int, int], t2: tuple[int, int]) -> tuple[tuple[int, int], tuple[int, int]]:
    return (t1, t2) if t1 < t2 else (t2, t1)


def _update_team(agg: TeamAgg, *, winner: str | None, a_goals: int, b_goals: int, team1_is_side_a: bool):
    agg.played += 1
    if winner is None:
        agg.draws += 1
    else:
        side_a_won = winner == "left"
        team1_won = side_a_won if team1_is_side_a else (not side_a_won)
        if team1_won:
            agg.t1_wins += 1
        else:
            agg.t2_wins += 1

    gf = a_goals if team1_is_side_a else b_goals
    ga = b_goals if team1_is_side_a else a_goals
    agg.t1_gf += int(gf)
    agg.t1_ga += int(ga)


def compute_stats_h2h(
    s: Session,
    *,
    player_id: int | None,
    limit: int,
    order: str = "rivalry",
) -> dict[str, Any]:
    """
    Head-to-head + 2v2 synergy stats.

    Concepts:
    - Rivalries: player vs player, ranked by games played and closeness (near 50/50).
      We compute this for:
        - 1v1 only (tournament.mode == "1v1")
        - 2v2 only (tournament.mode == "2v2") treating each player as facing both opponents
        - all modes combined
    - Best teammates: 2v2 only, player pairs on the same side.
    """
    players_by_id = _load_players_by_id(s)
    matches = _load_finished_matches(s)

    # "rivalry" = prioritize close + frequent matchups, "played" = raw volume
    order_norm = str(order or "rivalry").strip().lower()
    if order_norm not in ("rivalry", "played"):
        order_norm = "rivalry"

    pairs_all: dict[tuple[int, int], PairAgg] = {}
    pairs_1v1: dict[tuple[int, int], PairAgg] = {}
    pairs_2v2: dict[tuple[int, int], PairAgg] = {}
    duo_2v2: dict[tuple[int, int], DuoAgg] = {}
    team_rivalries_2v2: dict[tuple[tuple[int, int], tuple[int, int]], TeamAgg] = {}

    for m in matches:
        t: Tournament | None = getattr(m, "tournament", None)
        mode = getattr(t, "mode", None)

        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue

        a_ids = [int(p.id) for p in a.players]
        b_ids = [int(p.id) for p in b.players]
        if not a_ids or not b_ids:
            continue

        a_goals = int(a.goals or 0)
        b_goals = int(b.goals or 0)
        if a_goals > b_goals:
            winner = "left"
        elif a_goals < b_goals:
            winner = "right"
        else:
            winner = None

        # player vs player rivalries (all modes)
        for pid, qid in _iter_opponent_pairs(a_ids, b_ids):
            k = _pair_key(pid, qid)
            agg = pairs_all.get(k)
            if not agg:
                agg = PairAgg(a_id=k[0], b_id=k[1])
                pairs_all[k] = agg
            _update_pair(
                agg,
                winner=winner,
                a_goals=a_goals,
                b_goals=b_goals,
                a_is_left=(pid == agg.a_id),  # "left" here means side A
            )

            if mode == "1v1" and len(a_ids) == 1 and len(b_ids) == 1:
                agg1 = pairs_1v1.get(k)
                if not agg1:
                    agg1 = PairAgg(a_id=k[0], b_id=k[1])
                    pairs_1v1[k] = agg1
                _update_pair(
                    agg1,
                    winner=winner,
                    a_goals=a_goals,
                    b_goals=b_goals,
                    a_is_left=(pid == agg1.a_id),
                )

            if mode == "2v2" and len(a_ids) == 2 and len(b_ids) == 2:
                agg2 = pairs_2v2.get(k)
                if not agg2:
                    agg2 = PairAgg(a_id=k[0], b_id=k[1])
                    pairs_2v2[k] = agg2
                _update_pair(
                    agg2,
                    winner=winner,
                    a_goals=a_goals,
                    b_goals=b_goals,
                    a_is_left=(pid == agg2.a_id),
                )

        # 2v2 teammate synergy
        if mode == "2v2" and len(a_ids) == 2 and len(b_ids) == 2:
            a_k = _duo_key(a_ids[0], a_ids[1])
            b_k = _duo_key(b_ids[0], b_ids[1])

            # 2v2 team vs team rivalries (duo vs duo)
            mk = _team_matchup_key(a_k, b_k)
            team1, team2 = mk
            ta = team_rivalries_2v2.get(mk)
            if not ta:
                ta = TeamAgg(t1=team1, t2=team2)
                team_rivalries_2v2[mk] = ta
            team1_is_side_a = a_k == team1
            _update_team(ta, winner=winner, a_goals=a_goals, b_goals=b_goals, team1_is_side_a=team1_is_side_a)

            a_agg = duo_2v2.get(a_k)
            if not a_agg:
                a_agg = DuoAgg(p1_id=a_k[0], p2_id=a_k[1])
                duo_2v2[a_k] = a_agg
            b_agg = duo_2v2.get(b_k)
            if not b_agg:
                b_agg = DuoAgg(p1_id=b_k[0], p2_id=b_k[1])
                duo_2v2[b_k] = b_agg

            if winner is None:
                _update_duo(a_agg, res=None, gf=a_goals, ga=b_goals)
                _update_duo(b_agg, res=None, gf=b_goals, ga=a_goals)
            elif winner == "left":
                _update_duo(a_agg, res="win", gf=a_goals, ga=b_goals)
                _update_duo(b_agg, res="loss", gf=b_goals, ga=a_goals)
            else:
                _update_duo(a_agg, res="loss", gf=a_goals, ga=b_goals)
                _update_duo(b_agg, res="win", gf=b_goals, ga=a_goals)

    def _closeness_from_share(share: float) -> float:
        return 1.0 - min(1.0, abs(float(share) - 0.5) * 2.0)

    def top_pairs(d: dict[tuple[int, int], PairAgg], *, key: str) -> list[dict[str, Any]]:
        items = [x.as_dict(players_by_id) for x in d.values() if x.played > 0]
        if order_norm == "played":
            # tie-breaker: keep the "close matchups" higher
            items.sort(
                key=lambda x: (
                    -int(x["played"]),
                    -float((x.get("rivalry_score") or 0.0) / max(1, int(x["played"]))),
                    x["a"]["display_name"].lower(),
                    x["b"]["display_name"].lower(),
                )
            )
        else:
            items.sort(
                key=lambda x: (
                    -float(x.get(key) or 0.0),
                    -int(x["played"]),
                    x["a"]["display_name"].lower(),
                    x["b"]["display_name"].lower(),
                )
            )
        return items[:limit]

    def top_duos(d: dict[tuple[int, int], DuoAgg]) -> list[dict[str, Any]]:
        items = [x.as_dict(players_by_id) for x in d.values() if x.played > 0]
        # Prefer strong + proven duos
        items.sort(
            key=lambda x: (
                -float(x.get("pts_per_match") or 0.0),
                -int(x["played"]),
                -int(x["pts"]),
                x["p1"]["display_name"].lower(),
                x["p2"]["display_name"].lower(),
            )
        )
        return items[:limit]

    def top_team_rivalries(d: dict[tuple[tuple[int, int], tuple[int, int]], TeamAgg], *, key: str) -> list[dict[str, Any]]:
        items = [x.as_dict(players_by_id) for x in d.values() if x.played > 0]
        if order_norm == "played":
            items.sort(
                key=lambda x: (
                    -int(x["played"]),
                    -float((x.get("rivalry_score") or 0.0) / max(1, int(x["played"]))),
                    x["team1"][0]["display_name"].lower(),
                    x["team1"][1]["display_name"].lower(),
                    x["team2"][0]["display_name"].lower(),
                    x["team2"][1]["display_name"].lower(),
                )
            )
        else:
            items.sort(
                key=lambda x: (
                    -float(x.get(key) or 0.0),
                    -int(x["played"]),
                    x["team1"][0]["display_name"].lower(),
                    x["team1"][1]["display_name"].lower(),
                    x["team2"][0]["display_name"].lower(),
                    x["team2"][1]["display_name"].lower(),
                )
            )
        return items[:limit]

    def player_vs(d: dict[tuple[int, int], PairAgg]) -> list[dict[str, Any]]:
        if player_id is None:
            return []
        out: list[dict[str, Any]] = []
        pid = int(player_id)
        for agg in d.values():
            if agg.played <= 0:
                continue
            if agg.a_id != pid and agg.b_id != pid:
                continue

            # orient as "me" vs "opp"
            me_is_a = agg.a_id == pid
            me_wins = agg.a_wins if me_is_a else agg.b_wins
            opp_wins = agg.b_wins if me_is_a else agg.a_wins
            gf = agg.a_gf if me_is_a else agg.a_ga
            ga = agg.a_ga if me_is_a else agg.a_gf
            pts = me_wins * 3 + agg.draws
            ppm = (pts / agg.played) if agg.played else 0.0

            opp_id = agg.b_id if me_is_a else agg.a_id
            opp = players_by_id.get(opp_id)

            out.append(
                {
                    "opponent": {"id": opp_id, "display_name": opp.display_name if opp else str(opp_id)},
                    "played": agg.played,
                    "wins": me_wins,
                    "draws": agg.draws,
                    "losses": opp_wins,
                    "gf": gf,
                    "ga": ga,
                    "gd": gf - ga,
                    "pts": pts,
                    "pts_per_match": ppm,
                    "win_rate": (me_wins / agg.played) if agg.played else 0.0,
                }
            )

        def closeness_row(r: dict[str, Any]) -> float:
            wins_total = int(r.get("wins") or 0) + int(r.get("losses") or 0)
            share = (int(r.get("wins") or 0) / wins_total) if wins_total else 0.5
            return _closeness_from_share(float(share))

        if order_norm == "played":
            out.sort(key=lambda x: (-int(x["played"]), -closeness_row(x), x["opponent"]["display_name"].lower()))
        else:
            # "legendary": close + many games
            out.sort(
                key=lambda x: (
                    -(int(x["played"]) * closeness_row(x)),
                    -int(x["played"]),
                    x["opponent"]["display_name"].lower(),
                )
            )
        return out[:limit]

    def player_with(d: dict[tuple[int, int], DuoAgg]) -> list[dict[str, Any]]:
        if player_id is None:
            return []
        pid = int(player_id)
        out: list[dict[str, Any]] = []
        for agg in d.values():
            if agg.played <= 0:
                continue
            if agg.p1_id != pid and agg.p2_id != pid:
                continue
            out.append(agg.as_dict(players_by_id))
        if order_norm == "played":
            out.sort(key=lambda x: (-int(x["played"]), -float(x["pts_per_match"]), x["p1"]["display_name"].lower(), x["p2"]["display_name"].lower()))
        else:
            out.sort(key=lambda x: (-float(x["pts_per_match"]), -int(x["played"]), x["p1"]["display_name"].lower(), x["p2"]["display_name"].lower()))
        return out[:limit]

    def player_team_rivalries_2v2(d: dict[tuple[tuple[int, int], tuple[int, int]], TeamAgg]) -> list[dict[str, Any]]:
        if player_id is None:
            return []
        pid = int(player_id)
        items: list[dict[str, Any]] = []
        for agg in d.values():
            if agg.played <= 0:
                continue
            if pid not in agg.t1 and pid not in agg.t2:
                continue
            items.append(agg.as_dict(players_by_id))
        # Use same ordering as top_team_rivalries (but only within player's subset)
        if order_norm == "played":
            items.sort(
                key=lambda x: (
                    -int(x["played"]),
                    -float((x.get("rivalry_score") or 0.0) / max(1, int(x["played"]))),
                    x["team1"][0]["display_name"].lower(),
                    x["team1"][1]["display_name"].lower(),
                    x["team2"][0]["display_name"].lower(),
                    x["team2"][1]["display_name"].lower(),
                )
            )
        else:
            items.sort(
                key=lambda x: (
                    -float(x.get("rivalry_score") or 0.0),
                    -int(x["played"]),
                    x["team1"][0]["display_name"].lower(),
                    x["team1"][1]["display_name"].lower(),
                    x["team2"][0]["display_name"].lower(),
                    x["team2"][1]["display_name"].lower(),
                )
            )
        return items[:limit]

    def pick_extreme(vs: list[dict[str, Any]], *, which: str) -> dict[str, Any] | None:
        if not vs:
            return None
        if which == "nemesis":
            return sorted(vs, key=lambda x: (float(x["pts_per_match"]), -int(x["played"])))[0]
        if which == "victim":
            return sorted(vs, key=lambda x: (-float(x["pts_per_match"]), -int(x["played"])))[0]
        return None

    vs_all = player_vs(pairs_all)
    resp: dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat(),
        "limit": limit,
        "order": order_norm,
        "player": (
            {"id": int(player_id), "display_name": players_by_id[int(player_id)].display_name}
            if player_id is not None and int(player_id) in players_by_id
            else None
        ),
        "rivalries_all": top_pairs(pairs_all, key="rivalry_score"),
        "rivalries_1v1": top_pairs(pairs_1v1, key="rivalry_score"),
        "rivalries_2v2": top_pairs(pairs_2v2, key="rivalry_score"),
        "team_rivalries_2v2": top_team_rivalries(team_rivalries_2v2, key="rivalry_score"),
        "dominance_1v1": top_pairs(pairs_1v1, key="dominance_score"),
        "best_teammates_2v2": top_duos(duo_2v2),
    }

    if player_id is not None:
        resp.update(
            {
                "vs_all": vs_all,
                "vs_1v1": player_vs(pairs_1v1),
                "vs_2v2": player_vs(pairs_2v2),
                "with_2v2": player_with(duo_2v2),
                "team_rivalries_2v2_for_player": player_team_rivalries_2v2(team_rivalries_2v2),
                "nemesis_all": pick_extreme(vs_all, which="nemesis"),
                "favorite_victim_all": pick_extreme(vs_all, which="victim"),
            }
        )

    return resp
