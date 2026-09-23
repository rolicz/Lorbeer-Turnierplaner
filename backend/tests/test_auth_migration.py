"""The auth boot migration, the password hasher and `manage.py auth-preflight` (L1)."""

import dataclasses
import datetime as dt
import hashlib
import json
import logging
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import inspect
from sqlmodel import Session, select

from app import db as db_module
from app.db import configure_db, get_engine, init_db
from app.models import (
    Account,
    Club,
    ClubStarRating,
    FeatureRequest,
    FriendlyMatch,
    Group,
    GroupMembership,
    League,
    Player,
    Tournament,
)
from app.services.auth_migration import AuthMigrationError, migrate_from_settings
from app.services.passwords import hash_password, hasher_for, validate_new_password, verify_password
from app.settings import PlayerAccount, Settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_PH = hasher_for("test")


def _settings(db_url: str, accounts=()) -> Settings:
    return Settings(
        db_url=db_url,
        player_accounts=tuple(PlayerAccount(name=n, password=p, admin=a) for n, p, a in accounts),
        jwt_secret="migration-test",
        ws_require_auth=False,
        log_level="INFO",
        password_hash_profile="test",
        app_env="test",
    )


ACCOUNTS = (("Roli", "roli-password", True), ("berni", "berni-password", False))


@pytest.fixture()
def db(tmp_path, monkeypatch):
    """A fresh database with the schema but *without* the migration having run."""
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    url = f"sqlite:///{tmp_path / 'auth.db'}"
    configure_db(url)
    init_db()  # no settings → the migration is skipped
    return url


def _add_players(*names: str) -> dict[str, int]:
    with Session(get_engine()) as s:
        rows = [Player(display_name=n) for n in names]
        s.add_all(rows)
        s.commit()
        return {r.display_name: int(r.id) for r in rows}


def _all(model):
    with Session(get_engine()) as s:
        return list(s.exec(select(model)).all())


# --- passwords: the salt ---------------------------------------------------------------


def test_one_password_hashed_twice_gives_two_different_hashes_that_both_verify():
    for profile in ("test", "default"):
        ph = hasher_for(profile)
        a = hash_password(ph, "same password, twice")
        b = hash_password(ph, "same password, twice")
        assert a.startswith("$argon2id$") and b.startswith("$argon2id$")
        assert a != b
        # `$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>`: the salt is in the string and differs.
        salt_a, salt_b = a.split("$")[4], b.split("$")[4]
        assert salt_a != salt_b
        assert len(salt_a) >= 22  # 16 random bytes, base64 without padding
        assert verify_password(ph, a, "same password, twice") == (True, False)
        assert verify_password(ph, b, "same password, twice") == (True, False)


def test_the_salt_is_not_derived_from_anything_the_caller_knows():
    # Two different accounts with the same password must not share a hash either — there is
    # no username parameter at all, and the salts of many hashes are all distinct.
    salts = {hash_password(TEST_PH, "hunter2hunter2").split("$")[4] for _ in range(20)}
    assert len(salts) == 20


def test_a_wrong_or_missing_hash_does_not_verify():
    h = hash_password(TEST_PH, "correct horse")
    assert verify_password(TEST_PH, h, "wrong horse") == (False, False)
    assert verify_password(TEST_PH, None, "correct horse") == (False, False)
    assert verify_password(TEST_PH, "not-a-hash", "correct horse") == (False, False)


def test_the_default_profile_is_rfc_9106_and_a_test_hash_asks_to_be_rehashed_by_it():
    ph = hasher_for("default")
    assert (ph.time_cost, ph.memory_cost, ph.parallelism, ph.type.name) == (3, 65536, 4, "ID")
    ok, needs_rehash = verify_password(ph, hash_password(TEST_PH, "correct horse"), "correct horse")
    assert (ok, needs_rehash) == (True, True)


def test_a_new_password_needs_ten_to_two_hundred_characters():
    validate_new_password("x" * 10)
    validate_new_password("x" * 200)
    for bad in ("x" * 9, "", "x" * 201):
        with pytest.raises(HTTPException) as exc:
            validate_new_password(bad)
        assert exc.value.status_code == 400


# --- the migration ---------------------------------------------------------------------


def test_the_first_boot_creates_the_group_memberships_and_owners(db):
    ids = _add_players("Roli", "Berni", "Rumpi")
    report = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))

    groups = _all(Group)
    assert [(g.slug, g.name) for g in groups] == [("altherren", "Altherren")]
    roles = {m.player_id: m.role for m in _all(GroupMembership)}
    assert roles == {ids["Roli"]: "owner", ids["Berni"]: "member", ids["Rumpi"]: "member"}
    assert {m.group_id for m in _all(GroupMembership)} == {groups[0].id}
    assert (report.groups_created, report.memberships_created, report.owners_promoted) == (1, 3, 1)


def test_player_accounts_become_argon2id_accounts_and_everyone_else_a_passwordless_one(db):
    ids = _add_players("Roli", "Berni", "Rumpi")
    report = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))

    accounts = {a.player_id: a for a in _all(Account)}
    assert set(accounts) == set(ids.values())
    roli, berni, rumpi = accounts[ids["Roli"]], accounts[ids["Berni"]], accounts[ids["Rumpi"]]

    # Case-insensitive match: `berni` in secrets.json is the player "Berni".
    assert (roli.name_key, berni.name_key, rumpi.name_key) == ("roli", "berni", "rumpi")
    assert verify_password(TEST_PH, roli.password_hash, "roli-password")[0]
    assert verify_password(TEST_PH, berni.password_hash, "berni-password")[0]
    assert not verify_password(TEST_PH, roli.password_hash, "berni-password")[0]
    assert roli.password_hash.startswith("$argon2id$")
    assert "roli-password" not in roli.password_hash
    assert (roli.password_origin, roli.site_admin) == ("migrated", True)
    assert (berni.password_origin, berni.site_admin) == ("migrated", False)
    assert roli.password_updated_at is not None
    assert (rumpi.password_hash, rumpi.password_origin, rumpi.site_admin) == (None, "none", False)

    handles = [a.webauthn_user_handle for a in accounts.values()]
    assert len(set(handles)) == 3 and all(len(h) == 43 for h in handles)
    assert (report.accounts_migrated, report.accounts_created) == (2, 3)


def test_a_second_boot_writes_and_logs_nothing(db, caplog):
    _add_players("Roli", "Berni", "Rumpi")
    with caplog.at_level(logging.INFO, logger="app.services.auth_migration"):
        migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("Auth migrated:")]
    assert len(lines) == 1
    assert lines[0].startswith("Auth migrated: 2 accounts, 1 group, 3 memberships")

    before = {a.player_id: a.password_hash for a in _all(Account)}
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.services.auth_migration"):
        report = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    assert not report.wrote_anything
    assert caplog.records == []
    assert {a.player_id: a.password_hash for a in _all(Account)} == before
    assert (len(_all(Group)), len(_all(GroupMembership)), len(_all(Account))) == (1, 3, 3)


def test_a_name_that_matches_no_player_is_skipped_and_nothing_is_invented(db, caplog):
    _add_players("Roli")
    with caplog.at_level(logging.WARNING, logger="app.services.auth_migration"):
        report = migrate_from_settings(get_engine(), _settings(db, (("Roli", "roli-password", True), ("Rolli", "typo-password", False))))
    assert report.unmatched_names == ["Rolli"]
    assert [p.display_name for p in _all(Player)] == ["Roli"]
    assert len(_all(Account)) == 1
    assert any("'Rolli' matches no player" in r.getMessage() for r in caplog.records)


def test_players_whose_names_differ_only_in_case_are_refused_and_nothing_is_written(db):
    _add_players("Flo", "flo", "Roli")
    with pytest.raises(AuthMigrationError, match="Flo / flo"):
        migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    assert (_all(Group), _all(GroupMembership), _all(Account)) == ([], [], [])


def test_the_dry_run_reports_what_the_real_run_does_and_writes_nothing(db):
    _add_players("Roli", "Berni", "Rumpi")
    with Session(get_engine()) as s:
        s.add(Tournament(name="Night", mode="1v1"))
        s.commit()
    dry = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS), dry_run=True)
    assert (_all(Group), _all(Account)) == ([], [])
    real = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    assert dataclasses.asdict(dry) == dataclasses.asdict(real)


def test_the_four_group_ids_are_backfilled_and_only_where_null(db):
    ids = _add_players("Roli")
    with Session(get_engine()) as s:
        league = League(name="Test League")
        s.add(league)
        s.flush()
        club = Club(name="Test FC", game="EA FC 26", league_id=league.id)
        s.add(club)
        s.flush()
        s.add_all(
            [
                Tournament(name="Night 1", mode="1v1"),
                Tournament(name="Night 2", mode="2v2"),
                Tournament(name="Someone else's", mode="1v1", group_id=99),
                FriendlyMatch(mode="1v1"),
                FeatureRequest(author_player_id=ids["Roli"], title="Idea"),
                ClubStarRating(club_id=club.id, stars=4.0, valid_from=dt.date(2026, 9, 1)),
            ]
        )
        s.commit()

    report = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    assert report.backfilled == {"tournament": 2, "friendlymatch": 1, "featurerequest": 1, "clubstarrating": 1}
    gid = _all(Group)[0].id
    assert sorted(t.group_id for t in _all(Tournament)) == sorted([gid, gid, 99])
    assert [f.group_id for f in _all(FriendlyMatch)] == [gid]
    assert [f.group_id for f in _all(FeatureRequest)] == [gid]
    assert [r.group_id for r in _all(ClubStarRating)] == [gid]


def test_a_player_old_code_wrote_later_is_picked_up_by_the_next_boot(db):
    # The rollback case: old code adds a player and a tournament; the next new-code boot
    # gives the player a membership and an account, and the tournament its group.
    _add_players("Roli")
    migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    ids = _add_players("Atzi")
    with Session(get_engine()) as s:
        s.add(Tournament(name="While rolled back", mode="1v1"))
        s.commit()

    report = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    assert (report.groups_created, report.memberships_created, report.accounts_created) == (0, 1, 1)
    assert report.backfilled == {"tournament": 1, "friendlymatch": 0, "featurerequest": 0, "clubstarrating": 0}
    atzi = next(a for a in _all(Account) if a.player_id == ids["Atzi"])
    assert (atzi.name_key, atzi.password_origin) == ("atzi", "none")


def test_a_registered_player_without_a_group_is_not_pulled_into_one(db):
    # L3's registration creates a Player *with* an Account and no membership; a restart
    # must not quietly invite them.
    _add_players("Roli")
    migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    ids = _add_players("Newcomer")
    with Session(get_engine()) as s:
        s.add(Account(player_id=ids["Newcomer"], name_key="newcomer", webauthn_user_handle="h" * 43))
        s.commit()
    report = migrate_from_settings(get_engine(), _settings(db, ACCOUNTS))
    assert not report.wrote_anything
    assert ids["Newcomer"] not in {m.player_id for m in _all(GroupMembership)}


def test_init_db_with_settings_runs_the_migration(db):
    _add_players("Roli", "Berni")
    init_db(_settings(db, ACCOUNTS))
    assert len(_all(Account)) == 2 and len(_all(Group)) == 1


# --- a database the new code has never seen ------------------------------------------


def _old_shape_db(path: Path) -> None:
    """The slice of a `cfc1669` database the migration reads: no new tables, no group_id."""
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE player (id INTEGER PRIMARY KEY, display_name VARCHAR NOT NULL UNIQUE);
        CREATE TABLE tournament (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, mode VARCHAR NOT NULL);
        INSERT INTO player (display_name) VALUES ('Roli'), ('Berni'), ('Rumpi');
        INSERT INTO tournament (name, mode) VALUES ('A', '1v1'), ('B', '2v2');
        """
    )
    con.commit()
    con.close()


def test_the_runtime_columns_and_indexes_reach_an_existing_table(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    path = tmp_path / "old.db"
    _old_shape_db(path)
    configure_db(f"sqlite:///{path}")
    # The two steps of `init_db` that reach an existing table (`create_all` never alters
    # one); the rest of `init_db` wants the whole old schema, which this slice is not.
    db_module._ensure_runtime_columns()
    db_module._ensure_runtime_indexes()
    db_module._ensure_runtime_indexes()  # idempotent
    insp = inspect(get_engine())
    assert "group_id" in {c["name"] for c in insp.get_columns("tournament")}
    assert "ix_tournament_group_id" in {i["name"] for i in insp.get_indexes("tournament")}


def _write_secrets(path: Path, db_path: Path, accounts) -> None:
    path.write_text(
        json.dumps(
            {
                "db_url": f"sqlite:///{db_path}",
                "player_accounts": [{"name": n, "password": p, "admin": a} for n, p, a in accounts],
                "jwt_secret": "preflight-test",
            }
        ),
        encoding="utf-8",
    )


def _preflight(tmp_path: Path, db_path: Path, accounts) -> subprocess.CompletedProcess:
    secrets = tmp_path / "secrets.json"
    _write_secrets(secrets, db_path, accounts)
    return subprocess.run(
        [sys.executable, "manage.py", "auth-preflight", "--secrets", str(secrets), "--db-url", f"sqlite:///{db_path}"],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        env={"PATH": "/usr/bin:/bin", "UPLOADS_DIR": str(tmp_path / "uploads")},
        timeout=120,
    )


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_preflight_passes_on_a_clean_old_database_and_writes_nothing(tmp_path):
    path = tmp_path / "old.db"
    _old_shape_db(path)
    before = _digest(path)
    r = _preflight(tmp_path, path, ACCOUNTS)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "RESULT: OK" in r.stdout
    assert "accounts with a password:   2  (Roli, berni)" in r.stdout
    assert "tournament=2" in r.stdout
    assert _digest(path) == before
    assert not (tmp_path / "old.db-journal").exists()


def test_preflight_fails_on_a_name_that_matches_no_player(tmp_path):
    path = tmp_path / "old.db"
    _old_shape_db(path)
    r = _preflight(tmp_path, path, (*ACCOUNTS, ("Rolli", "typo-password", False)))
    assert r.returncode == 1, r.stdout + r.stderr
    assert "- Rolli" in r.stdout and "RESULT: FAIL" in r.stdout


def test_preflight_fails_on_players_whose_names_differ_only_in_case(tmp_path):
    path = tmp_path / "old.db"
    _old_shape_db(path)
    con = sqlite3.connect(path)
    con.execute("INSERT INTO player (display_name) VALUES ('rumpi')")
    con.commit()
    con.close()
    r = _preflight(tmp_path, path, ACCOUNTS)
    assert r.returncode == 1, r.stdout + r.stderr
    assert "- Rumpi / rumpi" in r.stdout and "RESULT: FAIL" in r.stdout


def test_preflight_on_an_already_migrated_database_has_nothing_to_do(tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    path = tmp_path / "new.db"
    configure_db(f"sqlite:///{path}")
    init_db()
    _add_players("Roli", "Berni")
    migrate_from_settings(get_engine(), _settings(f"sqlite:///{path}", ACCOUNTS))
    r = _preflight(tmp_path, path, ACCOUNTS)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "accounts with a password:   0" in r.stdout
    assert "group to create:            — (exists)" in r.stdout
