"""OpenRouter service for question generation."""

from __future__ import annotations

import asyncio
import json
import logging
import os

import httpx

from cache.dragonfly import CacheService

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


def calculate_question_count(word_count: int) -> int:
    """Dynamic question count based on content length."""
    if word_count < 2000:
        return 5
    elif word_count < 10000:
        return 10
    elif word_count < 50000:
        return 15
    else:
        return 20


def _truncate_content(content: str, max_chars: int = 3000000) -> str:
    """Truncate content to stay within token limits.

    Rough estimate: 1 token ≈ 4 chars for English text.
    800K tokens ≈ 3.2M chars. We use 3M chars to be safe.
    """
    if len(content) <= max_chars:
        return content
    logger.warning(f"Truncating material content from {len(content)} to {max_chars} chars")
    return content[:max_chars]


def _build_prompt(material_content: str, goal: dict, count: int, keywords: list[str] | None = None) -> str:
    """Build prompt for enriched question + rubric generation."""
    subject = goal.get("subject", "general")
    target = goal.get("target", "general understanding")
    level = goal.get("level", "intermediate")

    prompt = (
        "You are a learning assistant. Generate practice questions "
        "based on the following material and learning goal.\n\n"
        f"MATERIAL:\n{material_content}\n\n"
    )
    if keywords:
        prompt += f"KEY TERMS (focus questions on these):\n{', '.join(keywords[:50])}\n\n"
    prompt += (
        f"LEARNING GOAL:\n"
        f"- Subject: {subject}\n"
        f"- Target: {target}\n"
        f"- Level: {level}\n\n"
        f"Generate {count} questions that:\n"
        "1. Are directly about the material content (no unrelated questions)\n"
        "2. Test understanding, not just memorization\n"
        "3. Match the difficulty to the learner's level\n"
        "4. Cover different topics from the material\n\n"
        "For EACH question, return a JSON object with these fields:\n"
        '- "text": the question text\n'
        '- "topic": the topic/category\n'
        '- "target_concepts": list of key concepts the answer must cover\n'
        '- "required_relationships": list of causal/logical relationships the answer must express\n'
        '- "acceptable_alternatives": list of alternative phrasings that are also correct\n'
        '- "common_misconceptions": list of typical wrong beliefs about this topic\n'
        '- "reference_answer": a concise, perfect answer based strictly on the material\n'
        '- "scoring_rubric": object with "excellent", "good", "needs_work" criteria\n'
        '- "source_citations": list of page/section references from the material\n\n'
        "Return ONLY a JSON array, no other text:\n"
        '[{"text": "...", "topic": "...", "target_concepts": ["..."], '
        '"required_relationships": ["..."], "acceptable_alternatives": ["..."], '
        '"common_misconceptions": ["..."], "reference_answer": "...", '
        '"scoring_rubric": {"excellent": "...", "good": "...", "needs_work": "..."}, '
        '"source_citations": ["..."]}]'
    )
    return prompt


def _normalize_questions(raw: object) -> list[dict]:
    """Coerce the model's JSON into a uniform question list.

    Guarantees every item has all required fields so downstream
    scoring never breaks on a missing field. Raises ValueError when
    the payload is unusable (triggers a retry).
    """
    if not isinstance(raw, list) or not raw:
        raise ValueError("Response is not a non-empty list")
    questions = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or not str(item.get("text", "")).strip():
            raise ValueError(f"Question at index {i} has no text")
        questions.append(
            {
                "text": str(item["text"]).strip(),
                "topic": str(item.get("topic", "") or "").strip(),
                "target_concepts": _ensure_list(item.get("target_concepts")),
                "required_relationships": _ensure_list(item.get("required_relationships")),
                "acceptable_alternatives": _ensure_list(item.get("acceptable_alternatives")),
                "common_misconceptions": _ensure_list(item.get("common_misconceptions")),
                "reference_answer": str(item.get("reference_answer", "") or "").strip(),
                "scoring_rubric": _ensure_rubric(item.get("scoring_rubric")),
                "source_citations": _ensure_list(item.get("source_citations")),
            }
        )
    missing = sum(1 for q in questions if not q["reference_answer"])
    if missing:
        logger.warning(f"{missing}/{len(questions)} questions came back without a reference answer")
    return questions


def _ensure_list(value: object) -> list[str]:
    """Coerce a value to a list of strings."""
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


def _ensure_rubric(value: object) -> dict:
    """Coerce a value to a scoring rubric dict with required keys."""
    defaults = {"excellent": "", "good": "", "needs_work": ""}
    if isinstance(value, dict):
        return {
            "excellent": str(value.get("excellent", "") or "").strip(),
            "good": str(value.get("good", "") or "").strip(),
            "needs_work": str(value.get("needs_work", "") or "").strip(),
        }
    return defaults


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
    """Call OpenRouter with model fallback.

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
            return content
        except Exception as e:
            if _is_auth_error(e):
                raise  # key-level failure: other models would fail the same way
            last_error = e
            logger.warning(f"OpenRouter model {model} failed: {e}")
    raise last_error


async def continue_with_reasoning(
    messages: list[dict],
    follow_up: str,
    model: str | None = None,
) -> str:
    """Continue a reasoning-enabled conversation.

    `messages` must contain the previous assistant message unmodified,
    including its `reasoning_details` field, e.g.:

        messages = [
            {"role": "user", "content": original_prompt},
            {"role": "assistant", "content": msg.get("content"),
             "reasoning_details": msg.get("reasoning_details")},
            {"role": "user", "content": follow_up},
        ]
    """
    target_model = model or (MODELS[0] if MODELS else DEFAULT_MODEL)
    continued = [*messages, {"role": "user", "content": follow_up}]
    message = await _call_model(continued, target_model)
    content = message.get("content")
    if not content:
        raise RuntimeError(f"Empty content from model {target_model}")
    return content


async def generate_questions(
    cache: CacheService,
    context_id: str,
    material_content: str,
    goal: dict,
    word_count: int,
    count: int | None = None,
    keywords: list[str] | None = None,
) -> list[dict]:
    """Generate questions using OpenRouter with retry logic.

    Checks response cache first to avoid re-generation.
    """
    requested_count = count or calculate_question_count(word_count)
    cache_key = f"openrouter_response:{context_id}:{requested_count}"
    # Back-compat: fall back to the old Gemini cache key if present.
    cached = cache.get(cache_key) or cache.get(f"gemini_response:{context_id}")
    if cached is not None:
        logger.info(f"OpenRouter cache hit for context {context_id}")
        return cached

    truncated_content = _truncate_content(material_content)
    prompt = _build_prompt(truncated_content, goal, requested_count, keywords)

    last_error = None
    for delay in RETRY_DELAYS:
        try:
            response_text = await _call_openrouter(prompt)
            # Strip markdown code fences if present
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
            if cleaned.endswith("```"):
                cleaned = cleaned.rsplit("```", 1)[0]
            cleaned = cleaned.strip()

            questions = _normalize_questions(json.loads(cleaned))

            cache.set(cache_key, questions, ttl=86400)
            return questions

        except Exception as e:
            if _is_auth_error(e):
                logger.error(f"OpenRouter auth failed: {e}")
                raise
            last_error = e
            logger.warning(f"OpenRouter call failed: {e}, retrying in {delay}s")
            await asyncio.sleep(delay)

    logger.error(f"OpenRouter failed after all retries: {last_error}")
    # Preserve actionable provider errors (rate limits) instead of burying
    # them under the generic message — the route forwards detail to the UI.
    if last_error is not None and _status_code(last_error) == 429:
        raise RuntimeError(
            "OpenRouter is still rate-limiting this key (429). "
            "Wait a minute and retry, or set OPENROUTER_MODEL to a paid model."
        ) from last_error
    raise RuntimeError("Something went wrong, try again")
