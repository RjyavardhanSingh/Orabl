"""Auth — own Google OAuth (code flow) + opaque session tokens.

Flow (no cookies anywhere, works with third-party cookies blocked):

1. SPA: ``GET /auth/google/url?next=/upload`` → ``{url}`` → full-page
   navigate to Google.
2. Google redirects (top-level) to ``GET /auth/google/callback`` here.
   Backend validates ``state`` (single-use, CSRF), exchanges the code
   server-side (client secret never leaves the server), upserts the user,
   creates a session, and 302-redirects to the SPA with a single-use
   exchange code: ``{FRONTEND_URL}/auth/callback?code=...&next=...``.
3. SPA: ``POST /auth/token {code}`` → ``{token, user}``. The raw session
   token is revealed exactly once, in a JSON body, then lives in
   ``sessionStorage`` and travels as ``Authorization: Bearer``.
"""

from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.schemas import GoogleUrlResponse, MeResponse, TokenExchangeRequest, TokenResponse
from cache.dragonfly import get_cache
from db.connection import Database, get_db
from services import auth_service
from services.auth_service import (
    AuthNotConfiguredError,
    CurrentUser,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["Auth"])

_optional_bearer = HTTPBearer(auto_error=False)


def _frontend_callback(code: str | None, next_url: str, error: str | None = None) -> str:
    base = f"{auth_service.frontend_base_url()}/auth/callback"
    if error is not None:
        return f"{base}?{urlencode({'error': error, 'next': next_url})}"
    return f"{base}?{urlencode({'code': code or '', 'next': next_url})}"


@router.get("/google/url", response_model=GoogleUrlResponse, summary="Auth — Google login URL")
async def google_login_url(
    next: str | None = Query(default=None),
    cache=Depends(get_cache),
):
    """Return the Google authorization URL for this login attempt."""
    try:
        state, verifier, challenge = auth_service.new_oauth_state()
        url = auth_service.google_authorize_url(state, challenge)
    except AuthNotConfiguredError as e:
        raise HTTPException(status_code=500, detail="Google sign-in is not configured") from e
    next_url = auth_service.sanitize_next(next)
    auth_service.store_oauth_state(cache, state, verifier, next_url)
    return GoogleUrlResponse(url=url)


@router.get("/google/callback", summary="Auth — Google OAuth callback", include_in_schema=False)
async def google_callback(
    request: Request,
    db: Database = Depends(get_db),
    cache=Depends(get_cache),
):
    """Google redirects here (top-level). Never called by the SPA directly."""
    params = request.query_params
    if params.get("error"):
        return RedirectResponse(
            _frontend_callback(
                None, auth_service.sanitize_next(params.get("next")), error="google_rejected"
            ),
            status_code=302,
        )
    code = params.get("code")
    state = params.get("state")
    if not code or not state:
        return RedirectResponse(
            _frontend_callback(None, "/upload", error="invalid_response"), status_code=302
        )
    saved = auth_service.pop_oauth_state(cache, state)
    if saved is None:
        return RedirectResponse(
            _frontend_callback(None, "/upload", error="invalid_state"), status_code=302
        )
    next_url = auth_service.sanitize_next(saved.get("next"))
    try:
        tokens = await auth_service.exchange_google_code(code, saved["verifier"])
        access_token = tokens.get("access_token")
        if not access_token or not isinstance(access_token, str):
            raise HTTPException(status_code=401, detail="Google sign-in failed")
        profile = await auth_service.fetch_google_userinfo(access_token)
        user = await auth_service.upsert_user_from_google(
            db,
            google_sub=profile["sub"],
            email=profile["email"],
            name=profile["name"],
        )
        raw_session = await auth_service.create_session(db, user["id"])
        exchange_code = auth_service.store_exchange_code(cache, raw_session)
    except HTTPException:
        return RedirectResponse(
            _frontend_callback(None, next_url, error="signin_failed"), status_code=302
        )
    return RedirectResponse(_frontend_callback(exchange_code, next_url), status_code=302)


@router.post("/token", response_model=TokenResponse, summary="Auth — redeem login code")
async def redeem_token(
    body: TokenExchangeRequest,
    db: Database = Depends(get_db),
    cache=Depends(get_cache),
):
    """Exchange the single-use callback code for the session token (once)."""
    raw = auth_service.pop_exchange_code(cache, body.code)
    if raw is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await auth_service.resolve_session(db, raw)
    if user is None:  # pragma: no cover - defensive; code implies a live session
        raise HTTPException(status_code=401, detail="Not authenticated")
    return TokenResponse(token=raw, user=MeResponse(id=user.id, email=user.email))


@router.get("/me", response_model=MeResponse, summary="Auth — verified caller profile")
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Return the caller's user id (and email)."""
    return MeResponse(id=user.id, email=user.email)


@router.post("/logout", summary="Auth — revoke current session")
async def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: Database = Depends(get_db),
):
    """Revoke the calling session. Always 200 (logout is best-effort)."""
    if credentials is not None and credentials.credentials:
        await auth_service.revoke_session(db, credentials.credentials)
    return {"ok": True}
