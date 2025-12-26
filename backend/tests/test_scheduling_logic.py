from itertools import combinations
from app.scheduling import schedule_1v1_labels, schedule_2v2_labels


def test_1v1_labels_count():
    labels = ["A", "B", "C", "D", "E"]
    matches = schedule_1v1_labels(labels)
    assert len(matches) == 10  # 5 choose 2

    seen = set()
    for a, b in matches:
        assert len(a) == 1 and len(b) == 1
        pair = tuple(sorted((a[0], b[0])))
        seen.add(pair)
    assert seen == set(combinations(labels, 2))


def test_2v2_4_players_covers_all_partnerships_once():
    labels = ["A", "B", "C", "D"]
    matches = schedule_2v2_labels(labels)

    # 4 players => 6 partnerships => 3 matches (each match uses 2 partnerships)
    assert len(matches) == 3

    partnerships = [tuple(sorted(p)) for p in combinations(labels, 2)]
    counts = {p: 0 for p in partnerships}

    for (p1, p2) in matches:
        assert set(p1).isdisjoint(set(p2))
        counts[tuple(sorted(p1))] += 1
        counts[tuple(sorted(p2))] += 1

    assert all(v == 1 for v in counts.values())


def test_2v2_6_players_has_one_repeat_minimum():
    labels = ["A", "B", "C", "D", "E", "F"]
    matches = schedule_2v2_labels(labels)

    # 6 players => 15 partnerships (odd) => need 8 matches (16 partnership-slots)
    assert len(matches) == 8

    partnerships = [tuple(sorted(p)) for p in combinations(labels, 2)]
    counts = {p: 0 for p in partnerships}

    for (p1, p2) in matches:
        assert set(p1).isdisjoint(set(p2))
        counts[tuple(sorted(p1))] += 1
        counts[tuple(sorted(p2))] += 1

    # all partnerships appear at least once
    assert all(v >= 1 for v in counts.values())

    # exactly one partnership repeats (total slots 16; unique 15 => one repeats)
    repeated = [p for p, v in counts.items() if v == 2]
    assert len(repeated) == 1
