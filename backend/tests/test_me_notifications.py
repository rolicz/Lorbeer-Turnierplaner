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
    assert client.post(
        f"/players/{editor_pid}/guestbook", json={"body": "hi editor"}, headers=admin_headers
    ).status_code == 200
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
    assert reply_item["path"] == f"/live/{tid}?comment={reply_id}"
    assert reply_item["author_name"] == "Admin"

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


def test_notifications_requires_auth(client):
    assert client.get("/me/notifications").status_code == 401
