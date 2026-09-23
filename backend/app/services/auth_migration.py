"""The boot migration from `secrets.json` logins to real accounts (L1).

`migrate_from_settings` runs from `init_db()` on every boot, after `create_all` and the
runtime columns. It is idempotent: a second boot finds nothing to do and logs nothing.
It is also the **only** reader of `settings.player_accounts` besides `manage.py
auth-preflight`, which runs the very same planning code in a dry run against a
read-only copy — so what the preflight prints is what the deploy will do.

The steps (FEATURES_2026-09-auth.md, "The boot migration"):

1. `Group(slug="altherren", name="Altherren")` if no group exists.
2. Every `Player` the new code has never seen — no `Account` **and** no membership — joins
   the default group as a member. (Keyed on "no Account" too, so a player who registered
   and has not been invited yet (L3) is *not* pulled into a group by the next restart.)
3. Every `player_accounts[]` entry whose name matches a `Player` case-insensitively and
   who has no `Account` gets one with `password_hash = argon2id(password)`,
   `password_origin="migrated"`, `site_admin=admin`; an admin's membership becomes
   `owner`. An entry that matches no player is logged and skipped — never created.
4. Every other `Player` without an `Account` gets one with no password, so `name_key` is
   unique across every player from day one.
5. The four `group_id` columns are backfilled — NULL rows only.
6. One log line, only when something was written.

Two players whose names casefold to the same key cannot both get a login name: that is a
**refusal** (`AuthMigrationError`), not a guess, and `auth-preflight` catches it first.
"""

from __future__ import annotations

import base64
import datetime as dt
import logging
import secrets
from dataclasses import dataclass, field

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlmodel import Session

from ..models import Account, Group, GroupMembership
from ..settings import PlayerAccount, Settings
from .passwords import hash_password, hasher_for

log = logging.getLogger(__name__)

DEFAULT_GROUP_SLUG = "altherren"
DEFAULT_GROUP_NAME = "Altherren"

#: The tables whose `group_id` the migration backfills (the four `_RUNTIME_COLUMNS` rows).
GROUP_SCOPED_TABLES: tuple[str, ...] = ("tournament", "friendlymatch", "featurerequest", "clubstarrating")


class AuthMigrationError(RuntimeError):
    """The database cannot be given unique login names; the backend must not boot on it."""


def name_key(name: str) -> str:
    """The login identifier of a display name: stripped and casefolded.

    Exactly the rule `auth._normalize_name` applies at `cfc1669`, so every name that logs
    in today keys to the same account tomorrow ("Flo" displays, "flo" logs in)."""
    return str(name or "").strip().casefold()


def new_webauthn_user_handle() -> str:
    """32 random bytes, base64url without padding — never derived from the player."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")


@dataclass
class MigrationReport:
    groups_created: int = 0
    memberships_created: int = 0
    #: Every `Account` row created — the migrated ones plus the passwordless ones.
    accounts_created: int = 0
    #: Accounts created from `player_accounts[]`, i.e. with a password.
    accounts_migrated: int = 0
    owners_promoted: int = 0
    #: `player_accounts[]` names that match no player (logged, skipped).
    unmatched_names: list[str] = field(default_factory=list)
    #: Players whose names cannot get distinct login names, one list per clash.
    case_collisions: list[list[str]] = field(default_factory=list)
    #: `player_accounts[]` entries that repeat an earlier one's name; the first wins, as
    #: it does in the old login.
    duplicate_entries: list[str] = field(default_factory=list)
    backfilled: dict[str, int] = field(default_factory=dict)
    #: Names of the accounts that would be created with a password, and which are admins.
    migrated_names: list[str] = field(default_factory=list)
    admin_names: list[str] = field(default_factory=list)
    #: Accounts that exist or would exist with a password after this run.
    accounts_with_password_after: int = 0

    @property
    def wrote_anything(self) -> bool:
        return bool(
            self.groups_created
            or self.memberships_created
            or self.accounts_created
            or self.owners_promoted
            or any(self.backfilled.values())
        )

    @property
    def problems(self) -> bool:
        """What `auth-preflight` exits non-zero on."""
        return bool(self.unmatched_names or self.case_collisions)

    def summary_line(self) -> str:
        groups = f"{self.groups_created} group" + ("" if self.groups_created == 1 else "s")
        backfilled = ", ".join(f"{t}={n}" for t, n in self.backfilled.items() if n) or "nothing"
        return (
            f"Auth migrated: {self.accounts_migrated} accounts, {groups}, {self.memberships_created} memberships"
            f" — {self.accounts_created - self.accounts_migrated} players without a password,"
            f" {self.owners_promoted} owner{'' if self.owners_promoted == 1 else 's'}, backfilled {backfilled}"
        )


@dataclass
class _State:
    players: list[tuple[int, str]]
    group_id: int | None
    accounts: dict[int, str]  # player_id -> name_key
    members: dict[int, str]  # player_id -> role, in the default group
    any_membership: set[int]  # player ids with a membership in any group
    null_group_ids: dict[str, int]  # table -> rows whose group_id is (or will be) NULL
    passworded_accounts: int


def _read_state(conn: Connection) -> _State:
    """Everything the plan needs, read with plain SQL so it also works on a database the
    new code has never booted (the preflight runs against a copy of production, where
    none of the new tables or columns exist yet)."""
    tables = set(inspect(conn).get_table_names())

    players = [(int(r[0]), str(r[1])) for r in conn.execute(text("SELECT id, display_name FROM player ORDER BY id"))]

    group_id: int | None = None
    if "group" in tables:
        rows = conn.execute(text('SELECT id, slug FROM "group" ORDER BY id')).all()
        by_slug = {str(r[1]): int(r[0]) for r in rows}
        group_id = by_slug.get(DEFAULT_GROUP_SLUG, int(rows[0][0]) if rows else None)

    accounts: dict[int, str] = {}
    passworded = 0
    if "account" in tables:
        for pid, key, pw in conn.execute(text("SELECT player_id, name_key, password_hash FROM account")):
            accounts[int(pid)] = str(key)
            passworded += 1 if pw else 0

    members: dict[int, str] = {}
    any_membership: set[int] = set()
    if "groupmembership" in tables:
        for gid, pid, role in conn.execute(text("SELECT group_id, player_id, role FROM groupmembership")):
            any_membership.add(int(pid))
            if group_id is not None and int(gid) == group_id:
                members[int(pid)] = str(role)

    null_group_ids: dict[str, int] = {}
    for table in GROUP_SCOPED_TABLES:
        if table not in tables:
            continue
        columns = {c["name"] for c in inspect(conn).get_columns(table)}
        if "group_id" in columns:
            n = conn.execute(text(f"SELECT COUNT(*) FROM {table} WHERE group_id IS NULL")).scalar_one()
        else:  # the runtime column is not there yet: every row will be NULL once it is
            n = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
        null_group_ids[table] = int(n)

    return _State(players, group_id, accounts, members, any_membership, null_group_ids, passworded)


@dataclass
class _Plan:
    report: MigrationReport
    create_group: bool
    new_members: dict[int, str]  # player_id -> role
    promote: list[int]  # existing memberships to raise to owner
    migrated: list[tuple[int, str, PlayerAccount]]  # player_id, name_key, entry
    passwordless: list[tuple[int, str]]  # player_id, name_key


def _plan(state: _State, player_accounts: tuple[PlayerAccount, ...]) -> _Plan:
    report = MigrationReport()

    # Case collisions: a key that two players share, or a key an account already holds for
    # someone else — only where a player still needs an account (an existing account's key
    # is unique by index already).
    needs_account = [(pid, name) for pid, name in state.players if pid not in state.accounts]
    taken = {key: pid for pid, key in state.accounts.items()}
    names_by_key: dict[str, list[tuple[int, str]]] = {}
    for pid, name in state.players:
        names_by_key.setdefault(name_key(name), []).append((pid, name))
    clashing: set[str] = set()
    for pid, name in needs_account:
        key = name_key(name)
        owners = {p for p, _ in names_by_key[key]} | ({taken[key]} if key in taken else set())
        if len(owners) > 1 or not key:
            clashing.add(key)
    for key in sorted(clashing):
        names = [name for _, name in names_by_key.get(key, [])]
        if key in taken and taken[key] not in {p for p, _ in names_by_key.get(key, [])}:
            names.append(f"<account of deleted player {taken[key]}>")
        report.case_collisions.append(names)

    create_group = state.group_id is None
    report.groups_created = 1 if create_group else 0

    # Step 2: players the new code has never seen join the default group.
    new_members: dict[int, str] = {}
    for pid, _name in state.players:
        if pid not in state.accounts and pid not in state.any_membership:
            new_members[pid] = "member"

    # Step 3: `player_accounts[]` → accounts with a password.
    players_by_key = {name_key(name): pid for pid, name in state.players}
    seen_keys: set[str] = set()
    migrated: list[tuple[int, str, PlayerAccount]] = []
    promote: list[int] = []
    for entry in player_accounts:
        key = name_key(entry.name)
        if key in seen_keys:
            report.duplicate_entries.append(entry.name)
            continue
        seen_keys.add(key)
        pid = players_by_key.get(key)
        if pid is None:
            report.unmatched_names.append(entry.name)
            continue
        if pid in state.accounts or key in clashing:
            continue
        migrated.append((pid, key, entry))
        report.migrated_names.append(entry.name)
        if entry.admin:
            report.admin_names.append(entry.name)
            if pid in new_members:
                new_members[pid] = "owner"
                report.owners_promoted += 1
            elif state.members.get(pid) == "member":
                promote.append(pid)
                report.owners_promoted += 1
            elif pid not in state.members:
                new_members[pid] = "owner"
                report.owners_promoted += 1

    # Step 4: everybody else gets a passwordless account.
    migrated_ids = {pid for pid, _, _ in migrated}
    passwordless = [
        (pid, name_key(name))
        for pid, name in needs_account
        if pid not in migrated_ids and name_key(name) not in clashing
    ]

    report.memberships_created = len(new_members)
    report.accounts_migrated = len(migrated)
    report.accounts_created = len(migrated) + len(passwordless)
    report.accounts_with_password_after = state.passworded_accounts + len(migrated)
    report.backfilled = {t: n for t, n in state.null_group_ids.items()}
    return _Plan(report, create_group, new_members, promote, migrated, passwordless)


def migrate_from_settings(engine: Engine, settings: Settings, *, dry_run: bool = False) -> MigrationReport:
    """Run (or, with `dry_run`, only plan) the boot migration. See the module docstring.

    A dry run opens a connection, reads, and never writes — it is safe against a
    read-only engine and against a database that predates every new table."""
    if dry_run:
        with engine.connect() as conn:
            return _plan(_read_state(conn), settings.player_accounts).report

    with Session(engine) as s:
        plan = _plan(_read_state(s.connection()), settings.player_accounts)
        report = plan.report

        if report.case_collisions:
            clashes = "; ".join(" / ".join(names) for names in report.case_collisions)
            raise AuthMigrationError(
                f"Players whose names differ only in case cannot get distinct login names: {clashes}. "
                "Rename one of each pair before this version can boot (run `manage.py auth-preflight`)."
            )
        for name in report.unmatched_names:
            log.warning("Auth migration: player_accounts entry %r matches no player — skipped, nothing created", name)
        for name in report.duplicate_entries:
            log.warning("Auth migration: player_accounts entry %r repeats an earlier name — the first one wins", name)

        if not report.wrote_anything:
            return report

        now = dt.datetime.utcnow()
        if plan.create_group:
            group = Group(slug=DEFAULT_GROUP_SLUG, name=DEFAULT_GROUP_NAME, created_at=now)
            s.add(group)
            s.flush()
            group_id = int(group.id)
        else:
            group_id = int(_read_state(s.connection()).group_id)

        for pid, role in plan.new_members.items():
            s.add(GroupMembership(group_id=group_id, player_id=pid, role=role, created_at=now))
        for pid in plan.promote:
            m = s.get(GroupMembership, (group_id, pid))
            if m is not None:
                m.role = "owner"
                s.add(m)

        # Hash eagerly: the plaintext is on hand on exactly this boot, and one verifier is
        # all the login code ever needs. A migrated password shorter than the new minimum
        # is hashed as it is — refusing it here would lock its owner out.
        ph = hasher_for(settings.password_hash_profile)
        for pid, key, entry in plan.migrated:
            s.add(
                Account(
                    player_id=pid,
                    name_key=key,
                    password_hash=hash_password(ph, entry.password),
                    password_origin="migrated",
                    password_updated_at=now,
                    site_admin=bool(entry.admin),
                    webauthn_user_handle=new_webauthn_user_handle(),
                    created_at=now,
                    updated_at=now,
                )
            )
        for pid, key in plan.passwordless:
            s.add(
                Account(
                    player_id=pid,
                    name_key=key,
                    password_hash=None,
                    password_origin="none",
                    site_admin=False,
                    webauthn_user_handle=new_webauthn_user_handle(),
                    created_at=now,
                    updated_at=now,
                )
            )
        s.flush()

        # Step 5 — NULL rows only (AGENTS.md §5 rule 3).
        backfilled: dict[str, int] = {}
        for table in GROUP_SCOPED_TABLES:
            if table not in report.backfilled:
                continue
            result = s.connection().execute(
                text(f"UPDATE {table} SET group_id = :g WHERE group_id IS NULL"), {"g": group_id}
            )
            backfilled[table] = int(result.rowcount or 0)
        report.backfilled = backfilled

        s.commit()

    if report.wrote_anything:
        log.info(report.summary_line())
    return report
