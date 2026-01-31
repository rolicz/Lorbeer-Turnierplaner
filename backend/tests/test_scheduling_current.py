from app.scheduling import schedule_2v2_labels


def test_schedule_2v2_lengths():
    assert len(schedule_2v2_labels(["A", "B", "C", "D"])) == 3
    assert len(schedule_2v2_labels(["A", "B", "C", "D", "E"])) == 5
    assert len(schedule_2v2_labels(["A", "B", "C", "D", "E", "F"])) == 9
