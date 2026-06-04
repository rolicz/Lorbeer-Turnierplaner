"""
Named broadcast helpers that wrap ws_manager calls.

Each function encodes the dual-broadcast pattern (tournament-specific channel
+ global channel) so routers don't need to know about both managers.
"""

from ..ws import ws_manager, ws_manager_update_tournaments


async def broadcast_tournament_created() -> None:
    await ws_manager_update_tournaments.broadcast("tournament_created", {})


async def broadcast_tournament_updated(tournament_id: int) -> None:
    payload = {"tournament_id": tournament_id}
    await ws_manager.broadcast(tournament_id, "tournament_updated", payload)
    await ws_manager_update_tournaments.broadcast("tournament_updated", payload)


async def broadcast_tournament_deleted(tournament_id: int) -> None:
    payload = {"tournament_id": tournament_id}
    await ws_manager.broadcast(tournament_id, "tournament_deleted", payload)
    await ws_manager_update_tournaments.broadcast("tournament_deleted", payload)


async def broadcast_schedule_generated(tournament_id: int) -> None:
    await ws_manager.broadcast(tournament_id, "schedule_generated", {"tournament_id": tournament_id})


async def broadcast_matches_reordered(tournament_id: int) -> None:
    await ws_manager.broadcast(tournament_id, "matches_reordered", {"tournament_id": tournament_id})


async def broadcast_match_patched(tournament_id: int, match_id: int, *, tournament_status: str | None = None) -> None:
    payload: dict = {"tournament_id": tournament_id, "match_id": match_id}
    if tournament_status is not None:
        payload["tournament_status"] = tournament_status
    await ws_manager.broadcast(tournament_id, "match_patched", payload)
    await ws_manager_update_tournaments.broadcast("match_patched", {"tournament_id": tournament_id})


async def broadcast_match_updated(tournament_id: int, match_id: int) -> None:
    await ws_manager.broadcast(tournament_id, "match_updated", {"tournament_id": tournament_id, "match_id": match_id})


async def broadcast_comments_updated(tournament_id: int, comment_id: int | None, *, action: str) -> None:
    await ws_manager.broadcast(
        tournament_id,
        "comments_updated",
        {"tournament_id": tournament_id, "comment_id": comment_id, "action": action},
    )
