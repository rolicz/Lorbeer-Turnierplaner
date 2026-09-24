"""An account's email (E1): set, verify, resend, remove; the refusals; `MeOut`'s five new
fields; what reaches a log; and the two CLI commands (`verify-email`, `mail-test`)."""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
import subprocess
import sys
from email import policy
from email.parser import BytesParser
from pathlib import Path

import pytest
from sqlmodel import Session, select

from app.auth_gate import CLASS_ACCOUNT, CLASS_PUBLIC, classify
from app.db import get_engine
from app.models import Account, AccountEmail, EmailVerification, Passkey, Player
from app.services import account_email
from app.services.account_email import hash_verification_token
from app.services.mail import FileSinkTransport, MailSendError
from app.services.mail_texts import verify_email_message
from tests.conftest import cookie_headers, login, mail_off, mail_sent

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
URL_RE = re.compile(r"https?://\S+")

ADDR = "editor@example.test"


def _pid(name: str) -> int:
    with Session(get_engine()) as s:
        return int(s.exec(select(Player).where(Player.display_name == name)).one().id)


def _token(message) -> str:
    urls = URL_RE.findall(message.text)
    assert len(urls) == 1, urls
    return urls[0].split("#", 1)[1]


def _verification_rows(pid: int | None = None) -> list[EmailVerification]:
    with Session(get_engine()) as s:
        stmt = select(EmailVerification)
        if pid is not None:
            stmt = stmt.where(EmailVerification.player_id == pid)
        return list(s.exec(stmt).all())


def _account_email(pid: int) -> AccountEmail | None:
    with Session(get_engine()) as s:
        return s.get(AccountEmail, pid)


def _set(client, email: str, headers: dict | None = None, **kw):
    return client.put("/auth/email", json={"email": email}, headers=headers or {}, **kw)


def _set_and_verify(client, anon, email: str, headers: dict | None = None) -> None:
    r = _set(client, email, headers)
    assert r.status_code == 200, r.text
    v = anon.post("/auth/email/verify", json={"token": _token(mail_sent(client)[-1])})
    assert v.status_code == 200, v.text


# ---- set and verify ------------------------------------------------------------------------


def test_set_sends_one_link_and_me_shows_it_pending(client):
    r = _set(client, f"  {ADDR} ")
    assert r.status_code == 200, r.text
    assert r.json() == {"email": None, "email_pending": ADDR, "email_verified": False}

    [msg] = mail_sent(client)
    assert msg.to == ADDR and msg.kind == "verify" and msg.subject == "Confirm your email for Lorbeerkranz"
    urls = URL_RE.findall(msg.text)
    assert len(urls) == 1 and urls[0].startswith("http://testserver/g/altherren/verify-email#")
    assert f"\n{urls[0]}\n" in msg.text  # the link stands on a line of its own
    assert "24 hours" in msg.text

    [row] = _verification_rows(_pid("Editor"))
    token = _token(msg)
    assert row.token_hash == hash_verification_token(token) and token not in row.token_hash
    assert row.used_at is None and row.expires_at - row.created_at == dt.timedelta(hours=24)

    me = client.get("/me").json()
    assert me["email"] is None and me["email_pending"] == ADDR and me["email_verified"] is False
    assert me["email_available"] is True


def test_the_link_follows_the_callers_origin_in_dev_origin_mode(client):
    _set(client, ADDR, headers={"Origin": "http://192.168.178.78:8000"})
    assert URL_RE.findall(mail_sent(client)[-1].text)[0].startswith("http://192.168.178.78:8000/g/altherren/verify-email#")


def test_verify_makes_it_verified_and_works_once(client, anon):
    _set(client, ADDR)
    token = _token(mail_sent(client)[-1])
    r = anon.post("/auth/email/verify", json={"token": token})
    assert r.status_code == 200 and r.json() == {"ok": True, "email": ADDR}

    row = _account_email(_pid("Editor"))
    assert row is not None and row.email == ADDR and row.email_key == ADDR
    [tok] = _verification_rows(_pid("Editor"))
    assert tok.used_at is not None

    me = client.get("/me").json()
    assert me["email"] == ADDR and me["email_verified"] is True and me["email_pending"] is None

    again = anon.post("/auth/email/verify", json={"token": token})
    assert again.status_code == 400 and again.json()["detail"] == "That link is not valid"


def test_verify_is_public_and_a_get_confirms_nothing(client, anon):
    assert classify("/auth/email/verify") == CLASS_PUBLIC
    assert classify("/auth/email") == CLASS_ACCOUNT and classify("/auth/email/resend") == CLASS_ACCOUNT
    assert anon.put("/auth/email", json={"email": ADDR}).status_code == 401

    _set(client, ADDR)
    token = _token(mail_sent(client)[-1])
    # A mail scanner follows the link: a GET must confirm nothing (the page asks for a tap).
    assert anon.get(f"/auth/email/verify?token={token}").status_code == 405
    assert _account_email(_pid("Editor")) is None and _verification_rows(_pid("Editor"))[0].used_at is None
    # No session at all, and it still works — the token proves the mailbox.
    assert anon.post("/auth/email/verify", json={"token": token}, headers={"Cookie": ""}).status_code == 200


def test_a_token_verifies_for_its_own_account_whoever_is_logged_in(client, anon, admin_headers):
    _set(client, ADDR)  # Editor's token …
    token = _token(mail_sent(client)[-1])
    r = client.post("/auth/email/verify", json={"token": token}, headers=admin_headers)  # … opened by Admin
    assert r.status_code == 200
    assert _account_email(_pid("Editor")).email == ADDR and _account_email(_pid("Admin")) is None


@pytest.mark.parametrize("token", ["", "   ", "not-a-token", "x" * 43])
def test_an_unknown_token_is_the_generic_400(anon, token):
    r = anon.post("/auth/email/verify", json={"token": token})
    assert r.status_code == 400 and r.json()["detail"] == "That link is not valid"


def test_an_expired_token_is_the_generic_400(client, anon, monkeypatch):
    _set(client, ADDR)
    token = _token(mail_sent(client)[-1])
    later = dt.datetime.utcnow() + dt.timedelta(hours=24, minutes=1)
    monkeypatch.setattr(account_email, "_now", lambda: later)
    r = anon.post("/auth/email/verify", json={"token": token})
    assert r.status_code == 400 and r.json()["detail"] == "That link is not valid"
    assert _account_email(_pid("Editor")) is None


@pytest.mark.parametrize(
    "raw",
    ["", "   ", "no-at-sign", "two@@example.test", "a@b@example.test", "@example.test", "x@nodot", "x@.example", "x@example.", "a b@example.test", "x@" + "e" * 250 + ".test"],
)
def test_something_that_is_not_an_address_is_400(client, raw):
    r = _set(client, raw)
    assert r.status_code == 400 and r.json()["detail"] == "That does not look like an email address"
    assert mail_sent(client) == [] and _verification_rows() == []


# ---- uniqueness ----------------------------------------------------------------------------


def test_an_address_verified_elsewhere_is_409_case_insensitively(client, anon, admin_headers):
    _set_and_verify(client, anon, ADDR)
    r = _set(client, "  EDITOR@Example.TEST", headers=admin_headers)
    assert r.status_code == 409 and r.json()["detail"] == "That email address is used by another account"
    assert _verification_rows(_pid("Admin")) == []


def test_an_address_pending_elsewhere_is_409(client, admin_headers):
    assert _set(client, ADDR).status_code == 200
    r = _set(client, ADDR.upper(), headers=admin_headers)
    assert r.status_code == 409 and r.json()["detail"] == "That email address is used by another account"


def test_a_race_past_the_entry_check_is_lost_by_the_second_tap(client, anon):
    """Both accounts end up with the address pending (the second token written straight into
    the table, as a race past `ensure_email_free` would): the first tap wins, the second is
    the generic 400, and there is one `AccountEmail`."""
    _set(client, ADDR)
    first = _token(mail_sent(client)[-1])
    now = dt.datetime.utcnow()
    with Session(get_engine()) as s:
        s.add(
            EmailVerification(
                player_id=_pid("Admin"),
                email=ADDR.upper(),
                email_key=ADDR,
                token_hash=hash_verification_token("the-racing-token"),
                created_at=now,
                expires_at=now + dt.timedelta(hours=24),
            )
        )
        s.commit()
    assert anon.post("/auth/email/verify", json={"token": first}).status_code == 200
    r = anon.post("/auth/email/verify", json={"token": "the-racing-token"})
    assert r.status_code == 400 and r.json()["detail"] == "That link is not valid"
    with Session(get_engine()) as s:
        rows = s.exec(select(AccountEmail)).all()
    assert [(r.player_id, r.email) for r in rows] == [(_pid("Editor"), ADDR)]


# ---- change, remove, resend ------------------------------------------------------------------


def test_a_change_keeps_the_verified_address_until_the_new_one_verifies(client, anon):
    _set_and_verify(client, anon, ADDR)
    assert _set(client, "new@example.test").json() == {"email": ADDR, "email_pending": "new@example.test", "email_verified": True}
    assert _account_email(_pid("Editor")).email == ADDR  # a typo never displaces what works

    before = len(mail_sent(client))
    assert anon.post("/auth/email/verify", json={"token": _token(mail_sent(client)[-1])}).json()["email"] == "new@example.test"
    [notice] = mail_sent(client)[before:]
    assert notice.to == ADDR and notice.kind == "changed" and notice.subject == "Your Lorbeerkranz email address changed"
    assert "http" not in notice.text and "tell the admin" in notice.text
    assert client.get("/me").json()["email"] == "new@example.test"


def test_a_change_of_case_only_is_not_a_change_and_tells_nobody(client, anon):
    _set_and_verify(client, anon, ADDR)
    before = len(mail_sent(client))
    r = _set(client, ADDR.upper())
    assert r.status_code == 200 and r.json() == {"email": ADDR, "email_pending": None, "email_verified": True}
    assert len(mail_sent(client)) == before  # the account's own verified address: nothing sent


def test_the_own_verified_address_gives_up_a_pending_change(client, anon):
    _set_and_verify(client, anon, ADDR)
    _set(client, "new@example.test")
    stale = _token(mail_sent(client)[-1])
    assert _set(client, ADDR).json()["email_pending"] is None
    assert anon.post("/auth/email/verify", json={"token": stale}).status_code == 400


def test_delete_forgets_the_address_and_tells_it_with_no_link(client, anon):
    _set_and_verify(client, anon, ADDR)
    _set(client, "new@example.test")  # a pending change goes too
    pending_token = _token(mail_sent(client)[-1])
    before = len(mail_sent(client))
    r = client.delete("/auth/email")
    assert r.status_code == 200 and r.json() == {"email": None, "email_pending": None, "email_verified": False}
    [notice] = mail_sent(client)[before:]
    assert notice.to == ADDR and notice.kind == "changed" and "http" not in notice.text
    assert _account_email(_pid("Editor")) is None
    assert anon.post("/auth/email/verify", json={"token": pending_token}).status_code == 400


def test_delete_with_only_a_pending_address_tells_nobody(client):
    _set(client, ADDR)
    before = len(mail_sent(client))
    assert client.delete("/auth/email").json()["email_pending"] is None
    assert len(mail_sent(client)) == before and [r for r in _verification_rows() if r.used_at is None] == []


def test_resend_mints_a_fresh_link_and_kills_the_old_one(client, anon):
    _set(client, ADDR)
    old = _token(mail_sent(client)[-1])
    r = client.post("/auth/email/resend")
    assert r.status_code == 200 and r.json()["email_pending"] == ADDR
    new = _token(mail_sent(client)[-1])
    assert new != old and len(_verification_rows(_pid("Editor"))) == 1
    assert anon.post("/auth/email/verify", json={"token": old}).status_code == 400
    assert anon.post("/auth/email/verify", json={"token": new}).status_code == 200


def test_resend_with_nothing_pending_is_409(client, anon):
    r = client.post("/auth/email/resend")
    assert r.status_code == 409 and r.json()["detail"] == "Nothing to send"
    _set_and_verify(client, anon, ADDR)
    assert client.post("/auth/email/resend").status_code == 409


# ---- the limits, mail off, a failed send ------------------------------------------------------


def test_the_sixth_send_in_an_hour_is_a_429(client):
    for i in range(5):
        assert _set(client, f"try{i}@example.test").status_code == 200
    r = client.post("/auth/email/resend")
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    assert len(mail_sent(client)) == 5


def test_the_verify_endpoint_is_limited_as_reset(anon):
    for _ in range(10):
        assert anon.post("/auth/email/verify", json={"token": "nope"}).status_code == 400
    assert anon.post("/auth/email/verify", json={"token": "nope"}).status_code == 429


def test_with_mail_off_set_and_resend_are_409_and_me_says_so(client):
    mail_off(client)
    for r in (_set(client, ADDR), client.post("/auth/email/resend")):
        assert r.status_code == 409 and r.json()["detail"] == "Email is not set up on this server"
    assert _verification_rows() == []
    assert client.get("/me").json()["email_available"] is False


def test_a_failed_send_is_502_and_leaves_no_token(client, anon, monkeypatch):
    _set_and_verify(client, anon, ADDR)

    def refuse(message):
        raise MailSendError("SMTPRecipientsRefused: {'x': (550, b'no such mailbox')}")

    monkeypatch.setattr(client.app.state.mail, "send", refuse)
    r = _set(client, "new@example.test")
    assert r.status_code == 502 and r.json()["detail"] == "Could not send the email — try again in a moment"
    assert [row for row in _verification_rows() if row.used_at is None] == []
    assert client.get("/me").json()["email"] == ADDR  # the address that works is untouched


def test_a_notice_that_cannot_be_sent_does_not_fail_the_request(client, anon, monkeypatch):
    _set_and_verify(client, anon, ADDR)

    def refuse(message):
        raise MailSendError("SMTPServerDisconnected: gone")

    monkeypatch.setattr(client.app.state.mail, "send", refuse)
    assert client.delete("/auth/email").status_code == 200
    assert _account_email(_pid("Editor")) is None


# ---- what reaches a log ----------------------------------------------------------------------


def test_no_token_and_no_body_ever_reaches_a_log(client, anon, caplog):
    caplog.set_level(logging.DEBUG)
    _set_and_verify(client, anon, ADDR)
    _set(client, "new@example.test")
    anon.post("/auth/email/verify", json={"token": _token(mail_sent(client)[-1])})
    client.post("/auth/email/verify", json={"token": "wrong"})
    client.delete("/auth/email")

    messages = mail_sent(client)
    assert [m.kind for m in messages] == ["verify", "verify", "changed", "changed"]
    text = caplog.text
    for msg in messages:
        for url in URL_RE.findall(msg.text):
            assert url.split("#", 1)[1] not in text
            assert url not in text
        for line in msg.text.splitlines():
            if len(line) > 12:  # every sentence of every body; skip "Hi Editor," and the signature
                assert line not in text, line
    assert "e***@example.test" in text and "n***@example.test" in text
    assert ADDR not in text and "new@example.test" not in text


def test_the_file_sink_logs_the_path_and_not_the_body(tmp_path, caplog):
    caplog.set_level(logging.DEBUG)
    msg = verify_email_message(to=ADDR, name="Roli", url="http://x.test/g/altherren/verify-email#SECRET-TOKEN")
    FileSinkTransport(str(tmp_path)).send(msg)
    assert "SECRET-TOKEN" not in caplog.text and "e***@example.test (verify) written to" in caplog.text


# ---- MeOut -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("origin", "passkey", "secure"),
    [("none", False, False), ("none", True, True), ("migrated", False, False), ("migrated", True, True), ("set", False, True), ("set", True, True)],
)
def test_login_secure_is_a_passkey_or_a_set_password(client, anon, admin_headers, origin, passkey, secure):
    pid = _pid("Editor2")
    with Session(get_engine()) as s:
        account = s.get(Account, pid)
        account.password_origin = origin
        s.add(account)
        if passkey:
            s.add(Passkey(player_id=pid, credential_id=f"cred-{origin}", public_key="pk"))
        s.commit()
    token = login(anon, "Editor2", "editor2-secret")
    assert anon.get("/me", headers=cookie_headers(token)).json()["login_secure"] is secure
    rows = {r["display_name"]: r for r in client.get("/admin/accounts", headers=admin_headers).json()}
    assert rows["Editor2"]["login_secure"] is secure


def test_me_carries_the_five_fields_and_login_answers_the_same(client, anon):
    me = client.get("/me").json()
    assert {k: me[k] for k in ("email", "email_pending", "email_verified", "email_available", "login_secure")} == {
        "email": None,
        "email_pending": None,
        "email_verified": False,
        "email_available": True,
        "login_secure": False,  # a migrated password, no passkey
    }
    _set_and_verify(client, anon, ADDR)
    r = anon.post("/auth/login", json={"username": "Editor", "password": "editor-secret"})
    assert r.json()["email"] == ADDR and r.json()["email_verified"] is True


# ---- the CLI -------------------------------------------------------------------------------------


def _manage(client, tmp_path: Path, *argv: str, stdin: str | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
    db_url = client.app.state.settings.db_url
    secrets = tmp_path / "email-secrets.json"
    secrets.write_text(
        json.dumps({"db_url": db_url, "player_accounts": [], "password_hash_profile": "test", "app_env": "test", "auth_origin": "https://lorbeerkranz.xyz"}),
        encoding="utf-8",
    )
    return subprocess.run(
        [sys.executable, "manage.py", *argv, "--secrets", str(secrets), "--db-url", db_url],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        input=stdin,
        env={"PATH": "/usr/bin:/bin", "UPLOADS_DIR": str(tmp_path / "uploads"), **(env or {})},
        timeout=120,
    )


def test_manage_verify_email_marks_an_address_by_hand(client, anon, tmp_path):
    r = _manage(client, tmp_path, "verify-email", "--player", "editor", "--email", f" {ADDR} ")
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == f"Email {ADDR} verified by hand for Editor (id={_pid('Editor')})"
    me = client.get("/me").json()
    assert me["email"] == ADDR and me["email_verified"] is True
    assert mail_sent(client) == []  # the hatch sends nothing

    taken = _manage(client, tmp_path, "verify-email", "--player", "Admin", "--email", ADDR.upper())
    assert taken.returncode == 1 and "used by another account" in taken.stderr
    bad = _manage(client, tmp_path, "verify-email", "--player", "Admin", "--email", "nope")
    assert bad.returncode == 1 and "does not look like an email address" in bad.stderr
    nobody = _manage(client, tmp_path, "verify-email", "--player", "Nobody", "--email", "x@example.test")
    assert nobody.returncode == 1 and "no account answers to" in nobody.stderr
    assert _account_email(_pid("Admin")) is None


def test_manage_mail_test_writes_to_the_sink_and_says_what_to_read(client, tmp_path):
    sink = tmp_path / "mail"
    r = _manage(client, tmp_path, "mail-test", "--to", "roli@example.test", env={"MAIL_SINK_DIR": str(sink)})
    assert r.returncode == 0, r.stderr
    assert f"Mail: file sink at {sink} (never delivers)" in r.stdout
    assert "Sent to roli@example.test via file sink" in r.stdout and "Show original" in r.stdout
    [eml] = list(sink.glob("*.eml"))
    msg = BytesParser(policy=policy.default).parse(eml.open("rb"))
    assert msg["To"] == "roli@example.test" and msg["Subject"] == "Lorbeerkranz mail test"
    body = msg.get_body(preferencelist=("plain",)).get_content()
    assert "spf=pass" in body and "dkim=pass" in body and "dmarc=pass" in body and "file sink" in body


def test_manage_mail_test_refuses_with_mail_off(client, tmp_path):
    r = _manage(client, tmp_path, "mail-test", "--to", "roli@example.test")
    assert r.returncode == 1 and "Mail: off" in r.stdout and "nothing sent" in r.stderr


def test_manage_mail_test_on_a_dev_server_is_refused_by_the_guard(client, tmp_path):
    """Credentials on the command line of a non-production server: the boot guard refuses
    before anything connects — and the password is never echoed."""
    r = _manage(
        client,
        tmp_path,
        "mail-test", "--to", "roli@example.test", "--host", "smtp.invalid", "--user", "box@example.test", "--from", "no-reply@example.test",
        stdin="not-a-real-password\n",
    )
    assert r.returncode == 1 and "must never send real email" in r.stderr
    assert "not-a-real-password" not in r.stdout + r.stderr


def test_manage_mail_test_with_host_and_no_user_is_half_configured(client, tmp_path):
    r = _manage(client, tmp_path, "mail-test", "--to", "x@example.test", "--host", "smtp.invalid", stdin="pw\n")
    assert r.returncode == 1 and "smtp_user" in r.stderr


# ---- scripts/mail_sink_link.py -----------------------------------------------------------------


def _sink_link(*argv: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(REPO_ROOT / "scripts" / "mail_sink_link.py"), *argv], capture_output=True, text=True, timeout=60)


def test_mail_sink_link_prints_the_newest_link(tmp_path):
    sink = FileSinkTransport(str(tmp_path))
    sink.send(verify_email_message(to="a@example.test", name="A", url="http://x.test/g/altherren/verify-email#first"))
    sink.send(verify_email_message(to="b@example.test", name="B", url="http://x.test/g/altherren/verify-email#second"))
    assert _sink_link(str(tmp_path)).stdout.strip() == "http://x.test/g/altherren/verify-email#second"
    assert _sink_link(str(tmp_path), "--to", "A@example.test").stdout.strip().endswith("#first")
    lines = _sink_link(str(tmp_path), "--all").stdout.strip().splitlines()
    assert lines == [
        "a@example.test\tConfirm your email for Lorbeerkranz\thttp://x.test/g/altherren/verify-email#first",
        "b@example.test\tConfirm your email for Lorbeerkranz\thttp://x.test/g/altherren/verify-email#second",
    ]
    empty = tmp_path / "empty"
    empty.mkdir()
    assert _sink_link(str(empty)).returncode == 1
    assert _sink_link(str(tmp_path), "--to", "nobody@example.test").returncode == 1
