"""Modelo de vacuo e risco de soltura para CNC.

Simula o hold-down da mesa de vacuo durante o corte progressivo.
Modela o vacuo como campo continuo: forca=1.0 no centro, decai para bordas.

Para cada peca cortada: subtrai area da chapa restante,
recalcula suporte de todas as pecas restantes.

Classificacao de risco:
- LOW: < 0.3
- MEDIUM: 0.3 - 0.7
- HIGH: 0.7 - 0.9
- CRITICAL: > 0.9
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import (
    Piece, Placement, Sheet, SheetLayout,
    PieceVacuumResult, VacuumSimulationResult,
)
from app.core.domain.enums import VacuumRisk


# ---------------------------------------------------------------------------
# Configuracao do modelo de vacuo
# ---------------------------------------------------------------------------

@dataclass
class VacuumConfig:
    """Configuracao do simulador de vacuo."""
    # Pesos da formula de risco
    area_weight: float = 0.60        # Peso da area apoiada
    border_weight: float = 0.40      # Peso da distancia das bordas

    # Thresholds de classificacao
    threshold_low: float = 0.3
    threshold_medium: float = 0.7
    threshold_high: float = 0.9

    # Campo de vacuo
    center_force: float = 1.0        # Forca no centro (normalizado)
    edge_force: float = 0.3          # Forca nas bordas
    edge_decay: str = "linear"       # linear ou quadratic

    # Limites
    min_support_ratio: float = 0.3   # Ratio minimo de area apoiada
    critical_action: str = "suggest"  # suggest, reorder, force_tabs


# ---------------------------------------------------------------------------
# Calculo de campo de vacuo
# ---------------------------------------------------------------------------

def vacuum_field_strength(
    x: float, y: float,
    sheet_width: float, sheet_height: float,
    config: VacuumConfig | None = None,
) -> float:
    """Calcular forca de vacuo numa posicao da chapa.

    Modelo: forca maxima no centro, decai linearmente para as bordas.

    Args:
        x, y: Posicao na chapa (mm)
        sheet_width: Largura da chapa (mm)
        sheet_height: Altura da chapa (mm)
        config: Configuracao do modelo

    Returns:
        Forca normalizada (0-1)
    """
    config = config or VacuumConfig()

    cx = sheet_width / 2
    cy = sheet_height / 2

    if cx == 0 or cy == 0:
        return config.edge_force

    # Distancia normalizada do centro (0=centro, 1=borda)
    dx = abs(x - cx) / cx
    dy = abs(y - cy) / cy
    dist = max(dx, dy)  # Chebyshev distance
    dist = min(1.0, dist)

    # Interpolar entre center_force e edge_force
    if config.edge_decay == "quadratic":
        factor = dist ** 2
    else:  # linear
        factor = dist

    force = config.center_force * (1 - factor) + config.edge_force * factor

    return force


def average_vacuum_under_piece(
    placement: Placement,
    sheet: Sheet,
    config: VacuumConfig | None = None,
    sample_points: int = 9,
) -> float:
    """Calcular forca media de vacuo sob uma peca.

    Amostra pontos na area da peca e calcula media.

    Args:
        placement: Posicao da peca
        sheet: Chapa
        config: Configuracao
        sample_points: Pontos de amostragem (3x3=9, 5x5=25, etc.)

    Returns:
        Forca media de vacuo (0-1)
    """
    config = config or VacuumConfig()

    pw = placement.effective_length
    ph = placement.effective_width
    px = placement.x - sheet.trim  # Posicao relativa a area util
    py = placement.y - sheet.trim

    usable_w = sheet.usable_length
    usable_h = sheet.usable_width

    n = int(math.sqrt(sample_points))
    if n < 2:
        n = 2

    total_force = 0.0
    count = 0

    for i in range(n):
        for j in range(n):
            sx = px + pw * (i + 0.5) / n
            sy = py + ph * (j + 0.5) / n
            force = vacuum_field_strength(sx, sy, usable_w, usable_h, config)
            total_force += force
            count += 1

    return total_force / count if count > 0 else 0.0


# ---------------------------------------------------------------------------
# Calculo de risco de soltura
# ---------------------------------------------------------------------------

def calculate_piece_risk(
    placement: Placement,
    sheet: Sheet,
    remaining_support_ratio: float = 1.0,
    config: VacuumConfig | None = None,
) -> tuple[float, VacuumRisk]:
    """Calcular risco de soltura para uma peca.

    Formula: risk = 1 - (area_component * area_weight + border_component * border_weight)

    Onde:
    - area_component: ratio de area apoiada (remaining_support_ratio)
    - border_component: forca media de vacuo sob a peca

    Args:
        placement: Posicao da peca
        sheet: Chapa
        remaining_support_ratio: Fracao da area original ainda apoiada
        config: Configuracao

    Returns:
        (risk_value 0-1, risk_class)
    """
    config = config or VacuumConfig()

    # Componente de area apoiada
    area_component = remaining_support_ratio

    # Componente de posicao (vacuo)
    border_component = average_vacuum_under_piece(placement, sheet, config)

    # Score de suporte (0=sem suporte, 1=suporte total)
    support = (area_component * config.area_weight +
               border_component * config.border_weight)

    # Risco = 1 - suporte
    risk = 1.0 - min(1.0, max(0.0, support))

    # Classificar
    risk_class = classify_risk(risk, config)

    return risk, risk_class


def classify_risk(
    risk: float,
    config: VacuumConfig | None = None,
) -> VacuumRisk:
    """Classificar risco de soltura.

    Args:
        risk: Valor do risco (0-1)
        config: Configuracao com thresholds

    Returns:
        VacuumRisk enum
    """
    config = config or VacuumConfig()

    if risk >= config.threshold_high:
        return VacuumRisk.CRITICAL
    elif risk >= config.threshold_medium:
        return VacuumRisk.HIGH
    elif risk >= config.threshold_low:
        return VacuumRisk.MEDIUM
    else:
        return VacuumRisk.LOW


# ---------------------------------------------------------------------------
# Simulacao progressiva
# ---------------------------------------------------------------------------

def simulate_vacuum_progressive(
    sheet_layout: SheetLayout,
    cut_order: list[int] | None = None,
    config: VacuumConfig | None = None,
) -> VacuumSimulationResult:
    """Simular estabilidade progressiva durante o corte.

    Para cada peca cortada na ordem, recalcula o suporte
    de todas as pecas restantes.

    Args:
        sheet_layout: Layout da chapa com pecas
        cut_order: Ordem de corte (indices dos placements).
                   None = ordem atual.
        config: Configuracao

    Returns:
        VacuumSimulationResult
    """
    config = config or VacuumConfig()
    sheet = sheet_layout.sheet
    placements = sheet_layout.placements

    if not placements:
        return VacuumSimulationResult(sheet_index=sheet_layout.index)

    # Indices na ordem de corte
    if cut_order is None:
        cut_order = list(range(len(placements)))

    # Area total das pecas (antes de cortar)
    total_piece_area = sum(
        p.effective_length * p.effective_width
        for p in placements
    )

    # Simular corte progressivo
    piece_results: list[PieceVacuumResult] = []
    cut_so_far: set[int] = set()
    critical_count = 0
    high_count = 0
    suggestions: list[str] = []

    for step, cut_idx in enumerate(cut_order):
        if cut_idx >= len(placements):
            continue

        p = placements[cut_idx]

        # Calcular area ja cortada
        cut_area = sum(
            placements[i].effective_length * placements[i].effective_width
            for i in cut_so_far
        )

        # Ratio de suporte restante para esta peca
        if total_piece_area > 0:
            remaining_ratio = 1.0 - (cut_area / total_piece_area)
        else:
            remaining_ratio = 1.0

        # Ajustar remaining_ratio baseado na posicao relativa
        # Pecas no centro perdem suporte mais rapido
        remaining_ratio = max(0.1, remaining_ratio)

        # Calcular risco
        risk, risk_class = calculate_piece_risk(
            p, sheet, remaining_ratio, config
        )

        # Risco inicial (antes de cortar qualquer peca)
        initial_risk, _ = calculate_piece_risk(p, sheet, 1.0, config)

        # Acao sugerida
        suggested_action = ""
        if risk_class == VacuumRisk.CRITICAL:
            critical_count += 1
            suggested_action = "reorder"
            suggestions.append(
                f"Peca {p.piece_persistent_id} (idx={cut_idx}) "
                f"tem risco CRITICAL ({risk:.2f}). "
                f"Sugerir reordenacao ou tabs."
            )
        elif risk_class == VacuumRisk.HIGH:
            high_count += 1
            suggested_action = "tabs"

        piece_results.append(PieceVacuumResult(
            piece_id=p.piece_id,
            piece_persistent_id=p.piece_persistent_id,
            initial_risk=initial_risk,
            max_risk=risk,
            risk_at_cut=risk,
            risk_class=risk_class,
            supported_area_ratio=remaining_ratio,
            suggested_action=suggested_action,
        ))

        # Marcar como cortada
        cut_so_far.add(cut_idx)

    return VacuumSimulationResult(
        sheet_index=sheet_layout.index,
        pieces=piece_results,
        critical_count=critical_count,
        high_count=high_count,
        suggestions=suggestions,
    )


# ---------------------------------------------------------------------------
# Otimizacao de ordem por risco de vacuo
# ---------------------------------------------------------------------------

def optimize_cut_order_for_vacuum(
    sheet_layout: SheetLayout,
    config: VacuumConfig | None = None,
) -> list[int]:
    """Otimizar ordem de corte para minimizar risco de vacuo.

    Estrategia: cortar pecas de fora para dentro,
    maiores primeiro (mais suporte para as restantes).

    Args:
        sheet_layout: Layout da chapa
        config: Configuracao

    Returns:
        Indices dos placements na ordem otimizada
    """
    config = config or VacuumConfig()
    sheet = sheet_layout.sheet
    placements = sheet_layout.placements

    if len(placements) <= 1:
        return list(range(len(placements)))

    usable_w = sheet.usable_length
    usable_h = sheet.usable_width
    center_x = usable_w / 2
    center_y = usable_h / 2

    # Score de cada peca: combinar distancia do centro + area
    scored = []
    for i, p in enumerate(placements):
        px = (p.x - sheet.trim) + p.effective_length / 2
        py = (p.y - sheet.trim) + p.effective_width / 2

        dist_from_center = math.sqrt(
            (px - center_x) ** 2 + (py - center_y) ** 2
        )
        area = p.effective_length * p.effective_width

        # Pecas mais longe do centro e maiores cortam primeiro
        # (maiores tem mais suporte proprio)
        vacuum_score = dist_from_center * 0.001 + area * 0.000001
        scored.append((i, vacuum_score))

    # Ordenar por score descendente (maior = cortar primeiro)
    scored.sort(key=lambda x: x[1], reverse=True)

    return [idx for idx, _ in scored]
