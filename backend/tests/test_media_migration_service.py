from datetime import datetime

from sqlmodel import Session

from app.db import get_engine
from app.models import CommentImage, CommentImageFile, PlayerAvatar, PlayerAvatarFile
from app.services.media_migration import migrate_blob_media_to_files


def test_migrate_blob_media_to_files_moves_and_purges_rows(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "mig-a1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "mig-a2"}, headers=admin_headers).json()["id"]
    tid = client.post(
        "/tournaments",
        json={"name": "mig-media", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]
    cid = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "has image"},
        headers=editor_headers,
    ).json()["id"]

    now = datetime.utcnow()
    with Session(get_engine()) as s:
        s.add(PlayerAvatar(player_id=p1, content_type="image/webp", data=b"av-bytes", updated_at=now))
        s.add(CommentImage(comment_id=cid, content_type="image/webp", data=b"co-bytes", updated_at=now))
        s.commit()

    with Session(get_engine()) as s:
        out = migrate_blob_media_to_files(s, dry_run=False)
        s.commit()

    assert out.avatars_scanned == 1
    assert out.comments_scanned == 1
    assert out.avatars_blob_deleted == 1
    assert out.comments_blob_deleted == 1

    with Session(get_engine()) as s:
        assert s.get(PlayerAvatar, p1) is None
        assert s.get(CommentImage, cid) is None
        assert s.get(PlayerAvatarFile, p1) is not None
        assert s.get(CommentImageFile, cid) is not None


def test_migrate_blob_media_to_files_dry_run_keeps_blob_rows(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "mig-dr1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "mig-dr2"}, headers=admin_headers).json()["id"]
    tid = client.post(
        "/tournaments",
        json={"name": "mig-media-dry", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]
    cid = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "dry image"},
        headers=editor_headers,
    ).json()["id"]

    now = datetime.utcnow()
    with Session(get_engine()) as s:
        s.add(PlayerAvatar(player_id=p1, content_type="image/webp", data=b"av-dry", updated_at=now))
        s.add(CommentImage(comment_id=cid, content_type="image/webp", data=b"co-dry", updated_at=now))
        s.commit()

    with Session(get_engine()) as s:
        out = migrate_blob_media_to_files(s, dry_run=True)
        s.rollback()

    assert out.avatars_scanned == 1
    assert out.comments_scanned == 1

    with Session(get_engine()) as s:
        assert s.get(PlayerAvatar, p1) is not None
        assert s.get(CommentImage, cid) is not None

