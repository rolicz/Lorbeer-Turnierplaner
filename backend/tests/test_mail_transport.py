"""The mail transport (E0): which one a server gets, what a message looks like, and that no
body, token or password ever reaches a log."""

import asyncio
import dataclasses
import email
import email.policy
import logging
import smtplib
import ssl

import pytest

from app.services import mail as mail_module
from app.services.mail import (
    FROM_NAME,
    SMTP_TIMEOUT_S,
    CaptureTransport,
    FileSinkTransport,
    MailMessage,
    MailNotConfigured,
    MailSendError,
    OffTransport,
    SmtpTransport,
    build_message,
    mail_transport_for,
    mask_address,
    send_off_loop,
)
from app.settings import Settings

TOKEN = "tok-3f9a1c7e5b2d4a6f8e0c1b3d5f7a9c2e"
BODY = f"Open this link to verify your address:\nhttps://lorbeerkranz.xyz/g/altherren/verify-email#{TOKEN}\n"
MESSAGE = MailMessage(to="roli@example.test", subject="Verify your email", text=BODY, kind="verify")
SMTP_PASS = "hunter2-app-password"

SMTP_KEYS = dict(
    smtp_host="smtp.example.test",
    smtp_user="login@example.test",
    smtp_pass=SMTP_PASS,
    smtp_from="no-reply@example.test",
)


def _settings(**overrides) -> Settings:
    return dataclasses.replace(Settings(db_url="sqlite:///:memory:", player_accounts=(), log_level="INFO"), **overrides)


def _assert_nothing_secret_logged(caplog):
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert TOKEN not in text
    assert "verify your address" not in text and "Verify your email" not in text
    assert SMTP_PASS not in text
    assert "login@example.test" not in text


# ---- which transport ---------------------------------------------------------------------


def test_the_default_server_has_mail_off():
    t = mail_transport_for(_settings())
    assert isinstance(t, OffTransport) and t.kind == "off" and t.configured is False
    assert t.description.startswith("off — recovery by email is disabled")


def test_a_sink_dir_selects_the_file_sink(tmp_path):
    t = mail_transport_for(_settings(mail_sink_dir=str(tmp_path / "mail")))
    assert isinstance(t, FileSinkTransport) and t.kind == "file" and t.configured is True
    assert t.description == f"file sink at {tmp_path / 'mail'} (never delivers)"


def test_all_five_keys_select_smtp_and_its_description_names_no_secret():
    t = mail_transport_for(_settings(**SMTP_KEYS, smtp_port=465, app_env="production", trusted_proxy_hops=1))
    assert isinstance(t, SmtpTransport) and t.kind == "smtp" and t.configured is True
    assert t.description == "SMTP via smtp.example.test:465 as no-reply@example.test"
    assert SMTP_PASS not in repr(t) and "login@example.test" not in repr(t)


def test_a_sink_beats_smtp_keys(tmp_path):
    # The dev shape `MAIL_DEV_SMTP=1` + a sink: the sink wins, nothing is delivered.
    t = mail_transport_for(_settings(**SMTP_KEYS, mail_dev_smtp=True, mail_sink_dir=str(tmp_path)))
    assert isinstance(t, FileSinkTransport)


def test_the_capture_transport_is_selectable_by_nothing(tmp_path, monkeypatch):
    for env in ("MAIL_TRANSPORT", "MAIL_CAPTURE"):
        monkeypatch.setenv(env, "capture")
    for s in (_settings(), _settings(mail_sink_dir=str(tmp_path)), _settings(**SMTP_KEYS, mail_dev_smtp=True)):
        assert not isinstance(mail_transport_for(s), CaptureTransport)


# ---- the four transports -----------------------------------------------------------------


def test_the_file_sink_writes_a_real_message_and_logs_only_the_path(tmp_path, caplog):
    sink = FileSinkTransport(str(tmp_path / "new-dir"), from_addr="no-reply@lorbeerkranz.xyz")
    with caplog.at_level(logging.DEBUG, logger="app.services.mail"):
        sink.send(MESSAGE)
        sink.send(dataclasses.replace(MESSAGE, subject="Second"))
    files = sorted((tmp_path / "new-dir").glob("*.eml"))
    assert len(files) == 2 and all(f.name.split("-")[0][8] == "T" for f in files)
    msg = email.message_from_bytes(files[0].read_bytes(), policy=email.policy.default)
    assert msg["From"] == "Lorbeerkranz <no-reply@lorbeerkranz.xyz>"
    assert msg["To"] == "roli@example.test" and msg["Subject"] == "Verify your email"
    assert msg["Date"] and msg["Message-ID"].endswith("@lorbeerkranz.xyz>")
    assert msg["Auto-Submitted"] == "auto-generated"
    assert msg.get_content_type() == "text/plain" and msg.get_content_charset() == "utf-8"
    assert msg.get_content() == BODY
    assert {str(f) for f in files} == {r.getMessage().rsplit(" written to ", 1)[1] for r in caplog.records}
    assert all("r***@example.test" in r.getMessage() for r in caplog.records)
    _assert_nothing_secret_logged(caplog)


def test_the_capture_transport_keeps_messages_in_order():
    t = CaptureTransport()
    assert t.configured is True and t.kind == "capture"
    t.send(MESSAGE)
    t.send(dataclasses.replace(MESSAGE, to="flo@example.test"))
    assert [m.to for m in t.sent] == ["roli@example.test", "flo@example.test"]


def test_the_off_transport_refuses_to_send():
    with pytest.raises(MailNotConfigured):
        OffTransport().send(MESSAGE)


def test_send_off_loop_runs_the_send_off_the_event_loop():
    import threading

    seen = []

    class Recorder:
        kind, configured, description = "capture", True, "recorder"

        def send(self, message):
            seen.append((message, threading.current_thread() is threading.main_thread()))

    asyncio.run(send_off_loop(Recorder(), MESSAGE))
    assert seen == [(MESSAGE, False)]


def test_mask_address():
    assert mask_address("roli@gmail.com") == "r***@gmail.com"
    assert mask_address("  R@x.test ") == "R***@x.test"
    assert mask_address("@x.test") == "***@x.test"
    assert mask_address("no-at-sign") == "***"
    assert mask_address("") == "***"


def test_build_message_on_a_non_ascii_name_and_body():
    m = MailMessage(to="jürgen@example.test", subject="Grüß di, Jürgen", text="Servus — ä ö ü ß €\n")
    msg = build_message(m, from_addr="no-reply@lorbeerkranz.xyz", from_name="Lorbeerkränzchen")
    parsed = email.message_from_bytes(msg.as_bytes(), policy=email.policy.default)
    assert parsed["Subject"] == "Grüß di, Jürgen"
    assert parsed["From"].addresses[0].display_name == "Lorbeerkränzchen"
    assert parsed.get_content() == "Servus — ä ö ü ß €\n"
    assert build_message(m, from_addr="a@b.test")["From"] == f"{FROM_NAME} <a@b.test>"


# ---- SMTP against a fake smtplib ---------------------------------------------------------


class FakeSMTP:
    """Records every call. `starttls_offered`, `fail_on` steer it."""

    instances: list["FakeSMTP"] = []
    starttls_offered = True
    fail_on: str | None = None
    fail_with: Exception | None = None

    def __init__(self, host, port, timeout=None, context=None):
        self.host, self.port, self.timeout, self.context = host, port, timeout, context
        self.calls: list[tuple] = []
        FakeSMTP.instances.append(self)

    def _maybe_fail(self, name):
        if FakeSMTP.fail_on == name:
            raise FakeSMTP.fail_with

    def ehlo(self):
        self.calls.append(("ehlo",))

    def has_extn(self, name):
        self.calls.append(("has_extn", name.lower()))
        return FakeSMTP.starttls_offered

    def starttls(self, context=None):
        self.calls.append(("starttls", context))

    def login(self, user, password):
        self.calls.append(("login", user, password))
        self._maybe_fail("login")

    def send_message(self, msg, from_addr=None, to_addrs=None):
        self.calls.append(("send_message", msg, from_addr, tuple(to_addrs)))
        self._maybe_fail("send_message")

    def quit(self):
        self.calls.append(("quit",))

    def close(self):
        self.calls.append(("close",))


@pytest.fixture()
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    FakeSMTP.starttls_offered = True
    FakeSMTP.fail_on = None
    FakeSMTP.fail_with = None
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    return FakeSMTP


def _smtp(port: int) -> SmtpTransport:
    return SmtpTransport(host="smtp.example.test", port=port, user="login@example.test", password=SMTP_PASS, from_addr="no-reply@example.test")


def test_port_465_is_implicit_tls(fake_smtp, caplog):
    with caplog.at_level(logging.DEBUG, logger="app.services.mail"):
        _smtp(465).send(MESSAGE)
    [conn] = fake_smtp.instances
    assert (conn.host, conn.port, conn.timeout) == ("smtp.example.test", 465, SMTP_TIMEOUT_S)
    assert isinstance(conn.context, ssl.SSLContext) and conn.context.verify_mode == ssl.CERT_REQUIRED
    names = [c[0] for c in conn.calls]
    assert names == ["login", "send_message", "quit"]
    assert conn.calls[0] == ("login", "login@example.test", SMTP_PASS)
    _, msg, from_addr, to = conn.calls[1]
    assert from_addr == "no-reply@example.test" and to == ("roli@example.test",)
    assert msg["From"] == "Lorbeerkranz <no-reply@example.test>"
    assert [r.getMessage() for r in caplog.records] == ["Mail sent to r***@example.test (verify)"]
    _assert_nothing_secret_logged(caplog)


def test_port_587_upgrades_with_starttls(fake_smtp):
    _smtp(587).send(MESSAGE)
    [conn] = fake_smtp.instances
    assert conn.port == 587 and conn.context is None  # plain connect, then the upgrade
    names = [c[0] for c in conn.calls]
    assert names == ["ehlo", "has_extn", "starttls", "ehlo", "login", "send_message", "quit"]
    assert isinstance(conn.calls[2][1], ssl.SSLContext)


def test_a_server_without_starttls_is_refused_before_any_login(fake_smtp, caplog):
    fake_smtp.starttls_offered = False
    with caplog.at_level(logging.DEBUG, logger="app.services.mail"), pytest.raises(MailSendError, match="STARTTLS"):
        _smtp(587).send(MESSAGE)
    [conn] = fake_smtp.instances
    assert "login" not in [c[0] for c in conn.calls] and "send_message" not in [c[0] for c in conn.calls]
    _assert_nothing_secret_logged(caplog)


@pytest.mark.parametrize(
    "fail_on, exc, name",
    [
        ("login", smtplib.SMTPAuthenticationError(535, b"5.7.8 Authentication failed"), "SMTPAuthenticationError"),
        ("send_message", smtplib.SMTPRecipientsRefused({"roli@example.test": (550, b"no such user")}), "SMTPRecipientsRefused"),
        ("send_message", OSError("Network is unreachable"), "OSError"),
        ("login", ssl.SSLError("CERTIFICATE_VERIFY_FAILED"), "SSLError"),
    ],
)
def test_a_failure_is_a_mail_send_error_that_carries_no_body(fake_smtp, caplog, fail_on, exc, name):
    fake_smtp.fail_on, fake_smtp.fail_with = fail_on, exc
    with caplog.at_level(logging.DEBUG, logger="app.services.mail"), pytest.raises(MailSendError) as info:
        _smtp(465).send(MESSAGE)
    text = str(info.value)
    assert text.startswith(f"{name}: ")
    assert TOKEN not in text and "verify your address" not in text and SMTP_PASS not in text
    assert info.value.__cause__ is None and info.value.__suppress_context__
    assert fake_smtp.instances[0].calls[-1][0] in ("quit", "close")
    [record] = caplog.records
    assert record.getMessage().startswith("Mail to r***@example.test (verify) failed: ")
    _assert_nothing_secret_logged(caplog)


def test_the_connection_is_opened_on_send_not_on_construction(fake_smtp):
    t = mail_transport_for(_settings(**SMTP_KEYS, smtp_port=465, app_env="production", trusted_proxy_hops=1))
    assert fake_smtp.instances == []
    t.send(MESSAGE)
    assert len(fake_smtp.instances) == 1
    t.send(MESSAGE)
    assert len(fake_smtp.instances) == 2  # one connection per send, nothing pooled


def test_the_module_has_no_other_way_out():
    # Only `SmtpTransport` touches the network, and only through `smtplib`.
    import inspect

    src = inspect.getsource(mail_module)
    assert src.count("smtplib.SMTP_SSL(") == 1 and src.count("smtplib.SMTP(") == 1
    assert "import httpx" not in src and "socket." not in src
