"""Durable question preparation with one bounded worker job per context."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from cache.dragonfly import CacheService
from db.connection import Database
from services.openrouter_service import generate_questions as openrouter_generate

logger = logging.getLogger(__name__)
GENERATION_TIMEOUT = 180


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
    """Generate a question set from the current context and its materials."""
    context_data = cache.get(f"context:{context_id}")
    if context_data is None:
        row = await db.fetchrow("SELECT * FROM contexts WHERE id = $1", context_id)
        if row is None:
            raise ValueError(f"Context not found: {context_id}")
        material_rows = await db.fetch(
            """SELECT m.name, m.kind, m.full_text FROM materials m
               JOIN context_materials cm ON cm.material_id = m.id
              WHERE cm.context_id = $1 ORDER BY m.id""",
            context_id,
        )
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
            "sources": [dict(material) for material in material_rows],
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
        cache,
        context_id,
        material_content,
        goal,
        word_count,
        count=count,
        keywords=keywords,
        use_cache=False,
    )
    assign_question_ids(questions, context_id)
    return questions


def _decode_questions(value: object) -> list[dict]:
    if isinstance(value, str):
        value = json.loads(value)
    return value if isinstance(value, list) else []


async def get_question_set(
    db: Database, context_id: str, cache: CacheService | None = None
) -> dict | None:
    row = await db.fetchrow(
        "SELECT status, questions, error FROM question_sets WHERE context_id = $1",
        context_id,
    )
    if row is None and cache is not None:
        legacy_questions = cache.get(f"questions:{context_id}")
        if isinstance(legacy_questions, list) and legacy_questions:
            assign_question_ids(legacy_questions, context_id)
            await db.execute(
                """INSERT INTO question_sets
                   (context_id, job_id, status, requested_count, questions)
                   VALUES ($1, $2, 'ready', $3, $4::jsonb)
                   ON CONFLICT (context_id) DO NOTHING""",
                context_id,
                uuid.uuid4().hex,
                len(legacy_questions),
                json.dumps(legacy_questions),
            )
            row = await db.fetchrow(
                "SELECT status, questions, error FROM question_sets WHERE context_id = $1",
                context_id,
            )
    if row is None:
        return None
    return {
        "status": row["status"],
        "questions": _decode_questions(row["questions"]),
        "error": row["error"],
    }


async def enqueue_questions(db: Database, context_id: str, count: int) -> dict:
    """Atomically queue a set; repeated clicks share an existing active job."""
    job_id = uuid.uuid4().hex
    row = await db.fetchrow(
        """INSERT INTO question_sets (context_id, job_id, status, requested_count)
           VALUES ($1, $2, 'pending', $3)
           ON CONFLICT (context_id) DO UPDATE SET
             job_id = EXCLUDED.job_id, status = 'pending',
             requested_count = EXCLUDED.requested_count,
             questions = NULL, error = NULL, updated_at = NOW()
           WHERE question_sets.status IN ('ready', 'failed')
           RETURNING status, questions, error""",
        context_id,
        job_id,
        count,
    )
    return (
        {"status": "pending", "questions": [], "error": None}
        if row
        else (await get_question_set(db, context_id))
    )


async def get_questions(
    db: Database, context_id: str, cache: CacheService | None = None
) -> list[dict] | None:
    result = await get_question_set(db, context_id, cache)
    return result["questions"] if result and result["status"] == "ready" else None


async def claim_question_job(db: Database) -> dict | None:
    row = await db.fetchrow(
        """WITH next_job AS (
             SELECT context_id FROM question_sets WHERE status = 'pending'
             ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1
           )
           UPDATE question_sets q SET status = 'running', updated_at = NOW()
           FROM next_job WHERE q.context_id = next_job.context_id
           RETURNING q.context_id, q.job_id, q.requested_count"""
    )
    return dict(row) if row else None


async def process_question_job(cache: CacheService, db: Database, job: dict) -> None:
    context_id, job_id = job["context_id"], job["job_id"]
    try:
        questions = await asyncio.wait_for(
            generate_questions(cache, db, context_id, job["requested_count"]),
            timeout=GENERATION_TIMEOUT,
        )
        await db.execute(
            """UPDATE question_sets SET status = 'ready', questions = $3::jsonb,
                  error = NULL, updated_at = NOW()
               WHERE context_id = $1 AND job_id = $2 AND status = 'running'""",
            context_id,
            job_id,
            json.dumps(questions),
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Question generation failed for context %s", context_id)
        message = (
            "Question generation timed out. Please try again."
            if isinstance(exc, TimeoutError)
            else str(exc)
        )
        await db.execute(
            """UPDATE question_sets SET status = 'failed', error = $3,
                  updated_at = NOW() WHERE context_id = $1 AND job_id = $2
                  AND status = 'running'""",
            context_id,
            job_id,
            message[:500],
        )


async def question_worker_loop(stop_event: asyncio.Event) -> None:
    """Process durable jobs; recover an abandoned job after its timeout window."""
    from cache.dragonfly import get_cache

    db = Database()
    cache = get_cache()
    while not stop_event.is_set():
        try:
            await db.execute(
                """UPDATE question_sets SET status = 'pending', updated_at = NOW()
                   WHERE status = 'running' AND updated_at < NOW() - INTERVAL '4 minutes'"""
            )
            job = await claim_question_job(db)
            if job:
                await process_question_job(cache, db, job)
                continue
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Question worker error")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=3)
        except TimeoutError:
            pass
