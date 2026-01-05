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



Pair = Tuple[str, str]
Match2v2 = Tuple[Pair, Pair]

def _pair(a: str, b: str) -> Pair:
    return tuple(sorted((a, b)))

def _players_in_match(m: Match2v2) -> List[str]:
    (a1,a2),(b1,b2) = m
    return [a1,a2,b1,b2]

def _teammate_counts(matches: List[Match2v2]) -> Dict[Pair, int]:
    tc: Dict[Pair, int] = {}
    for p, q in matches:
        tc[p] = tc.get(p, 0) + 1
        tc[q] = tc.get(q, 0) + 1
    return tc

def _opponent_counts(matches: List[Match2v2]) -> Dict[Pair, int]:
    """
    Count unordered opponent-pairs.
    If teams are (a1,a2) vs (b1,b2), the opponent pairs are:
      (a1,b1), (a1,b2), (a2,b1), (a2,b2)
    """
    oc: Dict[Pair, int] = {}
    for (a1,a2), (b1,b2) in matches:
        for x in (a1,a2):
            for y in (b1,b2):
                k = _pair(x, y)
                oc[k] = oc.get(k, 0) + 1
    return oc

def _match_counts(players: List[str], matches: List[Match2v2]) -> Dict[str, int]:
    mc = {p: 0 for p in players}
    for m in matches:
        for p in _players_in_match(m):
            mc[p] += 1
    return mc

def _candidate_splits_of_4(ps: List[str]) -> List[Match2v2]:
    """
    For 4 players a,b,c,d there are exactly 3 disjoint pairings:
      (ab vs cd), (ac vs bd), (ad vs bc)
    """
    a,b,c,d = ps
    return [
        (_pair(a,b), _pair(c,d)),
        (_pair(a,c), _pair(b,d)),
        (_pair(a,d), _pair(b,c)),
    ]

def _score_added_match(
    players: List[str],
    base: List[Match2v2],
    add: Match2v2
) -> Tuple[int, int, int, int]:
    """
    Lexicographic score (smaller is better):
      1) max teammate pair count after adding (prefer <=2)
      2) number of teammate pairs that are repeated (count==2) after adding
      3) opponent imbalance range: max(opponent)-min(opponent) across all 15 pairs
      4) opponent squared error around ideal 36/15=2.4 (lower is better)
    """
    all_pairs = [_pair(x,y) for x,y in combinations(players, 2)]

    tc = _teammate_counts(base)
    oc = _opponent_counts(base)

    # apply add
    (p, q) = add
    tc[p] = tc.get(p, 0) + 1
    tc[q] = tc.get(q, 0) + 1

    (a1,a2),(b1,b2) = add
    for x in (a1,a2):
        for y in (b1,b2):
            k = _pair(x,y)
            oc[k] = oc.get(k, 0) + 1

    max_team = max(tc.get(pp, 0) for pp in all_pairs)
    repeated_team_pairs = sum(1 for pp in all_pairs if tc.get(pp, 0) == 2)

    # opponent distribution (should be 2 or 3 ideally)
    opp_vals = [oc.get(pp, 0) for pp in all_pairs]
    opp_range = max(opp_vals) - min(opp_vals)

    ideal = 36 / 15  # 2.4
    opp_sse = int(round(sum((v - ideal) ** 2 for v in opp_vals) * 1000))

    return (max_team, repeated_team_pairs, opp_range, opp_sse)

def add_9th_match_balanced(labels: List[str], matches8: List[Match2v2]) -> List[Match2v2]:
    """
    Assumes matches8 is already a good n=6 schedule with counts 5,5,5,5,6,6.
    Adds a 9th match among the four 5-match players, choosing the split that
    best balances opponent pairings and avoids extra teammate repeats.
    """
    players = list(labels)
    mc = _match_counts(players, matches8)

    lows = [p for p, c in mc.items() if c == min(mc.values())]
    if len(lows) != 4 or sorted(mc.values()) != [5,5,5,5,6,6]:
        raise ValueError(f"Expected 5/6 distribution before adding 9th match, got {sorted(mc.values())}")

    candidates = _candidate_splits_of_4(lows)

    best = min(candidates, key=lambda m: _score_added_match(players, matches8, m))
    return matches8 + [best]


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

        matches = add_9th_match_balanced(labels, matches)
        return matches

    return matches
