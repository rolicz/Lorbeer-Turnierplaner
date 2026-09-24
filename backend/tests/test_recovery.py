"""Recovery by email (E2): a verified address gets the reset link; nothing else does; the
answer never says which; the link is sent after the answer; what recovery ends and keeps;
the *recover* limits; what reaches a log."""

from __future__ import annotations

import datetime as dt
import logging
import re

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth_gate import CLASS_PUBLIC, PUBLIC_PATHS, classify
from app.db import get_engine
from app.models import AccountEmail, AuthSession, Passkey, PasswordResetToken, Player
from app.services.mail import MailSendError
from app.services.rate_limit import LIMITS, limits_for
from app.services.reset_links import INVALID_LINK, create_reset, hash_reset_token
from tests.conftest import _cookie_from_response, cookie_headers, login, mail_off, mail_sent
from tests.soft_authenticator import SoftAuthenticator

URL_RE = re.compile(r"https?://\S+")
ADDR = "editor@example.test"
NEW_PASSWORD = "fifteen-chars-ok"  # 16


def _pid(name: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Player).where(Player.display_name == name)).one().id)


def _token_of(message) -> str:
    urls = URL_RE.findall(message.text)
    assert len(urls) == 1, urls
    return urls[0].split("#", 1)[1]


def _set_and_verify(client, anon, email: str, headers: dict | None = None) -> None:
    r = client.put("/auth/email", json={"email": email}, headers=headers or {})
    assert r.status_code == 200, r.text
    v = anon.post("/auth/email/verify", json={"token": _token_of(mail_sent(client)[-1])})
    assert v.status_code == 200, v.text


def _reset_tokens(pid: int | None = None) -> list[PasswordResetToken]:
    with Session(get_engine()) as s:
        stmt = select(PasswordResetToken)
        if pid is not None:
            stmt = stmt.where(PasswordResetToken.player_id == pid)
        return list(s.exec(stmt).all())


def _recover(anon, email: str, headers: dict | None = None):
    """Nobody asks: an explicit empty `Cookie` beats whatever a previous Set-Cookie left in the jar."""
    return anon.post("/auth/recover", json={"email": email}, headers={"Cookie": "", **(headers or {})})


# ---- the limits ----------------------------------------------------------------------------


def test_the_recover_family_counts_per_address_per_ip_and_globally():
    assert LIMITS["recover"] == ((3, 3600), (5, 3600), (30, 3600))
    keys = limits_for("recover", ip="10.0.0.9", account="roli@example.test")
    assert [k.key for k in keys] == ["recover:account:roli@example.test", "recover:ip:10.0.0.9", "recover:global"]
    assert [k.per_account for k in keys] == [True, False, False]


# ---- the happy path ------------------------------------------------------------------------


def test_a_verified_address_gets_one_link_that_sets_a_new_password(client, anon):
    _set_and_verify(client, anon, ADDR)
    pid = _pid("Editor")
    other_device = cookie_headers(login(anon, "Editor", "editor-secret"))
    before = len(mail_sent(client))

    r = _recover(anon, f"  {ADDR} ")
    assert r.status_code == 200 and r.json() == {"ok": True}

    [row] = _reset_tokens(pid)
    assert row.created_by is None and row.used_at is None and row.expires_at - row.created_at == dt.timedelta(hours=1)
    [msg] = mail_sent(client)[before:]
    assert msg.to == ADDR and msg.kind == "recover" and msg.subject == "Get back into Lorbeerkranz"
    urls = URL_RE.findall(msg.text)
    assert len(urls) == 1 and urls[0].startswith("http://testserver/g/altherren/reset#")
    assert f"\n{urls[0]}\n" in msg.text  # the link stands on a line of its own
    assert "one hour" in msg.text and "signs out every other device" in msg.text
    token = _token_of(msg)
    assert row.token_hash == hash_reset_token(token) and token not in row.token_hash

    r = anon.post("/auth/reset", json={"token": token, "password": NEW_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["player_id"] == pid and r.json()["has_password"] is True and r.json()["login_secure"] is True
    fresh = _cookie_from_response(r)
    assert anon.get("/me", headers=cookie_headers(fresh)).status_code == 200
    assert anon.get("/me", headers=cookie_headers(other_device)).status_code == 401
    assert client.get("/me").status_code == 401  # the shared client's own session ended too
    assert anon.post("/auth/login", json={"username": "Editor", "password": NEW_PASSWORD}).status_code == 200
    again = anon.post("/auth/reset", json={"token": token, "password": "another-long-one-here"})
    assert again.status_code == 400 and again.json()["detail"] == INVALID_LINK


def test_the_link_goes_to_the_stored_address_as_the_owner_typed_it(client, anon):
    _set_and_verify(client, anon, "Editor@Example.TEST")
    before = len(mail_sent(client))
    assert _recover(anon, ADDR).status_code == 200
    [msg] = mail_sent(client)[before:]
    assert msg.to == "Editor@Example.TEST"


def test_the_link_follows_the_callers_origin_in_dev_origin_mode(client, anon):
    _set_and_verify(client, anon, ADDR)
    _recover(anon, ADDR, headers={"Origin": "http://192.168.178.78:8000"})
    assert URL_RE.findall(mail_sent(client)[-1].text)[0].startswith("http://192.168.178.78:8000/g/altherren/reset#")


def test_recovery_keeps_every_passkey(client, anon):
    """A lost phone still needs Face ID to use its passkey; the Settings list is where it is
    removed deliberately. Recovery ends the sessions and leaves the credentials alone."""
    headers = {**cookie_headers(login(anon, "Editor", "editor-secret")), "Origin": "http://localhost"}
    auth = SoftAuthenticator()
    options = anon.post("/auth/passkeys/register/options", headers=headers).json()
    r = anon.post("/auth/passkeys/register/verify", json={"credential": auth.create(options, "http://localhost"), "label": "Phone"}, headers=headers)
    assert r.status_code == 200, r.text
    _set_and_verify(client, anon, ADDR)

    assert _recover(anon, ADDR).status_code == 200
    r = anon.post("/auth/reset", json={"token": _token_of(mail_sent(client)[-1]), "password": NEW_PASSWORD})
    assert r.status_code == 200 and r.json()["has_passkey"] is True
    assert anon.get("/me", headers=headers).status_code == 401  # the session that added the passkey is gone …
    with Session(get_engine()) as s:
        assert len(s.exec(select(Passkey).where(Passkey.player_id == _pid("Editor"))).all()) == 1  # … the passkey is not
    login_options = anon.post("/auth/passkeys/login/options", headers={"Cookie": "", "Origin": "http://localhost"}).json()
    r = anon.post(
        "/auth/passkeys/login/verify",
        json={"credential": auth.get(login_options, "http://localhost")},
        headers={"Cookie": "", "Origin": "http://localhost"},
    )
    assert r.status_code == 200 and r.json()["player_name"] == "Editor"


# ---- no enumeration ------------------------------------------------------------------------


def test_the_answer_is_identical_for_a_verified_an_unknown_and_a_pending_address(client, anon, admin_headers):
    _set_and_verify(client, anon, ADDR)
    assert client.put("/auth/email", json={"email": "pending@example.test"}, headers=admin_headers).status_code == 200
    before = len(mail_sent(client))

    known = _recover(anon, ADDR)
    unknown = _recover(anon, "nobody@example.test")
    pending = _recover(anon, "pending@example.test")
    for r in (known, unknown, pending):
        assert r.status_code == 200 and r.content == known.content == b'{"ok":true}'
        assert r.headers["content-type"] == known.headers["content-type"]
        assert not r.headers.get_list("set-cookie")

    sent = mail_sent(client)[before:]
    assert [m.to for m in sent] == [ADDR]  # one link, to the verified address; nothing for the other two
    assert [row.player_id for row in _reset_tokens()] == [_pid("Editor")]


def test_an_unknown_address_mints_no_token_and_sends_nothing(client, anon, caplog):
    caplog.set_level(logging.INFO)
    r = _recover(anon, "nobody@example.test")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert mail_sent(client) == [] and _reset_tokens() == []
    assert "Recovery requested for an unknown address n***@example.test" in caplog.text


def test_a_pending_address_buys_nothing(client, anon):
    assert client.put("/auth/email", json={"email": ADDR}).status_code == 200  # pending, never verified
    before = len(mail_sent(client))
    assert _recover(anon, ADDR).status_code == 200
    assert len(mail_sent(client)) == before and _reset_tokens() == []


@pytest.mark.parametrize("raw", ["", "   ", "no-at-sign", "a@b@example.test", "x@nodot", "a b@example.test"])
def test_something_that_is_not_an_address_is_400_and_names_only_the_string(client, anon, raw):
    r = _recover(anon, raw)
    assert r.status_code == 400 and r.json()["detail"] == "That does not look like an email address"
    assert mail_sent(client) == [] and _reset_tokens() == []


def test_recover_is_public_and_needs_no_session(anon):
    assert classify("/auth/recover") == CLASS_PUBLIC and "/auth/recover" in PUBLIC_PATHS
    r = anon.post("/auth/recover", json={"email": "x@example.test"}, headers={"Cookie": ""})
    assert r.status_code == 200 and r.json() == {"ok": True}


# ---- the limits, on the wire -----------------------------------------------------------------


def test_the_fourth_request_for_one_address_is_429_while_another_address_still_answers(client, anon):
    _set_and_verify(client, anon, ADDR)
    for _ in range(3):
        assert _recover(anon, ADDR).status_code == 200
    r = _recover(anon, ADDR.upper())  # the same address, by key
    assert r.status_code == 429 and int(r.headers["Retry-After"]) >= 1 and r.json()["detail"]["retry_after"] >= 1
    assert len(_reset_tokens()) == 1  # a 429 mints nothing
    assert _recover(anon, "other@example.test").status_code == 200  # its own bucket
    assert len(mail_sent(client)) == 1 + 3  # the verification mail plus three links — never a fourth


def test_unknown_addresses_are_counted_too(anon):
    for _ in range(3):
        assert _recover(anon, "nobody@example.test").status_code == 200
    assert _recover(anon, "nobody@example.test").status_code == 429


def test_the_ip_and_global_caps(client, anon, monkeypatch):
    monkeypatch.setitem(LIMITS, "recover", ((3, 3600), (2, 3600), (30, 3600)))
    assert _recover(anon, "a@example.test").status_code == 200
    assert _recover(anon, "b@example.test").status_code == 200
    assert _recover(anon, "c@example.test").status_code == 429
    monkeypatch.setitem(LIMITS, "recover", ((3, 3600), (50, 3600), (2, 3600)))
    assert _recover(anon, "d@example.test").status_code == 429  # the two above already count globally (the 429 did not)
    assert _reset_tokens() == []


def test_a_bad_address_counts_against_its_own_key(anon):
    for _ in range(3):
        assert _recover(anon, "not-an-address").status_code == 400
    assert _recover(anon, "not-an-address").status_code == 429


# ---- mail off, a failed send, the previous link ---------------------------------------------


def test_with_mail_off_nothing_is_minted_and_the_answer_is_the_same(client, anon, caplog):
    caplog.set_level(logging.INFO)
    _set_and_verify(client, anon, ADDR)
    mail_off(client)
    r = _recover(anon, ADDR)
    assert r.status_code == 200 and r.content == b'{"ok":true}'
    assert _reset_tokens() == []
    assert "Recovery requested for e***@example.test but mail is off" in caplog.text


def test_a_fresh_request_voids_the_previous_link(client, anon, admin_headers):
    """Disagreement 4's cost, kept on purpose: the newest link is the only one that works,
    so an emailed link kills an admin link minted seconds earlier (and vice versa)."""
    _set_and_verify(client, anon, ADDR)
    pid = _pid("Editor")
    with Session(get_engine()) as s:  # an admin link, the router's shape
        _row, admin_token = create_reset(s, player_id=pid, created_by=_pid("Admin"))
        s.commit()
    assert _recover(anon, ADDR).status_code == 200
    emailed = _token_of(mail_sent(client)[-1])
    assert [row.created_by for row in _reset_tokens(pid)] == [None]
    assert anon.post("/auth/reset", json={"token": admin_token, "password": NEW_PASSWORD}).status_code == 400
    assert anon.post("/auth/reset", json={"token": emailed, "password": NEW_PASSWORD}).status_code == 200


def test_a_send_that_fails_after_the_answer_is_logged_and_the_answer_was_200(client, anon, caplog, monkeypatch):
    caplog.set_level(logging.INFO)
    _set_and_verify(client, anon, ADDR)

    def refuse(message):
        raise MailSendError("SMTPRecipientsRefused: {'x': (550, b'no such mailbox')}")

    monkeypatch.setattr(client.app.state.mail, "send", refuse)
    r = _recover(anon, ADDR)
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert "Mail to e***@example.test (recover) not sent after the answer: MailSendError" in caplog.text
    assert len(_reset_tokens()) == 1  # the link exists, nobody has it, it expires in an hour or dies with the next request


class _OrderProbe:
    """An ASGI shim that records when the response has fully gone out, so a test can prove a
    send happened after it."""

    def __init__(self, app) -> None:
        self.app = app
        self.events: list[str] = []

    async def __call__(self, scope, receive, send):
        async def send_probe(message):
            if message["type"] == "http.response.body" and not message.get("more_body"):
                self.events.append("response sent")
            await send(message)

        await self.app(scope, receive, send_probe)


def test_the_link_is_sent_after_the_answer_and_after_the_commit(client, anon, monkeypatch):
    _set_and_verify(client, anon, ADDR)
    probe = _OrderProbe(client.app)
    seen: dict = {}

    def send(message):
        with Session(get_engine()) as s:  # a *fresh* session: the row is visible only if it was committed
            seen["committed"] = len(s.exec(select(PasswordResetToken).where(PasswordResetToken.player_id == _pid("Editor"))).all())
        probe.events.append("mail sent")

    monkeypatch.setattr(client.app.state.mail, "send", send)
    r = TestClient(probe).post("/auth/recover", json={"email": ADDR}, headers={"Cookie": ""})
    assert r.status_code == 200
    assert probe.events == ["response sent", "mail sent"]
    assert seen == {"committed": 1}


def test_before_the_answer_a_known_and_an_unknown_address_only_read(client, anon):
    """No timing oracle: everything that differs between the two — the mint, its commit
    (SQLite's fsync, tens of milliseconds on the Pi), the send — happens after the response
    has gone out. Recorded from the engine: the SQL verbs before and after the answer."""
    from sqlalchemy import event

    _set_and_verify(client, anon, ADDR)
    probe = _OrderProbe(client.app)
    engine = get_engine()
    verbs: dict[str, list[str]] = {"before": [], "after": []}

    def on_execute(conn, cursor, statement, parameters, context, executemany):
        verbs["after" if probe.events else "before"].append(statement.split(None, 1)[0].upper())

    def on_commit(conn):
        verbs["after" if probe.events else "before"].append("COMMIT")

    event.listen(engine, "before_cursor_execute", on_execute)
    event.listen(engine, "commit", on_commit)
    try:
        known = {}
        unknown = {}
        for email, out in ((ADDR, known), ("nobody@example.test", unknown)):
            verbs["before"].clear()
            verbs["after"].clear()
            probe.events.clear()
            assert TestClient(probe).post("/auth/recover", json={"email": email}, headers={"Cookie": ""}).status_code == 200
            out["before"], out["after"] = list(verbs["before"]), list(verbs["after"])
    finally:
        event.remove(engine, "before_cursor_execute", on_execute)
        event.remove(engine, "commit", on_commit)

    assert set(known["before"]) <= {"SELECT"} and set(unknown["before"]) <= {"SELECT"}, (known, unknown)
    assert "INSERT" in known["after"] and "COMMIT" in known["after"]
    assert unknown["after"] == []
    # The one read that differs: the account behind a key that exists is looked up once more.
    assert len(known["before"]) - len(unknown["before"]) <= 1, (known["before"], unknown["before"])


# ---- what reaches a log ----------------------------------------------------------------------


def test_no_token_url_body_or_address_ever_reaches_a_log(client, anon, caplog):
    caplog.set_level(logging.DEBUG)
    _set_and_verify(client, anon, ADDR)
    assert _recover(anon, ADDR).status_code == 200
    assert _recover(anon, "nobody@example.test").status_code == 200
    [_verify, link] = list(mail_sent(client))
    assert link.kind == "recover"
    mail_off(client)
    assert _recover(anon, ADDR).status_code == 200

    text = caplog.text
    token = _token_of(link)
    assert token not in text and URL_RE.findall(link.text)[0] not in text
    for line in link.text.splitlines():
        if len(line) > 12:
            assert line not in text, line
    assert "e***@example.test" in text and "n***@example.test" in text
    assert ADDR not in text and "nobody@example.test" not in text
    with Session(get_engine()) as s:  # and the row holds only the hash
        assert token not in s.exec(select(PasswordResetToken)).one().token_hash


def test_the_verified_row_and_the_sessions_after_a_recovery(client, anon):
    """What recovery changes and what it does not: the address stays verified, the other
    sessions are gone, this one is `kind="reset"`."""
    _set_and_verify(client, anon, ADDR)
    pid = _pid("Editor")
    assert _recover(anon, ADDR).status_code == 200
    r = anon.post("/auth/reset", json={"token": _token_of(mail_sent(client)[-1]), "password": NEW_PASSWORD})
    assert r.status_code == 200 and r.json()["email"] == ADDR and r.json()["email_verified"] is True
    with Session(get_engine()) as s:
        assert s.get(AccountEmail, pid).email == ADDR
        assert [row.kind for row in s.exec(select(AuthSession).where(AuthSession.player_id == pid)).all()] == ["reset"]
