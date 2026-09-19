from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...cup_defs import get_cup_def
from ...models import FriendlyMatch, FriendlyMatchSide, Match, MatchSide, Player, Tournament
from ...services.cup import compute_all_cup_tournament_stakes_by_tournament, compute_cup
from .core import (
    compute_overall_and_lastN,
    compute_player_standings,
    positions_from_standings,
    resolve_tournament_winner_player_id,
)
from .scope import (
    StatsScope,
    friendlies_schema_ready,
    friendly_as_match_like,
    include_friendlies,
    include_tournaments,
    normalize_scope,
    safe_exec_all,
)


def finished_matches_with_players(s: Session, *, mode: str, scope: StatsScope) -> list[Any]:
    """Finished matches the Source filter asks for — the same two halves every other stats service loads.

    Public because it is *the* loader for "finished matches in this mode and source":
    `services/stats/records.py` reads the same rows rather than writing a second query,
    which is what keeps a record and the page that shows it from drifting apart (M1).
    """
    matches: list[Any] = []

    if include_tournaments(scope):
        stmt = select(Match).where(Match.state == "finished")
        if mode != "overall":
            stmt = stmt.join(Tournament).where(Tournament.mode == mode)

        stmt = stmt.options(
            selectinload(Match.tournament),
            selectinload(Match.sides).selectinload(MatchSide.players),
        )
        matches.extend(safe_exec_all(s, stmt))

    if include_friendlies(scope) and friendlies_schema_ready(s):
        fstmt = select(FriendlyMatch).where(FriendlyMatch.state == "finished")
        if mode != "overall":
            fstmt = fstmt.where(FriendlyMatch.mode == mode)

        fstmt = fstmt.options(
            selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players),
        )
        matches.extend(friendly_as_match_like(fm) for fm in safe_exec_all(s, fstmt))

    return matches


def _tournament_matches_with_players(s: Session, tournament_id: int) -> list[Match]:
    stmt = (
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index, Match.id)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
    )
    return list(s.exec(stmt).all())


def compute_stats_players(s: Session, *, mode: str, lastN: int, scope: str = "tournaments") -> dict[str, Any]:
    mode_norm = str(mode or "overall").strip().lower()
    if mode_norm not in ("overall", "1v1", "2v2"):
        mode_norm = "overall"
    scope_norm = normalize_scope(scope)

    # All players (for global sorting + showing even inactive ones)
    players = list(s.exec(select(Player).order_by(Player.display_name)).all())

    # Finished matches for overall + lastN — friendlies included when the scope says so.
    finished_matches = finished_matches_with_players(s, mode=mode_norm, scope=scope_norm)
    overall = compute_overall_and_lastN(finished_matches, players, lastN=lastN)

    # Per-tournament positions should include any tournament that already has
    # finished matches (including currently live tournaments), not only "done".
    # A position only exists inside a tournament, so friendlies never contribute
    # one: with scope="friendlies" this list is empty, and so are the per-player
    # position maps and the tournament titles built from them.
    finished_tournament_ids = sorted(
        {int(m.tournament_id) for m in finished_matches if getattr(m, "tournament_id", None) is not None}
    )
    if finished_tournament_ids:
        tournaments_stmt = (
            select(Tournament)
            .where(Tournament.id.in_(finished_tournament_ids))
            .order_by(Tournament.date, Tournament.id)
            .options(selectinload(Tournament.players))
        )
        if mode_norm != "overall":
            tournaments_stmt = tournaments_stmt.where(Tournament.mode == mode_norm)
        tournaments_with_finished = list(s.exec(tournaments_stmt).all())
    else:
        tournaments_with_finished = []

    cup_stakes_by_tid = compute_all_cup_tournament_stakes_by_tournament(s)
    tournaments_out: list[dict[str, Any]] = []
    # positions_by_tid[tid][player_id] = rank
    positions_by_tid: dict[int, dict[int, int]] = {}

    for t in tournaments_with_finished:
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

        participant_ids = {int(p.id) for p in participants}
        winner_player_id = resolve_tournament_winner_player_id(
            rows,
            decider_type=getattr(t, "decider_type", "none"),
            decider_winner_player_id=getattr(t, "decider_winner_player_id", None),
            participant_ids=participant_ids,
        )

        tournaments_out.append(
            {
                "id": tid,
                "name": t.name,
                "date": t.date,
                "mode": t.mode,
                "status": t.status,
                "players_count": len(participants),
                "cup_stakes": cup_stakes_by_tid.get(tid, []),
                # A tournament has a winner only once it is finished; live standings
                # leaders must not be reported as provisional title holders.
                "winner_player_id": winner_player_id if t.status == "done" else None,
            }
        )

    # Legacy: current default cup owner (frontend uses /cup for multi-cup now).
    # Must use the configured default cup def so era scoping matches GET /cup.
    cup_state = compute_cup(s, cup=get_cup_def("default"))
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
            "lastN_gf": [],
            "lastN_ga": [],
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
                "lastN_gf": list(o.get("lastN_gf") or []),
                "lastN_ga": list(o.get("lastN_ga") or []),
                "lastN_avg_pts": float(o.get("lastN_avg_pts") or 0.0),
                "positions_by_tournament": pos_by_tournament,
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "mode": mode_norm,
        "scope": scope_norm,
        "cup_owner_player_id": cup_owner_player_id,
        "tournaments": tournaments_out,
        "players": player_rows,
        "lastN": lastN,
    }
