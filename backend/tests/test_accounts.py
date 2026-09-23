"""The account API (L3): register, redeem, reset, my password, case-insensitive names,
`group_id` on writes, the device label and the push's group prefix."""

from __future__ import annotations

import asyncio
import datetime as dt

import pytest
from sqlmodel import Session, select

from app.db import get_engine
from app.models import (
    Account,
    AuthSession,
    FeatureRequest,
    FriendlyMatch,
    Group,
    GroupMembership,
    InviteCode,
    Passkey,
    PasswordResetToken,
    Player,
    PushSubscription,
    Tournament,
)
from app.services import invites as invites_service
from app.services import notifications as notifications_service
from app.services.device_label import device_label
from app.services.groups import group_prefix_for_push
from app.services.invites import CODE_ALPHABET, INVALID_CODE, create_invite, format_code, normalize_code
from app.services.notifications import NotificationDispatcher, localized_push_message
from app.services.reset_links import INVALID_LINK, create_reset
from app.settings import Settings
from tests.conftest import (
    _cookie_from_response,
    cookie_headers,
    create_nogroup_account,
    create_tournament,
    login,
    mint_session,
)

GOOD_PASSWORD = "a-good-long-password"


def _group_id() -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Group).where(Group.slug == "altherren")).one().id)


def _mint_code(*, expires_in: dt.timedelta | None = None) -> str:
    with Session(get_engine()) as s:
        row, code = create_invite(s, group_id=_group_id(), created_by=None, note="test")
        if expires_in is not None:
            row.expires_at = dt.datetime.utcnow() + expires_in
            s.add(row)
        s.commit()
        return code


def _mint_reset(player_id: int, *, expires_in: dt.timedelta | None = None) -> str:
    with Session(get_engine()) as s:
        row, token = create_reset(s, player_id=player_id, created_by=None)
        if expires_in is not None:
            row.expires_at = dt.datetime.utcnow() + expires_in
            s.add(row)
        s.commit()
        return token


def _player_id(name: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Player).where(Player.display_name == name)).one().id)


def _register(anon, code: str, name: str = "Newbie", password: str = GOOD_PASSWORD):
    return anon.post("/auth/register", json={"code": code, "display_name": name, "password": password})


# ---- codes ---------------------------------------------------------------------------------


def test_a_code_is_eight_unambiguous_symbols_shown_in_two_halves():
    code = invites_service.new_code()
    assert len(code) == 8 and set(code) <= set(CODE_ALPHABET)
    assert not set("O0I1") & set(CODE_ALPHABET)
    assert format_code(code) == f"{code[:4]}-{code[4:]}"
    assert normalize_code(" abcd-efgh ") == "ABCDEFGH"
    assert normalize_code("ab cd\tef-gh") == "ABCDEFGH"


def test_the_invite_row_holds_only_the_hash(client):
    code = _mint_code()
    with Session(get_engine()) as s:
        row = s.exec(select(InviteCode)).one()
    assert normalize_code(code) not in row.code_hash and len(row.code_hash) == 64
    assert row.expires_at - row.created_at == dt.timedelta(hours=1)


# ---- register ------------------------------------------------------------------------------


def test_register_creates_player_account_membership_session_and_spends_the_code(anon):
    code = _mint_code()
    r = _register(anon, code.lower())  # typed in lowercase: normalised
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["player_name"] == "Newbie" and me["role"] == "editor"
    assert [(g["slug"], g["role"]) for g in me["groups"]] == [("altherren", "member")]
    assert me["has_password"] and not me["password_migrated"]
    token = _cookie_from_response(r)
    assert token

    pid = me["player_id"]
    with Session(get_engine()) as s:
        account = s.get(Account, pid)
        assert account.name_key == "newbie" and account.password_origin == "set"
        assert account.password_hash.startswith("$argon2id$")
        assert s.get(GroupMembership, (_group_id(), pid)).role == "member"
        invite = s.exec(select(InviteCode)).one()
        assert invite.redeemed_by == pid and invite.redeemed_at is not None
        assert s.exec(select(AuthSession).where(AuthSession.player_id == pid)).one().kind == "register"

    # The session works, and the new password logs in.
    assert anon.get("/tournaments", headers=cookie_headers(token)).status_code == 200
    login(anon, "newbie", GOOD_PASSWORD)


def test_a_code_works_once(anon):
    code = _mint_code()
    assert _register(anon, code, "First").status_code == 200
    r = _register(anon, code, "Second")
    assert r.status_code == 400 and r.json()["detail"] == INVALID_CODE


def test_expired_unknown_and_spent_codes_are_one_message(anon):
    expired = _mint_code(expires_in=dt.timedelta(seconds=-1))
    spent = _mint_code()
    assert _register(anon, spent, "Spender").status_code == 200
    answers = [
        _register(anon, expired, "A1"),
        _register(anon, "ZZZZ-ZZZZ", "A2"),
        _register(anon, spent, "A3"),
        _register(anon, "", "A4"),
    ]
    assert [r.status_code for r in answers] == [400, 400, 400, 400]
    assert {r.json()["detail"] for r in answers} == {INVALID_CODE}
    assert not any(r.headers.get_list("set-cookie") for r in answers)


def test_a_name_taken_by_case_is_409_and_leaves_the_code_unspent(anon):
    code = _mint_code()
    r = _register(anon, code, "editor")  # "Editor" exists
    assert r.status_code == 409 and r.json()["detail"] == "That name is taken"
    assert _register(anon, code, "Fresh").status_code == 200


def test_without_a_valid_code_a_taken_name_is_not_revealed(anon):
    r = _register(anon, "ZZZZ-ZZZZ", "Editor")
    assert r.status_code == 400 and r.json()["detail"] == INVALID_CODE


@pytest.mark.parametrize("password", ["123456789", ""])
def test_a_short_password_is_400_and_leaves_the_code_unspent(anon, password):
    code = _mint_code()
    r = _register(anon, code, "Shorty", password)
    assert r.status_code == 400 and "at least 10" in r.json()["detail"]
    assert _register(anon, code, "Shorty").status_code == 200


@pytest.mark.parametrize("name", ["", " ", "X", "x" * 41])
def test_a_name_outside_two_to_forty_characters_is_400(anon, name):
    r = _register(anon, _mint_code(), name)
    assert r.status_code == 400


def test_register_keeps_the_casing_and_logs_in_with_any(anon):
    assert _register(anon, _mint_code(), "  McFly ").status_code == 200
    with Session(get_engine()) as s:
        player = s.exec(select(Player).where(Player.display_name == "McFly")).one()
        assert s.get(Account, player.id).name_key == "mcfly"
    login(anon, "MCFLY", GOOD_PASSWORD)


def test_register_is_rate_limited_per_ip(anon):
    for _ in range(10):
        assert _register(anon, "ZZZZ-ZZZZ").status_code == 400
    r = _register(anon, _mint_code())  # even a good code waits
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    assert r.json()["detail"]["retry_after"] > 0


# ---- redeem --------------------------------------------------------------------------------


def test_an_account_without_a_group_redeems_a_code_and_becomes_a_member(anon):
    pid = create_nogroup_account("Waiting")
    headers = cookie_headers(mint_session(pid))
    assert anon.get("/tournaments", headers=headers).status_code == 403

    r = anon.post("/auth/redeem", json={"code": _mint_code()}, headers=headers)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["role"] == "editor" and [g["role"] for g in me["groups"]] == ["member"]
    assert anon.get("/tournaments", headers=headers).status_code == 200


def test_redeem_needs_a_session_and_a_valid_code(anon, editor_headers):
    assert anon.post("/auth/redeem", json={"code": _mint_code()}).status_code == 401
    pid = create_nogroup_account("Guesser")
    r = anon.post("/auth/redeem", json={"code": "ABCD-EFGH"}, headers=cookie_headers(mint_session(pid)))
    assert r.status_code == 400 and r.json()["detail"] == INVALID_CODE


def test_redeeming_into_a_group_you_are_in_is_409_and_spends_nothing(anon, editor_headers):
    code = _mint_code()
    r = anon.post("/auth/redeem", json={"code": code}, headers=editor_headers)
    assert r.status_code == 409
    with Session(get_engine()) as s:
        assert s.exec(select(InviteCode)).one().redeemed_at is None


def test_a_code_grants_membership_never_ownership(anon):
    pid = create_nogroup_account("Joiner")
    anon.post("/auth/redeem", json={"code": _mint_code()}, headers=cookie_headers(mint_session(pid)))
    with Session(get_engine()) as s:
        assert s.get(GroupMembership, (_group_id(), pid)).role == "member"


# ---- reset ---------------------------------------------------------------------------------


def test_a_reset_link_sets_the_password_ends_other_sessions_and_logs_in(anon):
    pid = _player_id("Editor2")
    other = login(anon, "Editor2", "editor2-secret")
    token = _mint_reset(pid)

    r = anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["player_id"] == pid and r.json()["has_password"]
    fresh = _cookie_from_response(r)

    assert anon.get("/me", headers=cookie_headers(other)).status_code == 401
    assert anon.get("/me", headers=cookie_headers(fresh)).status_code == 200
    with Session(get_engine()) as s:
        assert [row.kind for row in s.exec(select(AuthSession).where(AuthSession.player_id == pid)).all()] == ["reset"]
        assert s.get(Account, pid).password_origin == "set"
        assert s.exec(select(PasswordResetToken)).one().used_at is not None
    login(anon, "Editor2", GOOD_PASSWORD)
    r = anon.post("/auth/login", json={"username": "Editor2", "password": "editor2-secret"})
    assert r.status_code == 401

    again = anon.post("/auth/reset", json={"token": token, "password": "another-long-one"})
    assert again.status_code == 400 and again.json()["detail"] == INVALID_LINK


def test_expired_and_unknown_reset_tokens_are_one_message(anon):
    expired = _mint_reset(_player_id("Editor2"), expires_in=dt.timedelta(seconds=-1))
    answers = [
        anon.post("/auth/reset", json={"token": expired, "password": GOOD_PASSWORD}),
        anon.post("/auth/reset", json={"token": "nope", "password": GOOD_PASSWORD}),
        anon.post("/auth/reset", json={"token": "", "password": GOOD_PASSWORD}),
    ]
    assert [r.status_code for r in answers] == [400, 400, 400]
    assert {r.json()["detail"] for r in answers} == {INVALID_LINK}


def test_a_short_password_on_reset_leaves_the_link_usable(anon):
    token = _mint_reset(_player_id("Editor2"))
    assert anon.post("/auth/reset", json={"token": token, "password": "short"}).status_code == 400
    assert anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD}).status_code == 200


def test_a_new_reset_link_kills_the_previous_one(anon):
    pid = _player_id("Editor2")
    first = _mint_reset(pid)
    second = _mint_reset(pid)
    assert anon.post("/auth/reset", json={"token": first, "password": GOOD_PASSWORD}).status_code == 400
    assert anon.post("/auth/reset", json={"token": second, "password": GOOD_PASSWORD}).status_code == 200


# ---- my password ---------------------------------------------------------------------------


def test_changing_my_password_needs_the_current_one(anon):
    headers = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    wrong = anon.post("/auth/password", json={"current_password": "not-it-at-all", "new_password": GOOD_PASSWORD}, headers=headers)
    assert wrong.status_code == 403
    missing = anon.post("/auth/password", json={"new_password": GOOD_PASSWORD}, headers=headers)
    assert missing.status_code == 403
    short = anon.post("/auth/password", json={"current_password": "editor2-secret", "new_password": "short"}, headers=headers)
    assert short.status_code == 400

    ok = anon.post("/auth/password", json={"current_password": "editor2-secret", "new_password": GOOD_PASSWORD}, headers=headers)
    assert ok.status_code == 200 and ok.json()["password_migrated"] is False and ok.json()["has_password"]
    assert anon.get("/me", headers=headers).status_code == 200  # this device stays in
    login(anon, "Editor2", GOOD_PASSWORD)


def test_an_account_without_a_password_sets_its_first_without_a_current_one(anon, client, admin_headers):
    pid = client.post("/players", json={"display_name": "Passless"}, headers=admin_headers).json()["id"]
    headers = cookie_headers(mint_session(pid))
    r = anon.post("/auth/password", json={"new_password": GOOD_PASSWORD}, headers=headers)
    assert r.status_code == 200 and r.json()["has_password"]
    login(anon, "Passless", GOOD_PASSWORD)


def test_wrong_current_passwords_are_rate_limited_like_a_login(anon):
    headers = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    for _ in range(10):
        r = anon.post("/auth/password", json={"current_password": "not-it-at-all", "new_password": GOOD_PASSWORD}, headers=headers)
        assert r.status_code == 403
    r = anon.post("/auth/password", json={"current_password": "editor2-secret", "new_password": GOOD_PASSWORD}, headers=headers)
    assert r.status_code == 429


def test_removing_the_password_needs_a_passkey(anon):
    pid = _player_id("Editor2")
    headers = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    r = anon.delete("/auth/password", headers=headers)
    assert r.status_code == 409

    with Session(get_engine()) as s:
        s.add(Passkey(player_id=pid, credential_id="cred-1", public_key="pk"))
        s.commit()
    r = anon.delete("/auth/password", headers=headers)
    assert r.status_code == 200 and r.json()["has_password"] is False and r.json()["has_passkey"] is True
    assert anon.delete("/auth/password", headers=headers).status_code == 409  # nothing left to remove
    assert anon.post("/auth/login", json={"username": "Editor2", "password": "editor2-secret"}).status_code == 401


# ---- names on the admin's player routes ----------------------------------------------------


def test_create_player_refuses_a_name_taken_by_case_and_writes_account_and_membership(client, admin_headers):
    r = client.post("/players", json={"display_name": "editor"}, headers=admin_headers)
    assert r.status_code == 409
    r = client.post("/players", json={"display_name": "Editor"}, headers=admin_headers)
    assert r.status_code == 409  # no longer silently the existing row

    pid = client.post("/players", json={"display_name": "Rookie"}, headers=admin_headers).json()["id"]
    with Session(get_engine()) as s:
        account = s.get(Account, pid)
        assert account.name_key == "rookie" and account.password_hash is None and account.password_origin == "none"
        assert s.get(GroupMembership, (_group_id(), pid)).role == "member"


def test_renaming_a_player_moves_the_login_name_and_refuses_a_case_clash(client, admin_headers, anon):
    pid = _player_id("Editor2")
    assert client.patch(f"/players/{pid}", json={"display_name": "EDITOR"}, headers=admin_headers).status_code == 409
    # Recasing one's own name is fine.
    assert client.patch(f"/players/{pid}", json={"display_name": "EDITOR2"}, headers=admin_headers).status_code == 200
    r = client.patch(f"/players/{pid}", json={"display_name": "Renamed"}, headers=admin_headers)
    assert r.status_code == 200
    with Session(get_engine()) as s:
        assert s.get(Account, pid).name_key == "renamed"
    login(anon, "renamed", "editor2-secret")


# ---- group_id on writes --------------------------------------------------------------------


def test_new_tournaments_friendlies_and_ideas_carry_the_current_group(client, editor_headers):
    ids = [_player_id(n) for n in ("Editor", "Editor2")]
    tid = create_tournament(client, editor_headers, "Grouped", "1v1", ids)
    r = client.post(
        "/friendlies",
        json={"mode": "1v1", "teamA_player_ids": [ids[0]], "teamB_player_ids": [ids[1]], "a_goals": 1, "b_goals": 0},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    r = client.post("/ideas", json={"title": "Grouped idea", "body": "", "kind": "feature", "areas": ["general"]}, headers=editor_headers)
    assert r.status_code == 200, r.text
    iid = r.json()["id"]
    gid = _group_id()
    with Session(get_engine()) as s:
        assert s.get(Tournament, tid).group_id == gid
        assert s.get(FriendlyMatch, fid).group_id == gid
        assert s.get(FeatureRequest, iid).group_id == gid


# ---- the device label ----------------------------------------------------------------------

UA = {
    "iphone": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "iphone_pwa": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "ipad": "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "android": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    "mac": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "windows": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "linux_ff": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "edge": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    "ios_chrome": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1",
}


@pytest.mark.parametrize(
    "ua,label",
    [
        (UA["iphone"], "iPhone · Safari"),
        (UA["iphone_pwa"], "iPhone · Safari"),
        (UA["ipad"], "iPad · Safari"),
        (UA["android"], "Android · Chrome"),
        (UA["mac"], "Mac · Safari"),
        (UA["windows"], "Windows · Chrome"),
        (UA["linux_ff"], "Linux · Firefox"),
        (UA["edge"], "Windows · Edge"),
        (UA["ios_chrome"], "iPhone · Chrome"),
        ("curl/8.5.0", "Unknown device"),
        ("", "Unknown device"),
        (None, "Unknown device"),
    ],
)
def test_device_label(ua, label):
    assert device_label(ua) == label


def test_a_login_records_the_device_label(anon):
    r = anon.post(
        "/auth/login", json={"username": "Editor2", "password": "editor2-secret"}, headers={"User-Agent": UA["iphone"]}
    )
    headers = cookie_headers(_cookie_from_response(r))
    rows = anon.get("/auth/sessions", headers=headers).json()
    assert [row["device_label"] for row in rows if row["current"]] == ["iPhone · Safari"]


# ---- the push names its group only for someone in several ---------------------------------


def _second_group_for(pid: int) -> None:
    with Session(get_engine()) as s:
        other = Group(slug="zweite", name="Zweite")
        s.add(other)
        s.flush()
        s.add(GroupMembership(group_id=int(other.id), player_id=pid, role="member"))
        s.commit()


def test_group_prefix_only_for_a_player_in_two_groups(client):
    pid = _player_id("Editor2")
    with Session(get_engine()) as s:
        assert group_prefix_for_push(s, pid) == ""
    _second_group_for(pid)
    with Session(get_engine()) as s:
        assert group_prefix_for_push(s, pid) == "Altherren · "
        assert group_prefix_for_push(s, _player_id("Editor")) == ""


def test_a_delivered_push_carries_the_prefix_for_that_recipient_only(client, monkeypatch):
    in_two, in_one = _player_id("Editor2"), _player_id("Editor")
    _second_group_for(in_two)

    async def run() -> list[tuple[int, str]]:
        sent: list[tuple[str, str]] = []

        async def fake_send(client, config, subscription, payload):
            sent.append((str(subscription.endpoint), str(payload["title"])))

            class FakeResponse:
                status_code = 201
                text = ""

            return FakeResponse()

        monkeypatch.setattr(notifications_service, "send_web_push_message", fake_send)
        dispatcher = NotificationDispatcher(
            get_engine(),
            Settings(
                db_url="sqlite://",
                player_accounts=(),
                log_level="DEBUG",
                push_vapid_public_key="k",
                push_vapid_private_key="k",
                push_vapid_subject="mailto:t@example.com",
            ),
        )
        dispatcher._client = object()
        dispatcher._runtime_ready = True
        with Session(get_engine()) as s:
            for pid in (in_two, in_one):
                s.add(
                    PushSubscription(
                        player_id=pid,
                        endpoint=f"https://push.example.test/{pid}",
                        endpoint_hash=f"h{pid}",
                        p256dh="p",
                        auth="a",
                        content_encoding="aes128gcm",
                    )
                )
            s.commit()
        message = localized_push_message("tournament_finished", event_type="tournament_finished", tournament_name="Cup")
        await dispatcher._deliver(notifications_service._QueuedPushMessage(message=message))
        return sent

    sent = dict(asyncio.run(run()))
    plain = sent[f"https://push.example.test/{in_one}"]
    assert sent[f"https://push.example.test/{in_two}"] == f"Altherren · {plain}"
    assert not plain.startswith("Altherren")
