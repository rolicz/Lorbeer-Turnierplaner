def match_signature(match: dict) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """
    Orientation matters: (teamA ids, teamB ids), each sorted.
    """
    sides = {s["side"]: s for s in match["sides"]}
    a_ids = tuple(sorted(p["id"] for p in sides["A"]["players"]))
    b_ids = tuple(sorted(p["id"] for p in sides["B"]["players"]))
    return (a_ids, b_ids)


def matches_by_leg(tournament: dict, leg: int) -> list[dict]:
    return [m for m in tournament["matches"] if m.get("leg") == leg]
