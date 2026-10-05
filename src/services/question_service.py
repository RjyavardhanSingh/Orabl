"""Question generation service — generates and caches questions in Dragonfly."""

from __future__ import annotations

import logging

from cache.dragonfly import CacheService
from db.connection import Database
from services.openrouter_service import generate_questions as openrouter_generate

logger = logging.getLogger(__name__)


def make_question_id(context_id: str, index: int) -> str:
    """Stable, deterministic ID linking a question to its context."""
    return f"{context_id}:q{index}"


def assign_question_ids(questions: list[dict], context_id: str) -> bool:
    """Backfill missing question IDs in place. Returns True if anything changed."""
    changed = False
    for index, question in enumerate(questions):
        if isinstance(question, dict) and not question.get("id"):
            question["id"] = make_question_id(context_id, index)
            changed = True
    return changed


async def generate_questions(
    cache: CacheService,
    db: Database,
    context_id: str,
    count: int | None = None,
    user_id: str | None = None,
) -> list[dict]:
    """Generate practice questions from a cached LearningContext.

    Stores questions in Dragonfly only (no DB).
    Returns list of question dicts.
    """
    context_data = cache.get(f"context:{context_id}")
    if context_data is None:
        row = await db.fetchrow("SELECT * FROM contexts WHERE id = $1", context_id)
        if row is None:
            raise ValueError(f"Context not found: {context_id}")
        context_data = {
            "context_id": row["id"],
            "user_id": row["user_id"] if "user_id" in row.keys() else None,
            "goal": {
                "subject": row["subject"],
                "target": row["target"],
                "level": row["level"],
            },
            "stats": {
                "word_count": row["word_count"],
            },
        }
    if user_id is not None and context_data.get("user_id") != user_id:
        raise ValueError(f"Context not found: {context_id}")

    sources = context_data.get("sources", [])
    if sources:
        material_content = "\n\n".join(s.get("full_text", "") for s in sources)
    else:
        material_content = ""

    goal = context_data.get("goal", {})
    word_count = context_data.get("stats", {}).get("word_count", 0)
    keywords: list[str] = []
    for s in sources:
        keywords.extend(s.get("keywords", []) or [])
    # dedupe, keep order, cap so the hint stays small
    keywords = list(dict.fromkeys(keywords))[:50]

    questions = await openrouter_generate(
        cache, context_id, material_content, goal, word_count, count=count,
        keywords=keywords,
    )
    assign_question_ids(questions, context_id)

    cache.set(f"questions:{context_id}", questions, ttl=86400)
    return questions


async def get_questions(cache: CacheService, context_id: str) -> list[dict] | None:
    """Fetch cached questions for a context. Returns None if not found."""
    questions = cache.get(f"questions:{context_id}")
    if questions is None:
        return None
    # Backfill IDs for sets generated before IDs existed, persisting only
    # when something actually changed.
    if assign_question_ids(questions, context_id):
        cache.set(f"questions:{context_id}", questions, ttl=86400)
    return questions
