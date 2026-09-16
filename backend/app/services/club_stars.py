"""
Club star ratings over time (R4).

`Club.star_rating` is the *current* value and stays that way — the pickers, the clubs
page and the prematch odds all want "how good is this club today". Everything that looks
at a finished match asks a different question, "what was it worth on the day it was
played", and that one is answered here from `ClubStarRating`.

The whole feature is three small rules:

1. **Every star write appends.** `record_star_rating()` is called from every path that
   changes a rating (the create and patch endpoints, the JSON seeder); it writes one row
   per club per day and skips a write that changes nothing.
2. **The first row answers everything before it.** A history that starts on 2026-05-31
   does not claim the club was unrated in March — it claims the oldest value we know is
   the one to use. `init_db()` seeds one row per club at its current rating, so a
   database that never had a star edit resolves exactly as it did before this feature.
3. **A match resolves by date**, the tournament's or the friendly's own date, never by
   when the score happened to be typed in (`started_at`/`finished_at` reflect data entry,
   see `services/stats/streaks.py`).
"""

from __future__ import annotations

import datetime as dt
import logging
from bisect import bisect_right

from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from ..models import Club, ClubStarRating

log = logging.getLogger(__name__)

#: Rows written by `init_db()` for a club that has no history yet.
SOURCE_SEED = "seed"
#: Rows written by a real star edit (API or seeder).
SOURCE_LIVE = "live"
#: Rows reconstructed from a backup snapshot — `valid_from` is an upper bound (the day
#: the new value was first *seen*), not the day it was set.
SOURCE_RECOVERED = "recovered"


def today() -> dt.date:
    """The day a live star edit is dated at. UTC, like every other timestamp here."""
    return dt.datetime.utcnow().date()


def _as_date(value: dt.date | dt.datetime | str | None) -> dt.date | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return dt.date.fromisoformat(text[:10])
    except ValueError:
        return None


def star_history(s: Session, club_id: int) -> list[ClubStarRating]:
    """Every recorded rating of one club, oldest first."""
    return list(
        s.exec(
            select(ClubStarRating)
            .where(ClubStarRating.club_id == club_id)
            .order_by(ClubStarRating.valid_from, ClubStarRating.id)
        ).all()
    )


def record_star_rating(
    s: Session,
    club_id: int,
    stars: float,
    *,
    valid_from: dt.date | None = None,
    changed_at: dt.datetime | None = None,
    source: str = SOURCE_LIVE,
) -> ClubStarRating | None:
    """
    Append `stars` to a club's history and return the row, or `None` when the value was
    already in force on that day.

    Adds to the session; the caller commits — a star write is part of the same
    transaction as the club row it belongs to.
    """
    if club_id is None:
        return None
    day = valid_from or today()
    value = float(stars)

    rows = star_history(s, club_id)

    same_day = next((r for r in rows if r.valid_from == day), None)
    if same_day is not None:
        # One row per club per day: a second edit on the same day is that day's value,
        # not a second entry in the history.
        if float(same_day.stars) != value:
            same_day.stars = value
            same_day.changed_at = changed_at or dt.datetime.utcnow()
            same_day.source = source
            s.add(same_day)
            return same_day
        return None

    previous = [r for r in rows if r.valid_from < day]
    if previous and float(previous[-1].stars) == value:
        return None

    row = ClubStarRating(
        club_id=int(club_id),
        stars=value,
        valid_from=day,
        changed_at=changed_at or dt.datetime.utcnow(),
        source=source,
    )
    s.add(row)
    return row


def backfill_club_star_history(engine: Engine) -> int:
    """
    Give every club without a single recorded rating one row at its current value,
    dated today. Idempotent: a club that already has history is left alone, so a
    recovered timeline is never overwritten by a boot.

    With only this row a club resolves to its current rating for every date — exactly
    what the app did before the table existed.
    """
    written = 0
    with Session(engine) as s:
        known = {int(cid) for cid in s.exec(select(ClubStarRating.club_id)).all()}
        clubs = s.exec(select(Club)).all()
        day = today()
        for club in clubs:
            if club.id is None or int(club.id) in known:
                continue
            s.add(
                ClubStarRating(
                    club_id=int(club.id),
                    stars=float(club.star_rating),
                    valid_from=day,
                    source=SOURCE_SEED,
                )
            )
            written += 1
        if written:
            s.commit()
    return written


class StarRatingResolver:
    """
    "What was this club worth on that day?" — loaded once per stats request.

    The table is tiny (one row per club plus one per change), so the whole thing is read
    in one query rather than one lookup per match side.
    """

    def __init__(self, history: dict[int, list[tuple[dt.date, float]]], current: dict[int, float]) -> None:
        self._days: dict[int, list[dt.date]] = {}
        self._stars: dict[int, list[float]] = {}
        for club_id, rows in history.items():
            ordered = sorted(rows, key=lambda r: r[0])
            self._days[club_id] = [d for d, _ in ordered]
            self._stars[club_id] = [v for _, v in ordered]
        self._current = current

    @classmethod
    def load(cls, s: Session) -> StarRatingResolver:
        history: dict[int, list[tuple[dt.date, float]]] = {}
        try:
            rows = s.exec(select(ClubStarRating.club_id, ClubStarRating.valid_from, ClubStarRating.stars)).all()
        except Exception:  # pragma: no cover - a DB that predates the table
            rows = []
        for club_id, valid_from, stars in rows:
            day = _as_date(valid_from)
            if day is None:
                continue
            history.setdefault(int(club_id), []).append((day, float(stars)))

        current: dict[int, float] = {}
        for club_id, stars in s.exec(select(Club.id, Club.star_rating)).all():
            if club_id is not None:
                current[int(club_id)] = float(stars or 0.0)
        return cls(history, current)

    def as_of(self, club_id: int | None, on: dt.date | dt.datetime | str | None) -> float | None:
        """
        The rating in force for `club_id` on `on`.

        * no club (a match played without one) → `None`;
        * no date → the current rating, because "now" is the only date there is;
        * a date before the first recorded row → that first row, the oldest value known;
        * otherwise the last row whose `valid_from` is on or before that date.
        """
        if club_id is None:
            return None
        cid = int(club_id)
        days = self._days.get(cid)
        if not days:
            return self._current.get(cid)

        day = _as_date(on)
        if day is None:
            return self._current.get(cid, self._stars[cid][-1])

        idx = bisect_right(days, day)
        if idx == 0:
            # Before the record begins: the oldest value we have is the best answer.
            return self._stars[cid][0]
        return self._stars[cid][idx - 1]
