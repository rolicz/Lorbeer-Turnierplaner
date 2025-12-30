from __future__ import annotations

from typing import Dict, Optional, Tuple

from sqlalchemy import case, func
from sqlmodel import Session, select

from .models import Match


def _rank_expr():
    # finished=0, playing=1, scheduled=2
    return case(
        (Match.state == "finished", 0),
        (Match.state == "playing", 1),
        (Match.state == "scheduled", 2),
        else_=99,
    )


def status_from_minmaxcount(min_rank: int | None, max_rank: int | None, count: int) -> str:
    """
    Draft:
      - no matches OR all scheduled
    Done:
      - all finished
    Live:
      - anything else (mix / any playing)
    """
    if count <= 0 or min_rank is None or max_rank is None:
        return "draft"
    if min_rank == 2 and max_rank == 2:
        return "draft"
    if min_rank == 0 and max_rank == 0:
        return "done"
    return "live"


def compute_status_for_tournament(s: Session, tournament_id: int) -> str:
    r = _rank_expr()
    row = s.exec(
        select(
            func.min(r),
            func.max(r),
            func.count(Match.id),
        ).where(Match.tournament_id == tournament_id)
    ).one()
    minr, maxr, cnt = row
    return status_from_minmaxcount(int(minr) if minr is not None else None, int(maxr) if maxr is not None else None, int(cnt))


def compute_status_map(s: Session) -> Dict[int, str]:
    """
    Returns {tournament_id: status} for tournaments that have matches.
    Tournaments with 0 matches are not present and should be treated as "draft".
    """
    r = _rank_expr()
    rows = s.exec(
        select(
            Match.tournament_id,
            func.min(r),
            func.max(r),
            func.count(Match.id),
        ).group_by(Match.tournament_id)
    ).all()

    out: Dict[int, str] = {}
    for tid, minr, maxr, cnt in rows:
        out[int(tid)] = status_from_minmaxcount(
            int(minr) if minr is not None else None,
            int(maxr) if maxr is not None else None,
            int(cnt),
        )
    return out


def find_other_live_tournament_id(s: Session, current_tournament_id: int) -> Optional[int]:
    """
    Returns another tournament_id that is currently "live", or None.
    (Derived solely from match states.)
    """
    status_by_tid = compute_status_map(s)
    for tid, st in status_by_tid.items():
        if tid != current_tournament_id and st == "live":
            return tid
    return None
