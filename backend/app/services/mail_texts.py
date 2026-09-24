"""The words in an email — the only place they are written (E1).

English only, plain text, and nothing clickable but the one link, which stands on a line
of its own (a mail client that wraps a sentence must not break the URL). Each builder
returns a `MailMessage` with its `kind` set, which is what the transports log instead of
the body — the body carries the secret.
"""

from __future__ import annotations

import datetime as dt

from .mail import MailMessage

SIGNATURE = "— Lorbeerkranz"


def _greeting(name: str) -> str:
    name = str(name or "").strip()
    return f"Hi {name}," if name else "Hi,"


def verify_email_message(*, to: str, name: str, url: str) -> MailMessage:
    text = "\n".join(
        [
            _greeting(name),
            "",
            "Open this link to confirm this address for your Lorbeerkranz account:",
            "",
            url,
            "",
            "It works once, for 24 hours. If you did not ask for this, ignore this email.",
            "",
            SIGNATURE,
            "",
        ]
    )
    return MailMessage(to=to, subject="Confirm your email for Lorbeerkranz", text=text, kind="verify")


def recovery_message(*, to: str, name: str, url: str) -> MailMessage:
    text = "\n".join(
        [
            _greeting(name),
            "",
            "Open this link to set a new passkey or password for your Lorbeerkranz account:",
            "",
            url,
            "",
            "It works once, for one hour, and using it signs out every other device.",
            "If this was not you, ignore this email — nothing changes.",
            "",
            SIGNATURE,
            "",
        ]
    )
    return MailMessage(to=to, subject="Get back into Lorbeerkranz", text=text, kind="recover")


def email_changed_message(*, to: str, name: str) -> MailMessage:
    """To the **previous** address when the email is changed or removed — no link at all,
    so it is never a second way into the account it no longer belongs to."""
    text = "\n".join(
        [
            _greeting(name),
            "",
            "The email address of your Lorbeerkranz account was changed or removed,",
            "so this address will no longer receive anything from Lorbeerkranz.",
            "",
            "If that was not you, tell the admin right away.",
            "",
            SIGNATURE,
            "",
        ]
    )
    return MailMessage(to=to, subject="Your Lorbeerkranz email address changed", text=text, kind="changed")


def test_message(*, to: str, description: str) -> MailMessage:
    """`manage.py mail-test` — the deliverability gate."""
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    text = "\n".join(
        [
            "This is a test message from the Lorbeerkranz server.",
            "",
            f"Sent at: {now}",
            f"Sent via: {description}",
            "",
            "To check deliverability, open this message in Gmail, choose ⋮ → Show original,",
            "and read the three results at the top:",
            "",
            "  SPF:   must say PASS (spf=pass)",
            "  DKIM:  must say PASS (dkim=pass)",
            "  DMARC: must say PASS (dmarc=pass) once the DMARC record is published",
            "",
            "It must also have arrived in the inbox, not in spam.",
            "",
            SIGNATURE,
            "",
        ]
    )
    return MailMessage(to=to, subject="Lorbeerkranz mail test", text=text, kind="test")


#: The name is the plan's; this keeps pytest from collecting it when a test imports it.
test_message.__test__ = False  # type: ignore[attr-defined]
