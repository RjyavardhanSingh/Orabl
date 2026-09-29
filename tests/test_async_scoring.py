"""Async scoring, question IDs, weak-area retest, and topic summaries."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from services import question_service, session_service
from services.session_service import (
    RetestWindowExpiredError,
    SessionConflictError,
)


class _FakeCache:
    def __init__(self, state=None):
        self.state = state
        self.store = {}

    def get(self, key):
        return self.state if self.state is not None else self.store.get(key)

    def set(self, key, value, ttl=None):
        self.state = value
        self.store[key] = value

    def delete(self, key):
        self.store.pop(key, None)
        self.state = None


class _FakeDb:
    def __init__(self, fetchrow_result=None, fetch_result=None):
        self.executes = []
        self.fetchrow_result = fetchrow_result
        self.fetch_result = fetch_result if fetch_result is not None else []

    async def execute(self, query, *args):
        self.executes.append((query, args))
        return "OK"

    async def fetchrow(self, query, *args):
        return self.fetchrow_result

    async def fetch(self, query, *args):
        return self.fetch_result


def _question(idx, topic="Cells", ref=True):
    q = {"id": f"c1:q{idx}", "text": f"Q{idx}?", "topic": topic}
    if ref:
        q["reference_answer"] = "Mitochondria produce ATP."
    return q


def test_assign_question_ids_backfills_missing():
    questions = [{"text": "Q0?"}, {"id": "keep", "text": "Q1?"}]

    changed = question_service.assign_question_ids(questions, "ctx9")

    assert changed is True
    assert questions[0]["id"] == "ctx9:q0"
    assert questions[1]["id"] == "keep"
    assert question_service.make_question_id("ctx9", 4) == "ctx9:q4"


def test_assign_question_ids_reports_no_change():
    questions = [{"id": "ctx9:q0", "text": "Q0?"}]

    assert question_service.assign_question_ids(questions, "ctx9") is False


def test_submit_answer_enqueues_pending_with_db():
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [_question(0)],
            "answers": [],
            "scores": [],
            "current_index": 0,
            "status": "active",
        }
    )
    db = _FakeDb()

    record = asyncio.run(session_service.submit_answer(cache, "s1", 0, "spoken transcript", db=db))

    assert record["status"] == "pending"
    assert record["score"] is None
    assert record["job_id"]
    assert record["question_id"] == "c1:q0"
    assert any("score_jobs" in sql for sql, _ in db.executes)
    # Session advanced immediately without waiting for the score.
    assert cache.state["current_index"] == 1


def test_process_score_job_acks_into_session():
    transcript = "a fairly long answer " * 10
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [_question(0, ref=False)],
            "answers": [
                {
                    "question_index": 0,
                    "question_id": "c1:q0",
                    "answer_text": transcript,
                    "score": None,
                    "status": "pending",
                    "job_id": "j1",
                }
            ],
            "scores": [{"question_index": 0, "score": None}],
            "current_index": 1,
            "status": "active",
        }
    )
    db = _FakeDb()
    job = {
        "id": "j1",
        "session_id": "s1",
        "question_index": 0,
        "question_snapshot": _question(0, ref=False),
        "transcript": transcript,
        "attempts": 1,
    }

    asyncio.run(session_service.process_score_job(cache, db, job))

    answer = cache.state["answers"][0]
    assert answer["status"] == "scored"
    assert answer["score"] == session_service._score_answer(transcript)
    assert cache.state["scores"][0]["score"] == answer["score"]
    assert any("status = 'scored'" in sql for sql, _ in db.executes)


def test_select_retest_indices_weak_only():
    answers = [
        {"question_index": 0, "score": 90},
        {"question_index": 1, "score": 45},
        {"question_index": 2, "score": 61},
        {"question_index": 3, "score": 30},
        {"question_index": 4, "score": None},
    ]

    indices = session_service.select_retest_indices(answers, 5, weak_only=True)

    assert indices == [1, 3]


def test_select_retest_indices_no_weak_raises():
    answers = [{"question_index": 0, "score": 90}]

    with pytest.raises(SessionConflictError):
        session_service.select_retest_indices(answers, 1, weak_only=True)


def test_aggregate_topic_summary():
    questions = [_question(0, topic="A"), _question(1, topic="A"), _question(2, topic="B")]
    answers = [
        {"question_index": 0, "score": 90, "concepts_missed": [], "misconceptions_found": []},
        {
            "question_index": 1,
            "score": 30,
            "concepts_missed": ["X"],
            "misconceptions_found": ["Y"],
        },
        {"question_index": 2, "score": None, "concepts_missed": [], "misconceptions_found": []},
    ]

    summary = session_service._aggregate_topic_summary(answers, questions)

    assert summary["A"]["average_score"] == 60
    assert summary["A"]["status"] == "needs_work"
    assert summary["A"]["concepts_missed"] == ["X"]
    assert "B" not in summary  # unscored answers are skipped


def test_create_retest_filters_weak_and_links_parent():
    parent = {
        "id": "p1",
        "context_id": "c1",
        "questions": [_question(0, topic="A"), _question(1, topic="B")],
        "answers": [
            {"question_index": 0, "score": 90, "concepts_missed": []},
            {"question_index": 1, "score": 40, "concepts_missed": ["X"]},
        ],
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    cache = _FakeCache(parent)
    db = _FakeDb()

    state, meta = asyncio.run(session_service.create_retest(cache, db, "p1", weak_only=True))

    assert len(state["questions"]) == 1
    assert state["questions"][0]["id"] == "c1:q1"
    assert state["parent_session_id"] == "p1"
    assert state["is_retest"] is True
    assert meta["previous_scores"] == {"c1:q1": 40}
    assert meta["selected_topics"] == ["B"]
    assert state["questions"][0]["previous_attempt"]["score"] == 40


def test_create_retest_window_expired():
    row = {
        "id": "p1",
        "context_id": "c1",
        "questions": [_question(0)],
        "answers": [{"question_index": 0, "score": 40}],
        "completed_at": datetime.now(timezone.utc) - timedelta(hours=25),
    }
    cache = _FakeCache(None)
    db = _FakeDb(fetchrow_result=row)

    with pytest.raises(RetestWindowExpiredError):
        asyncio.run(session_service.create_retest(cache, db, "p1", weak_only=True))


def test_complete_session_keeps_questions_cache():
    """Regression: completing must not evict the generated set — preparing
    reads it on back-navigation (DB row is durable, cache is the fast path)."""
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [_question(0, topic="A"), _question(1, topic="B")],
            "answers": [
                {
                    "question_index": 0,
                    "question_id": "c1:q0",
                    "answer_text": "good answer here",
                    "score": 90,
                    "status": "scored",
                },
                {
                    "question_index": 1,
                    "question_id": "c1:q1",
                    "answer_text": "weak",
                    "score": 40,
                    "status": "scored",
                },
            ],
            "scores": [
                {"question_index": 0, "score": 90},
                {"question_index": 1, "score": 40},
            ],
            "current_index": 2,
            "status": "active",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    cache.store["questions:c1"] = [_question(0, topic="A"), _question(1, topic="B")]
    db = _FakeDb()

    asyncio.run(session_service.complete_session(cache, db, "s1"))

    assert cache.store.get("questions:c1") is not None
    assert cache.store.get("session:s1") is None


def test_complete_session_persists_summary_and_mastery():
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [_question(0, topic="A"), _question(1, topic="B")],
            "answers": [
                {
                    "question_index": 0,
                    "question_id": "c1:q0",
                    "answer_text": "good answer here",
                    "score": 90,
                    "status": "scored",
                },
                {
                    "question_index": 1,
                    "question_id": "c1:q1",
                    "answer_text": "weak",
                    "score": 40,
                    "status": "scored",
                },
            ],
            "scores": [
                {"question_index": 0, "score": 90},
                {"question_index": 1, "score": 40},
            ],
            "current_index": 2,
            "status": "active",
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    db = _FakeDb()

    state = asyncio.run(session_service.complete_session(cache, db, "s1"))

    assert state["readiness_score"] == 65
    assert state["weak_topics"] == ["B"]
    assert state["topic_summary"]["A"]["status"] == "mastered"
    assert "come back" in state["next_review_suggestion"]
    assert any("topic_summary" in sql for sql, _ in db.executes)
    assert any("concept_mastery" in sql for sql, _ in db.executes)
