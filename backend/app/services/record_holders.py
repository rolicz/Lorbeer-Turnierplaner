"""Who held what last time, what moved since, and who is told about it (M2).

Every record the app shows is computed live (`services/stats/records.py`); nothing in
this app ever *stored* a ranking. That is fine for drawing a page and useless for
"Rumpi took it from you", which needs a previous answer to diff against. So this module
owns two tables — `RecordHolder` (who held what) and `RecordKeyState` (which keys have
been computed at least once) — and it is the only module that writes or reads them.

**One function, called by every path that changes a result.** `after_result_change` is
that function. A hook sprinkled across eight routers rots: one of them gets a new branch,
the branch forgets the hook, and a record quietly stops moving for months (`Q9` is the
same failure with a websocket action — a corrected result on a finished tournament used
to be broadcast to nobody, so every other device stayed wrong indefinitely). The list of
callers is in `FEATURES_2026-09-badges.md` §8 and `tests/test_record_holders.py` walks it.

**Seeding is silent, and that is what `RecordKeyState` is for.** A key with no state row
has never been computed: the first boot on production, and every record kind added in a
later deploy. Storing its holders must announce nothing, or the deploy pushes sixteen
records times six players in one go. A key *with* a state row and no holder rows means
nobody holds it — a real answer, not a missing one.

**Scope is fixed.** Every badge and every push is `mode=overall`, `source=tournaments`
(Roli: never friendlies). The two constants below are the only place that is written.
"""
from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass

from fastapi import Request
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from ..models import RecordHolder, RecordKeyState
from .stats.records import RECORD_DEFS, RECORD_KEYS, compute_stats_records

log = logging.getLogger(__name__)

#: The badge's scope, fixed (Roli 2026-09-19): every badge, no exceptions, never friendlies.
BADGE_MODE = "overall"
BADGE_SCOPE = "tournaments"


@dataclass(frozen=True)
class RecordMove:
    """One record that changed hands: who took it, who lost it, who holds it now.

    `gained` and `lost` are disjoint by construction (set difference), and `holders` is
    the full live set — the three audiences a push needs, and nothing a caller has to
    re-derive.
    """

    key: str
    label: str
    path: str
    gained: tuple[int, ...]
    lost: tuple[int, ...]
    holders: tuple[int, ...]


def live_holders(s: Session) -> dict[str, tuple[frozenset[int], str, str]]:
    """`key -> (holder ids, label, path)` from the one live computation.

    It reads `compute_stats_records(BADGE_MODE, BADGE_SCOPE)` and nothing else, so the
    holders this module diffs are literally the holders the profile band and the Records
    page draw. A second ranking here is how a push and a badge come to disagree.
    """
    payload = compute_stats_records(s, mode=BADGE_MODE, scope=BADGE_SCOPE)
    out: dict[str, tuple[frozenset[int], str, str]] = {}
    for entry in payload.get("records") or []:
        key = str(entry.get("key") or "")
        if not key:
            continue
        ids = frozenset(int(h["player"]["id"]) for h in entry.get("holders") or [])
        out[key] = (ids, str(entry.get("label") or key), str(entry.get("path") or "/stats"))
    # A record the registry names but the payload skipped would silently stop moving.
    for d in RECORD_DEFS:
        out.setdefault(d.key, (frozenset(), d.label, "/stats"))
    return out


def _stored_holders(s: Session) -> dict[str, set[int]]:
    stored: dict[str, set[int]] = {}
    for row in s.exec(select(RecordHolder)).all():
        stored.setdefault(str(row.record_key), set()).add(int(row.player_id))
    return stored


def reconcile_record_holders(s: Session, *, now: dt.datetime | None = None) -> list[RecordMove]:
    """Compare the live holders with the stored ones, store the live ones, return what moved.

    A key without a `RecordKeyState` row is stored and **not** reported — that is the
    seeding rule, and it is the difference between "nobody has ever computed this" and
    "genuinely nobody holds it".

    **This commits**, which is the one documented exception to "routers own the
    transaction" (`_bulk_delete_matches(autocommit=True)` is the precedent): it runs
    *after* the result's own commit, and an unrelated later failure in the same request
    must not roll the holder table back out of step with the results it describes.
    """
    moment = now or dt.datetime.utcnow()
    live = live_holders(s)
    stored = _stored_holders(s)
    state_rows = {str(r.record_key): r for r in s.exec(select(RecordKeyState)).all()}

    moves: list[RecordMove] = []
    for key in RECORD_KEYS:
        live_ids, label, path = live[key]
        stored_ids = stored.get(key, set())
        gained = sorted(live_ids - stored_ids)
        lost = sorted(stored_ids - live_ids)

        for pid in lost:
            row = s.get(RecordHolder, (key, int(pid)))
            if row is not None:
                s.delete(row)
        for pid in gained:
            s.add(RecordHolder(record_key=key, player_id=int(pid), since=moment))

        state = state_rows.get(key)
        first_time = state is None
        if state is None:
            state = RecordKeyState(record_key=key)
        state.computed_at = moment
        state.holder_count = len(live_ids)
        s.add(state)

        # Seeding announces nothing: a key nobody has ever computed has no "before".
        if not first_time and (gained or lost):
            moves.append(
                RecordMove(
                    key=key,
                    label=label,
                    path=path,
                    gained=tuple(int(p) for p in gained),
                    lost=tuple(int(p) for p in lost),
                    holders=tuple(sorted(int(p) for p in live_ids)),
                )
            )

    s.commit()
    return moves


def backfill_record_holders(engine: Engine) -> int:
    """`init_db()` hook: reconcile once at startup, silently for keys never computed.

    Returns how many keys were seeded — 0 on a database that already has every state
    row, which is every boot after the first. Idempotent: reconciling twice in a row
    writes the same rows and reports nothing the second time.

    **A boot never pushes**, even when it finds real movement. It can't: `init_db()` runs
    before the dispatcher exists (`main.py`'s lifespan starts it afterwards). It also
    shouldn't — the only way a boot finds movement is that results were written by code
    that does not reconcile (a rollback to a build before M2, or `manage.py` on a
    stopped server), and announcing that backlog would make a deploy buzz everybody at
    once. So the drift is absorbed and *logged*, which is what an operator needs.
    """
    with Session(engine) as s:
        known = {str(k) for k in s.exec(select(RecordKeyState.record_key)).all()}
        seeded = len([k for k in RECORD_KEYS if k not in known])
        moves = reconcile_record_holders(s)
    if moves:
        log.info(
            "Record holders reconciled at startup: %s moved (%s) — absorbed, not announced",
            len(moves),
            ", ".join(m.key for m in moves),
        )
    return seeded


def after_result_change(
    request: Request | None,
    s: Session,
    *,
    tournament_id: int | None,
    reason: str,
) -> list[RecordMove]:
    """**The** function every result-changing path calls: reconcile, push, log.

    `request=None` is the CLI (`manage.py add-match`): there is no app state and so no
    dispatcher, the holders are still brought up to date, and nobody is pushed.
    """
    moves = reconcile_record_holders(s)
    if not moves:
        return []

    queued = 0
    if request is not None:
        from .notifications import push_record_moves

        queued = push_record_moves(request, s, moves)

    for move in moves:
        log.info(
            "Record moved: %s reason=%s tournament_id=%s gained=%s lost=%s holders=%s",
            move.key,
            reason,
            tournament_id,
            list(move.gained),
            list(move.lost),
            list(move.holders),
        )
    if queued:
        log.info("Record moves pushed: moves=%s messages=%s", len(moves), queued)
    return moves
