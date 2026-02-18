def _player_id_by_name(client, name: str) -> int:
    rows = client.get("/players").json()
    row = next((p for p in rows if p.get("display_name") == name), None)
    assert row is not None
    return int(row["id"])


def test_profile_read_public_and_owner_only_edit(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    other_id = client.post("/players", json={"display_name": "ProfileOther"}, headers=admin_headers).json()["id"]

    # Public read for any player profile.
    rg = client.get(f"/players/{other_id}/profile")
    assert rg.status_code == 200, rg.text
    assert rg.json()["player_id"] == other_id
    assert rg.json()["bio"] == ""

    # Non-owner cannot edit someone else's profile.
    r_forbidden = client.patch(f"/players/{other_id}/profile", json={"bio": "x"}, headers=editor_headers)
    assert r_forbidden.status_code == 403, r_forbidden.text

    # Owner can edit own profile.
    r_ok = client.patch(f"/players/{editor_id}/profile", json={"bio": "hello world"}, headers=editor_headers)
    assert r_ok.status_code == 200, r_ok.text
    assert r_ok.json()["bio"] == "hello world"


def test_avatar_owner_only_edit(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    other_id = client.post("/players", json={"display_name": "AvatarOther"}, headers=admin_headers).json()["id"]

    files = {"file": ("avatar.webp", b"fake-avatar-bytes", "image/webp")}

    # Non-owner cannot edit someone else's avatar.
    r_forbidden = client.put(f"/players/{other_id}/avatar", files=files, headers=editor_headers)
    assert r_forbidden.status_code == 403, r_forbidden.text

    # Owner can upload/delete own avatar.
    r_put = client.put(f"/players/{editor_id}/avatar", files=files, headers=editor_headers)
    assert r_put.status_code == 200, r_put.text
    assert r_put.json()["player_id"] == editor_id

    r_get = client.get(f"/players/{editor_id}/avatar")
    assert r_get.status_code == 200, r_get.text
    assert r_get.content == b"fake-avatar-bytes"

    r_del = client.delete(f"/players/{editor_id}/avatar", headers=editor_headers)
    assert r_del.status_code == 204, r_del.text


def test_profile_header_owner_only_edit(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    other_id = client.post("/players", json={"display_name": "HeaderOther"}, headers=admin_headers).json()["id"]

    files = {"file": ("header.webp", b"fake-header-bytes", "image/webp")}

    r_forbidden = client.put(f"/players/{other_id}/header-image", files=files, headers=editor_headers)
    assert r_forbidden.status_code == 403, r_forbidden.text

    r_put = client.put(f"/players/{editor_id}/header-image", files=files, headers=editor_headers)
    assert r_put.status_code == 200, r_put.text

    r_get = client.get(f"/players/{editor_id}/header-image")
    assert r_get.status_code == 200, r_get.text
    assert r_get.content == b"fake-header-bytes"

    r_meta = client.get("/players/headers")
    assert r_meta.status_code == 200, r_meta.text
    assert any(int(x.get("player_id")) == editor_id for x in (r_meta.json() or []))

    r_del = client.delete(f"/players/{editor_id}/header-image", headers=editor_headers)
    assert r_del.status_code == 204, r_del.text


def test_profile_guestbook_create_list_delete(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    target_id = client.post("/players", json={"display_name": "GuestbookTarget"}, headers=admin_headers).json()["id"]

    # Editor can post on another player's guestbook.
    r_create = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "hello from editor"},
        headers=editor_headers,
    )
    assert r_create.status_code == 200, r_create.text
    row = r_create.json()
    assert int(row["profile_player_id"]) == int(target_id)
    assert int(row["author_player_id"]) == int(editor_id)
    assert row["body"] == "hello from editor"

    # Public list.
    r_list = client.get(f"/players/{target_id}/guestbook")
    assert r_list.status_code == 200, r_list.text
    rows = r_list.json() or []
    assert len(rows) == 1
    assert int(rows[0]["id"]) == int(row["id"])

    # Admin can delete.
    r_del_admin = client.delete(f"/players/guestbook/{row['id']}", headers=admin_headers)
    assert r_del_admin.status_code == 204, r_del_admin.text

    # Recreate and delete by author.
    r_create2 = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "second"},
        headers=editor_headers,
    )
    assert r_create2.status_code == 200, r_create2.text
    row2 = r_create2.json()
    r_del_author = client.delete(f"/players/guestbook/{row2['id']}", headers=editor_headers)
    assert r_del_author.status_code == 204, r_del_author.text


def test_admin_can_post_guestbook_and_poke_as_other_player(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    target_id = client.post("/players", json={"display_name": "ActorTarget"}, headers=admin_headers).json()["id"]

    r_gb = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "admin acts as editor", "author_player_id": editor_id},
        headers=admin_headers,
    )
    assert r_gb.status_code == 200, r_gb.text
    assert int(r_gb.json()["author_player_id"]) == int(editor_id)

    r_poke = client.post(
        f"/players/{target_id}/pokes",
        json={"author_player_id": editor_id},
        headers=admin_headers,
    )
    assert r_poke.status_code == 200, r_poke.text
    assert int(r_poke.json()["author_player_id"]) == int(editor_id)


def test_profile_guestbook_threads_recursive_delete(client, editor_headers, admin_headers):
    target_id = client.post("/players", json={"display_name": "GuestbookThreadTarget"}, headers=admin_headers).json()["id"]

    r_root = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "root"},
        headers=editor_headers,
    )
    assert r_root.status_code == 200, r_root.text
    root_id = int(r_root.json()["id"])
    assert r_root.json().get("parent_entry_id") is None

    r_reply = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "reply", "parent_entry_id": root_id},
        headers=admin_headers,
    )
    assert r_reply.status_code == 200, r_reply.text
    reply_id = int(r_reply.json()["id"])
    assert int(r_reply.json().get("parent_entry_id")) == root_id

    r_reply2 = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "reply2", "parent_entry_id": reply_id},
        headers=editor_headers,
    )
    assert r_reply2.status_code == 200, r_reply2.text
    reply2_id = int(r_reply2.json()["id"])
    assert int(r_reply2.json().get("parent_entry_id")) == reply_id

    r_list = client.get(f"/players/{target_id}/guestbook")
    assert r_list.status_code == 200, r_list.text
    rows = r_list.json() or []
    by_id = {int(x["id"]): x for x in rows}
    assert by_id[root_id]["parent_entry_id"] is None
    assert int(by_id[reply_id]["parent_entry_id"]) == root_id
    assert int(by_id[reply2_id]["parent_entry_id"]) == reply_id

    r_del = client.delete(f"/players/guestbook/{root_id}", headers=admin_headers)
    assert r_del.status_code == 204, r_del.text

    r_list2 = client.get(f"/players/{target_id}/guestbook")
    assert r_list2.status_code == 200, r_list2.text
    assert (r_list2.json() or []) == []


def test_profile_guestbook_reply_parent_must_match_profile(client, editor_headers, admin_headers):
    target_a = client.post("/players", json={"display_name": "GuestbookParentA"}, headers=admin_headers).json()["id"]
    target_b = client.post("/players", json={"display_name": "GuestbookParentB"}, headers=admin_headers).json()["id"]

    r_root = client.post(
        f"/players/{target_a}/guestbook",
        json={"body": "root-a"},
        headers=editor_headers,
    )
    assert r_root.status_code == 200, r_root.text
    root_id = int(r_root.json()["id"])

    r_bad = client.post(
        f"/players/{target_b}/guestbook",
        json={"body": "cross-profile-reply", "parent_entry_id": root_id},
        headers=admin_headers,
    )
    assert r_bad.status_code == 400, r_bad.text


def test_profile_guestbook_summary(client, editor_headers, admin_headers):
    target_id = client.post("/players", json={"display_name": "GuestbookSummaryTarget"}, headers=admin_headers).json()["id"]

    r_create1 = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "first"},
        headers=editor_headers,
    )
    assert r_create1.status_code == 200, r_create1.text
    row1 = r_create1.json()

    r_create2 = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "second"},
        headers=admin_headers,
    )
    assert r_create2.status_code == 200, r_create2.text
    row2 = r_create2.json()

    r_sum = client.get("/players/guestbook-summary")
    assert r_sum.status_code == 200, r_sum.text
    rows = r_sum.json() or []
    row = next((x for x in rows if int(x.get("profile_player_id", 0)) == int(target_id)), None)
    assert row is not None
    assert int(row["total_entries"]) == 2
    ids = [int(x) for x in (row.get("entry_ids") or [])]
    assert int(row1["id"]) in ids
    assert int(row2["id"]) in ids


def test_profile_guestbook_read_tracking_per_player(client, editor_headers, admin_headers):
    target_id = client.post("/players", json={"display_name": "GuestbookReadTarget"}, headers=admin_headers).json()["id"]

    r_editor = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "from editor"},
        headers=editor_headers,
    )
    assert r_editor.status_code == 200, r_editor.text
    eid_editor = int(r_editor.json()["id"])

    r_admin = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "from admin"},
        headers=admin_headers,
    )
    assert r_admin.status_code == 200, r_admin.text
    eid_admin = int(r_admin.json()["id"])

    # Author's own entry is auto-marked as read.
    r0 = client.get(f"/players/{target_id}/guestbook/read", headers=editor_headers)
    assert r0.status_code == 200, r0.text
    assert eid_editor in (r0.json().get("entry_ids") or [])
    assert eid_admin not in (r0.json().get("entry_ids") or [])

    r1 = client.put(f"/players/guestbook/{eid_admin}/read", headers=editor_headers)
    assert r1.status_code == 200, r1.text
    assert r1.json().get("ok") is True

    r2 = client.get(f"/players/{target_id}/guestbook/read", headers=editor_headers)
    assert r2.status_code == 200, r2.text
    ids2 = [int(x) for x in (r2.json().get("entry_ids") or [])]
    assert eid_editor in ids2 and eid_admin in ids2

    rmap = client.get("/players/guestbook-read-map", headers=editor_headers)
    assert rmap.status_code == 200, rmap.text
    row = next((x for x in (rmap.json() or []) if int(x.get("profile_player_id", 0)) == int(target_id)), None)
    assert row is not None
    ids_map = [int(x) for x in (row.get("entry_ids") or [])]
    assert eid_editor in ids_map and eid_admin in ids_map

    rall = client.put(f"/players/{target_id}/guestbook/read-all", headers=editor_headers)
    assert rall.status_code == 200, rall.text
    assert int(rall.json().get("marked", -1)) == 0


def test_profile_guestbook_votes_up_down_and_my_vote(client, editor_headers, admin_headers):
    target_id = client.post("/players", json={"display_name": "GuestbookVoteTarget"}, headers=admin_headers).json()["id"]

    r_entry = client.post(
        f"/players/{target_id}/guestbook",
        json={"body": "vote me"},
        headers=editor_headers,
    )
    assert r_entry.status_code == 200, r_entry.text
    entry_id = int(r_entry.json()["id"])

    # Public list: counters exist, my_vote neutral.
    r0 = client.get(f"/players/{target_id}/guestbook")
    assert r0.status_code == 200, r0.text
    row0 = next((x for x in (r0.json() or []) if int(x["id"]) == entry_id), None)
    assert row0 is not None
    assert int(row0.get("upvotes", -1)) == 0
    assert int(row0.get("downvotes", -1)) == 0
    assert int(row0.get("my_vote", 99)) == 0

    rv1 = client.put(f"/players/guestbook/{entry_id}/vote", json={"value": 1}, headers=editor_headers)
    assert rv1.status_code == 200, rv1.text
    assert int(rv1.json().get("value", 99)) == 1

    rv2 = client.put(f"/players/guestbook/{entry_id}/vote", json={"value": -1}, headers=admin_headers)
    assert rv2.status_code == 200, rv2.text
    assert int(rv2.json().get("value", 99)) == -1

    r_editor = client.get(f"/players/{target_id}/guestbook", headers=editor_headers)
    assert r_editor.status_code == 200, r_editor.text
    row_editor = next((x for x in (r_editor.json() or []) if int(x["id"]) == entry_id), None)
    assert row_editor is not None
    assert int(row_editor.get("upvotes", -1)) == 1
    assert int(row_editor.get("downvotes", -1)) == 1
    assert int(row_editor.get("my_vote", 99)) == 1

    r_admin = client.get(f"/players/{target_id}/guestbook", headers=admin_headers)
    assert r_admin.status_code == 200, r_admin.text
    row_admin = next((x for x in (r_admin.json() or []) if int(x["id"]) == entry_id), None)
    assert row_admin is not None
    assert int(row_admin.get("my_vote", 99)) == -1

    # Clear editor vote.
    rv3 = client.put(f"/players/guestbook/{entry_id}/vote", json={"value": 0}, headers=editor_headers)
    assert rv3.status_code == 200, rv3.text
    assert int(rv3.json().get("value", 99)) == 0

    r_after = client.get(f"/players/{target_id}/guestbook", headers=editor_headers)
    assert r_after.status_code == 200, r_after.text
    row_after = next((x for x in (r_after.json() or []) if int(x["id"]) == entry_id), None)
    assert row_after is not None
    assert int(row_after.get("upvotes", -1)) == 0
    assert int(row_after.get("downvotes", -1)) == 1
    assert int(row_after.get("my_vote", 99)) == 0

    rv_bad = client.put(f"/players/guestbook/{entry_id}/vote", json={"value": 2}, headers=editor_headers)
    assert rv_bad.status_code == 400, rv_bad.text


def test_profile_poke_tracking_per_player(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    editor_name = "Editor"
    target_id = client.post("/players", json={"display_name": "PokeTarget"}, headers=admin_headers).json()["id"]

    # Can poke others, but not self.
    r_self = client.post(f"/players/{editor_id}/pokes", headers=editor_headers)
    assert r_self.status_code == 400, r_self.text

    r_poke = client.post(f"/players/{target_id}/pokes", headers=editor_headers)
    assert r_poke.status_code == 200, r_poke.text
    poke_id = int(r_poke.json()["id"])
    assert int(r_poke.json()["author_player_id"]) == editor_id
    assert int(r_poke.json()["profile_player_id"]) == target_id

    # Public poke list shows who poked.
    r_list = client.get(f"/players/{target_id}/pokes")
    assert r_list.status_code == 200, r_list.text
    rows = r_list.json() or []
    assert len(rows) >= 1
    assert int(rows[0]["id"]) == poke_id
    assert int(rows[0]["author_player_id"]) == editor_id
    assert rows[0]["author_display_name"] == editor_name

    # Summary includes this poke under target profile.
    r_sum = client.get("/players/pokes-summary")
    assert r_sum.status_code == 200, r_sum.text
    row = next((x for x in (r_sum.json() or []) if int(x.get("profile_player_id", 0)) == int(target_id)), None)
    assert row is not None
    assert poke_id in [int(x) for x in (row.get("poke_ids") or [])]

    # Author's own poke is auto-marked as read.
    r_editor_read = client.get(f"/players/{target_id}/pokes/read", headers=editor_headers)
    assert r_editor_read.status_code == 200, r_editor_read.text
    assert poke_id in [int(x) for x in (r_editor_read.json().get("poke_ids") or [])]

    # Other players do not have it marked yet.
    r_admin_read = client.get(f"/players/{target_id}/pokes/read", headers=admin_headers)
    assert r_admin_read.status_code == 200, r_admin_read.text
    assert poke_id not in [int(x) for x in (r_admin_read.json().get("poke_ids") or [])]

    # read-map reflects per-profile poke reads.
    r_map = client.get("/players/pokes-read-map", headers=editor_headers)
    assert r_map.status_code == 200, r_map.text
    row_editor = next((x for x in (r_map.json() or []) if int(x.get("profile_player_id", 0)) == int(target_id)), None)
    assert row_editor is not None
    assert poke_id in [int(x) for x in (row_editor.get("poke_ids") or [])]

    # Mark all read for another player.
    r_mark = client.put(f"/players/{target_id}/pokes/read-all", headers=admin_headers)
    assert r_mark.status_code == 200, r_mark.text
    assert int(r_mark.json().get("marked", 0)) >= 1

    r_admin_read2 = client.get(f"/players/{target_id}/pokes/read", headers=admin_headers)
    assert r_admin_read2.status_code == 200, r_admin_read2.text
    assert poke_id in [int(x) for x in (r_admin_read2.json().get("poke_ids") or [])]


def test_profile_poke_authored_unread_summary(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    admin_id = _player_id_by_name(client, "Admin")
    target_id = client.post("/players", json={"display_name": "PokeAuthoredUnreadTarget"}, headers=admin_headers).json()["id"]

    # Editor pokes two different profiles.
    r_p1 = client.post(f"/players/{admin_id}/pokes", headers=editor_headers)
    assert r_p1.status_code == 200, r_p1.text
    r_p2 = client.post(f"/players/{target_id}/pokes", headers=editor_headers)
    assert r_p2.status_code == 200, r_p2.text

    r_sum = client.get("/players/pokes-authored-unread-summary", headers=editor_headers)
    assert r_sum.status_code == 200, r_sum.text
    rows = r_sum.json() or []
    row_admin = next((x for x in rows if int(x.get("profile_player_id", 0)) == int(admin_id)), None)
    row_target = next((x for x in rows if int(x.get("profile_player_id", 0)) == int(target_id)), None)
    assert row_admin is not None
    assert row_target is not None
    assert int(row_admin.get("unread_count", 0)) >= 1
    assert int(row_target.get("unread_count", 0)) >= 1

    # Admin marks own profile pokes as read -> authored unread for admin profile disappears.
    r_mark = client.put(f"/players/{admin_id}/pokes/read-all", headers=admin_headers)
    assert r_mark.status_code == 200, r_mark.text
    assert int(r_mark.json().get("marked", 0)) >= 1

    r_sum2 = client.get("/players/pokes-authored-unread-summary", headers=editor_headers)
    assert r_sum2.status_code == 200, r_sum2.text
    rows2 = r_sum2.json() or []
    row_admin2 = next((x for x in rows2 if int(x.get("profile_player_id", 0)) == int(admin_id)), None)
    assert row_admin2 is None or int(row_admin2.get("unread_count", 0)) == 0
