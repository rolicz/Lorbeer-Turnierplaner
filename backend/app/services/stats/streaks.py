from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from types import SimpleNamespace
from typing import Any, Callable

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


def _dt(v: Any) -> datetime | None:
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v))
    except Exception:
        return None


def _tournament_day(t: Tournament | None) -> datetime | None:
    if not t:
        return None
    d = getattr(t, "date", None)
    if isinstance(d, date):
        return datetime.combine(d, time.min)
    # last resort (shouldn't happen; date has a default)
    created = _dt(getattr(t, "created_at", None))
    return created


def _sort_key(m: Any) -> tuple[datetime, int, int, int]:
    """
    Stable ordering for streak computations.

    IMPORTANT: started_at/finished_at reflect when the score was *entered* and can be
    unrelated to the real tournament chronology. For streaks, we order by
    tournament.date + match.order_index.
    """
    t: Tournament | None = getattr(m, "tournament", None)
    tid = int(getattr(t, "id", 0) or 0) if t else 0

    ts = _tournament_day(t) or datetime(1970, 1, 1)
    order_index = int(getattr(m, "order_index", 0) or 0)
    mid = int(getattr(m, "id", 0) or 0)
    return (ts, tid, order_index, mid)


def _ts_for(m: Any) -> datetime:
    return _sort_key(m)[0]


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
    ms: list[Any] = []

    if include_tournaments(scope_norm):
        stmt = (
            select(Match)
            .where(Match.state == "finished")
            .options(
                selectinload(Match.tournament),
                selectinload(Match.sides).selectinload(MatchSide.players),
            )
        )
        ms.extend(safe_exec_all(s, stmt))

    if include_friendlies(scope_norm) and friendlies_schema_ready(s):
        fstmt = (
            select(FriendlyMatch)
            .where(FriendlyMatch.state == "finished")
            .options(
                selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players),
            )
        )
        ms.extend(_friendly_as_match_like(fm) for fm in safe_exec_all(s, fstmt))

    ms.sort(key=_sort_key)
    return ms


@dataclass
class Event:
    seq: int
    ts: datetime
    match_id: int
    result: str  # "win"|"draw"|"loss"
    gf: int
    ga: int


@dataclass
class Run:
    length: int
    start_ts: datetime | None
    end_ts: datetime | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "length": self.length,
            "start_ts": self.start_ts.isoformat() if self.start_ts else None,
            "end_ts": self.end_ts.isoformat() if self.end_ts else None,
        }


def _best_and_current_run(events: list[Event], pred: Callable[[Event], bool]) -> tuple[Run, Run]:
    best = Run(0, None, None)
    best_start_i: int | None = None
    best_end_i: int | None = None
    cur_len = 0
    cur_start: int | None = None

    for i, ev in enumerate(events):
        ok = pred(ev)
        if ok:
            if cur_len == 0:
                cur_start = i
            cur_len += 1
            if cur_len > best.length:
                start_ev = events[cur_start or 0]
                best_start_i = int(cur_start or 0)
                best_end_i = int(i)
                best = Run(
                    length=cur_len,
                    start_ts=start_ev.ts,
                    end_ts=ev.ts,
                )
        else:
            cur_len = 0
            cur_start = None

    if not events:
        return best, Run(0, None, None)

    # current = run that ends at the last event
    last_i = len(events) - 1
    if cur_len > 0 and pred(events[last_i]):
        start_ev = events[(cur_start or 0)]
        current = Run(
            length=cur_len,
            start_ts=start_ev.ts,
            end_ts=events[last_i].ts,
        )
    else:
        current = Run(0, None, None)

    return best, current


def compute_stats_streaks(
    s: Session,
    *,
    mode: str = "overall",  # "overall"|"1v1"|"2v2"
    player_id: int | None = None,
    limit: int = 10,
    scope: str = "tournaments",
) -> dict[str, Any]:
    mode_norm = str(mode or "overall").strip().lower()
    if mode_norm not in ("overall", "1v1", "2v2"):
        mode_norm = "overall"
    scope_norm = normalize_scope(scope)

    players = list(s.exec(select(Player).order_by(Player.display_name)).all())
    players_by_id = {int(p.id): p for p in players}

    events_by_pid: dict[int, list[Event]] = {int(p.id): [] for p in players}

    matches = _load_finished_matches(s, scope=scope_norm)
    for seq, m in enumerate(matches):
        t: Tournament | None = getattr(m, "tournament", None)
        t_mode = getattr(t, "mode", None)
        if mode_norm != "overall" and t_mode != mode_norm:
            continue

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
            a_res, b_res = "win", "loss"
        elif a_goals < b_goals:
            a_res, b_res = "loss", "win"
        else:
            a_res = b_res = "draw"

        ts = _ts_for(m)
        mid = int(m.id)
        for pid in a_ids:
            events_by_pid.setdefault(pid, []).append(
                Event(
                    seq=seq,
                    ts=ts,
                    match_id=mid,
                    result=a_res,
                    gf=a_goals,
                    ga=b_goals,
                )
            )
        for pid in b_ids:
            events_by_pid.setdefault(pid, []).append(
                Event(
                    seq=seq,
                    ts=ts,
                    match_id=mid,
                    result=b_res,
                    gf=b_goals,
                    ga=a_goals,
                )
            )

    # Ensure per-player events follow the same match order as the global match list.
    # Do NOT re-sort only by timestamps/match_id: many matches share a fallback timestamp,
    # and that would ignore Match.order_index and can fabricate streaks.
    for evs in events_by_pid.values():
        evs.sort(key=lambda e: int(e.seq))

    cats: list[dict[str, Any]] = []

    def add_cat(key: str, name: str, desc: str, pred: Callable[[Event], bool]):
        records: list[dict[str, Any]] = []
        currents: list[dict[str, Any]] = []

        for pid, evs in events_by_pid.items():
            if player_id is not None and int(player_id) != int(pid):
                continue

            best, cur = _best_and_current_run(evs, pred)
            p = players_by_id.get(int(pid))
            player_out = {"id": int(pid), "display_name": p.display_name if p else str(pid)}

            if best.length > 0:
                records.append({"player": player_out, **best.as_dict()})
            if cur.length > 0:
                currents.append({"player": player_out, **cur.as_dict()})

        records.sort(key=lambda r: (-int(r["length"]), (r.get("end_ts") or ""), r["player"]["display_name"].lower()))
        currents.sort(key=lambda r: (-int(r["length"]), (r.get("end_ts") or ""), r["player"]["display_name"].lower()))

        cats.append(
            {
                "key": key,
                "name": name,
                "description": desc,
                "records": records[:limit],
                "records_total": len(records),
                "current": currents[:limit],
                "current_total": len(currents),
            }
        )

    add_cat("win_streak", "Win streak", "Consecutive wins.", lambda e: e.result == "win")
    add_cat("unbeaten_streak", "Unbeaten streak", "Consecutive matches without losing.", lambda e: e.result != "loss")
    add_cat("scoring_streak", "Scoring streak", "Consecutive matches with at least 1 goal scored.", lambda e: e.gf > 0)
    add_cat("clean_sheet_streak", "Clean sheet streak", "Consecutive matches with 0 goals conceded.", lambda e: e.ga == 0)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "mode": mode_norm,
        "scope": scope_norm,
        "player": (
            {"id": int(player_id), "display_name": players_by_id[int(player_id)].display_name}
            if player_id is not None and int(player_id) in players_by_id
            else None
        ),
        "categories": cats,
    }
