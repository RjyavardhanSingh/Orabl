"""Extract normalized sections from Markdown uploads."""

from __future__ import annotations

import re
from pathlib import Path

from ingestion.clean import clean_text
from models import MaterialKind, SourceDocument, SourcePage, build_source_document

_HEADING = re.compile(r"^#{1,6}\s+.*$", re.MULTILINE)


def split_sections(content: str) -> list[str]:
    """Split Markdown so that each heading starts a new section."""
    matches = list(_HEADING.finditer(content))
    if not matches:
        stripped = content.strip()
        return [stripped] if stripped else []

    sections: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        section = content[match.start() : end].strip()
        if section:
            sections.append(section)

    preamble = content[: matches[0].start()].strip()
    if preamble:
        sections.insert(0, preamble)
    return sections


def extract_markdown(content: str, *, name: str = "pasted-notes.md") -> SourceDocument:
    """Wrap Markdown as a source document with one section per heading."""
    pages = [
        SourcePage(page_number=index + 1, text=clean_text(section))
        for index, section in enumerate(split_sections(content))
        if clean_text(section)
    ]
    return build_source_document(name=name, kind=MaterialKind.MARKDOWN, pages=pages)


def extract_markdown_file(path: str | Path) -> SourceDocument:
    """Read a ``.md`` / ``.markdown`` file and split it into sections."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Markdown file not found: {path}")

    content = path.read_text(encoding="utf-8", errors="replace")
    return extract_markdown(content, name=path.name)
