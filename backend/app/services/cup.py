from __future__ import annotations

from dataclasses import dataclass
import datetime as dt
from typing import Optional

from sqlmodel import Session, select

from ..models import Match, Player, Tournament
from app.stats_core import compute_player_standings, unique_winner_player_id


@dataclass(frozen=True)
class CupTransfer:
    tournament_id: int
    tournament_name: str
    date: str
    from_player_id: int
    from_player_name: str
    to_player_id: int
    to_player_name: str
    streak_duration: int


@dataclass(frozen=True)
class CupResult:
    owner_id: int | None
    owner_name: str | None
    streak_tournaments_participated: int
    streak_since_tournament_id: Optional[int]
    streak_since_tournament_name: Optional[str]
    streak_since_date: Optional[str]
    history: list[CupTransfer]


def _load_player(session: Session, player_id: int) -> Player:
    p = session.get(Player, player_id)
    if not p:
        raise ValueError(f"Player id={player_id} not found")
    return p


def compute_cup(session: Session, *, since_date: dt.date | None = None) -> CupResult:
    """
    Cup owner changes ONLY by TOURNAMENT WINNER (player standings).

    Iterate tournaments by date, consider only completed tournaments (status == "done"):
      - if current owner did NOT participate => no change
      - if tournament winner is tied => no change
      - if unique winner != current owner => transfer to winner

    Streak duration:
      - counts number of completed tournaments (status==done) the *current owner participated in*
        since they last took/won the cup (including that winning tournament).
    """
    owner = None
    history: list[CupTransfer] = []

    # streak state (for the CURRENT owner segment)
    streak_count = 0
    streak_since_tid: Optional[int] = None
    streak_since_tname: Optional[str] = None
    streak_since_date: Optional[str] = None

    q = select(Tournament)
    if since_date is not None:
        q = q.where(Tournament.date >= since_date)
    tournaments = session.exec(q.order_by(Tournament.date, Tournament.created_at, Tournament.id)).all()

    for t in tournaments:
        if t.status != "done":
            continue

        # tournament participants (force-load relationship)
        participants = list(t.players)
        participant_ids = {p.id for p in participants}

        # owner not in this tournament => no change
        if owner is not None and owner.id not in participant_ids:
            continue

        # load matches + relationships
        matches = session.exec(select(Match).where(Match.tournament_id == t.id)).all()
        for m in matches:
            _ = m.sides
            for side in m.sides:
                _ = side.players

        rows = compute_player_standings(matches, participants)
        winner_id = unique_winner_player_id(rows)
        # If standings are tied at the top, allow an explicit tournament decider to pick a winner.
        if winner_id is None:
            if getattr(t, "decider_type", "none") != "none" and getattr(t, "decider_winner_player_id", None):
                winner_id = int(t.decider_winner_player_id)
        if winner_id not in participant_ids:
            # invalid decider data -> treat as draw
            winner_id = None

        # draw / no unique winner
        if winner_id is None:
            # If the cup has no owner yet (e.g. new cup starting at since_date), draws do nothing.
            if owner is None:
                continue
            # Cup stays, streak increments (owner participated).
            streak_count += 1
            if streak_since_tid is None:
                streak_since_tid = t.id
                streak_since_tname = t.name
                streak_since_date = str(t.date)
            continue

        # unique winner exists, but cup has no owner yet => initial acquire
        if owner is None:
            new_owner = _load_player(session, winner_id)
            history.append(
                CupTransfer(
                    tournament_id=t.id,
                    tournament_name=t.name,
                    date=str(t.date),
                    from_player_id=0,
                    from_player_name="—",
                    to_player_id=new_owner.id,
                    to_player_name=new_owner.display_name,
                    streak_duration=0,
                )
            )
            owner = new_owner
            streak_count = 1
            streak_since_tid = t.id
            streak_since_tname = t.name
            streak_since_date = str(t.date)
            continue

        # unique winner exists
        if winner_id == owner.id:
            # owner won => cup stays, streak increments
            streak_count += 1
            if streak_since_tid is None:
                streak_since_tid = t.id
                streak_since_tname = t.name
                streak_since_date = str(t.date)
            continue

        # owner participated and did NOT win => transfer to winner
        new_owner = _load_player(session, winner_id)

        history.append(
            CupTransfer(
                tournament_id=t.id,
                tournament_name=t.name,
                date=str(t.date),
                from_player_id=owner.id,
                from_player_name=owner.display_name,
                to_player_id=new_owner.id,
                to_player_name=new_owner.display_name,
                streak_duration=streak_count,
            )
        )

        # start new owner streak at 1 (they participated and won this tournament)
        owner = new_owner
        streak_count = 1
        streak_since_tid = t.id
        streak_since_tname = t.name
        streak_since_date = str(t.date)

    return CupResult(
        owner_id=owner.id if owner is not None else None,
        owner_name=owner.display_name if owner is not None else None,
        streak_tournaments_participated=streak_count if owner is not None else 0,
        streak_since_tournament_id=streak_since_tid if owner is not None else None,
        streak_since_tournament_name=streak_since_tname if owner is not None else None,
        streak_since_date=streak_since_date if owner is not None else None,
        history=history,
    )
