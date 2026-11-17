"""OpenRouter client: model fallback, error messages, and content limits."""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

API_URL = os.getenv("OPENROUTER_API_URL", "https://openrouter.ai/api/v1/chat/completions")
DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "poolside/laguna-s-2.1:free")
# Comma-separated fallback list, e.g. "model-a,model-b"
MODELS = [
    m.strip()
    for m in os.getenv(
        "OPENROUTER_MODELS",
        f"{DEFAULT_MODEL},qwen/qwen3.8-27b:free",
    ).split(",")
    if m.strip()
]
RETRY_DELAYS = [5, 15, 30]
MAX_INPUT_TOKENS = 800000  # Leave room for prompt template + output


def _get_api_key() -> str:
    """Read OpenRouter API key from env."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set. Add it to your .env file.")
    return api_key


def _truncate_content(content: str, max_chars: int = 3000000) -> str:
    """Truncate content to stay within token limits.

    Rough estimate: 1 token ≈ 4 chars for English text.
    800K tokens ≈ 3.2M chars. We use 3M chars to be safe.
    """
    if len(content) <= max_chars:
        return content
    logger.warning(f"Truncating material content from {len(content)} to {max_chars} chars")
    return content[:max_chars]


def _build_headers() -> dict:
    """Build request headers for OpenRouter."""
    headers = {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }
    # Optional but recommended by OpenRouter for analytics/rate limits.
    site_url = os.getenv("OPENROUTER_SITE_URL")
    app_name = os.getenv("OPENROUTER_APP_NAME")
    if site_url:
        headers["HTTP-Referer"] = site_url
    if app_name:
        headers["X-Title"] = app_name
    return headers


def _status_code(exc: Exception) -> int | None:
    """Extract HTTP status code from an httpx error, if present.

    Walks the __cause__/__context__ chain since HTTP errors are
    re-raised as RuntimeError with the original attached.
    """
    seen = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, httpx.HTTPStatusError):
            return current.response.status_code
        current = current.__cause__ or current.__context__
    return None


def _is_auth_error(exc: Exception) -> bool:
    """True for key-level failures (bad/revoked key, forbidden).

    Retrying or falling back to other models cannot help these —
    fail fast instead of sleeping through the retry delays.
    """
    return _status_code(exc) in (401, 403)


_INVALID_KEY_MESSAGE = (
    "OpenRouter rejected the API key (401 Unauthorized). "
    "OPENROUTER_API_KEY must be an inference key from https://openrouter.ai/keys, "
    "not a management key from https://openrouter.ai/settings/management-keys. "
    "Update .env and restart the server (a running server does not pick up .env changes)."
)

_MANAGEMENT_KEY_MESSAGE = (
    "OPENROUTER_API_KEY is an OpenRouter management key, so model calls are "
    "rejected with 401. Management keys only administer other keys. Create an "
    "inference key at https://openrouter.ai/keys, replace OPENROUTER_API_KEY in "
    ".env, and restart the server."
)


def _key_endpoint() -> str:
    marker = "/chat/completions"
    if API_URL.endswith(marker):
        return API_URL[: -len(marker)] + "/key"
    return "https://openrouter.ai/api/v1/key"


def _unauthorized_message(key_payload: dict | None) -> str:
    """Explain a 401. Management keys authenticate but cannot call models."""
    data = {}
    if isinstance(key_payload, dict):
        raw = key_payload.get("data")
        if isinstance(raw, dict):
            data = raw
    if data.get("is_management_key") or data.get("is_provisioning_key"):
        return _MANAGEMENT_KEY_MESSAGE
    return _INVALID_KEY_MESSAGE


async def _lookup_key_payload(client: httpx.AsyncClient) -> dict | None:
    try:
        resp = await client.get(_key_endpoint(), headers=_build_headers())
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    try:
        payload = resp.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


async def _call_model(messages: list[dict], model: str) -> dict:
    """Call OpenRouter chat completions for a single model.

    Returns the raw assistant message dict, which includes
    `content` and (when reasoning is enabled) `reasoning_details`.
    """
    payload = {
        "model": model,
        "messages": messages,
        "reasoning": {"enabled": True},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.post(API_URL, headers=_build_headers(), json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 401:
                key_payload = await _lookup_key_payload(client)
                raise RuntimeError(_unauthorized_message(key_payload)) from e
            if status == 402:
                raise RuntimeError(
                    "OpenRouter refused the request (402 Payment Required). "
                    "The key is valid but has no credits / free-tier allowance left."
                ) from e
            if status == 429:
                raise RuntimeError(
                    "OpenRouter is rate-limiting this key (429 Too Many Requests). "
                    "Free-tier models allow only a few requests per minute — "
                    "wait a minute and retry. If it keeps happening, check usage at "
                    "https://openrouter.ai/activity or set OPENROUTER_MODEL to a "
                    "paid model with quota."
                ) from e
            raise
        data = resp.json()
    try:
        return data["choices"][0]["message"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected OpenRouter response shape: {data}") from e


async def _call_openrouter(prompt: str) -> str:
    """Call OpenRouter with model fallback; returns the content only."""
    content, _model = await call_openrouter_with_model(prompt)
    return content


async def call_openrouter_with_model(prompt: str) -> tuple[str, str]:
    """Call OpenRouter with model fallback; returns (content, model that answered).

    Preserves `reasoning_details` on the wire format: if a follow-up
    turn is ever needed, pass the assistant message back unmodified
    (content + reasoning_details) before appending the next user message.
    """
    messages = [{"role": "user", "content": prompt}]
    last_error = None
    for model in MODELS:
        try:
            message = await _call_model(messages, model)
            content = message.get("content")
            if not content:
                raise RuntimeError(f"Empty content from model {model}: {message}")
            return content, model
        except Exception as e:
            if _is_auth_error(e):
                raise  # key-level failure: other models would fail the same way
            last_error = e
            logger.warning(f"OpenRouter model {model} failed: {e}")
    raise last_error
