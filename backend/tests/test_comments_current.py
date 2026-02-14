def test_comments_create_list_pin_and_delete(client, editor_headers, admin_headers):
    # create tournament with players
    p1 = client.post("/players", json={"display_name": "C1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "C2"}, headers=admin_headers).json()["id"]

    tid = client.post(
        "/tournaments",
        json={"name": "comments", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]

    # tournament comment (general)
    r = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "hello"},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    # list
    r2 = client.get(f"/tournaments/{tid}/comments")
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert data["pinned_comment_id"] is None
    assert len(data["comments"]) == 1

    # pin
    r3 = client.put(
        f"/tournaments/{tid}/comments/pin",
        json={"comment_id": cid},
        headers=editor_headers,
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["pinned_comment_id"] == cid

    r4 = client.get(f"/tournaments/{tid}/comments").json()
    assert r4["pinned_comment_id"] == cid

    # delete requires admin
    r5 = client.delete(f"/comments/{cid}", headers=editor_headers)
    assert r5.status_code == 403, r5.text

    r6 = client.delete(f"/comments/{cid}", headers=admin_headers)
    assert r6.status_code == 200, r6.text
    assert r6.json()["ok"] is True

    r7 = client.get(f"/tournaments/{tid}/comments").json()
    assert r7["pinned_comment_id"] is None
    assert r7["comments"] == []


def test_comments_summary_endpoints(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "S1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "S2"}, headers=admin_headers).json()["id"]

    tid = client.post(
        "/tournaments",
        json={"name": "comments-summary", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]

    r = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "summary hello"},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    # This one must exist and must not be shadowed by "/tournaments/{tournament_id}".
    s1 = client.get("/tournaments/comments-summary")
    assert s1.status_code == 200, s1.text
    rows = s1.json()
    row = next((x for x in rows if x["tournament_id"] == tid), None)
    assert row is not None
    assert cid in row.get("comment_ids", [])

    # Secondary endpoint (non-tournaments prefix) should behave the same.
    s2 = client.get("/comments/tournaments-summary")
    assert s2.status_code == 200, s2.text


def test_comment_author_must_be_tournament_player(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "A1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "A2"}, headers=admin_headers).json()["id"]
    outsider = client.post("/players", json={"display_name": "OUT"}, headers=admin_headers).json()["id"]

    tid = client.post(
        "/tournaments",
        json={"name": "comments-author", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]

    r = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "hi", "author_player_id": outsider},
        headers=editor_headers,
    )
    assert r.status_code == 403, r.text


def test_match_comment_requires_match_in_tournament(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "M1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "M2"}, headers=admin_headers).json()["id"]
    p3 = client.post("/players", json={"display_name": "M3"}, headers=admin_headers).json()["id"]

    tid1 = client.post(
        "/tournaments",
        json={"name": "t1", "mode": "1v1", "player_ids": [p1, p2, p3]},
        headers=editor_headers,
    ).json()["id"]
    rgen = client.post(f"/tournaments/{tid1}/generate", json={"randomize": False}, headers=editor_headers)
    assert rgen.status_code == 200, rgen.text
    mid1 = client.get(f"/tournaments/{tid1}").json()["matches"][0]["id"]

    tid2 = client.post(
        "/tournaments",
        json={"name": "t2", "mode": "1v1", "player_ids": [p2, p3]},
        headers=editor_headers,
    ).json()["id"]

    r = client.post(
        f"/tournaments/{tid2}/comments",
        json={"body": "bad ref", "match_id": mid1},
        headers=editor_headers,
    )
    assert r.status_code == 400, r.text


def test_comment_image_editor_or_admin_and_image_only_comment_allowed(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "I1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "I2"}, headers=admin_headers).json()["id"]

    tid = client.post(
        "/tournaments",
        json={"name": "comments-image", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]

    # Empty comment without image hint is rejected.
    r0 = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": ""},
        headers=editor_headers,
    )
    assert r0.status_code == 400, r0.text

    # Image-only comment placeholder is also allowed for editor.
    r1 = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "", "has_image": True},
        headers=editor_headers,
    )
    assert r1.status_code == 200, r1.text
    cid = r1.json()["id"]
    assert r1.json()["has_image"] is False

    # Upload image: editor allowed.
    files = {"file": ("comment.webp", b"fakewebpdata", "image/webp")}
    r2 = client.put(f"/comments/{cid}/image", files=files, headers=editor_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["has_image"] is True
    assert r2.json()["image_updated_at"] is not None

    rl = client.get(f"/tournaments/{tid}/comments")
    assert rl.status_code == 200, rl.text
    rows = rl.json()["comments"]
    row = next((x for x in rows if x["id"] == cid), None)
    assert row is not None
    assert row["has_image"] is True

    rg = client.get(f"/comments/{cid}/image")
    assert rg.status_code == 200, rg.text
    assert rg.content == b"fakewebpdata"

    # Empty body edit is valid while image exists.
    r4 = client.patch(f"/comments/{cid}", json={"body": ""}, headers=editor_headers)
    assert r4.status_code == 200, r4.text

    # Delete image (editor can do this too), then empty body should be invalid again.
    r5 = client.delete(f"/comments/{cid}/image", headers=editor_headers)
    assert r5.status_code == 200, r5.text
    r6 = client.patch(f"/comments/{cid}", json={"body": ""}, headers=editor_headers)
    assert r6.status_code == 400, r6.text
