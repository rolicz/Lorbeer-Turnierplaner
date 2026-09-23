from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import inspect, text
from sqlalchemy.pool import NullPool, StaticPool
from sqlmodel import Session, SQLModel, create_engine

from .league_nations import backfill_league_nations

if TYPE_CHECKING:
    from .settings import Settings

log = logging.getLogger(__name__)

_engine = None

def configure_db(db_url: str) -> None:
    global _engine
    is_sqlite = db_url.startswith("sqlite")
    connect_args = {"check_same_thread": False} if is_sqlite else {}
    engine_kwargs = {"echo": False, "connect_args": connect_args}

    if is_sqlite:
        # SQLite in deployment: avoid QueuePool exhaustion under concurrent API/image requests.
        # For in-memory SQLite (mainly tests), keep a single shared connection.
        if ":memory:" in db_url or "mode=memory" in db_url:
            engine_kwargs["poolclass"] = StaticPool
        else:
            engine_kwargs["poolclass"] = NullPool

    _engine = create_engine(db_url, **engine_kwargs)

def init_db(settings: Settings | None = None) -> None:
    """Create and migrate the schema, then run the idempotent boot backfills.

    `settings` is what the auth migration reads `player_accounts[]` from; without it (a
    test helper that only wants the tables) the migration is skipped and says so."""
    if _engine is None:
        raise RuntimeError("DB not configured. Call configure_db(db_url) first.")

    # Imported here, not at module level: `db` is imported long before the models are
    # wanted. It must happen *before* create_all, though — pulling in the service pulls
    # in `app.models`, which is what puts every table into `SQLModel.metadata`.
    from .services.club_stars import backfill_club_star_history

    SQLModel.metadata.create_all(_engine)
    _ensure_runtime_columns()
    _ensure_runtime_indexes()

    changed = backfill_league_nations(_engine)
    if changed > 0:
        log.info("League nations backfilled: %s", changed)

    # Every club starts its history at its current rating (R4).
    seeded = backfill_club_star_history(_engine)
    if seeded > 0:
        log.info("Club star history seeded: %s", seeded)

    # Accounts, the one group, memberships and the group_id backfill (L1). After the
    # runtime columns (it backfills them), before the record holders. Raises on a
    # database that cannot be given unique login names — the backend must not boot there.
    if settings is None:
        log.info("Auth migration skipped: init_db() was called without settings")
    else:
        from .services.auth_migration import migrate_from_settings

        migrate_from_settings(_engine, settings)

    # Who holds which record, as of now (M2). Lazily imported for the same reason as
    # above, and *silent by design*: a key that has never been computed is stored
    # without announcing anything, so neither the first boot nor a later deploy that
    # adds a record kind pushes every current holder at everybody.
    from .services.record_holders import backfill_record_holders

    seeded_records = backfill_record_holders(_engine)
    if seeded_records > 0:
        log.info("Record holders seeded: %s", seeded_records)

    # What a guestbook entry is about, and the pinned copy behind it (K1). Old code
    # knows neither table, so an entry deleted while rolled back leaves its link and
    # its file — and a reused entry id (A9) would inherit the stale subject. Silent
    # when there is nothing to do.
    from .services.guestbook_subjects import sweep_orphan_subjects

    swept = sweep_orphan_subjects(_engine)
    if swept > 0:
        log.info("Guestbook subjects swept: %s", swept)

    # The derived media cache (W1): a directory whose source is gone, or a cached size
    # older than the picture it was made from — which is what a rollback leaves, since old
    # code overwrites an avatar without knowing the cache exists. Silent when there is
    # nothing to do, because a cache that rebuilds itself is not news.
    from .services.media_derivatives import sweep_orphan_derivatives

    swept_media = sweep_orphan_derivatives()
    if swept_media > 0:
        log.info("Derived media swept: %s", swept_media)


# Columns added to existing deployments after the fact: (table, column, DDL type/default).
# Additive only — old code keeps working against a migrated DB.
_RUNTIME_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("pushsubscriptionpreference", "notification_mode", "VARCHAR NOT NULL DEFAULT 'finished_only'"),
    ("league", "nation", "VARCHAR"),
    # `featurerequest` is a table R5 introduces, so a deployed DB creates it whole and
    # this line is a no-op there (the loop skips a table that does not exist yet). It
    # is here for the dev databases that ran an in-progress build of R5 before
    # `edited_at` existed: `create_all` never alters an existing table, so without it
    # those copies would keep a `featurerequest` the shipped code cannot read.
    ("featurerequest", "edited_at", "DATETIME"),
    # The group a row belongs to (L1). Nullable, no default: old code never writes it,
    # and the boot migration backfills NULL rows only. The models declare the same
    # column with `foreign_key="group.id"`, so a fresh database gets it from create_all.
    ("tournament", "group_id", "INTEGER"),
    ("friendlymatch", "group_id", "INTEGER"),
    ("featurerequest", "group_id", "INTEGER"),
    ("clubstarrating", "group_id", "INTEGER"),
)

# Indexes create_all would have made for a runtime column on a fresh database, but never
# makes on an existing table: (index name, table, column). Named exactly as SQLModel
# names them, so a fresh and a migrated database end up with the same index.
_RUNTIME_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_tournament_group_id", "tournament", "group_id"),
    ("ix_friendlymatch_group_id", "friendlymatch", "group_id"),
    ("ix_featurerequest_group_id", "featurerequest", "group_id"),
    ("ix_clubstarrating_group_id", "clubstarrating", "group_id"),
)


def _ensure_runtime_columns() -> None:
    if _engine is None:
        return
    inspector = inspect(_engine)
    tables = set(inspector.get_table_names())
    for table, column, ddl in _RUNTIME_COLUMNS:
        if table not in tables:
            continue
        columns = {col["name"] for col in inspector.get_columns(table)}
        if column in columns:
            continue
        with _engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))

def _ensure_runtime_indexes() -> None:
    if _engine is None:
        return
    inspector = inspect(_engine)
    tables = set(inspector.get_table_names())
    for name, table, column in _RUNTIME_INDEXES:
        if table not in tables:
            continue
        if column not in {col["name"] for col in inspector.get_columns(table)}:
            continue
        with _engine.begin() as conn:
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({column})"))

def get_session():
    if _engine is None:
        raise RuntimeError("DB not configured. Call configure_db(db_url) first.")
    with Session(_engine) as s:
        yield s

def get_engine():
    if _engine is None:
        raise RuntimeError("DB not configured")
    return _engine
