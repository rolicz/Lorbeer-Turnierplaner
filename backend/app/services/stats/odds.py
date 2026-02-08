from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from math import exp
from typing import Any, Iterable

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import Club, Match, MatchSide, Player, Tournament
from ...stats_core import compute_overall_and_lastN


def _side_by(m: Match, side: str) -> MatchSide | None:
    for s in m.sides:
        if s.side == side:
            return s
    return None


def _sort_key(m: Match) -> tuple[datetime, int, int, int]:
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


def _team_player_ids(side: MatchSide | None) -> tuple[int, ...]:
    if not side:
        return ()
    return tuple(sorted(int(p.id) for p in side.players))


def _match_result_score(m: Match) -> tuple[float, float] | None:
    """
    Returns (scoreA, scoreB) in [0, 1] using 1=win, 0.5=draw, 0=loss.
    Only for finished matches.
    """
    if m.state != "finished":
        return None
    a = _side_by(m, "A")
    b = _side_by(m, "B")
    if not a or not b:
        return None
    ag = int(a.goals or 0)
    bg = int(b.goals or 0)
    if ag > bg:
        return (1.0, 0.0)
    if ag < bg:
        return (0.0, 1.0)
    return (0.5, 0.5)


def _sigmoid(x: float) -> float:
    # Safe enough for our ranges.
    return 1.0 / (1.0 + exp(-x))


def _clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


@dataclass(frozen=True)
class _Agg:
    lastN_avg_pts: float  # 0..3 (but divided by N even if fewer matches)
    played: int
    gd_per_match: float


def _player_aggs_from_overall(per: dict[int, dict[str, Any]]) -> dict[int, _Agg]:
    out: dict[int, _Agg] = {}
    for pid, r in per.items():
        played = int(r.get("played") or 0)
        gd = int(r.get("gd") or 0)
        out[int(pid)] = _Agg(
            lastN_avg_pts=float(r.get("lastN_avg_pts") or 0.0),
            played=played,
            gd_per_match=(gd / played) if played > 0 else 0.0,
        )
    return out


def _draw_rate(matches: Iterable[Match]) -> float:
    n = 0
    d = 0
    for m in matches:
        if m.state != "finished":
            continue
        res = _match_result_score(m)
        if not res:
            continue
        n += 1
        if res[0] == 0.5:
            d += 1
    return (d / n) if n > 0 else 0.25


def _pair_form_lastN(matches_2v2: list[Match], lastN: int) -> dict[tuple[int, int], float]:
    """
    Teammate synergy proxy: lastN average points for a specific 2-player pair when on the same side.
    Returns points per match in [0..3], divided by lastN even if fewer matches exist (consistent with UI).
    """
    lastN_eff = max(0, int(lastN or 0))
    if lastN_eff <= 0:
        return {}

    events: dict[tuple[int, int], list[int]] = {}
    ms = [m for m in matches_2v2 if m.state == "finished"]
    ms.sort(key=_sort_key)
    for m in ms:
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue
        ag = int(a.goals or 0)
        bg = int(b.goals or 0)
        if ag > bg:
            pts_a, pts_b = 3, 0
        elif ag < bg:
            pts_a, pts_b = 0, 3
        else:
            pts_a = pts_b = 1

        for side_obj, pts in ((a, pts_a), (b, pts_b)):
            pids = _team_player_ids(side_obj)
            if len(pids) != 2:
                continue
            key = (pids[0], pids[1])
            events.setdefault(key, []).append(int(pts))

    out: dict[tuple[int, int], float] = {}
    for k, pts_hist in events.items():
        tail = pts_hist[-lastN_eff:]
        out[k] = (sum(tail) / lastN_eff) if tail else 0.0
    return out


def _team_h2h_edge(matches: list[Match], *, mode: str, teamA: tuple[int, ...], teamB: tuple[int, ...], lastM: int) -> float:
    """
    Returns an edge score in [-1..1] for teamA vs teamB based on lastM head-to-head matches.
    (+1 means teamA always wins, -1 means always loses).
    """
    lastM_eff = max(0, int(lastM or 0))
    if lastM_eff <= 0:
        return 0.0

    ms = [m for m in matches if m.state == "finished"]
    ms.sort(key=_sort_key)

    # canonical key: team1 < team2
    t1, t2 = (teamA, teamB) if teamA < teamB else (teamB, teamA)
    hist: list[float] = []

    for m in ms:
        t = getattr(m, "tournament", None)
        if mode in ("1v1", "2v2") and getattr(t, "mode", None) != mode:
            continue
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue
        a_ids = _team_player_ids(a)
        b_ids = _team_player_ids(b)
        if len(a_ids) != len(teamA) or len(b_ids) != len(teamB):
            continue

        # identify matchup (unordered)
        aa, bb = (a_ids, b_ids) if a_ids < b_ids else (b_ids, a_ids)
        if aa != t1 or bb != t2:
            continue

        res = _match_result_score(m)
        if not res:
            continue

        # score for canonical team1
        score_team1 = res[0] if (a_ids == t1) else res[1]
        hist.append(float(score_team1))

    tail = hist[-lastM_eff:]
    if not tail:
        return 0.0

    # map [0, 0.5, 1] to edge [-1, 0, +1] (draw is neutral)
    # and average over lastM (still divided by len(tail), that's ok for h2h).
    edge_team1 = sum((v - 0.5) * 2.0 for v in tail) / len(tail)
    return edge_team1 if teamA == t1 else -edge_team1


def _decimal_odds_from_probs(pA: float, pX: float, pB: float, *, overround: float) -> tuple[float, float, float]:
    """
    Convert fair probabilities to bookmaker decimal odds by applying a simple overround.
    """
    o = float(overround or 0.0)
    if o < 0:
        o = 0.0
    if o > 0.25:
        o = 0.25

    # implied sum > 1, like bookmakers
    ia = pA * (1.0 + o)
    ix = pX * (1.0 + o)
    ib = pB * (1.0 + o)

    def odds(imp: float) -> float:
        imp = _clamp(imp, 1e-6, 0.999999)
        v = 1.0 / imp
        return _clamp(v, 1.01, 99.0)

    return (odds(ia), odds(ix), odds(ib))


def compute_match_odds_for_tournament(
    s: Session,
    *,
    tournament: Tournament,
    matches_in_tournament: list[Match],
    lastN_form: int = 10,
    lastM_h2h: int = 8,
    overround: float = 0.07,
) -> dict[int, dict[str, Any]]:
    """
    Returns mapping match_id -> odds payload for scheduled/playing matches.
    Payload contains decimal odds (multiplicator format) and underlying probabilities.
    """
    mode = str(getattr(tournament, "mode", "1v1") or "1v1").strip().lower()
    if mode not in ("1v1", "2v2"):
        mode = "1v1"

    # Load finished matches with tournament+players in both: mode-specific + overall.
    stmt = (
        select(Match)
        .where(Match.state == "finished")
        .options(
            selectinload(Match.tournament),
            selectinload(Match.sides).selectinload(MatchSide.players),
        )
    )
    finished_all = list(s.exec(stmt).all())
    finished_all.sort(key=_sort_key)

    finished_mode = [m for m in finished_all if getattr(getattr(m, "tournament", None), "mode", None) == mode]

    all_players = list(s.exec(select(Player)).all())

    # Player form aggregates.
    # lastN_avg_pts divides by lastN even if fewer matches exist (important to avoid 1 game = 3.0).
    aggs_overall = _player_aggs_from_overall(compute_overall_and_lastN(finished_all, all_players, lastN=lastN_form))
    aggs_mode = _player_aggs_from_overall(compute_overall_and_lastN(finished_mode, all_players, lastN=lastN_form))

    draw_rate_mode = _draw_rate(finished_mode)
    pair_form: dict[tuple[int, int], float] = _pair_form_lastN(finished_mode, lastN=lastN_form) if mode == "2v2" else {}

    # Preload club star ratings (optional signal; small weight).
    club_ids: set[int] = set()
    for m in matches_in_tournament:
        if m.state not in ("scheduled", "playing"):
            continue
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if a and a.club_id is not None:
            club_ids.add(int(a.club_id))
        if b and b.club_id is not None:
            club_ids.add(int(b.club_id))

    club_star: dict[int, float] = {}
    if club_ids:
        for c in s.exec(select(Club).where(Club.id.in_(club_ids))).all():
            if c.id is not None:
                club_star[int(c.id)] = float(getattr(c, "star_rating", 0.0) or 0.0)

    now = datetime.utcnow().isoformat()

    def player_strength(pid: int) -> float:
        """
        Strength in roughly points-per-match units [0..3].
        Mix mode-specific form and overall form.
        """
        o = aggs_overall.get(pid) or _Agg(lastN_avg_pts=0.0, played=0, gd_per_match=0.0)
        m = aggs_mode.get(pid) or _Agg(lastN_avg_pts=0.0, played=0, gd_per_match=0.0)
        # Mode form should dominate, but fall back to overall when data is sparse.
        w_mode = 0.70 if m.played >= 3 else 0.45
        return w_mode * m.lastN_avg_pts + (1.0 - w_mode) * o.lastN_avg_pts

    def player_gdpm(pid: int) -> float:
        o = aggs_overall.get(pid) or _Agg(lastN_avg_pts=0.0, played=0, gd_per_match=0.0)
        m = aggs_mode.get(pid) or _Agg(lastN_avg_pts=0.0, played=0, gd_per_match=0.0)
        w_mode = 0.75 if m.played >= 6 else 0.50
        return w_mode * m.gd_per_match + (1.0 - w_mode) * o.gd_per_match

    def team_strength(team: tuple[int, ...]) -> float:
        if not team:
            return 0.0
        return sum(player_strength(pid) for pid in team) / len(team)

    def team_gdpm(team: tuple[int, ...]) -> float:
        if not team:
            return 0.0
        return sum(player_gdpm(pid) for pid in team) / len(team)

    def synergy_edge(teamA: tuple[int, ...], teamB: tuple[int, ...]) -> float:
        if mode != "2v2":
            return 0.0
        if len(teamA) != 2 or len(teamB) != 2:
            return 0.0
        kA = (teamA[0], teamA[1]) if teamA[0] < teamA[1] else (teamA[1], teamA[0])
        kB = (teamB[0], teamB[1]) if teamB[0] < teamB[1] else (teamB[1], teamB[0])
        pairA = float(pair_form.get(kA, 0.0))
        pairB = float(pair_form.get(kB, 0.0))
        indA = team_strength(teamA)
        indB = team_strength(teamB)
        return (pairA - indA) - (pairB - indB)

    def compute_probs_for_match(m: Match) -> dict[str, Any] | None:
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            return None
        teamA = _team_player_ids(a)
        teamB = _team_player_ids(b)
        if not teamA or not teamB:
            return None
        if mode == "1v1" and (len(teamA) != 1 or len(teamB) != 1):
            return None
        if mode == "2v2" and (len(teamA) != 2 or len(teamB) != 2):
            return None

        # Core signals (similar to what a bookmaker would consider in a lightweight way).
        sA = team_strength(teamA)
        sB = team_strength(teamB)
        gdA = team_gdpm(teamA)
        gdB = team_gdpm(teamB)
        h2h = _team_h2h_edge(finished_all, mode=mode, teamA=teamA, teamB=teamB, lastM=lastM_h2h)
        syn = synergy_edge(teamA, teamB)

        # Translate to a single matchup delta.
        # Units are "points per match" with small additive corrections.
        delta = (sA - sB) + 0.20 * (gdA - gdB) + 0.25 * h2h + 0.22 * syn

        # Optional: incorporate club star rating (bigger influence for big star gaps).
        if a.club_id is not None and b.club_id is not None:
            sa = float(club_star.get(int(a.club_id), 0.0))
            sb = float(club_star.get(int(b.club_id), 0.0))
            if sa and sb:
                # Normalize to [-1..1] (max gap 4.5), then amplify big gaps non-linearly.
                # 5.0 vs 0.5 => |norm|=1 => full weight.
                norm = (sa - sb) / 4.5
                delta += 0.80 * norm * abs(norm)

        # If the match is live, incorporate current score advantage (we don't have minute-by-minute timing).
        if m.state == "playing":
            delta += 0.95 * float(int(a.goals or 0) - int(b.goals or 0))

        # Draw probability: baseline draw-rate + closeness bump.
        close_bump = 0.10 * exp(-abs(delta) * 2.5)
        pX = _clamp(draw_rate_mode + close_bump, 0.10, 0.42)

        # Live games with a big goal difference are extremely unlikely to end as a draw.
        if m.state == "playing":
            gd_live = abs(int(a.goals or 0) - int(b.goals or 0))
            pX = _clamp(pX * exp(-0.85 * float(gd_live)), 0.01, 0.35)

        # Win/loss split conditional on "not a draw".
        # The slope is tuned so odds don't become too extreme on small datasets.
        slope = 1.45 if m.state != "playing" else 2.05
        pA_nodraw = _sigmoid(delta * slope)
        pA = (1.0 - pX) * pA_nodraw
        pB = (1.0 - pX) * (1.0 - pA_nodraw)

        # Bayesian shrinkage towards a sensible football prior, based on dataset size.
        eff = float(min(40, len(finished_mode)))
        prior = (0.36, 0.28, 0.36)
        prior_strength = 10.0 if m.state != "playing" else 6.0

        # Live matches should react strongly to the current score even if there is no historic data yet.
        if m.state == "playing":
            gd_live = abs(int(a.goals or 0) - int(b.goals or 0))
            eff += float(min(60, 6 + gd_live * 8))
            prior_strength = 4.0
        denom = eff + prior_strength
        pA = (pA * eff + prior[0] * prior_strength) / denom
        pX = (pX * eff + prior[1] * prior_strength) / denom
        pB = (pB * eff + prior[2] * prior_strength) / denom

        # Renormalize (numeric hygiene).
        ssum = pA + pX + pB
        if ssum <= 0:
            pA, pX, pB = prior
            ssum = sum(prior)
        pA, pX, pB = pA / ssum, pX / ssum, pB / ssum

        oA, oX, oB = _decimal_odds_from_probs(pA, pX, pB, overround=overround)
        return {
            "model": "v1",
            "updated_at": now,
            "p_home": round(float(pA), 6),
            "p_draw": round(float(pX), 6),
            "p_away": round(float(pB), 6),
            "home": round(float(oA), 2),
            "draw": round(float(oX), 2),
            "away": round(float(oB), 2),
        }

    out: dict[int, dict[str, Any]] = {}
    for m in matches_in_tournament:
        if m.state not in ("scheduled", "playing"):
            continue
        if m.id is None:
            continue
        payload = compute_probs_for_match(m)
        if payload:
            out[int(m.id)] = payload
    return out
