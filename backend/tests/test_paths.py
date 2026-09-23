"""L10: every app path the backend emits is absolute and group-prefixed, built by one helper.

The frontend's router lives under `/g/<slug>` (react-router's `basename`), so a deep link
that forgot the prefix would still work today — through the legacy redirect — and would
silently land in the wrong group the day there are two. The grep below is what keeps a new
`path=f"/live/…"` from being written by hand.
"""

import re
from datetime import datetime
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.db import get_engine
from app.models import PushSubscription, PushSubscriptionPreference
from app.services.paths import group_path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
PATH_LITERAL = re.compile(r'(path=|"path": )f?"/(live|profiles|ideas|dashboard|stats|tournaments|friendlies)')


def test_group_path_prefixes_the_default_group():
    assert group_path("/live/3?comment=9") == "/g/altherren/live/3?comment=9"
    assert group_path("/dashboard") == "/g/altherren/dashboard"
    assert group_path("/ideas?idea=1", slug="other") == "/g/other/ideas?idea=1"


@pytest.mark.parametrize("bad", ["live/3", "", "/g/altherren/live/3"])
def test_group_path_refuses_what_is_not_a_router_path(bad):
    with pytest.raises(AssertionError):
        group_path(bad)


def test_no_app_path_is_spelled_outside_paths_py():
    hits = []
    for f in sorted(APP_DIR.rglob("*.py")):
        if f.name == "paths.py":
            continue
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), start=1):
            if PATH_LITERAL.search(line):
                hits.append(f"{f.relative_to(APP_DIR)}:{n}: {line.strip()}")
    assert hits == [], "\n".join(hits)


def test_emitted_paths_carry_the_group(client):
    records = client.get("/stats/records").json()["records"]
    assert records and all(r["path"].startswith("/g/altherren/stats?") for r in records)


class _Dispatcher:
    enabled = True
    configured = True
    public_key = "test-public-key"
    disabled_reason = None

    def enqueue(self, message) -> None:  # pragma: no cover - not reached here
        pass

    def enqueue_for_player(self, player_id, message) -> None:  # pragma: no cover
        pass


def _body(endpoint: str, **extra) -> dict:
    return {"endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}, "user_agent": "pytest", **extra}


def _row(endpoint: str) -> tuple[PushSubscription | None, PushSubscriptionPreference | None]:
    with Session(get_engine()) as s:
        row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint)).first()
        pref = s.get(PushSubscriptionPreference, int(row.id)) if row else None
        if row is not None:
            s.expunge(row)
        if pref is not None:
            s.expunge(pref)
        return row, pref


def test_replaces_endpoint_moves_the_preference_and_disables_the_old_row(client, editor_headers):
    """What `sw.js` sends from `pushsubscriptionchange`: a new endpoint, no language, no
    mode, and the endpoint it replaces. The device keeps its settings; the old row stops."""
    client.app.state.push_dispatcher = _Dispatcher()
    old, new = "https://push.example.test/l10/old", "https://push.example.test/l10/new"
    first = client.put(
        "/push/subscription",
        json=_body(old, notification_language="english", notification_mode="all"),
        headers=editor_headers,
    )
    assert first.status_code == 200, first.text

    res = client.put("/push/subscription", json=_body(new, replaces_endpoint=old), headers=editor_headers)
    assert res.status_code == 200, res.text
    assert res.json()["notification_language"] == "english"
    assert res.json()["notification_mode"] == "all"
    assert res.json()["disabled"] is False

    old_row, _ = _row(old)
    assert old_row is not None and old_row.disabled_at is not None
    # Disabled by a client, not rejected by the push service: a later PUT may revive it.
    assert old_row.last_http_status not in (404, 410)


def test_explicit_settings_in_the_body_win_over_the_inherited_ones(client, editor_headers):
    client.app.state.push_dispatcher = _Dispatcher()
    old, new = "https://push.example.test/l10/old2", "https://push.example.test/l10/new2"
    client.put("/push/subscription", json=_body(old, notification_language="english"), headers=editor_headers)
    res = client.put(
        "/push/subscription",
        json=_body(new, replaces_endpoint=old, notification_language="deutsch"),
        headers=editor_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["notification_language"] == "deutsch"


def test_replaces_endpoint_of_someone_else_is_ignored(client, editor_headers, editor2_headers):
    """An endpoint is not a credential: naming another player's row changes nothing."""
    client.app.state.push_dispatcher = _Dispatcher()
    theirs, mine = "https://push.example.test/l10/theirs", "https://push.example.test/l10/mine"
    client.put("/push/subscription", json=_body(theirs, notification_language="english"), headers=editor2_headers)
    res = client.put("/push/subscription", json=_body(mine, replaces_endpoint=theirs), headers=editor_headers)
    assert res.status_code == 200, res.text
    assert res.json()["notification_language"] == "steirisch"  # the default, not theirs
    their_row, _ = _row(theirs)
    assert their_row is not None and their_row.disabled_at is None


def test_replaces_endpoint_after_a_410_rotation(client, editor_headers):
    """The page's rotation: the old row is the push service's corpse (already disabled,
    410). It stays exactly that, and the new row inherits its settings."""
    client.app.state.push_dispatcher = _Dispatcher()
    dead, fresh = "https://push.example.test/l10/dead", "https://push.example.test/l10/fresh"
    client.put("/push/subscription", json=_body(dead, notification_mode="off"), headers=editor_headers)
    with Session(get_engine()) as s:
        row = s.exec(select(PushSubscription).where(PushSubscription.endpoint == dead)).one()
        row.disabled_at = datetime.utcnow()
        row.last_http_status = 410
        s.add(row)
        s.commit()
    res = client.put("/push/subscription", json=_body(fresh, replaces_endpoint=dead), headers=editor_headers)
    assert res.status_code == 200, res.text
    assert res.json()["notification_mode"] == "off"
    dead_row, _ = _row(dead)
    assert dead_row is not None and dead_row.last_http_status == 410 and dead_row.disabled_at is not None
