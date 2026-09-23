"""Slowing an attacker down (L2): one in-process sliding-window limiter, a table of limits.

Never a lockout and never a row written: over the cap the endpoint answers **429** with
`Retry-After` and `{"retry_after": n}`, and the window simply passes. Every *failed*
attempt is counted; a success clears the per-account key so a person who mistyped twice
is not still paying for it after they got in. A 429 itself is not counted — a client that
is already being refused must not be able to extend its own penalty, or a shared IP could
be starved for good.

Keyed three ways at once (FEATURES_2026-09-auth.md §9): per account, per client IP and one
global bucket. The IP is `auth_gate.client_ip`'s answer, read from `request.state` —
counted from the *right* of `X-Forwarded-For`, so a client cannot choose its own bucket.
The map is swept every `SWEEP_EVERY` hits, so a client minting a fresh key per request
cannot grow it without bound (racer's leak, not repeated).
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from typing import Callable, NamedTuple

from fastapi import HTTPException, Request


class Limit(NamedTuple):
    key: str
    limit: int
    window_s: int
    #: A success clears this key (the per-account bucket); the others keep counting.
    per_account: bool = False


#: `family` -> ((per-account limit, window), (per-IP limit, window), (global limit, window)).
#: A `None` entry means that family has no bucket of that kind.
LIMITS: dict[str, tuple[tuple[int, int] | None, tuple[int, int], tuple[int, int]]] = {
    # POST /auth/login, /auth/exchange
    "login": ((10, 600), (30, 600), (150, 600)),
    # POST /auth/register, /auth/redeem (L3)
    "redeem": (None, (10, 3600), (40, 3600)),
    # POST /auth/reset (L3)
    "reset": (None, (10, 3600), (40, 3600)),
    # POST /auth/passkeys/login/* (L8)
    "passkey": (None, (30, 600), (300, 600)),
}

#: The longest window in `LIMITS`; the sweep drops anything older than this.
MAX_WINDOW_S = max(w for spec in LIMITS.values() for entry in spec if entry is not None for _, w in [entry])


class RateLimiter:
    """Sliding windows over monotonic time. Thread-safe: sync handlers run in a threadpool."""

    SWEEP_EVERY = 1000

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._since_sweep = 0

    def check(self, key: str, limit: int, window_s: int) -> int | None:
        """Seconds to wait when `key` already has `limit` hits inside the window, else None."""
        now = self._clock()
        with self._lock:
            dq = self._hits.get(key)
            if not dq:
                return None
            self._prune(dq, now - window_s)
            if len(dq) < limit:
                return None
            wait = dq[0] + window_s - now
            return max(1, int(math.ceil(wait)))

    def hit(self, key: str) -> None:
        now = self._clock()
        with self._lock:
            self._hits.setdefault(key, deque()).append(now)
            self._since_sweep += 1
            if self._since_sweep >= self.SWEEP_EVERY:
                self._since_sweep = 0
                self._sweep(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def size(self) -> int:
        """How many keys the map holds — for the sweep's test."""
        with self._lock:
            return len(self._hits)

    @staticmethod
    def _prune(dq: deque[float], cutoff: float) -> None:
        while dq and dq[0] <= cutoff:
            dq.popleft()

    def _sweep(self, now: float) -> None:
        cutoff = now - MAX_WINDOW_S
        for key in list(self._hits):
            dq = self._hits[key]
            self._prune(dq, cutoff)
            if not dq:
                del self._hits[key]


def limits_for(family: str, *, ip: str, account: str | None = None) -> list[Limit]:
    """The keys one request is measured against. `account` is the `name_key` (or None
    where the endpoint has no account bucket)."""
    per_account, per_ip, per_all = LIMITS[family]
    keys: list[Limit] = []
    if per_account is not None and account:
        keys.append(Limit(f"{family}:account:{account}", per_account[0], per_account[1], True))
    keys.append(Limit(f"{family}:ip:{ip or '?'}", per_ip[0], per_ip[1]))
    keys.append(Limit(f"{family}:global", per_all[0], per_all[1]))
    return keys


def limiter_for(request: Request) -> RateLimiter:
    """The one instance, on `app.state.rate_limiter` (set by `create_app`)."""
    limiter = getattr(request.app.state, "rate_limiter", None)
    if limiter is None:  # a bare app in a test that never ran create_app's setup
        limiter = request.app.state.rate_limiter = RateLimiter()
    return limiter


def enforce(request: Request, keys: list[Limit]) -> None:
    """Raise 429 (`Retry-After`, `{"retry_after": n}`) when any key is over its cap."""
    limiter = limiter_for(request)
    waits = [w for key in keys if (w := limiter.check(key.key, key.limit, key.window_s)) is not None]
    if waits:
        n = max(waits)
        raise HTTPException(status_code=429, detail={"retry_after": n}, headers={"Retry-After": str(n)})


def record_failure(request: Request, keys: list[Limit]) -> None:
    limiter = limiter_for(request)
    for key in keys:
        limiter.hit(key.key)


def record_success(request: Request, keys: list[Limit]) -> None:
    """A success clears the account bucket only — the IP and global buckets keep counting
    the failures around it."""
    limiter = limiter_for(request)
    for key in keys:
        if key.per_account:
            limiter.clear(key.key)
