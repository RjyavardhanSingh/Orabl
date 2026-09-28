"""Pydantic request/response models — structured around the 6-step loop.

Flow: Upload → Goal → Preparing → Practice → Results → Retest
No extensions beyond this loop (no verification/auth).

Each section maps 1:1 to a user step. Shared enums stay at top.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from models.goal import GoalLevel
from models.material import MaterialKind

# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------


class MaterialResponse(BaseModel):
    """Returned after any Upload."""

    id: str
    name: str
    kind: str
    page_count: int
    word_count: int


class MaterialDownloadResponse(BaseModel):
    """Short-lived URL for downloading a stored source file."""

    url: str


# ---------------------------------------------------------------------------
# 1. Upload — add study material (PDF / text / Markdown)
# Single unified entry: POST /v1/materials handles both JSON text and multipart PDF.
# The duplicate POST /v1/materials/upload is kept as an explicit alias.
# ---------------------------------------------------------------------------


class MaterialUpload(BaseModel):
    """Upload pasted text or markdown (JSON body)."""

    content: str = Field(min_length=1, max_length=50000)
    name: str = Field(default="pasted-notes.txt", max_length=255)
    kind: MaterialKind = MaterialKind.TEXT


# ---------------------------------------------------------------------------
# 2. Goal — what the learner wants to achieve
# POST /v1/contexts
# ---------------------------------------------------------------------------


class ContextCreate(BaseModel):
    """Goal + source selection. Creates a LearningContext (cached + persisted)."""

    material_ids: list[str] = Field(min_length=1, max_length=10)
    subject: str = Field(min_length=1, max_length=100)
    target: str = Field(min_length=1, max_length=200)
    level: GoalLevel = GoalLevel.INTERMEDIATE
    deadline: date | None = None
    language: str = Field(default="en", max_length=10)


class ContextStatsResponse(BaseModel):
    source_count: int
    page_count: int
    word_count: int
    reading_minutes: int


class ContextResponse(BaseModel):
    """Goal + derived stats — the contract for Preparing."""

    id: str
    subject: str
    target: str
    stats: ContextStatsResponse


# ---------------------------------------------------------------------------
# 3. Preparing — build practice set from context
# POST /v1/contexts/{id}/questions  +  GET /v1/contexts/{id}/questions
# LLM-tested first: placeholder now, pluggable generator later.
# ---------------------------------------------------------------------------


class QuestionGenerate(BaseModel):
    count: int = Field(default=10, ge=1, le=20)


class QuestionResponse(BaseModel):
    id: str | None = None
    text: str
    topic: str | None = None
    difficulty: str | None = None
    target_concepts: list[str] = Field(default_factory=list)
    required_relationships: list[str] = Field(default_factory=list)
    acceptable_alternatives: list[str] = Field(default_factory=list)
    common_misconceptions: list[str] = Field(default_factory=list)
    # Kept on the server-side model for scoring compatibility, but never
    # serialized into an API response. This prevents answer-key leakage.
    reference_answer: str | None = Field(default=None, exclude=True)
    scoring_rubric: dict | None = Field(default=None, exclude=True)
    source_citations: list[str] = Field(default_factory=list)


class QuestionListResponse(BaseModel):
    questions: list[QuestionResponse]


# ---------------------------------------------------------------------------
# 4. Practice — session lifecycle (one question at a time)
# POST /v1/sessions  +  GET /v1/sessions/{id}  +  POST /v1/sessions/{id}/answer
# ---------------------------------------------------------------------------


class SessionCreate(BaseModel):
    context_id: str


class SessionResponse(BaseModel):
    id: str
    context_id: str
    question_count: int
    current_index: int
    status: str  # active | completed
    pending_count: int = 0  # answers still being scored in the background
    scored_count: int = 0


class AnswerSubmit(BaseModel):
    question_index: int = Field(ge=0)
    answer_text: str = Field(max_length=12000)  # ~10 min of speech
    skipped: bool = False  # PRD §9.3 — always allowed


class AnswerResponse(BaseModel):
    question_index: int
    # None while the answer is still being scored in the background.
    score: int | None = Field(default=None, ge=0, le=100)
    feedback: str
    concept_coverage: list[str] = Field(default_factory=list)
    concepts_missed: list[str] = Field(default_factory=list)
    misconceptions_found: list[str] = Field(default_factory=list)
    status: Literal["pending", "scored", "failed"] = "scored"
    question_id: str | None = None
    job_id: str | None = None
    scored_by: Literal["llm", "fallback", "skip"] | None = None


# ---------------------------------------------------------------------------
# 5. Results — readiness + weak areas (end of session)
# POST /sessions/{id}/complete  +  GET /sessions/{id}/results
# ---------------------------------------------------------------------------


class SessionCompleteResponse(BaseModel):
    id: str
    readiness_score: int = Field(ge=0, le=100)
    questions: list[dict]
    answers: list[dict]
    scores: list[dict]
    completed_at: str
    topic_summary: dict = Field(default_factory=dict)
    weak_topics: list[str] = Field(default_factory=list)
    next_review_suggestion: str | None = None


class SessionResultsResponse(BaseModel):
    """Read-only view of Results (no re-compute). Maps to PRD §10."""

    id: str
    readiness_score: int
    questions: list[dict]
    answers: list[dict]
    scores: list[dict]
    completed_at: str | None = None
    topic_summary: dict = Field(default_factory=dict)
    weak_topics: list[str] = Field(default_factory=list)
    next_review_suggestion: str | None = None
    is_saved: bool = False
    title: str | None = None


# ---------------------------------------------------------------------------
# 7. Saved sessions — bookmark completed sessions for later
# ---------------------------------------------------------------------------


class SavedSessionResponse(BaseModel):
    id: str
    title: str | None = None
    subject: str | None = None
    readiness_score: int = 0
    question_count: int = 0
    weak_count: int = 0
    completed_at: str | None = None
    saved_at: str | None = None


class SaveSessionRequest(BaseModel):
    title: str | None = Field(default=None, max_length=80)


class RenameSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)


# ---------------------------------------------------------------------------
# 6. Retest — one-tap targeted practice on weak areas
# POST /sessions/{id}/retest
# ---------------------------------------------------------------------------


class RetestCreate(BaseModel):
    weak_only: bool = True
    count: int | None = Field(default=None, ge=1, le=20)


class RetestResponse(BaseModel):
    id: str  # new session id
    parent_session_id: str
    context_id: str
    question_count: int
    status: str
    # Topics covered by this retest — only "weak" ones when weak_only=True.
    selected_topics: list[str] = Field(default_factory=list)
    previous_scores: dict[str, int] = Field(default_factory=dict)
    # Sanitized questions for the practice screen (answer keys excluded).
    questions: list[QuestionResponse] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 7. STT — realtime transcription token (ElevenLabs Scribe)
# GET /v1/stt/token — the browser uses the token directly with ElevenLabs,
# so the API key never leaves the server.
# ---------------------------------------------------------------------------


class SttTokenResponse(BaseModel):
    token: str
    expires_in: int


# ---------------------------------------------------------------------------
# 8. Auth — own Google OAuth + session tokens
# GET /v1/auth/google/url · GET /v1/auth/google/callback · POST /v1/auth/token
# GET /v1/auth/me · POST /v1/auth/logout
# ---------------------------------------------------------------------------


class MeResponse(BaseModel):
    id: str
    email: str | None = None


class GoogleUrlResponse(BaseModel):
    url: str


class TokenExchangeRequest(BaseModel):
    code: str


class TokenResponse(BaseModel):
    token: str
    user: MeResponse
