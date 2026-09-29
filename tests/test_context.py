from pathlib import Path

import pytest

from context import ContextBuilder, ContextBuildError, build_context
from models import LearningGoal, MaterialKind

PDF_PATH = Path(__file__).parent.parent / "data" / "test_biology.pdf"


def _goal() -> LearningGoal:
    return LearningGoal(subject="Biology", target="score 80%")


def test_build_context_from_pdf():
    context = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).build()

    assert context.goal.subject == "Biology"
    assert context.stats.source_count == 1
    assert context.stats.page_count == 3
    assert context.stats.word_count > 0
    assert context.stats.reading_minutes >= 1
    assert context.sources[0].kind is MaterialKind.PDF


def test_build_context_combines_material_types():
    context = (
        ContextBuilder()
        .with_goal(_goal())
        .add_file(PDF_PATH)
        .add_text("Extra notes about cells.", name="notes.txt")
        .add_text(
            "# Photosynthesis\n\nLight to energy.",
            name="extra.md",
            kind=MaterialKind.MARKDOWN,
        )
        .build()
    )

    assert context.stats.source_count == 3
    assert context.stats.page_count == 3 + 1 + 1
    assert len(context.sources) == 3


def test_build_context_requires_goal():
    with pytest.raises(ContextBuildError, match="goal is required"):
        ContextBuilder().add_text("some notes").build()


def test_build_context_requires_readable_source():
    with pytest.raises(ContextBuildError, match="at least one source"):
        ContextBuilder().with_goal(_goal()).build()


def test_build_context_ignores_empty_sources():
    with pytest.raises(ContextBuildError, match="at least one source"):
        ContextBuilder().with_goal(_goal()).add_text("   ").build()


def test_context_id_is_stable():
    first = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).build()
    second = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).build()

    assert first.context_id == second.context_id


def test_context_id_stable_across_goal_edits():
    """Flow pinning: same materials + user keep one id even when the goal
    text changes (edits update the row; they must not fork orphans)."""
    other = LearningGoal(subject="Biology", target="score 95%")
    first = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).build()
    second = ContextBuilder().with_goal(other).add_file(PDF_PATH).build()

    assert first.context_id == second.context_id


def test_context_id_changes_with_materials():
    first = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).build()
    second = (
        ContextBuilder()
        .with_goal(_goal())
        .add_text("Entirely different notes.", name="other.txt")
        .build()
    )

    assert first.context_id != second.context_id


def test_context_id_scoped_by_user():
    first = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).for_user("u-1").build()
    second = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).for_user("u-2").build()
    same_user = ContextBuilder().with_goal(_goal()).add_file(PDF_PATH).for_user("u-1").build()

    assert first.context_id != second.context_id
    assert first.context_id == same_user.context_id


def test_build_context_convenience_wrapper():
    context = build_context(goal=_goal(), files=[PDF_PATH], text="Pasted notes.")

    assert context.stats.source_count == 2


class _SvcCache:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value, ttl=None):
        self.store[key] = value

    def delete(self, key):
        self.store.pop(key, None)


class _SvcDb:
    def __init__(self, rows):
        self.rows = list(rows)
        self.executes = []

    async def execute(self, query, *args):
        self.executes.append((query, args))
        return "OK"

    async def fetchrow(self, query, *args):
        return self.rows.pop(0) if self.rows else None

    async def fetch(self, query, *args):
        return []


def _stored_material():
    return {
        "id": "m1",
        "kind": "text",
        "name": "notes.txt",
        "full_text": "Cells turn glucose into energy. " * 40,
    }


def _existing_row(subject="Biology", target="score 80%"):
    return {
        "subject": subject,
        "target": target,
        "level": "intermediate",
        "deadline": None,
        "language": "en",
    }


def test_resubmit_identical_keeps_questions_cache():
    import asyncio

    from services import context_service

    cache = _SvcCache()
    first = asyncio.run(
        context_service.build_and_store_context(
            _SvcDb([_stored_material(), None]), cache, ["m1"], _goal(), user_id="u-1"
        )
    )
    cache.set(f"questions:{first['context_id']}", [{"id": "q0", "text": "Q?"}])

    second = asyncio.run(
        context_service.build_and_store_context(
            _SvcDb([_stored_material(), _existing_row()]), cache, ["m1"], _goal(), user_id="u-1"
        )
    )

    assert second["context_id"] == first["context_id"]
    assert cache.get(f"questions:{first['context_id']}") is not None


def test_goal_edit_updates_row_and_invalidates_questions():
    import asyncio

    from services import context_service

    cache = _SvcCache()
    edited = LearningGoal(subject="Biology", target="score 95%")
    # Seed a previously generated set, then resubmit with an edited goal.
    probe = _SvcDb([_stored_material(), None])
    first = asyncio.run(
        context_service.build_and_store_context(probe, cache, ["m1"], _goal(), user_id="u-1")
    )
    cache.set(f"questions:{first['context_id']}", [{"id": "q0", "text": "Q?"}])

    result = asyncio.run(
        context_service.build_and_store_context(
            db_edit := _SvcDb([_stored_material(), _existing_row()]),
            cache,
            ["m1"],
            edited,
            user_id="u-1",
        )
    )

    assert result["context_id"] == first["context_id"]
    assert any("UPDATE contexts SET" in sql for sql, _ in db_edit.executes)
    assert cache.get(f"questions:{first['context_id']}") is None
