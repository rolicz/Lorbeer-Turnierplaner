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

**The per-group overlay (L12).** A row with `group_id = NULL` is the *global* rating; a
row with a group id is that group's own. A live edit (the clubs endpoints) writes the
editing group's row; the seeder, the boot backfill and the recovery write global rows.
For a group, the timeline is its own rows and the global rows *together* — the latest
row on or before the date wins, whichever scope it is in — so a group with no rows of its
own simply falls through to global, and a global row dated after a group's own row
applies to that group from its date on. `StarRatingResolver.as_of` is the only place that
rule is written. **Promotion** (`promote_to_global`) is an admin writing the group's value
as a global row dated today: forward-only by construction, it never touches a past row,
so no finished match of any group resolves differently after it.

`ClubStarRating` keeps R4's `UNIQUE(club_id, valid_from)`, which the overlay cannot widen
without rebuilding the table (`AGENTS.md` §5 rule 2). So one day holds **one** row per
club across all scopes: a write that would need a second row on a day another scope
already holds raises `StarDayTaken`, which the router answers with a 409.
"""

from __future__ import annotations

import datetime as dt
import logging
from bisect import bisect_right

from sqlalchemy import or_
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


class StarDayTaken(ValueError):
    """The day already holds this club's row in another scope (see the module docstring)."""


def star_history(s: Session, club_id: int, *, group_id: int | None = None) -> list[ClubStarRating]:
    """Every recorded rating of one club that `group_id` sees — the global rows and that
    group's own (`None`: the global rows only) — oldest first."""
    scope = ClubStarRating.group_id.is_(None)
    if group_id is not None:
        scope = or_(scope, ClubStarRating.group_id == int(group_id))
    return list(
        s.exec(
            select(ClubStarRating)
            .where(ClubStarRating.club_id == club_id, scope)
            .order_by(ClubStarRating.valid_from, ClubStarRating.id)
        ).all()
    )


def current_group_id(s: Session) -> int | None:
    """The group a live star write and a stats read are about (`services/groups.py`), or
    `None` before the boot migration has created one (a test helper's bare `init_db()`)."""
    from .groups import current_group

    try:
        return int(current_group(s).id)
    except LookupError:
        return None


def record_star_rating(
    s: Session,
    club_id: int,
    stars: float,
    *,
    valid_from: dt.date | None = None,
    changed_at: dt.datetime | None = None,
    source: str = SOURCE_LIVE,
    group_id: int | None = None,
) -> ClubStarRating | None:
    """
    Append `stars` to a club's history in `group_id`'s scope (`None` = global) and return
    the row, or `None` when the value was already in force on that day for that scope.

    Adds to the session; the caller commits — a star write is part of the same
    transaction as the club row it belongs to. Raises `StarDayTaken` when the day's one
    row belongs to another scope.
    """
    if club_id is None:
        return None
    day = valid_from or today()
    value = float(stars)
    gid = None if group_id is None else int(group_id)

    same_day = s.exec(
        select(ClubStarRating).where(ClubStarRating.club_id == club_id, ClubStarRating.valid_from == day)
    ).first()
    if same_day is not None:
        if same_day.group_id != gid:
            raise StarDayTaken(
                "This club's rating was already set for another scope today — change it again tomorrow"
            )
        # One row per club per day: a second edit on the same day is that day's value,
        # not a second entry in the history.
        if float(same_day.stars) != value:
            same_day.stars = value
            same_day.changed_at = changed_at or dt.datetime.utcnow()
            same_day.source = source
            s.add(same_day)
            return same_day
        return None

    # What this scope already counts on that day — for a group, its own rows and the
    # global ones together, through the one as-of rule.
    in_force = StarRatingResolver.load(s, group_id=gid, club_id=int(club_id)).as_of(club_id, day, strict=True)
    if in_force is not None and float(in_force) == value:
        return None

    row = ClubStarRating(
        club_id=int(club_id),
        stars=value,
        valid_from=day,
        changed_at=changed_at or dt.datetime.utcnow(),
        source=source,
        group_id=gid,
    )
    s.add(row)
    return row


class AlreadyGlobal(ValueError):
    """Promotion would write the value the global rating already has today."""


def promote_to_global(s: Session, club_id: int, group_id: int | None) -> ClubStarRating:
    """
    Make the rating `group_id` counts today the global rating, **from today on** (L12).

    Forward-only by construction: the one row it writes or changes is dated today, so
    every date before today resolves exactly as it did, for every group. The day's one
    row (the `UNIQUE(club_id, valid_from)` constraint) decides the shape of the write:

    * the group's own row is today's → it becomes the global row (same value, same day:
      nothing this group counts moves, and every other group counts it from today);
    * a global row is today's → it takes the group's value;
    * no row today → a new global row.

    Raises `AlreadyGlobal` when the global rating in force today already has that value,
    and `StarDayTaken` when another group holds today's row. Adds to the session; the
    caller commits. `Club.star_rating` (the current value) follows.
    """
    day = today()
    group_view = StarRatingResolver.load(s, group_id=group_id, club_id=int(club_id))
    value = group_view.as_of(club_id, day)
    if value is None:
        raise LookupError("Club not found")
    value = float(value)
    global_view = StarRatingResolver.load(s, group_id=None, club_id=int(club_id))
    global_now = global_view.as_of(club_id, day, strict=True)
    if global_now is not None and float(global_now) == value:
        raise AlreadyGlobal("This rating is already the global one")

    same_day = s.exec(
        select(ClubStarRating).where(ClubStarRating.club_id == club_id, ClubStarRating.valid_from == day)
    ).first()
    if same_day is None:
        row = ClubStarRating(club_id=int(club_id), stars=value, valid_from=day, source=SOURCE_LIVE, group_id=None)
    elif same_day.group_id is None or (group_id is not None and same_day.group_id == int(group_id)):
        row = same_day
        row.group_id = None
        row.stars = value
        row.changed_at = dt.datetime.utcnow()
        row.source = SOURCE_LIVE
    else:
        raise StarDayTaken("Another group set this club's rating today — promote it tomorrow")
    s.add(row)

    club = s.get(Club, int(club_id))
    if club is not None and float(club.star_rating) != value:
        club.star_rating = value
        s.add(club)
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
    "What was this club worth on that day?" — loaded once per stats request, for one
    group (the rows it sees: the global ones and its own, see the module docstring).

    The table is tiny (one row per club plus one per change), so the whole thing is read
    in one query rather than one lookup per match side.
    """

    def __init__(
        self,
        history: dict[int, list[tuple[dt.date, float]]],
        current: dict[int, float],
        *,
        group_history: dict[int, list[tuple[dt.date, int, float]]] | None = None,
        group_id: int | None = None,
    ) -> None:
        # Per club: (day, scope rank, stars), scope rank 0 = global, 1 = the group's own —
        # so on one day the group's row sorts last (the "latest" answer) and the oldest
        # answer can prefer it explicitly.
        self._rows: dict[int, list[tuple[dt.date, int, int | None, float]]] = {}
        for club_id, rows in history.items():
            self._rows.setdefault(int(club_id), []).extend((d, 0, None, float(v)) for d, v in rows)
        for club_id, rows in (group_history or {}).items():
            self._rows.setdefault(int(club_id), []).extend((d, 1, int(g), float(v)) for d, g, v in rows)
        for rows in self._rows.values():
            rows.sort(key=lambda r: (r[0], r[1]))
        self._current = current
        self._group_id = group_id
        self._views: dict[tuple[int, int | None], tuple[list[dt.date], list[tuple[dt.date, int, float]]]] = {}

    @classmethod
    def load(cls, s: Session, *, group_id: int | None = None, club_id: int | None = None) -> StarRatingResolver:
        """The resolver for `group_id` (`None`: the global ratings alone); `club_id` narrows
        the read to one club, for a write path that only asks about that one."""
        history: dict[int, list[tuple[dt.date, float]]] = {}
        group_history: dict[int, list[tuple[dt.date, int, float]]] = {}
        query = select(ClubStarRating.club_id, ClubStarRating.valid_from, ClubStarRating.stars, ClubStarRating.group_id)
        if club_id is not None:
            query = query.where(ClubStarRating.club_id == int(club_id))
        try:
            rows = s.exec(query).all()
        except Exception:  # pragma: no cover - a DB that predates the table
            rows = []
        for cid, valid_from, stars, gid in rows:
            day = _as_date(valid_from)
            if day is None:
                continue
            if gid is None:
                history.setdefault(int(cid), []).append((day, float(stars)))
            elif group_id is not None and int(gid) == int(group_id):
                group_history.setdefault(int(cid), []).append((day, int(gid), float(stars)))

        current: dict[int, float] = {}
        club_query = select(Club.id, Club.star_rating)
        if club_id is not None:
            club_query = club_query.where(Club.id == int(club_id))
        for cid, stars in s.exec(club_query).all():
            if cid is not None:
                current[int(cid)] = float(stars or 0.0)
        return cls(history, current, group_history=group_history, group_id=group_id)

    @classmethod
    def for_current_group(cls, s: Session) -> StarRatingResolver:
        """The resolver every stats read uses: the rows the current group sees."""
        return cls.load(s, group_id=current_group_id(s))

    def _view(self, cid: int, group_id: int | None) -> tuple[list[dt.date], list[tuple[dt.date, int, float]]]:
        key = (cid, group_id)
        view = self._views.get(key)
        if view is None:
            rows = [
                (d, rank, v)
                for d, rank, g, v in self._rows.get(cid, ())
                if g is None or (group_id is not None and g == group_id)
            ]
            view = ([d for d, _r, _v in rows], rows)
            self._views[key] = view
        return view

    def as_of(
        self,
        club_id: int | None,
        on: dt.date | dt.datetime | str | None,
        group_id: int | None = ...,  # type: ignore[assignment]
        *,
        strict: bool = False,
    ) -> float | None:
        """
        The rating in force for `club_id` on `on`, as `group_id` counts it (default: the
        group this resolver was loaded for; `None`: the global rating alone).

        * no club (a match played without one) → `None`;
        * no rows at all → the current rating (`Club.star_rating`);
        * no date → the current rating, because "now" is the only date there is;
        * a date before the first row → the oldest row, the group's own on a tie — the
          oldest value known (`strict`: `None` instead, for a write asking "what does this
          scope already count on that day");
        * otherwise the latest row whose `valid_from` is on or before that date, the
          group's own on a tie — across the global rows and the group's rows together.
        """
        if club_id is None:
            return None
        cid = int(club_id)
        gid = self._group_id if group_id is ... else group_id
        days, rows = self._view(cid, gid)
        if not rows:
            return None if strict else self._current.get(cid)

        day = _as_date(on)
        if day is None:
            return self._current.get(cid, rows[-1][2])

        idx = bisect_right(days, day)
        if idx == 0:
            if strict:
                return None
            # Before the record begins: the oldest value we have is the best answer —
            # and on the oldest day, the group's own row over the global one.
            first = [r for r in rows if r[0] == days[0]]
            return max(first, key=lambda r: r[1])[2]
        return rows[idx - 1][2]
