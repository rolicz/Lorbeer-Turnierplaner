"""A passkey from a reset token, and the atomic passkey-only registration (E2) — against
L8's real software authenticator, every refusal built on purpose and, after every refusal,
the row counts of `player`, `account`, `passkey`, `groupmembership` and `authsession`
asserted equal to before and the invite unspent. An account must never exist without a way
in, and a token must never be spent without a credential stored.

Dev-origin mode with `Origin: http://localhost`, as `test_passkeys.py`."""

from __future__ import annotations

import datetime as dt
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlmodel import Session, select

from app.auth_gate import CLASS_PUBLIC, PUBLIC_PATHS, classify
from app.db import get_engine
from app.models import Account, AuthSession, GroupMembership, InviteCode, Passkey, PasswordResetToken, Player, RegistrationIntent, WebAuthnChallenge
from app.routers import auth as auth_router
from app.routers.auth import PASSKEY_ALREADY_REGISTERED, PASSKEY_ORIGIN_REFUSED, PASSKEY_REGISTER_REFUSED
from app.services import invites as invites_service
from app.services import passkeys as passkeys_service
from app.services.accounts import NAME_TAKEN
from app.services.invites import INVALID_CODE, create_invite
from app.services.passkeys import sweep_expired_challenges
from app.services.reset_links import INVALID_LINK, create_reset
from tests.conftest import _cookie_from_response, cookie_headers, login
from tests.soft_authenticator import SoftAuthenticator, unb64url

ORIGIN = "http://localhost"
GOOD_PASSWORD = "a-good-long-password"
COUNTED = (Player, Account, Passkey, GroupMembership, AuthSession)


# ---- helpers -----------------------------------------------------------------------------


def _headers(origin: str | None = ORIGIN, token: str | None = None) -> dict:
    h = {"Cookie": f"lk_session={token}" if token else ""}
    if origin is not None:
        h["Origin"] = origin
    return h


def _counts() -> dict[str, int]:
    with Session(get_engine()) as s:
        return {model.__tablename__: len(s.exec(select(model)).all()) for model in COUNTED}


def _rows(model) -> list:
    with Session(get_engine()) as s:
        rows = list(s.exec(select(model)).all())
        for row in rows:
            s.expunge(row)
        return rows


def _group_id() -> int:
    from app.models import Group

    with Session(get_engine()) as s:
        return int(s.exec(select(Group).where(Group.slug == "altherren")).one().id)


def _mint_code() -> str:
    with Session(get_engine()) as s:
        _row, code = create_invite(s, group_id=_group_id(), created_by=None, note="test")
        s.commit()
        return code


def _mint_reset(player_id: int) -> str:
    with Session(get_engine()) as s:
        _row, token = create_reset(s, player_id=player_id, created_by=None)
        s.commit()
        return token


def _pid(name: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Player).where(Player.display_name == name)).one().id)


def _invites_unspent() -> bool:
    return all(row.redeemed_at is None for row in _rows(InviteCode))


def _new_options(anon, code: str, name: str, origin: str | None = ORIGIN):
    return anon.post("/auth/register/passkey/options", json={"code": code, "display_name": name}, headers=_headers(origin))


def _new_verify(anon, credential: dict, *, label: str = "Phone", origin: str | None = ORIGIN, **extra_headers: str):
    return anon.post("/auth/register/passkey/verify", json={"credential": credential, "label": label}, headers={**_headers(origin), **extra_headers})


def _register_new(anon, code: str, name: str, auth: SoftAuthenticator, *, origin: str = ORIGIN, label: str = "Phone", **knobs):
    r = _new_options(anon, code, name)
    assert r.status_code == 200, r.text
    return _new_verify(anon, auth.create(r.json(), origin, **knobs), label=label)


def _reset_options(anon, token: str, origin: str | None = ORIGIN):
    return anon.post("/auth/reset/passkey/options", json={"token": token}, headers=_headers(origin))


def _reset_verify(anon, token: str, credential: dict, *, label: str = "Phone", origin: str | None = ORIGIN):
    return anon.post("/auth/reset/passkey/verify", json={"token": token, "credential": credential, "label": label}, headers=_headers(origin))


def _reset_with_passkey(anon, token: str, auth: SoftAuthenticator, *, origin: str = ORIGIN, **knobs):
    r = _reset_options(anon, token)
    assert r.status_code == 200, r.text
    return _reset_verify(anon, token, auth.create(r.json(), origin, **knobs))


def _sign_in(anon, auth: SoftAuthenticator):
    options = anon.post("/auth/passkeys/login/options", headers=_headers()).json()
    return anon.post("/auth/passkeys/login/verify", json={"credential": auth.get(options, ORIGIN)}, headers=_headers())


def _password_register(anon, code: str, name: str):
    return anon.post("/auth/register", json={"code": code, "display_name": name, "password": GOOD_PASSWORD}, headers={"Cookie": ""})


def _crashing_client(client) -> TestClient:
    """A client that reports a crash as a 500 instead of re-raising it."""
    return TestClient(client.app, raise_server_exceptions=False)


# ---- the passkey-only registration: the happy path ------------------------------------------


def test_options_for_a_new_account_mint_an_intent_and_nothing_about_the_person(anon):
    code = _mint_code()
    before = _counts()
    r = _new_options(anon, code.lower(), "  Newbie ")
    assert r.status_code == 200, r.text
    options = r.json()
    assert options["rp"] == {"name": "Lorbeerkranz", "id": "localhost"}
    assert options["user"]["name"] == "Newbie" and options["user"]["displayName"] == "Newbie"
    assert options["authenticatorSelection"]["residentKey"] == "required"
    assert options["authenticatorSelection"]["userVerification"] == "required"
    assert options["attestation"] == "none" and options.get("excludeCredentials", []) == []
    assert options["user"]["id"] not in {a.webauthn_user_handle for a in _rows(Account)}
    assert len(unb64url(options["user"]["id"])) == 32

    [challenge] = _rows(WebAuthnChallenge)
    assert challenge.kind == "register-new" and challenge.player_id is None and challenge.challenge == options["challenge"]
    [intent] = _rows(RegistrationIntent)
    assert intent.challenge_id == challenge.id and intent.display_name == "Newbie" and intent.user_handle == options["user"]["id"]
    assert intent.invite_id == _rows(InviteCode)[0].id
    assert _counts() == before and _invites_unspent()


def test_register_with_a_passkey_creates_everything_in_one_commit_and_signs_in(anon):
    code = _mint_code()
    auth = SoftAuthenticator()
    r = _register_new(anon, code, "Newbie", auth, label="  Phone  ")
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["player_name"] == "Newbie" and me["role"] == "editor" and [(g["slug"], g["role"]) for g in me["groups"]] == [("altherren", "member")]
    assert me["has_passkey"] is True and me["has_password"] is False and me["password_migrated"] is False
    assert me["login_secure"] is True and me["email_verified"] is False and me["email"] is None
    token = _cookie_from_response(r)
    assert token
    pid = me["player_id"]

    with Session(get_engine()) as s:
        account = s.get(Account, pid)
        assert account.name_key == "newbie" and account.password_hash is None and account.password_origin == "none"
        assert unb64url(account.webauthn_user_handle) == auth.user_handle  # the handle the authenticator stored
        [passkey] = s.exec(select(Passkey).where(Passkey.player_id == pid)).all()
        assert passkey.credential_id == auth.credential_id_b64 and passkey.label == "Phone" and passkey.device_type == "multi_device"
        assert s.get(GroupMembership, (_group_id(), pid)).role == "member"
        invite = s.exec(select(InviteCode)).one()
        assert invite.redeemed_by == pid and invite.redeemed_at is not None
        assert [row.kind for row in s.exec(select(AuthSession).where(AuthSession.player_id == pid)).all()] == ["register"]
    assert _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == []

    assert anon.get("/tournaments", headers=cookie_headers(token)).status_code == 200
    assert [p["label"] for p in anon.get("/auth/passkeys", headers=cookie_headers(token)).json()] == ["Phone"]
    r = _sign_in(anon, auth)
    assert r.status_code == 200 and r.json()["player_name"] == "Newbie" and r.json()["has_passkey"] is True
    assert anon.post("/auth/login", json={"username": "Newbie", "password": GOOD_PASSWORD}, headers={"Cookie": ""}).status_code == 401


def test_the_label_defaults_to_the_device(anon):
    r = _new_options(anon, _mint_code(), "Newbie")
    credential = SoftAuthenticator().create(r.json(), ORIGIN)
    ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
    r = _new_verify(anon, credential, label="", **{"User-Agent": ua})
    assert r.status_code == 200, r.text
    assert _rows(Passkey)[0].label == "iPhone · Safari"


# ---- the passkey-only registration: every refusal leaves no trace ----------------------------


@pytest.mark.parametrize(
    "knobs",
    [{"origin": "http://localhost:9999"}, {"origin": "https://lorbeerkranz.xyz"}, {"rp_id": "evil.localhost"}, {"user_verified": False}],
    ids=["wrong-origin", "other-site", "wrong-rp-id", "uv-clear"],
)
def test_a_ceremony_that_does_not_verify_leaves_no_rows_and_the_code_unspent(anon, knobs):
    code = _mint_code()
    before = _counts()
    r = _register_new(anon, code, "Newbie", SoftAuthenticator(), **knobs)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert not r.headers.get_list("set-cookie")
    assert _counts() == before and _invites_unspent()
    assert _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == []  # consumed, not reusable
    # The code still works — a fresh ceremony from the top.
    assert _register_new(anon, code, "Newbie", SoftAuthenticator()).status_code == 200


def test_a_corrupted_attestation_object_is_refused_and_leaves_no_rows(anon):
    """(With `attestation: "none"` there is no signature over the attested key — a client
    that swaps the key bytes simply registers a key it holds, which is the ordinary case;
    what the server refuses is an attestation it cannot parse.)"""
    code = _mint_code()
    before = _counts()
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    blob = credential["response"]["attestationObject"]
    credential["response"]["attestationObject"] = blob[: len(blob) // 2]
    r = _new_verify(anon, credential)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _counts() == before and _invites_unspent()
    # Refused at the parse, before the challenge could even be read: nothing was taken, and
    # the well-formed answer to the same options still registers.
    assert len(_rows(RegistrationIntent)) == 1 and len(_rows(WebAuthnChallenge)) == 1
    assert _new_verify(anon, SoftAuthenticator().create(options, ORIGIN)).status_code == 200


def test_malformed_credentials_are_the_same_refusal_and_leave_no_rows(anon):
    _new_options(anon, _mint_code(), "Newbie")
    before = _counts()
    for bad in ({}, {"id": 1}, {"id": "x", "rawId": "x", "type": "public-key", "response": {}}, {"response": {"clientDataJSON": "!!"}}):
        r = _new_verify(anon, bad)
        assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED, bad
    assert _counts() == before and _invites_unspent() and len(_rows(RegistrationIntent)) == 1  # nothing was even taken


def test_a_code_spent_meanwhile_is_refused_at_verify_and_leaves_no_rows(anon):
    code = _mint_code()
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    assert _password_register(anon, code, "Quicker").status_code == 200  # the code goes to someone else meanwhile
    before = _counts()
    r = _new_verify(anon, credential)
    assert r.status_code == 400 and r.json()["detail"] == INVALID_CODE
    assert _counts() == before
    assert [p.display_name for p in _rows(Player)].count("Newbie") == 0
    assert _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == []


def test_a_code_expired_meanwhile_is_refused_at_verify_and_leaves_no_rows(anon, monkeypatch):
    """The re-check at verify is by the *intent's* invite id and it is the full liveness rule:
    `spend_invite`'s conditional UPDATE alone would catch a spent code but not an expired one."""
    code = _mint_code()
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    before = _counts()
    monkeypatch.setattr(invites_service, "_now", lambda: dt.datetime.utcnow() + dt.timedelta(hours=2))
    r = _new_verify(anon, credential)
    assert r.status_code == 400 and r.json()["detail"] == INVALID_CODE
    assert _counts() == before and _invites_unspent()


def test_a_name_taken_meanwhile_is_409_and_leaves_no_rows(anon):
    code = _mint_code()
    options = _new_options(anon, code, "Twin").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    assert _password_register(anon, _mint_code(), "twin").status_code == 200  # by case, meanwhile
    before = _counts()
    r = _new_verify(anon, credential)
    assert r.status_code == 409 and r.json()["detail"] == NAME_TAKEN
    assert _counts() == before
    with Session(get_engine()) as s:  # the passkey flow's own code is still unspent
        rows = s.exec(select(InviteCode)).all()
        assert sorted(row.redeemed_at is None for row in rows) == [False, True]


def test_a_crash_before_the_commit_leaves_no_account_and_the_code_usable(anon, client, monkeypatch):
    """The transaction boundary is where the plan says: a crash after the passkey row is added
    and before the commit rolls the whole account back."""
    code = _mint_code()
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    before = _counts()

    def boom(*args, **kwargs):
        raise RuntimeError("injected crash before the commit")

    monkeypatch.setattr(auth_router, "create_session", boom)
    r = _crashing_client(client).post("/auth/register/passkey/verify", json={"credential": credential, "label": "Phone"}, headers=_headers())
    assert r.status_code == 500
    assert _counts() == before and _invites_unspent()
    assert _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == []
    with Session(get_engine()) as s:
        assert s.exec(select(Player).where(Player.display_name == "Newbie")).first() is None
    monkeypatch.undo()
    assert _register_new(anon, code, "Newbie", SoftAuthenticator()).status_code == 200


def test_a_replayed_verify_is_refused(anon):
    code = _mint_code()
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    assert _new_verify(anon, credential).status_code == 200
    after = _counts()
    r = _new_verify(anon, credential)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _counts() == after
    # A fresh signature over the same, already-consumed challenge is a replay too.
    again = SoftAuthenticator().create(options, ORIGIN)
    assert _new_verify(anon, again).status_code == 400


def test_an_unanswered_sheet_leaves_no_player_and_the_intent_is_swept_with_its_challenge(anon, monkeypatch):
    code = _mint_code()
    before = _counts()
    assert _new_options(anon, code, "Newbie").status_code == 200
    assert _counts() == before and len(_rows(RegistrationIntent)) == 1
    monkeypatch.setattr(passkeys_service, "_now", lambda: dt.datetime.utcnow() + dt.timedelta(minutes=6))
    with Session(get_engine()) as s:
        assert sweep_expired_challenges(s) == 1
    assert _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == []
    assert _counts() == before and _invites_unspent()
    monkeypatch.undo()
    assert _password_register(anon, code, "Newbie").status_code == 200  # the code was never spent


def test_the_sweep_drops_an_intent_whose_challenge_is_already_gone(anon):
    _new_options(anon, _mint_code(), "Newbie")
    with Session(get_engine()) as s:
        s.exec(WebAuthnChallenge.__table__.delete())
        s.commit()
        assert len(s.exec(select(RegistrationIntent)).all()) == 1
        sweep_expired_challenges(s)
    assert _rows(RegistrationIntent) == []


def test_without_a_valid_code_a_taken_name_is_not_revealed_at_options(anon):
    r = _new_options(anon, "NOPE-NOPE", "Editor")
    assert r.status_code == 400 and r.json()["detail"] == INVALID_CODE
    r = _new_options(anon, _mint_code(), "editor")
    assert r.status_code == 409 and r.json()["detail"] == NAME_TAKEN
    assert _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == [] and _invites_unspent()


def test_the_name_is_validated_at_options_and_the_code_stays(anon):
    code = _mint_code()
    r = _new_options(anon, code, "X")
    assert r.status_code == 400 and r.json()["detail"] == "The name must be 2 to 40 characters long"
    assert _rows(RegistrationIntent) == [] and _invites_unspent()
    assert _new_options(anon, code, "Xy").status_code == 200


def test_a_new_account_challenge_and_a_logged_in_challenge_cannot_answer_each_other(anon):
    # A register-new challenge presented to the logged-in pair: kind mismatch, consumed.
    code = _mint_code()
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    editor2 = _headers(token=login(anon, "Editor2", "editor2-secret"))
    r = anon.post("/auth/passkeys/register/verify", json={"credential": credential, "label": "x"}, headers=editor2)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _rows(Passkey) == [] and _rows(RegistrationIntent) == [] and _rows(WebAuthnChallenge) == []
    # A logged-in registration challenge presented as a new-account registration: no intent, consumed.
    before = _counts()
    options = anon.post("/auth/passkeys/register/options", headers=editor2).json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    r = _new_verify(anon, credential)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _counts() == before and _rows(WebAuthnChallenge) == [] and _invites_unspent()


def test_each_intent_spends_its_own_invite(anon):
    code_a, code_b = _mint_code(), _mint_code()
    options_a = _new_options(anon, code_a, "Alpha").json()
    options_b = _new_options(anon, code_b, "Bravo").json()
    assert _new_verify(anon, SoftAuthenticator().create(options_b, ORIGIN)).status_code == 200
    spent = [row.redeemed_by for row in _rows(InviteCode) if row.redeemed_at is not None]
    assert spent == [_pid("Bravo")]
    assert _new_verify(anon, SoftAuthenticator().create(options_a, ORIGIN)).status_code == 200
    assert not _invites_unspent() and all(row.redeemed_at is not None for row in _rows(InviteCode))


def test_an_origin_the_rule_refuses_is_400_on_the_register_pair(anon):
    code = _mint_code()
    r = _new_options(anon, code, "Newbie", origin="http://192.168.178.78:8000")
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_ORIGIN_REFUSED
    assert _new_options(anon, code, "Newbie", origin=None).status_code == 400
    assert _rows(WebAuthnChallenge) == []
    options = _new_options(anon, code, "Newbie").json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    before = _counts()
    r = _new_verify(anon, credential, origin="http://192.168.178.78:8000")
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_ORIGIN_REFUSED
    assert _counts() == before and _invites_unspent()
    assert _new_verify(anon, credential).status_code == 200  # refused before the take: the ceremony is still answerable


def test_the_register_pair_is_public_and_every_mint_counts_against_redeem(anon):
    assert classify("/auth/register/passkey/options") == CLASS_PUBLIC and classify("/auth/register/passkey/verify") == CLASS_PUBLIC
    code = _mint_code()
    for _ in range(10):
        assert _new_options(anon, code, "Newbie").status_code == 200
    r = _new_options(anon, code, "Newbie")
    assert r.status_code == 429 and r.headers.get("retry-after")
    assert _new_verify(anon, {}).status_code == 429
    assert _password_register(anon, code, "Newbie").status_code == 429  # one family
    assert len(_rows(RegistrationIntent)) == 10


# ---- a passkey from a reset token ------------------------------------------------------------


def test_a_reset_link_sets_a_passkey_ends_other_sessions_and_logs_in(anon):
    pid = _pid("Editor2")
    other = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    token = _mint_reset(pid)
    auth = SoftAuthenticator()

    r = _reset_options(anon, token)
    assert r.status_code == 200, r.text
    options = r.json()
    assert options["user"]["name"] == "Editor2" and options.get("excludeCredentials", []) == []
    with Session(get_engine()) as s:
        assert options["user"]["id"] == s.get(Account, pid).webauthn_user_handle  # the account's own handle
    [challenge] = _rows(WebAuthnChallenge)
    assert challenge.kind == "register" and challenge.player_id == pid
    assert _rows(PasswordResetToken)[0].used_at is None  # looked at, not spent

    r = _reset_verify(anon, token, auth.create(options, ORIGIN), label="  Phone ")
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["player_id"] == pid and me["has_passkey"] is True and me["has_password"] is True and me["login_secure"] is True
    fresh = _cookie_from_response(r)
    assert fresh
    assert anon.get("/me", headers=cookie_headers(other)).status_code == 401
    assert anon.get("/me", headers=cookie_headers(fresh)).status_code == 200
    with Session(get_engine()) as s:
        assert [row.kind for row in s.exec(select(AuthSession).where(AuthSession.player_id == pid)).all()] == ["reset"]
        assert s.exec(select(PasswordResetToken)).one().used_at is not None
        [passkey] = s.exec(select(Passkey).where(Passkey.player_id == pid)).all()
        assert passkey.credential_id == auth.credential_id_b64 and passkey.label == "Phone"
        assert unb64url(s.get(Account, pid).webauthn_user_handle) == auth.user_handle
    assert [p["label"] for p in anon.get("/auth/passkeys", headers=cookie_headers(fresh)).json()] == ["Phone"]
    assert _rows(WebAuthnChallenge) == []

    r = _sign_in(anon, auth)
    assert r.status_code == 200 and r.json()["player_name"] == "Editor2"
    # The token is spent: neither half of the page takes it again.
    assert _reset_options(anon, token).status_code == 400 and _reset_options(anon, token).json()["detail"] == INVALID_LINK
    assert _reset_verify(anon, token, auth.create(options, ORIGIN)).status_code == 400
    assert anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD}).status_code == 400


def test_a_cancelled_sheet_leaves_the_token_usable_for_the_password_half(anon):
    token = _mint_reset(_pid("Editor2"))
    assert _reset_options(anon, token).status_code == 200  # the sheet was closed: no verify ever comes
    r = anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD})
    assert r.status_code == 200 and r.json()["has_passkey"] is False


@pytest.mark.parametrize(
    "knobs",
    [{"origin": "http://localhost:9999"}, {"rp_id": "evil.localhost"}, {"user_verified": False}],
    ids=["wrong-origin", "wrong-rp-id", "uv-clear"],
)
def test_a_ceremony_that_fails_spends_the_challenge_and_not_the_token(anon, knobs):
    pid = _pid("Editor2")
    token = _mint_reset(pid)
    r = _reset_with_passkey(anon, token, SoftAuthenticator(), **knobs)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert not r.headers.get_list("set-cookie")
    assert _rows(Passkey) == [] and _rows(WebAuthnChallenge) == []
    assert _rows(PasswordResetToken)[0].used_at is None
    # A second try with the same link works — and so would the password half.
    assert _reset_with_passkey(anon, token, SoftAuthenticator()).status_code == 200


def test_a_malformed_credential_on_the_reset_pair_spends_nothing(anon):
    token = _mint_reset(_pid("Editor2"))
    assert _reset_options(anon, token).status_code == 200
    for bad in ({}, {"id": 1}, {"response": {"clientDataJSON": "!!"}}):
        r = _reset_verify(anon, token, bad)
        assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED, bad
    assert len(_rows(WebAuthnChallenge)) == 1 and _rows(PasswordResetToken)[0].used_at is None and _rows(Passkey) == []


def test_a_token_spent_by_a_password_reset_meanwhile_stores_no_passkey(anon):
    pid = _pid("Editor2")
    token = _mint_reset(pid)
    options = _reset_options(anon, token).json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    assert anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD}).status_code == 200  # the other tab
    r = _reset_verify(anon, token, credential)
    assert r.status_code == 400 and r.json()["detail"] == INVALID_LINK
    assert _rows(Passkey) == []


def test_a_token_that_loses_the_race_at_the_spend_stores_no_passkey(anon, client, monkeypatch):
    """The concurrent reset lands *between* the token lookup and the conditional spend — the
    credential has verified, and it is still not stored, because the spend refuses first."""
    pid = _pid("Editor2")
    token = _mint_reset(pid)
    options = _reset_options(anon, token).json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    real = auth_router.verified_registration

    def verified_then_raced(rp, parsed, client_data):
        result = real(rp, parsed, client_data)
        with Session(get_engine()) as s:  # the other tab's reset commits while this ceremony is in flight
            s.exec(update(PasswordResetToken).where(PasswordResetToken.player_id == pid).values(used_at=dt.datetime.utcnow()))
            s.commit()
        return result

    monkeypatch.setattr(auth_router, "verified_registration", verified_then_raced)
    r = _reset_verify(anon, token, credential)
    assert r.status_code == 400 and r.json()["detail"] == INVALID_LINK
    assert _rows(Passkey) == [] and _rows(WebAuthnChallenge) == []
    assert not r.headers.get_list("set-cookie")


def test_a_challenge_minted_with_one_token_cannot_be_stored_with_another(anon):
    """Two live links, two accounts: a credential created for X's link, posted with Y's link,
    is refused (the challenge is bound to X's account), stores nothing, and spends neither."""
    x_token = _mint_reset(_pid("Editor2"))
    y_token = _mint_reset(_pid("Editor"))
    options = _reset_options(anon, x_token).json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    r = _reset_verify(anon, y_token, credential)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _rows(Passkey) == [] and _rows(WebAuthnChallenge) == []
    assert all(row.used_at is None for row in _rows(PasswordResetToken))
    assert _reset_with_passkey(anon, x_token, SoftAuthenticator()).status_code == 200
    assert anon.post("/auth/reset", json={"token": y_token, "password": GOOD_PASSWORD}).status_code == 200


def test_unknown_used_and_expired_tokens_are_the_generic_400_at_options_and_mint_nothing(anon, monkeypatch):
    pid = _pid("Editor2")
    used = _mint_reset(pid)
    assert anon.post("/auth/reset", json={"token": used, "password": GOOD_PASSWORD}).status_code == 200
    answers = [_reset_options(anon, used), _reset_options(anon, "nope"), _reset_options(anon, "")]
    expired = _mint_reset(pid)
    from app.services import reset_links as reset_links_service

    monkeypatch.setattr(reset_links_service, "_now", lambda: dt.datetime.utcnow() + dt.timedelta(hours=2))
    answers.append(_reset_options(anon, expired))
    assert [r.status_code for r in answers] == [400, 400, 400, 400]
    assert {r.json()["detail"] for r in answers} == {INVALID_LINK}
    assert _rows(WebAuthnChallenge) == []


def test_a_crash_before_the_commit_leaves_the_token_live_and_no_passkey(anon, client, monkeypatch):
    pid = _pid("Editor2")
    other = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    token = _mint_reset(pid)
    options = _reset_options(anon, token).json()
    credential = SoftAuthenticator().create(options, ORIGIN)

    def boom(*args, **kwargs):
        raise RuntimeError("injected crash before the commit")

    monkeypatch.setattr(auth_router, "create_session", boom)
    r = _crashing_client(client).post("/auth/reset/passkey/verify", json={"token": token, "credential": credential, "label": "x"}, headers=_headers())
    assert r.status_code == 500
    assert _rows(Passkey) == [] and _rows(PasswordResetToken)[0].used_at is None
    assert anon.get("/me", headers=other).status_code == 200  # nothing was ended either
    monkeypatch.undo()
    assert anon.post("/auth/reset", json={"token": token, "password": GOOD_PASSWORD}).status_code == 200


def test_the_same_credential_twice_is_409_and_the_second_token_stays_live(anon):
    pid = _pid("Editor2")
    auth = SoftAuthenticator()
    assert _reset_with_passkey(anon, _mint_reset(pid), auth).status_code == 200
    second = _mint_reset(pid)
    options = _reset_options(anon, second).json()
    assert [c["id"] for c in options["excludeCredentials"]] == [auth.credential_id_b64]  # the browser would refuse; the server too
    r = _reset_verify(anon, second, auth.create(options, ORIGIN))
    assert r.status_code == 409 and r.json()["detail"] == PASSKEY_ALREADY_REGISTERED
    assert len(_rows(Passkey)) == 1
    assert anon.post("/auth/reset", json={"token": second, "password": GOOD_PASSWORD}).status_code == 200


def test_an_origin_the_rule_refuses_is_400_on_the_reset_pair_and_the_token_stays(anon):
    token = _mint_reset(_pid("Editor2"))
    r = _reset_options(anon, token, origin="http://192.168.178.78:8000")
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_ORIGIN_REFUSED
    assert _reset_options(anon, token, origin=None).status_code == 400
    assert _rows(WebAuthnChallenge) == [] and _rows(PasswordResetToken)[0].used_at is None
    options = _reset_options(anon, token).json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    r = _reset_verify(anon, token, credential, origin="http://192.168.178.78:8000")
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_ORIGIN_REFUSED
    assert _reset_verify(anon, token, credential).status_code == 200


def test_the_reset_pair_is_public_and_limited_as_reset(anon):
    assert classify("/auth/reset/passkey/options") == CLASS_PUBLIC and classify("/auth/reset/passkey/verify") == CLASS_PUBLIC
    for _ in range(10):
        assert _reset_options(anon, "nope").status_code == 400
    assert _reset_options(anon, "nope").status_code == 429
    assert _reset_verify(anon, "nope", {}).status_code == 429
    assert anon.post("/auth/reset", json={"token": "nope", "password": GOOD_PASSWORD}).status_code == 429  # one family


def test_every_mint_on_the_reset_pair_counts(anon, monkeypatch):
    from app.services.rate_limit import LIMITS

    monkeypatch.setitem(LIMITS, "reset", (None, (2, 3600), (40, 3600)))
    token = _mint_reset(_pid("Editor2"))
    assert _reset_options(anon, token).status_code == 200
    assert _reset_options(anon, token).status_code == 200
    assert _reset_options(anon, token).status_code == 429
    assert len(_rows(WebAuthnChallenge)) == 2


# ---- the gate ------------------------------------------------------------------------------


def test_the_five_paths_are_listed_public_and_nothing_else_moved():
    added = ("/auth/recover", "/auth/reset/passkey/options", "/auth/reset/passkey/verify", "/auth/register/passkey/options", "/auth/register/passkey/verify")
    for path in added:
        assert path in PUBLIC_PATHS and classify(path) == CLASS_PUBLIC, path
    # The logged-in pair did not become public by accident.
    assert classify("/auth/passkeys/register/options") != CLASS_PUBLIC and classify("/auth/passkeys/register/verify") != CLASS_PUBLIC


def test_the_intent_row_never_carries_the_credential(anon):
    """What the server remembers between options and verify is the invite, the name and the
    handle — never anything the client could later replace."""
    _new_options(anon, _mint_code(), "Newbie")
    [intent] = _rows(RegistrationIntent)
    assert set(json.loads(intent.model_dump_json())) == {"id", "challenge_id", "invite_id", "display_name", "user_handle", "created_at"}
