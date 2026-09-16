import datetime as dt

from sqlmodel import Session, select

from app.db import get_engine
from app.models import FriendlyMatch, Match, Tournament


def match_signature(match: dict) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """
    Orientation matters: (teamA ids, teamB ids), each sorted.
    """
    sides = {s["side"]: s for s in match["sides"]}
    a_ids = tuple(sorted(p["id"] for p in sides["A"]["players"]))
    b_ids = tuple(sorted(p["id"] for p in sides["B"]["players"]))
    return (a_ids, b_ids)


def matches_by_leg(tournament: dict, leg: int) -> list[dict]:
    return [m for m in tournament["matches"] if m.get("leg") == leg]


# ---- A10: moving the grace window's anchors (no clock patching) -------------

GRACE_PAST = dt.timedelta(hours=1, minutes=5)


def backdate_tournament_creation(tournament_id: int, delta: dt.timedelta = GRACE_PAST) -> None:
    """Move a tournament's `created_at` back — the anchor of the DELETE window."""
    with Session(get_engine()) as s:
        t = s.get(Tournament, tournament_id)
        t.created_at = dt.datetime.utcnow() - delta
        s.add(t)
        s.commit()


def backdate_tournament_finish(tournament_id: int, delta: dt.timedelta = GRACE_PAST) -> None:
    """Move a finished tournament's end back — the anchor of the EDIT window.

    Both anchors are moved: the latest `Match.finished_at` and the `updated_at` fallback.
    """
    moment = dt.datetime.utcnow() - delta
    with Session(get_engine()) as s:
        for m in s.exec(select(Match).where(Match.tournament_id == tournament_id)).all():
            if m.finished_at is not None:
                m.finished_at = moment
                s.add(m)
        t = s.get(Tournament, tournament_id)
        t.updated_at = moment
        s.add(t)
        s.commit()


def backdate_friendly(friendly_id: int, delta: dt.timedelta = GRACE_PAST) -> None:
    with Session(get_engine()) as s:
        fm = s.get(FriendlyMatch, friendly_id)
        fm.created_at = dt.datetime.utcnow() - delta
        s.add(fm)
        s.commit()
