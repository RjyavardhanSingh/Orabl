"""The answer key never reaches the client, and every score records which scorer produced it."""

import asyncio
import json

from api.schemas import (
    QuestionListResponse,
    QuestionResponse,
    RetestResponse,
    SessionCompleteResponse,
    SessionResultsResponse,
)
from services import openrouter_service, session_service
from tests.test_async_scoring import _FakeCache, _FakeDb, _question

ANSWER_KEY_FIELDS = (
    "reference_answer",
    "scoring_rubric",
    "target_concepts",
    "required_relationships",
    "acceptable_alternatives",
    "common_misconceptions",
)

STORED_QUESTION = {
    "id": "c1:q0",
    "text": "What do mitochondria do?",
    "topic": "Cells",
    "target_concepts": ["ATP"],
    "required_relationships": ["respiration makes ATP"],
    "acceptable_alternatives": ["energy currency"],
    "common_misconceptions": ["they make glucose"],
    "reference_answer": "They produce ATP through cellular respiration.",
    "scoring_rubric": {"excellent": "Mentions ATP and respiration"},
    "source_citations": ["Page 2"],
    "previous_attempt": {"score": 40, "concepts_missed": ["ATP"], "misconceptions_found": []},
}


def _assert_no_answer_key(payload: str) -> None:
    for field in ANSWER_KEY_FIELDS:
        assert f'"{field}"' not in payload, field
    assert "cellular respiration" not in payload


def test_every_question_payload_hides_the_answer_key():
    question = QuestionResponse(**STORED_QUESTION)
    payloads = [
        QuestionListResponse(questions=[question]),
        RetestResponse(
            id="s2",
            parent_session_id="s1",
            context_id="c1",
            question_count=1,
            status="active",
            questions=[question],
        ),
        # Results validate the raw stored dicts straight from session state.
        SessionCompleteResponse(
            id="s1",
            readiness_score=50,
            questions=[STORED_QUESTION],
            answers=[],
            scores=[],
            completed_at="2026-11-17T00:00:00+00:00",
        ),
        SessionResultsResponse(
            id="s1", readiness_score=50, questions=[STORED_QUESTION], answers=[], scores=[]
        ),
    ]
    for payload in payloads:
        _assert_no_answer_key(payload.model_dump_json())


def test_question_view_keeps_what_the_learner_needs():
    dumped = QuestionResponse(**STORED_QUESTION).model_dump()

    assert dumped["text"] == "What do mitochondria do?"
    assert dumped["source_citations"] == ["Page 2"]
    # Retests show the last attempt; it used to be dropped on the way out.
    assert dumped["previous_attempt"]["score"] == 40


def test_llm_score_records_model_and_prompt_version(monkeypatch):
    async def _fake_openrouter(prompt):
        return json.dumps({"score": 85, "feedback": "Good"}), "fake/model"

    monkeypatch.setattr(openrouter_service, "call_openrouter_with_model", _fake_openrouter)
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [_question(0)],
            "answers": [{"question_index": 0, "job_id": "j0", "status": "pending", "score": None}],
            "scores": [{"question_index": 0, "score": None}],
            "current_index": 1,
            "status": "active",
        }
    )
    job = {
        "id": "j0",
        "session_id": "s1",
        "question_index": 0,
        "question_snapshot": _question(0),
        "transcript": "Mitochondria make ATP.",
        "attempts": 1,
    }

    asyncio.run(session_service.process_score_job(cache, _FakeDb(), job))

    answer = cache.state["answers"][0]
    assert answer["score"] == 85
    assert answer["model"] == "fake/model"
    assert answer["prompt_version"] == session_service.SCORE_PROMPT_VERSION
    assert answer["scored_at"]


def test_keyword_fallback_is_labelled_as_such():
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [_question(0, ref=False)],
            "answers": [],
            "scores": [],
            "current_index": 0,
            "status": "active",
        }
    )

    record = asyncio.run(session_service.submit_answer(cache, "s1", 0, "Some answer"))

    assert record["scored_by"] == "fallback"
    assert record["model"] is None
    assert record["prompt_version"] == session_service.KEYWORD_SCORER_VERSION
