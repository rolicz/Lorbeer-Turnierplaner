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


def test_profile_poke_tracking_per_player(client, editor_headers, admin_headers):
    editor_id = _player_id_by_name(client, "Editor")
    admin_id = _player_id_by_name(client, "Admin")
    target_id = client.post("/players", json={"display_name": "PokeTarget"}, headers=admin_headers).json()["id"]

    # Can poke others, but not self.
    r_self = client.post(f"/players/{editor_id}/pokes", headers=editor_headers)
    assert r_self.status_code == 400, r_self.text

    r_poke = client.post(f"/players/{target_id}/pokes", headers=editor_headers)
    assert r_poke.status_code == 200, r_poke.text
    poke_id = int(r_poke.json()["id"])
    assert int(r_poke.json()["author_player_id"]) == editor_id
    assert int(r_poke.json()["profile_player_id"]) == target_id

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
