"""Slowing an attacker down (L2): the limiter's window and sweep, and the login limits."""

from __future__ import annotations

from sqlmodel import Session, select

from app.db import get_engine
from app.models import AuthSession
from app.services import rate_limit
from app.services.rate_limit import LIMITS, RateLimiter, limits_for


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def test_the_window_slides():
    clock = Clock()
    rl = RateLimiter(clock)
    assert rl.check("k", 3, 60) is None
    for t in (1000, 1020, 1040):
        clock.t = t
        rl.hit("k")
    assert rl.check("k", 3, 60) == 20  # the oldest hit (1000) leaves the window at 1060
    clock.t = 1050
    assert rl.check("k", 3, 60) == 10
    clock.t = 1061  # the oldest hit is out: two left, room for one more
    assert rl.check("k", 3, 60) is None
    rl.hit("k")
    assert rl.check("k", 3, 60) == 19  # 1020 + 60 - 1061: the window slid, it did not reset


def test_clear_forgets_a_key():
    rl = RateLimiter(Clock())
    for _ in range(5):
        rl.hit("k")
    assert rl.check("k", 3, 60) is not None
    rl.clear("k")
    assert rl.check("k", 3, 60) is None


def test_the_sweep_keeps_the_map_from_growing_forever():
    clock = Clock()
    rl = RateLimiter(clock)
    for i in range(RateLimiter.SWEEP_EVERY - 1):
        rl.hit(f"attacker-key-{i}")
    assert rl.size() == RateLimiter.SWEEP_EVERY - 1
    clock.t += rate_limit.MAX_WINDOW_S + 1  # every hit so far is older than the longest window
    rl.hit("fresh")  # the 1000th hit sweeps
    assert rl.size() == 1


def test_limits_for_builds_the_three_keys():
    keys = limits_for("login", ip="10.0.0.9", account="roli")
    assert [k.key for k in keys] == ["login:account:roli", "login:ip:10.0.0.9", "login:global"]
    assert [k.per_account for k in keys] == [True, False, False]
    assert (keys[0].limit, keys[0].window_s) == LIMITS["login"][0]
    assert [k.key for k in limits_for("redeem", ip="10.0.0.9")] == ["redeem:ip:10.0.0.9", "redeem:global"]


def test_the_email_family_counts_per_account_per_ip_and_globally():
    """E1: five sends an hour per account, ten per IP, sixty for the whole server."""
    assert LIMITS["email"] == ((5, 3600), (10, 3600), (60, 3600))
    keys = limits_for("email", ip="10.0.0.9", account="roli")
    assert [k.key for k in keys] == ["email:account:roli", "email:ip:10.0.0.9", "email:global"]


# ---- on the login endpoint -------------------------------------------------------------------


def _wrong(anon, username="Editor"):
    return anon.post("/auth/login", json={"username": username, "password": "wrong-password"})


def test_the_eleventh_wrong_password_from_one_account_is_a_429(anon):
    for _ in range(10):
        assert _wrong(anon).status_code == 401
    r = _wrong(anon)
    assert r.status_code == 429, r.text
    assert int(r.headers["retry-after"]) >= 1
    assert r.json()["detail"] == {"retry_after": int(r.headers["retry-after"])}
    # Slowdown, never lockout: the right password is still refused only because the window
    # has not passed, and nothing about the account was written.
    assert anon.post("/auth/login", json={"username": "Editor", "password": "editor-secret"}).status_code == 429
    # A different account is a different bucket (the IP bucket is 30).
    assert _wrong(anon, "Editor2").status_code == 401


def test_a_right_password_clears_the_account_key(anon):
    for _ in range(4):
        assert _wrong(anon).status_code == 401
    assert anon.post("/auth/login", json={"username": "Editor", "password": "editor-secret"}).status_code == 200
    for _ in range(10):
        assert _wrong(anon).status_code == 401
    assert _wrong(anon).status_code == 429


def test_the_global_cap(anon, monkeypatch):
    monkeypatch.setitem(LIMITS, "login", ((10, 600), (30, 600), (3, 600)))
    assert _wrong(anon, "a").status_code == 401
    assert _wrong(anon, "b").status_code == 401
    assert _wrong(anon, "c").status_code == 401
    assert _wrong(anon, "d").status_code == 429


def test_the_ip_cap_and_that_the_exchange_shares_it(anon, monkeypatch):
    monkeypatch.setitem(LIMITS, "login", ((10, 600), (2, 600), (150, 600)))
    assert _wrong(anon, "a").status_code == 401
    assert anon.post("/auth/exchange", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert _wrong(anon, "b").status_code == 429
    assert anon.post("/auth/exchange", headers={"Authorization": "Bearer nope"}).status_code == 429


def test_a_429_writes_no_session(anon):
    with Session(get_engine()) as s:
        before = len(s.exec(select(AuthSession)).all())
    for _ in range(11):
        _wrong(anon)
    assert anon.post("/auth/login", json={"username": "Editor", "password": "editor-secret"}).status_code == 429
    with Session(get_engine()) as s:
        assert len(s.exec(select(AuthSession)).all()) == before
