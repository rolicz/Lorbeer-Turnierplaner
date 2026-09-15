"""
R4 — reconstructing star-rating history from the production backup snapshots.

The real snapshots live in `backup/deploy/` and are Roli's only offline copies of
production, so these tests build their own throwaway ones in `tmp_path` with the same
shape (`<name>/snapshot.json` + `<name>/data/app.db`).
"""

import datetime as dt
import json
import sqlite3
from pathlib import Path

from app.tools.recover_club_star_history import build_recovery, load_snapshots, measure_impact


def make_snapshot(root: Path, name: str, *, created_at: str, kind: str = "deploy", clubs=(), db: bool = True) -> Path:
    snap = root / name
    (snap / "data").mkdir(parents=True)
    (snap / "snapshot.json").write_text(json.dumps({"kind": kind, "created_at": created_at}), encoding="utf-8")
    if db:
        con = sqlite3.connect(snap / "data" / "app.db")
        con.execute("CREATE TABLE club (id INTEGER PRIMARY KEY, name TEXT, game TEXT, star_rating REAL)")
        con.executemany("INSERT INTO club (id, name, game, star_rating) VALUES (?, ?, ?, ?)", clubs)
        con.commit()
        con.close()
    return snap


def test_only_deploy_snapshots_with_a_database_are_used(tmp_path):
    root = tmp_path / "deploy"
    root.mkdir()
    make_snapshot(root, "20260328-010000-deploy", created_at="2026-03-28T01:00:00Z", clubs=[(1, "A", "EA FC 26", 3.0)])
    # Named without the suffix — the metadata decides, and two real ones look like this.
    make_snapshot(root, "20260403-010000", created_at="2026-04-03T01:00:00Z", clubs=[(1, "A", "EA FC 26", 3.5)])
    # A pre-sync dev copy: interleaving it would invent a change that reverts.
    make_snapshot(root, "20260401-010000-local", created_at="2026-04-01T01:00:00Z", kind="local", clubs=[(1, "A", "EA FC 26", 1.0)])
    make_snapshot(root, "20260404-010000-deploy", created_at="2026-04-04T01:00:00Z", db=False)

    snapshots, skipped = load_snapshots(root)
    assert [s.name for s in snapshots] == ["20260328-010000-deploy", "20260403-010000"]
    reasons = dict(skipped)
    assert "no data/app.db" in reasons["20260404-010000-deploy"]
    assert "kind=local" in reasons["20260401-010000-local"]


def test_changes_are_dated_at_the_snapshot_that_first_shows_them(tmp_path):
    root = tmp_path / "deploy"
    root.mkdir()
    make_snapshot(
        root,
        "20260328-010000-deploy",
        created_at="2026-03-28T01:00:00Z",
        clubs=[(1, "Stable FC", "EA FC 26", 3.0), (2, "Moving FC", "EA FC 26", 2.0)],
    )
    make_snapshot(
        root,
        "20260531-010000-deploy",
        created_at="2026-05-31T01:00:00Z",
        clubs=[(1, "Stable FC", "EA FC 26", 3.0), (2, "Moving FC", "EA FC 26", 2.5)],
    )

    rec = build_recovery(root)
    assert len(rec.first_seen) == 2
    (change,) = rec.edits
    assert change.club_id == 2
    assert (change.previous, change.stars) == (2.0, 2.5)
    # The upper bound, and the window it could have happened in.
    assert change.valid_from == dt.date(2026, 5, 31)
    assert change.window_from == dt.date(2026, 3, 28)


def test_a_club_appearing_late_starts_its_record_there(tmp_path):
    root = tmp_path / "deploy"
    root.mkdir()
    make_snapshot(root, "20260328-010000-deploy", created_at="2026-03-28T01:00:00Z", clubs=[(1, "Old FC", "EA FC 26", 3.0)])
    make_snapshot(
        root,
        "20260531-010000-deploy",
        created_at="2026-05-31T01:00:00Z",
        clubs=[(1, "Old FC", "EA FC 26", 3.0), (2, "New FC", "EA FC 26", 4.0)],
    )

    rec = build_recovery(root)
    new_club = [c for c in rec.first_seen if c.club_id == 2]
    assert len(new_club) == 1
    assert new_club[0].valid_from == dt.date(2026, 5, 31)
    assert rec.edits == []


def test_impact_counts_only_the_sides_that_change_value(tmp_path):
    root = tmp_path / "deploy"
    root.mkdir()
    make_snapshot(root, "20260328-010000-deploy", created_at="2026-03-28T01:00:00Z", clubs=[(1, "Moving FC", "EA FC 26", 2.0)])
    make_snapshot(root, "20260531-010000-deploy", created_at="2026-05-31T01:00:00Z", clubs=[(1, "Moving FC", "EA FC 26", 2.5)])
    rec = build_recovery(root)

    target = tmp_path / "target.db"
    con = sqlite3.connect(target)
    con.executescript(
        """
        CREATE TABLE club (id INTEGER PRIMARY KEY, name TEXT, game TEXT, star_rating REAL);
        CREATE TABLE tournament (id INTEGER PRIMARY KEY, date TEXT);
        CREATE TABLE match (id INTEGER PRIMARY KEY, tournament_id INTEGER, state TEXT);
        CREATE TABLE matchside (id INTEGER PRIMARY KEY, match_id INTEGER, club_id INTEGER);
        INSERT INTO club VALUES (1, 'Moving FC', 'EA FC 26', 2.5);
        INSERT INTO tournament VALUES (1, '2026-04-17'), (2, '2026-06-20');
        INSERT INTO match VALUES (1, 1, 'finished'), (2, 2, 'finished'), (3, 2, 'scheduled');
        INSERT INTO matchside VALUES (1, 1, 1), (2, 2, 1), (3, 3, 1), (4, 1, NULL);
        """
    )
    con.commit()
    con.close()

    impacts, total = measure_impact(target, rec.changes)
    # Three finished sides carry a club; only the one played before the change moves.
    assert total == 2
    assert [(i.side_id, i.now, i.then) for i in impacts] == [(1, 2.5, 2.0)]
