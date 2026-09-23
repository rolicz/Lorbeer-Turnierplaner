"""A software WebAuthn authenticator for the passkey tests (L8).

It builds **genuine** registration and assertion responses — a real P-256 key from
`cryptography`, a CBOR attestation object with `fmt="none"`, authenticator data with real
flag bits and a real signature counter, a `clientDataJSON` carrying the challenge and the
origin — and the production `webauthn` verification consumes them unmodified. Stubbing the
library would test the wiring around a hole; this is what lets the negative cases be real:
every knob a test needs is a keyword argument, so an assertion can be signed for the wrong
origin, for another rpID, with the user-verified bit clear, with a counter that went
backwards, with a stale challenge, by a key the server has never seen, or by one key
claiming another's credential id.

Hand-rolled rather than the `soft-webauthn` package, which drags `fido2<2.0` in and keeps
its flag bits out of the test's hands.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from base64 import urlsafe_b64decode, urlsafe_b64encode
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

# Authenticator data flag bits (https://www.w3.org/TR/webauthn-2/#flags).
FLAG_UP = 1 << 0  # user present
FLAG_UV = 1 << 2  # user verified
FLAG_BE = 1 << 3  # backup eligible
FLAG_BS = 1 << 4  # backup state (backed up)
FLAG_AT = 1 << 6  # attested credential data included

#: COSE EC2 / P-256 / ES256, the algorithm every real passkey speaks.
_COSE_KTY_EC2 = 2
_COSE_ALG_ES256 = -7
_COSE_CRV_P256 = 1


def b64url(data: bytes) -> str:
    return urlsafe_b64encode(data).decode("ascii").rstrip("=")


def unb64url(value: str) -> bytes:
    return urlsafe_b64decode(f"{value}===")


class SoftAuthenticator:
    """One credential: a key pair, a credential id, a counter and the rpID it was made for."""

    def __init__(self, *, aaguid: bytes | None = None, backup_eligible: bool = True, backed_up: bool = True) -> None:
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = secrets.token_bytes(32)
        self.aaguid = aaguid if aaguid is not None else bytes(16)
        self.backup_eligible = backup_eligible
        self.backed_up = backed_up
        self.counter = 0
        self.rp_id: str | None = None
        self.user_handle: bytes | None = None

    # ---- pieces -----------------------------------------------------------------------

    @property
    def credential_id_b64(self) -> str:
        return b64url(self.credential_id)

    def cose_public_key(self) -> bytes:
        numbers = self.private_key.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: _COSE_KTY_EC2,
                3: _COSE_ALG_ES256,
                -1: _COSE_CRV_P256,
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def _flags(self, *, user_present: bool, user_verified: bool, attested: bool) -> int:
        flags = 0
        if user_present:
            flags |= FLAG_UP
        if user_verified:
            flags |= FLAG_UV
        if self.backup_eligible:
            flags |= FLAG_BE
            if self.backed_up:
                flags |= FLAG_BS
        if attested:
            flags |= FLAG_AT
        return flags

    def _auth_data(self, rp_id: str, *, counter: int, user_present: bool, user_verified: bool, attested: bool) -> bytes:
        data = hashlib.sha256(rp_id.encode("utf-8")).digest()
        data += bytes([self._flags(user_present=user_present, user_verified=user_verified, attested=attested)])
        data += int(counter).to_bytes(4, "big")
        if attested:
            data += self.aaguid
            data += len(self.credential_id).to_bytes(2, "big")
            data += self.credential_id
            data += self.cose_public_key()
        return data

    @staticmethod
    def _client_data(kind: str, challenge: str, origin: str) -> bytes:
        return json.dumps({"type": kind, "challenge": challenge, "origin": origin, "crossOrigin": False}).encode("utf-8")

    # ---- the two ceremonies -------------------------------------------------------------

    def create(
        self,
        options: dict[str, Any],
        origin: str,
        *,
        rp_id: str | None = None,
        challenge: str | None = None,
        user_present: bool = True,
        user_verified: bool = True,
    ) -> dict[str, Any]:
        """Answer registration `options` (the JSON the server sent) as the browser would,
        from `origin`. Every knob defaults to what a well-behaved authenticator does; a test
        overrides one at a time."""
        rp_id = rp_id or str(options["rp"]["id"])
        challenge = challenge or str(options["challenge"])
        self.rp_id = rp_id
        self.user_handle = unb64url(str(options["user"]["id"]))
        client_data_json = self._client_data("webauthn.create", challenge, origin)
        auth_data = self._auth_data(rp_id, counter=self.counter, user_present=user_present, user_verified=user_verified, attested=True)
        attestation_object = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": self.credential_id_b64,
            "rawId": self.credential_id_b64,
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": {
                "clientDataJSON": b64url(client_data_json),
                "attestationObject": b64url(attestation_object),
                "transports": ["internal"],
            },
        }

    def get(
        self,
        options: dict[str, Any],
        origin: str,
        *,
        rp_id: str | None = None,
        challenge: str | None = None,
        counter: int | None = None,
        user_present: bool = True,
        user_verified: bool = True,
        user_handle: bytes | None = None,
        credential_id: bytes | None = None,
        signer: SoftAuthenticator | None = None,
    ) -> dict[str, Any]:
        """Answer sign-in `options` as the browser would, from `origin`.

        `counter`: the value to report (default: one more than last time — a real
        authenticator increments). `credential_id` / `signer`: claim another credential's
        id, or let another key sign — the "signature from a different credential" cases.
        `rp_id`: hash a different relying party into the authenticator data."""
        rp_id = rp_id or self.rp_id or str(options.get("rpId") or "")
        challenge = challenge or str(options["challenge"])
        if counter is None:
            self.counter += 1
            counter = self.counter
        else:
            self.counter = counter
        client_data_json = self._client_data("webauthn.get", challenge, origin)
        auth_data = self._auth_data(rp_id, counter=counter, user_present=user_present, user_verified=user_verified, attested=False)
        key = (signer or self).private_key
        signature = key.sign(auth_data + hashlib.sha256(client_data_json).digest(), ec.ECDSA(hashes.SHA256()))
        cred_id = credential_id if credential_id is not None else self.credential_id
        handle = user_handle if user_handle is not None else self.user_handle
        response: dict[str, Any] = {
            "clientDataJSON": b64url(client_data_json),
            "authenticatorData": b64url(auth_data),
            "signature": b64url(signature),
        }
        if handle is not None:
            response["userHandle"] = b64url(handle)
        return {
            "id": b64url(cred_id),
            "rawId": b64url(cred_id),
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
            "response": response,
        }
