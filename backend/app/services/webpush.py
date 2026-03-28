from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt


class WebPushUnavailableError(RuntimeError):
    pass


class WebPushConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class WebPushConfig:
    public_key: str
    private_key_pem: str
    subject: str
    ttl_seconds: int = 300


@dataclass(frozen=True)
class WebPushSubscriptionData:
    endpoint: str
    p256dh: str
    auth: str
    content_encoding: str = "aes128gcm"


def _load_crypto():
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except Exception as exc:
        raise WebPushUnavailableError("cryptography is required for Web Push delivery") from exc
    return hashes, serialization, ec, AESGCM


def web_push_runtime_ready(config: WebPushConfig) -> bool:
    if not config.public_key or not config.private_key_pem or not config.subject:
        return False
    try:
        _load_crypto()
    except WebPushUnavailableError:
        return False
    return True


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    raw = str(value or "").strip()
    if not raw:
        raise WebPushConfigError("Missing base64url value")
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    return hmac.new(salt, ikm, hashlib.sha256).digest()


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    out = b""
    prev = b""
    counter = 1
    while len(out) < length:
        prev = hmac.new(prk, prev + info + bytes([counter]), hashlib.sha256).digest()
        out += prev
        counter += 1
    return out[:length]


def _endpoint_audience(endpoint: str) -> str:
    parts = urlsplit(endpoint)
    if not parts.scheme or not parts.hostname:
        raise WebPushConfigError("Invalid push endpoint")
    aud = f"{parts.scheme}://{parts.hostname}"
    if parts.port is not None:
        default_port = 443 if parts.scheme == "https" else 80
        if parts.port != default_port:
            aud += f":{parts.port}"
    return aud


def _build_vapid_authorization(config: WebPushConfig, endpoint: str) -> str:
    now = int(time.time())
    token = jwt.encode(
        {
            "aud": _endpoint_audience(endpoint),
            "exp": now + 60 * 60 * 12,
            "sub": config.subject,
        },
        config.private_key_pem,
        algorithm="ES256",
    )
    return f"vapid t={token}, k={config.public_key}"


def _encrypt_aes128gcm(
    payload: bytes,
    *,
    p256dh: str,
    auth: str,
) -> bytes:
    hashes, serialization, ec, AESGCM = _load_crypto()
    del hashes

    ua_public_bytes = _b64url_decode(p256dh)
    auth_secret = _b64url_decode(auth)
    if len(ua_public_bytes) != 65 or ua_public_bytes[0] != 0x04:
        raise WebPushConfigError("Invalid user agent public key")

    ua_public_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public_bytes)
    as_private_key = ec.generate_private_key(ec.SECP256R1())
    as_public_bytes = as_private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    shared_secret = as_private_key.exchange(ec.ECDH(), ua_public_key)

    auth_info = b"WebPush: info\x00" + ua_public_bytes + as_public_bytes
    ikm = _hkdf_expand(_hkdf_extract(auth_secret, shared_secret), auth_info, 32)

    salt = os.urandom(16)
    prk = _hkdf_extract(salt, ikm)
    cek = _hkdf_expand(prk, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf_expand(prk, b"Content-Encoding: nonce\x00", 12)

    plaintext = payload + b"\x02"
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext, None)

    record_size = 4096
    header = salt + record_size.to_bytes(4, "big") + bytes([len(as_public_bytes)]) + as_public_bytes
    return header + ciphertext


def derive_public_key_from_private_pem(private_key_pem: str) -> str:
    _, serialization, _, _ = _load_crypto()
    private_key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    public_key = private_key.public_key()
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return _b64url_encode(public_bytes)


async def send_web_push_message(
    client: httpx.AsyncClient,
    config: WebPushConfig,
    subscription: WebPushSubscriptionData,
    payload: dict[str, Any],
) -> httpx.Response:
    if subscription.content_encoding != "aes128gcm":
        raise WebPushConfigError("Only aes128gcm push subscriptions are supported")

    encoded_body = _encrypt_aes128gcm(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        p256dh=subscription.p256dh,
        auth=subscription.auth,
    )

    headers = {
        "TTL": str(max(60, int(config.ttl_seconds))),
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Authorization": _build_vapid_authorization(config, subscription.endpoint),
        "Urgency": "high",
    }
    return await client.post(subscription.endpoint, content=encoded_body, headers=headers)
