"""Preparing — build practice set from context."""

from fastapi import APIRouter, Depends, HTTPException

from api.schemas import QuestionGenerate, QuestionListResponse, QuestionResponse
from cache import CacheService, get_cache
from db.connection import Database, get_db
from services import context_service, question_service
from services.auth_service import CurrentUser, get_current_user

router = APIRouter(prefix="/contexts/{context_id}/questions", tags=["Preparing"])


@router.post("", response_model=QuestionListResponse, summary="Preparing — generate questions")
async def generate_questions(
    context_id: str,
    payload: QuestionGenerate | None = None,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Queue a bounded generation job that continues after navigation."""
    try:
        await context_service.require_context_owner(db, context_id, user.id)
        result = await question_service.enqueue_questions(
            db, context_id, count=payload.count if payload else 10
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return QuestionListResponse(
        status=result["status"], error=result["error"],
        questions=[QuestionResponse(**q) for q in result["questions"]],
    )


@router.get("", response_model=QuestionListResponse, summary="Preparing — fetch questions")
async def get_questions(
    context_id: str,
    cache: CacheService = Depends(get_cache),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Fetch the saved set or current preparation status."""
    try:
        await context_service.require_context_owner(db, context_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    result = await question_service.get_question_set(db, context_id, cache)
    if result is None:
        raise HTTPException(status_code=404, detail="Questions not found")
    return QuestionListResponse(
        status=result["status"], error=result["error"],
        questions=[QuestionResponse(**q) for q in result["questions"]],
    )
