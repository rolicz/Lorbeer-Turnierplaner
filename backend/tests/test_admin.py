"""The admin API (L3): who may call what, invites, reset links, roles, the roster — and the
five escape-hatch commands in `manage.py`, run as the deploy would run them."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.db import get_engine
from app.models import Account, AuthSession, Group, GroupMembership, InviteCode, PasswordResetToken, Player
from app.services.invites import normalize_code
from tests.conftest import (
    _cookie_from_response,
    cookie_headers,
    create_nogroup_account,
    login,
    mint_session,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
GOOD_PASSWORD = "a-good-long-password"


def _pid(name: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Player).where(Player.display_name == name)).one().id)


def _gid() -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Group).where(Group.slug == "altherren")).one().id)


def _set_role(pid: int, role: str) -> None:
    with Session(get_engine()) as s:
        m = s.get(GroupMembership, (_gid(), pid))
        m.role = role
        s.add(m)
        s.commit()


@pytest.fixture()
def owner_headers(client):
    """Editor2 made an owner of `altherren` (not a site admin)."""
    _set_role(_pid("Editor2"), "owner")
    return cookie_headers(login(client, "Editor2", "editor2-secret"))


def _token_from_url(url: str) -> str:
    assert "#" in url
    return url.split("#", 1)[1]


# ---- who may call what ---------------------------------------------------------------------

OWNER_ROUTES = [
    ("get", "/admin/accounts", None),
    ("post", "/admin/invites", {"note": "x"}),
    ("get", "/admin/invites", None),
]
ADMIN_ONLY_ROUTES = [
    ("get", "/admin/accounts/{pid}/sessions", None),
    ("post", "/admin/accounts/{pid}/revoke-sessions", None),
    ("post", "/admin/reset-links", {"player_id": "{pid}"}),
    ("delete", "/admin/sessions/999999", None),
]


def _call(client, method, path, body, headers, pid):
    path = path.replace("{pid}", str(pid))
    if body is not None:
        body = {k: (int(pid) if v == "{pid}" else v) for k, v in body.items()}
        return getattr(client, method)(path, json=body, headers=headers)
    return getattr(client, method)(path, headers=headers)


def test_a_member_is_refused_every_admin_route(client, editor_headers):
    pid = _pid("Editor2")
    for method, path, body in OWNER_ROUTES + ADMIN_ONLY_ROUTES:
        r = _call(client, method, path, body, editor_headers, pid)
        assert r.status_code == 403, (method, path, r.status_code)
    r = client.put(f"/admin/groups/altherren/members/{pid}/role", json={"role": "owner"}, headers=editor_headers)
    assert r.status_code == 403


def test_an_owner_reaches_the_owner_routes_and_not_the_site_admin_ones(client, owner_headers):
    pid = _pid("Editor")
    for method, path, body in OWNER_ROUTES:
        r = _call(client, method, path, body, owner_headers, pid)
        assert r.status_code == 200, (method, path, r.text)
    for method, path, body in ADMIN_ONLY_ROUTES:
        r = _call(client, method, path, body, owner_headers, pid)
        assert r.status_code == 403, (method, path, r.status_code)


def test_a_site_admin_reaches_all_of_them(client, admin_headers):
    pid = _pid("Editor2")
    for method, path, body in OWNER_ROUTES + ADMIN_ONLY_ROUTES[:3]:
        r = _call(client, method, path, body, admin_headers, pid)
        assert r.status_code == 200, (method, path, r.text)
    assert client.delete("/admin/sessions/999999", headers=admin_headers).status_code == 404


def test_nobody_and_a_no_group_account_are_refused_by_the_gate(anon, nogroup_headers):
    assert anon.get("/admin/accounts").status_code == 401
    assert anon.get("/admin/accounts", headers=nogroup_headers).status_code == 403


# ---- accounts ------------------------------------------------------------------------------


def test_the_site_admin_sees_everyone_and_an_owner_only_the_members(client, admin_headers, owner_headers):
    create_nogroup_account("Outsider")
    everyone = {row["display_name"]: row for row in client.get("/admin/accounts", headers=admin_headers).json()}
    members = {row["display_name"] for row in client.get("/admin/accounts", headers=owner_headers).json()}
    assert "Outsider" in everyone and "Outsider" not in members
    assert {"Editor", "Editor2", "Admin"} <= members

    assert everyone["Admin"]["role"] == "admin" and everyone["Admin"]["site_admin"] is True
    assert everyone["Editor2"]["role"] == "owner"
    assert everyone["Editor"]["role"] == "editor" and everyone["Editor"]["password_origin"] == "migrated"
    assert everyone["Outsider"]["role"] == "none" and everyone["Outsider"]["password_origin"] == "none"
    assert everyone["Editor"]["session_count"] >= 1 and everyone["Editor"]["last_seen_at"]
    assert everyone["Outsider"]["session_count"] == 0 and everyone["Outsider"]["last_seen_at"] is None
    assert everyone["Editor"]["has_passkey"] is False


def test_the_admin_lists_and_revokes_someone_elses_devices(client, anon, admin_headers):
    pid = _pid("Editor2")
    a = login(anon, "Editor2", "editor2-secret")
    b = login(anon, "Editor2", "editor2-secret")
    rows = client.get(f"/admin/accounts/{pid}/sessions", headers=admin_headers).json()
    assert len(rows) == 2 and not any(row["current"] for row in rows)

    r = client.delete(f"/admin/sessions/{rows[0]['id']}", headers=admin_headers)
    assert r.status_code == 200
    alive = [anon.get("/me", headers=cookie_headers(t)).status_code for t in (a, b)]
    assert sorted(alive) == [200, 401]

    r = client.post(f"/admin/accounts/{pid}/revoke-sessions", headers=admin_headers)
    assert r.status_code == 200 and r.json() == {"revoked": 1}
    assert [anon.get("/me", headers=cookie_headers(t)).status_code for t in (a, b)] == [401, 401]
    assert client.get("/admin/accounts/999999/sessions", headers=admin_headers).status_code == 404


# ---- invites -------------------------------------------------------------------------------


def test_an_invite_is_readable_once_and_the_listing_never_carries_it(client, anon, owner_headers):
    r = client.post("/admin/invites", json={"note": "for Rumpi"}, headers=owner_headers)
    assert r.status_code == 200
    created = r.json()
    code = created["code"]
    assert len(code) == 9 and code[4] == "-" and created["group_slug"] == "altherren" and created["note"] == "for Rumpi"

    listing = client.get("/admin/invites", headers=owner_headers)
    assert listing.status_code == 200
    rows = listing.json()
    assert [row["id"] for row in rows] == [created["id"]]
    assert "code" not in rows[0] and code not in listing.text and normalize_code(code) not in listing.text
    assert rows[0]["created_by"]["display_name"] == "Editor2"

    # The code works for a stranger and then drops out of the listing.
    reg = anon.post("/auth/register", json={"code": code, "display_name": "Rumpi", "password": GOOD_PASSWORD})
    assert reg.status_code == 200
    assert client.get("/admin/invites", headers=owner_headers).json() == []


def test_a_revoked_invite_stops_working(client, anon, owner_headers):
    created = client.post("/admin/invites", json={}, headers=owner_headers).json()
    assert client.delete(f"/admin/invites/{created['id']}", headers=owner_headers).status_code == 200
    assert client.delete(f"/admin/invites/{created['id']}", headers=owner_headers).status_code == 404
    r = anon.post("/auth/register", json={"code": created["code"], "display_name": "Late", "password": GOOD_PASSWORD})
    assert r.status_code == 400


# ---- reset links ---------------------------------------------------------------------------


def test_a_reset_link_gives_a_player_with_no_login_one(client, anon, admin_headers):
    pid = client.post("/players", json={"display_name": "Rumpi"}, headers=admin_headers).json()["id"]
    assert anon.post("/auth/login", json={"username": "Rumpi", "password": GOOD_PASSWORD}).status_code == 401

    r = client.post("/admin/reset-links", json={"player_id": pid}, headers=admin_headers)
    assert r.status_code == 200
    out = r.json()
    assert out["player_id"] == pid and "/g/altherren/reset#" in out["url"]
    assert out["url"].startswith("http://testserver/")  # the configured auth_origin
    token = _token_from_url(out["url"])
    with Session(get_engine()) as s:
        assert token not in s.exec(select(PasswordResetToken)).one().token_hash

    r = anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD})
    assert r.status_code == 200 and r.json()["player_name"] == "Rumpi"
    login(anon, "rumpi", GOOD_PASSWORD)


def test_in_dev_origin_mode_the_link_follows_the_callers_origin(client, admin_headers):
    headers = {**admin_headers, "Origin": "http://192.168.178.78:8000"}
    r = client.post("/admin/reset-links", json={"player_id": _pid("Editor")}, headers=headers)
    assert r.json()["url"].startswith("http://192.168.178.78:8000/g/altherren/reset#")


def test_a_reset_link_for_nobody_is_404(client, admin_headers):
    assert client.post("/admin/reset-links", json={"player_id": 999999}, headers=admin_headers).status_code == 404


# ---- roles ---------------------------------------------------------------------------------


def test_an_owner_promotes_a_member_and_there_can_be_several(client, owner_headers, anon):
    pid = _pid("Editor")
    r = client.put(f"/admin/groups/altherren/members/{pid}/role", json={"role": "owner"}, headers=owner_headers)
    assert r.status_code == 200 and r.json()["role"] == "owner"
    with Session(get_engine()) as s:
        owners = s.exec(select(GroupMembership).where(GroupMembership.role == "owner")).all()
    assert len(owners) == 3  # Admin (migrated), Editor2, Editor
    me = anon.get("/me", headers=cookie_headers(login(anon, "Editor", "editor-secret"))).json()
    assert me["role"] == "owner"


def test_the_last_owner_cannot_be_demoted(client, admin_headers, owner_headers):
    admin_pid, owner_pid = _pid("Admin"), _pid("Editor2")
    r = client.put(f"/admin/groups/altherren/members/{admin_pid}/role", json={"role": "member"}, headers=owner_headers)
    assert r.status_code == 200  # two owners → one may go
    r = client.put(f"/admin/groups/altherren/members/{owner_pid}/role", json={"role": "member"}, headers=admin_headers)
    assert r.status_code == 409  # the last one stays, whoever asks
    # A site admin who is no longer an owner keeps the admin role everywhere.
    assert client.get("/admin/accounts", headers=admin_headers).status_code == 200


def test_role_changes_need_a_member_a_group_and_a_known_role(client, admin_headers):
    outsider = create_nogroup_account("Outsider")
    assert client.put(f"/admin/groups/altherren/members/{outsider}/role", json={"role": "owner"}, headers=admin_headers).status_code == 404
    assert client.put(f"/admin/groups/nope/members/{_pid('Editor')}/role", json={"role": "owner"}, headers=admin_headers).status_code == 404
    assert client.put(f"/admin/groups/altherren/members/{_pid('Editor')}/role", json={"role": "admin"}, headers=admin_headers).status_code == 422


def test_an_owner_of_another_group_cannot_change_roles_here(client):
    """Owner-ness is per group: owning `zweite` gives no say over `altherren`."""
    with Session(get_engine()) as s:
        other = Group(slug="zweite", name="Zweite")
        s.add(other)
        s.flush()
        s.add(GroupMembership(group_id=int(other.id), player_id=_pid("Editor2"), role="owner"))
        s.commit()
    headers = cookie_headers(login(client, "Editor2", "editor2-secret"))
    # Editor2 is only a member of the current group, so the router itself refuses (403) …
    r = client.put(f"/admin/groups/altherren/members/{_pid('Editor')}/role", json={"role": "owner"}, headers=headers)
    assert r.status_code == 403


# ---- the roster ----------------------------------------------------------------------------


def test_the_roster_hides_an_uninvited_account_until_it_redeems(client, anon, owner_headers):
    pid = create_nogroup_account("Waiting")
    names = {p["display_name"] for p in client.get("/players").json()}  # the shared client: Editor
    assert "Waiting" not in names and {"Editor", "Editor2", "Admin"} <= names

    code = client.post("/admin/invites", json={}, headers=owner_headers).json()["code"]
    assert anon.post("/auth/redeem", json={"code": code}, headers=cookie_headers(mint_session(pid))).status_code == 200
    assert "Waiting" in {p["display_name"] for p in client.get("/players").json()}


def test_the_site_admin_roster_is_everyone(client, admin_headers):
    create_nogroup_account("Waiting")
    assert "Waiting" in {p["display_name"] for p in client.get("/players", headers=admin_headers).json()}


# ---- the escape hatch: manage.py, as the deploy runs it ------------------------------------


def _manage(client, tmp_path: Path, *argv: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    db_url = client.app.state.settings.db_url
    secrets = tmp_path / "hatch-secrets.json"
    secrets.write_text(
        json.dumps(
            {
                "db_url": db_url,
                "player_accounts": [],
                "password_hash_profile": "test",
                "app_env": "test",
                "auth_origin": "https://lorbeerkranz.xyz",
            }
        ),
        encoding="utf-8",
    )
    return subprocess.run(
        [sys.executable, "manage.py", *argv, "--secrets", str(secrets), "--db-url", db_url],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        input=stdin,
        env={"PATH": "/usr/bin:/bin", "UPLOADS_DIR": str(tmp_path / "uploads")},
        timeout=120,
    )


def test_hatch_reset_link_prints_a_link_the_reset_endpoint_accepts(client, anon, tmp_path):
    r = _manage(client, tmp_path, "reset-link", "--player", "admin")  # any casing
    assert r.returncode == 0, r.stderr
    line = r.stdout.strip().splitlines()[-1]
    assert line.startswith("https://lorbeerkranz.xyz/g/altherren/reset#") and "Admin" in line
    token = line.split("#", 1)[1].split()[0]
    assert anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD}).status_code == 200
    login(anon, "Admin", GOOD_PASSWORD)


def test_hatch_set_password_asks_twice_and_stores_a_hash(client, anon, tmp_path):
    differ = _manage(client, tmp_path, "set-password", "--player", "Editor2", stdin="first-long-one\nsecond-long-one\n")
    assert differ.returncode == 1 and "differ" in differ.stderr
    short = _manage(client, tmp_path, "set-password", "--player", "Editor2", stdin="short\nshort\n")
    assert short.returncode == 1 and "at least 10" in short.stderr
    ok = _manage(client, tmp_path, "set-password", "--player", "Editor2", stdin=f"{GOOD_PASSWORD}\n{GOOD_PASSWORD}\n")
    assert ok.returncode == 0, ok.stderr
    assert GOOD_PASSWORD not in ok.stdout
    login(anon, "Editor2", GOOD_PASSWORD)
    with Session(get_engine()) as s:
        assert s.get(Account, _pid("Editor2")).password_origin == "set"


def test_hatch_make_admin_and_revoke(client, anon, tmp_path):
    r = _manage(client, tmp_path, "make-admin", "--player", "Editor")
    assert r.returncode == 0 and "now a site admin" in r.stdout
    me = anon.get("/me", headers=cookie_headers(login(anon, "Editor", "editor-secret"))).json()
    assert me["site_admin"] is True and me["role"] == "admin"
    r = _manage(client, tmp_path, "make-admin", "--player", "Editor", "--revoke")
    assert r.returncode == 0 and "no longer" in r.stdout
    with Session(get_engine()) as s:
        assert s.get(Account, _pid("Editor")).site_admin is False


def test_hatch_invite_prints_a_code_a_stranger_can_register_with(client, anon, tmp_path):
    r = _manage(client, tmp_path, "invite", "--group", "altherren", "--note", "cli")
    assert r.returncode == 0, r.stderr
    code = r.stdout.split()[0]
    assert len(code) == 9 and code[4] == "-"
    with Session(get_engine()) as s:
        row = s.exec(select(InviteCode)).one()
        assert row.created_by is None and row.note == "cli"
    reg = anon.post("/auth/register", json={"code": code, "display_name": "Cli", "password": GOOD_PASSWORD})
    assert reg.status_code == 200
    assert _manage(client, tmp_path, "invite", "--group", "nope").returncode == 1


def test_hatch_sessions_lists_and_revokes_all(client, anon, tmp_path):
    a = login(anon, "Editor2", "editor2-secret")
    b = login(anon, "Editor2", "editor2-secret")
    r = _manage(client, tmp_path, "sessions", "--player", "Editor2")
    assert r.returncode == 0 and r.stdout.startswith("2 live session(s) of Editor2")
    r = _manage(client, tmp_path, "sessions", "--player", "Editor2", "--revoke-all")
    assert r.returncode == 0 and "Revoked 2 session(s)" in r.stdout
    assert [anon.get("/me", headers=cookie_headers(t)).status_code for t in (a, b)] == [401, 401]
    with Session(get_engine()) as s:
        assert s.exec(select(AuthSession).where(AuthSession.player_id == _pid("Editor2"))).all() == []


def test_hatch_commands_refuse_an_unknown_player(client, tmp_path):
    for cmd in ("reset-link", "make-admin", "sessions"):
        r = _manage(client, tmp_path, cmd, "--player", "Nobody")
        assert r.returncode == 1 and "no account answers to" in r.stderr, cmd


def test_register_mints_a_session_the_admin_list_counts(client, anon, admin_headers):
    code = client.post("/admin/invites", json={}, headers=admin_headers).json()["code"]
    r = anon.post("/auth/register", json={"code": code, "display_name": "Counted", "password": GOOD_PASSWORD})
    assert _cookie_from_response(r)
    rows = {row["display_name"]: row for row in client.get("/admin/accounts", headers=admin_headers).json()}
    assert rows["Counted"]["session_count"] == 1 and rows["Counted"]["role"] == "editor"
