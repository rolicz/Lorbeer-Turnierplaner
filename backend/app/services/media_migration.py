from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from ..models import CommentImage, CommentImageFile, PlayerAvatar, PlayerAvatarFile
from .file_storage import (
    delete_media,
    media_exists,
    media_path_for_avatar,
    media_path_for_comment,
    write_media,
)


@dataclass
class MediaMigrationResult:
    avatars_scanned: int = 0
    avatars_written: int = 0
    avatars_blob_deleted: int = 0
    comments_scanned: int = 0
    comments_written: int = 0
    comments_blob_deleted: int = 0

    def as_dict(self) -> dict:
        return {
            "avatars_scanned": self.avatars_scanned,
            "avatars_written": self.avatars_written,
            "avatars_blob_deleted": self.avatars_blob_deleted,
            "comments_scanned": self.comments_scanned,
            "comments_written": self.comments_written,
            "comments_blob_deleted": self.comments_blob_deleted,
        }


def migrate_blob_media_to_files(s: Session, *, dry_run: bool = False) -> MediaMigrationResult:
    """
    One-time migration helper:
    - Move legacy blob rows (PlayerAvatar / CommentImage) to file-backed metadata rows.
    - Delete blob rows afterwards so DB no longer stores image bytes.
    """
    out = MediaMigrationResult()

    avatar_blobs = s.exec(select(PlayerAvatar)).all()
    for blob in avatar_blobs:
        out.avatars_scanned += 1
        rel_path = media_path_for_avatar(int(blob.player_id), blob.content_type)
        fs_row = s.get(PlayerAvatarFile, blob.player_id)
        should_write = (
            fs_row is None
            or not media_exists(fs_row.file_path)
            or blob.updated_at >= fs_row.updated_at
        )

        if should_write:
            out.avatars_written += 1
            if not dry_run:
                if fs_row and fs_row.file_path != rel_path:
                    delete_media(fs_row.file_path)
                file_size = write_media(rel_path, blob.data)
                if fs_row is None:
                    fs_row = PlayerAvatarFile(
                        player_id=blob.player_id,
                        content_type=blob.content_type,
                        file_path=rel_path,
                        file_size=file_size,
                        updated_at=blob.updated_at,
                    )
                else:
                    fs_row.content_type = blob.content_type
                    fs_row.file_path = rel_path
                    fs_row.file_size = file_size
                    fs_row.updated_at = blob.updated_at
                s.add(fs_row)

        out.avatars_blob_deleted += 1
        if not dry_run:
            s.delete(blob)

    comment_blobs = s.exec(select(CommentImage)).all()
    for blob in comment_blobs:
        out.comments_scanned += 1
        rel_path = media_path_for_comment(int(blob.comment_id), blob.content_type)
        fs_row = s.get(CommentImageFile, blob.comment_id)
        should_write = (
            fs_row is None
            or not media_exists(fs_row.file_path)
            or blob.updated_at >= fs_row.updated_at
        )

        if should_write:
            out.comments_written += 1
            if not dry_run:
                if fs_row and fs_row.file_path != rel_path:
                    delete_media(fs_row.file_path)
                file_size = write_media(rel_path, blob.data)
                if fs_row is None:
                    fs_row = CommentImageFile(
                        comment_id=blob.comment_id,
                        content_type=blob.content_type,
                        file_path=rel_path,
                        file_size=file_size,
                        updated_at=blob.updated_at,
                    )
                else:
                    fs_row.content_type = blob.content_type
                    fs_row.file_path = rel_path
                    fs_row.file_size = file_size
                    fs_row.updated_at = blob.updated_at
                s.add(fs_row)

        out.comments_blob_deleted += 1
        if not dry_run:
            s.delete(blob)

    return out

