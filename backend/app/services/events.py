"""
Websocket broadcast helpers (optimistic-push model).

Tournament channel (/ws/tournaments/{tid}):
  - tournament.sync   {tournament_id, reason, tournament}  full serialized state
  - tournament.deleted{tournament_id}
  - comment.upsert    {tournament_id, comment}             client merges (keeps votes)
  - comment.delete    {tournament_id, comment_id}
  - comment.meta      {tournament_id, action, comment_id}  vote/pin/read -> narrow refetch

Global channel (/ws/tournaments):
  - tournaments.changed {action, tournament_id?, status?}  list/live/stats/cup (low frequency)
    `action="comment"` is the one that does NOT touch the list: it exists so the
    tournaments list can move its unread badge when a comment is written or removed.
    `action="result"` is the opposite: a score/side correction on a tournament that is
    already done. It changes no status, so nothing used to announce it, and the list's
    winner, the cup owner and every stat could stay wrong on every other device (Q9).

Profile channel (/ws/players/{player_id}), broadcast from routers/players.py:
  - player:pokes:update     {player_id, action, ...}
  - player:guestbook:update {player_id, action, entry_id}  created/updated/voted/deleted

Pushing the full tournament on the per-tournament channel lets clients replace
the `tournament(tid)` cache wholesale (identical to the GET shape), avoiding
partial-merge bugs. The global channel stays coarse and low-frequency so a goal
never triggers a stats/cup refetch storm across all clients.
"""
from __future__ import annotations

from sqlmodel import Session

from ..models import Tournament
from ..ws import ws_manager, ws_manager_update_tournaments
from .tournament_view import serialize_tournament

# ---- event name constants (mirror of frontend/src/hooks/realtime/wsEvents.ts) ----
TOURNAMENT_SYNC = "tournament.sync"
TOURNAMENT_DELETED = "tournament.deleted"
COMMENT_UPSERT = "comment.upsert"
COMMENT_DELETE = "comment.delete"
COMMENT_META = "comment.meta"
TOURNAMENTS_CHANGED = "tournaments.changed"


async def push_tournament(s: Session, t: Tournament, *, reason: str) -> None:
    data = serialize_tournament(s, t)
    await ws_manager.broadcast(
        int(t.id),
        TOURNAMENT_SYNC,
        {"tournament_id": int(t.id), "reason": reason, "tournament": data},
    )


def global_action_for_match_change(status_before: str, status_after: str) -> str | None:
    """
    What a match edit owes the global channel.

    A state transition moved the tournament between draft/live/done -> "status".
    A goals/clubs/side edit on a tournament that is *already done* is a correction to a
    real result: it moves the list's winner, the cup owner and every stat, and nothing
    else would ever announce it -> "result".

    Everything else -- a goal in a live match, a club picked in a draft -- stays off the
    global channel, which is deliberately coarse and low-frequency so a goal never
    triggers a stats/cup refetch storm across all clients.
    """
    if status_before != status_after:
        return "status"
    return "result" if status_after == "done" else None


async def notify_tournaments_changed(
    *, action: str, tournament_id: int | None = None, status: str | None = None
) -> None:
    payload: dict = {"action": action}
    if tournament_id is not None:
        payload["tournament_id"] = int(tournament_id)
    if status is not None:
        payload["status"] = status
    await ws_manager_update_tournaments.broadcast(TOURNAMENTS_CHANGED, payload)


async def broadcast_tournament(
    s: Session,
    tournament_id: int,
    *,
    reason: str,
    global_action: str | None = None,
    status: str | None = None,
) -> None:
    """
    After a mutation: push the full tournament to its channel, and optionally a
    coarse global notification when list membership / live status changed.
    """
    t = s.get(Tournament, tournament_id)
    if t is not None:
        await push_tournament(s, t, reason=reason)
    if global_action is not None:
        await notify_tournaments_changed(action=global_action, tournament_id=tournament_id, status=status)


async def broadcast_tournament_deleted(tournament_id: int) -> None:
    await ws_manager.broadcast(
        int(tournament_id), TOURNAMENT_DELETED, {"tournament_id": int(tournament_id)}
    )
    await notify_tournaments_changed(action="deleted", tournament_id=tournament_id)


async def push_comment_upsert(tournament_id: int, comment: dict) -> None:
    await ws_manager.broadcast(
        int(tournament_id),
        COMMENT_UPSERT,
        {"tournament_id": int(tournament_id), "comment": comment},
    )


async def push_comment_deleted(tournament_id: int, comment_id: int) -> None:
    await ws_manager.broadcast(
        int(tournament_id),
        COMMENT_DELETE,
        {"tournament_id": int(tournament_id), "comment_id": int(comment_id)},
    )


async def push_comment_meta(tournament_id: int, *, action: str, comment_id: int | None = None) -> None:
    await ws_manager.broadcast(
        int(tournament_id),
        COMMENT_META,
        {"tournament_id": int(tournament_id), "action": action, "comment_id": comment_id},
    )
