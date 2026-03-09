"""Rotas de otimizacao.

POST /api/v1/optimize — Pipeline completo de otimizacao
GET  /api/v1/optimize/{job_id}/status — Status do job
GET  /api/v1/optimize/{job_id}/result — Resultado
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from app.core.domain.models import Piece, Sheet, Remnant
from app.core.nesting.part_ordering import expand_pieces_by_quantity
from app.core.nesting.layout_builder import build_optimal_layout, NestingConfig
from app.core.nesting.ga_optimizer import GAConfig, optimize_with_ga
from app.scoring.score_engine import score_layout, ScoreBreakdown
from app.scoring.weights import get_profile, BALANCED
from app.core.export.json_exporter import export_layout_json

router = APIRouter(prefix="/api/v1", tags=["optimize"])


# ---------------------------------------------------------------------------
# Modelos de request/response
# ---------------------------------------------------------------------------

class OptimizeRequest(BaseModel):
    """Request para otimizacao."""
    pieces: list[dict] = Field(default_factory=list)
    sheets: list[dict] = Field(default_factory=list)
    remnants: list[dict] = Field(default_factory=list)

    # Configuracao
    strategy: str = "auto"          # auto, heuristic, ga
    scoring_profile: str = "balanced"
    allow_rotation: bool = True
    spacing: float = 7.0

    # GA config
    ga_generations: int = 50
    ga_seed: Optional[int] = None


class OptimizeResponse(BaseModel):
    """Response da otimizacao."""
    success: bool = True
    total_sheets: int = 0
    total_pieces: int = 0
    avg_occupancy: float = 0
    score: float = 0
    layout: dict = Field(default_factory=dict)
    score_details: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/optimize")
async def optimize(request: OptimizeRequest) -> OptimizeResponse:
    """Executar pipeline de otimizacao completo."""
    try:
        # Parse pecas
        pieces = [
            Piece(**p) for p in request.pieces
        ] if request.pieces else []

        # Parse chapas
        sheets = [
            Sheet(**s) for s in request.sheets
        ] if request.sheets else []

        if not pieces:
            raise HTTPException(400, "Nenhuma peca fornecida")
        if not sheets:
            raise HTTPException(400, "Nenhuma chapa fornecida")

        # Expandir quantidades
        expanded = expand_pieces_by_quantity(pieces)

        # Perfil de scoring
        try:
            weights = get_profile(request.scoring_profile)
        except ValueError:
            weights = BALANCED

        # Estrategia
        if request.strategy == "ga":
            ga_config = GAConfig(
                max_generations=request.ga_generations,
                seed=request.ga_seed,
            )
            layout, info = optimize_with_ga(expanded, sheets, ga_config)
        else:
            # Heuristica (default)
            config = NestingConfig(
                spacing=request.spacing,
                allow_rotation=request.allow_rotation,
            )
            layout = build_optimal_layout(
                pieces=expanded,
                sheets=sheets,
                config=config,
            )

        # Score
        score_result = score_layout(layout, weights, pieces=pieces)

        # JSON export
        layout_json = export_layout_json(
            layout,
            pieces=pieces,
            score_details=score_result.to_dict(),
        )

        return OptimizeResponse(
            success=True,
            total_sheets=layout.total_sheets,
            total_pieces=layout.total_pieces,
            avg_occupancy=round(layout.avg_occupancy, 2),
            score=round(score_result.total, 2),
            layout=layout_json,
            score_details=score_result.to_dict(),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erro na otimizacao: {str(e)}")
