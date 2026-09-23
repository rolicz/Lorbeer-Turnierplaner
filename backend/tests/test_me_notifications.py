def _pid(client, headers) -> int:
    r = client.get("/me", headers=headers)
    assert r.status_code == 200, r.text
    return int(r.json()["player_id"])


def _kinds(items):
    return {it["kind"] for it in items}


def test_notifications_collect_reply_guestbook_and_poke(client, editor_headers, admin_headers):
    editor_pid = _pid(client, editor_headers)
    admin_pid = _pid(client, admin_headers)

    tid = client.post(
        "/tournaments",
        json={"name": "notif", "mode": "1v1", "player_ids": [editor_pid, admin_pid]},
        headers=editor_headers,
    ).json()["id"]

    # Editor writes a (General) comment; admin replies to it.
    parent = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "my hot take"},
        headers=editor_headers,
    )
    assert parent.status_code == 200, parent.text
    parent_id = parent.json()["id"]

    reply = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "no way", "parent_comment_id": parent_id, "author_player_id": admin_pid},
        headers=admin_headers,
    )
    assert reply.status_code == 200, reply.text
    reply_id = reply.json()["id"]

    # Admin leaves a guestbook entry + a poke on the editor's profile.
    gb = client.post(
        f"/players/{editor_pid}/guestbook", json={"body": "hi editor"}, headers=admin_headers
    )
    assert gb.status_code == 200, gb.text
    gb_id = gb.json()["id"]
    assert client.post(f"/players/{editor_pid}/pokes", json={}, headers=admin_headers).status_code == 200

    # Editor's notifications include all three, newest-first, with deep-link paths.
    r = client.get("/me/notifications", headers=editor_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data["items"]
    assert _kinds(items) == {"comment_reply", "guestbook", "poke"}
    assert data["unread_count"] == 3

    reply_item = next(it for it in items if it["kind"] == "comment_reply")
    assert reply_item["id"] == reply_id
    assert reply_item["path"] == f"/g/altherren/live/{tid}?comment={reply_id}"
    assert reply_item["author_name"] == "Admin"

    # The guestbook item must deep-link to the guestbook tab AND the entry, so the
    # profile can switch tabs and scroll to it (a #hash cannot do either).
    gb_item = next(it for it in items if it["kind"] == "guestbook")
    assert gb_item["id"] == gb_id
    assert gb_item["path"] == f"/g/altherren/profiles/{editor_pid}?tab=guestbook&entry={gb_id}"
    assert gb_item["author_name"] == "Admin"

    poke_item = next(it for it in items if it["kind"] == "poke")
    assert poke_item["path"] == f"/g/altherren/profiles/{editor_pid}"

    # Admin should NOT see the reply (admin wrote it) nor a poke/guestbook to itself.
    r_admin = client.get("/me/notifications", headers=admin_headers)
    assert r_admin.status_code == 200, r_admin.text
    assert all(it["kind"] != "comment_reply" or it["id"] != reply_id for it in r_admin.json()["items"])


def test_notifications_exclude_self_authored_and_read(client, editor_headers, admin_headers):
    editor_pid = _pid(client, editor_headers)
    admin_pid = _pid(client, admin_headers)

    # Editor writing on their OWN guestbook must not notify themselves.
    assert client.post(
        f"/players/{editor_pid}/guestbook", json={"body": "note to self"}, headers=editor_headers
    ).status_code == 200

    tid = client.post(
        "/tournaments",
        json={"name": "notif2", "mode": "1v1", "player_ids": [editor_pid, admin_pid]},
        headers=editor_headers,
    ).json()["id"]
    parent_id = client.post(
        f"/tournaments/{tid}/comments", json={"body": "take"}, headers=editor_headers
    ).json()["id"]
    reply_id = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "reply", "parent_comment_id": parent_id},
        headers=admin_headers,
    ).json()["id"]

    before = client.get("/me/notifications", headers=editor_headers).json()
    assert _kinds(before["items"]) == {"comment_reply"}  # self guestbook excluded

    # Once the editor reads the reply, it drops off.
    assert client.put(f"/comments/{reply_id}/read", headers=editor_headers).status_code == 200
    after = client.get("/me/notifications", headers=editor_headers).json()
    assert after["unread_count"] == 0
    assert after["items"] == []


def test_notifications_requires_auth(anon):
    assert anon.get("/me/notifications").status_code == 401


def _create_idea(client, headers, **overrides) -> dict:
    payload = {
        "title": "Dark mode for the match page",
        "body": "The score panel glows at night.",
        "kind": "feature",
        "areas": ["match"],
    }
    payload.update(overrides)
    r = client.post("/ideas", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_idea_events_reach_the_bell_and_drop_off_when_read(
    client, editor_headers, editor2_headers, admin_headers
):
    """P3: the four idea event kinds join the bell, with the same read/unread rules
    as the three existing kinds — and never reach the actor of their own action."""
    iid = _create_idea(client, editor_headers)["id"]
    admin_own_id = _create_idea(client, admin_headers, title="Admin's own idea")["id"]

    assert client.post(
        f"/ideas/{iid}/comments", json={"body": "It is bright at night."}, headers=editor2_headers
    ).status_code == 200
    assert client.put(f"/ideas/{iid}/vote", json={"value": 1}, headers=editor2_headers).status_code == 200
    assert client.put(
        f"/ideas/{iid}/status", json={"status": "planned", "note": "after FC 27"}, headers=admin_headers
    ).status_code == 200

    # --- Editor (the idea's author) sees the three idea kinds, all pointing home ---
    editor_items = client.get("/me/notifications", headers=editor_headers).json()["items"]
    mine = [it for it in editor_items if it.get("idea_id") == iid]
    assert {it["kind"] for it in mine} == {"idea_comment", "idea_vote", "idea_status"}
    for it in mine:
        assert it["path"] == f"/g/altherren/ideas?idea={iid}"
        assert it["idea_title"] == "Dark mode for the match page"
        expected_author = "Admin" if it["kind"] == "idea_status" else "Editor2"
        assert it["author_name"] == expected_author
    comment_item = next(it for it in mine if it["kind"] == "idea_comment")
    assert comment_item["snippet"] == "It is bright at night."
    status_item = next(it for it in mine if it["kind"] == "idea_status")
    assert status_item["snippet"] == "after FC 27"
    assert status_item["idea_status"] == "planned"

    # --- Editor2, the actor for the comment and the vote, never sees their own act ---
    editor2_items = client.get("/me/notifications", headers=editor2_headers).json()["items"]
    assert all(it.get("idea_id") != iid for it in editor2_items)

    # --- Admin sees exactly one "created" item: Editor's idea, never their own ---
    admin_items = client.get("/me/notifications", headers=admin_headers).json()["items"]
    created = [it for it in admin_items if it["kind"] == "idea_created"]
    assert {it["idea_id"] for it in created} == {iid}
    assert admin_own_id not in {it["idea_id"] for it in created}

    # --- Reading marks every event on the idea read for that viewer ---
    assert client.put(f"/ideas/{iid}/read", headers=editor_headers).status_code == 200
    after_read = client.get("/me/notifications", headers=editor_headers).json()
    assert all(it.get("idea_id") != iid for it in after_read["items"])

    # --- An unvote removes the vote item for a fresh viewer ---
    iid2 = _create_idea(client, editor_headers, title="A second idea")["id"]
    assert client.put(f"/ideas/{iid2}/vote", json={"value": 1}, headers=editor2_headers).status_code == 200
    before_unvote = client.get("/me/notifications", headers=editor_headers).json()["items"]
    assert any(it["kind"] == "idea_vote" and it["idea_id"] == iid2 for it in before_unvote)

    assert client.put(f"/ideas/{iid2}/vote", json={"value": 0}, headers=editor2_headers).status_code == 200
    after_unvote = client.get("/me/notifications", headers=editor_headers).json()["items"]
    assert not any(it["kind"] == "idea_vote" and it["idea_id"] == iid2 for it in after_unvote)
