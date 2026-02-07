# backend/app/routers/stats.py
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..db import get_session
from ..models import Match, Player, Tournament
from ..services.cup import compute_cup  # see note below
from ..stats_core import compute_overall_and_lastN, compute_player_standings, positions_from_standings

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/players")
def stats_players(
    lastN: int = Query(10, ge=0, le=100, description="How many recent matches to average (0 disables)"),
    s: Session = Depends(get_session)) -> dict[str, Any]:
    # All players (for global sorting + showing even inactive ones)
    players = s.exec(select(Player).order_by(Player.display_name)).all()

    # Finished matches for overall + lastN
    finished_matches = s.exec(select(Match).where(Match.state == "finished")).all()
    for m in finished_matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    overall = compute_overall_and_lastN(finished_matches, players, lastN=lastN)

    # Done tournaments for per-tournament positions
    done_ts = s.exec(
        select(Tournament).where(Tournament.status == "done").order_by(Tournament.date, Tournament.id)
    ).all()

    tournaments_out: list[dict[str, Any]] = []
    # positions_by_tid[tid][player_id] = rank
    positions_by_tid: dict[int, dict[int, int]] = {}

    for t in done_ts:
        matches = s.exec(
            select(Match).where(Match.tournament_id == t.id).order_by(Match.order_index, Match.id)
        ).all()
        for m in matches:
            _ = m.sides
            for side in m.sides:
                _ = side.players

        # participants: tournament.players if you have it, else infer from matches
        # (your TournamentDetail already has players, so likely you have Tournament.players relationship)
        participants = getattr(t, "players", None) or []
        if not participants:
            seen: dict[int, Player] = {}
            for m in matches:
                for side in m.sides:
                    for p in side.players:
                        seen[int(p.id)] = p
            participants = list(seen.values())

        rows = compute_player_standings(matches, participants)
        pos_map = positions_from_standings(rows)
        positions_by_tid[int(t.id)] = pos_map

        tournaments_out.append(
            {
                "id": int(t.id),
                "name": t.name,
                "date": t.date,
                "players_count": len(participants),
            }
        )

    # Current cup owner (for wreath overlay in frontend)
    cup_state = compute_cup(s)
    cup_owner_player_id = int(cup_state.owner_id) if cup_state and cup_state.owner_id is not None else None

    # Build per-player rows
    player_rows: list[dict[str, Any]] = []
    for p in players:
        pid = int(p.id)
        o = overall.get(pid) or {
            "player_id": pid,
            "name": p.display_name,
            "played": 0,
            "wins": 0,
            "draws": 0,
            "losses": 0,
            "gf": 0,
            "ga": 0,
            "gd": 0,
            "pts": 0,
            "lastN_pts": [],
            "lastN_avg_pts": 0.0,
        }

        # map tournament_id -> position (or null if not participated)
        pos_by_tournament: dict[int, int | None] = {}
        for tt in tournaments_out:
            tid = int(tt["id"])
            pos_by_tournament[tid] = positions_by_tid.get(tid, {}).get(pid)

        player_rows.append(
            {
                "player_id": pid,
                "display_name": p.display_name,
                "played": int(o["played"]),
                "wins": int(o["wins"]),
                "draws": int(o["draws"]),
                "losses": int(o["losses"]),
                "gf": int(o["gf"]),
                "ga": int(o["ga"]),
                "gd": int(o["gd"]),
                "pts": int(o["pts"]),
                "lastN_pts": list(o.get("lastN_pts") or []),
                "lastN_avg_pts": float(o.get("lastN_avg_pts") or 0.0),
                "positions_by_tournament": pos_by_tournament,
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "cup_owner_player_id": cup_owner_player_id,
        "tournaments": tournaments_out,
        "players": player_rows,
        "lastN" : lastN,
    }
