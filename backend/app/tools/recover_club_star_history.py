"""
Reconstruct a club's star-rating history from the production backup snapshots (R4).

The app only ever stored one float per club, so the history before this feature exists
only as evidence: every `backup/deploy/<ts>/data/app.db` is a full copy of production at
a known moment, and diffing those copies in order says "this club read 2.0 in March and
2.5 on 31 May". That is what this module does.

Two things it deliberately does not do:

* **It never touches `backup/`.** Every snapshot is opened `mode=ro`; they are the only
  offline copies of production there are.
* **It never guesses a day it does not have.** A change is dated at the snapshot where
  the new value is *first seen*, which is an upper bound — the rating changed at some
  point since the snapshot before it. The report says so, per change, with the window.

Only **deploy** snapshots may be used. `backup/local/*` are pre-sync copies of the dev
database taken just *before* production was pulled in, so interleaving the two kinds by
timestamp invents changes that immediately revert.
"""

from __future__ import annotations

import datetime as dt
import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from sqlmodel import Session, select

from ..models import ClubStarRating
from ..services.club_stars import SOURCE_RECOVERED, SOURCE_SEED, StarRatingResolver, record_star_rating

DEPLOY_KIND = "deploy"


@dataclass(frozen=True)
class Snapshot:
    """One production copy: when it was taken, and what every club read in it."""

    name: str
    db_path: Path
    taken_on: dt.date
    taken_at: dt.datetime
    # club id -> (name, game, stars)
    clubs: dict[int, tuple[str, str, float]]


@dataclass(frozen=True)
class Change:
    club_id: int
    club_name: str
    #: `None` for the first time a club is seen — that is where its record begins.
    previous: float | None
    stars: float
    #: The snapshot's day. An upper bound: the change happened in `(window_from, valid_from]`.
    valid_from: dt.date
    #: The previous snapshot's day, or `None` for the oldest snapshot.
    window_from: dt.date | None
    snapshot: str


@dataclass
class Recovery:
    snapshots: list[Snapshot] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    changes: list[Change] = field(default_factory=list)
    renames: list[tuple[int, str, str]] = field(default_factory=list)

    @property
    def first_seen(self) -> list[Change]:
        return [c for c in self.changes if c.previous is None]

    @property
    def edits(self) -> list[Change]:
        return [c for c in self.changes if c.previous is not None]


# ---------------------------------------------------------------- reading


def _connect_ro(db_path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)


def _table_exists(con: sqlite3.Connection, name: str) -> bool:
    row = con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    return row is not None


def _read_clubs(db_path: Path) -> dict[int, tuple[str, str, float]]:
    con = _connect_ro(db_path)
    try:
        if not _table_exists(con, "club"):
            return {}
        rows = con.execute("SELECT id, name, game, star_rating FROM club").fetchall()
    finally:
        con.close()
    out: dict[int, tuple[str, str, float]] = {}
    for cid, name, game, stars in rows:
        if cid is None or stars is None:
            continue
        out[int(cid)] = (str(name or ""), str(game or ""), float(stars))
    return out


def _parse_dir_timestamp(name: str) -> dt.datetime | None:
    head = name.split("-")
    if len(head) < 2:
        return None
    try:
        return dt.datetime.strptime(f"{head[0]}-{head[1]}", "%Y%m%d-%H%M%S")
    except ValueError:
        return None


def _snapshot_taken_at(snapshot_dir: Path) -> dt.datetime | None:
    meta_path = snapshot_dir / "snapshot.json"
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            meta = {}
        raw = str(meta.get("created_at") or "").strip()
        if raw:
            try:
                return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                pass
    return _parse_dir_timestamp(snapshot_dir.name)


def _snapshot_kind(snapshot_dir: Path) -> str | None:
    meta_path = snapshot_dir / "snapshot.json"
    if not meta_path.is_file():
        return None
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    value = str(meta.get("kind") or "").strip().lower()
    return value or None


def load_snapshots(root: Path) -> tuple[list[Snapshot], list[tuple[str, str]]]:
    """
    Every usable deploy snapshot under `root`, oldest first, plus the ones skipped and
    why. A directory without `snapshot.json` is *not* assumed to be a deploy copy — two
    of the real ones are named without the `-deploy` suffix, so the metadata decides,
    never the directory name.
    """
    snapshots: list[Snapshot] = []
    skipped: list[tuple[str, str]] = []
    if not root.is_dir():
        return snapshots, [(str(root), "backup directory does not exist")]

    for snapshot_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        db_path = snapshot_dir / "data" / "app.db"
        if not db_path.is_file():
            skipped.append((snapshot_dir.name, "no data/app.db"))
            continue
        kind = _snapshot_kind(snapshot_dir)
        if kind != DEPLOY_KIND:
            skipped.append((snapshot_dir.name, f"snapshot.json kind={kind or 'missing'} (deploy only)"))
            continue
        taken_at = _snapshot_taken_at(snapshot_dir)
        if taken_at is None:
            skipped.append((snapshot_dir.name, "no usable timestamp"))
            continue
        clubs = _read_clubs(db_path)
        if not clubs:
            skipped.append((snapshot_dir.name, "no club table / no clubs"))
            continue
        snapshots.append(
            Snapshot(
                name=snapshot_dir.name,
                db_path=db_path,
                taken_on=taken_at.date(),
                taken_at=taken_at,
                clubs=clubs,
            )
        )

    snapshots.sort(key=lambda s: (s.taken_at, s.name))
    return snapshots, skipped


# ---------------------------------------------------------------- diffing


def build_recovery(root: Path) -> Recovery:
    snapshots, skipped = load_snapshots(root)
    rec = Recovery(snapshots=snapshots, skipped=skipped)

    last_stars: dict[int, float] = {}
    last_name: dict[int, str] = {}
    previous_day: dt.date | None = None

    for snap in snapshots:
        for club_id, (name, _game, stars) in sorted(snap.clubs.items()):
            known = last_stars.get(club_id)
            if club_id not in last_stars:
                rec.changes.append(
                    Change(
                        club_id=club_id,
                        club_name=name,
                        previous=None,
                        stars=stars,
                        valid_from=snap.taken_on,
                        window_from=previous_day,
                        snapshot=snap.name,
                    )
                )
            elif known is not None and known != stars:
                rec.changes.append(
                    Change(
                        club_id=club_id,
                        club_name=name,
                        previous=known,
                        stars=stars,
                        valid_from=snap.taken_on,
                        window_from=previous_day,
                        snapshot=snap.name,
                    )
                )
            if club_id in last_name and last_name[club_id] != name:
                rec.renames.append((club_id, last_name[club_id], name))
            last_stars[club_id] = stars
            last_name[club_id] = name
        previous_day = snap.taken_on

    return rec


# ---------------------------------------------------------------- impact


@dataclass(frozen=True)
class SideImpact:
    kind: str  # "tournament" | "friendly"
    side_id: int
    club_id: int
    club_name: str
    played_on: dt.date
    now: float
    then: float


def _read_finished_sides(db_path: Path) -> list[tuple[str, int, int, dt.date]]:
    """(`kind`, side id, club id, date played) for every finished match side with a club."""
    out: list[tuple[str, int, int, dt.date]] = []
    con = _connect_ro(db_path)
    try:
        if _table_exists(con, "matchside"):
            rows = con.execute(
                """
                SELECT ms.id, ms.club_id, t.date
                FROM matchside ms
                JOIN match m ON m.id = ms.match_id
                JOIN tournament t ON t.id = m.tournament_id
                WHERE m.state = 'finished' AND ms.club_id IS NOT NULL
                """
            ).fetchall()
            for side_id, club_id, day in rows:
                parsed = _as_date(day)
                if parsed is not None:
                    out.append(("tournament", int(side_id), int(club_id), parsed))
        if _table_exists(con, "friendlymatchside"):
            rows = con.execute(
                """
                SELECT fs.id, fs.club_id, f.date
                FROM friendlymatchside fs
                JOIN friendlymatch f ON f.id = fs.friendly_match_id
                WHERE f.state = 'finished' AND fs.club_id IS NOT NULL
                """
            ).fetchall()
            for side_id, club_id, day in rows:
                parsed = _as_date(day)
                if parsed is not None:
                    out.append(("friendly", int(side_id), int(club_id), parsed))
    finally:
        con.close()
    return out


def _read_current_clubs(db_path: Path) -> dict[int, tuple[str, float]]:
    con = _connect_ro(db_path)
    try:
        if not _table_exists(con, "club"):
            return {}
        rows = con.execute("SELECT id, name, star_rating FROM club").fetchall()
    finally:
        con.close()
    return {int(cid): (str(name or ""), float(stars or 0.0)) for cid, name, stars in rows if cid is not None}


def _as_date(value: object) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return dt.date.fromisoformat(text[:10])
    except ValueError:
        return None


def measure_impact(db_path: Path, changes: Iterable[Change]) -> tuple[list[SideImpact], int]:
    """
    How many finished match sides in `db_path` would be counted at a different rating
    once the recovered history is in place. Read-only.
    """
    history: dict[int, list[tuple[dt.date, float]]] = {}
    for change in changes:
        history.setdefault(change.club_id, []).append((change.valid_from, change.stars))

    current_clubs = _read_current_clubs(db_path)
    resolver = StarRatingResolver(history, {cid: stars for cid, (_n, stars) in current_clubs.items()})

    sides = _read_finished_sides(db_path)
    impacts: list[SideImpact] = []
    for kind, side_id, club_id, played_on in sides:
        name, now = current_clubs.get(club_id, ("", 0.0))
        then = resolver.as_of(club_id, played_on)
        if then is None:
            continue
        if float(then) != float(now):
            impacts.append(
                SideImpact(
                    kind=kind,
                    side_id=side_id,
                    club_id=club_id,
                    club_name=name,
                    played_on=played_on,
                    now=float(now),
                    then=float(then),
                )
            )
    impacts.sort(key=lambda i: (i.played_on, i.club_name, i.side_id))
    return impacts, len(sides)


def check_target(db_path: Path, rec: Recovery) -> tuple[list[tuple[int, str]], list[tuple[int, str, str]]]:
    """
    Does the target database share a lineage with the snapshots? Clubs are matched by
    **id** — a club can be renamed, and in production the ids are the same rows — so an
    id that is missing, or whose name reads differently, is worth printing before
    anything is written.
    """
    current = _read_current_clubs(db_path)
    latest_name: dict[int, str] = {}
    for snap in rec.snapshots:
        for club_id, (name, _game, _stars) in snap.clubs.items():
            latest_name[club_id] = name

    missing = sorted((cid, name) for cid, name in latest_name.items() if cid not in current)
    mismatched = sorted(
        (cid, name, current[cid][0])
        for cid, name in latest_name.items()
        if cid in current and current[cid][0] != name
    )
    return missing, mismatched


# ---------------------------------------------------------------- writing


def apply_recovery(s: Session, rec: Recovery, *, known_club_ids: set[int]) -> tuple[int, int]:
    """
    Write the recovered rows, oldest first, and return (rows written, seed rows pruned).

    Idempotent through `record_star_rating`: a value already in force on that day is not
    written again, so a second run adds nothing.
    """
    written = 0
    for change in sorted(rec.changes, key=lambda c: (c.valid_from, c.club_id)):
        if change.club_id not in known_club_ids:
            continue
        row = record_star_rating(
            s,
            change.club_id,
            change.stars,
            valid_from=change.valid_from,
            source=SOURCE_RECOVERED,
        )
        if row is not None:
            written += 1
    s.commit()
    pruned = prune_redundant_seed_rows(s)
    return written, pruned


def prune_redundant_seed_rows(s: Session) -> int:
    """
    Drop the "current rating, as of today" row `init_db()` writes for a club whose
    recovered history already ends on that same value. It says nothing the row before it
    does not, and a history that reads "3★ since 28 Mar · 3★ since today" reads like a
    change that never happened.
    """
    rows = list(s.exec(select(ClubStarRating).order_by(ClubStarRating.club_id, ClubStarRating.valid_from, ClubStarRating.id)).all())
    by_club: dict[int, list[ClubStarRating]] = {}
    for row in rows:
        by_club.setdefault(int(row.club_id), []).append(row)

    pruned = 0
    for club_rows in by_club.values():
        for idx, row in enumerate(club_rows):
            if idx == 0 or row.source != SOURCE_SEED:
                continue
            if float(club_rows[idx - 1].stars) == float(row.stars):
                s.delete(row)
                pruned += 1
    if pruned:
        s.commit()
    return pruned


# ---------------------------------------------------------------- report


def _stars(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:g}★"


def render_report(
    rec: Recovery,
    *,
    root: Path,
    impacts: list[SideImpact],
    sides_total: int,
    missing: list[tuple[int, str]],
    mismatched: list[tuple[int, str, str]],
    applied: tuple[int, int] | None,
) -> str:
    lines: list[str] = []
    add = lines.append

    add(f"Club star-rating recovery — deploy snapshots under {root}")
    add("")

    if not rec.snapshots:
        add("No usable deploy snapshot found. Nothing to recover.")
        for name, why in rec.skipped:
            add(f"  skipped {name}: {why}")
        return "\n".join(lines)

    add(f"Snapshots used ({len(rec.snapshots)}):")
    for snap in rec.snapshots:
        add(f"  {snap.taken_on.isoformat()}  {snap.name}  ({len(snap.clubs)} clubs)")
    if rec.skipped:
        add("")
        add(f"Skipped ({len(rec.skipped)}):")
        for name, why in rec.skipped:
            add(f"  {name}: {why}")

    edits = rec.edits
    add("")
    add(
        f"Recovered: {len(rec.first_seen)} clubs get an opening rating, "
        f"{len(edits)} rating changes across {len({c.club_id for c in edits})} clubs."
    )
    if edits:
        add("")
        add("Changes (dated at the snapshot where the new value first appears):")
        for change in edits:
            window = (
                f"after {change.window_from.isoformat()}"
                if change.window_from
                else "at or before the oldest snapshot"
            )
            add(
                f"  {change.valid_from.isoformat()}  {change.club_name} (#{change.club_id})  "
                f"{_stars(change.previous)} → {_stars(change.stars)}   [{window}]"
            )

    if rec.renames:
        add("")
        add(f"Clubs renamed between snapshots ({len(rec.renames)}) — matched by id, not by name:")
        for club_id, before, after in rec.renames:
            add(f"  #{club_id}: {before} → {after}")

    if missing:
        add("")
        add(f"In the snapshots but not in this database ({len(missing)}) — skipped:")
        for club_id, name in missing[:20]:
            add(f"  #{club_id} {name}")
        if len(missing) > 20:
            add(f"  … and {len(missing) - 20} more")
    if mismatched:
        add("")
        add(f"Same id, different name ({len(mismatched)}) — a rename, or the wrong database:")
        for club_id, snap_name, db_name in mismatched[:20]:
            add(f"  #{club_id} snapshot '{snap_name}' vs database '{db_name}'")
        if len(mismatched) > 20:
            add(f"  … and {len(mismatched) - 20} more")

    add("")
    add(f"Impact on the target database: {len(impacts)} of {sides_total} finished match sides change value.")
    for impact in impacts:
        add(
            f"  {impact.played_on.isoformat()}  {impact.club_name} (#{impact.club_id})  "
            f"{impact.kind} side {impact.side_id}: counted {_stars(impact.now)} → {_stars(impact.then)}"
        )

    oldest = rec.snapshots[0].taken_on
    newest = rec.snapshots[-1].taken_on
    gaps = [
        (rec.snapshots[i].taken_on, rec.snapshots[i + 1].taken_on)
        for i in range(len(rec.snapshots) - 1)
        if (rec.snapshots[i + 1].taken_on - rec.snapshots[i].taken_on).days > 7
    ]
    add("")
    add("Limits of this recovery — read them before trusting a date:")
    add(f"  * Nothing is recoverable before {oldest.isoformat()}, the oldest snapshot. A match played")
    add("    earlier is counted at the oldest value on record, which is the best answer available,")
    add("    not a measured one.")
    add("  * Inside a gap between two snapshots the exact day is unknown. Each change is dated at the")
    add("    snapshot where the new value was first seen, so it is an upper bound: the rating changed")
    add("    somewhere in the window printed next to it.")
    if gaps:
        add("    Gaps longer than a week:")
        for start, end in gaps:
            inside = [c for c in edits if start < c.valid_from <= end]
            add(f"      {start.isoformat()} → {end.isoformat()} ({(end - start).days} days, {len(inside)} changes)")
    add(f"  * Nothing after {newest.isoformat()} comes from a snapshot; from there on the history is")
    add("    written live by every star edit.")
    add("  * Rows written here are marked source=recovered, so the app can say the day is approximate.")

    add("")
    if applied is None:
        add("Read-only run: nothing was written. Re-run with --apply to write these rows.")
    else:
        written, pruned = applied
        add(f"Applied: {written} rows written, {pruned} redundant opening rows removed.")
    return "\n".join(lines)
