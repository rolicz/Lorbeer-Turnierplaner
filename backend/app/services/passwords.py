"""Hashing and checking a password — the one place it is done (L1).

Argon2id through `argon2-cffi`'s `PasswordHasher`. **The salt is the library's**: every
`hash()` call draws a fresh cryptographically random salt (16 bytes from `os.urandom`) and
encodes it inside the returned `$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>` string. Nothing
here passes a salt, derives one (never from the username), shares one, or stores one apart
from the hash — so two accounts with the same password have unrelated hashes.

No pepper, deliberately (FEATURES_2026-09-auth.md §5): `app.db` and `secrets.json` sit in
the same bind-mounted directory, so a pepper adds a second secret whose *loss* silently
fails every password without protecting against the leak it is meant for. The hash string
is self-describing, so one can be added later as a versioned prefix.
"""

from __future__ import annotations

from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from argon2.profiles import RFC_9106_LOW_MEMORY

from ..api_utils import bad_request

#: The floor for a password **being set** (register, reset, change, `manage.py
#: set-password`) — 15 since the email batch (E0), mirrored once in
#: `frontend/src/pages/auth/password.ts`. **Login never checks length**: the migrated
#: passwords are shorter and keep working, which `test_login_never_checks_length` pins.
MIN_PASSWORD_LENGTH = 15
MAX_PASSWORD_LENGTH = 200

#: `default` = the library's RFC 9106 low-memory profile (argon2id, t=3, m=64 MiB, p=4;
#: ~124 ms per hash on the Pi 5). `test` = cheap parameters so the suite does not spend
#: minutes hashing; `settings.assert_auth_config_safe` refuses it in production.
PASSWORD_HASH_PROFILES: tuple[str, ...] = ("default", "test")


@lru_cache(maxsize=None)
def hasher_for(profile: str) -> PasswordHasher:
    """One `PasswordHasher` per profile. Both are argon2id."""
    if profile == "default":
        return PasswordHasher.from_parameters(RFC_9106_LOW_MEMORY)
    if profile == "test":
        return PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1)
    raise ValueError(f"unknown password hash profile: {profile!r}")


def hash_password(ph: PasswordHasher, plain: str) -> str:
    """An argon2id hash string with a fresh random salt inside it."""
    return ph.hash(plain)


def verify_password(ph: PasswordHasher, stored_hash: str | None, plain: str) -> tuple[bool, bool]:
    """`(ok, needs_rehash)`. A missing or unreadable hash is simply not a match.

    `needs_rehash` is true when the stored parameters differ from `ph`'s — the caller
    re-hashes on that successful login, so a parameter change rolls out by itself."""
    if not stored_hash:
        return False, False
    try:
        ph.verify(stored_hash, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False, False
    return True, ph.check_needs_rehash(stored_hash)


def validate_new_password(plain: str) -> None:
    """At least `MIN_PASSWORD_LENGTH` (15) characters and at most 200; no composition rules.

    Only for a password being set — never called on a login."""
    n = len(plain or "")
    if n < MIN_PASSWORD_LENGTH:
        bad_request(f"The password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if n > MAX_PASSWORD_LENGTH:
        bad_request(f"The password must be at most {MAX_PASSWORD_LENGTH} characters long")
