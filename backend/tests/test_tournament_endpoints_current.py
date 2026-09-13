import json

from tests.conftest import create_player, create_tournament, generate

# ---- GET /tournaments/live ---------------------------------------------


def test_live_tournament_is_null_until_a_match_is_playing(client, editor_headers, admin_headers):
    r_empty = client.get("/tournaments/live")
    assert r_empty.status_code == 200, r_empty.text
    assert r_empty.json() is None

    ids = [create_player(client, admin_headers, n) for n in ["LV1", "LV2", "LV3"]]
    tid = create_tournament(client, editor_headers, "live-probe", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    # All matches scheduled -> draft -> still nothing live.
    r_draft = client.get("/tournaments/live")
    assert r_draft.status_code == 200, r_draft.text
    assert r_draft.json() is None

    match_ids = [m["id"] for m in client.get(f"/tournaments/{tid}").json()["matches"]]
    rp = client.patch(f"/matches/{match_ids[0]}", json={"state": "playing"}, headers=editor_headers)
    assert rp.status_code == 200, rp.text

    r_live = client.get("/tournaments/live")
    assert r_live.status_code == 200, r_live.text
    live = r_live.json()
    assert live is not None
    assert live["id"] == tid
    assert live["name"] == "live-probe"
    assert live["mode"] == "1v1"
    assert live["status"] == "live"

    for mid in match_ids:
        rf = client.patch(f"/matches/{mid}", json={"state": "finished"}, headers=editor_headers)
        assert rf.status_code == 200, rf.text

    # All finished -> done -> nothing live again.
    r_done = client.get("/tournaments/live")
    assert r_done.status_code == 200, r_done.text
    assert r_done.json() is None


# ---- PATCH /tournaments/{id}/date --------------------------------------


def test_patch_date_is_admin_only(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["DT1", "DT2", "DT3"]]
    tid = create_tournament(client, editor_headers, "date-auth", "1v1", ids)

    r_reader = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-05-04"})
    assert r_reader.status_code in (401, 403), r_reader.text

    r_editor = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-05-04"}, headers=editor_headers)
    assert r_editor.status_code == 403, r_editor.text

    r_admin = client.patch(f"/tournaments/{tid}/date", json={"date": "2026-05-04"}, headers=admin_headers)
    assert r_admin.status_code == 200, r_admin.text
    assert r_admin.json() == {"ok": True, "date": "2026-05-04"}
    assert client.get(f"/tournaments/{tid}").json()["date"] == "2026-05-04"


def test_patch_date_rejects_invalid_input(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["DT4", "DT5", "DT6"]]
    tid = create_tournament(client, editor_headers, "date-invalid", "1v1", ids)

    for bad in ("04.05.2026", "2026-13-40", "tomorrow"):
        r = client.patch(f"/tournaments/{tid}/date", json={"date": bad}, headers=admin_headers)
        assert r.status_code == 400, f"{bad}: {r.text}"

    r_empty = client.patch(f"/tournaments/{tid}/date", json={"date": "   "}, headers=admin_headers)
    assert r_empty.status_code == 400, r_empty.text

    r_missing = client.patch(f"/tournaments/{tid}/date", json={}, headers=admin_headers)
    assert r_missing.status_code == 422, r_missing.text

    r_404 = client.patch("/tournaments/999999/date", json={"date": "2026-05-04"}, headers=admin_headers)
    assert r_404.status_code == 404, r_404.text


# ---- POST /tournaments/{id}/reassign -----------------------------------


def test_reassign_rebuilds_a_2v2_draft_schedule(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["RA1", "RA2", "RA3", "RA4"]]
    tid = create_tournament(client, editor_headers, "reassign", "2v2", ids)
    generate(client, editor_headers, tid, randomize=False)

    before = client.get(f"/tournaments/{tid}").json()["matches"]

    r = client.post(f"/tournaments/{tid}/reassign", json={"randomize_order": False}, headers=editor_headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "matches": len(before), "second_leg": False, "status": "draft"}

    after = client.get(f"/tournaments/{tid}")
    assert after.status_code == 200, after.text
    payload = after.json()
    assert payload["status"] == "draft"
    # A fresh label mapping was persisted (the pairings themselves are randomised).
    labels = json.loads(payload["settings_json"] or "{}")["labels"]
    assert sorted(labels.values()) == ["RA1", "RA2", "RA3", "RA4"]

    matches = payload["matches"]
    assert len(matches) == len(before)
    assert [m["order_index"] for m in matches] == list(range(len(matches)))
    for m in matches:
        assert m["state"] == "scheduled"
        assert [s["goals"] for s in m["sides"]] == [0, 0]
        assert [s["club_id"] for s in m["sides"]] == [None, None]
        assert sorted(p["id"] for s in m["sides"] for p in s["players"]) == sorted(ids)


def test_reassign_rejects_1v1_missing_schedule_and_touched_matches(client, editor_headers, admin_headers):
    ids_1v1 = [create_player(client, admin_headers, n) for n in ["RB1", "RB2", "RB3"]]
    tid_1v1 = create_tournament(client, editor_headers, "reassign-1v1", "1v1", ids_1v1)
    generate(client, editor_headers, tid_1v1, randomize=False)
    r_1v1 = client.post(f"/tournaments/{tid_1v1}/reassign", json={}, headers=editor_headers)
    assert r_1v1.status_code == 409, r_1v1.text

    ids = [create_player(client, admin_headers, n) for n in ["RB4", "RB5", "RB6", "RB7"]]
    tid = create_tournament(client, editor_headers, "reassign-guards", "2v2", ids)

    # No schedule yet.
    r_none = client.post(f"/tournaments/{tid}/reassign", json={}, headers=editor_headers)
    assert r_none.status_code == 409, r_none.text

    generate(client, editor_headers, tid, randomize=False)

    r_reader = client.post(f"/tournaments/{tid}/reassign", json={})
    assert r_reader.status_code in (401, 403), r_reader.text

    mid = client.get(f"/tournaments/{tid}").json()["matches"][0]["id"]
    rp = client.patch(f"/matches/{mid}", json={"state": "playing"}, headers=editor_headers)
    assert rp.status_code == 200, rp.text

    r_live = client.post(f"/tournaments/{tid}/reassign", json={}, headers=editor_headers)
    assert r_live.status_code == 409, r_live.text

    r_404 = client.post("/tournaments/999999/reassign", json={}, headers=editor_headers)
    assert r_404.status_code == 404, r_404.text
