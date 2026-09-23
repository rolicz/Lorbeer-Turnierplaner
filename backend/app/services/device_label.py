"""A device's name in a session list (L3): `iPhone · Safari`, `Windows · Chrome`, …

No dependency and no attempt at completeness: six platforms, four browsers, and
`Unknown device` for everything else. The label is written into `AuthSession.device_label`
when a session is minted, so a list never has to parse a user agent again.
"""

from __future__ import annotations

import re

UNKNOWN_DEVICE = "Unknown device"

#: Platform, tried in order — iPad before Mac (iPadOS in desktop mode still says "iPad" in
#: the installed app's UA, and a Mac UA never says it), Android before Linux (every
#: Android UA also says "Linux").
_PLATFORMS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("iPhone", re.compile(r"\biPhone\b|\biPod\b")),
    ("iPad", re.compile(r"\biPad\b")),
    ("Android", re.compile(r"\bAndroid\b")),
    ("Windows", re.compile(r"\bWindows\b")),
    ("Mac", re.compile(r"\bMacintosh\b|\bMac OS X\b")),
    ("Linux", re.compile(r"\bLinux\b|\bX11\b|\bCrOS\b")),
)

#: Browser, tried in order — Edge and Firefox before Chrome, Chrome before Safari (Chrome's
#: UA also says "Safari"; Chrome on iOS says "CriOS", Firefox on iOS "FxiOS").
_BROWSERS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Edge", re.compile(r"\bEdg(e|A|iOS)?/")),
    ("Firefox", re.compile(r"\bFirefox/|\bFxiOS/")),
    ("Chrome", re.compile(r"\bChrome/|\bCriOS/|\bChromium/")),
    ("Safari", re.compile(r"\bSafari/|\bAppleWebKit/")),
)


def device_label(user_agent: str | None) -> str:
    """`<platform> · <browser>`, `<platform>` alone when the browser is unknown, or
    `Unknown device` when the platform is."""
    ua = str(user_agent or "")
    platform = next((name for name, rx in _PLATFORMS if rx.search(ua)), None)
    if platform is None:
        return UNKNOWN_DEVICE
    browser = next((name for name, rx in _BROWSERS if rx.search(ua)), None)
    return f"{platform} · {browser}" if browser else platform
