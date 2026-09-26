"""Material upload and retrieval service."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from db.connection import Database
from ingestion import extract_path, extract_text
from models import MaterialKind, SourceDocument
from services.object_storage import get_presigned_url
from services.object_storage import upload_file as s3_upload

BUCKET = os.getenv("NEON_STORAGE_BUCKET", "materials")


def namespaced_id(user_id: str | None, content_id: str) -> str:
    """Derive the row ID for a material.

    Content-derived IDs collide across users (same file → same ID), which
    breaks per-user ownership once reads are scoped. Mixing the owner's
    user_id into the hash gives every user an independent ID space with no
    schema change. None preserves the legacy bare content ID.
    """
    if not user_id:
        return content_id
    return hashlib.sha256(f"{user_id}:{content_id}".encode("utf-8")).hexdigest()[:16]


async def upload_pdf(
    db: Database, filename: str, data: bytes, user_id: str | None = None
) -> SourceDocument:
    """Store PDF in object storage, extract text, save metadata to DB."""
    safe_filename = Path(filename).name
    if not safe_filename.lower().endswith(".pdf"):
        raise ValueError("Expected a PDF file")
    content_hash = hashlib.sha256(data).hexdigest()[:16]
    object_key = f"pdfs/{content_hash}/{safe_filename}"

    s3_upload(BUCKET, object_key, data, content_type="application/pdf")

    temp_path = _write_temp(data, safe_filename)
    try:
        doc = extract_path(temp_path)
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass

    row_id = namespaced_id(user_id, doc.source_id)
    await db.execute(
        """INSERT INTO materials (id, user_id, name, kind, full_text, page_count, word_count,
              object_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING""",
        row_id,
        user_id,
        safe_filename,
        doc.kind.value,
        doc.full_text,
        doc.page_count,
        doc.word_count,
        object_key,
    )
    return doc.model_copy(update={"source_id": row_id})


async def upload_text(
    db: Database,
    content: str,
    name: str = "pasted-notes.txt",
    kind: MaterialKind = MaterialKind.TEXT,
    user_id: str | None = None,
) -> SourceDocument:
    """Ingest pasted text and store in DB. Returns the source document."""
    doc = extract_text(content, name=name, kind=kind)
    row_id = namespaced_id(user_id, doc.source_id)
    await db.execute(
        """INSERT INTO materials (id, user_id, name, kind, full_text, page_count, word_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING""",
        row_id,
        user_id,
        doc.name,
        doc.kind.value,
        doc.full_text,
        doc.page_count,
        doc.word_count,
    )
    return doc.model_copy(update={"source_id": row_id})


async def get_material(db: Database, material_id: str, user_id: str | None = None) -> dict | None:
    """Fetch a material record by ID. Scoped to the owner; чужой rows read as missing."""
    if user_id is None:
        row = await db.fetchrow("SELECT * FROM materials WHERE id = $1", material_id)
    else:
        row = await db.fetchrow(
            "SELECT * FROM materials WHERE id = $1 AND user_id = $2", material_id, user_id
        )
    return dict(row) if row else None


def get_download_url(material: dict) -> str | None:
    """Get a presigned download URL for a material's file, if it has one."""
    object_key = material.get("object_key")
    if not object_key:
        return None
    return get_presigned_url(BUCKET, object_key)


def _write_temp(data: bytes, filename: str) -> str:
    """Write bytes to a temp file and return the path."""
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=f"_{filename}", delete=False) as f:
        f.write(data)
        return f.name
