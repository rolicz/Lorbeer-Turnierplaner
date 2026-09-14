"""A10 — the editor's one-hour grace window.

One matrix per guarded endpoint: reader / editor-who-did-not-create-it /
editor-creator-inside-the-window / editor-creator-past-the-window / admin.

Time is moved by backdating the rows the policy measures against (the same trick
``test_comment_guestbook_edits`` uses for the comment window), never by patching the clock:
the window is measured server-side, so the tests measure it the same way.
"""
import datetime as dt

from sqlmodel import Session, select

from app.db import get_engine
from app.models import Match, Tournament
from tests.conftest import create_player, create_tournament, generate
from tests.util import GRACE_PAST, backdate_friendly, backdate_tournament_creation, backdate_tournament_finish


def _finish_all(client, headers, tid: int) -> None:
    for m in client.get(f"/tournaments/{tid}").json()["matches"]:
        r = client.patch(
            f"/matches/{m['id']}",
            json={"state": "finished", "sideA": {"goals": 1}, "sideB": {"goals": 0}},
            headers=headers,
        )
        assert r.status_code == 200, r.text
    assert client.get(f"/tournaments/{tid}").json()["status"] == "done"


def _create_friendly(client, headers, names: list[int]) -> int:
    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [names[0]],
            "teamB_player_ids": [names[1]],
            "clubA_id": None,
            "clubB_id": None,
            "a_goals": 3,
            "b_goals": 1,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return int(r.json()["id"])


# ---- tournament: edit ---------------------------------------------------


def test_tournament_edit_matrix(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GW1", "GW2", "GW3"]]
    tid = create_tournament(client, editor_headers, "grace-edit", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    body = {"name": "renamed"}

    assert client.patch(f"/tournaments/{tid}", json=body).status_code == 401

    # Live: any editor may edit, creator or not.
    assert client.patch(f"/tournaments/{tid}", json=body, headers=editor2_headers).status_code == 200
    assert client.patch(f"/tournaments/{tid}", json=body, headers=editor_headers).status_code == 200

    _finish_all(client, editor_headers, tid)

    # Done, but inside the hour: still editable by an editor — that is the whole point.
    assert client.patch(f"/tournaments/{tid}", json=body, headers=editor_headers).status_code == 200

    backdate_tournament_finish(tid)

    past = client.patch(f"/tournaments/{tid}", json=body, headers=editor_headers)
    assert past.status_code == 403, past.text
    assert past.json()["detail"] == "Tournament finished more than an hour ago (admin required to edit)"
    assert client.patch(f"/tournaments/{tid}", json=body, headers=editor2_headers).status_code == 403

    assert client.patch(f"/tournaments/{tid}", json=body, headers=admin_headers).status_code == 200


def test_match_result_and_reorder_follow_the_same_window(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GW4", "GW5", "GW6"]]
    tid = create_tournament(client, editor_headers, "grace-match", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    _finish_all(client, editor_headers, tid)

    matches = client.get(f"/tournaments/{tid}").json()["matches"]
    first, last = matches[0], matches[-1]
    fix = {"sideA": {"goals": 4}, "sideB": {"goals": 2}}

    # Inside the hour an editor may still correct any match and swap its sides.
    assert client.patch(f"/matches/{first['id']}", json=fix, headers=editor_headers).status_code == 200
    assert client.patch(f"/matches/{first['id']}/swap-sides", headers=editor_headers).status_code == 200

    backdate_tournament_finish(tid)

    blocked = client.patch(f"/matches/{first['id']}", json=fix, headers=editor_headers)
    assert blocked.status_code == 403, blocked.text
    assert blocked.json()["detail"] == "Tournament finished more than an hour ago (admin required to edit)"
    swap = client.patch(f"/matches/{first['id']}/swap-sides", headers=editor_headers)
    assert swap.status_code == 403, swap.text

    # The "someone finished the last match by accident" escape hatch survives the window.
    assert client.patch(f"/matches/{last['id']}", json={"state": "playing"}, headers=editor_headers).status_code == 200

    reorder_ids = [m["id"] for m in matches][::-1]
    assert client.patch(f"/tournaments/{tid}/reorder", json={"match_ids": reorder_ids}, headers=admin_headers).status_code in (200, 409)
    assert client.patch(f"/matches/{first['id']}", json=fix, headers=admin_headers).status_code == 200


# ---- tournament: decider ------------------------------------------------


def test_decider_matrix(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GD1", "GD2", "GD3"]]
    tid = create_tournament(client, editor_headers, "grace-decider", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    matches = client.get(f"/tournaments/{tid}").json()["matches"]
    first = matches[0]
    left = int(first["sides"][0]["players"][0]["id"])
    right = int(first["sides"][1]["players"][0]["id"])
    body = {
        "type": "penalties",
        "winner_player_id": left,
        "loser_player_id": right,
        "winner_goals": 5,
        "loser_goals": 3,
    }

    for m in matches:
        r = client.patch(
            f"/matches/{m['id']}",
            json={"state": "finished", "sideA": {"goals": 0}, "sideB": {"goals": 0}},
            headers=editor_headers,
        )
        assert r.status_code == 200, r.text

    assert client.patch(f"/tournaments/{tid}/decider", json=body).status_code == 401

    # This is the case A10 exists for: the tie is only knowable once the tournament is done,
    # and the editor who ran the night must be able to resolve it.
    r_editor = client.patch(f"/tournaments/{tid}/decider", json=body, headers=editor_headers)
    assert r_editor.status_code == 200, r_editor.text
    assert r_editor.json()["decider_winner_player_id"] == left

    # The window is the tournament's, not the creator's: any editor is inside it.
    flipped = {**body, "winner_player_id": right, "loser_player_id": left}
    assert client.patch(f"/tournaments/{tid}/decider", json=flipped, headers=editor2_headers).status_code == 200

    backdate_tournament_finish(tid)

    past = client.patch(f"/tournaments/{tid}/decider", json=body, headers=editor_headers)
    assert past.status_code == 403, past.text
    assert past.json()["detail"] == "Tournament finished more than an hour ago (admin required to set the decider)"

    r_admin = client.patch(f"/tournaments/{tid}/decider", json=body, headers=admin_headers)
    assert r_admin.status_code == 200, r_admin.text
    assert r_admin.json()["decider_winner_player_id"] == left


def test_a_done_tournament_without_finish_timestamps_falls_back_to_updated_at(
    client, editor_headers, admin_headers
):
    """`finished_at` can be NULL on backfilled history — then `updated_at` anchors the window."""
    ids = [create_player(client, admin_headers, n) for n in ["GF1", "GF2", "GF3"]]
    tid = create_tournament(client, editor_headers, "grace-nostamp", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)
    _finish_all(client, editor_headers, tid)

    with Session(get_engine()) as s:
        for m in s.exec(select(Match).where(Match.tournament_id == tid)).all():
            m.finished_at = None
            s.add(m)
        t = s.get(Tournament, tid)
        t.updated_at = dt.datetime.utcnow()
        s.add(t)
        s.commit()

    assert client.patch(f"/tournaments/{tid}", json={"name": "still open"}, headers=editor_headers).status_code == 200

    with Session(get_engine()) as s:
        t = s.get(Tournament, tid)
        t.updated_at = dt.datetime.utcnow() - GRACE_PAST
        s.add(t)
        s.commit()

    assert client.patch(f"/tournaments/{tid}", json={"name": "closed"}, headers=editor_headers).status_code == 403


# ---- tournament: delete -------------------------------------------------


def test_tournament_delete_matrix(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GX1", "GX2", "GX3"]]

    tid = create_tournament(client, editor_headers, "grace-del-1", "1v1", ids)
    assert client.delete(f"/tournaments/{tid}").status_code == 401

    # An editor who did not create it never may, window or not.
    not_creator = client.delete(f"/tournaments/{tid}", headers=editor2_headers)
    assert not_creator.status_code == 403, not_creator.text
    assert (
        not_creator.json()["detail"]
        == "Only an admin, or the editor who created it within the last hour, can delete a tournament"
    )

    # Deleting is allowed even with results on the board — hence the confirmation dialog.
    generate(client, editor_headers, tid, randomize=False)
    _finish_all(client, editor_headers, tid)
    assert client.delete(f"/tournaments/{tid}", headers=editor_headers).status_code == 204
    assert client.get(f"/tournaments/{tid}").status_code == 404

    # Past the hour the creator loses the delete, and only the delete.
    tid2 = create_tournament(client, editor_headers, "grace-del-2", "1v1", ids)
    backdate_tournament_creation(tid2)
    assert client.delete(f"/tournaments/{tid2}", headers=editor_headers).status_code == 403
    assert client.patch(f"/tournaments/{tid2}", json={"name": "still mine"}, headers=editor_headers).status_code == 200
    assert client.delete(f"/tournaments/{tid2}", headers=admin_headers).status_code == 204


def test_a_tournament_created_before_this_shipped_stays_admin_only(client, editor_headers, admin_headers):
    """No creator row (legacy tournaments) → the editor never sees a delete button that 403s."""
    ids = [create_player(client, admin_headers, n) for n in ["GL1", "GL2", "GL3"]]
    tid = create_tournament(client, editor_headers, "grace-legacy", "1v1", ids)

    from app.models import TournamentCreatorLink

    with Session(get_engine()) as s:
        s.delete(s.get(TournamentCreatorLink, tid))
        s.commit()

    assert client.delete(f"/tournaments/{tid}", headers=editor_headers).status_code == 403
    row = next(t for t in client.get("/tournaments", headers=editor_headers).json() if t["id"] == tid)
    assert row["can_delete"] is False
    assert row["can_edit"] is True
    assert client.delete(f"/tournaments/{tid}", headers=admin_headers).status_code == 204


def test_an_editor_delete_notifies_exactly_like_an_admin_delete(client, editor_headers, admin_headers, monkeypatch):
    """Push on delete is role-blind — A10 only widened who may press the button."""
    sent: list[tuple] = []

    import app.routers.tournaments as tournaments_router

    monkeypatch.setattr(
        tournaments_router,
        "push_tournament_deleted",
        lambda request, **kw: sent.append(("deleted", kw["tournament_id"], kw["tournament_name"])),
    )

    ids = [create_player(client, admin_headers, n) for n in ["GP1", "GP2", "GP3"]]
    t_editor = create_tournament(client, editor_headers, "push-editor", "1v1", ids)
    t_admin = create_tournament(client, admin_headers, "push-admin", "1v1", ids)

    assert client.delete(f"/tournaments/{t_editor}", headers=editor_headers).status_code == 204
    assert client.delete(f"/tournaments/{t_admin}", headers=admin_headers).status_code == 204

    assert sent == [("deleted", t_editor, "push-editor"), ("deleted", t_admin, "push-admin")]


# ---- friendlies ---------------------------------------------------------


def test_friendly_patch_matrix(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GY1", "GY2"]]
    fid = _create_friendly(client, editor_headers, ids)
    patch = {"state": "finished", "sideA": {"goals": 2}, "sideB": {"goals": 2}}

    assert client.patch(f"/friendlies/{fid}", json=patch).status_code == 401

    not_creator = client.patch(f"/friendlies/{fid}", json=patch, headers=editor2_headers)
    assert not_creator.status_code == 403, not_creator.text
    assert (
        not_creator.json()["detail"]
        == "Only an admin, or the editor who created it within the last hour, can edit a friendly"
    )

    ok = client.patch(f"/friendlies/{fid}", json=patch, headers=editor_headers)
    assert ok.status_code == 200, ok.text
    assert [s["goals"] for s in ok.json()["sides"]] == [2, 2]

    backdate_friendly(fid)
    assert client.patch(f"/friendlies/{fid}", json=patch, headers=editor_headers).status_code == 403
    assert client.patch(f"/friendlies/{fid}", json=patch, headers=admin_headers).status_code == 200


def test_friendly_delete_matrix(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GZ1", "GZ2"]]

    fid = _create_friendly(client, editor_headers, ids)
    assert client.delete(f"/friendlies/{fid}").status_code == 401
    assert client.delete(f"/friendlies/{fid}", headers=editor2_headers).status_code == 403
    assert client.delete(f"/friendlies/{fid}", headers=editor_headers).status_code == 200
    assert all(int(x["id"]) != fid for x in client.get("/friendlies").json())

    fid2 = _create_friendly(client, editor_headers, ids)
    backdate_friendly(fid2)
    past = client.delete(f"/friendlies/{fid2}", headers=editor_headers)
    assert past.status_code == 403, past.text
    assert (
        past.json()["detail"]
        == "Only an admin, or the editor who created it within the last hour, can delete a friendly"
    )
    assert client.delete(f"/friendlies/{fid2}", headers=admin_headers).status_code == 200


# ---- the flags in the payloads -----------------------------------------


def test_capability_flags_match_the_guards(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GC1", "GC2", "GC3"]]
    tid = create_tournament(client, editor_headers, "grace-flags", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    def detail(headers=None):
        r = client.get(f"/tournaments/{tid}", headers=headers or {})
        assert r.status_code == 200, r.text
        return r.json()

    def item(headers=None):
        rows = client.get("/tournaments", headers=headers or {}).json()
        return next(t for t in rows if t["id"] == tid)

    # Reader: no token, nothing offered.
    for row in (detail(), item()):
        assert (row["can_edit"], row["can_delete"], row["can_set_decider"]) == (False, False, False)

    for row in (detail(editor_headers), item(editor_headers)):
        assert (row["can_edit"], row["can_delete"], row["can_set_decider"]) == (True, True, True)

    # Another editor may edit a live tournament but never delete someone else's.
    for row in (detail(editor2_headers), item(editor2_headers)):
        assert (row["can_edit"], row["can_delete"], row["can_set_decider"]) == (True, False, True)

    for row in (detail(admin_headers), item(admin_headers)):
        assert (row["can_edit"], row["can_delete"], row["can_set_decider"]) == (True, True, True)

    _finish_all(client, editor_headers, tid)
    inside = detail(editor_headers)
    assert (inside["can_edit"], inside["can_set_decider"]) == (True, True)

    backdate_tournament_finish(tid)
    backdate_tournament_creation(tid)
    outside = detail(editor_headers)
    assert (outside["can_edit"], outside["can_delete"], outside["can_set_decider"]) == (False, False, False)
    assert item(editor_headers)["can_edit"] is False
    assert detail(admin_headers)["can_edit"] is True


def test_friendly_flags_match_the_guards(client, editor_headers, editor2_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["GV1", "GV2"]]
    fid = _create_friendly(client, editor_headers, ids)

    def row(headers=None):
        rows = client.get("/friendlies", headers=headers or {}).json()
        return next(f for f in rows if int(f["id"]) == fid)

    assert (row()["can_edit"], row()["can_delete"]) == (False, False)
    assert (row(editor_headers)["can_edit"], row(editor_headers)["can_delete"]) == (True, True)
    assert (row(editor2_headers)["can_edit"], row(editor2_headers)["can_delete"]) == (False, False)
    assert (row(admin_headers)["can_edit"], row(admin_headers)["can_delete"]) == (True, True)

    backdate_friendly(fid)
    assert (row(editor_headers)["can_edit"], row(editor_headers)["can_delete"]) == (False, False)
    assert (row(admin_headers)["can_edit"], row(admin_headers)["can_delete"]) == (True, True)


def test_the_websocket_payload_carries_no_capabilities(client, editor_headers, admin_headers):
    """`tournament.sync` has no single viewer, so it serializes viewer-less (all-False)."""
    ids = [create_player(client, admin_headers, n) for n in ["GS1", "GS2", "GS3"]]
    tid = create_tournament(client, editor_headers, "grace-ws", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    with client.websocket_connect(f"/ws/tournaments/{tid}") as ws:
        assert ws.receive_json()["event"] == "connected"
        assert client.patch(f"/tournaments/{tid}", json={"name": "ws rename"}, headers=editor_headers).status_code == 200
        msg = ws.receive_json()
        assert msg["event"] == "tournament.sync"
        t = msg["payload"]["tournament"]
        assert (t["can_edit"], t["can_delete"], t["can_set_decider"]) == (False, False, False)
