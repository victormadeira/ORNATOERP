"""Exportador JSON tecnico do resultado de otimizacao.

Gera um JSON completo com:
- Resumo da otimizacao
- Detalhes de cada chapa
- Placements com posicao, rotacao, face
- Retalhos gerados
- Plano de corte
- Estatisticas de vacuo
- Score breakdown
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from app.core.domain.models import (
    Piece, Sheet, Placement, SheetLayout, LayoutResult, Remnant,
)


def export_layout_json(
    layout: LayoutResult,
    pieces: list[Piece] | None = None,
    remnants: list[Remnant] | None = None,
    score_details: dict | None = None,
    vacuum_results: list[dict] | None = None,
    config_used: dict | None = None,
) -> dict:
    """Exportar resultado de layout como JSON tecnico.

    Args:
        layout: Resultado do nesting
        pieces: Pecas originais (para referencia)
        remnants: Retalhos gerados
        score_details: Breakdown do score
        vacuum_results: Resultados de simulacao de vacuo
        config_used: Configuracao utilizada

    Returns:
        Dicionario JSON completo
    """
    now = datetime.now().isoformat()

    # Pecas por ID
    piece_map = {p.id: p for p in (pieces or [])}

    # Chapas
    sheets_data = []
    for sl in layout.sheets:
        placements_data = []
        for p in sl.placements:
            pd = {
                "piece_id": p.piece_id,
                "piece_persistent_id": p.piece_persistent_id,
                "instance": p.instance,
                "x": round(p.x, 2),
                "y": round(p.y, 2),
                "effective_length": round(p.effective_length, 2),
                "effective_width": round(p.effective_width, 2),
                "rotation": p.rotation,
                "rotated": p.rotated,
            }

            # Info da peca original
            orig = piece_map.get(p.piece_id)
            if orig:
                pd["original_length"] = orig.length
                pd["original_width"] = orig.width
                pd["material_code"] = orig.material_code
                pd["description"] = orig.description

            placements_data.append(pd)

        sheet_data = {
            "index": sl.index,
            "sheet": {
                "length": sl.sheet.length if sl.sheet else 0,
                "width": sl.sheet.width if sl.sheet else 0,
                "trim": sl.sheet.trim if sl.sheet else 0,
                "material_code": sl.sheet.material_code if sl.sheet else "",
            },
            "placements": placements_data,
            "piece_count": len(sl.placements),
            "occupancy": round(sl.occupancy, 2),
        }
        sheets_data.append(sheet_data)

    # Retalhos
    remnants_data = []
    for r in (remnants or []):
        remnants_data.append({
            "id": r.id,
            "name": r.name,
            "length": r.length,
            "width": r.width,
            "area_mm2": round(r.area, 0),
            "material_code": r.material_code,
            "available": r.available,
        })

    result = {
        "version": "1.0",
        "generated_at": now,
        "summary": {
            "total_sheets": layout.total_sheets,
            "total_pieces": layout.total_pieces,
            "avg_occupancy": round(layout.avg_occupancy, 2),
            "score": round(layout.score, 2),
        },
        "sheets": sheets_data,
        "remnants": remnants_data,
        "config": config_used or layout.config_used,
    }

    if score_details:
        result["score_details"] = score_details

    if vacuum_results:
        result["vacuum"] = vacuum_results

    return result


def export_pieces_summary(pieces: list[Piece]) -> list[dict]:
    """Exportar resumo das pecas para referencia."""
    return [
        {
            "id": p.id,
            "persistent_id": p.persistent_id,
            "description": p.description,
            "length": p.length,
            "width": p.width,
            "quantity": p.quantity,
            "material_code": p.material_code,
            "area_mm2": round(p.length * p.width, 0),
        }
        for p in pieces
    ]
