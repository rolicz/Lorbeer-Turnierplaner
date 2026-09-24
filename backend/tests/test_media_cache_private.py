"""Gated media are `private`, not `public` (Q-G).

Every media GET sits behind the gate (L2): it needs a session and a membership. `public`
would let a *shared* cache — a CDN, a proxy, anything ever put in front of Caddy — store the
picture and hand it to someone who never reached the gate. `private` keeps the browser's own
cache exactly as it was and forbids everyone else.

The test does not keep a list of media routes. It walks `app.routes` for every GET that
answers a raw `Response` (no `response_model` — that is what a file endpoint looks like),
fills its path parameter with a row it has just created, and asserts on what came back. A
media route added later is walked by construction; one with a path parameter this file does
not know fails loudly instead of being skipped.
"""

import io

from fastapi.routing import APIRoute
from PIL import Image

from tests.conftest import create_league


def _png(width: int = 400, height: int = 300) -> bytes:
    img = Image.new("RGBA", (width, height), (10, 20, 30, 255))
    px = img.load()
    for y in range(0, height, 3):
        for x in range(0, width, 3):
            px[x, y] = ((x * 7) % 256, (y * 13) % 256, ((x + y) * 3) % 256, 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def _one_of_everything(client, editor_headers, admin_headers) -> dict[str, int]:
    """One row per media family, so every media route has something to serve."""
    players = client.get("/players").json()
    owner = next(p["id"] for p in players if p["display_name"] == "Editor")
    img = _png()
    files = lambda name: {"file": (name, img, "image/png")}  # noqa: E731

    _ok(client.put(f"/players/{owner}/avatar", files=files("a.png"), headers=editor_headers))
    _ok(client.put(f"/players/{owner}/header-image", files=files("h.png"), headers=editor_headers))
    entry = _ok(
        client.post(f"/players/{owner}/guestbook", json={"body": "nice", "subject_kind": "header_image"}, headers=admin_headers)
    )
    snapshot_id = int(entry["subject"]["snapshot_id"])

    p1 = _ok(client.post("/players", json={"display_name": "QG1"}, headers=admin_headers))["id"]
    p2 = _ok(client.post("/players", json={"display_name": "QG2"}, headers=admin_headers))["id"]
    tid = _ok(client.post("/tournaments", json={"name": "q-g", "mode": "1v1", "player_ids": [p1, p2]}, headers=editor_headers))["id"]
    cid = _ok(client.post(f"/tournaments/{tid}/comments", json={"body": "look"}, headers=editor_headers))["id"]
    _ok(client.put(f"/comments/{cid}/image", files=files("c.png"), headers=editor_headers))

    iid = _ok(client.post("/ideas", json={"title": "Q-G", "body": "b", "kind": "feature", "areas": ["match"]}, headers=editor_headers))["id"]
    _ok(client.put(f"/ideas/{iid}/image", files=files("i.png"), headers=editor_headers))

    league_id = create_league(client, admin_headers, "Q-G league")
    club_id = _ok(
        client.post("/clubs", json={"name": "FC Q-G", "game": "EA FC 26", "star_rating": 4.0, "league_id": league_id}, headers=editor_headers)
    )["id"]
    _ok(client.put(f"/clubs/{club_id}/crest", files=files("crest.png"), headers=admin_headers))

    return {"player_id": owner, "snapshot_id": snapshot_id, "comment_id": cid, "idea_id": iid, "club_id": club_id}


def _media_routes(app) -> list[APIRoute]:
    return [r for r in app.routes if isinstance(r, APIRoute) and "GET" in r.methods and r.response_model is None]


def test_no_media_response_says_public(client, editor_headers, admin_headers):
    ids = _one_of_everything(client, editor_headers, admin_headers)
    routes = _media_routes(client.app)
    # Guard against a walk that silently finds nothing: the six families as of Q-G.
    assert len(routes) >= 6, [r.path for r in routes]

    checked = 0
    for route in routes:
        unknown = set(route.param_convertors) - set(ids)
        assert not unknown, f"{route.path}: teach this test a row for {sorted(unknown)}"
        path = route.path.format(**{k: ids[k] for k in route.param_convertors})
        # The original, and a derivative where the route takes `?w=` (the others ignore it).
        for url in (path, f"{path}?w=128"):
            r = client.get(url, headers=editor_headers)
            assert r.status_code == 200, f"{url}: {r.status_code} {r.text[:200]}"
            assert r.headers["content-type"].startswith("image/"), url
            cc = r.headers.get("cache-control", "")
            assert "public" not in cc, f"{url} says {cc!r}"
            assert cc.startswith("private, max-age="), f"{url} says {cc!r}"
            checked += 1
    assert checked == 2 * len(routes)


def test_every_media_route_is_still_gated(client, anon, editor_headers, admin_headers):
    """`private` is only the right answer because nobody without a session gets the bytes at
    all — if one of these ever answered a stranger, the header would be the wrong fix."""
    ids = _one_of_everything(client, editor_headers, admin_headers)
    for route in _media_routes(client.app):
        path = route.path.format(**{k: ids[k] for k in route.param_convertors})
        assert anon.get(path).status_code == 401, path


def test_the_values_themselves_did_not_move(client, editor_headers, admin_headers):
    """Only the word changed: every max-age and the snapshot's `immutable` are as they were."""
    ids = _one_of_everything(client, editor_headers, admin_headers)
    expected = {
        f"/players/{ids['player_id']}/avatar": "private, max-age=604800",
        f"/players/{ids['player_id']}/header-image": "private, max-age=604800",
        f"/players/guestbook-subjects/{ids['snapshot_id']}/image": "private, max-age=31536000, immutable",
        f"/comments/{ids['comment_id']}/image": "private, max-age=604800",
        f"/ideas/{ids['idea_id']}/image": "private, max-age=604800",
        f"/clubs/{ids['club_id']}/crest": "private, max-age=2592000",
    }
    for path, cc in expected.items():
        assert client.get(path, headers=editor_headers).headers["cache-control"] == cc, path
