"""The server serves the size that is needed (W1).

Every media file used to be served whole, whatever it was drawn at. These tests are about
the four properties the derived cache is built on and that nothing later may relax:

1. **`?w=` is the framework's business.** Only the seven rungs parse; `?w=137` is a 422
   before a line of our code runs, which is the whole answer to "an open `?w=` fills the
   disk".
2. **A derivative is only ever an optimisation.** A format that must not be resized, a
   source narrower than the rung, an unreadable file, a corrupt one — every single one of
   them serves the original rather than erroring.
3. **The cache path is keyed on the row, not on the caller.** `?v=` is the client's
   cache-buster and the server still ignores it; the token comes from `updated_at` /
   `captured_at`, so a re-upload lands on a path that has never been written.
4. **A derivative is exactly as cacheable as its source** — the same `Cache-Control`,
   byte for byte, including the snapshot's `immutable`.

All four media families are here, because the point of one module is that they cannot
drift: avatar, header image, guestbook subject snapshot and comment image.
"""
import datetime as dt
import io
import os
from pathlib import Path

from PIL import Image

from app.services.file_storage import media_path_for_avatar
from app.services.media_derivatives import (
    DERIVED_DIR,
    MEDIA_WIDTHS,
    derived_rel_path,
    sweep_orphan_derivatives,
    version_token,
)

AVATAR_CACHE = "private, max-age=604800"
SNAPSHOT_CACHE = "private, max-age=31536000, immutable"


def _png(width: int, height: int, color: tuple[int, int, int, int] = (200, 30, 60, 255)) -> bytes:
    """A real picture, so Pillow has something to resize. Noisy on purpose: a flat
    rectangle compresses to almost nothing and "smaller than the source" would prove
    nothing."""
    img = Image.new("RGBA", (width, height), color)
    px = img.load()
    for y in range(0, height, 3):
        for x in range(0, width, 3):
            px[x, y] = ((x * 7) % 256, (y * 13) % 256, ((x + y) * 3) % 256, 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _uploads(tmp_path) -> Path:
    return Path(tmp_path) / "uploads"


def _derived_files(tmp_path) -> list[str]:
    root = _uploads(tmp_path) / DERIVED_DIR
    if not root.is_dir():
        return []
    return sorted(str(p.relative_to(_uploads(tmp_path))) for p in root.rglob("*") if p.is_file())


def _player_id_by_name(client, name: str) -> int:
    rows = client.get("/players").json()
    row = next((p for p in rows if p.get("display_name") == name), None)
    assert row is not None
    return int(row["id"])


def _put_avatar(client, headers, player_id: int, data: bytes, content_type: str = "image/png", name: str = "a.png"):
    r = client.put(f"/players/{player_id}/avatar", files={"file": (name, data, content_type)}, headers=headers)
    assert r.status_code == 200, r.text
    return r


def _put_header(client, headers, player_id: int, data: bytes, content_type: str = "image/png", name: str = "h.png"):
    r = client.put(f"/players/{player_id}/header-image", files={"file": (name, data, content_type)}, headers=headers)
    assert r.status_code == 200, r.text
    return r


def _comment_with_image(client, editor_headers, admin_headers, data: bytes) -> int:
    p1 = client.post("/players", json={"display_name": "MD1"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "MD2"}, headers=admin_headers).json()["id"]
    tid = client.post(
        "/tournaments",
        json={"name": "media-derivatives", "mode": "1v1", "player_ids": [p1, p2]},
        headers=editor_headers,
    ).json()["id"]
    cid = client.post(f"/tournaments/{tid}/comments", json={"body": "look"}, headers=editor_headers).json()["id"]
    r = client.put(f"/comments/{cid}/image", files={"file": ("c.png", data, "image/png")}, headers=editor_headers)
    assert r.status_code == 200, r.text
    return int(cid)


# --- 1. nothing changes for a caller that does not ask ----------------------------


def test_without_w_every_family_serves_the_original_untouched(client, editor_headers, admin_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    avatar = _png(512, 512)
    header = _png(600, 340)
    _put_avatar(client, editor_headers, owner_id, avatar)
    _put_header(client, editor_headers, owner_id, header)
    snapshot_id = int(
        client.post(
            f"/players/{owner_id}/guestbook",
            json={"body": "nice", "subject_kind": "header_image"},
            headers=admin_headers,
        ).json()["subject"]["snapshot_id"]
    )
    comment_bytes = _png(300, 200)
    cid = _comment_with_image(client, editor_headers, admin_headers, comment_bytes)

    r_av = client.get(f"/players/{owner_id}/avatar")
    assert r_av.status_code == 200 and r_av.content == avatar
    assert r_av.headers["content-type"] == "image/png"
    assert r_av.headers["cache-control"] == AVATAR_CACHE

    r_hd = client.get(f"/players/{owner_id}/header-image")
    assert r_hd.content == header and r_hd.headers["content-type"] == "image/png"
    assert r_hd.headers["cache-control"] == AVATAR_CACHE

    r_sn = client.get(f"/players/guestbook-subjects/{snapshot_id}/image")
    assert r_sn.content == header and r_sn.headers["cache-control"] == SNAPSHOT_CACHE

    r_cm = client.get(f"/comments/{cid}/image")
    assert r_cm.content == comment_bytes and r_cm.headers["cache-control"] == AVATAR_CACHE

    # Not one byte was derived for any of them.
    assert _derived_files(tmp_path) == []


# --- 2. the rung that was asked for ------------------------------------------------


def test_a_rung_is_webp_at_that_width_and_much_smaller(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    avatar = _png(512, 512)
    _put_avatar(client, editor_headers, owner_id, avatar)

    r = client.get(f"/players/{owner_id}/avatar?w=128")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/webp"
    assert r.headers["cache-control"] == AVATAR_CACHE
    assert len(r.content) < len(avatar)
    with Image.open(io.BytesIO(r.content)) as img:
        assert img.width == 128
        assert img.height == 128

    assert len(_derived_files(tmp_path)) == 1


def test_the_second_request_is_the_cached_file(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, _png(512, 512))

    first = client.get(f"/players/{owner_id}/avatar?w=256")
    cached = _derived_files(tmp_path)
    assert len(cached) == 1
    second = client.get(f"/players/{owner_id}/avatar?w=256")

    assert first.content == second.content
    assert _derived_files(tmp_path) == cached
    assert (_uploads(tmp_path) / cached[0]).read_bytes() == first.content


def test_the_cache_path_is_the_row_not_the_callers_v(client, editor_headers, tmp_path):
    """`?v=` is the client's cache-buster and the server has always ignored it. A client
    that lies about it must not be able to choose a path on our disk."""
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, _png(512, 512))

    honest = client.get(f"/players/{owner_id}/avatar?w=128")
    lying = client.get(f"/players/{owner_id}/avatar?w=128&v=whatever-i-like")
    assert honest.content == lying.content
    assert len(_derived_files(tmp_path)) == 1


def test_every_rung_answers_and_one_source_can_never_hold_more_than_the_ladder(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, _png(1920, 1080))

    for width in MEDIA_WIDTHS:
        r = client.get(f"/players/{owner_id}/header-image?w={width}")
        assert r.status_code == 200, (width, r.text)
        assert r.headers["content-type"] == "image/webp"
        with Image.open(io.BytesIO(r.content)) as img:
            assert img.width == width

    assert len(_derived_files(tmp_path)) == len(MEDIA_WIDTHS)
    # And asking again adds nothing.
    for width in MEDIA_WIDTHS:
        client.get(f"/players/{owner_id}/header-image?w={width}")
    assert len(_derived_files(tmp_path)) == len(MEDIA_WIDTHS)


def test_an_off_ladder_width_is_a_422_and_writes_nothing(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, _png(512, 512))

    for bad in ("137", "0", "-1", "2048", "abc"):
        r = client.get(f"/players/{owner_id}/avatar?w={bad}")
        assert r.status_code == 422, (bad, r.status_code)
    assert _derived_files(tmp_path) == []


# --- 3. everything that can go wrong serves the original ---------------------------


def test_a_rung_wider_than_the_source_is_never_an_upscale(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    avatar = _png(512, 512)
    _put_avatar(client, editor_headers, owner_id, avatar)

    r = client.get(f"/players/{owner_id}/avatar?w=768")
    assert r.status_code == 200
    assert r.content == avatar
    assert r.headers["content-type"] == "image/png"
    assert _derived_files(tmp_path) == []


def test_gif_and_svg_are_never_derived(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    gif = b"GIF89a-not-really-but-the-content-type-is-what-decides"
    _put_avatar(client, editor_headers, owner_id, gif, content_type="image/gif", name="a.gif")

    r = client.get(f"/players/{owner_id}/avatar?w=128")
    assert r.status_code == 200
    assert r.content == gif
    assert r.headers["content-type"] == "image/gif"

    svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"></svg>'
    _put_avatar(client, editor_headers, owner_id, svg, content_type="image/svg+xml", name="a.svg")
    r_svg = client.get(f"/players/{owner_id}/avatar?w=128")
    assert r_svg.status_code == 200
    assert r_svg.content == svg
    assert r_svg.headers["content-type"] == "image/svg+xml"

    assert _derived_files(tmp_path) == []


def test_a_source_pillow_cannot_open_still_renders(client, editor_headers, tmp_path, caplog):
    owner_id = _player_id_by_name(client, "Editor")
    junk = b"not an image"
    _put_avatar(client, editor_headers, owner_id, junk)

    with caplog.at_level("WARNING"):
        r = client.get(f"/players/{owner_id}/avatar?w=128")
    assert r.status_code == 200
    assert r.content == junk
    assert r.headers["content-type"] == "image/png"
    assert _derived_files(tmp_path) == []
    assert any("Media derivative failed" in rec.message for rec in caplog.records)


# --- 4. a replaced source can never serve a stale derivative ------------------------


def test_a_re_upload_lands_on_a_path_that_has_never_been_written(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, _png(512, 512, (10, 200, 10, 255)))
    first = client.get(f"/players/{owner_id}/avatar?w=128")
    first_path = _derived_files(tmp_path)
    assert len(first_path) == 1

    _put_avatar(client, editor_headers, owner_id, _png(512, 512, (10, 10, 220, 255)))
    # The upload purged the old cache entry on its way in.
    assert _derived_files(tmp_path) == []

    second = client.get(f"/players/{owner_id}/avatar?w=128")
    second_path = _derived_files(tmp_path)
    assert len(second_path) == 1
    assert second_path != first_path
    assert second.content != first.content


def test_deleting_the_source_takes_its_whole_cache_directory(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, _png(512, 512))
    client.get(f"/players/{owner_id}/avatar?w=64")
    client.get(f"/players/{owner_id}/avatar?w=128")
    assert len(_derived_files(tmp_path)) == 2

    r = client.delete(f"/players/{owner_id}/avatar", headers=editor_headers)
    assert r.status_code == 204
    assert _derived_files(tmp_path) == []
    assert not (_uploads(tmp_path) / DERIVED_DIR / media_path_for_avatar(owner_id, "image/png")).exists()


# --- 5. the other three families ----------------------------------------------------


def test_a_snapshots_derivative_is_as_immutable_as_the_snapshot(client, editor_headers, admin_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_header(client, editor_headers, owner_id, _png(1920, 1080))
    snapshot_id = int(
        client.post(
            f"/players/{owner_id}/guestbook",
            json={"body": "that banner", "subject_kind": "header_image"},
            headers=admin_headers,
        ).json()["subject"]["snapshot_id"]
    )

    r = client.get(f"/players/guestbook-subjects/{snapshot_id}/image?w=256")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/webp"
    assert r.headers["cache-control"] == SNAPSHOT_CACHE
    with Image.open(io.BytesIO(r.content)) as img:
        assert img.width == 256
    assert any(f"{DERIVED_DIR}/guestbook_subjects/" in p for p in _derived_files(tmp_path))


def test_a_comment_image_asks_for_a_width_like_everything_else(client, editor_headers, admin_headers, tmp_path):
    source = _png(900, 600)
    cid = _comment_with_image(client, editor_headers, admin_headers, source)

    r = client.get(f"/comments/{cid}/image?w=384")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/webp"
    assert r.headers["cache-control"] == AVATAR_CACHE
    assert len(r.content) < len(source)
    with Image.open(io.BytesIO(r.content)) as img:
        assert img.width == 384
    assert len(_derived_files(tmp_path)) == 1

    # And the two byte-changing paths purge it, exactly as they do for an avatar.
    client.put(f"/comments/{cid}/image", files={"file": ("c.png", _png(900, 600, (0, 0, 0, 255)), "image/png")}, headers=editor_headers)
    assert _derived_files(tmp_path) == []

    client.get(f"/comments/{cid}/image?w=384")
    assert len(_derived_files(tmp_path)) == 1
    assert client.delete(f"/comments/{cid}/image", headers=editor_headers).status_code == 200
    assert _derived_files(tmp_path) == []


# --- 6. the boot sweep ---------------------------------------------------------------


def test_the_sweep_removes_a_cache_whose_source_is_gone_and_one_older_than_its_source(client, editor_headers, tmp_path):
    owner_id = _player_id_by_name(client, "Editor")
    _put_avatar(client, editor_headers, owner_id, _png(512, 512))
    client.get(f"/players/{owner_id}/avatar?w=128")
    assert len(_derived_files(tmp_path)) == 1

    # A directory whose source file no longer exists — what a source deleted by code that
    # does not know this cache exists leaves behind.
    orphan = _uploads(tmp_path) / DERIVED_DIR / "avatars" / "999.png"
    orphan.mkdir(parents=True, exist_ok=True)
    (orphan / "20260101000000000000-64.webp").write_bytes(b"stale")

    # A cached size older than its own source — what a rollback leaves, since old code
    # overwrites an avatar without touching this directory.
    source_rel = media_path_for_avatar(owner_id, "image/png")
    source_mtime = (_uploads(tmp_path) / source_rel).stat().st_mtime
    stale = _uploads(tmp_path) / derived_rel_path(source_rel, "20250101000000000000", 64)
    stale.parent.mkdir(parents=True, exist_ok=True)
    stale.write_bytes(b"older than the picture it was made from")
    os.utime(stale, (source_mtime - 600, source_mtime - 600))

    before = _derived_files(tmp_path)
    assert len(before) == 3

    removed = sweep_orphan_derivatives()
    assert removed == 2
    left = _derived_files(tmp_path)
    assert len(left) == 1
    assert "999.png" not in left[0]
    assert "20250101" not in left[0]

    # Idempotent: a second sweep has nothing to do, which is what keeps the boot silent.
    assert sweep_orphan_derivatives() == 0


def test_the_sweep_is_silent_and_harmless_with_no_cache_at_all(client, tmp_path):
    assert sweep_orphan_derivatives() == 0
    assert _derived_files(tmp_path) == []


# --- 7. the shapes themselves ---------------------------------------------------------


def test_the_derived_path_is_keyed_on_the_source_path_and_the_row_version():
    token = version_token(dt.datetime(2026, 9, 12, 13, 29, 0, 123456))
    assert token == "20260912132900123456"
    assert derived_rel_path("avatars/3.png", token, 256) == "derived/avatars/3.png/20260912132900123456-256.webp"


def test_the_ladder_is_ascending_and_unique():
    assert list(MEDIA_WIDTHS) == sorted(set(MEDIA_WIDTHS))
    assert MEDIA_WIDTHS == (64, 128, 256, 384, 768, 1152, 1536)
