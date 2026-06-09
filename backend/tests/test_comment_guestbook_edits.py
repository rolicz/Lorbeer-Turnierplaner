"""Comment/guestbook edit rules (author-only + 1h window), comment reply trees, cascade delete."""
import datetime as dt

from sqlmodel import Session

from app.db import get_engine
from app.models import Comment, PlayerGuestbookEntry


def _player_ids(client):
    players = client.get("/players").json()
    editor = next(int(p["id"]) for p in players if p["display_name"] == "Editor")
    admin = next(int(p["id"]) for p in players if p["display_name"] == "Admin")
    return editor, admin


def _backdate_comment(cid: int, hours: float) -> None:
    with Session(get_engine()) as s:
        c = s.get(Comment, cid)
        c.created_at = dt.datetime.utcnow() - dt.timedelta(hours=hours)
        s.add(c)
        s.commit()


def test_comment_edit_only_real_author_even_when_general(client, editor_headers, admin_headers):
    editor_id, admin_id = _player_ids(client)
    tid = client.post(
        "/tournaments",
        json={"name": "edit", "mode": "1v1", "player_ids": [editor_id, admin_id]},
        headers=editor_headers,
    ).json()["id"]

    # Editor posts as "General": displayed author is None, but the real author is recorded.
    r = client.post(f"/tournaments/{tid}/comments", json={"body": "general msg"}, headers=editor_headers)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert r.json()["author_player_id"] is None
    assert r.json()["can_edit"] is True

    # The real author may edit a General comment.
    r2 = client.patch(f"/comments/{cid}", json={"body": "edited"}, headers=editor_headers)
    assert r2.status_code == 200, r2.text
    assert r2.json()["body"] == "edited"

    # Admin may edit anything.
    r3 = client.patch(f"/comments/{cid}", json={"body": "admin edited"}, headers=admin_headers)
    assert r3.status_code == 200, r3.text

    # A comment authored by admin cannot be edited by the (non-author) editor.
    cid_admin = client.post(f"/tournaments/{tid}/comments", json={"body": "admins"}, headers=admin_headers).json()["id"]
    blocked = client.patch(f"/comments/{cid_admin}", json={"body": "nope"}, headers=editor_headers)
    assert blocked.status_code == 403, blocked.text

    # An unauthenticated list never reports can_edit=True and keeps General anonymous.
    rows = client.get(f"/tournaments/{tid}/comments").json()["comments"]
    general = next(x for x in rows if x["id"] == cid)
    assert general["author_player_id"] is None
    assert general["can_edit"] is False


def test_comment_edit_window_expires(client, editor_headers, admin_headers):
    editor_id, admin_id = _player_ids(client)
    tid = client.post(
        "/tournaments",
        json={"name": "window", "mode": "1v1", "player_ids": [editor_id, admin_id]},
        headers=editor_headers,
    ).json()["id"]
    cid = client.post(f"/tournaments/{tid}/comments", json={"body": "old"}, headers=editor_headers).json()["id"]

    _backdate_comment(cid, hours=2)

    # Past the 1h window the author can no longer edit, and can_edit reflects it.
    late = client.patch(f"/comments/{cid}", json={"body": "too late"}, headers=editor_headers)
    assert late.status_code == 403, late.text
    row = next(
        x for x in client.get(f"/tournaments/{tid}/comments", headers=editor_headers).json()["comments"] if x["id"] == cid
    )
    assert row["can_edit"] is False

    # Admin is unrestricted by the window.
    fixed = client.patch(f"/comments/{cid}", json={"body": "admin fix"}, headers=admin_headers)
    assert fixed.status_code == 200, fixed.text


def test_comment_replies_tree_and_cascade_delete(client, editor_headers, admin_headers):
    editor_id, admin_id = _player_ids(client)
    tid = client.post(
        "/tournaments",
        json={"name": "replies", "mode": "1v1", "player_ids": [editor_id, admin_id]},
        headers=editor_headers,
    ).json()["id"]

    root = client.post(f"/tournaments/{tid}/comments", json={"body": "root"}, headers=editor_headers).json()
    rid = root["id"]
    assert root["parent_comment_id"] is None

    reply = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "reply", "parent_comment_id": rid},
        headers=editor_headers,
    )
    assert reply.status_code == 200, reply.text
    reply_id = reply.json()["id"]
    assert reply.json()["parent_comment_id"] == rid

    by_id = {x["id"]: x for x in client.get(f"/tournaments/{tid}/comments").json()["comments"]}
    assert by_id[reply_id]["parent_comment_id"] == rid
    assert by_id[rid]["parent_comment_id"] is None

    # Replies cannot carry goal/score semantics, and the parent must exist in this tournament.
    bad_event = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "x", "parent_comment_id": rid, "event_type": "score_update", "result_score_a": 1, "result_score_b": 0},
        headers=editor_headers,
    )
    assert bad_event.status_code == 400, bad_event.text
    bad_parent = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "x", "parent_comment_id": 999999},
        headers=editor_headers,
    )
    assert bad_parent.status_code == 400, bad_parent.text

    # Deleting the root cascades the reply subtree.
    d = client.delete(f"/comments/{rid}", headers=admin_headers)
    assert d.status_code == 200, d.text
    remaining = {x["id"] for x in client.get(f"/tournaments/{tid}/comments").json()["comments"]}
    assert rid not in remaining and reply_id not in remaining


def test_guestbook_edit_permissions_and_window(client, editor_headers, admin_headers):
    _, _ = _player_ids(client)
    profile_id = client.post("/players", json={"display_name": "Profile"}, headers=admin_headers).json()["id"]

    g = client.post(f"/players/{profile_id}/guestbook", json={"body": "hi there"}, headers=editor_headers)
    assert g.status_code == 200, g.text
    gid = g.json()["id"]

    # Author edits within the window.
    e1 = client.patch(f"/players/guestbook/{gid}", json={"body": "edited hi"}, headers=editor_headers)
    assert e1.status_code == 200, e1.text
    assert e1.json()["body"] == "edited hi"
    assert e1.json()["updated_at"] != e1.json()["created_at"]
    assert e1.json()["can_edit"] is True

    # Admin can edit anyone's entry.
    e2 = client.patch(f"/players/guestbook/{gid}", json={"body": "admin edit"}, headers=admin_headers)
    assert e2.status_code == 200, e2.text

    # can_edit surfaces in the author's list view.
    rows = client.get(f"/players/{profile_id}/guestbook", headers=editor_headers).json()
    assert next(x for x in rows if x["id"] == gid)["can_edit"] is True

    # An entry authored by admin cannot be edited by the (non-author) editor.
    g2 = client.post(f"/players/{profile_id}/guestbook", json={"body": "admin msg"}, headers=admin_headers).json()
    blocked = client.patch(f"/players/guestbook/{g2['id']}", json={"body": "nope"}, headers=editor_headers)
    assert blocked.status_code == 403, blocked.text

    # Window expiry blocks the author but not the admin.
    with Session(get_engine()) as s:
        ent = s.get(PlayerGuestbookEntry, gid)
        ent.created_at = dt.datetime.utcnow() - dt.timedelta(hours=2)
        s.add(ent)
        s.commit()
    late = client.patch(f"/players/guestbook/{gid}", json={"body": "too late"}, headers=editor_headers)
    assert late.status_code == 403, late.text
    admin_late = client.patch(f"/players/guestbook/{gid}", json={"body": "admin late ok"}, headers=admin_headers)
    assert admin_late.status_code == 200, admin_late.text
