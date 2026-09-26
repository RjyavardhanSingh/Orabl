"""Neon Auth (Managed Better Auth) JWT verification.

Identity lives with Neon Auth: login, Google OAuth, refresh, and the session
cookie are all handled between the frontend SDK and the Neon Auth service.
This module only *verifies* the short-lived Bearer JWT (EdDSA/Ed25519) against
the branch JWKS and extracts the caller. Authorization (does this user_id own
this row?) happens per-query in the routes and services.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from dataclasses import dataclass

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

JWKS_TTL_SECONDS = 3600
EXP_LEEWAY_SECONDS = 30

_bearer_scheme = HTTPBearer(auto_error=False)
_jwks_cache: dict = {"keys": None, "fetched_at": 0.0}


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated caller: Neon Auth user id plus optional email claim."""

    id: str
    email: str | None = None


class AuthNotConfiguredError(RuntimeError):
    """Raised when JWKS_URL is missing from the environment."""


def _config() -> tuple[str, str | None]:
    jwks_url = (os.getenv("JWKS_URL") or "").strip()
    if not jwks_url:
        raise AuthNotConfiguredError("JWKS_URL env var is not set")
    auth_url = (os.getenv("AUTH_URL") or "").strip() or None
    return jwks_url, auth_url


async def _get_jwks() -> dict:
    """Fetch the JWKS once per TTL; fail closed when unreachable."""
    now = time.monotonic()
    if _jwks_cache["keys"] is not None and now - _jwks_cache["fetched_at"] < JWKS_TTL_SECONDS:
        return _jwks_cache["keys"]
    jwks_url, _ = _config()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(jwks_url)
            resp.raise_for_status()
            keys = resp.json()
    except Exception as e:
        logger.warning("JWKS fetch failed", extra={"jwks_url": jwks_url})
        raise HTTPException(status_code=401, detail="Not authenticated") from e
    if not isinstance(keys, dict) or not keys.get("keys"):
        raise HTTPException(status_code=401, detail="Not authenticated")
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _find_key(jwks: dict, kid: str | None) -> dict | None:
    for key in jwks.get("keys", []):
        if not isinstance(key, dict):
            continue
        if key.get("kty") == "OKP" and key.get("crv") == "Ed25519" and key.get("x"):
            if kid is None or key.get("kid") == kid:
                return key
    return None


async def verify_token(token: str) -> dict:
    """Verify a Neon Auth JWT and return its claims. Raises 401 when invalid."""
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        header = json.loads(_b64url_decode(header_b64))
        claims = json.loads(_b64url_decode(payload_b64))
        signature = _b64url_decode(signature_b64)
    except Exception as e:
        raise HTTPException(status_code=401, detail="Not authenticated") from e

    if header.get("alg") != "EdDSA":
        raise HTTPException(status_code=401, detail="Not authenticated")

    jwks = await _get_jwks()
    jwk = _find_key(jwks, header.get("kid"))
    if jwk is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        public_key = Ed25519PublicKey.from_public_bytes(_b64url_decode(jwk["x"]))
        public_key.verify(signature, f"{header_b64}.{payload_b64}".encode("ascii"))
    except (InvalidSignature, ValueError) as e:
        raise HTTPException(status_code=401, detail="Not authenticated") from e

    now = time.time()
    try:
        exp = float(claims["exp"])
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(status_code=401, detail="Not authenticated") from e
    if exp + EXP_LEEWAY_SECONDS < now:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sub = claims.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Not authenticated")

    _, auth_url = _config()
    if auth_url:
        issuer = claims.get("iss")
        if not _issuer_matches(issuer, auth_url):
            logger.warning("JWT issuer mismatch", extra={"expected": auth_url})
            raise HTTPException(status_code=401, detail="Not authenticated")

    return claims


def _issuer_matches(issuer: object, auth_url: str) -> bool:
    """Compare token iss against AUTH_URL by origin (scheme + host).

    Neon Auth issues iss as the bare service host while AUTH_URL includes
    the mount path (e.g. .../neondb/auth), so full-string equality falsely
    rejects legitimate tokens. The path is deployment routing, not identity.
    """
    if not isinstance(issuer, str):
        return False
    try:
        from urllib.parse import urlparse

        want = urlparse(auth_url.rstrip("/"))
        got = urlparse(issuer.rstrip("/"))
    except ValueError:
        return False
    return (
        want.scheme.lower() == got.scheme.lower()
        and want.hostname == got.hostname
        and (want.port or None) == (got.port or None)
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    """FastAPI dependency: verified caller or 401. Attach to protected routes."""
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        claims = await verify_token(credentials.credentials)
    except AuthNotConfiguredError as e:
        raise HTTPException(status_code=500, detail="Authentication is not configured") from e
    email = claims.get("email")
    return CurrentUser(id=claims["sub"], email=email if isinstance(email, str) else None)
