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
            {
                "key": "h2h",
                "name": "Head-to-Head",
                "version": 1,
                "description": "Rivalries (1v1/2v2/all) + best teammates (2v2).",
            },
            {
                "key": "streaks",
                "name": "Streaks",
                "version": 1,
                "description": "Win/unbeaten + scoring/clean-sheet streaks (records + current).",
            },
            {
                "key": "ratings",
                "name": "Ratings",
                "version": 1,
                "description": "Elo-like ladder per mode (overall/1v1/2v2).",
            },
            # future: h2h, streaks, seasons, cups, clubs, etc.
        ]
    }
