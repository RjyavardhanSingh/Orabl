"""Adaptive follow-ups: the scorer proposes probes, the session asks up to 3 after the main set."""

import asyncio
import json
from datetime import datetime, timezone

from services import openrouter_service, session_service
from tests.test_async_scoring import _FakeCache, _FakeDb, _question


def _follow_up(kind, text="Why?"):
    return {
        "kind": kind,
        "text": text,
        "target_concepts": ["x"],
        "reference_answer": "Because.",
        "rationale": f"Probing a {kind}.",
    }


def _session(question_count, current_index, answered):
    """A session with `answered` pending answers (jobs j0..), the learner at `current_index`."""
    return {
        "id": "s1",
        "context_id": "c1",
        "questions": [_question(i, topic=f"T{i}") for i in range(question_count)],
        "answers": [
            {
                "question_index": i,
                "question_id": f"c1:q{i}",
                "answer_text": f"answer {i}",
                "score": None,
                "status": "pending",
                "job_id": f"j{i}",
            }
            for i in range(answered)
        ],
        "scores": [{"question_index": i, "score": None} for i in range(answered)],
        "current_index": current_index,
        "status": "active",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


def _job(index, snapshot=None):
    return {
        "id": f"j{index}",
        "session_id": "s1",
        "question_index": index,
        "question_snapshot": snapshot or _question(index),
        "transcript": f"answer {index}",
        "attempts": 1,
    }


def _fake_scorer(monkeypatch, by_transcript):
    """Fake `_score_with_gemini`: (score, follow_up kind or None) keyed by transcript."""

    async def _score(question, answer_text):
        score, kind = by_transcript[answer_text]
        return {
            "score": score,
            "feedback": "ok",
            "concept_coverage": [],
            "concepts_missed": ["gap"] if kind == "gap" else [],
            "misconceptions_found": ["wrong belief"] if kind == "misconception" else [],
            "scored_by": "llm",
            "follow_up": _follow_up(kind, f"probe {answer_text}") if kind else None,
        }

    monkeypatch.setattr(session_service, "_score_with_gemini", _score)


def test_normalize_follow_up_drops_malformed_proposals():
    assert session_service._normalize_follow_up(None) is None
    assert session_service._normalize_follow_up({"kind": "quiz", "text": "Q?"}) is None
    assert session_service._normalize_follow_up({"kind": "gap", "text": "  "}) is None
    assert session_service._normalize_follow_up(
        {"kind": " Deepen ", "text": " Why? ", "target_concepts": "not a list"}
    ) == {
        "kind": "deepen",
        "text": "Why?",
        "target_concepts": [],
        "reference_answer": "",
        "rationale": "",
    }


def test_scorer_asks_for_a_follow_up_only_on_base_questions(monkeypatch):
    prompts = []

    async def _fake_openrouter(prompt):
        prompts.append(prompt)
        return json.dumps({"score": 80, "feedback": "Good", "follow_up": _follow_up("deepen")})

    monkeypatch.setattr(openrouter_service, "_call_openrouter", _fake_openrouter)
    base = _question(0)
    follow_up = {**_question(1), "follow_up": {"parent_index": 0, "kind": "gap"}}

    base_result = asyncio.run(session_service._score_with_gemini(base, "an answer"))
    follow_result = asyncio.run(session_service._score_with_gemini(follow_up, "an answer"))

    assert '"follow_up"' in prompts[0] and "FOLLOW-UP RULES" in prompts[0]
    assert '"follow_up"' not in prompts[1]
    assert base_result["follow_up"]["kind"] == "deepen"
    # Even if the model volunteers one, a follow-up never spawns another.
    assert follow_result["follow_up"] is None


def test_round_promotes_best_three_after_the_last_answer(monkeypatch):
    _fake_scorer(
        monkeypatch,
        {
            "answer 0": (85, "deepen"),
            "answer 1": (50, "gap"),
            "answer 2": (40, "misconception"),
            "answer 3": (20, "misconception"),
            "answer 4": (90, "deepen"),
        },
    )
    cache = _FakeCache(_session(question_count=5, current_index=4, answered=4))
    db = _FakeDb()
    for index in range(4):
        asyncio.run(session_service.process_score_job(cache, db, _job(index)))

    # Mid-session the proposals wait as candidates; the main set is untouched.
    assert len(cache.state["questions"]) == 5
    assert len(cache.state["follow_up_candidates"]) == 4

    # Answering the last main question opens the round from what was found so far.
    asyncio.run(session_service.submit_answer(cache, "s1", 4, "answer 4", db=db))

    follow_ups = cache.state["questions"][5:]
    assert [q["follow_up"]["parent_index"] for q in follow_ups] == [3, 2, 1]
    assert [q["follow_up"]["kind"] for q in follow_ups] == ["misconception", "misconception", "gap"]
    assert follow_ups[0]["id"] == "c1:q3:f"
    assert follow_ups[0]["topic"] == "T3"
    assert follow_ups[0]["text"] == "probe answer 3"
    assert follow_ups[0]["common_misconceptions"] == ["wrong belief"]
    assert follow_ups[2]["common_misconceptions"] == []


def test_late_proposal_reaches_a_learner_waiting_at_the_end(monkeypatch):
    _fake_scorer(monkeypatch, {"answer 1": (30, "gap")})
    cache = _FakeCache(_session(question_count=2, current_index=2, answered=2))
    cache.state["answers"][0]["status"] = "scored"

    asyncio.run(session_service.process_score_job(cache, _FakeDb(), _job(1)))

    assert len(cache.state["questions"]) == 3
    assert cache.state["questions"][2]["follow_up"]["parent_index"] == 1


def test_follow_up_answers_never_spawn_follow_ups(monkeypatch):
    _fake_scorer(monkeypatch, {"answer 1": (30, "gap")})
    state = _session(question_count=1, current_index=2, answered=0)
    state["questions"].append(
        {**_question(1), "follow_up": {"parent_index": 0, "kind": "gap", "rationale": ""}}
    )
    state["answers"] = [
        {"question_index": 1, "answer_text": "answer 1", "status": "pending", "job_id": "j1"}
    ]
    cache = _FakeCache(state)

    snapshot = state["questions"][1]
    asyncio.run(session_service.process_score_job(cache, _FakeDb(), _job(1, snapshot)))

    assert "follow_up_candidates" not in cache.state
    assert len(cache.state["questions"]) == 2


def test_complete_session_drops_unreached_follow_ups_and_closes_the_round():
    state = _session(question_count=2, current_index=2, answered=0)
    state["answers"] = [
        {"question_index": i, "question_id": f"c1:q{i}", "score": 70, "status": "scored"}
        for i in range(2)
    ]
    state["scores"] = [{"question_index": i, "score": 70} for i in range(2)]
    # Promoted after the learner had already finished: never reached.
    state["questions"].append(
        {**_question(2), "follow_up": {"parent_index": 0, "kind": "deepen", "rationale": ""}}
    )
    cache = _FakeCache(state)

    completed = asyncio.run(session_service.complete_session(cache, _FakeDb(), "s1"))

    assert completed["status"] == "completed"
    assert len(completed["questions"]) == 2
    assert completed["follow_ups_closed"] is True
