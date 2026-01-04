import json
import logging
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from .models import Player, Club, League
from .validation import validate_star_rating

log = logging.getLogger(__name__)


def load_seed_file(path: str) -> dict[str, Any]:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(path)
    return json.loads(p.read_text(encoding="utf-8"))


def upsert_players(s: Session, players: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0

    for item in players:
        name = (item.get("display_name") or "").strip()
        if not name:
            raise ValueError("Player display_name missing/empty")

        existing = s.exec(select(Player).where(Player.display_name == name)).first()
        if existing:
            updated += 1
            continue

        s.add(Player(display_name=name))
        created += 1

    s.commit()
    return {"created": created, "updated": updated}


def upsert_leagues(s: Session, leagues: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0

    for item in leagues:
        name = (item.get("name") or "").strip()
        if not name:
            raise ValueError("League name missing/empty")

        existing = s.exec(select(League).where(League.name == name)).first()
        if existing:
            updated += 1
            continue

        s.add(League(name=name))
        created += 1

    s.commit()
    return {"created": created, "updated": updated}


def _league_name_to_id(s: Session) -> dict[str, int]:
    out: dict[str, int] = {}
    for lg in s.exec(select(League)).all():
        if lg.id is not None:
            out[lg.name] = int(lg.id)
    return out


def upsert_clubs(s: Session, clubs: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0

    name_to_id = _league_name_to_id(s)

    for item in clubs:
        name = (item.get("name") or "").strip()
        game = (item.get("game") or "").strip()
        stars = item.get("star_rating", 3.0)

        if not name or not game:
            print(name, game)
            raise ValueError("Club name/game missing/empty")

        stars = validate_star_rating(stars)

        # league reference is OPTIONAL
        league_id = None
        if "league_id" in item:
            v = item.get("league_id")
            if v is None or v == "":
                league_id = None
            else:
                league_id = int(v)
                if s.get(League, league_id) is None:
                    raise ValueError(f"Unknown league_id {league_id} for club {name} ({game})")
        elif "league" in item:
            league_name = (item.get("league") or "").strip()
            if league_name:
                if league_name not in name_to_id:
                    raise ValueError(f"Unknown league '{league_name}' for club {name} ({game})")
                league_id = name_to_id[league_name]

        existing = s.exec(select(Club).where(Club.name == name, Club.game == game)).first()
        if existing:
            changed = False
            if float(existing.star_rating) != float(stars):
                existing.star_rating = float(stars)
                changed = True
            # allow updating league assignment via seed
            if getattr(existing, "league_id", None) != league_id:
                existing.league_id = league_id
                changed = True
            if changed:
                s.add(existing)
            updated += 1
            continue

        s.add(Club(name=name, game=game, star_rating=float(stars), league_id=league_id))
        created += 1

    s.commit()
    return {"created": created, "updated": updated}


def seed_from_json(s: Session, data: dict[str, Any]) -> dict[str, Any]:
    """
    Idempotent: safe to run multiple times.
    """
    out: dict[str, Any] = {"players": None, "leagues": None, "clubs": None}

    players = data.get("players") or []
    leagues = data.get("leagues") or []
    clubs = data.get("clubs") or []

    if not isinstance(players, list) or not isinstance(leagues, list) or not isinstance(clubs, list):
        raise ValueError("'players', 'leagues', and 'clubs' must be lists")

    if players:
        out["players"] = upsert_players(s, players)
        log.info("Seeded players: %s", out["players"])

    if leagues:
        out["leagues"] = upsert_leagues(s, leagues)
        log.info("Seeded leagues: %s", out["leagues"])

    if clubs:
        out["clubs"] = upsert_clubs(s, clubs)
        log.info("Seeded clubs: %s", out["clubs"])

    return out

