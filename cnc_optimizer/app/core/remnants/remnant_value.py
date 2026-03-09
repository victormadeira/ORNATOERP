"""Avaliacao de valor de retalhos (sobras de chapa).

Sistema de scoring para classificar retalhos por:
- Area aproveitavel
- Retangularidade (proximidade de retangulo perfeito)
- Dimensao minima (largura e comprimento minimos)
- Fragmentacao (regioes desconectadas)
- Formato (proporcao util)

Score MAIOR = retalho MAIS valioso.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import Remnant, Sheet


# ---------------------------------------------------------------------------
# Configuracao de avaliacao
# ---------------------------------------------------------------------------

@dataclass
class RemnantValueConfig:
    """Pesos e thresholds para avaliacao de retalhos."""

    # Pesos dos componentes (somam 1.0)
    weight_area: float = 0.35
    weight_rectangularity: float = 0.15
    weight_min_dimension: float = 0.20
    weight_aspect_ratio: float = 0.15
    weight_material_demand: float = 0.15

    # Thresholds
    min_usable_width: float = 300      # mm - largura minima para retalho util
    min_usable_length: float = 600     # mm - comprimento minimo para retalho util
    ideal_min_dimension: float = 500   # mm - dimensao minima ideal
    max_aspect_ratio: float = 6.0      # ratio max antes de penalizar

    # Area de referencia (chapa padrao 2750x1850)
    reference_area: float = 2750 * 1850  # 5_087_500 mm²

    def validate(self) -> bool:
        total = (
            self.weight_area + self.weight_rectangularity +
            self.weight_min_dimension + self.weight_aspect_ratio +
            self.weight_material_demand
        )
        return abs(total - 1.0) < 0.01


# ---------------------------------------------------------------------------
# Resultado da avaliacao
# ---------------------------------------------------------------------------

@dataclass
class RemnantValuation:
    """Resultado completo da avaliacao de um retalho."""
    remnant_id: int = 0
    total_score: float = 0.0      # 0-100

    # Componentes individuais (0-100)
    area_score: float = 0.0
    rectangularity_score: float = 0.0
    min_dimension_score: float = 0.0
    aspect_ratio_score: float = 0.0
    material_demand_score: float = 0.0

    # Dados brutos
    area_mm2: float = 0.0
    rectangularity: float = 0.0    # 0-1 (1 = retangulo perfeito)
    min_dim: float = 0.0           # mm
    aspect_ratio: float = 0.0
    is_usable: bool = False

    # Classificacao
    grade: str = ""    # A, B, C, D, F

    def to_dict(self) -> dict:
        return {
            "remnant_id": self.remnant_id,
            "total_score": round(self.total_score, 1),
            "grade": self.grade,
            "is_usable": self.is_usable,
            "components": {
                "area": round(self.area_score, 1),
                "rectangularity": round(self.rectangularity_score, 1),
                "min_dimension": round(self.min_dimension_score, 1),
                "aspect_ratio": round(self.aspect_ratio_score, 1),
                "material_demand": round(self.material_demand_score, 1),
            },
            "raw": {
                "area_mm2": round(self.area_mm2, 0),
                "rectangularity": round(self.rectangularity, 3),
                "min_dim_mm": round(self.min_dim, 1),
                "aspect_ratio": round(self.aspect_ratio, 2),
            },
        }


# ---------------------------------------------------------------------------
# Funcoes de scoring individuais
# ---------------------------------------------------------------------------

def _score_area(area: float, reference_area: float) -> float:
    """Score de area: maior = melhor, normalizado pela chapa de referencia.

    - 50% da chapa = score ~80
    - 25% da chapa = score ~60
    - 10% da chapa = score ~40
    - < 5% = score baixo
    """
    if reference_area <= 0 or area <= 0:
        return 0.0

    ratio = area / reference_area

    if ratio >= 0.5:
        return min(100, 80 + (ratio - 0.5) * 40)
    elif ratio >= 0.25:
        return 60 + (ratio - 0.25) / 0.25 * 20
    elif ratio >= 0.10:
        return 40 + (ratio - 0.10) / 0.15 * 20
    elif ratio >= 0.03:
        return 15 + (ratio - 0.03) / 0.07 * 25
    else:
        return ratio / 0.03 * 15


def _score_rectangularity(rectangularity: float) -> float:
    """Score de retangularidade: 1.0 = perfeito.

    Retangulos perfeitos sao mais faceis de reutilizar.
    """
    if rectangularity >= 0.95:
        return 100
    elif rectangularity >= 0.80:
        return 70 + (rectangularity - 0.80) / 0.15 * 30
    elif rectangularity >= 0.60:
        return 40 + (rectangularity - 0.60) / 0.20 * 30
    else:
        return max(0, rectangularity / 0.60 * 40)


def _score_min_dimension(min_dim: float, config: RemnantValueConfig) -> float:
    """Score baseado na menor dimensao.

    Retalhos muito estreitos sao dificeis de usar.
    """
    if min_dim >= config.ideal_min_dimension:
        return 100
    elif min_dim >= config.min_usable_width:
        ratio = (min_dim - config.min_usable_width) / (
            config.ideal_min_dimension - config.min_usable_width
        )
        return 50 + ratio * 50
    elif min_dim >= 200:
        return 20 + (min_dim - 200) / (config.min_usable_width - 200) * 30
    else:
        return max(0, min_dim / 200 * 20)


def _score_aspect_ratio(aspect_ratio: float, max_ratio: float) -> float:
    """Score de proporcao: proximo de 1.0 = quadrado (melhor).

    Pecas muito longas/finas sao menos versateis.
    """
    if aspect_ratio <= 0:
        return 0.0

    # Normalizar para >= 1.0
    r = max(aspect_ratio, 1.0 / aspect_ratio) if aspect_ratio > 0 else 1.0

    if r <= 1.5:
        return 100
    elif r <= 2.5:
        return 80 + (2.5 - r) / 1.0 * 20
    elif r <= max_ratio:
        return 40 + (max_ratio - r) / (max_ratio - 2.5) * 40
    else:
        return max(0, 40 - (r - max_ratio) * 10)


def _score_material_demand(
    material_code: str,
    demand_map: dict[str, float] | None = None,
) -> float:
    """Score de demanda do material.

    Materiais com alta demanda historica valem mais como retalho.
    Se sem dados, retorna score neutro (50).
    """
    if demand_map is None or not demand_map:
        return 50.0  # Neutro

    demand = demand_map.get(material_code, 0)
    if demand <= 0:
        return 30.0  # Material sem demanda conhecida

    max_demand = max(demand_map.values()) if demand_map else 1
    ratio = demand / max_demand if max_demand > 0 else 0

    return 30 + ratio * 70  # 30-100


# ---------------------------------------------------------------------------
# Classificacao por grade
# ---------------------------------------------------------------------------

def classify_grade(score: float) -> str:
    """Classificar retalho por grade baseado no score total."""
    if score >= 80:
        return "A"  # Excelente — prioridade maxima de reuso
    elif score >= 60:
        return "B"  # Bom — vale guardar
    elif score >= 40:
        return "C"  # Razoavel — guardar se tiver espaco
    elif score >= 20:
        return "D"  # Ruim — so guardar se material caro
    else:
        return "F"  # Inaproveitavel — descarte


# ---------------------------------------------------------------------------
# Avaliacao completa
# ---------------------------------------------------------------------------

def evaluate_remnant(
    remnant: Remnant,
    config: RemnantValueConfig | None = None,
    demand_map: dict[str, float] | None = None,
) -> RemnantValuation:
    """Avaliar valor de um retalho.

    Args:
        remnant: Retalho a avaliar
        config: Configuracao de pesos e thresholds
        demand_map: Mapa material_code -> demanda relativa (0-1)

    Returns:
        RemnantValuation com score e classificacao
    """
    if config is None:
        config = RemnantValueConfig()

    # Dados brutos
    area = remnant.area
    min_dim = min(remnant.length, remnant.width)
    max_dim = max(remnant.length, remnant.width)
    aspect = max_dim / min_dim if min_dim > 0 else float("inf")

    # Retangularidade: retalhos retangulares = 1.0
    # Para retalhos com contorno organico, seria area/bbox_area
    if remnant.contour is not None:
        # TODO: calcular area real do contorno vs bbox
        rectangularity = 0.8  # Placeholder para contornos organicos
    else:
        rectangularity = 1.0  # Retangulo perfeito

    # Scores individuais
    s_area = _score_area(area, config.reference_area)
    s_rect = _score_rectangularity(rectangularity)
    s_dim = _score_min_dimension(min_dim, config)
    s_ratio = _score_aspect_ratio(aspect, config.max_aspect_ratio)
    s_demand = _score_material_demand(remnant.material_code, demand_map)

    # Score total ponderado
    total = (
        s_area * config.weight_area +
        s_rect * config.weight_rectangularity +
        s_dim * config.weight_min_dimension +
        s_ratio * config.weight_aspect_ratio +
        s_demand * config.weight_material_demand
    )

    # Usabilidade
    is_usable = (
        remnant.length >= config.min_usable_length and
        remnant.width >= config.min_usable_width
    )

    # Se nao e usavel, cap o score
    if not is_usable:
        total = min(total, 20.0)

    return RemnantValuation(
        remnant_id=remnant.id,
        total_score=total,
        area_score=s_area,
        rectangularity_score=s_rect,
        min_dimension_score=s_dim,
        aspect_ratio_score=s_ratio,
        material_demand_score=s_demand,
        area_mm2=area,
        rectangularity=rectangularity,
        min_dim=min_dim,
        aspect_ratio=aspect,
        is_usable=is_usable,
        grade=classify_grade(total),
    )


def evaluate_remnants(
    remnants: list[Remnant],
    config: RemnantValueConfig | None = None,
    demand_map: dict[str, float] | None = None,
) -> list[RemnantValuation]:
    """Avaliar lista de retalhos e retornar ordenado por valor.

    Returns:
        Lista de RemnantValuation ordenada por score decrescente
    """
    valuations = [
        evaluate_remnant(r, config, demand_map)
        for r in remnants
    ]
    valuations.sort(key=lambda v: v.total_score, reverse=True)
    return valuations


def filter_usable_remnants(
    remnants: list[Remnant],
    config: RemnantValueConfig | None = None,
    min_grade: str = "C",
) -> list[Remnant]:
    """Filtrar apenas retalhos utilizaveis com grade minima.

    Args:
        remnants: Lista de retalhos
        config: Configuracao
        min_grade: Grade minima (A, B, C, D, F)

    Returns:
        Retalhos aprovados, ordenados por valor
    """
    grade_order = {"A": 5, "B": 4, "C": 3, "D": 2, "F": 1}
    min_level = grade_order.get(min_grade, 3)

    valuations = evaluate_remnants(remnants, config)
    filtered = [
        v for v in valuations
        if v.is_usable and grade_order.get(v.grade, 0) >= min_level
    ]

    # Retornar os Remnant objects na ordem
    remnant_map = {r.id: r for r in remnants}
    return [remnant_map[v.remnant_id] for v in filtered if v.remnant_id in remnant_map]
