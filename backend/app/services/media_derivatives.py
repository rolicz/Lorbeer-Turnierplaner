"""Serve the size that is needed (W1).

Every media file used to be served whole, whatever it was drawn at: a 2.66 MB header
image behind a 71x40 citation thumbnail, a 500 KB avatar behind a 28px disc. This module
derives the size that was asked for and caches it on disk, and everything about it is
built so that a failure costs nothing: the cache is safe to delete, an unreadable or
unresizable source falls through to the original, and a width that is not on the ladder
never reaches here at all (FastAPI rejects it).

It is the only module that knows a derivative exists. `file_storage` stays the only one
that knows where the media root is, and the four media GETs — avatar, header image,
guestbook subject snapshot, comment image — all turn a row into bytes through
`media_response` here, so a derivative can never be an optimisation on three surfaces and
a 500 on the fourth.
"""
from __future__ import annotations

import datetime as dt
import io
import logging
from typing import Annotated, Literal

from fastapi import HTTPException, Query, Response
from pydantic import BeforeValidator

from .file_storage import (
    delete_media,
    delete_media_dir,
    list_media_tree,
    media_exists,
    media_mtime,
    read_media,
    write_media,
)

log = logging.getLogger(__name__)

#: The only widths that exist. Spelled once, here. The four endpoints annotate `w` with
#: `MediaWidth`, FastAPI publishes it as an OpenAPI enum, and the browser's ladder is
#: `satisfies` the generated union — so the two sides cannot drift apart. Every rung is
#: something the app actually draws at dpr 1, 2 or 3; there is no rung for a size nobody
#: asks for, and an off-ladder `?w=` is a 422 before a line of this module runs.
MEDIA_WIDTHS: tuple[int, ...] = (64, 128, 256, 384, 768, 1152, 1536)
MediaWidth = Literal[64, 128, 256, 384, 768, 1152, 1536]


def _width_from_query(value: object) -> object:
    """Digits in the query string become an int, and nothing else happens here.

    A query value is always text, and pydantic coerces text into an `int` but **not**
    into an int `Literal` — without this, `?w=128` would be a 422 for every caller. The
    Literal still does all the deciding: `?w=137`, `?w=abc` and `?w=` are the framework's
    422 exactly as they were.
    """
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return value


#: What the four media GETs annotate `w` with — the ladder, the coercion and the wording
#: of the parameter in one place, so no endpoint can publish a different `?w=` from the
#: others. `Query` inside the `Annotated` on purpose: as a plain default it silently
#: replaces the validator.
MediaWidthParam = Annotated[
    MediaWidth | None,
    BeforeValidator(_width_from_query),
    Query(description="Serve this pre-computed width instead of the original; omit for the original."),
]

#: The cache's own top-level directory inside the media root. It holds nothing but
#: derivatives, it is regenerated on demand, and deleting it at any time is safe — which
#: is the property every other decision in this module was chosen to protect.
DERIVED_DIR = "derived"
DERIVED_CONTENT_TYPE = "image/webp"
WEBP_QUALITY = 82
#: A resize would damage these rather than shrink them: an SVG is already resolution
#: independent, and a GIF would lose its animation. Both fall through to the original.
NEVER_DERIVED: tuple[str, ...] = ("image/svg+xml", "image/gif")


def version_token(moment: dt.datetime | None) -> str:
    """The source version, as a filename-safe string: `updated_at` for an avatar, a
    header or a comment image, `captured_at` for a pinned snapshot.

    It comes from the row, never from the caller's `?v=`, so a client cannot poison the
    cache — and a replaced source lands on a path that has never been written, which is
    why a stale derivative is impossible rather than merely unlikely.
    """
    if moment is None:
        return "0"
    return moment.strftime("%Y%m%d%H%M%S%f")


def derived_rel_path(source_rel_path: str, token: str, width: int) -> str:
    """`derived/avatars/3.png/20260912132900123456-256.webp`.

    Keyed on the source's own relative path, so one purge serves every family — present
    and future — and the boot sweep is a question about files rather than a question
    about the database.
    """
    return f"{DERIVED_DIR}/{source_rel_path}/{token}-{int(width)}.webp"


def purge_derivatives(source_rel_path: str) -> int:
    """Throw away every derivative of one source; returns how many files went.

    Called by `file_storage` from the two paths that change the bytes under a relative
    path (`upsert_media_row` and `delete_media`), which is why no caller in the app has
    to remember it. A derivative has no derivatives of its own, so a path already inside
    the cache is a no-op — that is what keeps the sweep's own deletes from recursing.
    """
    rel = (source_rel_path or "").strip()
    if not rel or rel == DERIVED_DIR or rel.startswith(f"{DERIVED_DIR}/"):
        return 0
    return delete_media_dir(f"{DERIVED_DIR}/{rel}")


def derived_bytes(*, source_rel_path: str, content_type: str, token: str, width: int) -> bytes | None:
    """The source at `width`, from the cache or freshly made — or **None**, meaning
    "serve the original", which is the answer for every single thing that can go wrong:
    a never-derived format, a source already narrower than `width`, a missing file, a
    source Pillow cannot open, an encode that raises. A caller that sees None returns the
    source bytes with the source's own content type.

    On a miss it reads the source once, resizes with LANCZOS preserving the aspect ratio,
    encodes WebP at `WEBP_QUALITY` and writes the cache file with `write_media` (temp file
    + `os.replace`), so two racing requests cannot produce a half-written file. No lock:
    the loser's copy is byte-identical to the winner's.
    """
    if (content_type or "").strip().lower() in NEVER_DERIVED:
        return None

    rel_path = derived_rel_path(source_rel_path, token, width)
    try:
        cached = read_media(rel_path)
    except ValueError:  # a file_path the DB should never hold
        return None
    if cached is not None:
        return cached

    source = read_media(source_rel_path)
    if source is None:
        return None

    try:
        data = _encode(source, width)
    except Exception:
        # A picture the app cannot resize is worth knowing about even though it still
        # renders: the endpoint falls through to the original below.
        log.warning("Media derivative failed for %s at w=%s", source_rel_path, width, exc_info=True)
        return None
    if data is None:
        return None

    try:
        write_media(rel_path, data)
    except Exception:  # pragma: no cover - a cache write is never worth an error
        log.warning("Media derivative could not be cached at %s", rel_path, exc_info=True)
    return data


def _encode(source: bytes, width: int) -> bytes | None:
    """The pixels themselves. None when the source is already at most `width` wide —
    an upscale would cost bytes and add nothing."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(source)) as img:
        # A phone's JPEG carries its rotation in EXIF and the browser applies it when it
        # draws the original, so a derivative that ignored it would be the same picture
        # lying on its side.
        img = ImageOps.exif_transpose(img) or img
        if img.width <= width:
            return None
        height = max(1, round(img.height * width / img.width))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if ("A" in img.getbands() or img.mode == "P") else "RGB")
        resized = img.resize((width, height), Image.LANCZOS)

    buf = io.BytesIO()
    resized.save(buf, format="WEBP", quality=WEBP_QUALITY)
    return buf.getvalue()


def media_response(
    *,
    source_rel_path: str,
    content_type: str,
    token: str,
    width: int | None,
    cache_control: str,
    missing: str,
) -> Response:
    """Serve a media file at the size that was asked for, or whole (W1).

    The one place any media GET turns a row into bytes: a derivative is only ever an
    optimisation, so every path that cannot produce one lands on the original here rather
    than erroring. A derivative carries its source's `Cache-Control` byte for byte,
    because the two facts that make a source cacheable — a URL that changes when the
    picture does, or a picture that never changes at all — are equally true of it.
    """
    if width is not None:
        data = derived_bytes(source_rel_path=source_rel_path, content_type=content_type, token=token, width=width)
        if data is not None:
            return Response(content=data, media_type=DERIVED_CONTENT_TYPE, headers={"Cache-Control": cache_control})

    data = read_media(source_rel_path)
    if data is None:
        raise HTTPException(status_code=404, detail=missing)
    return Response(content=data, media_type=content_type, headers={"Cache-Control": cache_control})


def _source_of(derived_path: str) -> str | None:
    """`derived/avatars/1.png/2026…-256.webp` → `avatars/1.png`; None for anything that is
    not shaped like a derivative."""
    parts = derived_path.split("/")
    if len(parts) < 3 or parts[0] != DERIVED_DIR:
        return None
    return "/".join(parts[1:-1])


def sweep_orphan_derivatives() -> int:
    """Whatever is no longer worth keeping under `derived/`: a directory whose source file
    is gone, and any cached file **older than its own source** (which is what a rollback
    leaves behind — old code overwrites an avatar without knowing this directory exists).

    Returns how many files went; idempotent; called from `init_db()`. Needs no database:
    every question it asks is about files.
    """
    by_source: dict[str, list[str]] = {}
    removed = 0
    for rel_path in list_media_tree(DERIVED_DIR):
        source = _source_of(rel_path)
        if source is None:
            # Not shaped like a derivative, so nothing in the app can ever serve it.
            delete_media(rel_path)
            removed += 1
            continue
        by_source.setdefault(source, []).append(rel_path)

    for source, rel_paths in by_source.items():
        if not media_exists(source):
            removed += purge_derivatives(source)
            continue
        source_mtime = media_mtime(source) or 0.0
        kept = 0
        for rel_path in rel_paths:
            mtime = media_mtime(rel_path)
            if mtime is None or mtime < source_mtime:
                delete_media(rel_path)
                removed += 1
            else:
                kept += 1
        if kept == 0:
            # The empty shell of a directory, so a second sweep has nothing to look at.
            purge_derivatives(source)

    return removed
