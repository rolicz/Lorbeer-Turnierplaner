import json
import logging
import random
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, delete, select
from sqlalchemy import case, func

from ..auth import require_admin, require_editor
from ..db import get_session
from ..models import Match, MatchSide, MatchSidePlayer, Player, Tournament, TournamentPlayer
from ..scheduling import assign_labels, schedule_1v1_labels, schedule_2v2_labels
from ..stats import compute_stats
from ..ws import ws_manager
from ..tournament_status import compute_status_for_tournament, compute_status_map, find_other_live_tournament_id

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

    status = compute_status_for_tournament(s, t.id)

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
        "status": status,  # computed
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
        for side in m.sides:
            if (side.goals or 0) != 0 or side.club_id is not None:
                return True
    return False


def _bulk_delete_matches(
    s: Session,
    tournament_id: int,
    leg: int | None = None,
) -> int:
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
    return tuple(sorted(p.id for p in side.players))


def _match_signature_from_loaded_match(m: Match) -> tuple[tuple[int, ...], tuple[int, ...]]:
    sides = {s.side: s for s in m.sides}
    if "A" not in sides or "B" not in sides:
        return ((), ())
    return (_side_player_ids(sides["A"]), _side_player_ids(sides["B"]))


def _parse_yyyy_mm_dd(value: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date (expected YYYY-MM-DD)")


def _state_rank(state: str) -> int:
    return {"finished": 0, "playing": 1, "scheduled": 2}.get(state, 99)


@router.get("")
def list_tournaments(s: Session = Depends(get_session)):
    ts = s.exec(select(Tournament).order_by(Tournament.created_at.desc())).all()
    status_by_tid = compute_status_map(s)

    out = []
    for t in ts:
        matches = s.exec(
            select(Match)
            .where(Match.tournament_id == t.id)
            .order_by(Match.order_index)
        ).all()

        # eager load like before
        for m in matches:
            _ = m.sides
            for side in m.sides:
                _ = side.players

        status = status_by_tid.get(t.id, "draft")

        winner_string = None
        winner_decider_string = None
        pt = _compute_points_table_finished(matches)
        top = _top_group(pt)
        if status == "done" and len(top) == 1:
            winner_string = s.exec(
                select(Player.display_name).where(Player.id == top[0])
            ).first()
        if len(top) > 1 and t.decider_winner_player_id is not None:
            winner_decider_string = s.exec(
                select(Player.display_name).where(Player.id == t.decider_winner_player_id)
            ).first()

        d = t.model_dump()          # all the usual Tournament fields
        d["status"] = status        # if you want status in response
        d["winner_string"] = winner_string
        d["winner_decider_string"] = winner_decider_string
        out.append(d)

    return out



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



@router.get("/live")
def get_live_tournament(s: Session = Depends(get_session)):
    """
    Returns the currently LIVE tournament (derived from matches), or null.

    LIVE definition:
      - has at least one match
      - not all scheduled
      - not all finished
    """
    r = case(
        (Match.state == "finished", 0),
        (Match.state == "playing", 1),
        (Match.state == "scheduled", 2),
        else_=99,
    )

    rows = s.exec(
        select(
            Match.tournament_id,
            func.min(r),
            func.max(r),
            func.count(Match.id),
        ).group_by(Match.tournament_id)
    ).all()

    live_tid = None
    for tid, minr, maxr, cnt in rows:
        cnt = int(cnt or 0)
        if cnt <= 0 or minr is None or maxr is None:
            continue

        minr = int(minr)
        maxr = int(maxr)

        # all scheduled -> draft
        if minr == 2 and maxr == 2:
            continue
        # all finished -> done
        if minr == 0 and maxr == 0:
            continue

        live_tid = int(tid)
        break

    if live_tid is None:
        return None

    t = s.get(Tournament, live_tid)
    if not t:
        return None

    return {
        "id": t.id,
        "name": t.name,
        "mode": t.mode,
        "date": t.date,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "status": "live",
    }



@router.patch("/{tournament_id}", dependencies=[Depends(require_editor)])
async def patch_tournament(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    Patch tournament metadata (NO manual status).
    Allowed fields:
      - name
      - settings
    """
    t = _tournament_or_404(s, tournament_id)

    status_now = compute_status_for_tournament(s, tournament_id)
    if status_now == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to edit)")

    if "name" in body:
        t.name = str(body["name"]).strip()
        if not t.name:
            raise HTTPException(status_code=400, detail="name cannot be empty")

    if "settings" in body:
        t.settings_json = json.dumps(body["settings"])

    # keep status in sync
    t.status = compute_status_for_tournament(s, tournament_id)

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
    t = _tournament_or_404(s, tournament_id)

    date_str = (body.get("date") or "").strip()
    if not date_str:
        raise HTTPException(status_code=400, detail="Missing date")

    t.date = _parse_yyyy_mm_dd(date_str)
    t.updated_at = datetime.utcnow()

    # keep status in sync
    t.status = compute_status_for_tournament(s, tournament_id)

    s.add(t)
    s.commit()
    s.refresh(t)

    await ws_manager.broadcast(tournament_id, "tournament_updated", {"tournament_id": tournament_id})
    log.info("Tournament date changed: tournament_id=%s date=%s by=%s", tournament_id, t.date, role)
    return {"ok": True, "date": t.date}


@router.post("/{tournament_id}/generate", dependencies=[Depends(require_editor)])
async def generate_schedule(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    body: { "randomize": true }
    """
    t = _tournament_or_404(s, tournament_id)

    status_now = compute_status_for_tournament(s, tournament_id)
    if status_now == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to regenerate)")

    randomize = bool(body.get("randomize", True))
    player_names = [p.display_name for p in t.players]

    if t.mode == "1v1" and not (3 <= len(player_names) <= 5):
        raise HTTPException(status_code=400, detail="1v1 supports 3–5 players (adjustable)")
    if t.mode == "2v2" and not (4 <= len(player_names) <= 6):
        raise HTTPException(status_code=400, detail="2v2 supports 4–6 players (adjustable)")

    labels, label_to_name = assign_labels(player_names, shuffle=randomize)

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

    if t.mode == "1v1":
        label_matches = schedule_1v1_labels(labels)
    else:
        try:
            label_matches = schedule_2v2_labels(labels)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if randomize:
        random.shuffle(label_matches)

    _delete_schedule(s, tournament_id)

    db_players = {p.display_name: p for p in t.players}

    def label_team_to_player_ids(team: tuple[str, ...]) -> list[int]:
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

    # After generation: all scheduled => draft
    t = _tournament_or_404(s, tournament_id)
    t.status = compute_status_for_tournament(s, tournament_id)
    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()

    await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
    log.info("Generated schedule: tournament_id=%s matches=%s mode=%s players=%s",
             tournament_id, len(label_matches), t.mode, len(player_names))
    return {"ok": True, "matches": len(label_matches), "labels": label_to_name}


@router.patch("/{tournament_id}/reorder", dependencies=[Depends(require_editor)])
async def reorder(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    t = _tournament_or_404(s, tournament_id)

    status_now = compute_status_for_tournament(s, tournament_id)
    if status_now == "done" and role != "admin":
        raise HTTPException(status_code=403, detail="Tournament is done (admin required to reorder)")

    match_ids = body.get("match_ids")
    if not isinstance(match_ids, list) or not match_ids:
        raise HTTPException(status_code=400, detail="match_ids must be a non-empty list")

    matches_sorted = s.exec(
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index)
    ).all()
    by_id = {m.id: m for m in matches_sorted}

    if set(match_ids) != set(by_id.keys()):
        raise HTTPException(status_code=400, detail="match_ids must include exactly all tournament match ids")

    fixed_prefix = [m.id for m in matches_sorted if m.state != "scheduled"]
    if fixed_prefix:
        if match_ids[: len(fixed_prefix)] != fixed_prefix:
            raise HTTPException(
                status_code=409,
                detail="Tournament already started: finished/playing matches must stay as the prefix; reorder only scheduled matches after that.",
            )

    ranks = [_state_rank(by_id[mid].state) for mid in match_ids]
    if any(ranks[i] > ranks[i + 1] for i in range(len(ranks) - 1)):
        raise HTTPException(
            status_code=409,
            detail="Invalid order: must be finished… then (optional) one playing… then scheduled…",
        )

    playing_count = sum(1 for mid in match_ids if by_id[mid].state == "playing")
    if playing_count > 1:
        raise HTTPException(status_code=409, detail="Only one match can be 'playing' at a time")

    for idx, mid in enumerate(match_ids):
        by_id[mid].order_index = idx
        s.add(by_id[mid])

    s.commit()
    await ws_manager.broadcast(tournament_id, "matches_reordered", {"tournament_id": tournament_id})
    return {"ok": True}


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

    NOTE: This is allowed even if leg1 is fully finished (it can revive a tournament to "live").
    Enforces: only one tournament may be live.
    """
    _ = _tournament_or_404(s, tournament_id)
    enabled = bool(body.get("enabled", False))

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
        return len(leg2_sigs) == len(leg1_sigs) and leg2_sig_set == leg1_sig_set

    if not enabled:
        if not leg2_exists:
            return {"ok": True, "second_leg": False, "deleted": False}

        if _leg2_started(s, tournament_id):
            raise HTTPException(status_code=403, detail="Second leg already started")

        _delete_matches_by_leg(s, tournament_id, leg=2)

        # sync status
        t = _tournament_or_404(s, tournament_id)
        t.status = compute_status_for_tournament(s, tournament_id)
        t.updated_at = datetime.utcnow()
        s.add(t)
        s.commit()

        await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
        return {"ok": True, "second_leg": False, "deleted": True, "status": t.status}

    # enabled == True
    if _leg2_started(s, tournament_id):
        raise HTTPException(status_code=403, detail="Second leg already started")

    if not leg2_exists:
        # Creating leg2 will make tournament LIVE (because there will be finished+scheduled).
        other_live = find_other_live_tournament_id(s, tournament_id)
        if other_live is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Another tournament is live (tournament_id={other_live}). Finish it before adding a second leg here.",
            )

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

        # sync status
        t = _tournament_or_404(s, tournament_id)
        t.status = compute_status_for_tournament(s, tournament_id)
        t.updated_at = datetime.utcnow()
        s.add(t)
        s.commit()

        await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
        return {"ok": True, "second_leg": True, "created": created, "status": t.status}

    if leg2_complete():
        # nothing to do; still keep status synced
        t = _tournament_or_404(s, tournament_id)
        t.status = compute_status_for_tournament(s, tournament_id)
        s.add(t)
        s.commit()
        return {"ok": True, "second_leg": True, "created": 0, "note": "Second leg already complete", "status": t.status}

    raise HTTPException(
        status_code=409,
        detail="Second leg exists but is not complete. Refusing to modify to avoid data loss.",
    )


@router.get("/{tournament_id}/stats")
def stats(tournament_id: int, s: Session = Depends(get_session)):
    _tournament_or_404(s, tournament_id)

    matches = s.exec(select(Match).where(Match.tournament_id == tournament_id).order_by(Match.order_index)).all()
    for m in matches:
        _ = m.sides
        for side in m.sides:
            _ = side.players

    return compute_stats(matches)


# NOTE: /{tournament_id}/status endpoint REMOVED (status is automatic now)


@router.delete("/{tournament_id}", dependencies=[Depends(require_admin)])
async def delete_tournament(
    tournament_id: int,
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    t = _tournament_or_404(s, tournament_id)

    match_ids = list(s.exec(select(Match.id).where(Match.tournament_id == tournament_id)).all())

    if match_ids:
        side_ids = list(s.exec(select(MatchSide.id).where(MatchSide.match_id.in_(match_ids))).all())

        if side_ids:
            for sp in s.exec(select(MatchSidePlayer).where(MatchSidePlayer.match_side_id.in_(side_ids))).all():
                s.delete(sp)

            for ms in s.exec(select(MatchSide).where(MatchSide.id.in_(side_ids))).all():
                s.delete(ms)

        for m in s.exec(select(Match).where(Match.id.in_(match_ids))).all():
            s.delete(m)

    for tp in s.exec(select(TournamentPlayer).where(TournamentPlayer.tournament_id == tournament_id)).all():
        s.delete(tp)

    s.delete(t)
    s.commit()

    await ws_manager.broadcast(tournament_id, "tournament_deleted", {"tournament_id": tournament_id})
    log.info("Tournament deleted: tournament_id=%s by=%s", tournament_id, role)

    return Response(status_code=204)


# (keep your existing /decider endpoint etc. below unchanged)


ALLOWED_DECIDERS = ("none", "penalties", "match", "scheresteinpapier")
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
        "type": "none" | "penalties" | "match" | "scheresteinpapier",
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

@router.post("/{tournament_id}/reassign", dependencies=[Depends(require_editor)])
async def reassign_2v2(
    tournament_id: int,
    body: dict,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    Re-create match combinations for NON-deterministic schedules.

    Only allowed for 2v2 (pairings/opponents are not uniquely determined).
    Safety:
      - only when ALL matches are still scheduled (and "clean": no goals/clubs/timestamps)
      - editor/admin only
      - preserves "second leg enabled" flag: if leg2 existed before, it is recreated to match new leg1

    body (optional):
      { "randomize_order": true|false }
    """
    t = _tournament_or_404(s, tournament_id)

    if t.mode != "2v2":
        raise HTTPException(status_code=409, detail="Re-assign is only supported for 2v2 tournaments")

    # Must have an existing schedule
    matches = s.exec(
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index)
    ).all()
    if not matches:
        raise HTTPException(status_code=409, detail="No schedule exists yet (generate schedule first)")

    # Safety: only if ALL matches are still scheduled and untouched
    for m in matches:
        if m.state != "scheduled":
            raise HTTPException(status_code=409, detail="Re-assign requires all matches to be scheduled")
        if m.started_at is not None or m.finished_at is not None:
            raise HTTPException(status_code=409, detail="Re-assign requires untouched matches (no timestamps)")

        _ = m.sides
        for side in m.sides:
            if (side.goals or 0) != 0:
                raise HTTPException(status_code=409, detail="Re-assign requires untouched matches (goals must be 0)")
            if side.club_id is not None:
                raise HTTPException(status_code=409, detail="Re-assign requires untouched matches (clubs must be empty)")

    had_leg2 = any(m.leg == 2 for m in matches)
    randomize_order = bool(body.get("randomize_order", True))

    # validate player count for 2v2
    _ = t.players
    player_names = [p.display_name for p in t.players]
    if not (4 <= len(player_names) <= 6):
        raise HTTPException(status_code=400, detail="2v2 supports 4–6 players (adjustable)")

    # Build a NEW random label mapping => changes real pairings (not just order)
    labels, label_to_name = assign_labels(player_names, shuffle=True)

    # Persist label mapping in settings_json (like /generate does)
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

    # Compute 2v2 matchups
    try:
        label_matches = schedule_2v2_labels(labels)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if randomize_order:
        random.shuffle(label_matches)

    # Delete old schedule (both legs, if present)
    _delete_schedule(s, tournament_id)

    # Map label->player_id using current tournament players
    db_players = {p.display_name: p for p in t.players}

    def label_team_to_player_ids(team: tuple[str, ...]) -> list[int]:
        return [db_players[label_to_name[l]].id for l in team]

    # Recreate leg 1
    idx = 0
    for team_a, team_b in label_matches:
        _create_match_with_teams(
            s=s,
            tournament_id=tournament_id,
            order_index=idx,
            leg=1,
            team_a_player_ids=label_team_to_player_ids(team_a),
            team_b_player_ids=label_team_to_player_ids(team_b),
        )
        idx += 1

    # If second leg existed before, recreate it to match new leg1
    if had_leg2:
        for team_a, team_b in label_matches:
            _create_match_with_teams(
                s=s,
                tournament_id=tournament_id,
                order_index=idx,
                leg=2,
                team_a_player_ids=label_team_to_player_ids(team_a),
                team_b_player_ids=label_team_to_player_ids(team_b),
            )
            idx += 1

    # Sync status (after reassign everything is scheduled => draft)
    t = _tournament_or_404(s, tournament_id)
    t.status = compute_status_for_tournament(s, tournament_id)
    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()

    await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})
    log.info(
        "2v2 reassign: tournament_id=%s matches=%s had_leg2=%s by=%s",
        tournament_id, len(label_matches), had_leg2, role
    )
    return {"ok": True, "matches": len(label_matches), "second_leg": had_leg2, "status": t.status}
