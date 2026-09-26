"""Upload — unified material ingestion.

Single logical step: POST /materials handles both JSON text/markdown and
multipart PDF. POST /materials/upload is kept as alias (duplicate removed
from docs) to avoid breaking existing clients.
"""

import os
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from api.schemas import MaterialDownloadResponse, MaterialResponse, MaterialUpload
from db.connection import Database, get_db
from services import material_service
from services.auth_service import CurrentUser, get_current_user

router = APIRouter(prefix="/materials", tags=["Upload"])
MAX_PDF_BYTES = int(os.getenv("MAX_PDF_UPLOAD_BYTES", str(25 * 1024 * 1024)))


def _to_response(doc) -> MaterialResponse:
    return MaterialResponse(
        id=doc.source_id,
        name=doc.name,
        kind=doc.kind.value,
        page_count=doc.page_count,
        word_count=doc.word_count,
    )


@router.post("", response_model=MaterialResponse, summary="Upload — text/markdown (JSON)")
async def upload_text_material(
    payload: MaterialUpload,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 1 — Upload: pasted text or markdown. Unified entry (JSON)."""
    doc = await material_service.upload_text(
        db, payload.content, name=payload.name, kind=payload.kind, user_id=user.id
    )
    return _to_response(doc)


@router.post("/upload", response_model=MaterialResponse, summary="Upload — PDF file (alias)")
async def upload_file_material(
    file: UploadFile = File(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Step 1 — Upload: validate and store a PDF file."""
    filename = Path(file.filename or "upload.pdf").name
    content_type = (file.content_type or "").split(";", 1)[0].lower()
    if content_type not in {"", "application/pdf"} or not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF uploads are supported")

    data = await file.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF exceeds the {MAX_PDF_BYTES} byte upload limit",
        )
    try:
        doc = await material_service.upload_pdf(db, filename, data, user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=502, detail="PDF storage is temporarily unavailable"
        ) from exc
    return _to_response(doc)


@router.get("/{material_id}", response_model=MaterialResponse)
async def get_material(
    material_id: str,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Fetch a material by ID."""
    record = await material_service.get_material(db, material_id, user_id=user.id)
    if record is None:
        raise HTTPException(status_code=404, detail="Material not found")
    return MaterialResponse(
        id=record["id"],
        name=record["name"],
        kind=record["kind"],
        page_count=record["page_count"],
        word_count=record["word_count"],
    )


@router.get("/{material_id}/download", response_model=MaterialDownloadResponse)
async def download_material(
    material_id: str,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Get a presigned download URL for a material's file."""
    record = await material_service.get_material(db, material_id, user_id=user.id)
    if record is None:
        raise HTTPException(status_code=404, detail="Material not found")
    url = material_service.get_download_url(record)
    if url is None:
        raise HTTPException(status_code=404, detail="No file stored for this material")
    return {"url": url}
