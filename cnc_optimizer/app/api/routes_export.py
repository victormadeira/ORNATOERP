"""Rotas de exportacao.

POST /api/v1/export/gcode — Gerar G-code
POST /api/v1/export/svg   — Gerar SVG
POST /api/v1/export/json  — Gerar JSON tecnico
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter(prefix="/api/v1/export", tags=["export"])


# ---------------------------------------------------------------------------
# Mapeamento de nomes amigaveis → internos
# ---------------------------------------------------------------------------

# Mapeia type (API) → op_type (interno)
_OP_TYPE_MAP = {
    "furo": "hole",
    "hole": "hole",
    "rasgo": "groove",
    "groove": "groove",
    "pocket": "pocket",
    "contorno_retangular": "contorno",
    "contorno": "contorno",
    "contorno_complexo": "contour_complex",
    "contour_complex": "contour_complex",
    "furo_circular": "circular_hole",
    "circular_hole": "circular_hole",
    "generic": "generic",
}


def _normalize_operation(raw: dict) -> dict:
    """Converter dict amigavel da API para formato GcodeOp interno."""
    op = dict(raw)

    # type → op_type
    if "type" in op:
        t = op.pop("type")
        op["op_type"] = _OP_TYPE_MAP.get(t, t)

    # x/y → abs_x/abs_y
    if "x" in op and "abs_x" not in op:
        op["abs_x"] = op.pop("x")
    if "y" in op and "abs_y" not in op:
        op["abs_y"] = op.pop("y")
    if "x2" in op and "abs_x2" not in op:
        op["abs_x2"] = op.pop("x2")
    if "y2" in op and "abs_y2" not in op:
        op["abs_y2"] = op.pop("y2")

    # diameter → radius
    if "diameter" in op and "radius" not in op:
        op["radius"] = op.pop("diameter") / 2.0

    # length/width para contorno → contour_path
    if op.get("op_type") == "contorno" and "length" in op and "contour_path" not in op:
        length = op.pop("length")
        width = op.pop("width", 0)
        x = op.get("abs_x", 0)
        y = op.get("abs_y", 0)
        op["contour_path"] = [
            [x, y],
            [x + length, y],
            [x + length, y + width],
            [x, y + width],
        ]

    # phase → fase
    if "phase" in op and "fase" not in op:
        op["fase"] = op.pop("phase")

    return op


def _normalize_tool(raw: dict) -> dict:
    """Converter dict amigavel para formato GcodeTool."""
    tool = dict(raw)

    # Mapeamentos opcionais
    if "descricao" in tool and "nome" not in tool:
        tool["nome"] = tool.pop("descricao")
    if "feed" in tool and "velocidade_corte" not in tool:
        tool["velocidade_corte"] = tool.pop("feed")

    return tool


class GcodeRequest(BaseModel):
    """Request para geracao de G-code."""
    operations: list[dict] = Field(default_factory=list)
    machine_config: dict = Field(default_factory=dict)
    tools: dict = Field(default_factory=dict)
    sheet_info: dict = Field(default_factory=dict)


@router.post("/gcode")
async def generate_gcode(request: GcodeRequest) -> dict:
    """Gerar G-code a partir de operacoes.

    Aceita formato amigavel (type, x, y, diameter) e formato interno
    (op_type, abs_x, abs_y, radius). Conversao automatica.
    """
    from app.core.export.gcode_generator import (
        GcodeGenerator, GcodeOp, MachineConfig, GcodeTool,
        generate_gcode,
    )

    try:
        machine = MachineConfig(**request.machine_config) if request.machine_config else MachineConfig()

        tools = {}
        for code, t in request.tools.items():
            tools[code] = GcodeTool(**_normalize_tool(t))

        ops = [GcodeOp(**_normalize_operation(o)) for o in request.operations]

        result = generate_gcode(ops, machine, tools, request.sheet_info)

        return {
            "gcode": result.gcode,
            "stats": result.stats,
            "alertas": result.alertas,
        }
    except Exception as e:
        raise HTTPException(500, f"Erro na geracao de G-code: {str(e)}")


@router.post("/gcode/raw")
async def generate_gcode_raw(request: GcodeRequest) -> PlainTextResponse:
    """Gerar G-code como texto puro (download .nc)."""
    from app.core.export.gcode_generator import (
        GcodeOp, MachineConfig, GcodeTool, generate_gcode,
    )

    try:
        machine = MachineConfig(**request.machine_config) if request.machine_config else MachineConfig()
        tools = {c: GcodeTool(**_normalize_tool(t)) for c, t in request.tools.items()}
        ops = [GcodeOp(**_normalize_operation(o)) for o in request.operations]

        result = generate_gcode(ops, machine, tools, request.sheet_info)

        return PlainTextResponse(
            result.gcode,
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=programa.nc"},
        )
    except Exception as e:
        raise HTTPException(500, str(e))
