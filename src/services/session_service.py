"""Session lifecycle service — manage sessions in Dragonfly, persist on complete."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone

from cache.dragonfly import CacheService
from db.connection import Database

logger = logging.getLogger(__name__)

# Score <= WEAK means the topic needs a retest. Display feedback ("Good" vs
# "Needs work") uses GOOD_SCORE_THRESHOLD; the two are intentionally separate.
WEAK_SCORE_THRESHOLD = 60
GOOD_SCORE_THRESHOLD = 70

# Async scoring outbox knobs.
MAX_JOB_ATTEMPTS = 3
COMPLETE_WAIT_TIMEOUT = 45.0
COMPLETE_POLL_INTERVAL = 2.0


class SessionNotFoundError(ValueError):
    """Raised when a session does not exist."""


class SessionConflictError(ValueError):
    """Raised when a session operation conflicts with its current state."""


class InvalidAnswerError(ValueError):
    """Raised when an answer is invalid for the current question."""


async def create_session(
    cache: CacheService,
    context_id: str,
    questions: list[dict],
    parent_session_id: str | None = None,
    weak_only: bool = False,
    user_id: str | None = None,
) -> dict:
    """Start a new session. Stores state in Dragonfly."""
    session_id = uuid.uuid4().hex[:16]
    state = {
        "id": session_id,
        "context_id": context_id,
        "user_id": user_id,
        "parent_session_id": parent_session_id,
        "is_retest": parent_session_id is not None,
        "weak_only": weak_only,
        "questions": questions,
        "answers": [],
        "scores": [],
        "current_index": 0,
        "status": "active",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    cache.set(f"session:{session_id}", state, ttl=86400)
    return state


async def get_session(
    cache: CacheService, session_id: str, user_id: str | None = None
) -> dict | None:
    """Get session state from Dragonfly. чужой states read as missing."""
    state = cache.get(f"session:{session_id}")
    if state is None:
        return None
    if user_id is not None and state.get("user_id") != user_id:
        return None
    return state


def _require_owner(state: dict, user_id: str | None) -> None:
    """Raise SessionNotFoundError unless the cached state belongs to the caller."""
    if user_id is not None and state.get("user_id") != user_id:
        raise SessionNotFoundError(f"Session not found: {state.get('id')}")


async def submit_answer(
    cache: CacheService,
    session_id: str,
    question_index: int,
    answer_text: str,
    skipped: bool = False,
    db: Database | None = None,
    user_id: str | None = None,
) -> dict:
    """Record an answer for a question. Updates session in Dragonfly.

    When a Database is passed, scoring happens asynchronously: the answer is
    recorded as pending, a job is enqueued in score_jobs, and the caller can
    move on instantly. The score arrives later via the background worker.
    Without a Database (tests, fallback), scoring is synchronous as before.
    Supports skipped=true per PRD §9.3 (scored 0, tagged weak).
    Returns the answer record.
    """
    state = cache.get(f"session:{session_id}")
    if state is None:
        raise SessionNotFoundError(f"Session not found: {session_id}")
    _require_owner(state, user_id)
    if state.get("status") != "active":
        raise SessionConflictError("Session is no longer active")
    if question_index != state.get("current_index", 0):
        raise SessionConflictError("Answers must be submitted one question at a time")
    question = _get_question(state, question_index)
    if question is None:
        raise InvalidAnswerError("Question index is out of range")
    if not skipped and not answer_text.strip():
        raise InvalidAnswerError("Answer text is required unless skipped=true")

    question_id = question.get("id") or f"{state['context_id']}:q{question_index}"

    if skipped:
        answer_record = {
            "question_index": question_index,
            "question_id": question_id,
            "answer_text": answer_text,
            "answered_at": datetime.now(timezone.utc).isoformat(),
            "score": 0,
            "feedback": "Skipped",
            "concept_coverage": [],
            "concepts_missed": [],
            "misconceptions_found": [],
            "status": "scored",
            "job_id": None,
            "scored_by": "skip",
            "skipped": True,
        }
    elif db is None:
        result = await _score_sync(question, answer_text)
        answer_record = {
            "question_index": question_index,
            "question_id": question_id,
            "answer_text": answer_text,
            "answered_at": datetime.now(timezone.utc).isoformat(),
            "score": result["score"],
            "feedback": result["feedback"],
            "concept_coverage": result["concept_coverage"],
            "concepts_missed": result["concepts_missed"],
            "misconceptions_found": result["misconceptions_found"],
            "status": "scored",
            "job_id": None,
            "scored_by": result["scored_by"],
        }
    else:
        job_id = uuid.uuid4().hex[:12]
        await db.execute(
            """INSERT INTO score_jobs
               (id, session_id, question_index, question_snapshot, transcript, status)
               VALUES ($1, $2, $3, $4::jsonb, $5, 'pending')""",
            job_id,
            session_id,
            question_index,
            json.dumps(question),
            answer_text,
        )
        answer_record = {
            "question_index": question_index,
            "question_id": question_id,
            "answer_text": answer_text,
            "answered_at": datetime.now(timezone.utc).isoformat(),
            "score": None,
            "feedback": "Scoring your answer…",
            "concept_coverage": [],
            "concepts_missed": [],
            "misconceptions_found": [],
            "status": "pending",
            "job_id": job_id,
            "scored_by": None,
        }

    state["answers"].append(answer_record)
    state["scores"].append({"question_index": question_index, "score": answer_record["score"]})
    state["current_index"] = question_index + 1

    cache.set(f"session:{session_id}", state, ttl=86400)

    return answer_record


async def _score_sync(question: dict, answer_text: str) -> dict:
    """Score immediately (used when no Database is available for async jobs)."""
    if question and question.get("reference_answer"):
        try:
            return await _score_with_gemini(question, answer_text)
        except Exception as e:
            logger.warning(f"Sync LLM scoring failed, using keyword fallback: {e}")
            ref = question.get("reference_answer", "")
            score = _score_against_reference(ref, answer_text)
            return {
                "score": score,
                "feedback": "Good" if score >= GOOD_SCORE_THRESHOLD else "Needs work",
                "concept_coverage": [],
                "concepts_missed": [],
                "misconceptions_found": [],
                "scored_by": "fallback",
            }
    score = _score_answer(answer_text)
    return {
        "score": score,
        "feedback": "Good" if score >= GOOD_SCORE_THRESHOLD else "Needs work",
        "concept_coverage": [],
        "concepts_missed": [],
        "misconceptions_found": [],
        "scored_by": "fallback",
    }


async def claim_score_job(db: Database) -> dict | None:
    """Atomically claim one pending scoring job. Returns None when idle."""
    row = await db.fetchrow(
        """UPDATE score_jobs SET status = 'scoring', attempts = attempts + 1
           WHERE id = (
             SELECT id FROM score_jobs
             WHERE status = 'pending'
             ORDER BY created_at
             LIMIT 1
             FOR UPDATE SKIP LOCKED
           )
           RETURNING *"""
    )
    return dict(row) if row else None


async def reset_stale_jobs(db: Database, older_than_seconds: int = 300) -> int:
    """Return crashed 'scoring' jobs to pending. Run once at worker startup."""
    rows = await db.fetch(
        """UPDATE score_jobs SET status = 'pending'
           WHERE status = 'scoring'
           AND created_at < NOW() - make_interval(secs => $1)
           RETURNING id""",
        float(older_than_seconds),
    )
    if rows:
        logger.info(f"Reset {len(rows)} stale scoring jobs to pending")
    return len(rows)


async def process_score_job(cache: CacheService, db: Database, job: dict) -> None:
    """Score one job and ack the result into the session state."""
    job_id = job["id"]
    try:
        snapshot = job["question_snapshot"]
        if isinstance(snapshot, str):
            snapshot = json.loads(snapshot)
        transcript = job["transcript"] or ""

        if snapshot.get("reference_answer"):
            result = await _score_with_gemini(snapshot, transcript)
        else:
            score = _score_answer(transcript)
            result = {
                "score": score,
                "feedback": "Good" if score >= GOOD_SCORE_THRESHOLD else "Needs work",
                "concept_coverage": [],
                "concepts_missed": [],
                "misconceptions_found": [],
                "scored_by": "fallback",
            }

        state = cache.get(f"session:{job['session_id']}")
        if state is None:
            raise SessionNotFoundError(f"Session not found: {job['session_id']}")
        updated = False
        for answer in state.get("answers", []):
            if answer.get("job_id") == job_id:
                answer.update(
                    {
                        "score": result["score"],
                        "feedback": result["feedback"],
                        "concept_coverage": result["concept_coverage"],
                        "concepts_missed": result["concepts_missed"],
                        "misconceptions_found": result["misconceptions_found"],
                        "status": "scored",
                        "scored_by": result.get("scored_by", "llm"),
                    }
                )
                updated = True
        for score_entry in state.get("scores", []):
            if score_entry.get("question_index") == job["question_index"]:
                score_entry["score"] = result["score"]
        if not updated:
            raise InvalidAnswerError(f"Answer for job {job_id} not found in session")
        cache.set(f"session:{job['session_id']}", state, ttl=86400)

        await db.execute("UPDATE score_jobs SET status = 'scored' WHERE id = $1", job_id)
    except (SessionNotFoundError, InvalidAnswerError):
        # Session/answer vanished (e.g. TTL expiry) — don't retry forever.
        await db.execute("UPDATE score_jobs SET status = 'failed' WHERE id = $1", job_id)
    except Exception as e:
        logger.warning(f"Scoring job {job_id} failed: {e}")
        if job.get("attempts", 1) >= MAX_JOB_ATTEMPTS:
            await db.execute("UPDATE score_jobs SET status = 'failed' WHERE id = $1", job_id)
        else:
            await db.execute("UPDATE score_jobs SET status = 'pending' WHERE id = $1", job_id)


async def score_worker_loop(
    stop_event: asyncio.Event | None = None,
    poll_interval: float = 2.0,
    max_idle_interval: float = 10.0,
) -> None:
    """Background loop: claim and process scoring jobs, backing off when idle.

    Runs inside the FastAPI process (see lifespan in api/app.py). Survives
    restarts because jobs live in Postgres, not memory. The Database wrapper
    is pool-backed and the cache client is a singleton, so both are created
    once here and reused across iterations.
    """
    from cache.dragonfly import get_cache

    db = Database()
    cache = get_cache()
    idle_interval = poll_interval
    await reset_stale_jobs(db)
    while stop_event is None or not stop_event.is_set():
        try:
            job = await claim_score_job(db)
            if job is None:
                idle_interval = min(idle_interval * 2, max_idle_interval)
                await asyncio.sleep(idle_interval)
                continue
            idle_interval = poll_interval
            await process_score_job(cache, db, job)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"Score worker error: {e}")
            await asyncio.sleep(max_idle_interval)


async def complete_session(
    cache: CacheService,
    db: Database,
    session_id: str,
    user_id: str | None = None,
) -> dict:
    """Complete a session: compute final score, write to DB, clear cache.

    Returns the completed session record.
    """
    state = cache.get(f"session:{session_id}")
    if state is None:
        raise SessionNotFoundError(f"Session not found: {session_id}")
    _require_owner(state, user_id)
    if state.get("status") != "active":
        raise SessionConflictError("Session is already completed")
    if state.get("current_index", 0) != len(state.get("questions", [])):
        raise SessionConflictError("Answer every question or skip it before completing")

    scores = state.get("scores", [])
    # Reconcile any answers still waiting on the background worker first,
    # so readiness is never computed over missing scores.
    await _reconcile_pending_scores(cache, db, state)
    scores = state.get("scores", [])
    valid = [s["score"] for s in scores if isinstance(s.get("score"), int)]
    readiness = round(sum(valid) / len(valid)) if valid else 0

    topic_summary = _aggregate_topic_summary(state.get("answers", []), state.get("questions", []))
    weak_topics = sorted(
        topic
        for topic, data in topic_summary.items()
        if data["average_score"] <= WEAK_SCORE_THRESHOLD
    )

    state["status"] = "completed"
    state["readiness_score"] = readiness
    state["topic_summary"] = topic_summary
    state["weak_topics"] = weak_topics
    state["next_review_suggestion"] = _next_review_suggestion(weak_topics)
    state["completed_at"] = datetime.now(timezone.utc).isoformat()

    # asyncpg needs datetime objects for TIMESTAMPTZ, not the ISO strings
    # we keep in the JSON-serializable cache state.
    now = datetime.now(timezone.utc)
    started_at = _parse_completed_at(state.get("started_at")) or now
    completed_at = _parse_completed_at(state.get("completed_at")) or now

    await db.execute(
        """INSERT INTO sessions (id, user_id, context_id, parent_session_id, is_retest, weak_only,
              questions, answers, scores, readiness_score, topic_summary, weak_topics,
              started_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10,
                   $11::jsonb, $12::jsonb, $13, $14)""",
        state["id"],
        state.get("user_id"),
        state["context_id"],
        state.get("parent_session_id"),
        bool(state.get("is_retest", False)),
        bool(state.get("weak_only", False)),
        json.dumps(state["questions"]),
        json.dumps(state["answers"]),
        json.dumps(state["scores"]),
        readiness,
        json.dumps(topic_summary),
        json.dumps(weak_topics),
        started_at,
        completed_at,
    )

    await _upsert_concept_mastery(db, state)

    cache.delete(f"session:{session_id}")
    cache.delete(f"questions:{state['context_id']}")

    return state


async def _reconcile_pending_scores(
    cache: CacheService,
    db: Database,
    state: dict,
    timeout: float = COMPLETE_WAIT_TIMEOUT,
) -> None:
    """Wait for background scoring acks, then keyword-fallback any leftovers.

    Guarantees complete_session never traps the user and never persists
    unscored answers.
    """
    session_id = state["id"]
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        rows = await db.fetch(
            "SELECT id FROM score_jobs WHERE session_id = $1 AND status IN ('pending', 'scoring')",
            session_id,
        )
        if not rows:
            break
        await asyncio.sleep(COMPLETE_POLL_INTERVAL)

    # The worker writes scored answers into the *cached* session while we
    # wait, so our local snapshot is stale. Refresh in place (keeping the
    # caller's reference valid) before patching leftovers below. The identity
    # check guards caches that return the same object instead of a copy.
    fresh = cache.get(f"session:{session_id}")
    if fresh is not None and fresh is not state:
        state.clear()
        state.update(fresh)

    leftover = await db.fetch(
        "SELECT * FROM score_jobs WHERE session_id = $1 AND status IN ('pending', 'scoring')",
        session_id,
    )
    for job in leftover:
        job = dict(job)
        try:
            snapshot = job["question_snapshot"]
            if isinstance(snapshot, str):
                snapshot = json.loads(snapshot)
            ref = (snapshot or {}).get("reference_answer", "")
            transcript = job["transcript"] or ""
            score = _score_against_reference(ref, transcript) if ref else _score_answer(transcript)
            for answer in state.get("answers", []):
                if answer.get("job_id") == job["id"]:
                    answer.update(
                        {
                            "score": score,
                            "feedback": ("Good" if score >= GOOD_SCORE_THRESHOLD else "Needs work"),
                            "status": "scored",
                            "scored_by": "fallback",
                        }
                    )
            for score_entry in state.get("scores", []):
                if score_entry.get("question_index") == job["question_index"]:
                    score_entry["score"] = score
            await db.execute("UPDATE score_jobs SET status = 'failed' WHERE id = $1", job["id"])
        except Exception as e:
            logger.warning(f"Reconciliation failed for job {job['id']}: {e}")
    cache.set(f"session:{session_id}", state, ttl=86400)


def _aggregate_topic_summary(answers: list[dict], questions: list[dict]) -> dict:
    """Roll per-answer results up to per-topic averages + missed concepts."""
    by_topic: dict[str, dict] = {}
    for answer in answers:
        if not isinstance(answer.get("score"), int):
            continue
        idx = answer.get("question_index", -1)
        question = questions[idx] if 0 <= idx < len(questions) else {}
        topic = (question or {}).get("topic") or "General"
        bucket = by_topic.setdefault(
            topic, {"scores": [], "concepts_missed": [], "misconceptions": []}
        )
        bucket["scores"].append(answer["score"])
        bucket["concepts_missed"].extend(answer.get("concepts_missed", []))
        bucket["misconceptions"].extend(answer.get("misconceptions_found", []))

    summary = {}
    for topic, data in by_topic.items():
        average = round(sum(data["scores"]) / len(data["scores"]))
        summary[topic] = {
            "average_score": average,
            "status": "mastered" if average > WEAK_SCORE_THRESHOLD else "needs_work",
            "question_count": len(data["scores"]),
            "concepts_missed": sorted(set(data["concepts_missed"])),
            "misconceptions": sorted(set(data["misconceptions"])),
        }
    return summary


def _next_review_suggestion(weak_topics: list[str]) -> str:
    """Nudge toward spaced review without blocking an immediate retest."""
    if not weak_topics:
        return "Solid run — all topics look strong. Retest anytime for confidence."
    topics = ", ".join(weak_topics)
    return (
        f"Go clear your concepts on {topics} and come back in some time — "
        "a day of review sticks better. Or retest now if you want another shot immediately."
    )


def _calculate_next_review(score: int, attempts: int) -> datetime:
    """Spaced-repetition schedule: weak topics return tomorrow."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    if score <= WEAK_SCORE_THRESHOLD:
        return now + timedelta(days=1)
    if attempts < 3:
        return now + timedelta(days=7)
    return now + timedelta(days=30)


async def _upsert_concept_mastery(db: Database, state: dict) -> None:
    """Persist best-score-per-question memory for cross-session comparison."""
    for answer in state.get("answers", []):
        if not isinstance(answer.get("score"), int):
            continue
        idx = answer.get("question_index", -1)
        question = (
            state.get("questions", [])[idx] if 0 <= idx < len(state.get("questions", [])) else {}
        )
        question_id = (
            answer.get("question_id")
            or (question or {}).get("id")
            or f"{state['context_id']}:q{idx}"
        )
        topic = (question or {}).get("topic") or "General"
        existing = await db.fetchrow(
            "SELECT best_score, attempts FROM concept_mastery "
            "WHERE context_id = $1 AND question_id = $2",
            state["context_id"],
            question_id,
        )
        attempts = (existing["attempts"] if existing else 0) + 1
        best = answer["score"]
        if existing and isinstance(existing["best_score"], int):
            best = max(existing["best_score"], answer["score"])
        next_review = _calculate_next_review(answer["score"], attempts)
        await db.execute(
            """INSERT INTO concept_mastery
               (id, user_id, context_id, question_id, topic, best_score, attempts,
                last_attempt_at, next_review_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
               ON CONFLICT (context_id, question_id) DO UPDATE SET
                 best_score = GREATEST(concept_mastery.best_score, EXCLUDED.best_score),
                 attempts = concept_mastery.attempts + 1,
                 last_attempt_at = NOW(),
                 next_review_at = EXCLUDED.next_review_at""",
            uuid.uuid4().hex[:12],
            state.get("user_id"),
            state["context_id"],
            question_id,
            topic,
            best,
            attempts,
            next_review,
        )


RETEST_WINDOW_HOURS = 24


class RetestWindowExpiredError(ValueError):
    """Raised when a retest is requested after the review window closed."""


def select_retest_indices(
    answers: list[dict],
    question_count: int,
    weak_only: bool = True,
    count: int | None = None,
) -> list[int]:
    """Pick parent question indices for a retest.

    Weak-only mode selects questions scored at/below WEAK_SCORE_THRESHOLD.
    Raises SessionConflictError when weak-only mode finds nothing to retest.
    """
    if weak_only:
        indices = [
            a["question_index"]
            for a in answers
            if isinstance(a.get("score"), int) and a["score"] <= WEAK_SCORE_THRESHOLD
        ]
        if not indices:
            raise SessionConflictError(
                "No weak areas found — nothing to retest. "
                "Use weak_only=false for a full confidence retest."
            )
    else:
        indices = list(range(question_count))
    if count is not None:
        indices = indices[:count]
    return indices


def _parse_completed_at(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


async def create_retest(
    cache: CacheService,
    db: Database,
    parent_session_id: str,
    weak_only: bool = True,
    count: int | None = None,
    user_id: str | None = None,
) -> tuple[dict, dict]:
    """Create a retest session from a completed parent.

    Returns (new_state, meta) where meta holds weak_topics and
    previous_scores for the UI. Enforces the 24h review window.
    The retest belongs to the caller, never the parent's owner.
    """
    parent = cache.get(f"session:{parent_session_id}")
    if parent is not None:
        try:
            _require_owner(parent, user_id)
        except SessionNotFoundError:
            parent = None
    if parent is None:
        if user_id is None:
            row = await db.fetchrow("SELECT * FROM sessions WHERE id = $1", parent_session_id)
        else:
            row = await db.fetchrow(
                "SELECT * FROM sessions WHERE id = $1 AND user_id = $2",
                parent_session_id,
                user_id,
            )
        if row is None:
            raise SessionNotFoundError(f"Parent session not found: {parent_session_id}")
        if not row["completed_at"]:
            raise SessionConflictError("Complete the parent session before retesting")
        parent = {
            "id": row["id"],
            "context_id": row["context_id"],
            "questions": json.loads(row["questions"])
            if isinstance(row["questions"], str)
            else row["questions"],
            "answers": json.loads(row["answers"])
            if isinstance(row["answers"], str)
            else row["answers"],
            "status": "completed",
            "completed_at": row["completed_at"],
        }
    if parent.get("status", "completed") != "completed":
        raise SessionConflictError("Complete the parent session before retesting")

    completed_at = _parse_completed_at(parent.get("completed_at"))
    if completed_at is not None:
        from datetime import timedelta

        age = datetime.now(timezone.utc) - completed_at
        if age > timedelta(hours=RETEST_WINDOW_HOURS):
            raise RetestWindowExpiredError(
                "The 24h retest window for this session has closed. "
                "Start a fresh session to practice these topics again."
            )

    questions = parent.get("questions") or []
    if not questions:
        raise SessionNotFoundError(f"No questions found for session: {parent_session_id}")
    answers = parent.get("answers") or []

    indices = select_retest_indices(answers, len(questions), weak_only, count)

    by_index = {a.get("question_index"): a for a in answers}
    retest_qs = []
    previous_scores: dict[str, int] = {}
    # Topics of the selected questions — only "weak" when weak_only=True.
    selected_topics: set[str] = set()
    for idx in indices:
        source = dict(questions[idx])
        prior = by_index.get(idx, {})
        if isinstance(prior.get("score"), int):
            qid = source.get("id") or f"{parent['context_id']}:q{idx}"
            previous_scores[qid] = prior["score"]
            source["previous_attempt"] = {
                "score": prior["score"],
                "concepts_missed": prior.get("concepts_missed", []),
                "misconceptions_found": prior.get("misconceptions_found", []),
            }
        if source.get("topic"):
            selected_topics.add(source["topic"])
        retest_qs.append(source)

    state = await create_session(
        cache,
        parent["context_id"],
        retest_qs,
        parent_session_id=parent_session_id,
        weak_only=weak_only,
        user_id=user_id,
    )
    meta = {"selected_topics": sorted(selected_topics), "previous_scores": previous_scores}
    return state, meta


def _get_question(state: dict, question_index: int) -> dict | None:
    """Fetch the question dict for a given index."""
    questions = state.get("questions") or []
    if 0 <= question_index < len(questions):
        return questions[question_index]
    return None


async def _score_with_gemini(question: dict, answer_text: str) -> dict:
    """Use OpenRouter to score answer against enriched rubric.

    Returns dict with score, feedback, concept_coverage, concepts_missed,
    misconceptions_found.
    """
    from services.openrouter_service import _call_openrouter

    prompt = (
        "You are an educational scoring assistant. Score the student's answer "
        "against the question's rubric and reference answer.\n\n"
        f"QUESTION: {question['text']}\n\n"
        f"REFERENCE ANSWER: {question.get('reference_answer', '')}\n\n"
        f"SCORING RUBRIC:\n"
        f"- Excellent (90-100): {question.get('scoring_rubric', {}).get('excellent', '')}\n"
        f"- Good (70-89): {question.get('scoring_rubric', {}).get('good', '')}\n"
        f"- Needs work (<70): {question.get('scoring_rubric', {}).get('needs_work', '')}\n\n"
        f"TARGET CONCEPTS: {json.dumps(question.get('target_concepts', []))}\n\n"
        f"REQUIRED RELATIONSHIPS: {json.dumps(question.get('required_relationships', []))}\n\n"
        f"COMMON MISCONCEPTIONS: {json.dumps(question.get('common_misconceptions', []))}\n\n"
        f"STUDENT ANSWER: {answer_text}\n\n"
        "Return ONLY a JSON object:\n"
        '{"score": 0-100, "feedback": "detailed feedback", '
        '"concept_coverage": ["concept1"], "concepts_missed": ["concept2"], '
        '"misconceptions_found": ["misconception1"]}'
    )

    try:
        response_text = await _call_openrouter(prompt)
        cleaned = response_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        result = json.loads(cleaned)
        score_val = int(result.get("score", 0))
        return {
            "score": max(0, min(100, score_val)),
            "feedback": str(
                result.get(
                    "feedback",
                    "Good" if score_val >= GOOD_SCORE_THRESHOLD else "Needs work",
                )
            ),
            "concept_coverage": _ensure_list(result.get("concept_coverage")),
            "concepts_missed": _ensure_list(result.get("concepts_missed")),
            "misconceptions_found": _ensure_list(result.get("misconceptions_found")),
            "scored_by": "llm",
        }
    except Exception:
        ref = question.get("reference_answer", "")
        score = _score_against_reference(ref, answer_text) if ref else _score_answer(answer_text)
        return {
            "score": score,
            "feedback": "Good" if score >= GOOD_SCORE_THRESHOLD else "Needs work",
            "concept_coverage": [],
            "concepts_missed": [],
            "misconceptions_found": [],
            "scored_by": "fallback",
        }


def _ensure_list(value: object) -> list[str]:
    """Coerce a value to a list of strings."""
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


_STOPWORDS = frozenset(
    """
    a an the and or but if then else when while of at by for with about into
    through during before after above below to from up down in out on off over
    under again further once here there all any both each few more most other
    some such no nor not only own same so than too very can will just should
    now is are was were be been being have has had having do does did doing
    would could ought i you he she it we they them his her its our their this
    that these those as it s t
    """.split()
)


def _keywords(text: str) -> set[str]:
    """Content-bearing tokens used for answer comparison."""
    import re

    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {t for t in tokens if len(t) >= 3 and t not in _STOPWORDS}


def _score_against_reference(reference: str, answer_text: str) -> int:
    """Score a learner answer by keyword coverage of the reference answer.

    Fallback scoring when Gemini is unavailable.
    Returns 0-100.
    """
    ref_keys = _keywords(reference)
    if not ref_keys:
        return _score_answer(answer_text)
    ans_keys = _keywords(answer_text)
    if not ans_keys:
        return 0
    overlap = ref_keys & ans_keys
    recall = len(overlap) / len(ref_keys)
    precision = len(overlap) / len(ans_keys)
    return max(0, min(100, round(100 * (0.8 * recall + 0.2 * precision))))


def _score_answer(answer_text: str) -> int:
    """Placeholder scoring — returns a deterministic score based on length."""
    length = len(answer_text.strip())
    if length == 0:
        return 0
    if length < 20:
        return 30
    if length < 50:
        return 50
    if length < 100:
        return 70
    if length < 200:
        return 85
    return 95


# ---------------------------------------------------------------------------
# Saved sessions — bookmark completed sessions (flag on the row, no copies)
# ---------------------------------------------------------------------------


def _clean_title(title: str | None) -> str | None:
    if title is None:
        return None
    cleaned = title.strip()
    return cleaned or None


async def save_session(
    db: Database,
    session_id: str,
    user_id: str | None,
    title: str | None = None,
) -> dict:
    """Bookmark a completed session. Raises SessionNotFoundError unless the
    row exists, belongs to the caller, and is completed."""
    row = await db.fetchrow(
        "UPDATE sessions SET is_saved = TRUE, saved_at = NOW(), "
        "title = COALESCE($3, title) "
        "WHERE id = $1 AND user_id = $2 AND completed_at IS NOT NULL "
        "RETURNING id, title, is_saved, saved_at",
        session_id,
        user_id,
        _clean_title(title),
    )
    if row is None:
        raise SessionNotFoundError(f"Session not found: {session_id}")
    record = dict(row)
    if record.get("saved_at") is not None:
        record["saved_at"] = record["saved_at"].isoformat()
    return record


async def unsave_session(db: Database, session_id: str, user_id: str | None) -> None:
    """Remove the bookmark (row kept). Raises SessionNotFoundError on miss."""
    row = await db.fetchrow(
        "UPDATE sessions SET is_saved = FALSE, saved_at = NULL "
        "WHERE id = $1 AND user_id = $2 RETURNING id",
        session_id,
        user_id,
    )
    if row is None:
        raise SessionNotFoundError(f"Session not found: {session_id}")


async def rename_session(db: Database, session_id: str, user_id: str | None, title: str) -> dict:
    """Rename a saved session. Raises SessionNotFoundError on miss."""
    cleaned = _clean_title(title)
    if not cleaned or len(cleaned) > 80:
        raise ValueError("Title must be 1-80 characters")
    row = await db.fetchrow(
        "UPDATE sessions SET title = $3 "
        "WHERE id = $1 AND user_id = $2 AND is_saved RETURNING id, title",
        session_id,
        user_id,
        cleaned,
    )
    if row is None:
        raise SessionNotFoundError(f"Session not found: {session_id}")
    return dict(row)


async def list_saved_sessions(db: Database, user_id: str | None) -> list[dict]:
    """Newest-first saved sessions with their context subject for display."""
    rows = await db.fetch(
        "SELECT s.id, s.title, c.subject, s.readiness_score, "
        "COALESCE(jsonb_array_length(s.questions), 0) AS question_count, "
        "COALESCE(jsonb_array_length(s.weak_topics), 0) AS weak_count, "
        "s.completed_at, s.saved_at "
        "FROM sessions s LEFT JOIN contexts c ON c.id = s.context_id "
        "WHERE s.user_id = $1 AND s.is_saved ORDER BY s.saved_at DESC",
        user_id,
    )
    result = []
    for row in rows:
        record = dict(row)
        if record.get("completed_at") is not None:
            record["completed_at"] = record["completed_at"].isoformat()
        if record.get("saved_at") is not None:
            record["saved_at"] = record["saved_at"].isoformat()
        result.append(record)
    return result
