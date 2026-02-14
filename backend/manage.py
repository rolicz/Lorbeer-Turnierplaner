import argparse
import logging
from pathlib import Path

from app.logging_config import setup_logging
from app.settings import load_settings
from app.db import configure_db, init_db, get_engine
from sqlmodel import Session

from app.seed import load_seed_file, seed_from_json, insert_match
from app.services.media_migration import migrate_blob_media_to_files


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Backend management commands")
    sub = p.add_subparsers(dest="cmd", required=True)

    p.add_argument("--secrets", default="./secrets.json")
    p.add_argument("--db-url")
    p.add_argument("--log-level")

    seed = sub.add_parser("seed", help="Seed DB from JSON")
    seed.add_argument("--file", required=True, help="Path to seed JSON file")

    add_match = sub.add_parser("add-match", help="Add a match from JSON file")
    add_match.add_argument("--file", required=True, help="Path to match JSON file")

    migrate_media = sub.add_parser("migrate-media", help="Move legacy image blobs to filesystem storage")
    migrate_media.add_argument("--dry-run", action="store_true", help="Compute and log migration counts only")

    vacuum_db = sub.add_parser("vacuum-db", help="Run SQLite VACUUM (optional ANALYZE)")
    vacuum_db.add_argument("--analyze", action="store_true", help="Run ANALYZE after VACUUM")

    return p.parse_args()


def main() -> None:
    args = parse_args()

    settings = load_settings(
        secrets_path=args.secrets,
        db_url=args.db_url,
        log_level=args.log_level,
    )
    setup_logging(settings.log_level)

    configure_db(settings.db_url)
    init_db()

    log = logging.getLogger(__name__)

    if args.cmd == "seed":
        data = load_seed_file(args.file)
        from app.db import get_session

        # get_session() yields a Session; easiest is to open one directly:
        # (we keep it explicit and simple)
        with Session(get_engine()) as s:
            res = seed_from_json(s, data)
        log.info("Seed complete: %s", res)

    if args.cmd == "add-match":
        data = load_seed_file(args.file)
        from app.db import get_session
        with Session(get_engine()) as s:
            res = insert_match(s, data)
        log.info("Add match complete: %s", res)

    if args.cmd == "migrate-media":
        with Session(get_engine()) as s:
            res = migrate_blob_media_to_files(s, dry_run=bool(args.dry_run))
            if args.dry_run:
                s.rollback()
            else:
                s.commit()
        log.info("Media migration complete: %s", res.as_dict())

    if args.cmd == "vacuum-db":
        engine = get_engine()
        url = str(engine.url)
        if not url.startswith("sqlite"):
            raise RuntimeError("vacuum-db is only supported for SQLite databases")

        db_path = getattr(engine.url, "database", None)
        before_size = None
        after_size = None
        if db_path and db_path not in (":memory:", ""):
            p = Path(db_path)
            if p.exists() and p.is_file():
                before_size = p.stat().st_size

        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.exec_driver_sql("VACUUM")
            if args.analyze:
                conn.exec_driver_sql("ANALYZE")

        if db_path and db_path not in (":memory:", ""):
            p = Path(db_path)
            if p.exists() and p.is_file():
                after_size = p.stat().st_size

        if before_size is not None and after_size is not None:
            log.info("VACUUM complete: %s bytes -> %s bytes", before_size, after_size)
        else:
            log.info("VACUUM complete")
        if args.analyze:
            log.info("ANALYZE complete")


if __name__ == "__main__":
    main()
