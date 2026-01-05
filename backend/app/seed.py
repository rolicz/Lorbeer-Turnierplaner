from __future__ import annotations
import json
import logging
from pathlib import Path
from typing import Any, List, Optional

from sqlmodel import Session, select
from sqlalchemy import func

from .models import Player, Club, League, Match, MatchSide, Tournament
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



def insert_match(s: Session, data: dict[str, Any]) -> Match:
    """
    Insert one match into an existing tournament using the current schema:

      Match -> MatchSide(A/B) -> players (link table MatchSidePlayer)

    Expects:
      tournament_id: int
      teamA_members: list[str]   (player.display_name)
      teamB_members: list[str]
    Optional:
      leg: int (1 or 2)
      state: "scheduled"|"playing"|"finished"
      teamA_score/teamB_score: int
      teamA_club_id/teamB_club_id: int
      teamA_club/teamB_club: str  (Club.name; best-effort lookup, see below)
      game: str                   (only needed if you pass club names and names might collide across games)
    """
    tid = data.get("tournament_id")
    if tid is None:
        raise ValueError("Missing tournament_id")
    tid = int(tid)

    tournament = s.get(Tournament, tid)
    if tournament is None:
        raise ValueError(f"Unknown tournament_id: {tid}")

    teamA_members = data.get("teamA_members") or []
    teamB_members = data.get("teamB_members") or []
    if not (isinstance(teamA_members, list) and isinstance(teamB_members, list)):
        raise ValueError("teamA_members and teamB_members must be lists")

    if len(teamA_members) == 0 or len(teamB_members) == 0:
        raise ValueError("Each team must have at least 1 member")

    # Validate against tournament mode
    mode = tournament.mode
    if mode == "1v1":
        if len(teamA_members) != 1 or len(teamB_members) != 1:
            raise ValueError("Tournament mode is 1v1: need exactly 1 player per team")
    elif mode == "2v2":
        if len(teamA_members) != 2 or len(teamB_members) != 2:
            raise ValueError("Tournament mode is 2v2: need exactly 2 players per team")
    else:
        raise ValueError(f"Unknown tournament.mode: {mode}")

    def get_player(name: str) -> Player:
        p = s.exec(select(Player).where(Player.display_name == name)).first()
        if p is None or p.id is None:
            raise ValueError(f"Unknown player: {name}")
        return p

    a_players = [get_player(n) for n in teamA_members]
    b_players = [get_player(n) for n in teamB_members]

    # Optional: enforce that players are registered in the tournament
    tournament_player_ids = {p.id for p in tournament.players if p.id is not None}
    for p in a_players + b_players:
        if p.id not in tournament_player_ids:
            raise ValueError(f"Player '{p.display_name}' is not registered in tournament_id={tid}")

    def get_club_id_by_name(name: str, game: Optional[str]) -> int:
        q = select(Club).where(Club.name == name)
        if game:
            q = q.where(Club.game == game)
        clubs = s.exec(q).all()
        if not clubs:
            raise ValueError(f"Unknown club: {name}" + (f" (game={game})" if game else ""))
        if len(clubs) > 1:
            raise ValueError(f"Ambiguous club name '{name}'. Pass game or club_id.")
        if clubs[0].id is None:
            raise ValueError("Club has no id (unexpected)")
        return int(clubs[0].id)

    game = data.get("game")
    game = str(game) if game is not None else None

    # clubs can be passed as ids (preferred) or names
    a_club_id = data.get("teamA_club_id")
    b_club_id = data.get("teamB_club_id")

    if a_club_id is None and data.get("teamA_club"):
        a_club_id = get_club_id_by_name(str(data["teamA_club"]), game)
    if b_club_id is None and data.get("teamB_club"):
        b_club_id = get_club_id_by_name(str(data["teamB_club"]), game)

    a_club_id = int(a_club_id) if a_club_id is not None else None
    b_club_id = int(b_club_id) if b_club_id is not None else None

    # Determine order_index = append at end
    max_idx = s.exec(
        select(func.max(Match.order_index)).where(Match.tournament_id == tid)
    ).one()
    next_idx = int(max_idx or 0) + 1 if max_idx is not None else 0

    leg = int(data.get("leg") or 1)
    if leg not in (1, 2):
        raise ValueError("leg must be 1 or 2")

    state = data.get("state") or "scheduled"
    if state not in ("scheduled", "playing", "finished"):
        raise ValueError("state must be scheduled|playing|finished")

    a_goals = int(data.get("teamA_score") or 0)
    b_goals = int(data.get("teamB_score") or 0)

    # Create match + sides
    m = Match(
        tournament_id=tid,
        leg=leg,
        order_index=next_idx,
        state=state,
    )
    s.add(m)
    s.flush()  # get m.id

    sideA = MatchSide(match_id=int(m.id), side="A", club_id=a_club_id, goals=a_goals)
    sideB = MatchSide(match_id=int(m.id), side="B", club_id=b_club_id, goals=b_goals)

    # attach players via relationship (creates MatchSidePlayer rows)
    sideA.players = a_players
    sideB.players = b_players

    s.add(sideA)
    s.add(sideB)

    s.commit()
    s.refresh(m)
    _ = m.sides  # ensure sides are loaded if you return it

    return m
