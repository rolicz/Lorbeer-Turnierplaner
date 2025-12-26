import json
import logging
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from .models import Player, Club
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
            # nothing to update currently (keep for future fields)
            updated += 1
            continue

        s.add(Player(display_name=name))
        created += 1

    s.commit()
    return {"created": created, "updated": updated}


def upsert_clubs(s: Session, clubs: list[dict[str, Any]]) -> dict[str, int]:
    created = 0
    updated = 0

    for item in clubs:
        name = (item.get("name") or "").strip()
        game = (item.get("game") or "").strip()
        stars = item.get("star_rating", 3.0)

        if not name or not game:
            raise ValueError("Club name/game missing/empty")

        stars = validate_star_rating(stars)

        existing = s.exec(select(Club).where(Club.name == name, Club.game == game)).first()
        if existing:
            # update rating if changed
            if float(existing.star_rating) != float(stars):
                existing.star_rating = float(stars)
                s.add(existing)
            updated += 1
            continue

        s.add(Club(name=name, game=game, star_rating=float(stars)))
        created += 1

    s.commit()
    return {"created": created, "updated": updated}


def seed_from_json(s: Session, data: dict[str, Any]) -> dict[str, Any]:
    """
    Idempotent: safe to run multiple times.
    """
    out: dict[str, Any] = {"players": None, "clubs": None}

    players = data.get("players") or []
    clubs = data.get("clubs") or []

    if not isinstance(players, list) or not isinstance(clubs, list):
        raise ValueError("'players' and 'clubs' must be lists")

    if players:
        out["players"] = upsert_players(s, players)
        log.info("Seeded players: %s", out["players"])

    if clubs:
        out["clubs"] = upsert_clubs(s, clubs)
        log.info("Seeded clubs: %s", out["clubs"])

    return out
