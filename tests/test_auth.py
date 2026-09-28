"""Own Google OAuth + opaque session tokens, and per-user ownership."""

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from api.app import create_app
from cache.dragonfly import CacheService, get_cache
from db.connection import get_db
from services import auth_service, context_service, material_service, session_service
from services.auth_service import CurrentUser, get_current_user
from services.session_service import SessionNotFoundError


@pytest.fixture()
def env_google(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")


class _FakeRedis:
    """Minimal redis stand-in: set/get/delete with TTL expiry."""

    def __init__(self):
        self.store = {}

    def set(self, key, value, ex=None):
        expires = datetime.now(timezone.utc) + timedelta(seconds=ex) if ex is not None else None
        self.store[key] = (value, expires)

    def get(self, key):
        hit = self.store.get(key)
        if hit is None:
            return None
        value, expires = hit
        if expires is not None and expires <= datetime.now(timezone.utc):
            del self.store[key]
            return None
        return value

    def delete(self, key):
        self.store.pop(key, None)


@pytest.fixture()
def cache():
    return CacheService(_FakeRedis())


class _FakeDb:
    def __init__(self, fetchrow_result=None, results=None):
        self.executes = []
        self.queries = []
        self.fetchrow_result = fetchrow_result
        self.results = list(results) if results else []

    async def execute(self, query, *args):
        self.executes.append((query, args))
        return "OK"

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        if self.results:
            return self.results.pop(0)
        return self.fetchrow_result

    async def fetch(self, query, *args):
        self.queries.append((query, args))
        return []


def _live_row(user_id="user-1", email="u@example.com"):
    return {
        "user_id": user_id,
        "email": email,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        "revoked_at": None,
    }


def _bearer(token: str):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


# --- token primitives -------------------------------------------------------


def test_hash_token_is_sha256():
    assert auth_service.hash_token("abc") == hashlib.sha256(b"abc").hexdigest()


def test_issue_token_unique_and_verifiable():
    raw1, digest1 = auth_service.issue_token()
    raw2, digest2 = auth_service.issue_token()
    assert raw1 != raw2
    assert digest1 == auth_service.hash_token(raw1)
    assert digest2 == auth_service.hash_token(raw2)


def test_sanitize_next_allows_only_local_paths():
    assert auth_service.sanitize_next("/upload") == "/upload"
    assert auth_service.sanitize_next("//evil.com") == "/upload"
    assert auth_service.sanitize_next("https://evil.com") == "/upload"
    assert auth_service.sanitize_next(None) == "/upload"


# --- Google URL / state -----------------------------------------------------


def test_google_authorize_url(env_google):
    state, _, challenge = auth_service.new_oauth_state()
    url = auth_service.google_authorize_url(state, challenge)
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "client_id=test-client-id" in url
    assert "code_challenge=" in url
    assert "redirect_uri=" in url


def test_google_authorize_url_unconfigured(monkeypatch):
    from services.auth_service import AuthNotConfiguredError

    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    state, _, challenge = auth_service.new_oauth_state()
    with pytest.raises(AuthNotConfiguredError):
        auth_service.google_authorize_url(state, challenge)


def test_oauth_state_single_use(cache):
    auth_service.store_oauth_state(cache, "s1", "verifier-1", "/upload")
    first = auth_service.pop_oauth_state(cache, "s1")
    assert first == {"verifier": "verifier-1", "next": "/upload"}
    assert auth_service.pop_oauth_state(cache, "s1") is None
    assert auth_service.pop_oauth_state(cache, "nope") is None


def test_exchange_code_single_use(cache):
    code = auth_service.store_exchange_code(cache, "raw-session-token")
    assert auth_service.pop_exchange_code(cache, code) == "raw-session-token"
    assert auth_service.pop_exchange_code(cache, code) is None
    assert auth_service.pop_exchange_code(cache, "nope") is None


# --- sessions ---------------------------------------------------------------


def test_create_and_resolve_session():
    db = _FakeDb(fetchrow_result=_live_row())

    raw = asyncio.run(auth_service.create_session(db, "user-1"))
    assert raw and len(raw) > 32
    assert any("INSERT INTO app_sessions" in sql for sql, _ in db.executes)

    user = asyncio.run(auth_service.resolve_session(db, raw))

    assert user == CurrentUser(id="user-1", email="u@example.com")
    assert any("app_sessions" in sql for sql, _ in db.queries)


def test_resolve_expired_revoked_missing():
    expired = _live_row()
    expired["expires_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    revoked = _live_row()
    revoked["revoked_at"] = datetime.now(timezone.utc)

    for row in (expired, revoked, None):
        db = _FakeDb(fetchrow_result=row)
        assert asyncio.run(auth_service.resolve_session(db, "any-token")) is None


def test_resolve_db_error_fails_closed():
    class _BoomDb(_FakeDb):
        async def fetchrow(self, query, *args):
            raise RuntimeError("db down")

    assert asyncio.run(auth_service.resolve_session(_BoomDb(), "any-token")) is None


def test_get_current_user_without_credentials():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(None))
    assert exc.value.status_code == 401


def test_get_current_user_unknown_token_is_401():
    from fastapi import HTTPException

    db = _FakeDb(fetchrow_result=None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(_bearer("deadbeefdeadbeefdeadbeefdeadbeef"), db))
    assert exc.value.status_code == 401


def test_get_current_user_db_error_is_401():
    from fastapi import HTTPException

    class _BoomDb(_FakeDb):
        async def fetchrow(self, query, *args):
            raise RuntimeError("db down")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(_bearer("Av0QG2p8hyAMYeGgRwqofb5fapiWfb3v"), _BoomDb()))
    assert exc.value.status_code == 401


def test_garbage_token_is_401():
    from fastapi import HTTPException

    db = _FakeDb(fetchrow_result=None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(_bearer("not-a-token!!!"), db))
    assert exc.value.status_code == 401


# --- user upsert ------------------------------------------------------------


def test_upsert_existing_google_sub():
    db = _FakeDb(results=[{"id": "u-1", "email": "old@example.com"}])

    user = asyncio.run(
        auth_service.upsert_user_from_google(
            db, google_sub="g-1", email="new@example.com", name="N"
        )
    )

    assert user == {"id": "u-1", "email": "new@example.com"}
    assert any("UPDATE app_users" in sql for sql, _ in db.executes)


def test_upsert_adopts_same_email_row():
    db = _FakeDb(results=[None, {"id": "u-2"}])

    user = asyncio.run(
        auth_service.upsert_user_from_google(
            db, google_sub="g-9", email="same@example.com", name="S"
        )
    )

    assert user == {"id": "u-2", "email": "same@example.com"}
    assert any("google_sub" in sql for sql, _ in db.executes)


def test_upsert_creates_new_user():
    db = _FakeDb(results=[None, None, {"id": "u-3", "email": "fresh@example.com"}])

    user = asyncio.run(
        auth_service.upsert_user_from_google(
            db, google_sub="g-3", email="fresh@example.com", name="F"
        )
    )

    assert user == {"id": "u-3", "email": "fresh@example.com"}
    assert any("INSERT INTO app_users" in sql for sql, _ in db.queries)


# --- routes -----------------------------------------------------------------


def test_me_route_requires_auth():
    client = TestClient(create_app())

    response = client.get("/v1/auth/me")

    assert response.status_code == 401


def test_me_route_returns_profile():
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id="user-1", email="u@example.com"
    )
    client = TestClient(app)

    response = client.get("/v1/auth/me")

    assert response.status_code == 200
    assert response.json() == {"id": "user-1", "email": "u@example.com"}


def test_google_url_route(env_google, cache):
    app = create_app()
    app.dependency_overrides[get_cache] = lambda: cache
    client = TestClient(app)

    response = client.get("/v1/auth/google/url?next=/goal")

    assert response.status_code == 200
    assert response.json()["url"].startswith("https://accounts.google.com/")


def test_google_url_route_unconfigured(monkeypatch, cache):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    app = create_app()
    app.dependency_overrides[get_cache] = lambda: cache
    client = TestClient(app)

    response = client.get("/v1/auth/google/url")

    assert response.status_code == 500


def test_callback_rejects_google_error(cache):
    app = create_app()
    app.dependency_overrides[get_cache] = lambda: cache
    client = TestClient(app)

    response = client.get("/v1/auth/google/callback?error=access_denied", follow_redirects=False)

    assert response.status_code == 302
    assert "error=google_rejected" in response.headers["location"]


def test_callback_rejects_bad_state(cache):
    app = create_app()
    app.dependency_overrides[get_cache] = lambda: cache
    client = TestClient(app)

    response = client.get("/v1/auth/google/callback?code=x&state=replayed", follow_redirects=False)

    assert response.status_code == 302
    assert "error=invalid_state" in response.headers["location"]


def test_callback_to_token_roundtrip(monkeypatch, cache):
    async def fake_exchange(code, verifier):
        assert code == "auth-code" and verifier == "v"
        return {"access_token": "google-at"}

    async def fake_userinfo(access_token):
        assert access_token == "google-at"
        return {"sub": "g-1", "email": "u@example.com", "email_verified": True, "name": "U"}

    monkeypatch.setattr(auth_service, "exchange_google_code", fake_exchange)
    monkeypatch.setattr(auth_service, "fetch_google_userinfo", fake_userinfo)

    auth_service.store_oauth_state(cache, "state-1", "v", "/goal")
    db = _FakeDb(
        fetchrow_result=_live_row(user_id="u-1", email="u@example.com"),
        results=[None, None, {"id": "u-1", "email": "u@example.com"}],
    )

    app = create_app()
    app.dependency_overrides[get_cache] = lambda: cache
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)

    callback = client.get(
        "/v1/auth/google/callback?code=auth-code&state=state-1", follow_redirects=False
    )
    assert callback.status_code == 302
    location = callback.headers["location"]
    assert "/auth/callback?code=" in location and "next=%2Fgoal" in location

    exchange_code = location.split("code=")[1].split("&")[0]
    first = client.post("/v1/auth/token", json={"code": exchange_code})
    assert first.status_code == 200
    body = first.json()
    assert body["user"] == {"id": "u-1", "email": "u@example.com"}
    assert body["token"]

    replay = client.post("/v1/auth/token", json={"code": exchange_code})
    assert replay.status_code == 401


def test_token_exchange_unknown_code_is_401(cache):
    app = create_app()
    app.dependency_overrides[get_cache] = lambda: cache
    app.dependency_overrides[get_db] = lambda: _FakeDb()
    client = TestClient(app)

    response = client.post("/v1/auth/token", json={"code": "nope"})

    assert response.status_code == 401


def test_logout_revokes_session():
    db = _FakeDb(fetchrow_result=_live_row())
    raw = asyncio.run(auth_service.create_session(db, "user-1"))

    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)

    response = client.post("/v1/auth/logout", headers={"Authorization": f"Bearer {raw}"})

    assert response.status_code == 200
    assert any("revoked_at" in sql for sql, _ in db.executes)


def test_logout_without_credentials_is_ok():
    app = create_app()
    app.dependency_overrides[get_db] = lambda: _FakeDb()
    client = TestClient(app)

    assert client.post("/v1/auth/logout").status_code == 200


# --- per-user ownership (unchanged contract) --------------------------------


class _FakeCache:
    def __init__(self, state=None):
        self.state = state

    def get(self, key):
        return self.state

    def set(self, key, value, ttl=None):
        self.state = value

    def delete(self, key):
        self.state = None


def test_submit_answer_wrong_user_reads_as_missing():
    cache = _FakeCache(
        {
            "id": "s1",
            "context_id": "c1",
            "user_id": "user-1",
            "questions": [{"id": "c1:q0", "text": "Q?"}],
            "answers": [],
            "scores": [],
            "current_index": 0,
            "status": "active",
        }
    )

    with pytest.raises(SessionNotFoundError):
        asyncio.run(session_service.submit_answer(cache, "s1", 0, "an answer", user_id="user-2"))


def test_create_retest_wrong_user_parent_reads_as_missing():
    cache = _FakeCache(
        {
            "id": "p1",
            "context_id": "c1",
            "user_id": "user-1",
            "questions": [{"id": "c1:q0", "text": "Q?"}],
            "answers": [{"question_index": 0, "score": 40}],
            "status": "completed",
            "completed_at": "2026-09-26T00:00:00+00:00",
        }
    )
    db = _FakeDb(fetchrow_result=None)

    with pytest.raises(SessionNotFoundError):
        asyncio.run(session_service.create_retest(cache, db, "p1", user_id="user-2"))


def test_require_context_owner_mismatch():
    db = _FakeDb(fetchrow_result=None)

    with pytest.raises(ValueError, match="Context not found"):
        asyncio.run(context_service.require_context_owner(db, "ctx1", "user-2"))

    assert any("AND user_id" in sql for sql, _ in db.queries)


def test_material_writes_carry_user_id():
    db = _FakeDb()

    asyncio.run(material_service.upload_text(db, "hello", user_id="user-1"))

    assert any("user_id" in sql for sql, _ in db.executes)
    assert db.executes[0][1][1] == "user-1"


def test_material_read_scopes_by_user():
    row = {"id": "m1", "name": "n", "kind": "text"}
    db = _FakeDb(fetchrow_result=row)

    result = asyncio.run(material_service.get_material(db, "m1", user_id="user-1"))

    assert result == row
    assert any("AND user_id" in sql for sql, _ in db.queries)
