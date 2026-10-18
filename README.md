# Adaptive Oral Learning Platform

Upload what you're studying, say what you need to achieve, practice by speaking your answers out loud, then get a clear report on what you know, what's weak, and what to retest.

Flow is one loop with 6 steps: **Upload → Goal → Preparing → Practice → Results → Retest**. See `PRD.md` for product spec.

## What's Done

- **Versioned production API** — canonical endpoints are under `/v1`; the old unversioned paths remain as deprecated compatibility aliases during migration. Requests receive an `X-Request-ID` and the API version header. Liveness and dependency readiness probes are available at `/health/live` and `/health/ready`.
- **Material upload** — text/Markdown via `POST /v1/materials` (JSON), PDF via `POST /v1/materials/upload` (multipart, stored in Neon Object Storage). Metadata in Postgres, presigned download via `GET /v1/materials/{id}/download`.
- **Goal → context** — `POST /v1/contexts` combines materials + learning goal (subject, target, level, deadline, language) into a `LearningContext`. Persisted in Postgres (`contexts`, `context_materials`), cached in Dragonfly for fast reads.
- **Question generation (LLM)** — `POST /v1/contexts/{id}/questions` calls OpenRouter (`src/services/openrouter_service.py`) with retry + model fallback + response cache. An optional `{ "count": 5 }` body can override the dynamic count. Each question is enriched: `text, topic, target_concepts, required_relationships, acceptable_alternatives, common_misconceptions, reference_answer, scoring_rubric {excellent, good, needs_work}, source_citations`. Reference answers and rubrics are server-only and are excluded from API responses. Cached in Dragonfly only.
- **Practice sessions (voice)** — `POST /v1/sessions` (from prepared questions), `GET /v1/sessions/{id}` (now also reports `pending_count`/`scored_count`), `POST /v1/sessions/{id}/answer` (spoken transcripts up to ~10 min / 12000 chars, `skipped: true` supported per PRD §9.3). Answers must be submitted one question at a time; completed sessions and invalid ordering return `409`. Scoring runs **asynchronously**: answers are recorded as `pending`, a job is enqueued in the `score_jobs` outbox, a background worker scores against the LLM rubric and acks back into the session — the learner never waits. Scoring is LLM rubric-based (`_score_with_gemini` in `src/services/session_service.py`) with keyword-overlap fallback; every answer carries `status` (`pending|scored|failed`), `question_id`, and `scored_by` (`llm|fallback|skip`).
- **STT (Speech-to-Text)** — `GET /v1/stt/token` mints short-lived ElevenLabs Scribe-realtime tokens (`src/services/stt_service.py`). The browser streams mic audio directly to ElevenLabs; the API key never leaves the server.
- **Results** — `POST /v1/sessions/{id}/complete` reconciles pending background scores (bounded wait, never traps the user), computes readiness % plus a per-topic summary (averages, missed concepts, misconceptions), flags `weak_topics` (average ≤ 60), and suggests next review. Persists session to Postgres, clears cache. `GET /v1/sessions/{id}/results` fetches from cache → DB fallback.
- **Retest (smart)** — `POST /v1/sessions/{id}/retest` filters to weak-area questions by default (`weak_only: true`, override with `false` for a full retest), enforces a 24h review window (`410 Gone` when expired), attaches each question's `previous_attempt` score, and persists `parent_session_id` lineage. Response includes `selected_topics` and `previous_scores`.
- **Concept memory** — `concept_mastery` table tracks best score, attempts, and `next_review_at` per question across sessions (1 day if weak, 7/30 days if mastered).
- **Question IDs** — every question carries a stable `{context_id}:q{i}` ID used to match answers across sessions and retests.
- **Infra** — FastAPI (`src/api/app.py`, scoring worker in lifespan), Neon PostgreSQL + `src/db/schema.sql` (materials, contexts, context_materials, sessions, score_jobs, concept_mastery), Alembic migrations in `src/migrations/versions/`, Dragonfly (Redis-compatible) cache, Docker Compose for local Dragonfly, GitHub Actions CI (ruff + pytest).
- **Tests** — 58 passing (`tests/test_context.py`, `test_goal.py`, `test_ingestion.py`, `test_pdf.py`, `test_reference_answers.py`, `test_api_versioning.py`, `test_async_scoring.py`).
- **Frontend (`web/`)** — connected practice loop in the existing theme: preparing page "Let's go, champ" starts a session; practice page (STT-only: record → live partials → review/edit → submit → instant advance, skip supported); results page (readiness hero, topic breakdown, per-question review, weak-only + full retest actions). API client, `useVoiceAnswer` hook (`@elevenlabs/react`), routes wired in `App.tsx`.

## What's Not Done

- **TTS (Text-to-Speech)** — questions are text only.
- **Gap detection / research** — no filling missing knowledge from trusted sources.
- **Adaptive questioning** — no follow-up / difficulty adjustment mid-session.
- **Citations UI** — `source_citations` generated but no frontend to show them.
- **Due-review dashboard** — `next_review_at` is computed but no UI surfaces what's due.
- **Chunking / retrieval** — full material text sent to LLM (truncated at ~3M chars); no RAG yet.

## Structure

```
src/
├── api/                    # FastAPI app factory + routes (6-step loop)
│   ├── app.py              # create_app(), /health
│   ├── schemas.py          # Pydantic request/response models
│   └── routes/
│       ├── materials.py    # Upload (text JSON + PDF alias)
│       ├── contexts.py     # Goal → context
│       ├── questions.py    # Preparing (generate/fetch)
│       ├── sessions.py     # Practice → Results → Retest
│       └── stt.py          # Realtime transcription token
├── services/               # Business logic
│   ├── material_service.py # Upload text/PDF, object storage
│   ├── context_service.py  # Build context, cache in Dragonfly
│   ├── question_service.py # Generate questions, cache only
│   ├── session_service.py  # Session lifecycle, async scoring worker, retest
│   ├── openrouter_service.py # LLM client (fallback, retry, cache)
│   ├── stt_service.py      # ElevenLabs single-use tokens
│   └── object_storage.py   # Neon Object Storage (S3-compatible)
├── models/                 # Pydantic domain models (material, goal, context)
├── ingestion/              # PDF / text / Markdown parsers
├── context/                # ContextBuilder (material + goal → context)
├── cache/                  # Dragonfly (Redis) connection + CacheService
├── db/                     # Neon PostgreSQL connection + schema.sql
└── migrations/             # Alembic migrations
│   └── versions/           # 001 column rename, 002 retest/scoring/concept tables
tests/                      # pytest suite (58 tests)
web/                        # React frontend (upload → goal → preparing → practice → results)
│   ├── src/pages/          # welcome, upload, goal, preparing, practice, results
│   └── src/lib/            # typed API client, useVoiceAnswer hook
```

## Setup

Requires Python >=3.11 and [uv](https://docs.astral.sh/uv/).

```bash
uv sync              # install main dependencies
uv sync --group dev  # install dev dependencies (pytest, ruff)
```

## Environment Variables

Copy the template and fill it in — it lists every variable the code reads, with the source module for each:

```bash
cp .env.example .env
```

Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string (`src/db/connection.py`) |
| `DRAGONFLY_URL` | Cache URL; embed any password here (`src/cache/dragonfly.py`) |
| `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | S3-compatible object storage for PDFs (`src/services/object_storage.py`) |
| `NEON_STORAGE_BUCKET` | Bucket name, defaults to `materials` |
| `OPENROUTER_API_KEY` | LLM — question generation + scoring |
| `ELEVENLABS_API_KEY` | STT — voice answers |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:5173` |

> **`CORS_ORIGINS` is easy to miss and breaks the frontend silently.** If it is unset or empty the CORS middleware is never registered (`src/api/app.py:92`), so every browser request from the React app is blocked — you get a CORS error in DevTools rather than a network failure, and preflight `OPTIONS` calls return `405`.

Optional (defaults in `.env.example`): `TRUSTED_HOSTS`, `OPENROUTER_API_URL`, `OPENROUTER_MODEL`, `OPENROUTER_MODELS`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`, `MAX_PDF_UPLOAD_BYTES`.

## Running

```bash
# Start Dragonfly
docker compose up -d

# Start server (from repo root)
PYTHONPATH=src uv run uvicorn api.app:app --reload --host 0.0.0.0 --port 8000
```

Swagger docs at `http://localhost:8000/docs`.

```bash
# Start frontend (from repo root)
cd web && bun install && bun run dev
```

Frontend at `http://localhost:5173` (expects the API at `http://localhost:8000/v1`).

## API Endpoints

| Method | Path | Step | Description |
|---|---|---|---|
| `POST` | `/v1/materials` | Upload | Upload text/markdown (JSON body) |
| `POST` | `/v1/materials/upload` | Upload | Upload PDF file (multipart, alias) |
| `GET` | `/v1/materials/{id}` | Upload | Fetch material metadata |
| `GET` | `/v1/materials/{id}/download` | Upload | Presigned download URL (PDFs only) |
| `POST` | `/v1/contexts` | Goal | Build context from materials + goal |
| `GET` | `/v1/contexts/{id}` | Goal | Fetch context (cache → DB) |
| `POST` | `/v1/contexts/{id}/questions` | Preparing | Generate practice set (LLM), optional `{count}` |
| `GET` | `/v1/contexts/{id}/questions` | Preparing | Fetch cached questions |
| `POST` | `/v1/sessions` | Practice | Start session (`{context_id}`) |
| `GET` | `/v1/sessions/{id}` | Practice | Get session state (+ pending/scored counts) |
| `POST` | `/v1/sessions/{id}/answer` | Practice | Submit spoken answer; scored in background |
| `GET` | `/v1/stt/token` | Practice | Mint ElevenLabs realtime transcription token |
| `POST` | `/v1/sessions/{id}/complete` | Results | Complete session, readiness %, topic summary, persist to DB |
| `GET` | `/v1/sessions/{id}/results` | Results | Fetch results (cache → DB) |
| `POST` | `/v1/sessions/{id}/retest` | Retest | Weak-area retest (`{weak_only}`, 24h window) |
| `GET` | `/health` | — | Liveness check |
| `GET` | `/health/ready` | — | Database/cache readiness probe |

## Testing

```bash
uv run pytest -v
```

## Linting

```bash
uv run ruff check src/ tests/
uv run ruff format src/ tests/
```
