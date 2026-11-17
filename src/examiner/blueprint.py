"""Exam blueprint: the concepts a context examines, their prerequisites, and one seed question each.

Generated once per context at "Preparing". The model proposes; everything here decides what is
kept. Free models are unreliable at strict JSON, so normalisation is defensive: bad concepts are
dropped, unknown prerequisites ignored, cycles broken, and quotes kept only if they really occur
in the material. Too little left over raises ValueError so the caller retries.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid

from db.connection import Database
from services.openrouter_service import (
    RETRY_DELAYS,
    _is_auth_error,
    _status_code,
    _truncate_content,
    call_openrouter_with_model,
)

logger = logging.getLogger(__name__)

BLUEPRINT_PROMPT_VERSION = "blueprint-v1"
MIN_CONCEPTS = 2
MAX_CONCEPTS = 12
MAX_KEY_LENGTH = 60


def concept_count(word_count: int) -> int:
    """How many concepts to ask for: enough to cover the material, few enough to examine."""
    if word_count < 2000:
        return 4
    if word_count < 10000:
        return 6
    if word_count < 50000:
        return 9
    return MAX_CONCEPTS


def build_prompt(material: str, goal: dict, count: int) -> str:
    return (
        "You are preparing an oral examination. From the study material below, identify the "
        f"{count} most important concepts a learner must be able to explain to reach their goal. "
        "For each, write one opening exam question that makes the learner explain it in their "
        "own words (not a yes/no or one-word recall question).\n\n"
        f"GOAL: subject={goal.get('subject', '')}; target={goal.get('target', '')}; "
        f"level={goal.get('level', '')}\n\n"
        f"MATERIAL:\n{material}\n\n"
        "Rules:\n"
        '- "key": short lowercase-hyphenated id, unique.\n'
        '- "prerequisites": keys of other concepts in this list that must be understood first.\n'
        '- "importance": 1 (minor) to 3 (central).\n'
        '- "must_include": the 2-4 points a strong answer has to make.\n'
        '- "source_quote": one sentence copied exactly from the material that supports the '
        "reference answer.\n\n"
        "Return ONLY this JSON object, no other text:\n"
        '{"concepts": [{"key": "...", "name": "...", "summary": "one sentence", '
        '"prerequisites": ["..."], "importance": 2, '
        '"question": "...", "reference_answer": "...", "must_include": ["..."], '
        '"common_misconceptions": ["..."], "source_quote": "..."}]}'
    )


def _slug(value: object) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return slug[:MAX_KEY_LENGTH].strip("-")


def _text(value: object) -> str:
    return str(value or "").strip()


def _strings(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [s for s in (_text(v) for v in value) if s]


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _grounded(quote: str, material: str) -> str:
    """The quote if it really occurs in the material (ignoring case and spacing), else ''."""
    squashed = _squash(quote)
    if len(squashed) < 12:
        return ""
    return quote if squashed in _squash(material) else ""


def _importance(value: object) -> int:
    try:
        return min(3, max(1, int(value)))
    except (TypeError, ValueError):
        return 2


def _reaches(edges: dict[str, list[str]], start: str, target: str) -> bool:
    """True if `target` is reachable from `start` along prerequisite edges."""
    stack, seen = [start], set()
    while stack:
        node = stack.pop()
        if node == target:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(edges.get(node, []))
    return False


def _topological(concepts: list[dict]) -> list[dict]:
    """Prerequisites before dependants; otherwise keep the model's order."""
    by_key = {c["key"]: c for c in concepts}
    ordered: list[dict] = []
    placed: set[str] = set()

    def place(key: str) -> None:
        if key in placed:
            return
        placed.add(key)
        for prerequisite in by_key[key]["prerequisites"]:
            place(prerequisite)
        ordered.append(by_key[key])

    for concept in concepts:
        place(concept["key"])
    return ordered


def normalize_blueprint(raw: object, material: str) -> list[dict]:
    """Coerce a model reply into a validated, prerequisite-ordered concept list."""
    items = raw.get("concepts") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        raise ValueError("Blueprint has no concept list")

    concepts: list[dict] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"))
        key = _slug(item.get("key")) or _slug(name)
        question = _text(item.get("question"))
        reference = _text(item.get("reference_answer"))
        # A seed the examiner cannot score is no use; drop the concept rather than guess.
        if not name or not key or key in seen or not question or not reference:
            continue
        seen.add(key)
        concepts.append(
            {
                "key": key,
                "name": name,
                "summary": _text(item.get("summary")),
                "prerequisites": [_slug(p) for p in _strings(item.get("prerequisites"))],
                "importance": _importance(item.get("importance")),
                "question": question,
                "reference_answer": reference,
                "must_include": _strings(item.get("must_include")),
                "common_misconceptions": _strings(item.get("common_misconceptions")),
                "source_quote": _grounded(_text(item.get("source_quote")), material),
            }
        )
        if len(concepts) == MAX_CONCEPTS:
            break

    if len(concepts) < MIN_CONCEPTS:
        raise ValueError(f"Blueprint has {len(concepts)} usable concepts, need {MIN_CONCEPTS}")

    # Keep only edges to known concepts, in proposal order, skipping any that would close a cycle.
    known = {c["key"] for c in concepts}
    edges: dict[str, list[str]] = {}
    for concept in concepts:
        kept: list[str] = []
        for prerequisite in dict.fromkeys(concept["prerequisites"]):
            if prerequisite not in known or prerequisite == concept["key"]:
                continue
            if _reaches(edges, prerequisite, concept["key"]):
                continue
            kept.append(prerequisite)
            edges[concept["key"]] = kept
        concept["prerequisites"] = kept
    return _topological(concepts)


def blueprint_questions(concepts: list[dict]) -> list[dict]:
    """One seed question per concept, in the shape the session and scorer already use."""
    questions = []
    for concept in concepts:
        points = "; ".join(concept["must_include"]) or concept["reference_answer"]
        questions.append(
            {
                "text": concept["question"],
                "topic": concept["name"],
                "concept_key": concept["key"],
                "prerequisites": concept["prerequisites"],
                "importance": concept["importance"],
                "target_concepts": concept["must_include"],
                "required_relationships": [],
                "acceptable_alternatives": [],
                "common_misconceptions": concept["common_misconceptions"],
                "reference_answer": concept["reference_answer"],
                "scoring_rubric": {
                    "excellent": f"Explains all of: {points}",
                    "good": f"Explains most of: {points}",
                    "needs_work": f"Misses or confuses: {points}",
                },
                # Supports the reference answer, so it stays server-side until results.
                "source_quote": concept["source_quote"],
                "source_citations": [],
            }
        )
    return questions


def _parse(text: str) -> object:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else ""
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Free models often wrap the object in prose; take the outermost braces.
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(cleaned[start : end + 1])


async def generate_blueprint(material: str, goal: dict, word_count: int) -> dict:
    """Ask the model for a blueprint, retrying on unusable replies.

    Returns {"concepts": [...], "model": str, "prompt_version": str}.
    """
    material = _truncate_content(material)
    prompt = build_prompt(material, goal, concept_count(word_count))
    last_error: Exception | None = None
    for delay in RETRY_DELAYS:
        try:
            text, model = await call_openrouter_with_model(prompt)
            concepts = normalize_blueprint(_parse(text), material)
            return {
                "concepts": concepts,
                "model": model,
                "prompt_version": BLUEPRINT_PROMPT_VERSION,
            }
        except Exception as e:
            if _is_auth_error(e):
                raise
            last_error = e
            logger.warning(f"Blueprint attempt failed: {e}; retrying in {delay}s")
            await asyncio.sleep(delay)
    if last_error is not None and _status_code(last_error) == 429:
        raise RuntimeError(
            "OpenRouter is still rate-limiting this key (429). Wait a minute and retry."
        ) from last_error
    raise RuntimeError("Could not prepare this material. Try again.") from last_error


async def save_concepts(db: Database, user_id: str, context_id: str, concepts: list[dict]) -> None:
    """Upsert the user's concepts (one row per key across all contexts) and link the context."""
    ids: dict[str, str] = {}
    for position, concept in enumerate(concepts):
        row = await db.fetchrow(
            """INSERT INTO concepts (id, user_id, key, name, summary)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (user_id, key) DO UPDATE SET
                 name = EXCLUDED.name, summary = EXCLUDED.summary
               RETURNING id""",
            uuid.uuid4().hex[:16],
            user_id,
            concept["key"],
            concept["name"],
            concept["summary"],
        )
        ids[concept["key"]] = row["id"]
        await db.execute(
            """INSERT INTO context_concepts (context_id, concept_id, position, importance)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (context_id, concept_id) DO UPDATE SET
                 position = EXCLUDED.position, importance = EXCLUDED.importance""",
            context_id,
            row["id"],
            position,
            concept["importance"],
        )
    for concept in concepts:
        for prerequisite in concept["prerequisites"]:
            await db.execute(
                """INSERT INTO concept_edges (user_id, concept_id, prerequisite_id)
                   VALUES ($1, $2, $3) ON CONFLICT DO NOTHING""",
                user_id,
                ids[concept["key"]],
                ids[prerequisite],
            )
