"""Tests for the optimistic-push websocket layer (envelope + enriched payloads)."""
import app.ws as ws_module
from app import ws as ws_pkg

from .conftest import create_player, create_tournament, generate


def test_envelope_has_incrementing_seq():
    a = ws_module._envelope("x", {"k": 1})
    b = ws_module._envelope("y", {"k": 2})
    assert a["event"] == "x" and a["payload"] == {"k": 1}
    assert "ts" in a and isinstance(a["seq"], int)
    assert b["seq"] == a["seq"] + 1  # monotonic


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
