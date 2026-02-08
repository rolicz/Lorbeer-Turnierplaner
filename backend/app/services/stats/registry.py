from __future__ import annotations

from typing import Any


def stats_overview() -> dict[str, Any]:
    """
    Small, additive endpoint response to help the frontend discover what the backend
    can provide without hard-coding all future stats blocks up front.
    """
    return {
        "blocks": [
            {
                "key": "players",
                "name": "Players",
                "version": 1,
                "description": "Leaderboard + form + per-tournament positions.",
            },
            # future: h2h, streaks, seasons, cups, clubs, etc.
        ]
    }

