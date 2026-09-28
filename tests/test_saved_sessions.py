"""Saved sessions: bookmark flag on completed rows, list, rename, unsave."""

import asyncio
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from api.app import create_app
from db.connection import get_db
from services import session_service
from services.auth_service import CurrentUser, get_current_user
from services.session_service import SessionNotFoundError


class _FakeDb:
    def __init__(self, fetchrow_result=None, fetch_result=None):
        self.executes = []
        self.queries = []
        self.fetchrow_result = fetchrow_result
        self.fetch_result = fetch_result if fetch_result is not None else []

    async def execute(self, query, *args):
        self.executes.append((query, args))
        return "OK"

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        return self.fetchrow_result

    async def fetch(self, query, *args):
        self.queries.append((query, args))
        return self.fetch_result


def _saved_row():
    return {
        "id": "s1",
        "title": None,
        "is_saved": True,
        "saved_at": datetime.now(timezone.utc),
    }


def _list_row():
    return {
        "id": "s1",
        "title": "My run",
        "subject": "Biology",
        "readiness_score": 80,
        "question_count": 5,
        "weak_count": 1,
        "completed_at": datetime.now(timezone.utc),
        "saved_at": datetime.now(timezone.utc),
    }


# --- service ---------------------------------------------------------------


def test_save_completed_session():
    db = _FakeDb(fetchrow_result=_saved_row())

    record = asyncio.run(session_service.save_session(db, "s1", "user-1"))

    assert record["id"] == "s1" and record["is_saved"] is True
    assert any("completed_at IS NOT NULL" in sql for sql, _ in db.queries)
    assert any("AND user_id" in sql for sql, _ in db.queries)


def test_save_missing_or_active_is_not_found():
    db = _FakeDb(fetchrow_result=None)

    with pytest.raises(SessionNotFoundError):
        asyncio.run(session_service.save_session(db, "nope", "user-1"))


def test_save_with_title_trims():
    row = _saved_row()
    row["title"] = "  T  "
    db = _FakeDb(fetchrow_result=row)

    record = asyncio.run(session_service.save_session(db, "s1", "user-1", "  T  "))

    assert record["title"] == "  T  "
    assert db.queries[0][1][2] == "T"


def test_unsave_ok_and_miss():
    db = _FakeDb(fetchrow_result={"id": "s1"})
    asyncio.run(session_service.unsave_session(db, "s1", "user-1"))
    assert any("is_saved = FALSE" in sql for sql, _ in db.queries)

    with pytest.raises(SessionNotFoundError):
        asyncio.run(session_service.unsave_session(_FakeDb(), "nope", "user-1"))


def test_rename_ok_and_invalid():
    db = _FakeDb(fetchrow_result={"id": "s1", "title": "New"})
    record = asyncio.run(session_service.rename_session(db, "s1", "user-1", "  New  "))
    assert record == {"id": "s1", "title": "New"}

    with pytest.raises(ValueError, match="1-80"):
        asyncio.run(session_service.rename_session(_FakeDb(), "s1", "user-1", "   "))
    with pytest.raises(ValueError, match="1-80"):
        asyncio.run(session_service.rename_session(_FakeDb(), "s1", "user-1", "x" * 81))
    with pytest.raises(SessionNotFoundError):
        asyncio.run(session_service.rename_session(_FakeDb(), "nope", "user-1", "T"))


def test_list_saved_orders_and_scopes():
    db = _FakeDb(fetch_result=[_list_row()])

    rows = asyncio.run(session_service.list_saved_sessions(db, "user-1"))

    assert len(rows) == 1 and rows[0]["subject"] == "Biology"
    assert isinstance(rows[0]["saved_at"], str)
    sql = db.queries[0][0]
    assert "is_saved" in sql and "ORDER BY s.saved_at DESC" in sql
    assert db.queries[0][1] == ("user-1",)


# --- routes -----------------------------------------------------------------


def _authed_app(db):
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-1")
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_save_route_returns_enriched_row():
    db = _FakeDb(fetchrow_result=_saved_row(), fetch_result=[_list_row()])
    client = _authed_app(db)

    response = client.post("/v1/sessions/s1/save", json={})

    assert response.status_code == 200
    assert response.json()["subject"] == "Biology"


def test_save_route_miss_is_404():
    client = _authed_app(_FakeDb())

    assert client.post("/v1/sessions/nope/save", json={}).status_code == 404


def test_save_route_requires_auth():
    assert TestClient(create_app()).post("/v1/sessions/s1/save", json={}).status_code == 401


def test_unsave_and_rename_routes():
    db = _FakeDb(fetchrow_result={"id": "s1"})
    client = _authed_app(db)

    assert client.delete("/v1/sessions/s1/save").status_code == 200
    assert _authed_app(_FakeDb()).delete("/v1/sessions/nope/save").status_code == 404

    rename = client.patch("/v1/sessions/s1/title", json={"title": "New name"})
    assert rename.status_code == 200
    assert client.patch("/v1/sessions/s1/title", json={"title": ""}).status_code == 422


def test_list_saved_route_not_captured_as_id():
    # Would 500 (real cache) or 404 (get_session) if '/saved' lost ordering.
    db = _FakeDb(fetch_result=[_list_row()])
    client = _authed_app(db)

    response = client.get("/v1/sessions/saved")

    assert response.status_code == 200
    assert response.json()[0]["id"] == "s1"
