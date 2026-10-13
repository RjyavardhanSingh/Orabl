"""Lightweight text cleanup + keyword extraction for ingested material.

Design:
- ``clean_text`` keeps grammar intact for the LLM (whitespace, hyphenation,
  repeating characters, boilerplate lines). This is what shrinks OpenRouter
  input tokens with zero quality loss.
- Stopwords are NOT deleted from ``clean_text`` — grammar-less soup makes
  worse questions. They are only filtered in ``extract_keywords``, which
  produces a small ``Key terms`` hint sent alongside the cleaned text.
"""

from __future__ import annotations

import re
from collections import Counter

# ~180 common English stopwords + single letters. Domain-neutral on purpose:
# subject terms (cell, energy, mitosis) are never in here.
STOPWORDS = frozenset(
    """
    a an and are as at be because been before being between both but by can
    cannot could did do does doing down during each few for from further had
    has have having he her here hers herself him himself his how i if in into
    is it its itself like me more most my myself no nor not of off on once
    only or other ought our ours ourselves out over own same she should so
    some such than that the their theirs them themselves then there these
    they this those through to too under until up very was we were what when
    where which while who whom why with would you your yours yourself
    yourselves also just than then there when where like get got much many
    one two also per via within without along across among around
    b c d e f g h j k l m n o p q r s t u v w x y z
    """.split()
)

_LIGATURES = str.maketrans({"ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl"})

# word-hyphen + newline artefact from PDF line wraps: "photo-\nsynthesis"
_HYPHEN_WRAP = re.compile(r"(\w)-\n(\w)")
# repeating punctuation runs: "----", "....", "!!!!", "____" (excludes '#' to keep md headings)
_REPEAT_PUNCT = re.compile(r"([\-._~*+=|!?:;])\1{3,}")
# repeating characters in words: "helloooo" -> "helloo" (cap at 2, safe for "book", "cell")
_REPEAT_CHARS = re.compile(r"(.)\1{2,}")
# collapse any whitespace run to a single space
_WHITESPACE = re.compile(r"\s+")
# lines that are only a page number / folio: "12", "- 12 -", "Page 12"
_PAGE_NUMBER = re.compile(r"^\s*(?:page\s+\d+|\d+\s*/\s*\d+|-?\s*\d+\s*-?)\s*$", re.IGNORECASE)
# token pattern for keywords: alpha words, len >= 3 (done in code)
_TOKEN = re.compile(r"[a-z]{3,}")


def clean_text(text: str) -> str:
    """Normalize one page/section. Keeps grammar, drops token waste."""
    if not text:
        return ""
    text = text.translate(_LIGATURES)
    text = _HYPHEN_WRAP.sub(r"\1\2", text)
    # join single newlines inside paragraphs, keep paragraph breaks
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    text = _REPEAT_PUNCT.sub(r"\1\1", text)
    text = _REPEAT_CHARS.sub(r"\1\1", text)
    lines = [line.strip() for line in text.split("\n")]
    kept: list[str] = []
    for line in lines:
        if not line:
            continue
        if _PAGE_NUMBER.match(line):
            continue
        if len(line) < 3 and not line.isalnum():
            continue
        kept.append(line)
    text = "\n".join(kept)
    text = _WHITESPACE.sub(" ", text)
    # restore paragraph breaks that whitespace collapse ate: keep single-line
    return text.strip()


def drop_boilerplate(pages: list[str], *, min_pages: int = 3) -> list[str]:
    """Remove lines repeated on most pages (headers/footers) + dup pages.

    Only kicks in with >= ``min_pages`` pages so tiny docs are untouched.
    """
    if len(pages) < min_pages:
        return pages
    line_pages: Counter[str] = Counter()
    split_pages = [[ln.strip() for ln in p.split("\n") if ln.strip()] for p in pages]
    for lines in split_pages:
        for line in set(lines):
            if len(line) > 3:
                line_pages[line] += 1
    threshold = max(2, int(len(pages) * 0.5))
    boilerplate = {line for line, n in line_pages.items() if n >= threshold and len(line) < 120}
    if not boilerplate:
        return pages
    cleaned = []
    for lines in split_pages:
        kept = [ln for ln in lines if ln not in boilerplate]
        cleaned.append(" ".join(kept).strip())
    return cleaned


def clean_pages(pages: list[str]) -> list[str]:
    """Full per-document pass: clean each page, drop boilerplate/empties/dupes."""
    cleaned = [clean_text(p) for p in pages]
    cleaned = drop_boilerplate(cleaned)
    # drop empties and exact consecutive duplicates (scanned-PDF artefacts)
    out: list[str] = []
    for page in cleaned:
        if not page or len(page) < 10:
            continue
        if out and out[-1] == page:
            continue
        out.append(page)
    return out


def strip_stopwords(text: str) -> str:
    """Return keyword-soup (stopwords removed). For diagnostics/IR only — NOT for the LLM prompt."""
    toks = re.findall(r"[a-zA-Z]+", text.lower())
    return " ".join(t for t in toks if t not in STOPWORDS and len(t) >= 3)


def extract_keywords(text: str, *, top_n: int = 50) -> list[str]:
    """Top-N frequent non-stopword terms. Used as a `Key terms` prompt hint."""
    toks = _TOKEN.findall(text.lower())
    freq = Counter(t for t in toks if t not in STOPWORDS)
    return [word for word, _ in freq.most_common(top_n)]
