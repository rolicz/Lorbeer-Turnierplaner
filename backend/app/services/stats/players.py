from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import Match, MatchSide, Player, Tournament
from ...services.cup import compute_cup
from ...stats_core import compute_overall_and_lastN, compute_player_standings, positions_from_standings


def _finished_matches_with_players(s: Session) -> list[Match]:
    stmt = (
        select(Match)
        .where(Match.state == "finished")
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
    )
    return list(s.exec(stmt).all())


def _tournament_matches_with_players(s: Session, tournament_id: int) -> list[Match]:
    stmt = (
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index, Match.id)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
    )
    return list(s.exec(stmt).all())


def compute_stats_players(s: Session, *, lastN: int) -> dict[str, Any]:
    # All players (for global sorting + showing even inactive ones)
    players = list(s.exec(select(Player).order_by(Player.display_name)).all())

    # Finished matches for overall + lastN
    finished_matches = _finished_matches_with_players(s)
    overall = compute_overall_and_lastN(finished_matches, players, lastN=lastN)

    # Done tournaments for per-tournament positions (load players relationship once)
    done_ts = list(
        s.exec(
            select(Tournament)
            .where(Tournament.status == "done")
            .order_by(Tournament.date, Tournament.id)
            .options(selectinload(Tournament.players))
        ).all()
    )

    tournaments_out: list[dict[str, Any]] = []
    # positions_by_tid[tid][player_id] = rank
    positions_by_tid: dict[int, dict[int, int]] = {}

    for t in done_ts:
        tid = int(t.id)
        matches = _tournament_matches_with_players(s, tid)

        participants = list(getattr(t, "players", None) or [])
        if not participants:
            seen: dict[int, Player] = {}
            for m in matches:
                for side in m.sides:
                    for p in side.players:
                        seen[int(p.id)] = p
            participants = list(seen.values())

        rows = compute_player_standings(matches, participants)
        pos_map = positions_from_standings(rows)
        positions_by_tid[tid] = pos_map

        tournaments_out.append(
            {
                "id": tid,
                "name": t.name,
                "date": t.date,
                "players_count": len(participants),
            }
        )

    # Legacy: current default cup owner (frontend uses /cup for multi-cup now)
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
        "lastN": lastN,
    }

