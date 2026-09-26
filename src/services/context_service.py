"""Context building service — builds context and caches in Dragonfly."""

from __future__ import annotations

from cache.dragonfly import CacheService
from context import ContextBuilder
from db.connection import Database
from models import LearningGoal


async def require_context_owner(db: Database, context_id: str, user_id: str | None) -> None:
    """Raise ValueError unless the context exists and belongs to the caller.

    Routes map ValueError to 404, so чужой contexts read as missing (no oracle).
    Skipped when user_id is None (tests, legacy paths).
    """
    if user_id is None:
        return
    row = await db.fetchrow(
        "SELECT id FROM contexts WHERE id = $1 AND user_id = $2", context_id, user_id
    )
    if row is None:
        raise ValueError(f"Context not found: {context_id}")


async def build_and_store_context(
    db: Database,
    cache: CacheService,
    material_ids: list[str],
    goal: LearningGoal,
    user_id: str | None = None,
) -> dict:
    """Build a LearningContext from materials + goal, store in DB and cache.

    Every material must belong to the caller; чужой IDs read as missing (404).
    Returns the context as a dict.
    """
    builder = ContextBuilder().with_goal(goal)

    for mid in material_ids:
        if user_id is None:
            row = await db.fetchrow("SELECT * FROM materials WHERE id = $1", mid)
        else:
            row = await db.fetchrow(
                "SELECT * FROM materials WHERE id = $1 AND user_id = $2", mid, user_id
            )
        if row is None:
            raise ValueError(f"Material not found: {mid}")

        from ingestion import extract_text
        from models import MaterialKind

        kind = MaterialKind(row["kind"])
        doc = extract_text(row["full_text"], name=row["name"], kind=kind)
        builder.add_source(doc)

    context = builder.build()

    await db.execute(
        """INSERT INTO contexts (id, user_id, subject, target, level, deadline, language,
              source_count, page_count, word_count, reading_minutes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING""",
        context.context_id,
        user_id,
        context.goal.subject,
        context.goal.target,
        context.goal.level.value,
        context.goal.deadline,
        context.goal.language,
        context.stats.source_count,
        context.stats.page_count,
        context.stats.word_count,
        context.stats.reading_minutes,
    )

    for mid in material_ids:
        await db.execute(
            """INSERT INTO context_materials (context_id, material_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING""",
            context.context_id,
            mid,
        )

    cached = context.model_dump(mode="json")
    cached["user_id"] = user_id
    cache.set(
        f"context:{context.context_id}",
        cached,
        ttl=86400,
    )

    return cached
