from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from types import SimpleNamespace
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import FriendlyMatch, FriendlyMatchSide, Match, MatchSide, Player, Tournament
from .scope import (
    friendlies_schema_ready,
    include_friendlies,
    include_tournaments,
    normalize_scope,
    safe_exec_all,
)


def _side_by(m: Any, side: str) -> Any | None:
    for s in m.sides:
        if s.side == side:
            return s
    return None


def _tournament_day(t: Tournament | None) -> datetime:
    if not t:
        return datetime(1970, 1, 1)
    d = getattr(t, "date", None)
    if isinstance(d, date):
        return datetime.combine(d, time.min)
    return datetime(1970, 1, 1)


def _sort_key(m: Any) -> tuple[datetime, int, int, int]:
    """
    Stable chronological ordering: tournament.date + order_index.

    started_at/finished_at can reflect when the score was entered, not the actual
    chronology of the tournament, so we don't use them here.
    """
    t: Tournament | None = getattr(m, "tournament", None)
    tid = int(getattr(t, "id", 0) or 0) if t else 0
    ts = _tournament_day(t)
    order_index = int(getattr(m, "order_index", 0) or 0)
    mid = int(getattr(m, "id", 0) or 0)
    return (ts, tid, order_index, mid)


@dataclass
class RatingState:
    rating: float
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    gf: int = 0
    ga: int = 0


def _expected(ra: float, rb: float) -> float:
    # Standard Elo expected score (base-10 logistic).
    return 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))


def _friendly_as_match_like(fm: FriendlyMatch) -> Any:
    fid = int(fm.id or 0)
    t = SimpleNamespace(
        id=1_000_000_000 + fid,
        mode=fm.mode,
        date=fm.date,
    )
    return SimpleNamespace(
        id=2_000_000_000 + fid,
        tournament=t,
        order_index=0,
        sides=fm.sides,
    )


def _load_finished_matches(s: Session, *, scope: str) -> list[Any]:
    scope_norm = normalize_scope(scope)
    matches: list[Any] = []
    if include_tournaments(scope_norm):
        stmt = (
            select(Match)
            .where(Match.state == "finished")
            .options(
                selectinload(Match.tournament),
                selectinload(Match.sides).selectinload(MatchSide.players),
            )
        )
        matches.extend(safe_exec_all(s, stmt))

    if include_friendlies(scope_norm) and friendlies_schema_ready(s):
        fstmt = (
            select(FriendlyMatch)
            .where(FriendlyMatch.state == "finished")
            .options(
                selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players),
            )
        )
        matches.extend(_friendly_as_match_like(fm) for fm in safe_exec_all(s, fstmt))

    matches.sort(key=_sort_key)
    return matches


def compute_stats_ratings(s: Session, *, mode: str, scope: str = "tournaments") -> dict[str, Any]:
    mode_norm = str(mode or "overall").strip().lower()
    if mode_norm not in ("overall", "1v1", "2v2"):
        mode_norm = "overall"
    scope_norm = normalize_scope(scope)

    players = list(s.exec(select(Player)).all())
    players_by_id = {int(p.id): p for p in players if p.id is not None}

    matches = _load_finished_matches(s, scope=scope_norm)

    base_rating = 1000.0
    k_base = 24.0

    st: dict[int, RatingState] = {pid: RatingState(rating=base_rating) for pid in players_by_id.keys()}

    for m in matches:
        t: Tournament | None = getattr(m, "tournament", None)
        t_mode = str(getattr(t, "mode", "") or "").strip().lower()

        if mode_norm in ("1v1", "2v2"):
            if t_mode != mode_norm:
                continue

        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue

        a_ids = [int(p.id) for p in a.players if p.id is not None]
        b_ids = [int(p.id) for p in b.players if p.id is not None]
        if not a_ids or not b_ids:
            continue

        # Strict team sizing for per-mode ratings.
        if mode_norm == "1v1" and (len(a_ids) != 1 or len(b_ids) != 1):
            continue
        if mode_norm == "2v2" and (len(a_ids) != 2 or len(b_ids) != 2):
            continue

        a_goals = int(getattr(a, "goals", 0) or 0)
        b_goals = int(getattr(b, "goals", 0) or 0)

        if a_goals == b_goals:
            sa = 0.5
            sb = 0.5
        elif a_goals > b_goals:
            sa = 1.0
            sb = 0.0
        else:
            sa = 0.0
            sb = 1.0

        ra = sum(st.get(pid, RatingState(base_rating)).rating for pid in a_ids) / float(len(a_ids))
        rb = sum(st.get(pid, RatingState(base_rating)).rating for pid in b_ids) / float(len(b_ids))
        ea = _expected(ra, rb)

        # Goal margin multiplier: bigger wins move ratings more, but keep it bounded.
        gd = abs(a_goals - b_goals)
        margin_mult = 1.0 + min(2.0, (gd / 4.0))

        delta_team_a = (k_base * margin_mult) * (sa - ea)
        delta_team_b = -delta_team_a

        for pid in a_ids:
            if pid not in st:
                st[pid] = RatingState(rating=base_rating)
            st[pid].rating += delta_team_a / float(len(a_ids))
            st[pid].played += 1
            st[pid].gf += a_goals
            st[pid].ga += b_goals
            if sa == 1.0:
                st[pid].wins += 1
            elif sa == 0.5:
                st[pid].draws += 1
            else:
                st[pid].losses += 1

        for pid in b_ids:
            if pid not in st:
                st[pid] = RatingState(rating=base_rating)
            st[pid].rating += delta_team_b / float(len(b_ids))
            st[pid].played += 1
            st[pid].gf += b_goals
            st[pid].ga += a_goals
            if sb == 1.0:
                st[pid].wins += 1
            elif sb == 0.5:
                st[pid].draws += 1
            else:
                st[pid].losses += 1

    rows: list[dict[str, Any]] = []
    for pid, p in players_by_id.items():
        rs = st.get(pid, RatingState(rating=base_rating))
        rows.append(
            {
                "player": {"id": pid, "display_name": p.display_name},
                "rating": float(rs.rating),
                "played": int(rs.played),
                "wins": int(rs.wins),
                "draws": int(rs.draws),
                "losses": int(rs.losses),
                "gf": int(rs.gf),
                "ga": int(rs.ga),
                "gd": int(rs.gf - rs.ga),
                "pts": int(rs.wins * 3 + rs.draws),
            }
        )

    rows.sort(key=lambda x: (-float(x["rating"]), -int(x["played"]), x["player"]["display_name"].lower()))

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "mode": mode_norm,
        "scope": scope_norm,
        "base_rating": base_rating,
        "k": k_base,
        "rows": rows,
    }
