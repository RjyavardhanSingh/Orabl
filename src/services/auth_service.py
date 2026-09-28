"""Own authentication: Google OAuth + opaque session tokens.

Identity is ours now (Neon Auth / Better Auth fully removed):

- Google OAuth code flow is driven by our backend: the client secret never
  leaves the server, and the SPA never touches OAuth codes.
- Login yields an opaque session token (``secrets.token_urlsafe``). Only a
  SHA-256 hash is stored (``app_sessions``); the raw token is shown once,
  at exchange time, inside a JSON body — no cookies involved, so this works
  identically in normal windows, incognito, Safari, and with third-party
  cookies blocked.
- Every API call carries ``Authorization: Bearer <session token>``; this
  module hashes and resolves it against ``app_sessions`` with expiry and
  revocation enforced. Fail closed (401) on anything else.

Authorization (does this user_id own this row?) happens per-query in the
routes and services, unchanged.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from cache.dragonfly import CacheService, get_cache
from db.connection import Database, get_db

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

OAUTH_STATE_TTL_SECONDS = 600
EXCHANGE_CODE_TTL_SECONDS = 300
SESSION_TTL_DAYS = 30


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated caller: our app user id plus email."""

    id: str
    email: str | None = None


class AuthNotConfiguredError(RuntimeError):
    """Raised when Google OAuth credentials are missing from the environment."""


def _google_config() -> tuple[str, str]:
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()
    if not client_id or not client_secret:
        raise AuthNotConfiguredError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set")
    return client_id, client_secret


def api_external_base_url() -> str:
    """Public base URL of this API (used to build our OAuth redirect_uri)."""
    return (os.getenv("API_EXTERNAL_BASE_URL") or "http://localhost:8000").rstrip("/")


def frontend_base_url() -> str:
    """Where the SPA lives (OAuth callback redirects back here)."""
    return (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def google_redirect_uri() -> str:
    """Must be registered in Google Cloud Console → Authorized redirect URIs."""
    return f"{api_external_base_url()}/v1/auth/google/callback"


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue_token() -> tuple[str, str]:
    """Return (raw_token, token_hash). The raw value is shown exactly once."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def sanitize_next(value: str | None) -> str:
    """Allow only same-origin SPA paths (mirrors the frontend check)."""
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return "/upload"


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------


async def create_session(db: Database, user_id: str, ttl_days: int = SESSION_TTL_DAYS) -> str:
    """Insert a session row and return the raw token (shown once)."""
    raw, digest = issue_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    await db.execute(
        "INSERT INTO app_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        user_id,
        digest,
        expires_at,
    )
    return raw


async def resolve_session(db: Database, raw: str) -> CurrentUser | None:
    """Resolve a raw session token. None for missing/expired/revoked or DB error."""
    if not raw or not isinstance(raw, str) or len(raw) > 256:
        return None
    try:
        row = await db.fetchrow(
            "SELECT s.user_id, s.expires_at, s.revoked_at, u.email "
            "FROM app_sessions s JOIN app_users u ON u.id = s.user_id "
            "WHERE s.token_hash = $1",
            hash_token(raw),
        )
    except Exception:
        logger.warning("Session lookup failed")
        return None
    if row is None:
        return None
    now = datetime.now(timezone.utc)
    if row["revoked_at"] is not None or row["expires_at"] <= now:
        return None
    try:
        await db.execute(
            "UPDATE app_sessions SET last_used_at = NOW() WHERE token_hash = $1",
            hash_token(raw),
        )
    except Exception:
        logger.warning("Session touch failed")
    email = row["email"]
    return CurrentUser(id=str(row["user_id"]), email=email if isinstance(email, str) else None)


async def revoke_session(db: Database, raw: str) -> None:
    """Mark a session revoked. Never raises (logout is best-effort server-side)."""
    if not raw or len(raw) > 256:
        return
    try:
        await db.execute(
            "UPDATE app_sessions SET revoked_at = NOW() WHERE token_hash = $1",
            hash_token(raw),
        )
    except Exception:
        logger.warning("Session revoke failed")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Database = Depends(get_db),
) -> CurrentUser:
    """FastAPI dependency: verified caller or 401. Attach to protected routes."""
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await resolve_session(db, credentials.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------


def new_oauth_state() -> tuple[str, str, str]:
    """Return (state, code_verifier, code_challenge) for one login attempt (PKCE S256)."""
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    return secrets.token_urlsafe(24), verifier, challenge


def google_authorize_url(state: str, code_challenge: str) -> str:
    from urllib.parse import urlencode

    client_id, _ = _google_config()
    params = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": google_redirect_uri(),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    return f"{GOOGLE_AUTHORIZE_URL}?{params}"


def _state_key(state: str) -> str:
    return f"oauth:state:{state}"


def _code_key(code: str) -> str:
    return f"oauth:code:{code}"


def store_oauth_state(cache: CacheService, state: str, verifier: str, next_url: str) -> None:
    cache.set(
        _state_key(state), {"verifier": verifier, "next": next_url}, ttl=OAUTH_STATE_TTL_SECONDS
    )


def pop_oauth_state(cache: CacheService, state: str) -> dict | None:
    """Fetch-and-delete the state (single-use; None when unknown/replayed/expired)."""
    if not state or len(state) > 128:
        return None
    payload = cache.get(_state_key(state))
    if payload is None:
        return None
    cache.delete(_state_key(state))
    return payload if isinstance(payload, dict) else None


def store_exchange_code(cache: CacheService, raw_session_token: str) -> str:
    """Stash the raw session token behind a single-use code for the SPA to redeem."""
    code, _ = issue_token()
    cache.set(_code_key(code), {"token": raw_session_token}, ttl=EXCHANGE_CODE_TTL_SECONDS)
    return code


def pop_exchange_code(cache: CacheService, code: str) -> str | None:
    """Redeem a one-time code for the raw session token (None when unknown/reused/expired)."""
    if not code or len(code) > 256:
        return None
    payload = cache.get(_code_key(code))
    if payload is None:
        return None
    cache.delete(_code_key(code))
    token = payload.get("token") if isinstance(payload, dict) else None
    return token if isinstance(token, str) and token else None


async def exchange_google_code(code: str, verifier: str) -> dict:
    """Exchange an authorization code for Google tokens. Raises 401/502."""
    client_id, client_secret = _google_config()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "code_verifier": verifier,
                    "grant_type": "authorization_code",
                    "redirect_uri": google_redirect_uri(),
                },
            )
    except Exception as e:
        logger.warning("Google token exchange transport failure")
        raise HTTPException(
            status_code=502, detail="Google sign-in is unavailable right now"
        ) from e
    if resp.status_code != 200:
        logger.warning("Google token exchange rejected", extra={"status": resp.status_code})
        raise HTTPException(
            status_code=401, detail="Google authorization expired — please try signing in again"
        )
    return resp.json()


async def fetch_google_userinfo(access_token: str) -> dict:
    """Return {sub, email, email_verified, name}. Raises 401 when unusable."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
    except Exception as e:
        logger.warning("Google userinfo transport failure")
        raise HTTPException(
            status_code=502, detail="Google sign-in is unavailable right now"
        ) from e
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Could not read your Google profile")
    info = resp.json()
    sub = info.get("sub")
    email = info.get("email")
    if not sub or not isinstance(sub, str) or not email or not isinstance(email, str):
        raise HTTPException(status_code=401, detail="Could not read your Google profile")
    if info.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Your Google email is not verified")
    name = info.get("name")
    return {
        "sub": sub,
        "email": email,
        "email_verified": True,
        "name": name if isinstance(name, str) else "",
    }


async def upsert_user_from_google(
    db: Database,
    *,
    google_sub: str,
    email: str,
    name: str,
) -> dict:
    """Find-or-create our user by Google sub (adopting same-email rows)."""
    row = await db.fetchrow("SELECT id, email FROM app_users WHERE google_sub = $1", google_sub)
    if row is not None:
        await db.execute(
            "UPDATE app_users SET email = $1, name = $2, email_verified = TRUE, "
            "updated_at = NOW() WHERE id = $3",
            email,
            name,
            row["id"],
        )
        return {"id": str(row["id"]), "email": email}
    row = await db.fetchrow("SELECT id FROM app_users WHERE LOWER(email) = LOWER($1)", email)
    if row is not None:
        await db.execute(
            "UPDATE app_users SET google_sub = $1, name = $2, email_verified = TRUE, "
            "updated_at = NOW() WHERE id = $3",
            google_sub,
            name,
            row["id"],
        )
        return {"id": str(row["id"]), "email": email}
    row = await db.fetchrow(
        "INSERT INTO app_users (email, name, google_sub, email_verified) "
        "VALUES ($1, $2, $3, TRUE) RETURNING id, email",
        email,
        name,
        google_sub,
    )
    if row is None:  # pragma: no cover - defensive; INSERT..RETURNING always yields a row
        raise HTTPException(status_code=500, detail="Could not create your account")
    return {"id": str(row["id"]), "email": row["email"]}


def get_cache_dependency() -> CacheService:
    """FastAPI dependency indirection so tests can override the cache."""
    return get_cache()
