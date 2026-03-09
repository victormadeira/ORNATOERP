"""Construtor de operacoes de corte.

Converte workers e placements em operacoes CNC ordenadas.
Cada operacao tem tipo, ferramenta, posicao e parametros.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import (
    Piece, Placement, Worker, MachineTool,
)
from app.core.domain.enums import FaceSide


# ---------------------------------------------------------------------------
# Tipos de operacao
# ---------------------------------------------------------------------------

@dataclass
class CuttingOperation:
    """Uma operacao individual de usinagem CNC."""
    id: int = 0
    type: str = ""               # hole, pocket, slot, internal_contour, external_contour, remnant_contour
    piece_id: int = 0
    piece_persistent_id: str = ""
    placement_index: int = 0

    # Posicao absoluta na chapa (apos offset do placement)
    x: float = 0
    y: float = 0
    z_start: float = 0           # Z inicial (topo da peca)
    z_end: float = 0             # Z final (profundidade)
    depth: float = 0

    # Dimensoes da operacao
    diameter: float = 0          # Diametro do furo/ferramenta
    length: float = 0            # Comprimento do rasgo/contorno
    width: float = 0             # Largura do rasgo

    # Ferramenta
    tool_code: str = ""
    tool_number: int = 0
    tool_diameter: float = 0

    # Metadados
    face: str = ""               # top, back, left, etc.
    side: str = ""               # side_a, side_b
    category: str = ""           # transfer_hole, contour, etc.
    priority: int = 0            # Prioridade de execucao (menor = primeiro)

    # Parametros de corte
    feed_rate: float = 0         # mm/min
    rpm: float = 0
    passes: int = 1              # Numero de passes (multi-pass DOC)

    @property
    def is_hole(self) -> bool:
        return self.type == "hole"

    @property
    def is_contour(self) -> bool:
        return self.type in ("internal_contour", "external_contour", "remnant_contour")

    @property
    def is_internal(self) -> bool:
        return self.type in ("hole", "pocket", "slot", "internal_contour")


# ---------------------------------------------------------------------------
# Builder de operacoes
# ---------------------------------------------------------------------------

def build_operations(
    piece: Piece,
    placement: Placement,
    tool_map: dict[str, MachineTool] | None = None,
    thickness: float = 18.5,
) -> list[CuttingOperation]:
    """Construir lista de operacoes de corte para uma peca.

    Converte workers da peca em operacoes com posicoes absolutas.

    Args:
        piece: Peca com dados de usinagem
        placement: Posicionamento da peca na chapa
        tool_map: Mapa tool_code → MachineTool
        thickness: Espessura da peca (mm)

    Returns:
        Lista de CuttingOperations
    """
    ops: list[CuttingOperation] = []
    tool_map = tool_map or {}

    if not piece.machining or not piece.machining.workers:
        pass  # Sem workers, so contorno externo

    else:
        for i, worker in enumerate(piece.machining.workers):
            op = _worker_to_operation(
                worker, piece, placement, i, tool_map, thickness
            )
            ops.append(op)

    # Adicionar contorno externo (sempre)
    contour_op = CuttingOperation(
        id=len(ops),
        type="external_contour",
        piece_id=piece.id,
        piece_persistent_id=piece.persistent_id,
        placement_index=0,
        x=placement.x,
        y=placement.y,
        depth=thickness + 0.2,  # Extra depth para cortar completamente
        length=2 * (placement.effective_length + placement.effective_width),
        tool_code="contour",
        category="contour",
        priority=100,  # Contorno por ultimo
        face="top",
        side="side_a",
    )

    # Lookup ferramenta de contorno
    contour_tool = tool_map.get("contour")
    if contour_tool:
        contour_op.tool_number = contour_tool.tool_number
        contour_op.tool_diameter = contour_tool.diameter
        contour_op.feed_rate = contour_tool.cut_speed
        contour_op.rpm = contour_tool.rpm
        # Multi-pass baseado em DOC
        if contour_tool.doc and contour_tool.doc > 0:
            import math
            contour_op.passes = max(1, math.ceil(thickness / contour_tool.doc))

    ops.append(contour_op)

    return ops


def _worker_to_operation(
    worker: Worker,
    piece: Piece,
    placement: Placement,
    index: int,
    tool_map: dict[str, MachineTool],
    thickness: float,
) -> CuttingOperation:
    """Converter worker em operacao de corte.

    Args:
        worker: Worker do JSON SketchUp
        piece: Peca
        placement: Posicionamento
        index: Indice do worker
        tool_map: Mapa de ferramentas
        thickness: Espessura

    Returns:
        CuttingOperation
    """
    # Posicao absoluta na chapa
    if placement.rotation == 90:
        abs_x = placement.x + worker.y
        abs_y = placement.y + (placement.effective_width - worker.x)
    elif placement.rotation == 180:
        abs_x = placement.x + (placement.effective_length - worker.x)
        abs_y = placement.y + (placement.effective_width - worker.y)
    elif placement.rotation == 270:
        abs_x = placement.x + (placement.effective_length - worker.y)
        abs_y = placement.y + worker.x
    else:  # 0
        abs_x = placement.x + worker.x
        abs_y = placement.y + worker.y

    # Tipo de operacao
    op_type = _classify_worker(worker)

    # Prioridade
    priority = _assign_priority(op_type, worker)

    op = CuttingOperation(
        id=index,
        type=op_type,
        piece_id=piece.id,
        piece_persistent_id=piece.persistent_id,
        x=abs_x,
        y=abs_y,
        depth=worker.depth,
        tool_code=worker.tool_code,
        category=worker.category,
        face=worker.face,
        side=worker.side,
        priority=priority,
    )

    # Dimensoes extras (rasgo, pocket)
    if hasattr(worker, 'length') and worker.length:
        op.length = worker.length
    if hasattr(worker, 'width') and worker.width:
        op.width = worker.width

    # Lookup ferramenta
    tool = tool_map.get(worker.tool_code)
    if tool:
        op.tool_number = tool.tool_number
        op.tool_diameter = tool.diameter
        op.feed_rate = tool.cut_speed
        op.rpm = tool.rpm
        op.diameter = tool.diameter

        # Multi-pass
        if tool.doc and tool.doc > 0 and worker.depth > tool.doc:
            import math
            op.passes = max(1, math.ceil(worker.depth / tool.doc))

    return op


def _classify_worker(worker: Worker) -> str:
    """Classificar tipo de operacao a partir do worker."""
    cat = worker.category.lower() if worker.category else ""

    if "hole" in cat or "furo" in cat:
        return "hole"
    elif "pocket" in cat or "rebaixo" in cat:
        return "pocket"
    elif "slot" in cat or "rasgo" in cat or "canal" in cat:
        return "slot"
    elif "saw" in cat or "serra" in cat:
        return "slot"
    elif "contour" in cat or "contorno" in cat:
        return "internal_contour"
    else:
        return "hole"  # Default


def _assign_priority(op_type: str, worker: Worker) -> int:
    """Atribuir prioridade de execucao.

    Menor = executa primeiro:
    10: furos
    20: pockets
    30: rasgos
    50: contornos internos
    100: contorno externo
    """
    priorities = {
        "hole": 10,
        "pocket": 20,
        "slot": 30,
        "internal_contour": 50,
        "external_contour": 100,
        "remnant_contour": 110,
    }
    return priorities.get(op_type, 50)


# ---------------------------------------------------------------------------
# Agrupar operacoes por ferramenta
# ---------------------------------------------------------------------------

def group_operations_by_tool(ops: list[CuttingOperation]) -> dict[str, list[CuttingOperation]]:
    """Agrupar operacoes pela ferramenta usada.

    Minimiza trocas de ferramenta.

    Args:
        ops: Lista de operacoes

    Returns:
        Dict tool_code → lista de operacoes
    """
    groups: dict[str, list[CuttingOperation]] = {}
    for op in ops:
        key = op.tool_code or "unknown"
        if key not in groups:
            groups[key] = []
        groups[key].append(op)
    return groups
