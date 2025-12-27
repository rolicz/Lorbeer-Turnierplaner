from __future__ import annotations

from itertools import combinations
from typing import Dict, List, Optional, Tuple


def assign_labels(player_names: List[str], shuffle: bool = True) -> Tuple[List[str], Dict[str, str]]:
    """
    Randomly assigns A,B,C,... to actual player names (or keeps order if shuffle=False).
    Returns:
      labels_in_order: ["A","B","C",...]
      label_to_name: {"A":"Roland", ...}
    """
    names = player_names[:]
    if shuffle:
        import random
        random.shuffle(names)

    labels = [chr(ord("A") + i) for i in range(len(names))]
    label_to_name = {labels[i]: names[i] for i in range(len(names))}
    return labels, label_to_name


def schedule_1v1_labels(labels: List[str]) -> List[Tuple[Tuple[str], Tuple[str]]]:
    """
    1v1: all unordered pairs of labels, as single-player teams:
      A vs B
      A vs C
      ...
      B vs C
      ...
    Returns list of matches:
      [ (("A",), ("B",)), (("A",), ("C",)), ... ]
    """
    return [((a,), (b,)) for a, b in combinations(labels, 2)]


def _disjoint(p1: Tuple[str, str], p2: Tuple[str, str]) -> bool:
    return (p1[0] not in p2) and (p1[1] not in p2)



def _round_robin_pairings(labels: List[str]) -> List[List[Tuple[str, str]]]:
    """
    Circle method 1-factorization.
    Returns rounds; each round is a list of disjoint pairings (2-player partnerships).
    For odd n, a BYE is inserted; pairings involving BYE are dropped.
    """
    players = labels[:]
    bye = "__BYE__"
    if len(players) % 2 == 1:
        players.append(bye)

    n = len(players)
    half = n // 2
    arr = players[:]  # rotating list

    rounds: List[List[Tuple[str, str]]] = []
    for _ in range(n - 1):
        pairs: List[Tuple[str, str]] = []
        for i in range(half):
            a = arr[i]
            b = arr[n - 1 - i]
            if a == bye or b == bye:
                continue
            pairs.append(tuple(sorted((a, b))))
        rounds.append(pairs)

        # rotate all but first element
        arr = [arr[0]] + [arr[-1]] + arr[1:-1]

    return rounds


def _disjoint(p: Tuple[str, str], q: Tuple[str, str]) -> bool:
    return (p[0] not in q) and (p[1] not in q)


def schedule_2v2_labels(labels: List[str]) -> List[Tuple[Tuple[str, str], Tuple[str, str]]]:
    """
    2v2 schedule based on partnerships.

    - n=4: 3 matches, covers each partnership exactly once.
    - n=5: 5 matches, covers each partnership exactly once (perfectly balanced: each player appears 4 times).
    - n=6: 8 matches, covers all partnerships once + exactly one repeated partnership (minimum possible).
    """
    n = len(labels)
    if n < 4:
        raise ValueError("2v2 needs at least 4 players")
    if n > 6:
        raise ValueError("This scheduler currently supports up to 6 players for 2v2.")

    rounds = _round_robin_pairings(labels)

    matches: List[Tuple[Tuple[str, str], Tuple[str, str]]] = []
    leftovers: List[Tuple[str, str]] = []

    for r in rounds:
        if n in (4, 5):
            # For 4: each round has 2 pairings -> one match (two disjoint partnerships).
            # For 5: after BYE drop, each round has 2 pairings -> one match.
            if len(r) != 2:
                raise ValueError(f"Unexpected round size {len(r)} for n={n}: {r}")
            matches.append((r[0], r[1]))
        else:
            # n=6: each round has 3 disjoint pairings.
            # Use 2 of them for a match, keep 1 leftover to pair later.
            if len(r) != 3:
                raise ValueError(f"Unexpected round size {len(r)} for n=6: {r}")
            matches.append((r[0], r[1]))
            leftovers.append(r[2])

    if n == 6:
        # Pair leftovers into additional matches, ensuring disjointness.
        # 5 leftovers -> 2 matches + 1 leftover; the last one gets paired with a repeated disjoint partnership.
        pending = leftovers[:]
        extra: List[Tuple[Tuple[str, str], Tuple[str, str]]] = []

        while len(pending) >= 2:
            p = pending.pop(0)
            j = next((idx for idx, q in enumerate(pending) if _disjoint(p, q)), None)
            if j is None:
                # rotate; should resolve with small n
                pending.append(p)
                # safety: if we're stuck, break
                if len(pending) > 0 and all(not _disjoint(pending[0], q) for q in pending[1:]):
                    break
                continue
            q = pending.pop(j)
            extra.append((p, q))

        if pending:
            # One leftover partnership remains. Pair it with any disjoint partnership (repeat allowed).
            last = pending[0]
            remaining_players = [x for x in labels if x not in last]
            # pick any 2 from remaining players => disjoint partnership
            repeat_partner = tuple(sorted((remaining_players[0], remaining_players[1])))
            extra.append((last, repeat_partner))

        matches.extend(extra)

        # sanity: we should have 8 matches for n=6
        if len(matches) != 8:
            raise ValueError(f"Unexpected match count for n=6: {len(matches)}")

    return matches
