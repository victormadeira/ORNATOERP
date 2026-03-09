"""Seletor de retalhos vs chapas novas.

Decide quando usar retalho existente vs abrir chapa nova,
baseado em aproveitamento previsto e valor do retalho.

Regras principais:
- Usar retalho se aproveitamento > 50% E cobre > 30% da area das pecas
- Priorizar retalhos por material_code exato
- Considerar grade do retalho (A/B preferidos)
- Fallback para chapa nova se retalhos insuficientes
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import Piece, Sheet, Remnant
from app.core.remnants.remnant_value import (
    RemnantValueConfig, RemnantValuation,
    evaluate_remnant, classify_grade,
)


# ---------------------------------------------------------------------------
# Configuracao de selecao
# ---------------------------------------------------------------------------

@dataclass
class SelectionConfig:
    """Parametros para decisao retalho vs chapa nova."""

    # Thresholds de aproveitamento
    min_remnant_occupancy: float = 50.0     # % minimo de uso do retalho
    min_area_coverage: float = 30.0         # % minimo de cobertura das pecas
    max_waste_pct: float = 40.0             # % maximo de desperdicio aceitavel

    # Grade minima para considerar retalho
    min_grade: str = "C"

    # Bonus por reutilizacao (incentivo ambiental/economico)
    reuse_bonus: float = 10.0              # Pontos bonus para usar retalho

    # Margem dimensional (mm)
    margin: float = 20.0                   # Folga minima em cada dimensao

    # Valor de retalhos
    value_config: RemnantValueConfig = field(default_factory=RemnantValueConfig)


# ---------------------------------------------------------------------------
# Resultado da selecao
# ---------------------------------------------------------------------------

@dataclass
class SelectionResult:
    """Resultado da decisao retalho vs chapa nova."""
    decision: str = "new_sheet"    # "remnant" ou "new_sheet"
    selected_remnant: Optional[Remnant] = None
    selected_sheet: Optional[Sheet] = None

    # Score da decisao
    decision_score: float = 0.0
    remnant_score: float = 0.0       # Score do retalho selecionado
    occupancy_estimate: float = 0.0  # % de uso estimado

    # Informacoes
    reason: str = ""
    candidates_evaluated: int = 0
    pieces_that_fit: int = 0

    def to_dict(self) -> dict:
        return {
            "decision": self.decision,
            "remnant_id": self.selected_remnant.id if self.selected_remnant else None,
            "sheet_id": self.selected_sheet.id if self.selected_sheet else None,
            "decision_score": round(self.decision_score, 1),
            "occupancy_estimate": round(self.occupancy_estimate, 1),
            "reason": self.reason,
            "candidates": self.candidates_evaluated,
        }


# ---------------------------------------------------------------------------
# Funcoes de verificacao
# ---------------------------------------------------------------------------

def _pieces_fit_in_remnant(
    pieces: list[Piece],
    remnant: Remnant,
    margin: float = 20.0,
) -> tuple[bool, float, int]:
    """Verificar se pecas cabem no retalho (estimativa rapida).

    Usa heuristica de area + dimensao maxima (nao placement real).

    Args:
        pieces: Pecas a colocar
        remnant: Retalho candidato
        margin: Margem em mm

    Returns:
        (pode_caber, ocupacao_estimada, pecas_que_cabem)
    """
    if not pieces:
        return True, 0.0, 0

    usable_l = remnant.length - margin
    usable_w = remnant.width - margin

    if usable_l <= 0 or usable_w <= 0:
        return False, 0.0, 0

    remnant_area = usable_l * usable_w
    pieces_area = 0.0
    fit_count = 0

    for p in pieces:
        pl, pw = p.length, p.width
        # Verificar se a peca cabe (normal ou rotacionada)
        fits_normal = (pl <= usable_l and pw <= usable_w)
        fits_rotated = (pw <= usable_l and pl <= usable_w)

        if fits_normal or fits_rotated:
            pieces_area += pl * pw
            fit_count += 1

    if fit_count == 0:
        return False, 0.0, 0

    occupancy = min(100, (pieces_area / remnant_area) * 100)

    # Estimativa conservadora: se area > 80% do retalho, provavelmente
    # nem tudo cabe por causa de fragmentacao
    all_fit = pieces_area <= remnant_area * 0.95

    return all_fit, occupancy, fit_count


def _calculate_remnant_score(
    remnant: Remnant,
    occupancy_estimate: float,
    valuation: RemnantValuation,
    config: SelectionConfig,
) -> float:
    """Calcular score para usar este retalho.

    Score MAIOR = melhor usar retalho.

    Componentes:
    - Ocupacao estimada (peso forte)
    - Valor do retalho (inverso: retalho barato = melhor usar)
    - Bonus por reuso
    """
    # Score base: ocupacao
    occ_score = occupancy_estimate  # 0-100

    # Retalhos de grade baixa sao melhores para usar (menos desperdicio)
    grade_bonus = {"A": 0, "B": 5, "C": 10, "D": 15, "F": 20}
    bonus = grade_bonus.get(valuation.grade, 0)

    # Score total
    score = occ_score + bonus + config.reuse_bonus

    return min(100, score)


# ---------------------------------------------------------------------------
# Seletor principal
# ---------------------------------------------------------------------------

def select_remnant_or_sheet(
    pieces: list[Piece],
    available_remnants: list[Remnant],
    available_sheets: list[Sheet],
    material_code: str,
    config: SelectionConfig | None = None,
) -> SelectionResult:
    """Decidir se usar retalho ou chapa nova para um grupo de pecas.

    Args:
        pieces: Pecas a colocar (mesmo material)
        available_remnants: Retalhos disponiveis
        available_sheets: Chapas novas disponiveis
        material_code: Codigo do material das pecas
        config: Configuracao de selecao

    Returns:
        SelectionResult com a decisao
    """
    if config is None:
        config = SelectionConfig()

    # Grade minima
    grade_order = {"A": 5, "B": 4, "C": 3, "D": 2, "F": 1}
    min_level = grade_order.get(config.min_grade, 3)

    # Filtrar retalhos do mesmo material e disponiveis
    matching_remnants = [
        r for r in available_remnants
        if r.material_code == material_code and r.available
    ]

    if not matching_remnants:
        # Sem retalhos — chapa nova
        sheet = _find_sheet(available_sheets, material_code)
        return SelectionResult(
            decision="new_sheet",
            selected_sheet=sheet,
            reason="Sem retalhos disponiveis para este material",
        )

    # Avaliar cada retalho
    best_result: Optional[SelectionResult] = None
    best_score = -1.0

    for remnant in matching_remnants:
        # Avaliar valor do retalho
        valuation = evaluate_remnant(remnant, config.value_config)

        # Verificar grade minima
        if grade_order.get(valuation.grade, 0) < min_level:
            continue

        # Verificar se pecas cabem
        can_fit, occupancy, fit_count = _pieces_fit_in_remnant(
            pieces, remnant, config.margin
        )

        if fit_count == 0:
            continue

        # Verificar thresholds
        if occupancy < config.min_remnant_occupancy:
            continue

        total_pieces_area = sum(p.length * p.width for p in pieces)
        remnant_area = remnant.area
        coverage = (total_pieces_area / remnant_area * 100) if remnant_area > 0 else 0

        if coverage < config.min_area_coverage:
            continue

        # Calcular score
        score = _calculate_remnant_score(
            remnant, occupancy, valuation, config
        )

        if score > best_score:
            best_score = score
            best_result = SelectionResult(
                decision="remnant",
                selected_remnant=remnant,
                decision_score=score,
                remnant_score=valuation.total_score,
                occupancy_estimate=occupancy,
                reason=f"Retalho {remnant.id} ({remnant.length}x{remnant.width}mm, "
                       f"grade {valuation.grade}, ocupacao estimada {occupancy:.0f}%)",
                candidates_evaluated=len(matching_remnants),
                pieces_that_fit=fit_count,
            )

    if best_result is not None:
        return best_result

    # Nenhum retalho aprovado — chapa nova
    sheet = _find_sheet(available_sheets, material_code)
    return SelectionResult(
        decision="new_sheet",
        selected_sheet=sheet,
        candidates_evaluated=len(matching_remnants),
        reason="Nenhum retalho atende criterios minimos de ocupacao/cobertura",
    )


def _find_sheet(
    sheets: list[Sheet],
    material_code: str,
) -> Optional[Sheet]:
    """Encontrar chapa compativel com o material."""
    # Match exato primeiro
    for s in sheets:
        if s.material_code == material_code:
            return s

    # Sem match
    return sheets[0] if sheets else None


# ---------------------------------------------------------------------------
# Selecao em lote
# ---------------------------------------------------------------------------

def select_for_material_groups(
    groups: dict[str, list[Piece]],
    available_remnants: list[Remnant],
    available_sheets: list[Sheet],
    config: SelectionConfig | None = None,
) -> dict[str, SelectionResult]:
    """Selecionar retalho/chapa para cada grupo de material.

    Args:
        groups: Dicionario material_code → pecas
        available_remnants: Retalhos disponiveis
        available_sheets: Chapas novas disponiveis
        config: Configuracao

    Returns:
        Dicionario material_code → SelectionResult
    """
    results = {}
    used_remnants: set[int] = set()

    # Ordenar grupos por area total (maior primeiro = mais beneficio de retalho)
    sorted_groups = sorted(
        groups.items(),
        key=lambda g: sum(p.length * p.width for p in g[1]),
        reverse=True,
    )

    for material_code, pieces in sorted_groups:
        # Filtrar retalhos ja alocados
        remaining_remnants = [
            r for r in available_remnants
            if r.id not in used_remnants
        ]

        result = select_remnant_or_sheet(
            pieces, remaining_remnants, available_sheets,
            material_code, config
        )

        if result.decision == "remnant" and result.selected_remnant:
            used_remnants.add(result.selected_remnant.id)

        results[material_code] = result

    return results


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def estimate_savings(
    decisions: dict[str, SelectionResult],
    sheet_price: float = 150.0,  # Preco por chapa nova (R$)
) -> dict:
    """Estimar economia com uso de retalhos.

    Args:
        decisions: Resultados das decisoes por material
        sheet_price: Preco medio de uma chapa nova

    Returns:
        Resumo financeiro
    """
    remnant_uses = sum(
        1 for d in decisions.values() if d.decision == "remnant"
    )
    new_sheets = sum(
        1 for d in decisions.values() if d.decision == "new_sheet"
    )

    savings = remnant_uses * sheet_price  # Simplificado

    return {
        "remnant_uses": remnant_uses,
        "new_sheets": new_sheets,
        "estimated_savings_brl": round(savings, 2),
        "reuse_percentage": (
            round(remnant_uses / (remnant_uses + new_sheets) * 100, 1)
            if (remnant_uses + new_sheets) > 0 else 0
        ),
    }
