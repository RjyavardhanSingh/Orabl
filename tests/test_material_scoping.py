"""Per-user namespaced material IDs."""

import asyncio

from services import material_service


class _FakeDb:
    def __init__(self):
        self.executes = []

    async def execute(self, query, *args):
        self.executes.append((query, args))
        return "OK"


def _inserted_id(db: _FakeDb) -> str:
    assert len(db.executes) == 1
    return db.executes[0][1][0]


def test_namespaced_id_preserves_legacy_without_user():
    assert material_service.namespaced_id(None, "abc123") == "abc123"
    assert material_service.namespaced_id("", "abc123") == "abc123"


def test_namespaced_id_is_deterministic_per_user():
    first = material_service.namespaced_id("u1", "abc123")
    assert first == material_service.namespaced_id("u1", "abc123")
    assert first != "abc123"
    assert len(first) == 16


def test_same_content_different_users_get_different_ids():
    db_a, db_b = _FakeDb(), _FakeDb()

    doc_a = asyncio.run(material_service.upload_text(db_a, "shared notes", user_id="user-a"))
    doc_b = asyncio.run(material_service.upload_text(db_b, "shared notes", user_id="user-b"))

    assert doc_a.source_id != doc_b.source_id
    assert doc_a.source_id == _inserted_id(db_a)
    assert doc_b.source_id == _inserted_id(db_b)


def test_same_user_same_content_gets_same_id():
    db_a, db_b = _FakeDb(), _FakeDb()

    doc_a = asyncio.run(material_service.upload_text(db_a, "shared notes", user_id="user-a"))
    doc_b = asyncio.run(material_service.upload_text(db_b, "shared notes", user_id="user-a"))

    assert doc_a.source_id == doc_b.source_id
