import argparse
import logging

from app.logging_config import setup_logging
from app.settings import load_settings
from app.db import configure_db, init_db, get_engine
from sqlmodel import Session

from app.seed import load_seed_file, seed_from_json


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Backend management commands")
    sub = p.add_subparsers(dest="cmd", required=True)

    p.add_argument("--secrets", default="./secrets.json")
    p.add_argument("--db-url")
    p.add_argument("--log-level")

    seed = sub.add_parser("seed", help="Seed DB from JSON")
    seed.add_argument("--file", required=True, help="Path to seed JSON file")

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


if __name__ == "__main__":
    main()
