"""Neon Auth JWT verification and per-user ownership."""

import asyncio
import base64
import json
import time

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from api.app import create_app
from services import auth_service, context_service, material_service, session_service
from services.auth_service import CurrentUser, get_current_user
from services.session_service import SessionNotFoundError

AUTH_URL = "https://auth.example.com"
JWKS_URL = "https://auth.example.com/.well-known/jwks.json"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@pytest.fixture()
def keypair():
    private = Ed25519PrivateKey.generate()
    public = private.public_key().public_bytes_raw()
    return private, _b64(public)


@pytest.fixture()
def jwks(keypair):
    _, x = keypair
    return {"keys": [{"kty": "OKP", "crv": "Ed25519", "kid": "test-key", "x": x}]}


@pytest.fixture()
def env_keys(monkeypatch):
    monkeypatch.setenv("JWKS_URL", JWKS_URL)
    monkeypatch.setenv("AUTH_URL", AUTH_URL)


def _mint(private, kid="test-key", alg="EdDSA", claims=None):
    now = int(time.time())
    payload = {
        "sub": "user-1",
        "email": "u@example.com",
        "iss": AUTH_URL,
        "iat": now,
        "exp": now + 900,
    }
    if claims:
        payload.update(claims)
    header = {"alg": alg, "typ": "JWT", "kid": kid}
    h = _b64(json.dumps(header, separators=(",", ":")).encode())
    p = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(private.sign(f"{h}.{p}".encode("ascii")))
    return f"{h}.{p}.{sig}"


def _stub_jwks(monkeypatch, jwks):
    async def fake_jwks():
        return jwks

    monkeypatch.setattr(auth_service, "_get_jwks", fake_jwks)


def test_verify_valid_token(monkeypatch, env_keys, keypair, jwks):
    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)

    claims = asyncio.run(auth_service.verify_token(_mint(private)))

    assert claims["sub"] == "user-1"
    assert claims["email"] == "u@example.com"


def test_verify_expired_token(monkeypatch, env_keys, keypair, jwks):
    from fastapi import HTTPException

    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)
    token = _mint(private, claims={"exp": int(time.time()) - 3600})

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.verify_token(token))
    assert exc.value.status_code == 401


def test_verify_tampered_signature(monkeypatch, env_keys, keypair, jwks):
    from fastapi import HTTPException

    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)
    token = _mint(private)
    header_b64, payload_b64, signature_b64 = token.split(".")
    raw = bytearray(base64.urlsafe_b64decode(signature_b64 + "=" * (-len(signature_b64) % 4)))
    raw[10] ^= 0xFF  # flip data bits mid-signature, never padding
    tampered = f"{header_b64}.{payload_b64}.{_b64(bytes(raw))}"

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.verify_token(tampered))
    assert exc.value.status_code == 401


def test_verify_unknown_kid(monkeypatch, env_keys, keypair, jwks):
    from fastapi import HTTPException

    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.verify_token(_mint(private, kid="nope")))
    assert exc.value.status_code == 401


def test_verify_missing_sub(monkeypatch, env_keys, keypair, jwks):
    from fastapi import HTTPException

    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.verify_token(_mint(private, claims={"sub": ""})))
    assert exc.value.status_code == 401


def test_verify_wrong_issuer(monkeypatch, env_keys, keypair, jwks):
    from fastapi import HTTPException

    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            auth_service.verify_token(_mint(private, claims={"iss": "https://evil.example.com"}))
        )
    assert exc.value.status_code == 401


def test_verify_wrong_alg(monkeypatch, env_keys, keypair, jwks):
    from fastapi import HTTPException

    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth_service.verify_token(_mint(private, alg="HS256")))
    assert exc.value.status_code == 401


def test_verify_issuer_matches_by_origin_not_path(monkeypatch, keypair, jwks):
    """Regression: Neon Auth issues iss as the bare service host while
    AUTH_URL carries the mount path (.../neondb/auth)."""
    monkeypatch.setenv("JWKS_URL", JWKS_URL)
    monkeypatch.setenv("AUTH_URL", "https://auth.example.com/neondb/auth")
    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)

    claims = asyncio.run(
        auth_service.verify_token(_mint(private, claims={"iss": "https://auth.example.com"}))
    )

    assert claims["sub"] == "user-1"


def test_get_current_user_without_credentials():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(None))
    assert exc.value.status_code == 401


def test_get_current_user_valid(monkeypatch, env_keys, keypair, jwks):
    private, _ = keypair
    _stub_jwks(monkeypatch, jwks)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=_mint(private))

    user = asyncio.run(get_current_user(creds))

    assert user == CurrentUser(id="user-1", email="u@example.com")


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


class _FakeCache:
    def __init__(self, state=None):
        self.state = state

    def get(self, key):
        return self.state

    def set(self, key, value, ttl=None):
        self.state = value

    def delete(self, key):
        self.state = None


class _FakeDb:
    def __init__(self, fetchrow_result=None):
        self.executes = []
        self.queries = []
        self.fetchrow_result = fetchrow_result

    async def execute(self, query, *args):
        self.executes.append((query, args))
        return "OK"

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        return self.fetchrow_result

    async def fetch(self, query, *args):
        self.queries.append((query, args))
        return []


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
