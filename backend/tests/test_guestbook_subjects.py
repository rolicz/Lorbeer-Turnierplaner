"""
A guestbook entry can be *about* the profile's header image, its About text or its
avatar (K1) — and the whole point is that it still makes sense after the picture or the
text has been replaced. These tests are about the pin: one copy per version, shared by
every entry about that version, released with the last entry that names it, and swept
when a rollback leaves one behind.

Nothing about the existing guestbook moves: `test_me_notifications.py`,
`test_push_notifications.py::test_guestbook_and_poke_enqueue_push` and
`test_realtime_events.py::test_guestbook_writes_reach_the_profile_channel` staying green
is the other half of that proof.
"""
import datetime as dt
from pathlib import Path

from sqlmodel import Session, select

from app.db import get_engine, init_db
from app.models import PlayerGuestbookEntrySubject, PlayerSubjectSnapshot
from app.services import notifications as notifications_service

HEADER_A = b"header-bytes-A"
HEADER_B = b"header-bytes-B"
AVATAR_A = b"avatar-bytes-A"


def _player_id_by_name(client, name: str) -> int:
    rows = client.get("/players").json()
    row = next((p for p in rows if p.get("display_name") == name), None)
    assert row is not None
    return int(row["id"])


def _subject_dir(tmp_path) -> Path:
    return Path(tmp_path) / "uploads" / "guestbook_subjects"


def _subject_files(tmp_path) -> list[str]:
    d = _subject_dir(tmp_path)
    return sorted(p.name for p in d.iterdir() if p.is_file()) if d.is_dir() else []


def _put_header(client, headers, player_id: int, data: bytes):
    r = client.put(
        f"/players/{player_id}/header-image",
        files={"file": ("header.webp", data, "image/webp")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r


def _put_avatar(client, headers, player_id: int, data: bytes):
    r = client.put(
        f"/players/{player_id}/avatar",
        files={"file": ("avatar.webp", data, "image/webp")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r


def _post(client, headers, player_id: int, body: str, **extra):
    return client.post(f"/players/{player_id}/guestbook", json={"body": body, **extra}, headers=headers)


def _entry(client, player_id: int, entry_id: int) -> dict:
    rows = client.get(f"/players/{player_id}/guestbook").json()
    row = next((r for r in rows if int(r["id"]) == int(entry_id)), None)
    assert row is not None
    return row


def test_a_subject_comment_pins_a_copy_of_the_current_header_image(
    client, editor_headers, editor2_headers, tmp_path
):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)

    r = _post(client, editor2_headers, owner_id, "nice", subject_kind="header_image")
    assert r.status_code == 200, r.text
    subject = r.json()["subject"]
    assert subject is not None
    assert subject["kind"] == "header_image"
    assert subject["has_image"] is True
    assert subject["current"] is True
    assert subject["text"] == ""
    snapshot_id = int(subject["snapshot_id"])

    r_img = client.get(f"/players/guestbook-subjects/{snapshot_id}/image")
    assert r_img.status_code == 200, r_img.text
    assert r_img.content == HEADER_A
    assert r_img.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert len(_subject_files(tmp_path)) == 1

    # The picture moves on; the entry does not.
    _put_header(client, editor_headers, owner_id, HEADER_B)
    listed = _entry(client, owner_id, int(r.json()["id"]))
    assert listed["subject"]["current"] is False
    assert listed["subject"]["snapshot_id"] == snapshot_id
    assert client.get(f"/players/guestbook-subjects/{snapshot_id}/image").content == HEADER_A
    assert client.get(f"/players/{owner_id}/header-image").content == HEADER_B


def test_two_comments_on_the_same_image_share_one_copy(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)

    first = _post(client, editor2_headers, owner_id, "one", subject_kind="header_image")
    second = _post(client, editor2_headers, owner_id, "two", subject_kind="header_image")
    assert first.status_code == 200 and second.status_code == 200, second.text
    assert first.json()["subject"]["snapshot_id"] == second.json()["subject"]["snapshot_id"]
    assert len(_subject_files(tmp_path)) == 1


def test_a_new_upload_then_a_comment_pins_a_second_copy(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)
    first = _post(client, editor2_headers, owner_id, "old one", subject_kind="header_image")
    _put_header(client, editor_headers, owner_id, HEADER_B)
    second = _post(client, editor2_headers, owner_id, "new one", subject_kind="header_image")
    assert second.status_code == 200, second.text

    sid_a = int(first.json()["subject"]["snapshot_id"])
    sid_b = int(second.json()["subject"]["snapshot_id"])
    assert sid_a != sid_b
    assert len(_subject_files(tmp_path)) == 2
    assert client.get(f"/players/guestbook-subjects/{sid_a}/image").content == HEADER_A
    assert client.get(f"/players/guestbook-subjects/{sid_b}/image").content == HEADER_B

    assert _entry(client, owner_id, int(first.json()["id"]))["subject"]["current"] is False
    assert _entry(client, owner_id, int(second.json()["id"]))["subject"]["current"] is True


def test_avatar_pins_the_same_way(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, AVATAR_A)

    r = _post(client, editor2_headers, owner_id, "good face", subject_kind="avatar")
    assert r.status_code == 200, r.text
    subject = r.json()["subject"]
    assert subject["kind"] == "avatar" and subject["current"] is True and subject["has_image"] is True
    assert client.get(f"/players/guestbook-subjects/{subject['snapshot_id']}/image").content == AVATAR_A
    assert len(_subject_files(tmp_path)) == 1

    _put_avatar(client, editor_headers, owner_id, b"avatar-bytes-B")
    assert _entry(client, owner_id, int(r.json()["id"]))["subject"]["current"] is False


def test_about_comment_snapshots_the_text_and_current_follows_the_text(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    assert client.patch(f"/players/{owner_id}/profile", json={"bio": "hello"}, headers=editor_headers).status_code == 200

    r = _post(client, editor2_headers, owner_id, "good words", subject_kind="about")
    assert r.status_code == 200, r.text
    subject = r.json()["subject"]
    assert subject["kind"] == "about"
    assert subject["text"] == "hello"
    assert subject["has_image"] is False
    assert subject["current"] is True
    entry_id = int(r.json()["id"])
    # No file for a text snapshot.
    assert _subject_files(tmp_path) == []

    client.patch(f"/players/{owner_id}/profile", json={"bio": "bye"}, headers=editor_headers)
    assert _entry(client, owner_id, entry_id)["subject"]["current"] is False

    # Back to the same words: a new version, but not a change — `current` is text
    # equality, which is the whole reason it is not version equality here.
    client.patch(f"/players/{owner_id}/profile", json={"bio": "hello"}, headers=editor_headers)
    listed = _entry(client, owner_id, entry_id)
    assert listed["subject"]["current"] is True
    assert listed["subject"]["text"] == "hello"


def test_no_image_or_empty_about_is_409_and_nothing_is_written(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    before = len(client.get(f"/players/{owner_id}/guestbook").json())

    for kind, word in (("header_image", "header image"), ("avatar", "avatar"), ("about", "About text")):
        r = _post(client, editor2_headers, owner_id, "about nothing", subject_kind=kind)
        assert r.status_code == 409, r.text
        assert word in r.json()["detail"]

    assert len(client.get(f"/players/{owner_id}/guestbook").json()) == before
    assert _subject_files(tmp_path) == []
    with Session(get_engine()) as s:
        assert s.exec(select(PlayerSubjectSnapshot)).all() == []


def test_a_reply_cannot_carry_a_subject_and_an_unknown_kind_is_400(client, editor_headers, editor2_headers):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)

    root = _post(client, editor2_headers, owner_id, "root", subject_kind="header_image")
    assert root.status_code == 200, root.text

    r_reply = _post(
        client, editor2_headers, owner_id, "reply", parent_entry_id=int(root.json()["id"]), subject_kind="header_image"
    )
    assert r_reply.status_code == 400, r_reply.text
    assert "reply" in r_reply.json()["detail"].lower()

    r_unknown = _post(client, editor2_headers, owner_id, "huh", subject_kind="trophy_cabinet")
    assert r_unknown.status_code == 400, r_unknown.text

    # An empty string is "no subject", not an error.
    r_empty = _post(client, editor2_headers, owner_id, "plain", subject_kind="")
    assert r_empty.status_code == 200, r_empty.text
    assert r_empty.json()["subject"] is None


def test_editing_an_entry_keeps_its_subject(client, editor_headers, editor2_headers):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)
    created = _post(client, editor2_headers, owner_id, "first words", subject_kind="header_image")
    assert created.status_code == 200, created.text

    r = client.patch(
        f"/players/guestbook/{created.json()['id']}", json={"body": "better words"}, headers=editor2_headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["body"] == "better words"
    assert r.json()["subject"] == created.json()["subject"]


def test_untagged_entries_have_no_subject(client, editor2_headers):
    owner_id = _player_id_by_name(client, "Editor")
    created = _post(client, editor2_headers, owner_id, "just a hello")
    assert created.status_code == 200, created.text
    assert created.json()["subject"] is None
    assert _entry(client, owner_id, int(created.json()["id"]))["subject"] is None


def test_deleting_the_last_entry_removes_the_copy_but_a_shared_one_survives(
    client, editor_headers, editor2_headers, tmp_path
):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)
    first = _post(client, editor2_headers, owner_id, "one", subject_kind="header_image")
    second = _post(client, editor2_headers, owner_id, "two", subject_kind="header_image")
    snapshot_id = int(first.json()["subject"]["snapshot_id"])
    assert len(_subject_files(tmp_path)) == 1

    assert client.delete(f"/players/guestbook/{first.json()['id']}", headers=editor2_headers).status_code == 204
    assert len(_subject_files(tmp_path)) == 1
    assert client.get(f"/players/guestbook-subjects/{snapshot_id}/image").status_code == 200

    assert client.delete(f"/players/guestbook/{second.json()['id']}", headers=editor2_headers).status_code == 204
    assert _subject_files(tmp_path) == []
    assert client.get(f"/players/guestbook-subjects/{snapshot_id}/image").status_code == 404
    with Session(get_engine()) as s:
        assert s.exec(select(PlayerSubjectSnapshot)).all() == []
        assert s.exec(select(PlayerGuestbookEntrySubject)).all() == []

    # A root deleted as a subtree releases its subject too.
    _put_avatar(client, editor_headers, owner_id, AVATAR_A)
    root = _post(client, editor2_headers, owner_id, "root", subject_kind="avatar")
    reply = _post(client, editor2_headers, owner_id, "reply", parent_entry_id=int(root.json()["id"]))
    assert reply.status_code == 200, reply.text
    assert len(_subject_files(tmp_path)) == 1
    assert client.delete(f"/players/guestbook/{root.json()['id']}", headers=editor2_headers).status_code == 204
    assert _subject_files(tmp_path) == []


def test_deleting_the_avatar_or_header_leaves_the_pinned_copy(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)
    _put_avatar(client, editor_headers, owner_id, AVATAR_A)
    header_entry = _post(client, editor2_headers, owner_id, "banner", subject_kind="header_image")
    avatar_entry = _post(client, editor2_headers, owner_id, "face", subject_kind="avatar")
    header_sid = int(header_entry.json()["subject"]["snapshot_id"])
    avatar_sid = int(avatar_entry.json()["subject"]["snapshot_id"])

    assert client.delete(f"/players/{owner_id}/header-image", headers=editor_headers).status_code == 204
    assert client.delete(f"/players/{owner_id}/avatar", headers=editor_headers).status_code == 204

    assert client.get(f"/players/guestbook-subjects/{header_sid}/image").content == HEADER_A
    assert client.get(f"/players/guestbook-subjects/{avatar_sid}/image").content == AVATAR_A
    assert len(_subject_files(tmp_path)) == 2
    # The subject is gone from the profile, so nothing is current any more.
    rows = client.get(f"/players/{owner_id}/guestbook").json()
    assert all(row["subject"]["current"] is False for row in rows if row["subject"])


def test_a_tagged_entry_notifies_exactly_once(client, editor_headers, editor2_headers, monkeypatch):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)

    # An untagged entry first, as the yardstick for what a push carries.
    plain_messages: list = []
    monkeypatch.setattr(
        notifications_service,
        "enqueue_personal_push",
        lambda request, player_id, message: plain_messages.append(message),
    )
    assert _post(client, editor2_headers, owner_id, "plain hello").status_code == 200
    assert len(plain_messages) == 1

    messages: list = []
    targets: list = []
    monkeypatch.setattr(
        notifications_service,
        "enqueue_personal_push",
        lambda request, player_id, message: (targets.append(player_id), messages.append(message)),
    )
    created = _post(client, editor2_headers, owner_id, "about your banner", subject_kind="header_image")
    assert created.status_code == 200, created.text

    # A subject is the same entry with one more field — it says nothing new to anybody.
    assert len(messages) == 1
    assert targets == [owner_id]
    assert messages[0].event_type == "guestbook_created"
    assert set(messages[0].text_context) == set(plain_messages[0].text_context)

    items = client.get("/me/notifications", headers=editor_headers).json()["items"]
    guestbook_items = [i for i in items if i["kind"] == "guestbook"]
    # One item per entry, and the tagged one is a `guestbook` item like any other — no
    # second kind, no second row for the subject.
    assert len(guestbook_items) == 2
    assert {i["kind"] for i in items} == {"guestbook"}
    tagged = [i for i in guestbook_items if int(i["id"]) == int(created.json()["id"])]
    assert len(tagged) == 1
    assert tagged[0]["path"] == f"/profiles/{owner_id}?tab=guestbook&entry={created.json()['id']}"


def test_orphans_are_swept_at_startup(client, editor_headers, editor2_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, HEADER_A)
    kept = _post(client, editor2_headers, owner_id, "keep me", subject_kind="header_image")
    kept_sid = int(kept.json()["subject"]["snapshot_id"])

    # What a rollback leaves: a link whose entry is gone, a snapshot with a file and no
    # link, and a file nothing points at.
    with Session(get_engine()) as s:
        s.add(PlayerGuestbookEntrySubject(entry_id=999_001, snapshot_id=kept_sid))
        loose = PlayerSubjectSnapshot(
            player_id=owner_id,
            kind="avatar",
            source_updated_at=dt.datetime.utcnow(),
            content_type="image/webp",
            file_path="guestbook_subjects/999002.webp",
            file_size=3,
        )
        s.add(loose)
        s.commit()
    (_subject_dir(tmp_path) / "999002.webp").write_bytes(b"abc")
    (_subject_dir(tmp_path) / "strayfile.webp").write_bytes(b"xyz")
    assert len(_subject_files(tmp_path)) == 3

    init_db()

    assert sorted(_subject_files(tmp_path)) == [f"{kept_sid}.webp"]
    with Session(get_engine()) as s:
        assert [int(r.entry_id) for r in s.exec(select(PlayerGuestbookEntrySubject)).all()] == [
            int(kept.json()["id"])
        ]
        assert [int(r.id) for r in s.exec(select(PlayerSubjectSnapshot)).all()] == [kept_sid]

    # The entry that was kept is untouched, and a second boot finds nothing to do.
    assert _entry(client, owner_id, int(kept.json()["id"]))["subject"]["snapshot_id"] == kept_sid
    from app.services.guestbook_subjects import sweep_orphan_subjects

    assert sweep_orphan_subjects(get_engine()) == 0
