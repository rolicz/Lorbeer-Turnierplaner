from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

# Exact `league.name` -> flag-icons country code (lowercase ISO 3166-1 alpha-2,
# plus GB subdivisions). Leagues without a nation (Rest of the World, the two
# National leagues) are intentionally absent — their clubs carry the flag.
LEAGUE_NATIONS: dict[str, str] = {
    "Premier League": "gb-eng",
    "La Liga": "es",
    "Bundesliga": "de",
    "Serie A": "it",
    "Ligue 1": "fr",
    "Süper Lig": "tr",
    "Österreichische Bundesliga": "at",
    "Liga Portugal": "pt",
    "Eredivisie": "nl",
    "Primera División": "ar",
    "Scottish Premiership": "gb-sct",
    "Belgian Pro League": "be",
    "MLS": "us",
    "Swiss Super League": "ch",
    "EFL League One": "gb-eng",
    "Danish Superliga": "dk",
    "Eliteserien": "no",
    "Ekstraklasa": "pl",
    "Allsvenskan": "se",
    "Serie B": "it",
    "League of Ireland Premier Division": "ie",
    "Saudi League": "sa",
    "K League": "kr",
    "Chinese Super League": "cn",
    "A-League": "au",
    "Liga 1 (Romania)": "ro",
    "EFL Championship": "gb-eng",
    "EFL League Two": "gb-eng",
    "2. Bundesliga": "de",
    "3. Bundesliga": "de",
    "Woman's Super League (England)": "gb-eng",
    "Liga F (Spain)": "es",
    "Frauen-Bundesliga (Germany)": "de",
    "Serie A Femminile (Italy)": "it",
    "Arkema Première Ligue (France)": "fr",
    # the trailing ")" is part of the league name in the DB — do not "fix" it
    "NWSL (North America))": "us",
    "Indian Super League": "in",
    "Ligue 2": "fr",
    "LaLiga 2": "es",
}


def backfill_league_nations(engine: Engine) -> int:
    """
    Fill `league.nation` for known league names where it is still NULL.

    Idempotent: rows with a nation already set (seed, manual correction or a
    previous run) are never touched. Returns the number of rows changed.
    """
    changed = 0
    with engine.begin() as conn:
        for name, nation in LEAGUE_NATIONS.items():
            res = conn.execute(
                text("UPDATE league SET nation = :nation WHERE name = :name AND nation IS NULL"),
                {"nation": nation, "name": name},
            )
            changed += res.rowcount or 0
    return changed
