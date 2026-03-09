"""Endpoints de importacao e gestao de jobs.

POST /api/v1/jobs/import  — Importar JSON do SketchUp
GET  /api/v1/jobs/{id}    — Consultar job
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.domain.parsers import parse_sketchup_json, ParseResult
from app.core.domain.materials import group_pieces_by_material

router = APIRouter(tags=["jobs"])


# ---------------------------------------------------------------------------
# Modelos de request/response
# ---------------------------------------------------------------------------

class ImportSummary(BaseModel):
    """Resumo da importacao de um JSON SketchUp."""
    piece_count: int = 0
    total_quantity: int = 0
    material_codes: list[str] = []
    material_groups: dict[str, int] = {}
    lote_info: dict[str, str] = {}
    warnings: list[str] = []
    errors: list[str] = []
    pieces: list[dict] = []


# ---------------------------------------------------------------------------
# Armazenamento em memoria (futuro: banco de dados)
# ---------------------------------------------------------------------------

_jobs_store: dict[int, ParseResult] = {}
_next_job_id = 1


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/jobs/import")
async def import_json(data: dict) -> ImportSummary:
    """Importar JSON exportado pelo SketchUp.

    Recebe o JSON completo com 3 secoes:
    - model_entities
    - details_project
    - machining

    Retorna resumo com pecas parseadas, materiais e avisos.
    """
    global _next_job_id

    # Validar que tem pelo menos model_entities
    if "model_entities" not in data:
        raise HTTPException(
            status_code=400,
            detail="JSON invalido: falta secao 'model_entities'"
        )

    # Parsear
    result = parse_sketchup_json(data)

    # Armazenar
    job_id = _next_job_id
    _jobs_store[job_id] = result
    _next_job_id += 1

    # Agrupar por material
    groups = group_pieces_by_material(result.pieces)
    material_groups = {code: len(pieces) for code, pieces in groups.items()}

    # Resumo das pecas
    pieces_summary = []
    for p in result.pieces:
        pieces_summary.append({
            "id": p.id,
            "persistent_id": p.persistent_id,
            "upmcode": p.upmcode,
            "description": p.description,
            "module": p.module_desc,
            "material_code": p.material_code,
            "dimensions": f"{p.length:.0f}x{p.width:.0f}x{p.thickness_real:.1f}",
            "quantity": p.quantity,
            "grain": p.grain.value,
            "rotation": p.rotation_policy.value,
            "is_rectangular": p.is_rectangular,
            "workers": len(p.machining.workers),
            "edges": p.edges.type_code,
        })

    return ImportSummary(
        piece_count=result.piece_count,
        total_quantity=result.total_quantity,
        material_codes=sorted(result.material_codes),
        material_groups=material_groups,
        lote_info=result.lote_info,
        warnings=result.warnings,
        errors=result.errors,
        pieces=pieces_summary,
    )


@router.get("/jobs/{job_id}")
async def get_job(job_id: int) -> dict:
    """Consultar job importado por ID."""
    result = _jobs_store.get(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} nao encontrado")

    return {
        "job_id": job_id,
        "piece_count": result.piece_count,
        "total_quantity": result.total_quantity,
        "material_codes": sorted(result.material_codes),
        "lote_info": result.lote_info,
    }


@router.get("/jobs/{job_id}/pieces")
async def get_job_pieces(job_id: int) -> list[dict]:
    """Listar pecas de um job."""
    result = _jobs_store.get(job_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} nao encontrado")

    return [
        {
            "id": p.id,
            "persistent_id": p.persistent_id,
            "upmcode": p.upmcode,
            "description": p.description,
            "module": p.module_desc,
            "material_code": p.material_code,
            "thickness": p.thickness_real,
            "length": p.length,
            "width": p.width,
            "quantity": p.quantity,
            "area_mm2": p.area_mm2,
            "grain": p.grain.value,
            "rotation": p.rotation_policy.value,
            "is_rectangular": p.is_rectangular,
            "edges": {
                "front": p.edges.front,
                "back": p.edges.back,
                "left": p.edges.left,
                "right": p.edges.right,
                "type": p.edges.type_code,
            },
            "workers_count": len(p.machining.workers),
        }
        for p in result.pieces
    ]
