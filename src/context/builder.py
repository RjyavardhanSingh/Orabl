"""Combine uploaded material and a learning goal into one LearningContext."""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path

from ingestion import extract_path, extract_text
from models import (
    ContextStats,
    LearningContext,
    LearningGoal,
    MaterialKind,
    SourceDocument,
)

WORDS_PER_MINUTE = 200


class ContextBuildError(RuntimeError):
    """Raised when a context cannot be built."""


def _estimate_reading_minutes(word_count: int) -> int:
    if word_count <= 0:
        return 0
    return max(1, round(word_count / WORDS_PER_MINUTE))


def _make_context_id(sources: list[SourceDocument], user_id: str | None = None) -> str:
    """Flow-pinned identity: user + material set only.

    Goal text is deliberately EXCLUDED so back-navigation and goal edits
    reuse one context per flow instead of forking an orphan per keystroke.
    Different materials (or user) still fork correctly.
    """
    digest = hashlib.sha1()
    digest.update((user_id or "").encode("utf-8"))
    for source_id in sorted(source.source_id for source in sources):
        digest.update(source_id.encode("utf-8"))
    return digest.hexdigest()[:12]


class ContextBuilder:
    """Fluent builder: add material, set a goal, then build.

    This is the Phase-1 context builder. Downstream stages (scope, curriculum,
    examiner) consume the resulting ``LearningContext``.
    """

    def __init__(self) -> None:
        self._sources: list[SourceDocument] = []
        self._goal: LearningGoal | None = None
        self._user_id: str | None = None

    def add_file(self, path: str | Path) -> ContextBuilder:
        """Ingest a PDF, Markdown, or text file."""
        self._sources.append(extract_path(path))
        return self

    def add_text(
        self,
        content: str,
        *,
        name: str = "pasted-notes.txt",
        kind: MaterialKind = MaterialKind.TEXT,
    ) -> ContextBuilder:
        """Ingest pasted notes (plain text or Markdown)."""
        self._sources.append(extract_text(content, name=name, kind=kind))
        return self

    def add_source(self, source: SourceDocument) -> ContextBuilder:
        """Ingest an already-extracted source document."""
        self._sources.append(source)
        return self

    def with_goal(self, goal: LearningGoal) -> ContextBuilder:
        """Attach the learning goal that gives practice its purpose."""
        self._goal = goal
        return self

    def for_user(self, user_id: str | None) -> ContextBuilder:
        """Scope the context identity to a user (flow pinning)."""
        self._user_id = user_id
        return self

    def build(self) -> LearningContext:
        """Validate the inputs and produce an immutable context snapshot."""
        if self._goal is None:
            raise ContextBuildError("A learning goal is required before building context.")

        sources = [source for source in self._sources if source.full_text]
        if not sources:
            raise ContextBuildError("Add at least one source with readable text.")

        word_count = sum(source.word_count for source in sources)
        stats = ContextStats(
            source_count=len(sources),
            page_count=sum(source.page_count for source in sources),
            word_count=word_count,
            reading_minutes=_estimate_reading_minutes(word_count),
        )

        return LearningContext(
            context_id=_make_context_id(sources, self._user_id),
            goal=self._goal,
            sources=sources,
            stats=stats,
            built_at=datetime.now(timezone.utc),
        )


def build_context(
    *,
    goal: LearningGoal,
    files: Sequence[str | Path] = (),
    text: str | None = None,
    text_name: str = "pasted-notes.txt",
) -> LearningContext:
    """Convenience one-shot wrapper around :class:`ContextBuilder`."""
    builder = ContextBuilder().with_goal(goal)
    for file in files:
        builder.add_file(file)
    if text:
        builder.add_text(text, name=text_name)
    return builder.build()
