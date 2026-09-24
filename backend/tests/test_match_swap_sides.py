from tests.conftest import create_player, create_tournament, generate
from tests.util import backdate_tournament_finish


def _first_match(client, tournament_id: int) -> dict:
    t = client.get(f"/tournaments/{tournament_id}")
    assert t.status_code == 200, t.text
    return t.json()["matches"][0]


def test_swap_sides_swaps_players_and_goals(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["SW1", "SW2", "SW3"]]
    tid = create_tournament(client, editor_headers, "swap", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    m = _first_match(client, tid)
    mid = m["id"]

    r_goals = client.patch(
        f"/matches/{mid}",
        json={"sideA": {"goals": 3}, "sideB": {"goals": 1}},
        headers=editor_headers,
    )
    assert r_goals.status_code == 200, r_goals.text

    before = _first_match(client, tid)["sides"]
    a_players = [p["id"] for p in before[0]["players"]]
    b_players = [p["id"] for p in before[1]["players"]]
    assert (before[0]["goals"], before[1]["goals"]) == (3, 1)

    r = client.patch(f"/matches/{mid}/swap-sides", headers=editor_headers)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}

    after = _first_match(client, tid)["sides"]
    assert [s["side"] for s in after] == ["A", "B"]
    assert [p["id"] for p in after[0]["players"]] == b_players
    assert [p["id"] for p in after[1]["players"]] == a_players
    assert (after[0]["goals"], after[1]["goals"]) == (1, 3)


def test_swap_sides_requires_editor(client, anon, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["SW4", "SW5", "SW6"]]
    tid = create_tournament(client, editor_headers, "swap-auth", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    mid = _first_match(client, tid)["id"]

    r_reader = anon.patch(f"/matches/{mid}/swap-sides")
    assert r_reader.status_code in (401, 403), r_reader.text


def test_swap_sides_on_a_done_tournament_needs_admin_after_the_grace_hour(client, editor_headers, admin_headers):
    ids = [create_player(client, admin_headers, n) for n in ["SW7", "SW8", "SW9"]]
    tid = create_tournament(client, editor_headers, "swap-done", "1v1", ids)
    generate(client, editor_headers, tid, randomize=False)

    t = client.get(f"/tournaments/{tid}").json()
    for match in t["matches"]:
        rf = client.patch(f"/matches/{match['id']}", json={"state": "finished"}, headers=editor_headers)
        assert rf.status_code == 200, rf.text
    assert client.get(f"/tournaments/{tid}").json()["status"] == "done"

    mid = t["matches"][0]["id"]
    r_editor_inside = client.patch(f"/matches/{mid}/swap-sides", headers=editor_headers)
    assert r_editor_inside.status_code == 200, r_editor_inside.text

    backdate_tournament_finish(tid)
    r_editor = client.patch(f"/matches/{mid}/swap-sides", headers=editor_headers)
    assert r_editor.status_code == 403, r_editor.text

    r_admin = client.patch(f"/matches/{mid}/swap-sides", headers=admin_headers)
    assert r_admin.status_code == 200, r_admin.text


def test_swap_sides_unknown_match_404(client, editor_headers):
    r = client.patch("/matches/999999/swap-sides", headers=editor_headers)
    assert r.status_code == 404, r.text
