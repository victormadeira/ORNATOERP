"""Motor de scoring multi-objetivo para layouts CNC.

Calcula score global do layout considerando 8 componentes:
1. Aproveitamento (ocupacao)
2. Numero de chapas
3. Compactacao
4. Deslocamento vazio
5. Suporte de vacuo
6. Qualidade de rotacao
7. Valor de retalhos
8. Selecao de face (flips)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import (
    Piece, Sheet, Placement, SheetLayout, LayoutResult,
)
from app.scoring.weights import ScoreWeights, BALANCED


# ---------------------------------------------------------------------------
# Resultado detalhado do score
# ---------------------------------------------------------------------------

@dataclass
class ScoreBreakdown:
    """Resultado detalhado de cada componente do score."""
    total: float = 0.0
    occupancy: float = 0.0
    sheet_count: float = 0.0
    compactness: float = 0.0
    travel_distance: float = 0.0
    vacuum_support: float = 0.0
    rotation_quality: float = 0.0
    remnant_value: float = 0.0
    face_selection: float = 0.0

    # Metricas brutas (antes de ponderar)
    raw_occupancy_pct: float = 0.0
    raw_sheet_count: int = 0
    raw_compactness_pct: float = 0.0
    raw_travel_mm: float = 0.0
    raw_vacuum_avg: float = 0.0
    raw_rotation_avg: float = 0.0
    raw_remnant_area_mm2: float = 0.0
    raw_flip_count: int = 0

    def to_dict(self) -> dict:
        """Converter para dicionario."""
        return {
            "total": round(self.total, 2),
            "components": {
                "occupancy": round(self.occupancy, 2),
                "sheet_count": round(self.sheet_count, 2),
                "compactness": round(self.compactness, 2),
                "travel_distance": round(self.travel_distance, 2),
                "vacuum_support": round(self.vacuum_support, 2),
                "rotation_quality": round(self.rotation_quality, 2),
                "remnant_value": round(self.remnant_value, 2),
                "face_selection": round(self.face_selection, 2),
            },
            "raw": {
                "occupancy_pct": round(self.raw_occupancy_pct, 1),
                "sheet_count": self.raw_sheet_count,
                "compactness_pct": round(self.raw_compactness_pct, 1),
                "travel_mm": round(self.raw_travel_mm, 0),
                "vacuum_avg_risk": round(self.raw_vacuum_avg, 3),
                "rotation_avg_score": round(self.raw_rotation_avg, 3),
                "remnant_area_mm2": round(self.raw_remnant_area_mm2, 0),
                "flip_count": self.raw_flip_count,
            },
        }


# ---------------------------------------------------------------------------
# Funcoes de score por componente
# ---------------------------------------------------------------------------

def _score_occupancy(sheet_layouts: list[SheetLayout]) -> tuple[float, float]:
    """Score de aproveitamento (0-100, maior=melhor).

    Usa formula quadratica com bonus por faixa, similar ao JS.

    Returns:
        (score normalizado 0-100, media de ocupacao em %)
    """
    if not sheet_layouts:
        return 0.0, 0.0

    occupancies = [sl.occupancy for sl in sheet_layouts]
    avg_occ = sum(occupancies) / len(occupancies) if occupancies else 0

    # Score base: media ponderada
    score = 0.0

    for occ in occupancies:
        # Contribuicao quadratica (0-100)
        score += (occ / 100) ** 2 * 100

        # Bonus por faixa
        if occ >= 95:
            score += 20
        elif occ >= 90:
            score += 15
        elif occ >= 80:
            score += 8
        elif occ >= 70:
            score += 4

        # Penalidade para baixa ocupacao
        if occ < 30:
            score -= 30
        elif occ < 50:
            score -= 10

    # Normalizar pela quantidade de chapas
    score = score / len(sheet_layouts)

    # Clamp 0-100
    score = max(0, min(100, score))

    return score, avg_occ


def _score_sheet_count(
    n_sheets: int, min_theoretical: int
) -> tuple[float, int]:
    """Score do numero de chapas (0-100, menos chapas=melhor).

    100 = numero minimo teorico
    0 = muito acima do minimo

    Returns:
        (score 0-100, numero de chapas)
    """
    if n_sheets <= 0:
        return 0.0, 0

    if min_theoretical <= 0:
        min_theoretical = 1

    if n_sheets <= min_theoretical:
        return 100.0, n_sheets

    # Penalidade proporcional ao excesso
    excess = n_sheets - min_theoretical
    penalty = excess * 30  # -30 por chapa excedente
    score = max(0, 100 - penalty)

    return score, n_sheets


def _score_compactness(sheet_layouts: list[SheetLayout]) -> tuple[float, float]:
    """Score de compactacao (0-100).

    Mede quao compactadas estao as pecas (convex hull vs total).

    Returns:
        (score 0-100, percentual de compactacao)
    """
    if not sheet_layouts:
        return 0.0, 0.0

    compactness_values = []

    for sl in sheet_layouts:
        if not sl.placements:
            continue

        # Bounding box de todas as pecas
        min_x = float("inf")
        min_y = float("inf")
        max_x = 0
        max_y = 0

        total_piece_area = 0

        for p in sl.placements:
            min_x = min(min_x, p.x)
            min_y = min(min_y, p.y)
            max_x = max(max_x, p.x + p.effective_length)
            max_y = max(max_y, p.y + p.effective_width)
            total_piece_area += p.effective_length * p.effective_width

        bbox_area = (max_x - min_x) * (max_y - min_y)
        if bbox_area > 0:
            compactness = (total_piece_area / bbox_area) * 100
            compactness_values.append(compactness)

    if not compactness_values:
        return 0.0, 0.0

    avg_compactness = sum(compactness_values) / len(compactness_values)
    # Score: compactness direta (0-100)
    score = min(100, avg_compactness)

    return score, avg_compactness


def _score_travel_distance(sheet_layouts: list[SheetLayout]) -> tuple[float, float]:
    """Estimativa de deslocamento vazio G0 (0-100).

    Usa nearest-neighbor simplificado para estimar distancia.

    Returns:
        (score 0-100, distancia total em mm)
    """
    if not sheet_layouts:
        return 100.0, 0.0

    total_travel = 0.0

    for sl in sheet_layouts:
        if len(sl.placements) < 2:
            continue

        # Centros das pecas
        centers = [
            (p.x + p.effective_length / 2, p.y + p.effective_width / 2)
            for p in sl.placements
        ]

        # Nearest-neighbor TSP estimado
        visited = [False] * len(centers)
        current = 0
        visited[0] = True
        sheet_travel = 0.0

        for _ in range(len(centers) - 1):
            best_dist = float("inf")
            best_next = -1
            for j in range(len(centers)):
                if visited[j]:
                    continue
                dx = centers[current][0] - centers[j][0]
                dy = centers[current][1] - centers[j][1]
                d = math.sqrt(dx ** 2 + dy ** 2)
                if d < best_dist:
                    best_dist = d
                    best_next = j
            if best_next >= 0:
                sheet_travel += best_dist
                visited[best_next] = True
                current = best_next

        total_travel += sheet_travel

    # Normalizar: menos travel = melhor
    # Referencia: diagonal da chapa padrao = sqrt(2750^2 + 1850^2) ≈ 3315mm
    # Travel < diagonal = bom, travel > 5*diagonal = ruim
    ref_dist = 3315  # mm
    n = sum(len(sl.placements) for sl in sheet_layouts)
    if n <= 1:
        return 100.0, 0.0

    avg_travel_per_piece = total_travel / max(1, n - 1)
    score = max(0, 100 - (avg_travel_per_piece / ref_dist) * 50)

    return score, total_travel


def _score_vacuum_support(sheet_layouts: list[SheetLayout]) -> tuple[float, float]:
    """Score de suporte de vacuo (0-100).

    Placeholder — sera refinado na FASE 8.
    Usa posicao das pecas como estimativa basica.

    Returns:
        (score 0-100, risco medio)
    """
    if not sheet_layouts:
        return 100.0, 0.0

    risks = []
    for sl in sheet_layouts:
        for p in sl.placements:
            # Estimativa simplificada baseada na posicao e tamanho
            area = p.effective_length * p.effective_width
            min_dim = min(p.effective_length, p.effective_width)

            # Pecas maiores = menos risco
            if min_dim >= 400:
                risk = 0.1
            elif min_dim >= 200:
                risk = 0.3
            else:
                risk = 0.6

            risks.append(risk)

    avg_risk = sum(risks) / len(risks) if risks else 0
    # Converter risco (0-1) em score (0-100): menos risco = melhor
    score = max(0, (1 - avg_risk) * 100)

    return score, avg_risk


def _score_rotation_quality(sheet_layouts: list[SheetLayout]) -> tuple[float, float]:
    """Score de qualidade das rotacoes (0-100).

    Baseia-se no rotation_score de cada placement.

    Returns:
        (score 0-100, media dos rotation_scores)
    """
    scores = []
    for sl in sheet_layouts:
        for p in sl.placements:
            scores.append(p.rotation_score)

    if not scores:
        return 50.0, 0.0  # Neutro

    avg = sum(scores) / len(scores)
    # rotation_score ja e 0-1
    score = avg * 100

    return max(0, min(100, score)), avg


def _score_remnant_value(
    sheet_layouts: list[SheetLayout],
    min_width: float = 300,
    min_length: float = 600,
) -> tuple[float, float]:
    """Score de valor dos retalhos (0-100).

    Retalhos aproveitaveis aumentam o score.

    Returns:
        (score 0-100, area total de retalhos em mm2)
    """
    total_remnant_area = 0.0
    total_sheet_area = 0.0

    for sl in sheet_layouts:
        sheet = sl.sheet
        usable_w = sheet.usable_length
        usable_h = sheet.usable_width
        total_sheet_area += usable_w * usable_h

        # Calcular area livre
        used_area = sum(
            p.effective_length * p.effective_width
            for p in sl.placements
        )
        free_area = (usable_w * usable_h) - used_area

        # Estimar se a area livre forma retalhos uteis
        if free_area > min_width * min_length:
            total_remnant_area += free_area * 0.5  # Estimativa conservadora

    if total_sheet_area == 0:
        return 0.0, 0.0

    # Score: quanto mais area de retalho util, melhor
    ratio = total_remnant_area / total_sheet_area
    score = min(100, ratio * 200)  # 50% retalho = 100 pontos

    return score, total_remnant_area


def _score_face_selection(
    sheet_layouts: list[SheetLayout],
    pieces_map: dict[int, Piece] | None = None,
) -> tuple[float, int]:
    """Score de selecao de face (0-100, menos flips=melhor).

    Returns:
        (score 0-100, numero de flips)
    """
    total_pieces = sum(len(sl.placements) for sl in sheet_layouts)
    if total_pieces == 0:
        return 100.0, 0

    # Sem mapa de pecas, estimar flips como 0 (otimista)
    # Sera refinado quando tivermos dados de face
    flip_count = 0
    if pieces_map:
        for sl in sheet_layouts:
            for p in sl.placements:
                piece = pieces_map.get(p.piece_id)
                if piece and piece.machining and piece.machining.workers:
                    # Verificar se tem workers em ambos os lados
                    faces = set()
                    for w in piece.machining.workers:
                        faces.add(w.face)
                    if len(faces) > 1:
                        flip_count += 1

    # Score: 100 - (flips/total * 100)
    score = max(0, 100 - (flip_count / total_pieces) * 100)

    return score, flip_count


# ---------------------------------------------------------------------------
# Motor de score principal
# ---------------------------------------------------------------------------

def score_layout(
    layout: LayoutResult,
    weights: ScoreWeights | None = None,
    pieces: list[Piece] | None = None,
) -> ScoreBreakdown:
    """Calcular score global multi-objetivo de um layout.

    Score MAIOR = MELHOR (escala 0-100).

    Args:
        layout: Resultado do layout
        weights: Pesos dos componentes. None = BALANCED.
        pieces: Lista de pecas originais (para face analysis)

    Returns:
        ScoreBreakdown com todos os componentes
    """
    weights = weights or BALANCED
    result = ScoreBreakdown()

    # Mapa de pecas
    pieces_map = {p.id: p for p in pieces} if pieces else None

    # Minimo teorico de chapas
    if pieces:
        total_area = sum(p.length * p.width * p.quantity for p in pieces)
        if layout.sheets:
            sheet = layout.sheets[0].sheet
            sheet_area = sheet.usable_length * sheet.usable_width
            min_theo = max(1, math.ceil(total_area / sheet_area)) if sheet_area > 0 else 1
        else:
            min_theo = 1
    else:
        min_theo = max(1, layout.total_sheets)

    # Calcular cada componente
    occ_score, avg_occ = _score_occupancy(layout.sheets)
    sheet_score, n_sheets = _score_sheet_count(layout.total_sheets, min_theo)
    compact_score, compact_pct = _score_compactness(layout.sheets)
    travel_score, travel_mm = _score_travel_distance(layout.sheets)
    vacuum_score, vacuum_avg = _score_vacuum_support(layout.sheets)
    rotation_score, rotation_avg = _score_rotation_quality(layout.sheets)
    remnant_score, remnant_area = _score_remnant_value(layout.sheets)
    face_score, flip_count = _score_face_selection(layout.sheets, pieces_map)

    # Ponderar
    result.occupancy = occ_score * weights.occupancy
    result.sheet_count = sheet_score * weights.sheet_count
    result.compactness = compact_score * weights.compactness
    result.travel_distance = travel_score * weights.travel_distance
    result.vacuum_support = vacuum_score * weights.vacuum_support
    result.rotation_quality = rotation_score * weights.rotation_quality
    result.remnant_value = remnant_score * weights.remnant_value
    result.face_selection = face_score * weights.face_selection

    # Total
    result.total = (
        result.occupancy + result.sheet_count +
        result.compactness + result.travel_distance +
        result.vacuum_support + result.rotation_quality +
        result.remnant_value + result.face_selection
    )

    # Metricas brutas
    result.raw_occupancy_pct = avg_occ
    result.raw_sheet_count = n_sheets
    result.raw_compactness_pct = compact_pct
    result.raw_travel_mm = travel_mm
    result.raw_vacuum_avg = vacuum_avg
    result.raw_rotation_avg = rotation_avg
    result.raw_remnant_area_mm2 = remnant_area
    result.raw_flip_count = flip_count

    return result


def compare_layouts(
    layouts: list[LayoutResult],
    weights: ScoreWeights | None = None,
    pieces: list[Piece] | None = None,
) -> list[tuple[int, ScoreBreakdown]]:
    """Comparar multiplos layouts e ranquear.

    Args:
        layouts: Lista de layouts a comparar
        weights: Pesos dos componentes
        pieces: Pecas originais

    Returns:
        Lista de (indice, ScoreBreakdown) ordenada por score desc
    """
    scored = []
    for i, layout in enumerate(layouts):
        breakdown = score_layout(layout, weights, pieces)
        scored.append((i, breakdown))

    # Ordenar por score total descendente (maior = melhor)
    scored.sort(key=lambda x: x[1].total, reverse=True)

    return scored
