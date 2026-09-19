"""M2 — the holder table, the one after-result function, and the push it fires.

The list of result-changing paths in `FEATURES_2026-09-badges.md` §8 is only as good as
the thing that walks it, so this file walks it: every path that can move a record calls
`after_result_change` exactly once, every path that cannot does not call it at all.
"""
import datetime as dt

import pytest
from sqlmodel import Session, select

import app.routers.matches as matches_router
import app.routers.tournaments as tournaments_router
from app.db import get_engine
from app.models import Player, RecordHolder, RecordKeyState
from app.services import record_holders as rh
from app.services.notification_texts import _RECORD_LABELS, supported_notification_languages
from app.services.record_holders import (
    after_result_change,
    reconcile_record_holders,
)
from app.services.stats.records import RECORD_DEFS, RECORD_KEYS, compute_stats_records, record_kind

from .conftest import create_player, create_tournament, generate


class _Recorder:
    """The dispatcher stand-in from `test_ideas.py` — push cannot be delivered here
    (no VAPID, no `cryptography`), so the queue is the observable end of the pipeline."""

    def __init__(self) -> None:
        self.sent: list[tuple[int, object]] = []

    def enqueue(self, message):
        # The tournament's own pushes (match finished, score changed) land here too.
        self.sent.append((-1, message))

    def enqueue_for_player(self, player_id, message):  # pragma: no cover - fallback path
        self.sent.append((int(player_id), message))

    def enqueue_personal_for_player(self, player_id, message):
        self.sent.append((int(player_id), message))

    @property
    def records(self) -> list[tuple[int, object]]:
        return [(pid, m) for pid, m in self.sent if m.event_type == "record_moved"]

    def keys(self) -> set[str]:
        return {str(m.data["record_key"]) for _, m in self.records}

    def for_key(self, key: str) -> list[tuple[int, object]]:
        return [(pid, m) for pid, m in self.records if m.data.get("record_key") == key]


def _recorder(client) -> _Recorder:
    rec = _Recorder()
    client.app.state.push_dispatcher = rec
    return rec


def _session() -> Session:
    return Session(get_engine())


def _finish(client, headers, match_id: int, a: int, b: int) -> None:
    r = client.patch(
        f"/matches/{match_id}",
        json={"state": "finished", "sideA": {"goals": a}, "sideB": {"goals": b}},
        headers=headers,
    )
    assert r.status_code == 200, r.text


def _matches(client, tid: int) -> list[int]:
    return [int(m["id"]) for m in client.get(f"/tournaments/{tid}").json()["matches"]]


def _holders(key: str) -> set[int]:
    with _session() as s:
        return {
            int(r.player_id)
            for r in s.exec(select(RecordHolder).where(RecordHolder.record_key == key)).all()
        }


def _live_holders(key: str) -> set[int]:
    with _session() as s:
        payload = compute_stats_records(s, mode=rh.BADGE_MODE, scope=rh.BADGE_SCOPE)
    entry = next(e for e in payload["records"] if e["key"] == key)
    return {int(h["player"]["id"]) for h in entry["holders"]}


# ---- the tables and the seeding rule ------------------------------------


def test_the_badge_scope_is_fixed_and_named_once(client):
    """Roli: every badge, no exceptions, never friendlies."""
    assert (rh.BADGE_MODE, rh.BADGE_SCOPE) == ("overall", "tournaments")


def test_init_db_seeds_every_key_silently(client):
    """A fresh boot computes all sixteen keys and announces none of them."""
    with _session() as s:
        assert {str(r.record_key) for r in s.exec(select(RecordKeyState)).all()} == set(RECORD_KEYS)
        assert s.exec(select(RecordHolder)).all() == []

    rec = _recorder(client)
    with _session() as s:
        assert reconcile_record_holders(s) == []
    assert rec.records == []


def test_seeding_a_populated_db_announces_nothing(client, editor_headers, admin_headers):
    """The first-deploy case: production already has years of results.

    Without `RecordKeyState` the first reconcile would report sixteen records as
    freshly gained and push sixteen times six notifications in one breath.
    """
    pids = [create_player(client, admin_headers, n) for n in ("SeedA", "SeedB", "SeedC")]
    tid = create_tournament(client, editor_headers, "Seed Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    for mid in _matches(client, tid):
        _finish(client, editor_headers, mid, 3, 1)

    with _session() as s:
        for row in s.exec(select(RecordKeyState)).all():
            s.delete(row)
        for row in s.exec(select(RecordHolder)).all():
            s.delete(row)
        s.commit()

    rec = _recorder(client)
    with _session() as s:
        moves = reconcile_record_holders(s)
    assert moves == []
    assert rec.records == []
    with _session() as s:
        assert {str(r.record_key) for r in s.exec(select(RecordKeyState)).all()} == set(RECORD_KEYS)
        assert s.exec(select(RecordHolder)).all(), "the holders must be stored, just not announced"


def test_a_key_with_a_state_row_and_no_holders_is_a_real_answer(client):
    """"Nobody holds it" is an answer; "nobody has computed it" is not."""
    with _session() as s:
        state = s.get(RecordKeyState, "win_streak")
        assert state is not None and state.holder_count == 0
        assert _holders("win_streak") == set()


def test_reconciling_twice_is_idempotent(client, editor_headers, admin_headers):
    pids = [create_player(client, admin_headers, n) for n in ("IdemA", "IdemB", "IdemC")]
    tid = create_tournament(client, editor_headers, "Idem Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    for mid in _matches(client, tid):
        _finish(client, editor_headers, mid, 2, 0)

    with _session() as s:
        assert reconcile_record_holders(s) == []
    before = {key: _holders(key) for key in RECORD_KEYS}
    with _session() as s:
        assert reconcile_record_holders(s) == []
    assert {key: _holders(key) for key in RECORD_KEYS} == before


def test_the_stored_holders_are_the_live_ones(client, editor_headers, admin_headers):
    """The diff base must be the same answer the badge and the Records page draw."""
    pids = [create_player(client, admin_headers, n) for n in ("MirrorA", "MirrorB", "MirrorC")]
    tid = create_tournament(client, editor_headers, "Mirror Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    for i, mid in enumerate(_matches(client, tid)):
        _finish(client, editor_headers, mid, 3 + i, i)

    for key in RECORD_KEYS:
        assert _holders(key) == _live_holders(key), key


# ---- the push -----------------------------------------------------------


def test_the_first_result_notifies_every_player_with_the_right_text(client, editor_headers, admin_headers):
    """One notification per player per record moved — gainer, loser and everyone watching."""
    pids = [create_player(client, admin_headers, n) for n in ("PushA", "PushB", "PushC")]
    tid = create_tournament(client, editor_headers, "Push Cup", "1v1", pids)
    generate(client, editor_headers, tid)

    with _session() as s:
        everyone = sorted(int(p) for p in s.exec(select(Player.id)).all())
    assert len(everyone) == 6  # three accounts + three created above

    rec = _recorder(client)
    mid = _matches(client, tid)[0]
    detail = client.get(f"/tournaments/{tid}").json()
    first = next(m for m in detail["matches"] if int(m["id"]) == mid)
    sides = {sd["side"]: [int(p["id"]) for p in sd["players"]] for sd in first["sides"]}
    winner, loser = sides["A"][0], sides["B"][0]
    _finish(client, editor_headers, mid, 2, 0)

    with _session() as s:
        paths = {e["key"]: e["path"] for e in compute_stats_records(s, mode=rh.BADGE_MODE, scope=rh.BADGE_SCOPE)["records"]}
    labels = {d.key: d.label for d in RECORD_DEFS}

    moved_keys = rec.keys()
    assert moved_keys, "finishing the first match must move at least one record"
    for key in moved_keys:
        addressed = rec.for_key(key)
        assert sorted(pid for pid, _ in addressed) == everyone, key
        for _, message in addressed:
            assert message.event_type == "record_moved"
            assert message.tag == f"record-{key}"
            assert message.path == paths[key]
            assert message.text_context["record"] == labels[key]
            assert message.text_context["record_key"] == key
            for language in supported_notification_languages():
                payload = message.to_payload(language)
                assert payload["title"].strip() and payload["body"].strip()
                assert "{" not in payload["title"] and "{" not in payload["body"]

    # Winning the first match takes "most points": the winner gained it, the loser only
    # watched (they never held it), and so did everybody else.
    def key_of(pid: int, key: str) -> str:
        return next(m.text_key for p, m in rec.for_key(key) if p == pid)

    assert "most_points" in moved_keys
    assert key_of(winner, "most_points") == "lead_gained"   # a lead, not a record
    assert key_of(loser, "most_points") == "lead_watch"
    for pid in everyone:
        if pid not in (winner, loser):
            assert key_of(pid, "most_points") == "lead_watch"

    # …while "most played" is gained by *both* players of the match.
    assert "most_played" in moved_keys
    assert key_of(winner, "most_played") == "lead_gained"
    assert key_of(loser, "most_played") == "lead_gained"


def test_a_correction_moves_the_record_and_the_loser_hears_lost(client, editor_headers, admin_headers):
    pids = [create_player(client, admin_headers, n) for n in ("CorrA", "CorrB", "CorrC")]
    tid = create_tournament(client, editor_headers, "Corr Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    for mid in _matches(client, tid):
        _finish(client, editor_headers, mid, 5, 0)

    before = _holders("most_goals_one_side")
    assert before

    # A side none of whose players currently hold it — so the move has a real gainer.
    target = None
    for m in client.get(f"/tournaments/{tid}").json()["matches"]:
        for sd in m["sides"]:
            ids = {int(pl["id"]) for pl in sd["players"]}
            if ids and not (ids & before):
                target = (int(m["id"]), str(sd["side"]), ids)
                break
        if target:
            break
    assert target, "every player already holds it — the fixture is wrong"
    target_mid, target_side, target_ids = target

    rec = _recorder(client)
    # A correction on a *finished* match: that side suddenly scored more than anyone ever has.
    r = client.patch(f"/matches/{target_mid}", json={f"side{target_side}": {"goals": 9}}, headers=editor_headers)
    assert r.status_code == 200, r.text

    after = _holders("most_goals_one_side")
    assert after == target_ids
    gained, lost = after - before, before - after
    assert gained == target_ids and lost == before

    addressed = dict(rec.for_key("most_goals_one_side"))
    assert set(addressed) == set(_all_player_ids())
    for pid in gained:
        assert addressed[pid].text_key == "record_gained"
        assert addressed[pid].text_context["losers"] == _names(lost)
    for pid in lost:
        assert addressed[pid].text_key == "record_lost"
        assert addressed[pid].text_context["gainers"] == _names(gained)
    for pid, message in addressed.items():
        if pid not in gained and pid not in lost:
            assert message.text_key == "record_watch"
            assert message.text_context["gainers"] and message.text_context["losers"]


def _all_player_ids() -> list[int]:
    with _session() as s:
        return sorted(int(p) for p in s.exec(select(Player.id)).all())


def _names(ids: set[int]) -> list[str]:
    with _session() as s:
        by_id = {int(p.id): p.display_name for p in s.exec(select(Player)).all()}
    return [by_id[pid] for pid in sorted(ids)]


def test_the_variant_follows_the_recipient_never_the_actor(client, editor_headers, admin_headers):
    """The three texts are decided by the recipient's relationship to the move.

    The editor who types the result in is a player like any other: when the result hands
    *them* a record they are told they gained it, never that they watched it happen.
    """
    editor_id = int(client.get("/me", headers=editor_headers).json()["player_id"])
    others = [create_player(client, admin_headers, n) for n in ("ActorB", "ActorC")]
    tid = create_tournament(client, editor_headers, "Actor Cup", "1v1", [editor_id, *others])
    generate(client, editor_headers, tid)

    rec = _recorder(client)
    target = None
    for m in client.get(f"/tournaments/{tid}").json()["matches"]:
        for sd in m["sides"]:
            if editor_id in {int(pl["id"]) for pl in sd["players"]}:
                target = (int(m["id"]), str(sd["side"]))
                break
        if target:
            break
    assert target
    mid, side = target
    other = "B" if side == "A" else "A"
    r = client.patch(
        f"/matches/{mid}",
        json={"state": "finished", f"side{side}": {"goals": 4}, f"side{other}": {"goals": 0}},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    moved = rec.keys()
    assert "most_points" in moved
    for key in moved:
        for pid, message in rec.for_key(key):
            gained = {int(p) for p in message.data.get("gained") or []}
            lost = {int(p) for p in message.data.get("lost") or []}
            kind = record_kind(key)
            expected = f"{kind}_gained" if pid in gained else f"{kind}_lost" if pid in lost else f"{kind}_watch"
            assert message.text_key == expected, (key, pid)
    # The one who typed it in gained it, and is told so.
    assert dict(rec.for_key("most_points"))[editor_id].text_key == "lead_gained"


def test_no_dispatcher_means_no_push_but_still_correct_holders(client, editor_headers, admin_headers):
    pids = [create_player(client, admin_headers, n) for n in ("NoDispA", "NoDispB", "NoDispC")]
    tid = create_tournament(client, editor_headers, "NoDisp Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    client.app.state.push_dispatcher = None

    _finish(client, editor_headers, _matches(client, tid)[0], 3, 1)
    for key in RECORD_KEYS:
        assert _holders(key) == _live_holders(key), key


def test_the_cli_path_persists_without_a_dispatcher(client, editor_headers, admin_headers):
    """`manage.py add-match` has no request and so no dispatcher (M2)."""
    pids = [create_player(client, admin_headers, n) for n in ("CliA", "CliB", "CliC")]
    tid = create_tournament(client, editor_headers, "Cli Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    _finish(client, editor_headers, _matches(client, tid)[0], 6, 0)

    # Undo the stored answer so there is something to report, then reconcile as the CLI does.
    with _session() as s:
        for row in s.exec(select(RecordHolder).where(RecordHolder.record_key == "most_goals_one_side")).all():
            s.delete(row)
        s.commit()

    rec = _recorder(client)
    with _session() as s:
        moves = after_result_change(None, s, tournament_id=tid, reason="cli")
    assert [m.key for m in moves] == ["most_goals_one_side"]
    assert rec.records == []
    assert _holders("most_goals_one_side") == _live_holders("most_goals_one_side")


# ---- every result path calls it, and only the result paths ---------------


@pytest.fixture()
def spy(monkeypatch):
    calls: list[dict] = []

    def _spy(request, s, *, tournament_id=None, reason=""):
        calls.append({"tournament_id": tournament_id, "reason": reason})
        return []

    monkeypatch.setattr(matches_router, "after_result_change", _spy)
    monkeypatch.setattr(tournaments_router, "after_result_change", _spy)
    return calls


def _played_tournament(client, editor_headers, admin_headers, name: str, mode: str = "1v1") -> tuple[int, list[int]]:
    count = 3 if mode == "1v1" else 4
    pids = [create_player(client, admin_headers, f"{name}{i}") for i in range(count)]
    tid = create_tournament(client, editor_headers, f"{name} Cup", mode, pids)
    generate(client, editor_headers, tid)
    return tid, _matches(client, tid)


def test_a_goal_in_a_playing_match_reconciles_nothing(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Spy")
    client.patch(f"/matches/{mids[0]}", json={"state": "playing", "sideA": {"goals": 1}}, headers=editor_headers)
    assert spy == []
    client.patch(f"/matches/{mids[0]}", json={"sideA": {"goals": 2}}, headers=editor_headers)
    assert spy == []

    client.patch(f"/matches/{mids[0]}", json={"state": "finished"}, headers=editor_headers)
    assert [c["reason"] for c in spy] == ["match"]


def test_un_finishing_a_match_reconciles_too(client, editor_headers, admin_headers, spy):
    """`state: "scheduled"` clears both sides' goals — the result is gone, so it moved."""
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Unfin")
    _finish(client, editor_headers, mids[0], 2, 1)
    spy.clear()
    r = client.patch(f"/matches/{mids[0]}", json={"state": "scheduled"}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert [c["reason"] for c in spy] == ["match"]


def test_swapping_sides_on_a_finished_match_reconciles(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Swap")
    _finish(client, editor_headers, mids[0], 3, 1)
    spy.clear()
    r = client.patch(f"/matches/{mids[0]}/swap-sides", headers=editor_headers)
    assert r.status_code == 200, r.text
    assert [c["reason"] for c in spy] == ["swap"]


def test_swapping_sides_mid_tournament_does_not(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "SwapLive")
    client.patch(f"/matches/{mids[0]}", json={"state": "playing", "sideA": {"goals": 1}}, headers=editor_headers)
    spy.clear()
    r = client.patch(f"/matches/{mids[0]}/swap-sides", headers=editor_headers)
    assert r.status_code == 200, r.text
    assert spy == []


def test_regenerating_over_results_reconciles_and_a_draft_does_not(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Regen")
    spy.clear()
    r = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert spy == [], "a schedule nobody has played is not a result"

    _finish(client, editor_headers, _matches(client, tid)[0], 2, 0)
    spy.clear()
    r = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert [c["reason"] for c in spy] == ["generate"]


def test_deleting_a_tournament_reconciles_with_no_tournament_id(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Del")
    _finish(client, editor_headers, mids[0], 2, 0)
    spy.clear()
    r = client.delete(f"/tournaments/{tid}", headers=admin_headers)
    assert r.status_code == 204, r.text
    assert spy == [{"tournament_id": None, "reason": "delete"}]


def test_deleting_a_tournament_takes_the_records_with_it(client, editor_headers, admin_headers):
    pids = [create_player(client, admin_headers, n) for n in ("GoneA", "GoneB", "GoneC")]
    tid = create_tournament(client, editor_headers, "Gone Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    for mid in _matches(client, tid):
        _finish(client, editor_headers, mid, 4, 0)
    held_before = {key: _holders(key) for key in RECORD_KEYS}
    assert any(held_before.values())

    rec = _recorder(client)
    r = client.delete(f"/tournaments/{tid}", headers=admin_headers)
    assert r.status_code == 204, r.text

    for key in RECORD_KEYS:
        assert _holders(key) == set(), key
        if held_before[key]:
            addressed = dict(rec.for_key(key))
            for pid in held_before[key]:
                assert addressed[pid].text_key == f"{record_kind(key)}_lost", (key, pid)


def test_a_decider_moves_most_titles(client, editor_headers, admin_headers, spy):
    """A decider resolves who won a tied tournament — which is Most tournament wins."""
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Dec")
    for mid in mids:
        _finish(client, editor_headers, mid, 1, 1)
    spy.clear()

    detail = client.get(f"/tournaments/{tid}").json()
    first = detail["matches"][0]
    sides = {sd["side"]: [int(p["id"]) for p in sd["players"]] for sd in first["sides"]}
    r = client.patch(
        f"/tournaments/{tid}/decider",
        json={
            "type": "penalties",
            "winner_player_id": sides["A"][0],
            "loser_player_id": sides["B"][0],
            "winner_goals": 4,
            "loser_goals": 3,
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert [c["reason"] for c in spy] == ["decider"]


def test_a_decider_actually_hands_most_titles_to_its_winner(client, editor_headers, admin_headers):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "DecReal")
    for mid in mids:
        _finish(client, editor_headers, mid, 1, 1)
    assert _holders("most_titles") == set()

    detail = client.get(f"/tournaments/{tid}").json()
    sides = {sd["side"]: [int(p["id"]) for p in sd["players"]] for sd in detail["matches"][0]["sides"]}
    winner = sides["A"][0]
    r = client.patch(
        f"/tournaments/{tid}/decider",
        json={
            "type": "penalties",
            "winner_player_id": winner,
            "loser_player_id": sides["B"][0],
            "winner_goals": 4,
            "loser_goals": 3,
        },
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    assert _holders("most_titles") == {winner} == _live_holders("most_titles")


def test_moving_a_played_tournaments_date_reconciles_and_a_draft_does_not(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Date")
    spy.clear()
    r = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-02-02"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert spy == []

    _finish(client, editor_headers, mids[0], 3, 0)
    spy.clear()
    r = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-03-03"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert [c["reason"] for c in spy] == ["date"]


def test_reassign_and_second_leg_carry_the_guard_and_it_is_always_zero(client, editor_headers, admin_headers, spy):
    """Both refuse the moment a match has started, so their guard can only ever be 0 —
    which is exactly why it is a guard and not a comment."""
    pids = [create_player(client, admin_headers, f"Rs{i}") for i in range(4)]
    tid = create_tournament(client, editor_headers, "Rs Cup", "2v2", pids)
    generate(client, editor_headers, tid)

    spy.clear()
    r = client.post(f"/tournaments/{tid}/reassign", json={"randomize_order": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert spy == []

    r = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": True}, headers=editor_headers)
    assert r.status_code == 200, r.text
    spy.clear()
    r = client.patch(f"/tournaments/{tid}/second-leg", json={"enabled": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert spy == []


def test_reordering_never_reconciles(client, editor_headers, admin_headers, spy):
    """A finished match is an unmovable prefix, so a reorder cannot touch a result."""
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Reord")
    _finish(client, editor_headers, mids[0], 2, 0)
    spy.clear()
    r = client.patch(f"/tournaments/{tid}/reorder", json={"match_ids": mids}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert spy == []


def test_renaming_a_tournament_never_reconciles(client, editor_headers, admin_headers, spy):
    tid, mids = _played_tournament(client, editor_headers, admin_headers, "Ren")
    _finish(client, editor_headers, mids[0], 2, 0)
    spy.clear()
    r = client.patch(f"/tournaments/{tid}", json={"name": "Renamed"}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert spy == []


def test_a_friendly_result_never_reconciles(client, editor_headers, admin_headers, spy):
    """`BADGE_SCOPE` is `tournaments`: a friendly cannot move a badge, so it must not
    spend a full record computation on every save either."""
    pids = [create_player(client, admin_headers, n) for n in ("FrA", "FrB")]
    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [pids[0]],
            "teamB_player_ids": [pids[1]],
            "a_goals": 9,
            "b_goals": 0,
            "state": "finished",
        },
        headers=editor_headers,
    )
    assert r.status_code in (200, 201), r.text
    assert spy == []


# ---- the copy -----------------------------------------------------------


def test_every_record_has_a_name_in_every_language(client):
    """A record renamed or added in one language must be obviously missing in the others."""
    for language in ("deutsch", "steirisch"):
        assert set(_RECORD_LABELS[language]) == set(RECORD_KEYS), language
        assert all(str(v).strip() for v in _RECORD_LABELS[language].values()), language


def test_the_catalog_is_not_transliterated(client):
    """German and Styrian get their umlauts: `webpush.py` has always serialised
    `ensure_ascii=False` over UTF-8, so the transliteration was imitation, not a constraint."""
    import json
    from pathlib import Path

    catalog = json.loads(
        (Path(__file__).resolve().parents[1] / "app" / "notification_texts.json").read_text(encoding="utf-8")
    )
    banned = ("Oeffne", "fuer", "Anpoebel", "Uebersicht", "geaendert", "geloescht", "laeuft", "naechste", "verfuegbar", "Guestbook")
    for language, payload in catalog["languages"].items():
        for key, message in payload["messages"].items():
            blob = f"{message['title']} {message['body']}"
            for word in banned:
                assert word not in blob, (language, key, word)


def test_holder_rows_remember_when_the_record_was_taken(client, editor_headers, admin_headers):
    pids = [create_player(client, admin_headers, n) for n in ("SinceA", "SinceB", "SinceC")]
    tid = create_tournament(client, editor_headers, "Since Cup", "1v1", pids)
    generate(client, editor_headers, tid)
    before = dt.datetime.utcnow()
    _finish(client, editor_headers, _matches(client, tid)[0], 2, 0)

    with _session() as s:
        rows = s.exec(select(RecordHolder).where(RecordHolder.record_key == "most_points")).all()
    assert rows
    assert all(r.since >= before - dt.timedelta(seconds=5) for r in rows)
