from __future__ import annotations

import os
import tempfile
from pathlib import Path


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

