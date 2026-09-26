"""Goal — define what learner wants to achieve."""

from fastapi import APIRouter, Depends, HTTPException

from api.schemas import ContextCreate, ContextResponse, ContextStatsResponse
from cache import CacheService, get_cache
from db.connection import Database, get_db
from models import LearningGoal
from services import context_service
from services.auth_service import CurrentUser, get_current_user

router = APIRouter(prefix="/contexts", tags=["Goal"])


@router.post(
    "", response_model=ContextResponse, summary="Goal — build context from materials + goal"
)
async def create_context(
    payload: ContextCreate,
    db: Database = Depends(get_db),
    cache: CacheService = Depends(get_cache),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 2 — Goal: turn uploads + goal into a LearningContext (DB + Dragonfly cache)."""
    goal = LearningGoal(
        subject=payload.subject,
        target=payload.target,
        level=payload.level,
        deadline=payload.deadline,
        language=payload.language,
    )
    try:
        ctx = await context_service.build_and_store_context(
            db, cache, payload.material_ids, goal, user_id=user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return ContextResponse(
        id=ctx["context_id"],
        subject=ctx["goal"]["subject"],
        target=ctx["goal"]["target"],
        stats=ContextStatsResponse(**ctx["stats"]),
    )


@router.get("/{context_id}", response_model=ContextResponse, summary="Goal — fetch context")
async def get_context(
    context_id: str,
    db: Database = Depends(get_db),
    cache: CacheService = Depends(get_cache),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 2/3 — fetch context for Preparing. Cache-first, DB fallback."""
    cached = cache.get(f"context:{context_id}")
    if cached is not None and cached.get("user_id") == user.id:
        return ContextResponse(
            id=cached["context_id"],
            subject=cached["goal"]["subject"],
            target=cached["goal"]["target"],
            stats=ContextStatsResponse(**cached["stats"]),
        )
    row = await db.fetchrow(
        "SELECT * FROM contexts WHERE id = $1 AND user_id = $2", context_id, user.id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Context not found")
    return ContextResponse(
        id=row["id"],
        subject=row["subject"],
        target=row["target"],
        stats=ContextStatsResponse(
            source_count=row["source_count"],
            page_count=row["page_count"],
            word_count=row["word_count"],
            reading_minutes=row["reading_minutes"],
        ),
    )
