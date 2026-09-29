import pytest

from api.schemas import QuestionResponse
from services import openrouter_service as ors
from services import session_service


def test_unauthorized_message_flags_management_keys():
    payload = {"data": {"is_management_key": True, "is_provisioning_key": True}}

    message = ors._unauthorized_message(payload)

    assert "management key" in message
    assert "https://openrouter.ai/keys" in message


def test_unauthorized_message_for_rejected_inference_key():
    message = ors._unauthorized_message(None)

    assert "401 Unauthorized" in message
    assert "https://openrouter.ai/keys" in message


def test_prompt_requests_reference_answer():
    prompt = ors._build_prompt("some material", {"subject": "bio"}, 5)

    assert "reference_answer" in prompt


def test_prompt_requests_enriched_fields():
    prompt = ors._build_prompt("some material", {"subject": "bio"}, 5)

    assert '"target_concepts"' in prompt
    assert '"required_relationships"' in prompt
    assert '"acceptable_alternatives"' in prompt
    assert '"common_misconceptions"' in prompt
    assert '"scoring_rubric"' in prompt
    assert '"source_citations"' in prompt


def test_normalize_questions_ok():
    raw = [
        {
            "text": " What is X? ",
            "topic": " Basics ",
            "reference_answer": " X is Y. ",
            "target_concepts": ["X", "Y"],
            "required_relationships": ["X leads to Y"],
            "acceptable_alternatives": ["X causes Y"],
            "common_misconceptions": ["Z is X"],
            "scoring_rubric": {
                "excellent": "Explains X and Y relationship",
                "good": "Mentions X",
                "needs_work": "Does not mention X",
            },
            "source_citations": ["Page 1"],
        }
    ]

    result = ors._normalize_questions(raw)
    assert result[0]["text"] == "What is X?"
    assert result[0]["topic"] == "Basics"
    assert result[0]["reference_answer"] == "X is Y."
    assert result[0]["target_concepts"] == ["X", "Y"]
    assert result[0]["required_relationships"] == ["X leads to Y"]
    assert result[0]["acceptable_alternatives"] == ["X causes Y"]
    assert result[0]["common_misconceptions"] == ["Z is X"]
    assert result[0]["scoring_rubric"]["excellent"] == "Explains X and Y relationship"
    assert result[0]["source_citations"] == ["Page 1"]


def test_normalize_questions_minimal():
    raw = [{"text": "Q?", "topic": "T"}]
    result = ors._normalize_questions(raw)
    assert result[0]["reference_answer"] == ""
    assert result[0]["target_concepts"] == []
    assert result[0]["scoring_rubric"] == {"excellent": "", "good": "", "needs_work": ""}


@pytest.mark.parametrize("raw", [[], {}, "nope", [{"topic": "no text"}], [{"text": "   "}]])
def test_normalize_questions_rejects_unusable(raw):
    with pytest.raises(ValueError):
        ors._normalize_questions(raw)


def test_score_perfect_answer_is_100():
    ref = "Photosynthesis converts carbon dioxide and water into glucose using sunlight."

    assert session_service._score_against_reference(ref, ref) == 100


def test_score_empty_answer_is_0():
    assert session_service._score_against_reference("Mitochondria produce energy.", "  ") == 0


def test_score_partial_beats_irrelevant():
    ref = "Mitochondria produce ATP through cellular respiration using oxygen and glucose."
    partial = "Mitochondria make ATP using glucose."
    irrelevant = "The capital city has many beautiful museums and parks."

    assert session_service._score_against_reference(
        ref, partial
    ) > session_service._score_against_reference(ref, irrelevant)


def test_question_response_carries_enriched_fields():
    q = QuestionResponse(
        text="Q?",
        topic="T",
        reference_answer="A.",
        target_concepts=["X", "Y"],
        required_relationships=["X leads to Y"],
        acceptable_alternatives=["X causes Y"],
        common_misconceptions=["Z is X"],
        scoring_rubric={"excellent": "Full", "good": "Partial", "needs_work": "None"},
        source_citations=["Page 1"],
    )

    assert q.reference_answer == "A."
    assert q.target_concepts == ["X", "Y"]
    assert q.required_relationships == ["X leads to Y"]
    assert q.acceptable_alternatives == ["X causes Y"]
    assert q.common_misconceptions == ["Z is X"]
    assert q.scoring_rubric["excellent"] == "Full"
    assert q.source_citations == ["Page 1"]


class _FakeCache:
    def __init__(self, state):
        self.state = state

    def get(self, key):
        return self.state

    def set(self, key, value, ttl=None):
        self.state = value


def _scored_question():
    return {
        "text": "What do mitochondria produce?",
        "topic": "Cells",
        "reference_answer": "Mitochondria produce ATP through cellular respiration.",
        "target_concepts": ["mitochondria", "ATP", "cellular respiration"],
        "required_relationships": ["mitochondria produce ATP"],
        "acceptable_alternatives": ["Mitochondria generate energy"],
        "common_misconceptions": ["Mitochondria produce glucose"],
        "scoring_rubric": {
            "excellent": "Mentions ATP and cellular respiration",
            "good": "Mentions ATP",
            "needs_work": "Does not mention ATP",
        },
        "source_citations": ["Page 5"],
    }


def _active_state(question):
    return {
        "id": "s1",
        "context_id": "c1",
        "questions": [question],
        "answers": [],
        "scores": [],
        "current_index": 0,
        "status": "active",
    }


def test_submit_answer_fallback_scoring_is_deterministic(monkeypatch):
    import asyncio

    async def _broken_llm(question, answer_text):
        raise RuntimeError("LLM unavailable")

    monkeypatch.setattr(session_service, "_score_with_gemini", _broken_llm)
    cache = _FakeCache(_active_state(_scored_question()))
    answer = "Mitochondria produce ATP through cellular respiration."

    record = asyncio.run(session_service.submit_answer(cache, "s1", 0, answer))

    expected = session_service._score_against_reference(
        _scored_question()["reference_answer"], answer
    )
    assert record["score"] == expected == 100
    assert record["feedback"] == "Good"
    assert record["scored_by"] == "fallback"


def test_submit_answer_llm_path_returns_rich_feedback(monkeypatch):
    import asyncio

    async def _fake_llm(question, answer_text):
        return {
            "score": 85,
            "feedback": "Strong answer, missing one detail.",
            "concept_coverage": ["mitochondria", "ATP"],
            "concepts_missed": ["cellular respiration"],
            "misconceptions_found": [],
            "scored_by": "llm",
        }

    monkeypatch.setattr(session_service, "_score_with_gemini", _fake_llm)
    cache = _FakeCache(_active_state(_scored_question()))

    record = asyncio.run(session_service.submit_answer(cache, "s1", 0, "Partial answer."))

    assert record["score"] == 85
    assert record["feedback"] == "Strong answer, missing one detail."
    assert record["concept_coverage"] == ["mitochondria", "ATP"]
    assert record["concepts_missed"] == ["cellular respiration"]
    assert record["misconceptions_found"] == []
    assert record["scored_by"] == "llm"


def test_submit_answer_falls_back_without_reference():
    import asyncio

    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "questions": [{"text": "Q?", "topic": "T"}],
            "answers": [],
            "scores": [],
            "current_index": 0,
            "status": "active",
        }
    )

    record = asyncio.run(
        session_service.submit_answer(cache, "s1", 0, "a fairly long answer " * 10)
    )

    assert record["score"] == session_service._score_answer("a fairly long answer " * 10)
