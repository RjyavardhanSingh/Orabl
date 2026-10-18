"""Question generation survives navigation and stores a reusable result."""

import asyncio
import json

from services import question_service


class MemoryQuestionDb:
    def __init__(self):
        self.row = None

    async def fetchrow(self, query, *args):
        if "INSERT INTO question_sets" in query:
            context_id, job_id, count = args
            if self.row and self.row["status"] in ("pending", "running"):
                return None
            self.row = {
                "context_id": context_id, "job_id": job_id,
                "requested_count": count, "status": "pending",
                "questions": None, "error": None,
            }
            return self.row
        if "WITH next_job" in query:
            if self.row and self.row["status"] == "pending":
                self.row["status"] = "running"
                return self.row
            return None
        if "SELECT status, questions, error" in query:
            return self.row
        raise AssertionError(query)

    async def execute(self, query, *args):
        if "INSERT INTO question_sets" in query:
            if self.row is None:
                self.row = {
                    "context_id": args[0], "job_id": args[1],
                    "requested_count": args[2], "status": "ready",
                    "questions": json.loads(args[3]), "error": None,
                }
        elif "SET status = 'ready'" in query:
            if self.row and self.row["job_id"] == args[1]:
                self.row.update(status="ready", questions=json.loads(args[2]), error=None)
        elif "SET status = 'failed'" in query:
            if self.row and self.row["job_id"] == args[1]:
                self.row.update(status="failed", error=args[2])
        else:
            raise AssertionError(query)
        return "UPDATE 1"


def test_question_job_can_be_rejoined_and_result_is_reusable(monkeypatch):
    db = MemoryQuestionDb()
    calls = []

    async def fake_generate(cache, database, context_id, count):
        calls.append((context_id, count))
        return [{"id": f"{context_id}:q0", "text": "What happened?", "reference_answer": "A"}]

    monkeypatch.setattr(question_service, "generate_questions", fake_generate)

    async def exercise():
        first = await question_service.enqueue_questions(db, "c1", 5)
        second = await question_service.enqueue_questions(db, "c1", 5)
        assert first["status"] == second["status"] == "pending"
        job = await question_service.claim_question_job(db)
        assert job is not None
        assert await question_service.enqueue_questions(db, "c1", 5) == {
            "status": "running", "questions": [], "error": None,
        }
        await question_service.process_question_job(None, db, job)
        assert (await question_service.get_question_set(db, "c1"))["status"] == "ready"
        assert (await question_service.get_questions(db, "c1"))[0]["text"] == "What happened?"
        assert calls == [("c1", 5)]

    asyncio.run(exercise())


def test_existing_cached_set_is_saved_on_first_read():
    class LegacyCache:
        def get(self, key):
            return [{"text": "An existing question?"}]

    db = MemoryQuestionDb()
    result = asyncio.run(question_service.get_question_set(db, "c1", LegacyCache()))
    assert result["status"] == "ready"
    assert result["questions"][0]["id"] == "c1:q0"
    saved = asyncio.run(question_service.get_questions(db, "c1"))
    assert saved[0]["text"] == "An existing question?"


def test_failed_generation_can_be_retried(monkeypatch):
    db = MemoryQuestionDb()

    async def fail(*args):
        raise RuntimeError("Provider unavailable")

    monkeypatch.setattr(question_service, "generate_questions", fail)

    async def exercise():
        await question_service.enqueue_questions(db, "c1", 5)
        job = await question_service.claim_question_job(db)
        await question_service.process_question_job(None, db, job)
        failed = await question_service.get_question_set(db, "c1")
        assert failed["status"] == "failed"
        assert "Provider unavailable" in failed["error"]
        await question_service.enqueue_questions(db, "c1", 5)
        assert (await question_service.get_question_set(db, "c1"))["status"] == "pending"

    asyncio.run(exercise())


def test_generation_after_context_cache_expiry_uses_saved_material(monkeypatch):
    class ExpiredCache:
        def get(self, key):
            return None

    class ContextDb:
        async def fetchrow(self, query, *args):
            return {
                "id": "c1", "user_id": "u1", "subject": "History",
                "target": "Understand the Mauryan Empire", "level": "intermediate",
                "word_count": 6,
            }

        async def fetch(self, query, *args):
            return [{
                "name": "notes", "kind": "text",
                "full_text": "Ashoka ruled the Mauryan Empire.",
            }]

    captured = {}

    async def fake_openrouter(cache, context_id, material_content, goal, word_count, **kwargs):
        captured.update(content=material_content, goal=goal, count=kwargs["count"])
        return [{"text": "Who was Ashoka?"}]

    monkeypatch.setattr(question_service, "openrouter_generate", fake_openrouter)

    result = asyncio.run(
        question_service.generate_questions(ExpiredCache(), ContextDb(), "c1", 5, "u1")
    )
    assert "Ashoka ruled" in captured["content"]
    assert captured["goal"]["subject"] == "History"
    assert result[0]["id"] == "c1:q0"
