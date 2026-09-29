from fastapi.testclient import TestClient

from api.app import create_app
from api.schemas import QuestionResponse


def test_openapi_exposes_v1_routes_only():
    paths = create_app().openapi()["paths"]

    assert "/v1/materials" in paths
    assert "/v1/contexts/{context_id}/questions" in paths
    assert "/v1/sessions/{session_id}/results" in paths
    assert "/materials" not in paths
    assert "/contexts" not in paths
    assert "/sessions" not in paths


def test_health_is_available_at_versioned_and_root_paths():
    client = TestClient(create_app())

    root_response = client.get("/health")
    versioned_response = client.get("/v1/health")

    assert root_response.status_code == 200
    assert versioned_response.status_code == 200
    assert versioned_response.json()["api_version"] == "1"
    assert versioned_response.headers["x-api-version"] == "1"
    assert versioned_response.headers["x-request-id"]


def test_cors_preflight_accepts_origin_when_config_has_trailing_slash(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173/")
    client = TestClient(create_app())

    response = client.options(
        "/v1/auth/google/url?next=/upload",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_legacy_routes_are_deprecated_compatibility_aliases():
    client = TestClient(create_app())

    response = client.get("/materials")

    assert response.status_code == 405
    assert response.headers["deprecation"] == "true"
    assert response.headers["link"] == '</v1>; rel="successor-version"'


def test_question_response_does_not_serialize_scoring_secrets():
    question = QuestionResponse(
        text="What is X?",
        reference_answer="X is Y.",
        scoring_rubric={"excellent": "Full explanation"},
    )

    serialized = question.model_dump()

    assert "reference_answer" not in serialized
    assert "scoring_rubric" not in serialized
