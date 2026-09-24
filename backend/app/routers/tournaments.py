import json
import logging
import random
from datetime import date, datetime
from typing import NamedTuple

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import case, func
from sqlalchemy.orm import selectinload
from sqlmodel import Session, delete, select

from ..api_utils import bad_request, conflict, forbidden, get_or_404
from ..auth import require_admin, require_auth_claims, require_editor, require_editor_claims
from ..db import get_session
from ..models import (
    Comment,
    Match,
    MatchSide,
    MatchSidePlayer,
    Player,
    Tournament,
    TournamentCreatorLink,
    TournamentPinnedComment,
    TournamentPlayer,
)
from ..scheduling import assign_labels, schedule_1v1_labels, schedule_2v2_labels
from ..schemas import (
    TournamentCreateBody,
    TournamentDatePatchBody,
    TournamentDeciderPatchBody,
    TournamentGenerateBody,
    TournamentPatchBody,
    TournamentReassignBody,
    TournamentReorderBody,
    TournamentSecondLegBody,
)
from ..schemas.responses import (
    CommentSummaryOut,
    DeciderResultOut,
    OkResponse,
    ReassignPreviewOut,
    ReassignResultOut,
    ScheduleGeneratedOut,
    TournamentDateOut,
    TournamentDetailOut,
    TournamentListItemOut,
    TournamentLiveOut,
    TournamentStatsOut,
    TournamentSummaryOut,
)
from ..services.authorization import (
    ensure_can_delete_tournament,
    ensure_can_edit_tournament,
)
from ..services.comment_cleanup import delete_comment_rows, match_comment_ids
from ..services.comments_summary import tournament_comments_summary
from ..services.events import (
    broadcast_tournament,
    broadcast_tournament_deleted,
    notify_tournaments_changed,
    push_comment_deleted,
)
from ..services.file_storage import delete_media
from ..services.groups import current_group
from ..services.notifications import (
    push_schedule_generated,
    push_tournament_created,
    push_tournament_date_changed,
    push_tournament_deleted,
    push_tournament_updated,
)
from ..services.record_holders import after_result_change
from ..services.stats.core import compute_points_table_finished, top_group
from ..services.stats.tournament_stats import compute_tournament_stats
from ..services.tournament_list import build_tournament_list
from ..services.tournament_view import serialize_tournament
from ..tournament_status import compute_status_for_tournament, find_other_live_tournament_id

log = logging.getLogger(__name__)
router = APIRouter(prefix="/tournaments", tags=["tournaments"])





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


class MatchDeletion(NamedTuple):
    """What destroying a set of matches took with it, so the caller can finish the job."""

    matches: int
    comment_ids: list[int]
    image_paths: list[str]
    #: How many of them were `finished` — i.e. how many real results died here. It is the
    #: guard every caller uses to decide whether this was a *result* change (M2); a guard,
    #: not a comment, is what keeps that honest on the two paths where it is always 0.
    finished: int = 0


EMPTY_DELETION = MatchDeletion(0, [], [], 0)


def _bulk_delete_matches(
    s: Session,
    tournament_id: int,
    leg: int | None = None,
    *,
    autocommit: bool = True,
) -> MatchDeletion:
    """Destroy matches — and the comments filed under them.

    A match id is not reusable *information*: the row goes, and `Comment.match_id` would
    be left pointing at a dead id. Nothing enforces the foreign key (A9) and `match.id`
    has no AUTOINCREMENT, so SQLite hands that id out again and the stale comment would
    silently reappear under an unrelated future match. Every caller that deletes matches
    goes through here, so none of them can leave that debris behind (Q5).
    """
    q = select(Match.id).where(Match.tournament_id == tournament_id)
    if leg is not None:
        q = q.where(Match.leg == leg)

    match_ids = [int(i) for i in s.exec(q).all()]
    if not match_ids:
        return EMPTY_DELETION

    finished = int(
        s.exec(
            select(func.count(Match.id)).where(Match.id.in_(match_ids), Match.state == "finished")
        ).one()
    )

    comment_ids = match_comment_ids(s, tournament_id, match_ids)
    image_paths = delete_comment_rows(s, tournament_id, comment_ids)
    s.flush()

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

    if autocommit:
        s.commit()
        s.expire_all()
    return MatchDeletion(len(match_ids), comment_ids, image_paths, finished)


def _delete_schedule(s: Session, tournament_id: int, *, autocommit: bool = True) -> MatchDeletion:
    return _bulk_delete_matches(s, tournament_id, leg=None, autocommit=autocommit)


def _delete_matches_by_leg(s: Session, tournament_id: int, leg: int, *, autocommit: bool = True) -> MatchDeletion:
    return _bulk_delete_matches(s, tournament_id, leg=leg, autocommit=autocommit)


async def _finish_match_deletion(tournament_id: int, deletion: MatchDeletion) -> None:
    """After the commit: drop the image files and tell open feeds the comments are gone.

    Files last, so a transaction that never lands leaves no hole where a file was.
    """
    for path in deletion.image_paths:
        delete_media(path)
    for cid in deletion.comment_ids:
        await push_comment_deleted(tournament_id, cid)
    if deletion.comment_ids:
        # Same badge, the other direction: deleted comments must stop being counted (A5).
        await notify_tournaments_changed(action="comment", tournament_id=tournament_id)


def _delete_tournament_graph(s: Session, tournament_id: int) -> bool:
    """Delete a tournament and everything that only exists because of it.

    Its comments included — all of them, not just the match-tied ones: `tournament.id`
    has no AUTOINCREMENT either, so leaving them behind would let a dead conversation
    surface inside whatever tournament is given that id next (Q5).
    """
    exists = s.exec(select(Tournament.id).where(Tournament.id == tournament_id)).first()
    if not exists:
        return False

    comment_ids = list(
        s.exec(select(Comment.id).where(Comment.tournament_id == tournament_id)).all()
    )
    image_paths = delete_comment_rows(s, tournament_id, [int(i) for i in comment_ids])
    pin = s.get(TournamentPinnedComment, tournament_id)
    if pin is not None:
        s.delete(pin)
    s.flush()

    match_ids = list(s.exec(select(Match.id).where(Match.tournament_id == tournament_id)).all())
    if match_ids:
        side_ids = list(s.exec(select(MatchSide.id).where(MatchSide.match_id.in_(match_ids))).all())
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

    s.exec(
        delete(TournamentPlayer)
        .where(TournamentPlayer.tournament_id == tournament_id)
        .execution_options(synchronize_session=False)
    )
    s.exec(
        delete(TournamentCreatorLink)
        .where(TournamentCreatorLink.tournament_id == tournament_id)
        .execution_options(synchronize_session=False)
    )
    s.exec(
        delete(Tournament)
        .where(Tournament.id == tournament_id)
        .execution_options(synchronize_session=False)
    )
    s.commit()
    s.expire_all()
    for path in image_paths:
        delete_media(path)
    return True


def _generate_schedule_for_tournament(
    s: Session,
    t: Tournament,
    randomize: bool,
    *,
    autocommit: bool = True,
) -> tuple[int, dict, MatchDeletion]:
    player_names = [p.display_name for p in t.players]

    if t.mode == "1v1" and not (3 <= len(player_names) <= 6):
        bad_request("1v1 supports 3–6 players (adjustable)")
    if t.mode == "2v2" and not (4 <= len(player_names) <= 6):
        bad_request("2v2 supports 4–6 players (adjustable)")

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
    s.flush()

    if t.mode == "1v1":
        label_matches = schedule_1v1_labels(labels)
    else:
        try:
            label_matches = schedule_2v2_labels(labels)
        except ValueError as e:
            bad_request(str(e))

    if randomize:
        random.shuffle(label_matches)

    deletion = _delete_schedule(s, int(t.id), autocommit=False)

    db_players = {p.display_name: p for p in t.players}

    def label_team_to_player_ids(team: tuple[str, ...]) -> list[int]:
        return [db_players[label_to_name[l]].id for l in team]

    for idx, (team_a, team_b) in enumerate(label_matches):
        _create_match_with_teams(
            s=s,
            tournament_id=int(t.id),
            order_index=idx,
            leg=1,
            team_a_player_ids=label_team_to_player_ids(team_a),
            team_b_player_ids=label_team_to_player_ids(team_b),
            autocommit=False,
        )

    s.flush()
    t.status = compute_status_for_tournament(s, int(t.id))
    t.updated_at = datetime.utcnow()
    s.add(t)
    if autocommit:
        s.commit()
        s.refresh(t)

    return len(label_matches), label_to_name, deletion


def _create_match_with_teams(
    s: Session,
    tournament_id: int,
    order_index: int,
    leg: int,
    team_a_player_ids: list[int],
    team_b_player_ids: list[int],
    *,
    autocommit: bool = True,
) -> Match:
    m = Match(
        tournament_id=tournament_id,
        leg=leg,
        order_index=order_index,
        state="scheduled",
    )
    s.add(m)
    s.flush()

    for side_label, pids in (("A", team_a_player_ids), ("B", team_b_player_ids)):
        side = MatchSide(match_id=m.id, side=side_label, goals=0, club_id=None)
        s.add(side)
        s.flush()

        for pid in pids:
            s.add(MatchSidePlayer(match_side_id=side.id, player_id=pid))

    if autocommit:
        s.commit()
        s.refresh(m)
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
        bad_request("Invalid date (expected YYYY-MM-DD)")


def _state_rank(state: str) -> int:
    return {"finished": 0, "playing": 1, "scheduled": 2}.get(state, 99)


@router.get("", response_model=list[TournamentListItemOut])
def list_tournaments(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
):
    # part 2: filter by group — part 1 has one, and every row carries its `group_id` (L3).
    return build_tournament_list(s, claims=claims)


@router.get("/live", response_model=TournamentLiveOut | None)
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


@router.get("/comments-summary", response_model=list[CommentSummaryOut])
def get_tournaments_comments_summary(s: Session = Depends(get_session)) -> list[dict]:
    # Must live here (and before "/{tournament_id}") so it doesn't get shadowed by the int path param route.
    return tournament_comments_summary(s)


@router.get("/{tournament_id}", response_model=TournamentDetailOut)
def get_tournament(
    tournament_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
):
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")
    return serialize_tournament(s, t, claims=claims)


@router.post("", response_model=TournamentSummaryOut)
async def create_tournament(
    body: TournamentCreateBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    name = (body.name or "").strip()
    mode = body.mode
    settings = body.settings or {}
    player_ids = list(body.player_ids or [])
    auto_generate = bool(body.auto_generate)
    randomize = bool(body.randomize)
    date_str = (body.date or "").strip()
    t_date = _parse_yyyy_mm_dd(date_str) if date_str else date.today()

    if not name:
        bad_request("Missing name")
    if player_ids:
        existing = s.exec(select(Player).where(Player.id.in_(player_ids))).all()
        found_ids = {p.id for p in existing}
        if set(player_ids) != found_ids:
            bad_request("One or more player_ids do not exist")

    try:
        t = Tournament(
            name=name,
            mode=mode,
            status="draft",
            settings_json=json.dumps(settings),
            date=t_date,
            group_id=int(current_group(s).id),
        )
        s.add(t)
        s.flush()

        if player_ids:
            for pid in player_ids:
                s.add(TournamentPlayer(tournament_id=t.id, player_id=pid))
            s.flush()
            s.refresh(t)

        if auto_generate:
            created_matches, _, _ = _generate_schedule_for_tournament(s, t, randomize=randomize, autocommit=False)
            log.info(
                "Created + generated tournament '%s' (id=%s, mode=%s, matches=%s)",
                t.name,
                t.id,
                t.mode,
                created_matches,
            )

        # Record who created it (additive link table, the CommentAuthorLink pattern) so the
        # grace window knows whose accidental tournament this is. Part of the same transaction:
        # a tournament without its creator row would silently be admin-only to delete.
        s.add(TournamentCreatorLink(tournament_id=int(t.id), creator_player_id=int(claims["player_id"])))

        s.commit()
        s.refresh(t)
    except HTTPException:
        s.rollback()
        raise
    except Exception as e:
        s.rollback()
        log.exception("Create+generate failed and rolled back")
        raise HTTPException(status_code=500, detail=f"Failed to create tournament: {e}")

    log.info("Created tournament '%s' (id=%s, mode=%s)", t.name, t.id, t.mode)

    await notify_tournaments_changed(action="created", tournament_id=int(t.id))
    push_tournament_created(request, tournament_id=int(t.id), tournament_name=t.name)
    return t







@router.patch("/{tournament_id}", response_model=TournamentSummaryOut)
async def patch_tournament(
    tournament_id: int,
    body: TournamentPatchBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    """
    Patch tournament metadata (NO manual status).
    Allowed fields:
      - name
      - settings
    """
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")

    status_now = compute_status_for_tournament(s, tournament_id)
    ensure_can_edit_tournament(s, t, claims=claims, action="edit", status=status_now)

    fields = body.model_fields_set

    if "name" in fields:
        t.name = str(body.name or "").strip()
        if not t.name:
            bad_request("name cannot be empty")

    if "settings" in fields:
        t.settings_json = json.dumps(body.settings)

    # keep status in sync
    t.status = compute_status_for_tournament(s, tournament_id)

    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()
    s.refresh(t)

    await broadcast_tournament(s, tournament_id, reason="updated", global_action="updated")
    push_tournament_updated(request, tournament_id=tournament_id, tournament_name=t.name)
    return t


@router.patch("/{tournament_id}/date", response_model=TournamentDateOut, dependencies=[Depends(require_admin)])
async def patch_date(
    tournament_id: int,
    body: TournamentDatePatchBody,
    request: Request,
    s: Session = Depends(get_session),
    role: str = Depends(require_admin),
):
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")

    date_str = (body.date or "").strip()
    if not date_str:
        bad_request("Missing date")

    t.date = _parse_yyyy_mm_dd(date_str)
    t.updated_at = datetime.utcnow()

    # keep status in sync
    t.status = compute_status_for_tournament(s, tournament_id)

    s.add(t)
    s.commit()
    s.refresh(t)

    # Streaks, Elo and the upset are ordered by `tournament.date`, so moving the date of a
    # tournament that has results reorders them — a result change that moves no status (M2).
    has_results = (
        int(
            s.exec(
                select(func.count(Match.id)).where(
                    Match.tournament_id == tournament_id, Match.state == "finished"
                )
            ).one()
        )
        > 0
    )
    await broadcast_tournament(
        s, tournament_id, reason="updated", global_action="result" if has_results else "updated"
    )
    if has_results:
        after_result_change(request, s, tournament_id=tournament_id, reason="date")
    log.info("Tournament date changed: tournament_id=%s date=%s by=%s", tournament_id, t.date, role)
    push_tournament_date_changed(request, tournament_id=tournament_id, tournament_name=t.name, tournament_date=t.date)
    return {"ok": True, "date": t.date}


@router.post("/{tournament_id}/generate", response_model=ScheduleGeneratedOut)
async def generate_schedule(
    tournament_id: int,
    body: TournamentGenerateBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    """
    body: { "randomize": true }
    """
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")

    status_now = compute_status_for_tournament(s, tournament_id)
    ensure_can_edit_tournament(s, t, claims=claims, action="regenerate", status=status_now)

    randomize = bool(body.randomize)
    created_matches, label_to_name, deletion = _generate_schedule_for_tournament(s, t, randomize=randomize)

    await _finish_match_deletion(tournament_id, deletion)
    # Regenerating a *live* tournament destroys finished matches, which moves every stat
    # and the cup — "updated" would have told no other device anything (M2).
    await broadcast_tournament(
        s, tournament_id, reason="schedule", global_action="result" if deletion.finished else "updated"
    )
    if deletion.finished:
        after_result_change(request, s, tournament_id=tournament_id, reason="generate")
    log.info(
        "Generated schedule: tournament_id=%s matches=%s mode=%s players=%s",
        tournament_id,
        created_matches,
        t.mode,
        len(t.players),
    )
    push_schedule_generated(request, tournament_id=tournament_id, tournament_name=t.name, match_count=created_matches)
    return {"ok": True, "matches": created_matches, "labels": label_to_name}


@router.patch("/{tournament_id}/reorder", response_model=OkResponse)
async def reorder(
    tournament_id: int,
    body: TournamentReorderBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")

    status_now = compute_status_for_tournament(s, tournament_id)
    ensure_can_edit_tournament(s, t, claims=claims, action="reorder", status=status_now)

    match_ids = list(body.match_ids or [])
    if not match_ids:
        bad_request("match_ids must be a non-empty list")

    matches_sorted = s.exec(
        select(Match)
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index)
    ).all()
    by_id = {m.id: m for m in matches_sorted}

    if set(match_ids) != set(by_id.keys()):
        bad_request("match_ids must include exactly all tournament match ids")

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
        conflict("Only one match can be 'playing' at a time")

    for idx, mid in enumerate(match_ids):
        by_id[mid].order_index = idx
        s.add(by_id[mid])

    s.commit()
    # No `after_result_change` here: the checks above pin every finished/playing match as
    # an unmovable prefix, so a reorder cannot touch a result — only the queue ahead of it.
    await broadcast_tournament(s, tournament_id, reason="reorder")
    return {"ok": True}


@router.patch("/{tournament_id}/second-leg", dependencies=[Depends(require_editor)])
async def second_leg(
    tournament_id: int,
    body: TournamentSecondLegBody,
    request: Request,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    body: { "enabled": true|false }

    Invariant: second leg is either FULL or NONE.

    NOTE: This is allowed even if leg1 is fully finished (it can revive a tournament to "live").
    Enforces: only one tournament may be live.
    """
    get_or_404(s, Tournament, tournament_id, name="Tournament")
    enabled = bool(body.enabled)

    leg1 = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.tournament_id == tournament_id, Match.leg == 1)
        .order_by(Match.order_index)
    ).all()

    leg1_sigs = [_match_signature_from_loaded_match(m) for m in leg1 if _match_signature_from_loaded_match(m) != ((), ())]
    leg1_sig_set = set(leg1_sigs)

    leg2 = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.tournament_id == tournament_id, Match.leg == 2)
        .order_by(Match.order_index)
    ).all()

    leg2_sigs = [_match_signature_from_loaded_match(m) for m in leg2 if _match_signature_from_loaded_match(m) != ((), ())]
    leg2_sig_set = set(leg2_sigs)

    leg2_exists = len(leg2) > 0

    def leg2_complete() -> bool:
        return len(leg2_sigs) == len(leg1_sigs) and leg2_sig_set == leg1_sig_set

    if not enabled:
        if not leg2_exists:
            return {"ok": True, "second_leg": False, "deleted": False}

        if _leg2_started(s, tournament_id):
            forbidden("Second leg already started")

        deletion = _delete_matches_by_leg(s, tournament_id, leg=2)

        # sync status
        t = get_or_404(s, Tournament, tournament_id, name="Tournament")
        t.status = compute_status_for_tournament(s, tournament_id)
        t.updated_at = datetime.utcnow()
        s.add(t)
        s.commit()

        await _finish_match_deletion(tournament_id, deletion)
        await broadcast_tournament(s, tournament_id, reason="schedule", global_action="updated")
        # Always 0 — `_leg2_started` refused above if leg 2 had begun. The guard is the
        # proof of that, and it keeps this path honest if that check is ever relaxed (M2).
        if deletion.finished:
            after_result_change(request, s, tournament_id=tournament_id, reason="second-leg")
        return {"ok": True, "second_leg": False, "deleted": True, "status": t.status}

    # enabled == True
    if _leg2_started(s, tournament_id):
        forbidden("Second leg already started")

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
                autocommit=False,
            )
            idx += 1
            created += 1

        # sync status
        s.flush()
        t = get_or_404(s, Tournament, tournament_id, name="Tournament")
        t.status = compute_status_for_tournament(s, tournament_id)
        t.updated_at = datetime.utcnow()
        s.add(t)
        s.commit()

        await broadcast_tournament(s, tournament_id, reason="schedule", global_action="updated")
        return {"ok": True, "second_leg": True, "created": created, "status": t.status}

    if leg2_complete():
        # nothing to do; still keep status synced
        t = get_or_404(s, Tournament, tournament_id, name="Tournament")
        t.status = compute_status_for_tournament(s, tournament_id)
        s.add(t)
        s.commit()
        return {"ok": True, "second_leg": True, "created": 0, "note": "Second leg already complete", "status": t.status}

    raise HTTPException(
        status_code=409,
        detail="Second leg exists but is not complete. Refusing to modify to avoid data loss.",
    )


@router.get("/{tournament_id}/stats", response_model=TournamentStatsOut)
def stats(tournament_id: int, s: Session = Depends(get_session)):
    get_or_404(s, Tournament, tournament_id, name="Tournament")
    return compute_tournament_stats(s, tournament_id)


@router.delete("/{tournament_id}")
async def delete_tournament(
    tournament_id: int,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
):
    """Admin always; the editor who created it may delete it within their first hour (A10).

    Allowed even when results exist — which is why every client confirms first.
    """
    tournament = get_or_404(s, Tournament, tournament_id, name="Tournament")
    ensure_can_delete_tournament(s, tournament, claims=claims)
    role = str(claims.get("role") or "")
    tournament_name = tournament.name  # capture before the row is deleted/expired
    _delete_tournament_graph(s, tournament_id)

    await broadcast_tournament_deleted(tournament_id)
    # The tournament is gone, so there is no id left to name (M2).
    after_result_change(request, s, tournament_id=None, reason="delete")
    log.info("Tournament deleted: tournament_id=%s by=%s", tournament_id, role)
    push_tournament_deleted(request, tournament_id=tournament_id, tournament_name=tournament_name)

    return Response(status_code=204)


ALLOWED_DECIDERS = ("none", "penalties", "match", "scheresteinpapier")


@router.patch("/{tournament_id}/decider", response_model=DeciderResultOut)
async def patch_decider(
    tournament_id: int,
    body: TournamentDeciderPatchBody,
    request: Request,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_editor_claims),
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
      - can set the decider while the tournament is NOT done, and for one hour after it
        finished (A10 — a decider only resolves a tie that is known once every match is
        played, so the window has to start when the tournament ends)
    Admin:
      - can set/adjust anytime, even after done

    Rules:
      - decider applies only if there is a draw at #1 (based on finished matches)
      - winner+loser must both be in the tied top group and must be different
      - goals must be >=0 integers when type != "none"
    """
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")

    status_now = compute_status_for_tournament(s, tournament_id)
    ensure_can_edit_tournament(s, t, claims=claims, action="set the decider", status=status_now)

    dec_type = (body.type or "none").strip()
    if dec_type not in ALLOWED_DECIDERS:
        bad_request(f"Invalid decider type (allowed: {ALLOWED_DECIDERS})")

    def as_int_or_none(v, field: str) -> int | None:
        if v is None:
            return None
        try:
            return int(v)
        except Exception:
            bad_request(f"{field} must be an integer or null")

    winner_id = as_int_or_none(body.winner_player_id, "winner_player_id")
    loser_id = as_int_or_none(body.loser_player_id, "loser_player_id")
    winner_goals = as_int_or_none(body.winner_goals, "winner_goals")
    loser_goals = as_int_or_none(body.loser_goals, "loser_goals")

    matches = s.exec(
        select(Match)
        .options(selectinload(Match.sides).selectinload(MatchSide.players))
        .where(Match.tournament_id == tournament_id)
        .order_by(Match.order_index)
    ).all()

    pt = compute_points_table_finished(matches)
    top = top_group(pt)

    if dec_type == "none":
        t.decider_type = "none"
        t.decider_winner_player_id = None
        t.decider_loser_player_id = None
        t.decider_winner_goals = None
        t.decider_loser_goals = None
    else:
        # must actually be a tie for first
        if not top or len(top) == 1:
            conflict("Tournament is not a draw at the top; decider not applicable")

        if winner_id is None or loser_id is None:
            bad_request("winner_player_id and loser_player_id are required when type != 'none'")
        if winner_id == loser_id:
            bad_request("winner_player_id and loser_player_id must be different")
        if winner_id not in top or loser_id not in top:
            bad_request("winner/loser must be chosen from the tied top players")

        if winner_goals is None or loser_goals is None:
            bad_request("winner_goals and loser_goals are required when type != 'none'")
        if winner_goals < 0 or loser_goals < 0:
            bad_request("goals must be >= 0")
        if loser_goals >= winner_goals:
            bad_request("winner_goals must be greater than loser_goals")

        # sanity: players belong to tournament
        allowed_ids = set(
            s.exec(select(TournamentPlayer.player_id).where(TournamentPlayer.tournament_id == tournament_id)).all()
        )
        if winner_id not in allowed_ids or loser_id not in allowed_ids:
            bad_request("winner/loser is not part of this tournament")

        t.decider_type = dec_type
        t.decider_winner_player_id = winner_id
        t.decider_loser_player_id = loser_id
        t.decider_winner_goals = winner_goals
        t.decider_loser_goals = loser_goals

    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()
    s.refresh(t)

    # Decider resolves the winner of a finished tournament -> affects cup + stats.
    await broadcast_tournament(s, tournament_id, reason="decider", global_action="status", status="done")
    # …and "Most tournament wins" with it (M2).
    after_result_change(request, s, tournament_id=tournament_id, reason="decider")
    return {
        "ok": True,
        "decider_type": t.decider_type,
        "decider_winner_player_id": t.decider_winner_player_id,
        "decider_loser_player_id": t.decider_loser_player_id,
        "decider_winner_goals": t.decider_winner_goals,
        "decider_loser_goals": t.decider_loser_goals,
    }

def _reassign_blocked_message(started: list[Match]) -> str:
    """Name the matches that stand in the way, and why it matters.

    The old message ("results were stored") was true and useless: it named neither which
    match nor what re-assign would have done to it.
    """
    ordered = sorted(started, key=lambda m: (int(m.order_index), int(m.id or 0)))
    named = [f"Match {int(m.order_index) + 1} is {m.state}" for m in ordered[:3]]
    which = ", ".join(named)
    rest = len(ordered) - len(named)
    if rest > 0:
        which += f" and {rest} more"
    return (
        "Re-assign draws a completely new schedule, so every match has to be back at "
        f"scheduled first — {which}. Reset the played ones, or keep this schedule."
    )


def _reassign_preview_counts(s: Session, tournament_id: int, matches: list[Match]) -> dict:
    """What re-assign would clear, so the UI can name it before asking (Q5)."""
    match_ids = [int(m.id) for m in matches]
    return {
        "matches": len(matches),
        "matches_with_score": sum(1 for m in matches if any((side.goals or 0) != 0 for side in m.sides)),
        "matches_with_club": sum(1 for m in matches if any(side.club_id is not None for side in m.sides)),
        "comments": len(match_comment_ids(s, tournament_id, match_ids)),
    }


def _tournament_matches(s: Session, tournament_id: int) -> list[Match]:
    return list(
        s.exec(
            select(Match)
            .options(selectinload(Match.sides))
            .where(Match.tournament_id == tournament_id)
            .order_by(Match.order_index)
        ).all()
    )


@router.get("/{tournament_id}/reassign-preview", response_model=ReassignPreviewOut, dependencies=[Depends(require_editor)])
def reassign_2v2_preview(
    tournament_id: int,
    s: Session = Depends(get_session),
):
    """Counts for the re-assign confirmation: what it clears and how many comments go.

    The frontend renders the dialog from these numbers instead of re-deriving which
    comments a rebuild takes with it — the same split of responsibility as A10's
    `can_edit` flags.
    """
    get_or_404(s, Tournament, tournament_id, name="Tournament")
    return _reassign_preview_counts(s, tournament_id, _tournament_matches(s, tournament_id))


@router.post("/{tournament_id}/reassign", response_model=ReassignResultOut, dependencies=[Depends(require_editor)])
async def reassign_2v2(
    tournament_id: int,
    request: Request,
    body: TournamentReassignBody | None = None,
    s: Session = Depends(get_session),
    role: str = Depends(require_editor),
):
    """
    Re-create match combinations for NON-deterministic schedules.

    Only allowed for 2v2 (pairings/opponents are not uniquely determined).
    Safety:
      - only when ALL matches are still scheduled. A playing or finished match is a real
        result, and re-assigning would throw a played evening away.
      - leftovers are NOT a refusal (Q5): goals, clubs and timestamps left on scheduled
        matches are cleared, because the schedule is rebuilt from scratch anyway. Refusing
        on them used to freeze a tournament for good — reset put a match back to scheduled
        but left its score behind, and nothing could remove a club.
      - the comments filed under the old matches go with them (see `comment_cleanup`);
        the tournament-wide ones stay.
      - editor/admin only
      - preserves "second leg enabled" flag: if leg2 existed before, it is recreated to match new leg1

    body (optional):
      { "randomize_order": true|false }
    """
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")

    if t.mode != "2v2":
        conflict("Re-assign is only supported for 2v2 tournaments")

    # Must have an existing schedule
    matches = _tournament_matches(s, tournament_id)
    if not matches:
        conflict("No schedule exists yet (generate schedule first)")

    # Safety: a played match is the one thing re-assign must not throw away. Leftover
    # goals/clubs on a scheduled match are not results and never block (Q5).
    started = [m for m in matches if m.state != "scheduled"]
    if started:
        conflict(_reassign_blocked_message(started))

    had_leg2 = any(m.leg == 2 for m in matches)
    randomize_order = bool(body.randomize_order) if body is not None else True

    # validate player count for 2v2
    _ = t.players
    player_names = [p.display_name for p in t.players]
    if not (4 <= len(player_names) <= 6):
        bad_request("2v2 supports 4–6 players (adjustable)")

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
    s.flush()

    # Compute 2v2 matchups
    try:
        label_matches = schedule_2v2_labels(labels)
    except ValueError as e:
        bad_request(str(e))

    if randomize_order:
        random.shuffle(label_matches)

    # Delete old schedule (both legs, if present). Every match id dies with it, so the
    # comments filed under those matches go too — `_bulk_delete_matches` does that, and
    # the tournament-wide ones are left alone.
    deletion = _delete_schedule(s, tournament_id, autocommit=False)

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
            autocommit=False,
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
                autocommit=False,
            )
            idx += 1

    # Sync status (after reassign everything is scheduled => draft)
    s.flush()
    t = get_or_404(s, Tournament, tournament_id, name="Tournament")
    t.status = compute_status_for_tournament(s, tournament_id)
    t.updated_at = datetime.utcnow()
    s.add(t)
    s.commit()

    await _finish_match_deletion(tournament_id, deletion)
    await broadcast_tournament(s, tournament_id, reason="schedule", global_action="updated")
    # Always 0 — re-assign refuses for exactly one reason, a match that is not scheduled.
    # The guard is the proof of that, not a comment claiming it (M2).
    if deletion.finished:
        after_result_change(request, s, tournament_id=tournament_id, reason="reassign")
    log.info(
        "2v2 reassign: tournament_id=%s matches=%s had_leg2=%s comments_deleted=%s by=%s",
        tournament_id, len(label_matches), had_leg2, len(deletion.comment_ids), role
    )
    return {"ok": True, "matches": len(label_matches), "second_leg": had_leg2, "status": t.status}
