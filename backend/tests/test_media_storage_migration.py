from datetime import datetime

from sqlmodel import Session

from app.db import get_engine
from app.models import CommentImage, CommentImageFile, PlayerAvatar, PlayerAvatarFile


def test_player_avatar_blob_migrates_on_get(client, admin_headers):
    pid = client.post("/players", json={"display_name": "legacy-avatar"}, headers=admin_headers).json()["id"]

    with Session(get_engine()) as s:
        s.add(
            PlayerAvatar(
                player_id=pid,
                content_type="image/webp",
                data=b"legacy-avatar-bytes",
                updated_at=datetime.utcnow(),
            )
        )
        s.commit()

    rg = client.get(f"/players/{pid}/avatar")
    assert rg.status_code == 200, rg.text
    assert rg.content == b"legacy-avatar-bytes"

    with Session(get_engine()) as s:
        assert s.get(PlayerAvatar, pid) is None
        row = s.get(PlayerAvatarFile, pid)
        assert row is not None
        assert row.file_path.startswith("avatars/")


def test_comment_image_blob_migrates_on_get(client, editor_headers, admin_headers):
    p1 = client.post("/players", json={"display_name": "legacy-c1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "legacy-c2"}, headers=admin_headers).json()["id"]
    tid = client.post(
        "/tournaments",
        json={"name": "legacy-comment-image", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]
    cid = client.post(
        f"/tournaments/{tid}/comments",
        json={"body": "legacy image comment"},
        headers=editor_headers,
    ).json()["id"]

    with Session(get_engine()) as s:
        s.add(
            CommentImage(
                comment_id=cid,
                content_type="image/webp",
                data=b"legacy-comment-bytes",
                updated_at=datetime.utcnow(),
            )
        )
        s.commit()

    rg = client.get(f"/comments/{cid}/image")
    assert rg.status_code == 200, rg.text
    assert rg.content == b"legacy-comment-bytes"

    with Session(get_engine()) as s:
        assert s.get(CommentImage, cid) is None
        row = s.get(CommentImageFile, cid)
        assert row is not None
        assert row.file_path.startswith("comments/")

