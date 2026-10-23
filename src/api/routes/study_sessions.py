"""Durable study workflow, created before the first material is uploaded."""

import json
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from cache import CacheService, get_cache
from db.connection import Database, get_db
from services.auth_service import CurrentUser, get_current_user

router = APIRouter(prefix="/study-sessions", tags=["Study sessions"])


class UploadDraft(BaseModel):
    name: str = Field(default="pasted-notes.txt", max_length=255)
    content: str = Field(default="", max_length=50000)
    kind: Literal["text", "markdown"] = "text"


class StudySessionPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    material_ids: list[str] | None = Field(default=None, max_length=10)
    upload_draft: UploadDraft | None = None
    goal_draft: dict | None = None
    context_id: str | None = None
    practice_id: str | None = None


def _response(row) -> dict:
    result = dict(row)
    for field in ("material_ids", "upload_draft", "goal_draft"):
        if isinstance(result.get(field), str):
            result[field] = json.loads(result[field])
    return result


@router.post("", status_code=201)
async def create_study_session(
    db: Database = Depends(get_db), user: CurrentUser = Depends(get_current_user)
):
    session_id = uuid.uuid4().hex[:16]
    row = await db.fetchrow(
        """INSERT INTO study_sessions (id, user_id) VALUES ($1, $2)
           RETURNING id, title, material_ids, upload_draft, goal_draft, context_id, practice_id,
                     practice_state->>'status' AS practice_status, created_at, updated_at""",
        session_id,
        user.id,
    )
    return _response(row)


@router.get("")
async def list_study_sessions(
    db: Database = Depends(get_db), user: CurrentUser = Depends(get_current_user)
):
    rows = await db.fetch(
        """SELECT id, title, jsonb_array_length(material_ids) AS material_count,
           context_id, practice_id, practice_state->>'status' AS practice_status,
           created_at, updated_at
           FROM study_sessions WHERE user_id = $1 ORDER BY updated_at DESC""",
        user.id,
    )
    return [_response(row) for row in rows]


@router.get("/{session_id}")
async def get_study_session(
    session_id: str, db: Database = Depends(get_db), user: CurrentUser = Depends(get_current_user)
):
    row = await db.fetchrow(
        """SELECT id, title, material_ids, upload_draft, goal_draft, context_id, practice_id,
                  practice_state->>'status' AS practice_status, created_at, updated_at
           FROM study_sessions WHERE id = $1 AND user_id = $2""",
        session_id,
        user.id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Study session not found")
    return _response(row)


@router.patch("/{session_id}")
async def update_study_session(
    session_id: str,
    body: StudySessionPatch,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
    cache: CacheService = Depends(get_cache),
):
    current = await get_study_session(session_id, db, user)
    changes = body.model_fields_set
    material_ids = body.material_ids if "material_ids" in changes else current["material_ids"]
    upload_draft = (
        body.upload_draft.model_dump()
        if "upload_draft" in changes and body.upload_draft
        else current["upload_draft"]
    )
    goal_draft = body.goal_draft if "goal_draft" in changes else current["goal_draft"]
    if material_ids and "material_ids" in changes:
        count = await db.fetchrow(
            "SELECT COUNT(*) AS total FROM materials WHERE id = ANY($1::text[]) AND user_id = $2",
            material_ids,
            user.id,
        )
        if count["total"] != len(set(material_ids)):
            raise HTTPException(status_code=422, detail="One or more materials are unavailable")
    context_id = body.context_id if "context_id" in changes else current["context_id"]
    if context_id and "context_id" in changes:
        owner = await db.fetchrow(
            "SELECT id FROM contexts WHERE id = $1 AND user_id = $2", context_id, user.id
        )
        if owner is None:
            raise HTTPException(status_code=422, detail="Context is unavailable")
    practice_id = body.practice_id if "practice_id" in changes else current["practice_id"]
    practice_state = None
    if practice_id and "practice_id" in changes:
        practice_state = cache.get(f"session:{practice_id}")
        if practice_state is None or practice_state.get("user_id") != user.id:
            raise HTTPException(status_code=422, detail="Practice session is unavailable")
    row = await db.fetchrow(
        """UPDATE study_sessions SET title = $3, material_ids = $4::jsonb,
           upload_draft = $5::jsonb, goal_draft = $6::jsonb, context_id = $7, practice_id = $8,
           practice_state = CASE WHEN $10::boolean THEN $9::jsonb ELSE practice_state END,
           updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING id, title, material_ids, upload_draft, goal_draft, context_id, practice_id,
                     practice_state->>'status' AS practice_status, created_at, updated_at""",
        session_id,
        user.id,
        body.title if "title" in changes else current["title"],
        json.dumps(material_ids),
        json.dumps(upload_draft),
        json.dumps(goal_draft),
        context_id,
        practice_id,
        json.dumps(practice_state) if practice_state is not None else None,
        "practice_id" in changes,
    )
    return _response(row)
