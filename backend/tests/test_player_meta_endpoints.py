def _player_id_by_name(client, name: str) -> int:
    rows = client.get("/players").json()
    row = next((p for p in rows if p.get("display_name") == name), None)
    assert row is not None
    return int(row["id"])


def test_player_profiles_meta_list(client, editor_headers):
    r_empty = client.get("/players/profiles")
    assert r_empty.status_code == 200, r_empty.text
    assert r_empty.json() == []

    editor_id = _player_id_by_name(client, "Editor")
    r_patch = client.patch(f"/players/{editor_id}/profile", json={"bio": "meta"}, headers=editor_headers)
    assert r_patch.status_code == 200, r_patch.text

    r = client.get("/players/profiles")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == {"player_id", "bio", "extras_json", "header_image_updated_at", "updated_at"}
    assert row["player_id"] == editor_id
    assert row["bio"] == "meta"
    assert row["extras_json"] == "{}"
    assert row["header_image_updated_at"] is None
    assert row["updated_at"]


def test_player_avatars_meta_list(client, editor_headers):
    r_empty = client.get("/players/avatars")
    assert r_empty.status_code == 200, r_empty.text
    assert r_empty.json() == []

    editor_id = _player_id_by_name(client, "Editor")
    files = {"file": ("avatar.webp", b"fake-avatar-bytes", "image/webp")}
    r_put = client.put(f"/players/{editor_id}/avatar", files=files, headers=editor_headers)
    assert r_put.status_code == 200, r_put.text

    r = client.get("/players/avatars")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    assert set(rows[0]) == {"player_id", "updated_at"}
    assert rows[0]["player_id"] == editor_id
    assert rows[0]["updated_at"]
