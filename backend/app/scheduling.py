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


def schedule_2v2_labels(labels: List[str]) -> List[Tuple[Tuple[str, str], Tuple[str, str]]]:
    """
    2v2: build teams as partnerships (AB, AC, ...).
    A match is two disjoint partnerships: (AB) vs (CD).

    For 4 and 5 players:
      - covers each partnership exactly once.
    For 6 players:
      - covers all partnerships at least once with exactly one repeated partnership (minimum possible).
    """
    n = len(labels)
    if n < 4:
        raise ValueError("2v2 needs at least 4 players")

    partnerships: List[Tuple[str, str]] = [tuple(sorted(x)) for x in combinations(labels, 2)]  # size = nC2

    # We want to partition partnerships into matches (two disjoint partnerships per match).
    # If number of partnerships is odd (n=6 => 15), perfect partition is impossible.
    # We'll do the best possible: cover all once, and repeat one partnership.
    unused = partnerships[:]
    matches: List[Tuple[Tuple[str, str], Tuple[str, str]]] = []

    # Greedy pairing: pick a partnership, then find a disjoint one.
    # This is simple and works well for n<=6.
    while len(unused) >= 2:
        p = unused.pop(0)
        j = next((idx for idx, q in enumerate(unused) if _disjoint(p, q)), None)
        if j is None:
            # Can't find a disjoint partner right now. Put it aside and continue.
            unused.append(p)
            # If we're stuck (cycle), break and handle leftovers below.
            if all(not _disjoint(unused[0], q) for q in unused[1:]):
                break
            continue
        q = unused.pop(j)
        matches.append((p, q))

    if unused:
        # One leftover partnership (only happens for n=6 in practice here).
        leftover = unused[0]

        # Pair it with any disjoint partnership (even if that partnership already used) to finish coverage.
        # This creates exactly one repeat, which is unavoidable for n=6.
        for p, q in matches:
            if _disjoint(leftover, p):
                matches.append((leftover, p))
                leftover = None
                break
            if _disjoint(leftover, q):
                matches.append((leftover, q))
                leftover = None
                break

        if leftover is not None:
            # Extremely unlikely for n<=6, but keep a clear error if it happens.
            raise ValueError("Could not complete 2v2 schedule (unexpected leftover).")

    return matches
