"""Domain models for uploaded study material."""

from __future__ import annotations

import hashlib
from enum import Enum

from pydantic import BaseModel, Field, computed_field


class MaterialKind(str, Enum):
    """Where a source document came from."""

    PDF = "pdf"
    TEXT = "text"
    MARKDOWN = "markdown"


class SourcePage(BaseModel):
    """A single page (PDF) or section (text/markdown) of a source document."""

    page_number: int
    text: str


class SourceDocument(BaseModel):
    """Normalized study material extracted from one upload."""

    source_id: str
    name: str
    kind: MaterialKind
    pages: list[SourcePage] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)

    @computed_field
    @property
    def page_count(self) -> int:
        return len(self.pages)

    @computed_field
    @property
    def full_text(self) -> str:
        return "\n\n".join(page.text for page in self.pages if page.text.strip())

    @computed_field
    @property
    def word_count(self) -> int:
        return len(self.full_text.split())


def build_source_document(
    *,
    name: str,
    kind: MaterialKind,
    pages: list[SourcePage],
) -> SourceDocument:
    """Create a source document with a stable, content-derived id."""
    digest = hashlib.sha1(name.encode("utf-8"))
    for page in pages:
        digest.update(page.text.encode("utf-8"))
    full = "\n\n".join(page.text for page in pages if page.text.strip())
    try:
        from ingestion.clean import extract_keywords

        keywords = extract_keywords(full)
    except Exception:
        keywords = []
    return SourceDocument(
        source_id=digest.hexdigest()[:12],
        name=name,
        kind=kind,
        pages=pages,
        keywords=keywords,
    )
