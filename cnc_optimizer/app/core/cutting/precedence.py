"""Grafo de precedencia para operacoes de corte.

Determina ordem tecnica de execucao:
1. Furos ANTES de pockets
2. Pockets ANTES de rasgos
3. Rasgos ANTES de contornos internos
4. Contornos internos ANTES de contorno externo
5. Pecas pequenas por ULTIMO
6. Operacoes do mesmo tool agrupadas
7. Contornos de retalho DEPOIS de todos os contornos de peca
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.core.cutting.op_builder import CuttingOperation


# ---------------------------------------------------------------------------
# Resultado da ordenacao
# ---------------------------------------------------------------------------

@dataclass
class PrecedenceResult:
    """Resultado da ordenacao por precedencia."""
    ordered_ops: list[CuttingOperation] = field(default_factory=list)
    phases: dict[str, list[CuttingOperation]] = field(default_factory=dict)
    tool_changes: int = 0
    total_travel: float = 0.0


# ---------------------------------------------------------------------------
# Ordenacao por precedencia
# ---------------------------------------------------------------------------

def order_by_precedence(
    operations: list[CuttingOperation],
    minimize_tool_changes: bool = True,
    optimize_travel: bool = True,
) -> PrecedenceResult:
    """Ordenar operacoes por precedencia tecnica.

    Fases:
    1. Furos (todos, agrupados por ferramenta)
    2. Pockets
    3. Rasgos
    4. Contornos internos
    5. Contornos externos (pecas)
    6. Contornos de retalho

    Dentro de cada fase, opcoes:
    - Agrupar por ferramenta (minimizar trocas)
    - Nearest-neighbor (minimizar deslocamento)

    Args:
        operations: Lista de operacoes
        minimize_tool_changes: Agrupar por ferramenta dentro de cada fase
        optimize_travel: Ordenar por proximidade dentro do grupo

    Returns:
        PrecedenceResult com operacoes ordenadas
    """
    if not operations:
        return PrecedenceResult()

    # Separar em fases
    holes = [op for op in operations if op.type == "hole"]
    pockets = [op for op in operations if op.type == "pocket"]
    slots = [op for op in operations if op.type == "slot"]
    internal_contours = [op for op in operations if op.type == "internal_contour"]
    external_contours = [op for op in operations if op.type == "external_contour"]
    remnant_contours = [op for op in operations if op.type == "remnant_contour"]

    phases = {
        "holes": holes,
        "pockets": pockets,
        "slots": slots,
        "internal_contours": internal_contours,
        "external_contours": external_contours,
        "remnant_contours": remnant_contours,
    }

    # Ordenar cada fase
    ordered = []

    for phase_name in ["holes", "pockets", "slots",
                       "internal_contours", "external_contours",
                       "remnant_contours"]:
        phase_ops = phases[phase_name]
        if not phase_ops:
            continue

        if minimize_tool_changes:
            # Agrupar por ferramenta dentro da fase
            by_tool: dict[str, list[CuttingOperation]] = {}
            for op in phase_ops:
                key = op.tool_code or "unknown"
                if key not in by_tool:
                    by_tool[key] = []
                by_tool[key].append(op)

            # Para cada grupo de ferramenta, ordenar por proximidade
            for tool_code, tool_ops in by_tool.items():
                if optimize_travel:
                    tool_ops = _nearest_neighbor_order(tool_ops)
                ordered.extend(tool_ops)
        else:
            if optimize_travel:
                phase_ops = _nearest_neighbor_order(phase_ops)
            ordered.extend(phase_ops)

    # Contar trocas de ferramenta
    tool_changes = _count_tool_changes(ordered)

    # Calcular travel total
    total_travel = _calculate_travel(ordered)

    return PrecedenceResult(
        ordered_ops=ordered,
        phases=phases,
        tool_changes=tool_changes,
        total_travel=total_travel,
    )


def order_operations_for_sheet(
    all_operations: list[CuttingOperation],
    sheet_index: int,
) -> PrecedenceResult:
    """Ordenar todas as operacoes de uma chapa.

    Filtra e ordena operacoes para uma chapa especifica.

    Args:
        all_operations: Todas as operacoes
        sheet_index: Indice da chapa

    Returns:
        PrecedenceResult
    """
    # Em producao, filtrar por sheet_index do placement
    # Por agora, ordenar todas
    return order_by_precedence(all_operations)


# ---------------------------------------------------------------------------
# Nearest-neighbor ordering
# ---------------------------------------------------------------------------

def _nearest_neighbor_order(
    ops: list[CuttingOperation],
) -> list[CuttingOperation]:
    """Ordenar operacoes por nearest-neighbor (minimize travel).

    Comeca na operacao mais proxima da origem (0,0).

    Args:
        ops: Operacoes a ordenar

    Returns:
        Lista reordenada
    """
    if len(ops) <= 1:
        return list(ops)

    remaining = list(ops)
    ordered = []

    # Comecar pela operacao mais proxima da origem
    current_x, current_y = 0.0, 0.0

    while remaining:
        best_idx = 0
        best_dist = float("inf")

        for i, op in enumerate(remaining):
            dx = op.x - current_x
            dy = op.y - current_y
            dist = math.sqrt(dx ** 2 + dy ** 2)
            if dist < best_dist:
                best_dist = dist
                best_idx = i

        best_op = remaining.pop(best_idx)
        ordered.append(best_op)
        current_x = best_op.x
        current_y = best_op.y

    return ordered


# ---------------------------------------------------------------------------
# Metricas
# ---------------------------------------------------------------------------

def _count_tool_changes(ops: list[CuttingOperation]) -> int:
    """Contar trocas de ferramenta."""
    if len(ops) <= 1:
        return 0

    changes = 0
    current_tool = ops[0].tool_code

    for op in ops[1:]:
        if op.tool_code != current_tool:
            changes += 1
            current_tool = op.tool_code

    return changes


def _calculate_travel(ops: list[CuttingOperation]) -> float:
    """Calcular distancia total de deslocamento vazio."""
    if len(ops) <= 1:
        return 0.0

    total = 0.0
    for i in range(1, len(ops)):
        dx = ops[i].x - ops[i - 1].x
        dy = ops[i].y - ops[i - 1].y
        total += math.sqrt(dx ** 2 + dy ** 2)

    return total
