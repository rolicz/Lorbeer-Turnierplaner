from datetime import date
from types import SimpleNamespace

import pytest
from sqlmodel import Session

from app.cup_defs import CupDef, CupEra, load_cup_defs
from app.db import get_engine
from app.models import Tournament
from app.services.cup import (
    compute_cup,
    compute_cup_tournament_stakes,
    tournament_qualifies,
)
from tests.conftest import create_player, create_tournament, generate

BOUNDARY = "2026-07-12"


def _finish_tournament_with_winner(client, editor_headers, tournament_id: int, winner_id: int) -> None:
    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200, detail.text
    for match in detail.json()["matches"]:
        side_a_ids = {int(p["id"]) for p in match["sides"][0]["players"]}
        side_b_ids = {int(p["id"]) for p in match["sides"][1]["players"]}
        if winner_id in side_a_ids:
            goals_a, goals_b = 1, 0
        elif winner_id in side_b_ids:
            goals_a, goals_b = 0, 1
        else:
            goals_a, goals_b = 0, 0
        res = client.patch(
            f"/matches/{match['id']}",
            json={"state": "finished", "sideA": {"goals": goals_a}, "sideB": {"goals": goals_b}},
            headers=editor_headers,
        )
        assert res.status_code == 200, res.text


def _make_done_tournament(
    client, editor_headers, name, player_ids, winner_id, *, date_str: str, mode: str
) -> int:
    """Create a completed 1v1 round-robin with a unique winner, then override its
    stored date and mode directly (era qualification only reads `t.date`/`t.mode`,
    so this keeps the winner deterministic without 2v2 generation complexity)."""
    tid = create_tournament(client, editor_headers, name, "1v1", player_ids)
    generate(client, editor_headers, tid, randomize=False)
    _finish_tournament_with_winner(client, editor_headers, tid, winner_id)
    with Session(get_engine()) as s:
        t = s.get(Tournament, tid)
        t.date = date.fromisoformat(date_str)
        t.mode = mode
        s.add(t)
        s.commit()
    return tid


def test_tournament_qualifies_predicate():
    cup = CupDef(
        key="c",
        name="C",
        since_date=date(2026, 1, 5),
        eras=[CupEra(since=date(2026, 7, 12), mode="1v1")],
    )
    # before since_date -> excluded regardless of mode
    assert not tournament_qualifies(SimpleNamespace(date=date(2026, 1, 1), mode="1v1"), cup)
    # after since_date but before the first era -> implicit "any"
    assert tournament_qualifies(SimpleNamespace(date=date(2026, 2, 1), mode="2v2"), cup)
    # on/after the era boundary, matching mode -> qualifies
    assert tournament_qualifies(SimpleNamespace(date=date(2026, 7, 12), mode="1v1"), cup)
    # after the era boundary, wrong mode -> excluded
    assert not tournament_qualifies(SimpleNamespace(date=date(2026, 8, 1), mode="2v2"), cup)
    # no cup config -> everything qualifies
    assert tournament_qualifies(SimpleNamespace(date=date(2020, 1, 1), mode="2v2"), None)


def test_no_eras_regression(client, editor_headers, admin_headers):
    """Without eras, every mode counts (today's behaviour) — a 2v2 win transfers."""
    owner = create_player(client, admin_headers, "EraOwner")
    a = create_player(client, admin_headers, "EraA")
    challenger = create_player(client, admin_headers, "EraChallenger")

    t1 = _make_done_tournament(
        client, editor_headers, "acquire", [owner, a, challenger], owner,
        date_str="2026-06-01", mode="2v2",
    )
    t2 = _make_done_tournament(
        client, editor_headers, "transfer", [owner, a, challenger], challenger,
        date_str="2026-08-01", mode="2v2",
    )

    cup = CupDef(key="default", name="Cup", since_date=None, eras=[])
    with Session(get_engine()) as s:
        res = compute_cup(s, cup=cup)

    assert res.owner_id == challenger
    hist_tids = [h.tournament_id for h in res.history]
    # 2v2 transfer counts when there are no eras
    assert t1 in hist_tids and t2 in hist_tids


def test_era_boundary_owner_carries(client, editor_headers, admin_headers):
    owner = create_player(client, admin_headers, "BOwner")
    a = create_player(client, admin_headers, "BA")
    b = create_player(client, admin_headers, "BB")
    challenger = create_player(client, admin_headers, "BChallenger")

    # Owner acquires via a 2v2 tournament BEFORE the boundary (era-less -> "any").
    t1 = _make_done_tournament(
        client, editor_headers, "pre-boundary 2v2", [owner, a, challenger], owner,
        date_str="2026-06-01", mode="2v2",
    )
    # A 2v2 AFTER the boundary must NOT move the cup (era says 1v1-only).
    t2 = _make_done_tournament(
        client, editor_headers, "post-boundary 2v2", [owner, challenger, a], challenger,
        date_str="2026-08-01", mode="2v2",
    )
    # A 1v1 AFTER the boundary transfers normally.
    t3 = _make_done_tournament(
        client, editor_headers, "post-boundary 1v1", [owner, challenger, b], challenger,
        date_str="2026-09-01", mode="1v1",
    )

    cup = CupDef(
        key="default", name="Cup", since_date=None,
        eras=[CupEra(since=date.fromisoformat(BOUNDARY), mode="1v1")],
    )
    with Session(get_engine()) as s:
        res = compute_cup(s, cup=cup)

    assert res.owner_id == challenger
    hist_tids = [h.tournament_id for h in res.history]
    # acquire at t1 and transfer at t3, but the non-qualifying 2v2 (t2) is invisible.
    assert t1 in hist_tids
    assert t3 in hist_tids
    assert t2 not in hist_tids


def test_stakes_skip_nonqualifying(client, editor_headers, admin_headers):
    owner = create_player(client, admin_headers, "SOwner")
    a = create_player(client, admin_headers, "SA")
    challenger = create_player(client, admin_headers, "SChallenger")

    t1 = _make_done_tournament(
        client, editor_headers, "stake acquire", [owner, a, challenger], owner,
        date_str="2026-06-01", mode="1v1",
    )
    # Owner participates in this 2v2 after the boundary -> would normally be "at stake",
    # but the era scopes 1v1 only, so it must produce no stake entry.
    t2 = _make_done_tournament(
        client, editor_headers, "stake non-qualifying", [owner, challenger, a], challenger,
        date_str="2026-08-01", mode="2v2",
    )

    cup = CupDef(
        key="default", name="Cup", since_date=None,
        eras=[CupEra(since=date.fromisoformat(BOUNDARY), mode="1v1")],
    )
    with Session(get_engine()) as s:
        stakes = compute_cup_tournament_stakes(s, cup_key="default", cup_name="Cup", cup=cup)

    stake_tids = {st.tournament_id for st in stakes}
    assert t1 in stake_tids
    assert t2 not in stake_tids


def test_load_cup_defs_validates_eras(tmp_path, monkeypatch):
    import json

    # duplicate `since` per cup is rejected
    dup = tmp_path / "dup.json"
    dup.write_text(json.dumps({"cups": [{"key": "default", "name": "C", "eras": [
        {"since": "2026-01-01", "mode": "1v1"},
        {"since": "2026-01-01", "mode": "2v2"},
    ]}]}))
    monkeypatch.setenv("CUPS_CONFIG_PATH", str(dup))
    with pytest.raises(ValueError):
        load_cup_defs()

    # invalid mode is rejected
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"cups": [{"key": "default", "name": "C", "eras": [
        {"since": "2026-01-01", "mode": "3v3"},
    ]}]}))
    monkeypatch.setenv("CUPS_CONFIG_PATH", str(bad))
    with pytest.raises(ValueError):
        load_cup_defs()

    # valid eras are parsed and sorted by `since`
    ok = tmp_path / "ok.json"
    ok.write_text(json.dumps({"cups": [{"key": "default", "name": "C", "eras": [
        {"since": "2026-07-12", "mode": "1v1"},
        {"since": "2026-01-01", "mode": "any"},
    ]}]}))
    monkeypatch.setenv("CUPS_CONFIG_PATH", str(ok))
    defs = load_cup_defs()
    default = next(d for d in defs if d.key == "default")
    assert [e.since.isoformat() for e in default.eras] == ["2026-01-01", "2026-07-12"]
    assert default.active_era_mode(date(2026, 3, 1)) == "any"
    assert default.active_era_mode(date(2026, 8, 1)) == "1v1"
    assert default.active_era_mode(date(2025, 1, 1)) == "any"
