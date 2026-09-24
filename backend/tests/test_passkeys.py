"""Passkeys (L8): the two ceremonies against a real software authenticator, and every
refusal the server must make — each one built by the authenticator on purpose, none of
them stubbed. The relying-party rule, the one-way-in rule, revocation by ownership, and
"removing a passkey ends every session" are here too.

The test app runs in dev-origin mode with `Origin: http://localhost` — a secure context
over plain http, which is exactly how Chrome's virtual authenticator exercises it against
the isolated stack. Production pins `https://lorbeerkranz.xyz`; that half is the pure
`relying_party_for` matrix.
"""

from __future__ import annotations

import datetime as dt
import json

from sqlmodel import Session, select

from app.auth_gate import CLASS_ACCOUNT, CLASS_PUBLIC, classify
from app.db import get_engine
from app.models import Account, AuthSession, Passkey, WebAuthnChallenge
from app.routers.auth import (
    PASSKEY_ALREADY_REGISTERED,
    PASSKEY_LAST_WAY_IN,
    PASSKEY_LOGIN_REFUSED,
    PASSKEY_ORIGIN_REFUSED,
    PASSKEY_REGISTER_REFUSED,
)
from app.services.passkeys import RelyingParty, relying_party_for
from app.services.sessions import SESSION_COOKIE
from tests.conftest import _cookie_from_response, cookie_headers, create_nogroup_account, login, make_settings, mint_session
from tests.soft_authenticator import SoftAuthenticator, unb64url

ORIGIN = "http://localhost"
GOOD_PASSWORD = "a-good-long-password"


# ---- helpers -----------------------------------------------------------------------------


def _headers(token: str, origin: str | None = ORIGIN, **extra: str) -> dict:
    h = {**cookie_headers(token), **extra}
    if origin is not None:
        h["Origin"] = origin
    return h


def _anon_headers(origin: str | None = ORIGIN) -> dict:
    """Nobody: an explicit empty `Cookie` beats whatever a previous Set-Cookie left in the jar."""
    h = {"Cookie": ""}
    if origin is not None:
        h["Origin"] = origin
    return h


def _register(anon, headers: dict, auth: SoftAuthenticator, *, label: str = "Phone", origin: str = ORIGIN, **knobs):
    r = anon.post("/auth/passkeys/register/options", headers=headers)
    assert r.status_code == 200, r.text
    credential = auth.create(r.json(), origin, **knobs)
    return anon.post("/auth/passkeys/register/verify", json={"credential": credential, "label": label}, headers=headers)


def _login_options(anon, origin: str | None = ORIGIN) -> dict:
    r = anon.post("/auth/passkeys/login/options", headers=_anon_headers(origin))
    assert r.status_code == 200, r.text
    return r.json()


def _sign_in(anon, auth: SoftAuthenticator, *, origin: str = ORIGIN, request_origin: str | None = ORIGIN, **knobs):
    credential = auth.get(_login_options(anon), origin, **knobs)
    return anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers(request_origin))


def _account(name: str) -> Account:
    with Session(get_engine()) as s:
        row = s.exec(select(Account).where(Account.name_key == name.casefold())).one()
        s.expunge(row)
        return row


def _passkeys(player_id: int) -> list[Passkey]:
    with Session(get_engine()) as s:
        rows = list(s.exec(select(Passkey).where(Passkey.player_id == player_id)).all())
        for row in rows:
            s.expunge(row)
        return rows


def _challenges() -> list[WebAuthnChallenge]:
    with Session(get_engine()) as s:
        rows = list(s.exec(select(WebAuthnChallenge)).all())
        for row in rows:
            s.expunge(row)
        return rows


def _live_sessions(player_id: int) -> int:
    with Session(get_engine()) as s:
        return len(s.exec(select(AuthSession).where(AuthSession.player_id == player_id)).all())


# ---- the ceremonies ----------------------------------------------------------------------


def test_registration_options_require_a_resident_key_and_user_verification(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    r = anon.post("/auth/passkeys/register/options", headers=headers)
    assert r.status_code == 200, r.text
    options = r.json()
    account = _account("Editor2")
    assert options["rp"] == {"name": "Lorbeerkranz", "id": "localhost"}
    assert options["user"]["id"] == account.webauthn_user_handle
    assert options["user"]["name"] == "Editor2" and options["user"]["displayName"] == "Editor2"
    assert options["authenticatorSelection"]["residentKey"] == "required"
    assert options["authenticatorSelection"]["requireResidentKey"] is True
    assert options["authenticatorSelection"]["userVerification"] == "required"
    assert options["attestation"] == "none"
    assert options.get("excludeCredentials", []) == []
    assert len(options["challenge"]) >= 43  # 32+ random bytes, base64url
    rows = _challenges()
    assert len(rows) == 1 and rows[0].kind == "register" and rows[0].player_id == account.player_id
    assert rows[0].challenge == options["challenge"]
    assert rows[0].expires_at > dt.datetime.utcnow() + dt.timedelta(minutes=4)


def test_register_list_and_sign_in_round_trip(anon):
    token = login(anon, "Editor2", "editor2-secret")
    headers = _headers(token)
    auth = SoftAuthenticator()

    r = _register(anon, headers, auth, label="  Phone  ")
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["label"] == "Phone" and out["device_type"] == "multi_device" and out["backed_up"] is True
    assert out["last_used_at"] is None and set(out) == {"id", "label", "device_type", "backed_up", "created_at", "last_used_at"}
    assert _challenges() == []  # consumed

    listed = anon.get("/auth/passkeys", headers=headers).json()
    assert [p["id"] for p in listed] == [out["id"]]
    me = anon.get("/me", headers=headers).json()
    assert me["has_passkey"] is True and me["has_password"] is True

    # The stored row carries the public key and the credential id, never the private key.
    (row,) = _passkeys(me["player_id"])
    assert row.credential_id == auth.credential_id_b64 and row.sign_count == 0
    assert unb64url(row.public_key) == auth.cose_public_key()
    assert row.transports == '["internal"]' and row.aaguid == "00000000-0000-0000-0000-000000000000"

    # Sign in: no identifier, no cookie, just the assertion.
    r = _sign_in(anon, auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["player_name"] == "Editor2" and body["role"] == "editor" and body["has_passkey"] is True
    new_token = _cookie_from_response(r)
    assert new_token and new_token != token
    assert anon.get("/me", headers=cookie_headers(new_token)).status_code == 200
    kinds = {s["kind"] for s in anon.get("/auth/sessions", headers=cookie_headers(new_token)).json()}
    assert "passkey" in kinds and "password" in kinds
    (row,) = _passkeys(me["player_id"])
    assert row.sign_count == 1 and row.last_used_at is not None


def test_sign_in_asks_for_no_identifier_and_sends_no_allow_credentials(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    assert _register(anon, headers, SoftAuthenticator()).status_code == 200
    options = _login_options(anon)
    assert "allowCredentials" not in options, options
    assert options["rpId"] == "localhost" and options["userVerification"] == "required"
    assert set(options) <= {"challenge", "timeout", "rpId", "userVerification"}
    rows = _challenges()
    assert len(rows) == 1 and rows[0].kind == "login" and rows[0].player_id is None


def test_exclude_credentials_carries_the_existing_ids(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    first, second = SoftAuthenticator(), SoftAuthenticator()
    assert _register(anon, headers, first).status_code == 200
    assert _register(anon, headers, second).status_code == 200
    options = anon.post("/auth/passkeys/register/options", headers=headers).json()
    excluded = {c["id"] for c in options["excludeCredentials"]}
    assert excluded == {first.credential_id_b64, second.credential_id_b64}
    assert all(c["type"] == "public-key" and c["transports"] == ["internal"] for c in options["excludeCredentials"])


def test_a_synced_passkey_that_never_counts_signs_in_every_time(anon):
    """iCloud Keychain reports a counter of 0 on every use; that must not read as a clone."""
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    assert _sign_in(anon, auth, counter=0).status_code == 200
    assert _sign_in(anon, auth, counter=0).status_code == 200


def test_an_account_with_no_membership_can_add_a_passkey_and_still_gets_403_past_the_account_paths(anon):
    pid = create_nogroup_account("Loner")
    headers = _headers(mint_session(pid))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    r = _sign_in(anon, auth)
    assert r.status_code == 200 and r.json()["role"] == "none" and r.json()["groups"] == []
    fresh = cookie_headers(_cookie_from_response(r))
    assert anon.get("/me", headers=fresh).status_code == 200
    assert anon.get("/tournaments", headers=fresh).status_code == 403


def test_the_label_defaults_to_the_device(anon):
    headers = _headers(
        login(anon, "Editor2", "editor2-secret"),
        **{"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"},
    )
    r = _register(anon, headers, SoftAuthenticator(), label="")
    assert r.status_code == 200 and r.json()["label"] == "iPhone · Safari"


# ---- the refusals, each one real -----------------------------------------------------------


def test_a_replayed_assertion_is_refused(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    credential = auth.get(_login_options(anon), ORIGIN)
    first = anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers())
    assert first.status_code == 200, first.text
    replay = anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers())
    assert replay.status_code == 401 and replay.json()["detail"] == PASSKEY_LOGIN_REFUSED
    assert not replay.headers.get_list("set-cookie")
    # A fresh signature over the same, already-consumed challenge is a replay too.
    again = auth.get({"challenge": _challenge_of(credential), "rpId": "localhost"}, ORIGIN)
    r = anon.post("/auth/passkeys/login/verify", json={"credential": again}, headers=_anon_headers())
    assert r.status_code == 401


def _challenge_of(credential: dict) -> str:
    return json.loads(unb64url(credential["response"]["clientDataJSON"]))["challenge"]


def test_a_wrong_origin_is_refused_on_both_ceremonies(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    # Registration signed for another origin: the request says localhost, the client data does not.
    r = _register(anon, headers, auth, origin="http://localhost:9999")
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _passkeys(_account("Editor2").player_id) == []
    assert _register(anon, headers, auth).status_code == 200
    r = _sign_in(anon, auth, origin="http://localhost:9999")
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    r = _sign_in(anon, auth, origin="https://lorbeerkranz.xyz")
    assert r.status_code == 401


def test_a_wrong_rp_id_hash_is_refused_on_both_ceremonies(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth, rp_id="evil.localhost").status_code == 400
    assert _register(anon, headers, auth).status_code == 200
    r = _sign_in(anon, auth, rp_id="evil.localhost")
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    assert _sign_in(anon, auth, rp_id="lorbeerkranz.xyz").status_code == 401


def test_user_verification_is_required_on_both_ceremonies(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth, user_verified=False).status_code == 400
    assert _register(anon, headers, auth).status_code == 200
    assert _sign_in(anon, auth, user_verified=False).status_code == 401
    assert _sign_in(anon, auth, user_present=False).status_code == 401
    assert _sign_in(anon, auth).status_code == 200


def test_a_counter_that_goes_backwards_is_refused_and_the_stored_count_stays(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    pid = _account("Editor2").player_id
    assert _sign_in(anon, auth, counter=5).status_code == 200
    assert _passkeys(pid)[0].sign_count == 5
    r = _sign_in(anon, auth, counter=3)  # a clone that is behind
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    assert _passkeys(pid)[0].sign_count == 5
    assert _sign_in(anon, auth, counter=5).status_code == 401  # not even equal
    assert _passkeys(pid)[0].sign_count == 5
    assert _sign_in(anon, auth, counter=6).status_code == 200
    assert _passkeys(pid)[0].sign_count == 6


def test_a_signature_from_another_credential_is_refused(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    mine, theirs = SoftAuthenticator(), SoftAuthenticator()
    assert _register(anon, headers, mine).status_code == 200
    assert _register(anon, headers, theirs).status_code == 200
    pid = _account("Editor2").player_id
    # `theirs` signs, claiming `mine`'s credential id — the key does not match the stored one.
    theirs.user_handle = mine.user_handle
    r = _sign_in(anon, theirs, credential_id=mine.credential_id)
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    # And the other way: `mine`'s id, `theirs`'s key doing the signing.
    r = _sign_in(anon, mine, signer=theirs)
    assert r.status_code == 401
    assert all(row.sign_count == 0 and row.last_used_at is None for row in _passkeys(pid))
    assert _sign_in(anon, mine).status_code == 200


def test_a_credential_the_server_has_never_seen_is_refused(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    assert _register(anon, headers, SoftAuthenticator()).status_code == 200
    stranger = SoftAuthenticator()
    stranger.rp_id = "localhost"
    stranger.user_handle = unb64url(_account("Editor2").webauthn_user_handle)
    r = _sign_in(anon, stranger)
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    assert not r.headers.get_list("set-cookie")


def test_an_expired_challenge_is_refused_and_consumed(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    options = _login_options(anon)
    with Session(get_engine()) as s:
        row = s.exec(select(WebAuthnChallenge).where(WebAuthnChallenge.challenge == options["challenge"])).one()
        row.expires_at = dt.datetime.utcnow() - dt.timedelta(seconds=1)
        s.add(row)
        s.commit()
    credential = auth.get(options, ORIGIN)
    r = anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers())
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    assert _challenges() == []


def test_a_challenge_of_one_ceremony_cannot_answer_the_other(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    # A sign-in challenge presented as a registration.
    first_reg_options = anon.post("/auth/passkeys/register/options", headers=headers).json()
    login_options = _login_options(anon)
    credential = auth.create(first_reg_options, ORIGIN, challenge=login_options["challenge"])
    r = anon.post("/auth/passkeys/register/verify", json={"credential": credential}, headers=headers)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    # A registration challenge presented at sign-in.
    assert _register(anon, headers, auth).status_code == 200
    reg_options = anon.post("/auth/passkeys/register/options", headers=headers).json()
    assertion = auth.get({"challenge": reg_options["challenge"], "rpId": "localhost"}, ORIGIN)
    r = anon.post("/auth/passkeys/login/verify", json={"credential": assertion}, headers=_anon_headers())
    assert r.status_code == 401
    # Every challenge that was *presented* is gone; the one never presented (the first
    # registration mint, which the test answered with the sign-in challenge) is not.
    assert {row.challenge for row in _challenges()} == {first_reg_options["challenge"]}


def test_a_registration_challenge_is_bound_to_the_account_that_minted_it(anon):
    editor2 = _headers(login(anon, "Editor2", "editor2-secret"))
    editor = _headers(login(anon, "Editor", "editor-secret"))
    options = anon.post("/auth/passkeys/register/options", headers=editor2).json()
    credential = SoftAuthenticator().create(options, ORIGIN)
    r = anon.post("/auth/passkeys/register/verify", json={"credential": credential}, headers=editor)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED
    assert _passkeys(_account("Editor").player_id) == [] and _passkeys(_account("Editor2").player_id) == []
    assert _challenges() == []


def test_a_user_handle_that_is_not_the_credentials_account_is_refused(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    other = unb64url(_account("Editor").webauthn_user_handle)
    assert _sign_in(anon, auth, user_handle=other).status_code == 401
    # An assertion without a user handle is the credential's word alone — still fine.
    auth.user_handle = None
    assert _sign_in(anon, auth).status_code == 200


def test_malformed_credentials_are_the_same_refusal(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    for bad in ({}, {"id": 1}, {"id": "x", "rawId": "x", "type": "public-key", "response": {}}, {"response": {"clientDataJSON": "!!"}}):
        r = anon.post("/auth/passkeys/register/verify", json={"credential": bad}, headers=headers)
        assert r.status_code == 400 and r.json()["detail"] == PASSKEY_REGISTER_REFUSED, bad
        r = anon.post("/auth/passkeys/login/verify", json={"credential": bad}, headers=_anon_headers())
        assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED, bad
    assert anon.post("/auth/passkeys/login/verify", json={}, headers=_anon_headers()).status_code == 401


def test_every_sign_in_refusal_is_one_sentence(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    details = set()
    stranger = SoftAuthenticator()
    stranger.rp_id = "localhost"
    details.add(_sign_in(anon, stranger).json()["detail"])  # unknown credential
    details.add(_sign_in(anon, auth, origin="http://localhost:1").json()["detail"])  # wrong origin
    details.add(_sign_in(anon, auth, user_verified=False).json()["detail"])  # UV clear
    credential = auth.get(_login_options(anon), ORIGIN)
    anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers())
    details.add(anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers()).json()["detail"])
    details.add(anon.post("/auth/passkeys/login/verify", json={"credential": {}}, headers=_anon_headers()).json()["detail"])
    details.add(anon.post("/auth/passkeys/login/verify", json={"credential": credential}, headers=_anon_headers(None)).json()["detail"])
    assert details == {PASSKEY_LOGIN_REFUSED}


def test_registering_the_same_credential_twice_is_409(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    assert _register(anon, headers, auth).status_code == 200
    r = _register(anon, headers, auth)
    assert r.status_code == 409 and r.json()["detail"] == PASSKEY_ALREADY_REGISTERED
    assert len(_passkeys(_account("Editor2").player_id)) == 1


# ---- the relying party -----------------------------------------------------------------------


def test_the_relying_party_is_pinned_in_production_and_derived_only_in_dev(tmp_path):
    pinned = make_settings(tmp_path / "x.db", auth_dev_origin=False, auth_origin="https://lorbeerkranz.xyz", auth_rp_id="lorbeerkranz.xyz")
    expect = RelyingParty(rp_id="lorbeerkranz.xyz", origin="https://lorbeerkranz.xyz", rp_name="Lorbeerkranz")
    assert relying_party_for(pinned, origin=None) == expect  # curl, a same-origin GET
    assert relying_party_for(pinned, origin="https://lorbeerkranz.xyz") == expect
    assert relying_party_for(pinned, origin="https://LORBEERKRANZ.xyz/") == expect
    assert relying_party_for(pinned, origin="https://evil.example") is None
    assert relying_party_for(pinned, origin="http://lorbeerkranz.xyz") is None
    assert relying_party_for(pinned, origin="https://lorbeerkranz.xyz:8443") is None
    assert relying_party_for(pinned, origin="null") is None

    dev = make_settings(tmp_path / "y.db", auth_dev_origin=True)
    assert relying_party_for(dev, origin="http://localhost:8259") == RelyingParty("localhost", "http://localhost:8259", "Lorbeerkranz")
    assert relying_party_for(dev, origin="http://localhost") == RelyingParty("localhost", "http://localhost", "Lorbeerkranz")
    assert relying_party_for(dev, origin="http://127.0.0.1:8259") == RelyingParty("127.0.0.1", "http://127.0.0.1:8259", "Lorbeerkranz")
    assert relying_party_for(dev, origin="https://dev.example:8443") == RelyingParty("dev.example", "https://dev.example:8443", "Lorbeerkranz")
    # Plain http off localhost is not a secure context anywhere, so it is not a relying party here.
    assert relying_party_for(dev, origin="http://192.168.178.78:8000") is None
    assert relying_party_for(dev, origin="http://lorbeerkranz.xyz") is None
    # Not an origin at all: the rule never guesses.
    for junk in (None, "", "null", "localhost", "ftp://localhost", "http://localhost/path", "http://user@localhost", "http://localhost:abc"):
        assert relying_party_for(dev, origin=junk) is None, junk


def test_the_dev_rule_is_enforced_on_the_wire(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"), origin="http://192.168.178.78:8000")
    r = anon.post("/auth/passkeys/register/options", headers=headers)
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_ORIGIN_REFUSED
    r = anon.post("/auth/passkeys/register/options", headers=_headers(login(anon, "Editor2", "editor2-secret"), origin=None))
    assert r.status_code == 400 and r.json()["detail"] == PASSKEY_ORIGIN_REFUSED
    r = anon.post("/auth/passkeys/login/options", headers=_anon_headers("http://192.168.178.78:8000"))
    assert r.status_code == 401 and r.json()["detail"] == PASSKEY_LOGIN_REFUSED
    assert _challenges() == []


# ---- one way in, revocation by ownership, every session ends -----------------------------------


def test_the_last_passkey_stays_while_there_is_no_password(anon):
    headers = _headers(login(anon, "Editor2", "editor2-secret"))
    auth = SoftAuthenticator()
    passkey_id = _register(anon, headers, auth).json()["id"]
    pid = _account("Editor2").player_id

    r = anon.delete("/auth/password", headers=headers)  # allowed: a passkey keeps a way in
    assert r.status_code == 200 and r.json()["has_password"] is False and r.json()["has_passkey"] is True
    r = anon.delete(f"/auth/passkeys/{passkey_id}", headers=headers)
    assert r.status_code == 409 and r.json()["detail"] == PASSKEY_LAST_WAY_IN
    assert len(_passkeys(pid)) == 1 and anon.get("/me", headers=headers).status_code == 200  # nothing ended

    # A second passkey makes the first removable; the last one is not, until a password is back.
    second_id = _register(anon, headers, SoftAuthenticator()).json()["id"]
    r = anon.delete(f"/auth/passkeys/{passkey_id}", headers=headers)
    assert r.status_code == 200
    assert _sign_in(anon, auth).status_code == 401  # the first key is gone for good
    resumed = _headers(mint_session(pid))  # the removal ended every session, this one included
    assert anon.delete(f"/auth/passkeys/{second_id}", headers=resumed).status_code == 409
    assert anon.post("/auth/password", json={"new_password": GOOD_PASSWORD}, headers=resumed).status_code == 200
    assert anon.delete(f"/auth/passkeys/{second_id}", headers=resumed).status_code == 200
    assert _passkeys(pid) == []
    assert anon.post("/auth/login", json={"username": "Editor2", "password": GOOD_PASSWORD}).status_code == 200


def test_removing_a_passkey_ends_every_session_this_one_included(anon):
    mine = login(anon, "Editor2", "editor2-secret")
    headers = _headers(mine)
    other_device = cookie_headers(login(anon, "Editor2", "editor2-secret"))
    pid = _account("Editor2").player_id
    auth = SoftAuthenticator()
    passkey_id = _register(anon, headers, auth).json()["id"]
    r = _sign_in(anon, auth)
    passkey_device = cookie_headers(_cookie_from_response(r))
    assert _live_sessions(pid) == 3

    r = anon.delete(f"/auth/passkeys/{passkey_id}", headers=headers)
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert any("Max-Age=0" in h for h in r.headers.get_list("set-cookie") if h.startswith(SESSION_COOKIE))
    assert _live_sessions(pid) == 0 and _passkeys(pid) == []
    for h in (headers, other_device, passkey_device):
        assert anon.get("/me", headers=h).status_code == 401
    # The credential is gone for good: signing in with it is an unknown credential now.
    assert _sign_in(anon, auth).status_code == 401
    r = anon.post("/auth/login", json={"username": "Editor2", "password": "editor2-secret"}, headers={"Cookie": ""})
    assert r.status_code == 200 and r.json()["has_passkey"] is False


def test_someone_elses_passkey_is_a_404_and_stays(anon):
    editor2 = _headers(login(anon, "Editor2", "editor2-secret"))
    passkey_id = _register(anon, editor2, SoftAuthenticator()).json()["id"]
    editor = _headers(login(anon, "Editor", "editor-secret"))
    admin = _headers(login(anon, "Admin", "admin-secret"))
    assert anon.delete(f"/auth/passkeys/{passkey_id}", headers=editor).status_code == 404
    assert anon.delete(f"/auth/passkeys/{passkey_id}", headers=admin).status_code == 404  # by ownership, not by role
    assert anon.delete("/auth/passkeys/999999", headers=editor2).status_code == 404
    assert len(_passkeys(_account("Editor2").player_id)) == 1
    assert anon.get("/me", headers=editor2).status_code == 200  # nobody was signed out
    assert anon.get("/auth/passkeys", headers=editor).json() == []


# ---- the gate, the limiter, the sweep ----------------------------------------------------------


def test_the_sign_in_pair_is_public_and_the_rest_is_an_account_path():
    assert classify("/auth/passkeys/login/options") == CLASS_PUBLIC
    assert classify("/auth/passkeys/login/verify") == CLASS_PUBLIC
    assert classify("/auth/passkeys/register/options") == CLASS_ACCOUNT
    assert classify("/auth/passkeys/register/verify") == CLASS_ACCOUNT
    assert classify("/auth/passkeys") == CLASS_ACCOUNT
    assert classify("/auth/passkeys/3") == CLASS_ACCOUNT


def test_the_register_pair_needs_a_session(anon):
    assert anon.post("/auth/passkeys/register/options", headers=_anon_headers()).status_code == 401
    assert anon.post("/auth/passkeys/register/verify", json={"credential": {}}, headers=_anon_headers()).status_code == 401
    assert anon.get("/auth/passkeys", headers=_anon_headers()).status_code == 401
    assert anon.delete("/auth/passkeys/1", headers=_anon_headers()).status_code == 401


def test_sign_in_mints_are_rate_limited_per_ip(anon):
    for _ in range(30):
        assert anon.post("/auth/passkeys/login/options", headers=_anon_headers()).status_code == 200
    r = anon.post("/auth/passkeys/login/options", headers=_anon_headers())
    assert r.status_code == 429 and r.headers.get("retry-after") and r.json()["detail"]["retry_after"] >= 1
    r = anon.post("/auth/passkeys/login/verify", json={"credential": {}}, headers=_anon_headers())
    assert r.status_code == 429
    assert len(_challenges()) == 30


def test_expired_challenges_are_swept_when_options_are_minted(anon):
    with Session(get_engine()) as s:
        s.add(WebAuthnChallenge(challenge="stale-one", kind="login", expires_at=dt.datetime.utcnow() - dt.timedelta(minutes=1)))
        s.add(WebAuthnChallenge(challenge="stale-two", kind="register", player_id=1, expires_at=dt.datetime.utcnow() - dt.timedelta(hours=1)))
        s.commit()
    assert len(_challenges()) == 2
    _login_options(anon)
    rows = _challenges()
    assert len(rows) == 1 and rows[0].challenge not in ("stale-one", "stale-two")
