import json
import logging
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app.db import get_engine, init_db
from app.league_nations import LEAGUE_NATIONS, backfill_league_nations
from app.main import create_app
from app.settings import PlayerAccount, Settings
from tests.conftest import create_club, create_league


def _legacy_settings(db_path) -> Settings:
    return Settings(
        db_url=f"sqlite:///{db_path}",
        player_accounts=(PlayerAccount(name="Admin", password="admin-secret", admin=True),),
        log_level="DEBUG",
        password_hash_profile="test",
        app_env="test",
    )


def _create_legacy_db(db_path) -> None:
    """A `league` table as it exists in deployed DBs today: no `nation` column."""
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE league (id INTEGER NOT NULL PRIMARY KEY, name VARCHAR NOT NULL)"))
        conn.execute(text("CREATE UNIQUE INDEX ix_league_name ON league (name)"))
        conn.execute(text("INSERT INTO league (name) VALUES ('Bundesliga'), ('Premier League'), ('Rest of the World')"))
    engine.dispose()


def _nations(engine) -> dict[str, str | None]:
    with engine.begin() as conn:
        return {row[0]: row[1] for row in conn.execute(text("SELECT name, nation FROM league")).all()}


class _RecordingHandler(logging.Handler):
    """create_app() calls basicConfig(force=True), which drops pytest's caplog handler."""

    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


def test_init_db_adds_nation_column_and_backfills_legacy_db(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    _create_legacy_db(db_path)

    create_app(_legacy_settings(db_path))  # configures the DB

    handler = _RecordingHandler()
    db_log = logging.getLogger("app.db")
    db_log.addHandler(handler)
    try:
        init_db()
    finally:
        db_log.removeHandler(handler)

    engine = get_engine()
    assert "nation" in {c["name"] for c in inspect(engine).get_columns("league")}

    rows = _nations(engine)
    assert rows["Bundesliga"] == "de"
    assert rows["Premier League"] == "gb-eng"
    # not in the map -> stays NULL (no flag)
    assert rows["Rest of the World"] is None
    assert "League nations backfilled: 2" in handler.messages


def test_backfill_is_idempotent_and_keeps_manual_values(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    _create_legacy_db(db_path)

    create_app(_legacy_settings(db_path))
    init_db()
    engine = get_engine()

    # manual correction must survive further runs
    with engine.begin() as conn:
        conn.execute(text("UPDATE league SET nation = 'xx' WHERE name = 'Bundesliga'"))

    assert backfill_league_nations(engine) == 0

    handler = _RecordingHandler()
    db_log = logging.getLogger("app.db")
    db_log.addHandler(handler)
    try:
        init_db()
    finally:
        db_log.removeHandler(handler)
    assert not [m for m in handler.messages if "League nations backfilled" in m]

    rows = _nations(engine)
    assert rows["Bundesliga"] == "xx"
    assert rows["Premier League"] == "gb-eng"
    assert rows["Rest of the World"] is None


def test_leagues_and_clubs_endpoints_expose_nation(client, editor_headers, admin_headers):
    r = client.post("/clubs/leagues", json={"name": "Bundesliga", "nation": "de"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    league_id = r.json()["id"]
    plain_id = create_league(client, admin_headers, "Rest of the World")
    create_club(client, editor_headers, "FC Test", "EA FC 26", 4.5, league_id)

    leagues = {lg["name"]: lg for lg in client.get("/clubs/leagues").json()}
    assert leagues["Bundesliga"]["nation"] == "de"
    assert leagues["Rest of the World"]["nation"] is None
    assert leagues["Rest of the World"]["id"] == plain_id

    clubs = client.get("/clubs").json()
    club = next(c for c in clubs if c["name"] == "FC Test")
    assert club["league_name"] == "Bundesliga"
    assert club["league_nation"] == "de"


def test_create_league_accepts_and_validates_nation(client, admin_headers):
    r = client.post("/clubs/leagues", json={"name": "Testliga", "nation": "gb-eng"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["nation"] == "gb-eng"

    r2 = client.post("/clubs/leagues", json={"name": "Fantasialiga"}, headers=admin_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["nation"] is None

    for bad in ("Germany", "DEU", "d", "de-", "de-toolong"):
        rb = client.post("/clubs/leagues", json={"name": f"Bad {bad}", "nation": bad}, headers=admin_headers)
        assert rb.status_code == 400, f"{bad}: {rb.text}"


def test_league_nations_map_covers_seed_leagues():
    data = json.loads((Path(__file__).resolve().parents[1] / "data" / "seed-leagues.json").read_text(encoding="utf-8"))
    seeded = {lg["name"]: lg.get("nation") for lg in data["leagues"]}
    assert set(LEAGUE_NATIONS) <= set(seeded)
    for name, nation in LEAGUE_NATIONS.items():
        assert seeded[name] == nation, name
