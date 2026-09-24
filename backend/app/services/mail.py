"""Sending one email, or refusing to — the one place it is done (E0).

The app needs mail for two things only: proving an address (E1) and the recovery link
(E2). Everything is the standard library — `smtplib`, `ssl`, `email` — so there is no
dependency to add.

**Config-gated, and "off" is a first-class, visible state.** `mail_transport_for`
picks one of four transports, the boot log names it in one line (`Mail: …`), and the
route layer asks `transport.configured` — never `kind == "smtp"` — so the capture and the
file transports exercise the real branch.

- `SmtpTransport` — real delivery. The connection is opened **inside `send`**, one per
  message, so a server whose SMTP host is down still boots and nothing is shared across
  threads. Implicit TLS on 465, STARTTLS elsewhere, and never a plaintext login.
- `FileSinkTransport` — `MAIL_SINK_DIR`: every message becomes an `.eml` file and is
  delivered nowhere. What every dev and verification stack uses.
- `CaptureTransport` — keeps messages in memory. **Constructed only by the tests**; no
  setting, flag or environment variable can select it.
- `OffTransport` — the shipped default: `send` raises `MailNotConfigured`.

**No message body ever reaches a log.** The body carries a token that is the whole
secret. Log lines name the masked recipient (`mask_address`), the message's kind, and —
on failure — the exception class and its message; a `MailSendError`'s text is built from
the SMTP reply, never from the message. The SMTP password is never printed.

**`send` is blocking.** An async caller uses `send_off_loop`, which runs it in the
threadpool; and, as the push dispatcher learned (L16), no database transaction may be
open across it — commit the token row, close the session, then send.
"""

from __future__ import annotations

import datetime as dt
import logging
import smtplib
import ssl
import threading
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path
from typing import Protocol

from starlette.concurrency import run_in_threadpool

from ..settings import Settings

log = logging.getLogger(__name__)

SMTP_TIMEOUT_S = 20
FROM_NAME = "Lorbeerkranz"
#: The sender a file sink writes when no `smtp_from` is set. A sink delivers nowhere, so
#: the address only has to make a well-formed message.
SINK_FROM = "no-reply@lorbeerkranz.xyz"

OFF_DESCRIPTION = (
    "off — recovery by email is disabled (set smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from in secrets.json)"
)


class MailNotConfigured(Exception):
    """This server has no way to send mail (`OffTransport`)."""


class MailSendError(Exception):
    """A send failed. The text is the exception class and the server's reply — never the body."""


@dataclass(frozen=True)
class MailMessage:
    to: str
    subject: str
    text: str
    #: What the message is for (`verify`, `recover`, `changed`, `test` …) — a log tag only.
    kind: str = "mail"


class MailTransport(Protocol):
    kind: str  # "smtp" | "file" | "capture" | "off"
    #: Whether this transport can deliver. The route layer asks this, never the kind.
    configured: bool
    #: One line, safe to log and to show an admin: names the host and the sender, never
    #: the login mailbox or the password.
    description: str

    def send(self, message: MailMessage) -> None: ...


def mask_address(address: str) -> str:
    """`roli@gmail.com` → `r***@gmail.com`: enough to tell two recipients apart in a log,
    not enough to be the address."""
    address = (address or "").strip()
    local, at, domain = address.rpartition("@")
    if not at:
        return "***"
    return f"{local[:1]}***@{domain}"


def build_message(message: MailMessage, *, from_addr: str, from_name: str = FROM_NAME) -> EmailMessage:
    """A plain-text, UTF-8, RFC 5322 message with the headers a mail provider scores."""
    msg = EmailMessage()
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = message.to
    msg["Subject"] = message.subject
    msg["Date"] = formatdate(localtime=False, usegmt=True)
    domain = from_addr.rpartition("@")[2] or None
    msg["Message-ID"] = make_msgid(domain=domain)
    msg["Auto-Submitted"] = "auto-generated"
    msg.set_content(message.text, subtype="plain", charset="utf-8")
    return msg


@dataclass
class SmtpTransport:
    host: str
    port: int
    user: str = field(repr=False)
    password: str = field(repr=False)
    from_addr: str
    kind: str = field(default="smtp", init=False)
    configured: bool = field(default=True, init=False)

    @property
    def description(self) -> str:
        return f"SMTP via {self.host}:{self.port} as {self.from_addr}"

    def send(self, message: MailMessage) -> None:
        msg = build_message(message, from_addr=self.from_addr)
        try:
            self._deliver(msg, message.to)
        except MailSendError as exc:
            log.warning("Mail to %s (%s) failed: %s", mask_address(message.to), message.kind, exc)
            raise
        except (smtplib.SMTPException, OSError) as exc:  # ssl.SSLError is an OSError
            err = MailSendError(f"{type(exc).__name__}: {str(exc)[:200]}")
            log.warning("Mail to %s (%s) failed: %s", mask_address(message.to), message.kind, err)
            raise err from None
        log.info("Mail sent to %s (%s)", mask_address(message.to), message.kind)

    def _deliver(self, msg: EmailMessage, to: str) -> None:
        context = ssl.create_default_context()
        if self.port == 465:
            conn = smtplib.SMTP_SSL(self.host, self.port, timeout=SMTP_TIMEOUT_S, context=context)
        else:
            conn = smtplib.SMTP(self.host, self.port, timeout=SMTP_TIMEOUT_S)
        try:
            if self.port != 465:
                conn.ehlo()
                if not conn.has_extn("STARTTLS"):
                    raise MailSendError(f"{self.host}:{self.port} does not offer STARTTLS — refusing to log in over plaintext")
                conn.starttls(context=context)
                conn.ehlo()
            conn.login(self.user, self.password)
            conn.send_message(msg, from_addr=self.from_addr, to_addrs=[to])
        finally:
            try:
                conn.quit()
            except Exception:
                conn.close()


_sink_lock = threading.Lock()
_sink_seq = 0


def _next_sink_seq() -> int:
    global _sink_seq
    with _sink_lock:
        _sink_seq += 1
        return _sink_seq


@dataclass
class FileSinkTransport:
    directory: str
    from_addr: str = SINK_FROM
    kind: str = field(default="file", init=False)
    configured: bool = field(default=True, init=False)

    @property
    def description(self) -> str:
        return f"file sink at {self.directory} (never delivers)"

    def send(self, message: MailMessage) -> None:
        target = Path(self.directory)
        target.mkdir(parents=True, exist_ok=True)
        stamp = dt.datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")
        path = target / f"{stamp}-{_next_sink_seq()}.eml"
        path.write_bytes(build_message(message, from_addr=self.from_addr).as_bytes())
        log.info("Mail to %s (%s) written to %s", mask_address(message.to), message.kind, path)


@dataclass
class CaptureTransport:
    """The tests' transport (`tests/conftest.py`). Never selectable by configuration."""

    sent: list[MailMessage] = field(default_factory=list)
    kind: str = field(default="capture", init=False)
    configured: bool = field(default=True, init=False)
    description: str = field(default="capture (test transport — messages are kept in memory)", init=False)

    def send(self, message: MailMessage) -> None:
        self.sent.append(message)


@dataclass
class OffTransport:
    kind: str = field(default="off", init=False)
    configured: bool = field(default=False, init=False)
    description: str = field(default=OFF_DESCRIPTION, init=False)

    def send(self, message: MailMessage) -> None:
        raise MailNotConfigured("email is not set up on this server")


def mail_transport_for(settings: Settings) -> MailTransport:
    """The sink when `mail_sink_dir` is set; SMTP when all five keys are; otherwise off.

    `assert_auth_config_safe` has already refused the unsafe combinations (a half-set SMTP,
    SMTP on a non-production server without `mail_dev_smtp`, a sink in production), so
    this only chooses."""
    if settings.mail_sink_dir:
        return FileSinkTransport(settings.mail_sink_dir, from_addr=settings.smtp_from or SINK_FROM)
    if settings.smtp_host and settings.smtp_user and settings.smtp_pass and settings.smtp_from:
        return SmtpTransport(
            host=settings.smtp_host,
            port=int(settings.smtp_port),
            user=settings.smtp_user,
            password=settings.smtp_pass,
            from_addr=settings.smtp_from,
        )
    return OffTransport()


async def send_off_loop(transport: MailTransport, message: MailMessage) -> None:
    """The one async wrapper: the blocking `send` in the threadpool, never on the loop."""
    await run_in_threadpool(transport.send, message)
