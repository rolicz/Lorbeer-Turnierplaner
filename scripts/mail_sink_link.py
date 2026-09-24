#!/usr/bin/env python3
"""Read a link out of a stack's mail sink (E1) — how an isolated stack "receives" email.

A stack started with `MAIL_SINK_DIR=<dir>` writes every message it would have sent as
`<dir>/<UTC timestamp>-<seq>.eml` and delivers nothing. This prints the first `http(s)://`
URL in the newest message's body:

    python3 scripts/mail_sink_link.py "$WORK/mail"                  # the newest message's link
    python3 scripts/mail_sink_link.py "$WORK/mail" --to roli@x.test # the newest one to that address
    python3 scripts/mail_sink_link.py "$WORK/mail" --all            # To, Subject, link of every message

Exit 1 when the directory holds no message (or none to `--to`); a message with no link
prints `-` for it. Standard library only — any python3 runs it.
"""

from __future__ import annotations

import argparse
import re
import sys
from email import policy
from email.parser import BytesParser
from pathlib import Path

URL_RE = re.compile(r"https?://\S+")


def _messages(directory: Path) -> list[tuple[Path, object]]:
    """Every `.eml`, oldest first — the file names sort by their UTC timestamp, then by the
    sink's sequence number."""

    def order(path: Path) -> tuple[str, int]:
        stamp, _, seq = path.stem.partition("-")
        return stamp, int(seq) if seq.isdigit() else 0

    out = []
    for path in sorted(directory.glob("*.eml"), key=order):
        with path.open("rb") as fh:
            out.append((path, BytesParser(policy=policy.default).parse(fh)))
    return out


def _link(msg) -> str | None:
    part = msg.get_body(preferencelist=("plain",))
    text = part.get_content() if part is not None else ""
    match = URL_RE.search(text)
    return match.group(0) if match else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Print the link in the newest message of a mail sink.")
    parser.add_argument("directory")
    parser.add_argument("--all", action="store_true", help="print To, Subject and the link of every message")
    parser.add_argument("--to", help="only messages to this address (case-insensitive)")
    args = parser.parse_args(argv)

    directory = Path(args.directory)
    messages = _messages(directory) if directory.is_dir() else []
    if args.to:
        want = args.to.strip().casefold()
        messages = [(p, m) for p, m in messages if str(m["To"] or "").strip().casefold() == want]
    if not messages:
        print(f"no message in {directory}" + (f" to {args.to}" if args.to else ""), file=sys.stderr)
        return 1

    if args.all:
        for _path, msg in messages:
            print(f"{msg['To']}\t{msg['Subject']}\t{_link(msg) or '-'}")
        return 0

    _path, newest = messages[-1]
    link = _link(newest)
    print(link or "-")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
