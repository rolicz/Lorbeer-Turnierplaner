# Re-export shim — computation lives in services/stats/core.py.
from .services.stats.core import (  # noqa: F401
    compute_overall_and_lastN,
    compute_player_standings,
    compute_points_table_finished,
    iter_finished_match_goals,
    iter_finished_match_points,
    positions_from_standings,
    top_group,
    unique_winner_player_id,
)
