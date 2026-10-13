"""Extract normalized text from plain-text uploads."""

from __future__ import annotations

from pathlib import Path

from ingestion.clean import clean_text
from models import MaterialKind, SourceDocument, SourcePage, build_source_document


def extract_text(content: str, *, name: str = "pasted-notes.txt") -> SourceDocument:
    """Wrap raw text as a single-page source document."""
    return build_source_document(
        name=name,
        kind=MaterialKind.TEXT,
        pages=[SourcePage(page_number=1, text=clean_text(content))],
    )


def extract_text_file(path: str | Path) -> SourceDocument:
    """Read a ``.txt`` file and wrap it as a source document."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Text file not found: {path}")

    content = path.read_text(encoding="utf-8", errors="replace")
    return extract_text(content, name=path.name)
