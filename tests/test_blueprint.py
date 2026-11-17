"""Exam blueprint: validation of model output, prerequisite ordering, grounding, persistence."""

import asyncio
import json

import pytest

from api.schemas import QuestionResponse
from examiner import blueprint

MATERIAL = (
    "An index is a data structure that speeds up lookups on a column. "
    "A composite index covers several columns, and a query can use it only from the left: "
    "the left-prefix rule. Every index also slows down writes."
)


def _concept(key, prerequisites=(), **overrides):
    concept = {
        "key": key,
        "name": key.replace("-", " ").title(),
        "summary": f"About {key}.",
        "prerequisites": list(prerequisites),
        "importance": 2,
        "question": f"Explain {key}.",
        "reference_answer": f"{key} is explained.",
        "must_include": [f"{key} point"],
        "common_misconceptions": [],
        "source_quote": "",
    }
    concept.update(overrides)
    return concept


def test_orders_prerequisites_first_and_keeps_known_edges():
    raw = {
        "concepts": [
            _concept("left-prefix", ["composite-index", "not-in-list"]),
            _concept("composite-index", ["index-basics"]),
            _concept("index-basics"),
        ]
    }

    concepts = blueprint.normalize_blueprint(raw, MATERIAL)

    assert [c["key"] for c in concepts] == ["index-basics", "composite-index", "left-prefix"]
    assert concepts[2]["prerequisites"] == ["composite-index"]


def test_breaks_prerequisite_cycles():
    raw = {"concepts": [_concept("a", ["b"]), _concept("b", ["c"]), _concept("c", ["a"])]}

    concepts = blueprint.normalize_blueprint(raw, MATERIAL)

    edges = {c["key"]: c["prerequisites"] for c in concepts}
    assert edges == {"a": ["b"], "b": ["c"], "c": []}
    assert [c["key"] for c in concepts] == ["c", "b", "a"]


def test_drops_unusable_and_duplicate_concepts_and_normalises_fields():
    raw = {
        "concepts": [
            _concept("index-basics", importance="9"),
            _concept("index-basics"),  # duplicate key
            _concept("no-answer", reference_answer=" "),
            _concept("no-question", question=""),
            "not a dict",
            _concept("", name="Write Cost!", importance="high"),
        ]
    }

    concepts = blueprint.normalize_blueprint(raw, MATERIAL)

    assert [c["key"] for c in concepts] == ["index-basics", "write-cost"]
    assert concepts[0]["importance"] == 3
    assert concepts[1]["importance"] == 2


def test_rejects_replies_with_too_few_concepts():
    for raw in ({"concepts": [_concept("only-one")]}, {"nope": []}, "text", []):
        with pytest.raises(ValueError):
            blueprint.normalize_blueprint(raw, MATERIAL)


def test_keeps_only_quotes_that_occur_in_the_material():
    raw = {
        "concepts": [
            _concept(
                "left-prefix",
                source_quote="a query can use it only from the LEFT:\n the left-prefix rule",
            ),
            _concept("write-cost", source_quote="Indexes make writes faster."),
        ]
    }

    concepts = {c["key"]: c for c in blueprint.normalize_blueprint(raw, MATERIAL)}

    assert concepts["left-prefix"]["source_quote"].startswith("a query can use it")
    assert concepts["write-cost"]["source_quote"] == ""


def test_seed_questions_fit_the_scorer_and_hide_the_answer_key():
    concepts = blueprint.normalize_blueprint(
        {
            "concepts": [
                _concept("index-basics", source_quote="Every index also slows down writes."),
                _concept("composite-index", ["index-basics"]),
            ]
        },
        MATERIAL,
    )

    questions = blueprint.blueprint_questions(concepts)

    assert questions[1]["concept_key"] == "composite-index"
    assert questions[1]["prerequisites"] == ["index-basics"]
    assert questions[0]["reference_answer"] == "index-basics is explained."
    assert "index-basics point" in questions[0]["scoring_rubric"]["excellent"]
    public = QuestionResponse(**questions[0]).model_dump_json()
    assert "slows down writes" not in public
    assert "is explained" not in public


def test_concept_count_scales_with_material():
    assert blueprint.concept_count(500) == 4
    assert blueprint.concept_count(5000) == 6
    assert blueprint.concept_count(20000) == 9
    assert blueprint.concept_count(500000) == 12


def test_generate_retries_until_a_usable_reply(monkeypatch):
    good = {"concepts": [_concept("a"), _concept("b")]}
    replies = iter(["not json at all", "Sure! Here it is: " + json.dumps(good) + " Hope it helps"])

    async def fake_call(prompt):
        return next(replies), "free/model"

    async def no_sleep(_):
        return None

    monkeypatch.setattr(blueprint, "call_openrouter_with_model", fake_call)
    monkeypatch.setattr(blueprint.asyncio, "sleep", no_sleep)

    result = asyncio.run(blueprint.generate_blueprint(MATERIAL, {"subject": "DB"}, 40))

    assert [c["key"] for c in result["concepts"]] == ["a", "b"]
    assert result["model"] == "free/model"
    assert result["prompt_version"] == blueprint.BLUEPRINT_PROMPT_VERSION


def test_generate_gives_up_with_a_plain_message(monkeypatch):
    async def fake_call(prompt):
        return "{}", "free/model"

    async def no_sleep(_):
        return None

    monkeypatch.setattr(blueprint, "call_openrouter_with_model", fake_call)
    monkeypatch.setattr(blueprint.asyncio, "sleep", no_sleep)

    with pytest.raises(RuntimeError, match="Could not prepare"):
        asyncio.run(blueprint.generate_blueprint(MATERIAL, {}, 40))


class _RecordingDb:
    def __init__(self):
        self.executes = []

    async def fetchrow(self, query, *args):
        # The upsert returns the existing id on conflict; key-derived ids make that visible.
        return {"id": f"id-{args[2]}"}

    async def execute(self, query, *args):
        self.executes.append((" ".join(query.split()), args))
        return "OK"


def test_save_concepts_links_context_and_edges():
    concepts = blueprint.normalize_blueprint(
        {"concepts": [_concept("a"), _concept("b", ["a"])]}, MATERIAL
    )
    db = _RecordingDb()

    asyncio.run(blueprint.save_concepts(db, "u1", "c1", concepts))

    links = [args for query, args in db.executes if "context_concepts" in query]
    edges = [args for query, args in db.executes if "concept_edges" in query]
    assert links == [("c1", "id-a", 0, 2), ("c1", "id-b", 1, 2)]
    assert edges == [("u1", "id-b", "id-a")]
