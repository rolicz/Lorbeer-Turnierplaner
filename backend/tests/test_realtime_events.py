"""Tests for the optimistic-push websocket layer (envelope + enriched payloads)."""
import json
from datetime import datetime

import app.ws as ws_module
from app import ws as ws_pkg

from .conftest import create_player, create_tournament, generate


def test_envelope_carries_the_sequence_it_is_given():
    a = ws_module._envelope("x", {"k": 1}, 1)
    b = ws_module._envelope("y", {"k": 2}, 2)
    assert a["event"] == "x" and a["payload"] == {"k": 1}
    assert "ts" in a and isinstance(a["seq"], int)
    assert b["seq"] == a["seq"] + 1  # monotonic


def test_each_channel_counts_from_one_on_its_own(monkeypatch):
    """
    A9: the sequence is a per-channel promise ("you missed something"), so the
    numbers one client sees must not move because another channel broadcast.
    """
    mgr = ws_module.WSManager()
    sent: dict[int, list[dict]] = {5: [], 9: []}

    class _Sock:
        def __init__(self, tid: int):
            self.tid = tid

        async def send_json(self, msg):
            sent[self.tid].append(msg)

    mgr._channels.add(5, _Sock(5))
    mgr._channels.add(9, _Sock(9))

    import asyncio

    async def run():
        await mgr.broadcast(5, "a", {})
        await mgr.broadcast(9, "a", {})
        await mgr.broadcast(5, "b", {})
        await mgr.broadcast(5, "c", {})

    asyncio.run(run())

    assert [m["seq"] for m in sent[5]] == [1, 2, 3]
    assert [m["seq"] for m in sent[9]] == [1]


def test_a_socket_that_fails_a_broadcast_is_closed_not_just_forgotten():
    """
    A9: dropping it from the channel alone leaves the endpoint's receive loop
    answering its pings, so the client shows "live" forever and never resyncs.
    """
    mgr = ws_module.WSManager()
    closed: list[int] = []

    class _DeadSock:
        async def send_json(self, msg):
            raise RuntimeError("connection is gone")

        async def close(self, code=1000):
            closed.append(code)

    class _GoodSock:
        def __init__(self):
            self.got = []

        async def send_json(self, msg):
            self.got.append(msg)

    dead = _DeadSock()
    good = _GoodSock()
    mgr._channels.add(3, dead)
    mgr._channels.add(3, good)

    import asyncio

    asyncio.run(mgr.broadcast(3, "tournament.sync", {}))

    assert closed == [1011]
    assert mgr._channels.sockets(3) == [good]
    # The healthy socket still got the message.
    assert len(good.got) == 1


def test_envelope_payload_is_json_safe_with_datetimes():
    # serialize_tournament carries raw datetimes; the envelope must encode them
    # so ws.send_json never raises (an uncaught raise silently drops the message
    # and disconnects the client).
    env = ws_module._envelope("tournament.sync", {"created_at": datetime(2026, 1, 2, 3, 4, 5)}, 1)
    json.dumps(env)  # must not raise
    assert env["payload"]["created_at"] == "2026-01-02T03:04:05"


class _Recorder:
    def __init__(self):
        self.tournament_channel: list[tuple[int, str, dict]] = []
        self.global_channel: list[tuple[str, dict]] = []

    async def t_broadcast(self, tournament_id, event, payload):
        self.tournament_channel.append((int(tournament_id), event, payload))

    async def g_broadcast(self, event, payload):
        self.global_channel.append((event, payload))


def _patch_ws(monkeypatch) -> _Recorder:
    rec = _Recorder()
    monkeypatch.setattr(ws_pkg.ws_manager, "broadcast", rec.t_broadcast)
    monkeypatch.setattr(ws_pkg.ws_manager_update_tournaments, "broadcast", rec.g_broadcast)
    return rec


def _live_match(client, editor_headers, admin_headers):
    pids = [create_player(client, admin_headers, n) for n in ("RtA", "RtB", "RtC")]
    tid = create_tournament(client, editor_headers, "Rt Cup", "1v1", pids)
    generate(client, editor_headers, tid, randomize=False)
    detail = client.get(f"/tournaments/{tid}").json()
    return tid, int(detail["matches"][0]["id"])


def test_match_patch_pushes_full_tournament(client, editor_headers, admin_headers, monkeypatch):
    tid, mid = _live_match(client, editor_headers, admin_headers)
    rec = _patch_ws(monkeypatch)

    r = client.patch(
        f"/matches/{mid}",
        json={"state": "playing", "sideA": {"goals": 1}, "sideB": {"goals": 0}},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    syncs = [p for (chan, ev, p) in rec.tournament_channel if ev == "tournament.sync" and chan == tid]
    assert syncs, "expected a tournament.sync on the tournament channel"
    pushed = syncs[-1]["tournament"]
    assert pushed["id"] == tid
    # The pushed payload carries the live match state for instant client apply.
    patched = next(m for m in pushed["matches"] if int(m["id"]) == mid)
    assert patched["state"] == "playing"
    assert {s["side"]: s["goals"] for s in patched["sides"]} == {"A": 1, "B": 0}

    # draft -> live is a status transition: a coarse global notification is emitted.
    assert any(ev == "tournaments.changed" and p.get("status") == "live" for (ev, p) in rec.global_channel)


def test_goal_does_not_emit_global_notification(client, editor_headers, admin_headers, monkeypatch):
    tid, mid = _live_match(client, editor_headers, admin_headers)
    # Put the tournament into "live" first (status transition consumed here).
    client.patch(f"/matches/{mid}", json={"state": "playing", "sideA": {"goals": 1}}, headers=editor_headers)

    rec = _patch_ws(monkeypatch)
    # A further goal with no status change must NOT hit the global channel (no refetch storm).
    client.patch(f"/matches/{mid}", json={"sideA": {"goals": 2}}, headers=editor_headers)
    assert any(ev == "tournament.sync" for (_, ev, _) in rec.tournament_channel)
    assert rec.global_channel == []


def _finish_all(client, editor_headers, tid: int) -> list[int]:
    """Play every match out so the tournament's derived status is `done`."""
    detail = client.get(f"/tournaments/{tid}").json()
    mids = [int(m["id"]) for m in detail["matches"]]
    for mid in mids:
        client.patch(
            f"/matches/{mid}",
            json={"state": "finished", "sideA": {"goals": 2}, "sideB": {"goals": 1}},
            headers=editor_headers,
        )
    assert client.get(f"/tournaments/{tid}").json()["status"] == "done"
    return mids


def test_correcting_a_done_result_reaches_the_global_channel(client, editor_headers, admin_headers, monkeypatch):
    """
    Q9: a score fixed after the fact moves no status, so nothing used to announce it —
    and the tournaments list's winner, the cup owner and every stat could stay wrong on
    every other device. It now sends `action="result"`.
    """
    tid, _ = _live_match(client, editor_headers, admin_headers)
    mids = _finish_all(client, editor_headers, tid)

    rec = _patch_ws(monkeypatch)
    r = client.patch(f"/matches/{mids[0]}", json={"sideA": {"goals": 5}}, headers=editor_headers)
    assert r.status_code == 200, r.text

    results = [p for (ev, p) in rec.global_channel if ev == "tournaments.changed" and p.get("action") == "result"]
    assert results, "a corrected result on a done tournament must reach the global channel"
    assert results[-1]["tournament_id"] == tid and results[-1]["status"] == "done"


def test_swapping_sides_on_a_done_tournament_reaches_the_global_channel(client, editor_headers, admin_headers, monkeypatch):
    """Q9: swapping A and B on a finished match swaps who won it — same grade of change."""
    tid, _ = _live_match(client, editor_headers, admin_headers)
    mids = _finish_all(client, editor_headers, tid)

    rec = _patch_ws(monkeypatch)
    r = client.patch(f"/matches/{mids[0]}/swap-sides", headers=editor_headers)
    assert r.status_code == 200, r.text
    assert any(ev == "tournaments.changed" and p.get("action") == "result" for (ev, p) in rec.global_channel)


def test_swapping_sides_mid_tournament_stays_off_the_global_channel(client, editor_headers, admin_headers, monkeypatch):
    """…but while the tournament is still running it changes no result that anything reads."""
    tid, mid = _live_match(client, editor_headers, admin_headers)
    client.patch(f"/matches/{mid}", json={"state": "playing", "sideA": {"goals": 1}}, headers=editor_headers)

    rec = _patch_ws(monkeypatch)
    r = client.patch(f"/matches/{mid}/swap-sides", headers=editor_headers)
    assert r.status_code == 200, r.text
    assert any(ev == "tournament.sync" for (_, ev, _) in rec.tournament_channel)
    assert rec.global_channel == []


def test_comment_create_pushes_upsert(client, editor_headers, admin_headers, monkeypatch):
    tid, _ = _live_match(client, editor_headers, admin_headers)
    rec = _patch_ws(monkeypatch)

    r = client.post(f"/tournaments/{tid}/comments", json={"body": "hello live"}, headers=editor_headers)
    assert r.status_code == 200, r.text
    created_id = r.json()["id"]

    upserts = [p for (chan, ev, p) in rec.tournament_channel if ev == "comment.upsert" and chan == tid]
    assert upserts, "expected a comment.upsert"
    pushed = upserts[-1]["comment"]
    assert pushed["id"] == created_id
    assert pushed["body"] == "hello live"
    # Fresh comment has zero votes (client inserts as-is).
    assert pushed["upvotes"] == 0 and pushed["downvotes"] == 0


def test_comment_vote_pushes_meta_not_full(client, editor_headers, admin_headers, monkeypatch):
    tid, _ = _live_match(client, editor_headers, admin_headers)
    cid = client.post(f"/tournaments/{tid}/comments", json={"body": "vote me"}, headers=editor_headers).json()["id"]

    rec = _patch_ws(monkeypatch)
    r = client.put(f"/comments/{cid}/vote", json={"value": 1}, headers=editor_headers)
    assert r.status_code == 200, r.text
    # Votes are viewer-specific -> meta event (narrow refetch), never a vote-wiping upsert.
    metas = [p for (chan, ev, p) in rec.tournament_channel if ev == "comment.meta" and chan == tid]
    assert any(p.get("action") == "voted" for p in metas)
    assert not any(ev == "comment.upsert" for (_, ev, _) in rec.tournament_channel)


def test_comment_create_and_delete_move_the_global_badge(client, editor_headers, admin_headers, monkeypatch):
    """A5: the tournaments list is only on the coarse channel, and its unread badge counts comments."""
    tid, _ = _live_match(client, editor_headers, admin_headers)
    rec = _patch_ws(monkeypatch)

    cid = client.post(f"/tournaments/{tid}/comments", json={"body": "badge me"}, headers=editor_headers).json()["id"]
    created = [p for (ev, p) in rec.global_channel if ev == "tournaments.changed" and p.get("action") == "comment"]
    assert created, "a new comment must reach the global channel"
    assert created[-1]["tournament_id"] == tid

    rec.global_channel.clear()
    r = client.delete(f"/comments/{cid}", headers=admin_headers)
    assert r.status_code == 200, r.text
    deleted = [p for (ev, p) in rec.global_channel if ev == "tournaments.changed" and p.get("action") == "comment"]
    assert deleted, "a deleted comment must stop being counted"
    assert deleted[-1]["tournament_id"] == tid


class _ProfileRecorder:
    def __init__(self):
        self.sent: list[tuple[int, str, dict]] = []

    async def broadcast(self, player_id, event, payload):
        self.sent.append((int(player_id), event, payload))


def test_guestbook_writes_reach_the_profile_channel(client, admin_headers, monkeypatch):
    """A5: `/ws/players/{id}` is named "pokes / guestbook" — the guestbook half sent nothing."""
    pid = create_player(client, admin_headers, "GbProfile")
    rec = _ProfileRecorder()
    monkeypatch.setattr(ws_pkg.ws_manager_player_profiles, "broadcast", rec.broadcast)

    created = client.post(f"/players/{pid}/guestbook", json={"body": "hi there"}, headers=admin_headers)
    assert created.status_code == 200, created.text
    entry_id = int(created.json()["id"])

    def actions() -> list[str]:
        return [p["action"] for (chan, ev, p) in rec.sent if ev == "player:guestbook:update" and chan == pid]

    assert actions() == ["created"]
    assert rec.sent[-1][2]["entry_id"] == entry_id

    edited = client.patch(f"/players/guestbook/{entry_id}", json={"body": "edited"}, headers=admin_headers)
    assert edited.status_code == 200, edited.text
    voted = client.put(f"/players/guestbook/{entry_id}/vote", json={"value": 1}, headers=admin_headers)
    assert voted.status_code == 200, voted.text
    removed = client.delete(f"/players/guestbook/{entry_id}", headers=admin_headers)
    assert removed.status_code == 204, removed.text

    assert actions() == ["created", "updated", "voted", "deleted"]


def test_regenerating_a_live_tournament_over_results_is_result_grade(client, editor_headers, admin_headers, monkeypatch):
    """
    M2: `/generate` on a tournament that already has finished matches destroys results.
    It moved no status, so it announced itself as a mere "updated" and every other
    device kept the old standings, cup owner and stats — Q9's failure, one door along.
    """
    tid, mid = _live_match(client, editor_headers, admin_headers)
    r = client.patch(
        f"/matches/{mid}",
        json={"state": "finished", "sideA": {"goals": 2}, "sideB": {"goals": 0}},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    rec = _patch_ws(monkeypatch)
    r = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    actions = [p.get("action") for (ev, p) in rec.global_channel if ev == "tournaments.changed"]
    assert "result" in actions, actions


def test_regenerating_a_draft_is_still_only_an_update(client, editor_headers, admin_headers, monkeypatch):
    """…and a schedule nobody has played is not a result, so the channel stays coarse."""
    tid, _ = _live_match(client, editor_headers, admin_headers)

    rec = _patch_ws(monkeypatch)
    r = client.post(f"/tournaments/{tid}/generate", json={"randomize": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    actions = [p.get("action") for (ev, p) in rec.global_channel if ev == "tournaments.changed"]
    assert "result" not in actions and "updated" in actions, actions


def test_moving_a_played_tournaments_date_is_result_grade(client, editor_headers, admin_headers, monkeypatch):
    """M2: streaks, Elo and the upset are ordered by `tournament.date`."""
    tid, _ = _live_match(client, editor_headers, admin_headers)
    _finish_all(client, editor_headers, tid)

    rec = _patch_ws(monkeypatch)
    r = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-01-05"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    actions = [p.get("action") for (ev, p) in rec.global_channel if ev == "tournaments.changed"]
    assert "result" in actions, actions


def test_moving_a_draft_tournaments_date_is_only_an_update(client, editor_headers, admin_headers, monkeypatch):
    """A date on a tournament with no results reorders nothing that anything reads."""
    tid, _ = _live_match(client, editor_headers, admin_headers)

    rec = _patch_ws(monkeypatch)
    r = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-01-05"}, headers=admin_headers)
    assert r.status_code == 200, r.text
    actions = [p.get("action") for (ev, p) in rec.global_channel if ev == "tournaments.changed"]
    assert "result" not in actions and "updated" in actions, actions
