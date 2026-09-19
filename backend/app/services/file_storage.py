from __future__ import annotations

import datetime as dt
import os
import shutil
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


def media_path_for_idea(request_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"ideas/{int(request_id)}.{ext}"


def media_path_for_profile_header(player_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"profile_headers/{int(player_id)}.{ext}"


def media_path_for_club_crest(club_id: int, content_type: str) -> str:
    ext = _ext_from_content_type(content_type)
    return f"club_crests/{int(club_id)}.{ext}"


#: Where the pinned copies live — spelled once, because the sweep looks in it too.
GUESTBOOK_SUBJECT_DIR = "guestbook_subjects"


def media_path_for_guestbook_subject(snapshot_id: int, content_type: str) -> str:
    """The pinned copy of a header image or avatar a guestbook entry is about (K1).

    A directory of its own, so the overwriting `upsert_media_row` and the two media
    DELETE endpoints can never touch it: the copy outlives the picture it was made from.
    """
    ext = _ext_from_content_type(content_type)
    return f"{GUESTBOOK_SUBJECT_DIR}/{int(snapshot_id)}.{ext}"


def read_media(rel_path: str) -> bytes | None:
    rel = _safe_rel(rel_path)
    p = _uploads_root() / rel
    if not p.is_file():
        return None
    return p.read_bytes()


def list_media(rel_dir: str) -> list[str]:
    """Relative paths of the files directly under `rel_dir`; [] when it does not exist.

    The sweep's eyes — this module is the only one that knows where the media root is.
    """
    rel = _safe_rel(rel_dir)
    d = _uploads_root() / rel
    if not d.is_dir():
        return []
    return sorted(f"{rel.as_posix()}/{p.name}" for p in d.iterdir() if p.is_file())


def list_media_tree(rel_dir: str) -> list[str]:
    """Every file under `rel_dir`, recursively, relative to the media root; [] when the
    directory does not exist.

    `list_media` looks one level deep, which is all the guestbook sweep ever needs. The
    derived cache (W1) is a tree — one directory per source file — so its sweep needs
    this one. Sorted, so a sweep's behaviour is reproducible.
    """
    rel = _safe_rel(rel_dir)
    d = _uploads_root() / rel
    if not d.is_dir():
        return []
    return sorted(p.relative_to(_uploads_root()).as_posix() for p in d.rglob("*") if p.is_file())


def media_mtime(rel_path: str) -> float | None:
    """The file's mtime, or None when it is not there.

    A derivative older than its source is stale by definition — that is the whole of the
    boot sweep's second rule (W1).
    """
    rel = _safe_rel(rel_path)
    p = _uploads_root() / rel
    try:
        return p.stat().st_mtime
    except OSError:
        return None


def delete_media_dir(rel_dir: str) -> int:
    """Remove `rel_dir` and everything under it; returns how many files went.

    Missing directory → 0. Used **only** for the derived cache (W1), which is safe to
    delete by design; no directory of originals is ever removed this way.
    """
    rel = _safe_rel(rel_dir)
    d = _uploads_root() / rel
    if not d.is_dir():
        return 0
    count = sum(1 for p in d.rglob("*") if p.is_file())
    shutil.rmtree(d, ignore_errors=True)
    return count


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
    # One of the two ways the bytes under a relative path can change (W1): the avatar and
    # header DELETE endpoints, `release_subjects`, `sweep_orphan_subjects`, the comment
    # image DELETE and the extension-changed branch of `upsert_media_row` all land here.
    _purge_derivatives(rel.as_posix())


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
    # The other way the bytes under a relative path change (W1): overwriting in place,
    # where the path does not move and `delete_media` is never called.
    _purge_derivatives(rel_path)
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


def _purge_derivatives(rel_path: str) -> None:
    """Throw away the cached sizes of this source (W1).

    Imported inside the function on purpose: `media_derivatives` imports this module, so
    a module-level import would be a cycle. It never raises — a cache that could not be
    cleared must not fail an upload.
    """
    from .media_derivatives import purge_derivatives

    try:
        purge_derivatives(rel_path)
    except Exception:  # pragma: no cover - a cache is never worth an exception
        pass
