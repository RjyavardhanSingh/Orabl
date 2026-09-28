"""Practice → Results → Retest — session lifecycle."""

from fastapi import APIRouter, Depends, HTTPException

from api.schemas import (
    AnswerResponse,
    AnswerSubmit,
    QuestionResponse,
    RenameSessionRequest,
    RetestCreate,
    RetestResponse,
    SavedSessionResponse,
    SaveSessionRequest,
    SessionCompleteResponse,
    SessionCreate,
    SessionResponse,
    SessionResultsResponse,
)
from cache import CacheService, get_cache
from db.connection import Database, get_db
from services import context_service, question_service, session_service
from services.auth_service import CurrentUser, get_current_user
from services.session_service import (
    InvalidAnswerError,
    RetestWindowExpiredError,
    SessionConflictError,
    SessionNotFoundError,
)

router = APIRouter(prefix="/sessions")


def _progress(state: dict) -> tuple[int, int]:
    """Count (pending, scored) answers for background-scoring visibility."""
    answers = state.get("answers", [])
    pending = sum(1 for a in answers if a.get("status") == "pending")
    scored = sum(1 for a in answers if a.get("status") == "scored")
    return pending, scored


@router.post(
    "", response_model=SessionResponse, tags=["Practice"], summary="Practice — start session"
)
async def create_session(
    payload: SessionCreate,
    cache: CacheService = Depends(get_cache),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 4 — Practice: start session from prepared questions (Dragonfly)."""
    try:
        await context_service.require_context_owner(db, payload.context_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    questions = await question_service.get_questions(cache, payload.context_id)
    if questions is None:
        raise HTTPException(status_code=404, detail="Generate questions first")

    state = await session_service.create_session(
        cache, payload.context_id, questions, user_id=user.id
    )
    pending, scored = _progress(state)
    return SessionResponse(
        id=state["id"],
        context_id=state["context_id"],
        question_count=len(state["questions"]),
        current_index=state["current_index"],
        status=state["status"],
        pending_count=pending,
        scored_count=scored,
    )


@router.get(
    "/saved",
    response_model=list[SavedSessionResponse],
    tags=["Saved"],
    summary="Saved — list bookmarked sessions",
)
async def list_saved(
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Newest-first saved sessions. NOTE: registered before /{session_id}
    so 'saved' is never captured as an id."""
    rows = await session_service.list_saved_sessions(db, user.id)
    return [SavedSessionResponse(**row) for row in rows]


@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    tags=["Practice"],
    summary="Practice — get session",
)
async def get_session(
    session_id: str,
    cache: CacheService = Depends(get_cache),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 4 — Practice: get current session state."""
    state = await session_service.get_session(cache, session_id, user_id=user.id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found")
    pending, scored = _progress(state)
    return SessionResponse(
        id=state["id"],
        context_id=state["context_id"],
        question_count=len(state["questions"]),
        current_index=state["current_index"],
        status=state["status"],
        pending_count=pending,
        scored_count=scored,
    )


@router.post(
    "/{session_id}/answer",
    response_model=AnswerResponse,
    tags=["Practice"],
    summary="Practice — submit answer",
)
async def submit_answer(
    session_id: str,
    payload: AnswerSubmit,
    cache: CacheService = Depends(get_cache),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 4 — Practice: submit answer (supports skipped=true per PRD §9.3).

    Scoring runs in the background; the response returns immediately with
    status pending, and the score arrives via GET session polling.
    """
    try:
        record = await session_service.submit_answer(
            cache,
            session_id,
            payload.question_index,
            payload.answer_text,
            skipped=payload.skipped,
            db=db,
            user_id=user.id,
        )
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SessionConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except InvalidAnswerError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return AnswerResponse(**record)


@router.post(
    "/{session_id}/complete",
    response_model=SessionCompleteResponse,
    tags=["Results"],
    summary="Results — complete session",
)
async def complete_session(
    session_id: str,
    cache: CacheService = Depends(get_cache),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 5 — Results: compute readiness, persist to DB, clear cache."""
    try:
        state = await session_service.complete_session(cache, db, session_id, user_id=user.id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SessionConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return SessionCompleteResponse(
        id=state["id"],
        readiness_score=state["readiness_score"],
        questions=state["questions"],
        answers=state["answers"],
        scores=state["scores"],
        completed_at=state["completed_at"],
        topic_summary=state.get("topic_summary", {}),
        weak_topics=state.get("weak_topics", []),
        next_review_suggestion=state.get("next_review_suggestion"),
    )


@router.get(
    "/{session_id}/results",
    response_model=SessionResultsResponse,
    tags=["Results"],
    summary="Results — fetch results",
)
async def get_results(
    session_id: str,
    cache: CacheService = Depends(get_cache),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 5 — Results: read-only fetch (cache → DB fallback)."""
    # cache first (active or just-completed still cached briefly)
    state = await session_service.get_session(cache, session_id, user_id=user.id)
    if state is not None and state.get("status") == "completed":
        return SessionResultsResponse(
            id=state["id"],
            readiness_score=state["readiness_score"],
            questions=state["questions"],
            answers=state["answers"],
            scores=state["scores"],
            completed_at=state.get("completed_at"),
            topic_summary=state.get("topic_summary", {}),
            weak_topics=state.get("weak_topics", []),
            next_review_suggestion=state.get("next_review_suggestion"),
        )
    # DB fallback
    row = await db.fetchrow(
        "SELECT * FROM sessions WHERE id = $1 AND user_id = $2", session_id, user.id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Results not found")
    import json as _json

    def _load(v, default):
        if v is None:
            return default
        return _json.loads(v) if isinstance(v, str) else v

    record = dict(row)
    return SessionResultsResponse(
        id=record["id"],
        readiness_score=record["readiness_score"] or 0,
        questions=_load(record["questions"], []),
        answers=_load(record["answers"], []),
        scores=_load(record["scores"], []),
        completed_at=str(record["completed_at"]) if record["completed_at"] else None,
        topic_summary=_load(record.get("topic_summary"), {}),
        weak_topics=_load(record.get("weak_topics"), []),
        next_review_suggestion=None,
        is_saved=bool(record.get("is_saved", False)),
        title=record.get("title"),
    )


@router.post(
    "/{session_id}/save",
    response_model=SavedSessionResponse,
    tags=["Saved"],
    summary="Saved — bookmark a completed session",
)
async def save_session(
    session_id: str,
    body: SaveSessionRequest,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Bookmark a completed session (optionally titled). Only completed rows
    can be saved; чужой/missing/active rows read as 404."""
    try:
        record = await session_service.save_session(db, session_id, user.id, body.title)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail="Session not found") from e
    saved = await session_service.list_saved_sessions(db, user.id)
    match = next((row for row in saved if row["id"] == session_id), {**record})
    return SavedSessionResponse(**match)


@router.delete(
    "/{session_id}/save",
    tags=["Saved"],
    summary="Saved — remove bookmark (row kept)",
)
async def unsave_session(
    session_id: str,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    try:
        await session_service.unsave_session(db, session_id, user.id)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail="Session not found") from e
    return {"ok": True}


@router.patch(
    "/{session_id}/title",
    tags=["Saved"],
    summary="Saved — rename a bookmarked session",
)
async def rename_session(
    session_id: str,
    body: RenameSessionRequest,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    try:
        record = await session_service.rename_session(db, session_id, user.id, body.title)
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail="Session not found") from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return record


@router.post(
    "/{session_id}/retest",
    response_model=RetestResponse,
    tags=["Retest"],
    summary="Retest — new session from weak areas",
)
async def create_retest(
    session_id: str,
    payload: RetestCreate,
    cache: CacheService = Depends(get_cache),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 6 — Retest: targeted practice on weak areas (score <= 60).

    Defaults to weak-only questions. Pass weak_only=false for a full
    confidence retest. Retests are allowed within 24h of completion —
    otherwise start a fresh session.
    """
    try:
        state, meta = await session_service.create_retest(
            cache,
            db,
            session_id,
            weak_only=payload.weak_only,
            count=payload.count,
            user_id=user.id,
        )
    except SessionNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except SessionConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except RetestWindowExpiredError as e:
        raise HTTPException(status_code=410, detail=str(e)) from e
    return RetestResponse(
        id=state["id"],
        parent_session_id=session_id,
        context_id=state["context_id"],
        question_count=len(state["questions"]),
        status=state["status"],
        selected_topics=meta.get("selected_topics", []),
        previous_scores=meta.get("previous_scores", {}),
        questions=[QuestionResponse(**q) for q in state["questions"]],
    )
