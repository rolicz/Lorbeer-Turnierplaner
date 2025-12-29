import json
import logging
import random
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, delete, select

from ..auth import require_admin
from ..db import get_session
from ..models import Match, MatchSide, MatchSidePlayer, Player, Tournament, TournamentPlayer
from ..scheduling import assign_labels, schedule_1v1_labels, schedule_2v2_labels
from ..stats import compute_stats
from ..ws import ws_manager
from ..auth import require_admin, require_editor

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tournaments", tags=["tournaments"])


def _tournament_or_404(s: Session, tournament_id: int) -> Tournament:
    t = s.exec(select(Tournament).where(Tournament.id == tournament_id)).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


def _serialize_tournament(s: Session, t: Tournament) -> dict:
    matches = s.exec(select(Match).where(Match.tournament_id == t.id).order_by(Match.order_index)).all()

    # force-load relationships under the session
    _ = t.players
    for m in matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    def player_dict(p: Player) -> dict:
        return {"id": p.id, "display_name": p.display_name}

    def match_dict(m: Match) -> dict:
        sides = []
        for side in sorted(m.sides, key=lambda x: x.side):
            sides.append({
                "id": side.id,
                "side": side.side,
                "club_id": side.club_id,
                "goals": side.goals,
                "players": [player_dict(p) for p in side.players],
            })
        return {
            "id": m.id,
            "leg": m.leg,
            "order_index": m.order_index,
            "state": m.state,
            "started_at": m.started_at,
            "finished_at": m.finished_at,
            "sides": sides,
        }

    return {
        "id": t.id,
        "name": t.name,
        "mode": t.mode,
        "status": t.status,
        "settings_json": t.settings_json,
        "date": t.date,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "players": [player_dict(p) for p in t.players],
        "matches": [match_dict(m) for m in matches],
        "decider_type": t.decider_type,
        "decider_winner_player_id": t.decider_winner_player_id,
        "decider_loser_player_id": t.decider_loser_player_id,
        "decider_winner_goals": t.decider_winner_goals,
        "decider_loser_goals": t.decider_loser_goals,
    }



def _max_order_index(s: Session, tournament_id: int) -> int:
    row = s.exec(
        select(Match.order_index)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index.desc())
    ).first()
    return int(row) if row is not None else -1


def _leg2_started(s: Session, tournament_id: int) -> bool:
    leg2 = s.exec(
        select(Match).where(Match.tournament_id == tournament_id, Match.leg == 2)
    ).all()
    for m in leg2:
        if m.state != "scheduled":
            return True
        # if you store goals on sides:
        for side in m.sides:
            if (side.goals or 0) != 0 or side.club_id is not None:
                return True
    return False

def _bulk_delete_matches(
    s: Session,
    tournament_id: int,
    leg: int | None = None,
) -> int:
    """
    Deletes matches (and their sides + side-player link rows) for a tournament.
    Uses bulk DELETE statements only -> avoids StaleDataError from double deletes/cascades.
    Returns number of deleted matches.
    """
    q = select(Match.id).where(Match.tournament_id == tournament_id)
    if leg is not None:
        q = q.where(Match.leg == leg)

    match_ids = s.exec(q).all()
    if not match_ids:
        return 0

    side_ids = s.exec(
        select(MatchSide.id).where(MatchSide.match_id.in_(match_ids))
    ).all()

    if side_ids:
        s.exec(
            delete(MatchSidePlayer)
            .where(MatchSidePlayer.match_side_id.in_(side_ids))
            .execution_options(synchronize_session=False)
        )
        s.exec(
            delete(MatchSide)
            .where(MatchSide.id.in_(side_ids))
            .execution_options(synchronize_session=False)
        )

    s.exec(
        delete(Match)
        .where(Match.id.in_(match_ids))
        .execution_options(synchronize_session=False)
    )

    s.commit()
    # important when you've previously loaded these objects in this same Session
    s.expire_all()
    return len(match_ids)


def _delete_schedule(s: Session, tournament_id: int) -> None:
    _bulk_delete_matches(s, tournament_id, leg=None)


def _delete_matches_by_leg(s: Session, tournament_id: int, leg: int) -> None:
    _bulk_delete_matches(s, tournament_id, leg=leg)



def _create_match_with_teams(
    s: Session,
    tournament_id: int,
    order_index: int,
    leg: int,
    team_a_player_ids: list[int],
    team_b_player_ids: list[int],
) -> Match:
    m = Match(
        tournament_id=tournament_id,
        leg=leg,
        order_index=order_index,
        state="scheduled",
    )
    s.add(m)
    s.commit()
    s.refresh(m)

    for side_label, pids in (("A", team_a_player_ids), ("B", team_b_player_ids)):
        side = MatchSide(match_id=m.id, side=side_label, goals=0, club_id=None)
        s.add(side)
        s.commit()
        s.refresh(side)

        for pid in pids:
            s.add(MatchSidePlayer(match_side_id=side.id, player_id=pid))

    s.commit()
    return m

def _side_player_ids(side) -> tuple[int, ...]:
    # Sort for stable comparison: (p1,p2) == (p2,p1)
    return tuple(sorted(p.id for p in side.players))


def _match_signature_from_loaded_match(m: Match) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """
    Signature = (teamA_ids, teamB_ids) with teams as sorted player-id tuples.
    Side orientation matters (A vs B), because you said: keep order, no mirroring.
    """
    sides = {s.side: s for s in m.sides}
    if "A" not in sides or "B" not in sides:
        return ((), ())
    return (_side_player_ids(sides["A"]), _side_player_ids(sides["B"]))

def _parse_yyyy_mm_dd(value: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date (expected YYYY-MM-DD)")


@router.get("")
def list_tournaments(s: Session = Depends(get_session)):
    return s.exec(select(Tournament).order_by(Tournament.created_at.desc())).all()


@router.get("/{tournament_id}")
def get_tournament(tournament_id: int, s: Session = Depends(get_session)):
    t = _tournament_or_404(s, tournament_id)
    return _serialize_tournament(s, t)


@router.post("", dependencies=[Depends(require_editor)])
def create_tournament(body: dict, s: Session = Depends(get_session)):
    name = (body.get("name") or "").strip()
    mode = body.get("mode")
    settings = body.get("settings", {})
    player_ids = body.get("player_ids", [])
    date_str = (body.get("date") or "").strip()
    t_date = _parse_yyyy_mm_dd(date_str) if date_str else date.today()

    if not name:
        raise HTTPException(status_code=400, detail="Missing name")
    if mode not in ("1v1", "2v2"):
        raise HTTPException(status_code=400, detail="mode must be '1v1' or '2v2'")

    t = Tournament(name=name, mode=mode, status="draft", settings_json=json.dumps(settings), date=t_date)
    s.add(t)
    s.commit()
    s.refresh(t)
    # editor creates tournament with *existing* players (admin can also do this)
    if player_ids:
        if not isinstance(player_ids, list):
            raise HTTPException(status_code=400, detail="player_ids must be a list")

        existing = s.exec(select(Player).where(Player.id.in_(player_ids))).all()
        found_ids = {p.id for p in existing}
        if set(player_ids) != found_ids:
            raise HTTPException(status_code=400, detail="One or more player_ids do not exist")

        for pid in player_ids:
            s.add(TournamentPlayer(tournament_id=t.id, player_id=pid))
        s.commit()
    log.info("Created tournament '%s' (id=%s, mode=%s)", t.name, t.id, t.mode)
    return t


@router.patch("/{tournament_id}", dependencies=[Depends(require_editor)])
async def patch_tournament(
    tournament_id: int, 
    body: dict, 
    s: Session = Depends(get_session),
    role: str = Depends(require_editor)):
    t = _tournament_or_404(s, tournament_id)
    if t.status == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to regenerate)")

    if "name" in body:
        t.name = str(body["name"]).strip()
    if "status" in body:
        if body["status"] not in ("draft", "live", "done"):
            raise HTTPException(status_code=400, detail="Invalid status")
        t.status = body["status"]
    if "settings" in body:
        t.settings_json = json.dumps(body["settings"])

    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()
    s.refresh(t)

    await ws_manager.broadcast(tournament_id, "tournament_updated", {"tournament_id": tournament_id})
    return t

@router.patch("/{tournament_id}/date", dependencies=[Depends(require_admin)])
async def patch_date(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    """
    body: { "date": "YYYY-MM-DD" }

    Admin only:
      - can set date anytime (for backfilling past tournaments)
    """
    t = _tournament_or_404(s, tournament_id)

    date_str = (body.get("date") or "").strip()
    if not date_str:
        raise HTTPException(status_code=400, detail="Missing date")

    t.date = _parse_yyyy_mm_dd(date_str)
    t.updated_at = datetime.utcnow()

    s.add(t)
    s.commit()
    s.refresh(t)

    await ws_manager.broadcast(tournament_id, "tournament_updated", {"tournament_id": tournament_id})
    log.info("Tournament date changed: tournament_id=%s date=%s by=%s", tournament_id, t.date, role)
    return {"ok": True, "date": t.date}

@router.patch("/{tournament_id}/name", dependencies=[Depends(require_admin)])
async def patch_name(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    """
    body: { "name": "..." }

    Admin only:
      - rename tournament anytime
    """
    t = _tournament_or_404(s, tournament_id)

    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing name")

    t.name = name
    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()
    s.refresh(t)

    await ws_manager.broadcast(tournament_id, "tournament_updated", {"tournament_id": tournament_id})
    log.info("Tournament renamed: tournament_id=%s name=%s by=%s", tournament_id, t.name, role)

    return {"ok": True, "name": t.name}

@router.post("/{tournament_id}/players", dependencies=[Depends(require_admin)])
async def add_player(tournament_id: int, body: dict, s: Session = Depends(get_session)):
    t = _tournament_or_404(s, tournament_id)

    name = (body.get("display_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Missing display_name")

    p = s.exec(select(Player).where(Player.display_name == name)).first()
    if not p:
        p = Player(display_name=name)
        s.add(p)
        s.commit()
        s.refresh(p)

    exists = s.exec(select(TournamentPlayer).where(
        TournamentPlayer.tournament_id == tournament_id,
        TournamentPlayer.player_id == p.id
    )).first()
    if not exists:
        s.add(TournamentPlayer(tournament_id=tournament_id, player_id=p.id))
        s.commit()

    await ws_manager.broadcast(tournament_id, "players_updated", {"tournament_id": tournament_id})
    return {"player": {"id": p.id, "display_name": p.display_name}}


@router.delete("/{tournament_id}/players/{player_id}", dependencies=[Depends(require_admin)])
async def remove_player(tournament_id: int, player_id: int, s: Session = Depends(get_session)):
    _tournament_or_404(s, tournament_id)

    s.exec(delete(TournamentPlayer).where(
        TournamentPlayer.tournament_id == tournament_id,
        TournamentPlayer.player_id == player_id
    ))
    s.commit()

    await ws_manager.broadcast(tournament_id, "players_updated", {"tournament_id": tournament_id})
    return {"ok": True}


@router.post("/{tournament_id}/generate", dependencies=[Depends(require_editor)])
async def generate_schedule(
    tournament_id: int, 
    body: dict, 
    s: Session = Depends(get_session),
    role: str = Depends(require_editor)):
    """
    body:
      {
        "randomize": true   # randomize player->label mapping + match order
      }
    """
    t = _tournament_or_404(s, tournament_id)
    if t.status == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to regenerate)")

    randomize = bool(body.get("randomize", True))

    player_names = [p.display_name for p in t.players]

    # Enforce your requested ranges (adjust if you later want 2-player 1v1)
    if t.mode == "1v1" and not (3 <= len(player_names) <= 5):
        raise HTTPException(status_code=400, detail="1v1 supports 3–5 players (adjustable)")
    if t.mode == "2v2" and not (4 <= len(player_names) <= 6):
        raise HTTPException(status_code=400, detail="2v2 supports 4–6 players (adjustable)")

    # 1) Assign A,B,C,... to actual people (shuffled by default)
    labels, label_to_name = assign_labels(player_names, shuffle=randomize)

    # Store label mapping into settings_json (merge with existing settings)
    try:
        settings = json.loads(t.settings_json or "{}")
        if not isinstance(settings, dict):
            settings = {}
    except Exception:
        settings = {}
    settings["labels"] = label_to_name
    t.settings_json = json.dumps(settings)
    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()

    # 2) Generate matches in label space
    if t.mode == "1v1":
        label_matches = schedule_1v1_labels(labels)  # [ (("A",),("B",)), ... ]
    else:
        try:
            label_matches = schedule_2v2_labels(labels)  # [ (("A","B"),("C","D")), ... ]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # 3) Optionally randomize match order
    if randomize:
        random.shuffle(label_matches)

    # 4) Wipe old schedule and insert new matches
    _delete_schedule(s, tournament_id)

    # name -> Player (db object)
    db_players = {p.display_name: p for p in t.players}

    def label_team_to_player_ids(team: tuple[str, ...]) -> list[int]:
        # team is ("A",) or ("A","B")
        return [db_players[label_to_name[l]].id for l in team]

    for idx, (team_a, team_b) in enumerate(label_matches):
        m = Match(tournament_id=tournament_id, order_index=idx, state="scheduled")
        s.add(m)
        s.commit()
        s.refresh(m)

        for side_label, team in (("A", team_a), ("B", team_b)):
            side = MatchSide(match_id=m.id, side=side_label, goals=0, club_id=None)
            s.add(side)
            s.commit()
            s.refresh(side)

            for pid in label_team_to_player_ids(team):
                s.add(MatchSidePlayer(match_side_id=side.id, player_id=pid))

        s.commit()

    await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
    log.info("Generated schedule: tournament_id=%s matches=%s mode=%s players=%s",
             tournament_id, len(label_matches), t.mode, len(player_names))
    return {"ok": True, "matches": len(label_matches), "labels": label_to_name}



@router.patch("/{tournament_id}/reorder", dependencies=[Depends(require_editor)])
async def reorder(tournament_id: int, body: dict, s: Session = Depends(get_session), role: str = Depends(require_editor)):
    t = _tournament_or_404(s, tournament_id)
    if t.status == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to regenerate)")
    match_ids = body.get("match_ids")
    if not isinstance(match_ids, list) or not match_ids:
        raise HTTPException(status_code=400, detail="match_ids must be a non-empty list")

    matches = s.exec(select(Match).where(Match.tournament_id == tournament_id)).all()
    by_id = {m.id: m for m in matches}

    if set(match_ids) != set(by_id.keys()):
        raise HTTPException(status_code=400, detail="match_ids must include exactly all tournament match ids")

    for idx, mid in enumerate(match_ids):
        by_id[mid].order_index = idx
        s.add(by_id[mid])

    s.commit()
    await ws_manager.broadcast(tournament_id, "matches_reordered", {"tournament_id": tournament_id})
    return {"ok": True}


@router.get("/{tournament_id}/stats")
def stats(tournament_id: int, s: Session = Depends(get_session)):
    _tournament_or_404(s, tournament_id)

    matches = s.exec(select(Match).where(Match.tournament_id == tournament_id).order_by(Match.order_index)).all()
    # ensure sides+players are loaded
    for m in matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    return compute_stats(matches)

@router.patch("/{tournament_id}/status", dependencies=[Depends(require_editor)])
async def patch_status(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    body: { "status": "draft" | "live" | "done" }
    Editor:
      - can move forward (draft->live->done)
      - cannot re-open done tournaments
    Admin:
      - can set anything anytime
    """
    t = _tournament_or_404(s, tournament_id)

    new_status = body.get("status")
    if new_status not in ("draft", "live", "done"):
        raise HTTPException(status_code=400, detail="Invalid status")

    if role != "admin":
        order = {"draft": 0, "live": 1, "done": 2}
        # prevent going backwards
        if order[new_status] < order[t.status]:
            raise HTTPException(status_code=403, detail="Cannot move status backwards (admin only)")
        # prevent reopening done
        if t.status == "done" and new_status != "done":
            raise HTTPException(status_code=403, detail="Cannot re-open a done tournament (admin only)")

    t.status = new_status
    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()
    s.refresh(t)

    await ws_manager.broadcast(tournament_id, "tournament_updated", {"tournament_id": tournament_id})
    log.info("Status changed: tournament_id=%s status=%s by=%s", tournament_id, new_status, role)
    return {"ok": True, "status": t.status}


@router.patch("/{tournament_id}/second-leg", dependencies=[Depends(require_editor)])
async def second_leg(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    body: { "enabled": true|false }

    Invariant: second leg is either FULL or NONE.

    enabled=true:
      - if leg2 absent: create full leg2 (same order as leg1, no mirroring)
      - if leg2 complete: do nothing
      - if leg2 present but incomplete: 409 (won't guess how to fix)

    enabled=false:
      - delete leg2, only if leg2 has not started (unless admin)
    """
    _ = _tournament_or_404(s, tournament_id)
    enabled = bool(body.get("enabled", False))

    # Load leg1 matches in current order and force-load players
    leg1 = s.exec(
        select(Match)
        .where(Match.tournament_id == tournament_id, Match.leg == 1)
        .order_by(Match.order_index)
    ).all()
    for m in leg1:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    leg1_sigs = [_match_signature_from_loaded_match(m) for m in leg1 if _match_signature_from_loaded_match(m) != ((), ())]
    leg1_sig_set = set(leg1_sigs)

    # Load leg2 matches (any order) and force-load
    leg2 = s.exec(
        select(Match)
        .where(Match.tournament_id == tournament_id, Match.leg == 2)
        .order_by(Match.order_index)
    ).all()
    for m in leg2:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    leg2_sigs = [_match_signature_from_loaded_match(m) for m in leg2 if _match_signature_from_loaded_match(m) != ((), ())]
    leg2_sig_set = set(leg2_sigs)

    leg2_exists = len(leg2) > 0

    def leg2_complete() -> bool:
        # must match exactly (count and set)
        return len(leg2_sigs) == len(leg1_sigs) and leg2_sig_set == leg1_sig_set

    if not enabled:
        if not leg2_exists:
            return {"ok": True, "second_leg": False, "deleted": False}

        if _leg2_started(s, tournament_id):
            raise HTTPException(status_code=403, detail="Second leg already started")

        _delete_matches_by_leg(s, tournament_id, leg=2)
        await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
        return {"ok": True, "second_leg": False, "deleted": True}

    # enabled == True
    if _leg2_started(s, tournament_id):
        raise HTTPException(status_code=403, detail="Second leg already started")

    if not leg2_exists:
        # Create full leg2 in the same order as leg1, no mirroring.
        idx = _max_order_index(s, tournament_id) + 1
        created = 0
        for sig in leg1_sigs:
            teamA, teamB = sig
            _create_match_with_teams(
                s=s,
                tournament_id=tournament_id,
                order_index=idx,
                leg=2,
                team_a_player_ids=list(teamA),
                team_b_player_ids=list(teamB),
            )
            idx += 1
            created += 1

        await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
        return {"ok": True, "second_leg": True, "created": created}

    # leg2 exists already
    if leg2_complete():
        return {"ok": True, "second_leg": True, "created": 0, "note": "Second leg already complete"}

    # Exists but not complete -> strict: refuse and let admin decide what to do
    raise HTTPException(
        status_code=409,
        detail="Second leg exists but is not complete. Refusing to modify to avoid data loss. (Admin can fix manually.)",
    )


@router.delete("/{tournament_id}", dependencies=[Depends(require_admin)])
async def delete_tournament(
    tournament_id: int,
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    """
    Admin only:
      - permanently deletes a tournament and all its related rows (matches, sides, players links)
    """
    t = _tournament_or_404(s, tournament_id)

    # Collect match ids first (simple + predictable)
    match_ids = list(s.exec(select(Match.id).where(Match.tournament_id == tournament_id)).all())

    if match_ids:
        side_ids = list(s.exec(select(MatchSide.id).where(MatchSide.match_id.in_(match_ids))).all())

        if side_ids:
            # delete side-player link rows
            for sp in s.exec(select(MatchSidePlayer).where(MatchSidePlayer.match_side_id.in_(side_ids))).all():
                s.delete(sp)

            # delete sides
            for ms in s.exec(select(MatchSide).where(MatchSide.id.in_(side_ids))).all():
                s.delete(ms)

        # delete matches
        for m in s.exec(select(Match).where(Match.id.in_(match_ids))).all():
            s.delete(m)

    # delete tournament-player links
    for tp in s.exec(select(TournamentPlayer).where(TournamentPlayer.tournament_id == tournament_id)).all():
        s.delete(tp)

    # finally delete tournament
    s.delete(t)
    s.commit()

    # notify clients (list pages should refetch tournaments)
    await ws_manager.broadcast(tournament_id, "tournament_deleted", {"tournament_id": tournament_id})
    log.info("Tournament deleted: tournament_id=%s by=%s", tournament_id, role)

    return Response(status_code=204)


ALLOWED_DECIDERS = ("none", "penalties", "match")
def _compute_points_table_finished(matches: list[Match]) -> dict[int, tuple[int, int, int]]:
    """
    Per-player (points, goal_diff, goals_for) using ONLY finished matches.
    Supports 1v1 and your 2v2 scoring because points are per player.
    """
    pts: dict[int, int] = {}
    gf: dict[int, int] = {}
    ga: dict[int, int] = {}

    def ensure(pid: int) -> None:
        pts.setdefault(pid, 0)
        gf.setdefault(pid, 0)
        ga.setdefault(pid, 0)

    for m in matches:
        if m.state != "finished":
            continue

        # force-loaded in caller, but safe
        sides = {s.side: s for s in m.sides}
        a = sides.get("A")
        b = sides.get("B")
        if not a or not b:
            continue

        ag = int(a.goals or 0)
        bg = int(b.goals or 0)

        a_pids = [p.id for p in a.players]
        b_pids = [p.id for p in b.players]

        for pid in a_pids + b_pids:
            ensure(pid)

        for pid in a_pids:
            gf[pid] += ag
            ga[pid] += bg
        for pid in b_pids:
            gf[pid] += bg
            ga[pid] += ag

        if ag > bg:
            for pid in a_pids:
                pts[pid] += 3
        elif bg > ag:
            for pid in b_pids:
                pts[pid] += 3
        else:
            for pid in a_pids + b_pids:
                pts[pid] += 1

    out: dict[int, tuple[int, int, int]] = {}
    for pid in pts.keys():
        out[pid] = (pts[pid], gf[pid] - ga[pid], gf[pid])
    return out


def _top_group(points_table: dict[int, tuple[int, int, int]]) -> list[int]:
    """Returns player_ids tied for #1 by (points, gd, gf)."""
    if not points_table:
        return []
    items = sorted(points_table.items(), key=lambda kv: (kv[1][0], kv[1][1], kv[1][2]), reverse=True)
    best = items[0][1]
    return [pid for (pid, triple) in items if triple == best]


@router.patch("/{tournament_id}/decider", dependencies=[Depends(require_editor)])
async def patch_decider(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    body:
      {
        "type": "none" | "penalties" | "match",
        "winner_player_id": number|null,
        "loser_player_id": number|null,
        "winner_goals": number|null,
        "loser_goals": number|null
      }

    Editors:
      - can set decider while tournament is NOT done
    Admin:
      - can set/adjust anytime, even after done

    Rules:
      - decider applies only if there is a draw at #1 (based on finished matches)
      - winner+loser must both be in the tied top group and must be different
      - goals must be >=0 integers when type != "none"
    """
    t = _tournament_or_404(s, tournament_id)

    dec_type = (body.get("type") or "none").strip()
    if dec_type not in ALLOWED_DECIDERS:
        raise HTTPException(status_code=400, detail=f"Invalid decider type (allowed: {ALLOWED_DECIDERS})")

    def as_int_or_none(v, field: str) -> int | None:
        if v is None:
            return None
        try:
            return int(v)
        except Exception:
            raise HTTPException(status_code=400, detail=f"{field} must be an integer or null")

    winner_id = as_int_or_none(body.get("winner_player_id"), "winner_player_id")
    loser_id = as_int_or_none(body.get("loser_player_id"), "loser_player_id")
    winner_goals = as_int_or_none(body.get("winner_goals"), "winner_goals")
    loser_goals = as_int_or_none(body.get("loser_goals"), "loser_goals")

    # Load matches + force-load sides/players
    matches = s.exec(
        select(Match).where(Match.tournament_id == tournament_id).order_by(Match.order_index)
    ).all()
    for m in matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    pt = _compute_points_table_finished(matches)
    top = _top_group(pt)

    if dec_type == "none":
        t.decider_type = "none"
        t.decider_winner_player_id = None
        t.decider_loser_player_id = None
        t.decider_winner_goals = None
        t.decider_loser_goals = None
    else:
        # must actually be a tie for first
        if not top or len(top) == 1:
            raise HTTPException(status_code=409, detail="Tournament is not a draw at the top; decider not applicable")

        if winner_id is None or loser_id is None:
            raise HTTPException(status_code=400, detail="winner_player_id and loser_player_id are required when type != 'none'")
        if winner_id == loser_id:
            raise HTTPException(status_code=400, detail="winner_player_id and loser_player_id must be different")
        if winner_id not in top or loser_id not in top:
            raise HTTPException(status_code=400, detail="winner/loser must be chosen from the tied top players")

        if winner_goals is None or loser_goals is None:
            raise HTTPException(status_code=400, detail="winner_goals and loser_goals are required when type != 'none'")
        if winner_goals < 0 or loser_goals < 0:
            raise HTTPException(status_code=400, detail="goals must be >= 0")
        if loser_goals >= winner_goals:
            raise HTTPException(status_code=400, detail="winner_goals must be greater than loser_goals")

        # sanity: players belong to tournament
        allowed_ids = set(
            s.exec(select(TournamentPlayer.player_id).where(TournamentPlayer.tournament_id == tournament_id)).all()
        )
        if winner_id not in allowed_ids or loser_id not in allowed_ids:
            raise HTTPException(status_code=400, detail="winner/loser is not part of this tournament")

        t.decider_type = dec_type
        t.decider_winner_player_id = winner_id
        t.decider_loser_player_id = loser_id
        t.decider_winner_goals = winner_goals
        t.decider_loser_goals = loser_goals

    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()
    s.refresh(t)

    await ws_manager.broadcast(tournament_id, "tournament_updated", {"tournament_id": tournament_id})
    return {
        "ok": True,
        "decider_type": t.decider_type,
        "decider_winner_player_id": t.decider_winner_player_id,
        "decider_loser_player_id": t.decider_loser_player_id,
        "decider_winner_goals": t.decider_winner_goals,
        "decider_loser_goals": t.decider_loser_goals,
    }
