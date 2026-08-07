from __future__ import annotations

import datetime as dt
import os
import tempfile
from pathlib import Path
from typing import Any, Callable, Type, TypeVar

from sqlmodel import Session

_RowT = TypeVar("_RowT")


def _uploads_root() -> Path:
    raw = os.getenv("UPLOADS_DIR", "").strip()
    if raw:
        root = Path(raw)
    elif Path("/data").exists():
        root = Path("/data/uploads")
    else:
        root = Path("./data/uploads")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_rel(rel_path: str) -> Path:
    rel = Path(rel_path)
    if rel.is_absolute():
        raise ValueError("rel_path must be relative")
    if ".." in rel.parts:
        raise ValueError("rel_path must not contain '..'")
    return rel


def media_path_for_avatar(player_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"avatars/{int(player_id)}.{ext}"


def media_path_for_comment(comment_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"comments/{int(comment_id)}.{ext}"


def media_path_for_profile_header(player_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"profile_headers/{int(player_id)}.{ext}"


def media_path_for_club_crest(club_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"club_crests/{int(club_id)}.{ext}"


def read_media(rel_path: str) -> bytes | None:
    rel = _safe_rel(rel_path)
    p = _uploads_root() / rel
    if not p.is_file():
        return None
    return p.read_bytes()


def media_exists(rel_path: str) -> bool:
    rel = _safe_rel(rel_path)
    p = _uploads_root() / rel
    return p.is_file()


def write_media(rel_path: str, data: bytes) -> int:
    rel = _safe_rel(rel_path)
    p = _uploads_root() / rel
    p.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(prefix=".upload-", dir=str(p.parent))
    try:
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(data)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_name, str(p))
    finally:
        if os.path.exists(tmp_name):
            try:
                os.remove(tmp_name)
            except OSError:
                pass
    return len(data)


def delete_media(rel_path: str) -> None:
    rel = _safe_rel(rel_path)
    p = _uploads_root() / rel
    try:
        p.unlink(missing_ok=True)
    except TypeError:
        # Python < 3.8 fallback (not expected, but harmless).
        if p.exists():
            p.unlink()


def upsert_media_row(
    s: Session,
    *,
    row_cls: Type[_RowT],
    row_id: int,
    id_field: str,
    content_type: str,
    data: bytes,
    path_builder: Callable[[int, str], str],
    updated_at: dt.datetime | None = None,
) -> _RowT:
    """Write media bytes and upsert the DB metadata row; delete the old file if the path changed."""
    now = updated_at or dt.datetime.utcnow()
    rel_path = path_builder(row_id, content_type)
    file_size = write_media(rel_path, data)
    row: Any = s.get(row_cls, row_id)
    if row is None:
        row = row_cls(**{id_field: row_id, "content_type": content_type, "file_path": rel_path, "file_size": file_size, "updated_at": now})
    else:
        if row.file_path != rel_path:
            delete_media(row.file_path)
        row.content_type = content_type
        row.file_path = rel_path
        row.file_size = file_size
        row.updated_at = now
    s.add(row)
    return row  # type: ignore[return-value]


def _ext_from_content_type(content_type: str) -> str:
    ct = (content_type or "").strip().lower()
    if ct == "image/jpeg":
        return "jpg"
    if ct == "image/png":
        return "png"
    if ct == "image/webp":
        return "webp"
    if ct == "image/gif":
        return "gif"
    if ct == "image/avif":
        return "avif"
    if ct == "image/svg+xml":
        return "svg"
    return "img"
