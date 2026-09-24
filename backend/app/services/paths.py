"""Every app path the backend hands to a browser, in one place (L10).

The frontend lives under a group segment — `/g/<slug>/…` is react-router's `basename`
(`frontend/src/app/basename.ts`) — so a path the backend emits (a push's deep link, a
bell item, a record's `path`) is **absolute and group-prefixed**, built here and nowhere
else. The browser strips the prefix again with `toRouterPath` for an in-app navigation;
the service worker opens it as it stands.

Part 1 has one group, so every caller takes the default slug. Part 2 passes the event's
own group, and nothing else about the callers has to change.
"""

from __future__ import annotations

from .auth_migration import DEFAULT_GROUP_SLUG

__all__ = ["DEFAULT_GROUP_SLUG", "group_path"]


def group_path(rest: str, *, slug: str = DEFAULT_GROUP_SLUG) -> str:
    """`/live/3?comment=9` → `/g/altherren/live/3?comment=9`.

    `rest` is a router path — it starts with `/` and names no group; the slug is the
    group the thing that happened belongs to.
    """
    assert rest.startswith("/"), f"group_path needs an absolute router path, got {rest!r}"
    assert not rest.startswith("/g/"), f"group_path got an already-prefixed path {rest!r}"
    return f"/g/{slug}{rest}"
