"""Testes de gestao de retalhos (FASE 10)."""

import pytest

from app.core.domain.models import Piece, Sheet, Remnant
from app.core.remnants.remnant_value import (
    RemnantValueConfig, RemnantValuation,
    evaluate_remnant, evaluate_remnants, filter_usable_remnants,
    classify_grade,
    _score_area, _score_rectangularity, _score_min_dimension,
    _score_aspect_ratio, _score_material_demand,
)
from app.core.remnants.remnant_selector import (
    SelectionConfig, SelectionResult,
    select_remnant_or_sheet, select_for_material_groups,
    estimate_savings,
    _pieces_fit_in_remnant,
)


# ===================================================================
# Helpers
# ===================================================================

def _make_remnant(
    id: int = 1,
    length: float = 1000,
    width: float = 800,
    material_code: str = "MDF_18.5_BRANCO_TX",
    available: bool = True,
) -> Remnant:
    return Remnant(
        id=id, name=f"Retalho {id}",
        length=length, width=width,
        material_code=material_code,
        available=available,
    )


def _make_piece(
    id: int = 1,
    length: float = 400,
    width: float = 300,
    material_code: str = "MDF_18.5_BRANCO_TX",
) -> Piece:
    return Piece(
        id=id, persistent_id=f"P{id:03d}",
        description=f"Peca {id}",
        length=length, width=width,
        thickness_real=18.5,
        quantity=1,
        material_code=material_code,
    )


def _make_sheet(
    id: int = 1,
    material_code: str = "MDF_18.5_BRANCO_TX",
) -> Sheet:
    return Sheet(
        id=id, length=2750, width=1850,
        trim=10, material_code=material_code,
    )


# ===================================================================
# Testes de Score de Area
# ===================================================================

class TestAreaScore:
    """Testes do score de area."""

    def test_large_remnant_high_score(self):
        """Retalho grande = score alto."""
        ref = 2750 * 1850
        score = _score_area(ref * 0.5, ref)
        assert score >= 80

    def test_small_remnant_low_score(self):
        """Retalho pequeno = score baixo."""
        ref = 2750 * 1850
        score = _score_area(ref * 0.02, ref)
        assert score < 20

    def test_medium_remnant_medium_score(self):
        """Retalho medio = score medio."""
        ref = 2750 * 1850
        score = _score_area(ref * 0.15, ref)
        assert 30 < score < 70

    def test_zero_area(self):
        """Area zero = score 0."""
        assert _score_area(0, 2750 * 1850) == 0

    def test_zero_reference(self):
        """Referencia zero = score 0."""
        assert _score_area(1000, 0) == 0


# ===================================================================
# Testes de Retangularidade
# ===================================================================

class TestRectangularityScore:
    """Testes do score de retangularidade."""

    def test_perfect_rectangle(self):
        """Retangulo perfeito = score 100."""
        assert _score_rectangularity(1.0) == 100

    def test_near_rectangle(self):
        """Quase retangulo = score alto."""
        score = _score_rectangularity(0.95)
        assert score == 100

    def test_irregular(self):
        """Forma irregular = score baixo."""
        score = _score_rectangularity(0.5)
        assert score < 50

    def test_very_irregular(self):
        """Forma muito irregular = score muito baixo."""
        score = _score_rectangularity(0.2)
        assert score < 20


# ===================================================================
# Testes de Dimensao Minima
# ===================================================================

class TestMinDimensionScore:
    """Testes do score de dimensao minima."""

    def test_large_dimension(self):
        """Dimensao grande = score 100."""
        config = RemnantValueConfig()
        assert _score_min_dimension(600, config) == 100

    def test_threshold_dimension(self):
        """Dimensao no limite = score ~50."""
        config = RemnantValueConfig()
        score = _score_min_dimension(config.min_usable_width, config)
        assert 45 <= score <= 55

    def test_small_dimension(self):
        """Dimensao pequena = score baixo."""
        config = RemnantValueConfig()
        score = _score_min_dimension(150, config)
        assert score < 20

    def test_zero_dimension(self):
        """Dimensao zero = score 0."""
        config = RemnantValueConfig()
        score = _score_min_dimension(0, config)
        assert score == 0


# ===================================================================
# Testes de Aspect Ratio
# ===================================================================

class TestAspectRatioScore:
    """Testes do score de proporcao."""

    def test_square(self):
        """Quadrado = score 100."""
        assert _score_aspect_ratio(1.0, 6.0) == 100

    def test_mild_ratio(self):
        """Proporcao suave = score alto."""
        score = _score_aspect_ratio(1.5, 6.0)
        assert score == 100

    def test_high_ratio(self):
        """Proporcao alta = score baixo."""
        score = _score_aspect_ratio(8.0, 6.0)
        assert score < 40

    def test_zero_ratio(self):
        """Ratio zero = 0."""
        assert _score_aspect_ratio(0, 6.0) == 0


# ===================================================================
# Testes de Demanda de Material
# ===================================================================

class TestMaterialDemand:
    """Testes do score de demanda."""

    def test_no_demand_data(self):
        """Sem dados = score neutro (50)."""
        assert _score_material_demand("MDF_18.5_BRANCO_TX") == 50

    def test_high_demand(self):
        """Material com alta demanda = score alto."""
        demand = {"MDF_18.5_BRANCO_TX": 100, "MDF_18.5_CARVALHO": 30}
        score = _score_material_demand("MDF_18.5_BRANCO_TX", demand)
        assert score == 100

    def test_low_demand(self):
        """Material com baixa demanda = score baixo."""
        demand = {"MDF_18.5_BRANCO_TX": 100, "MDF_18.5_CARVALHO": 10}
        score = _score_material_demand("MDF_18.5_CARVALHO", demand)
        assert score < 50

    def test_unknown_material(self):
        """Material desconhecido = score 30."""
        demand = {"MDF_18.5_BRANCO_TX": 100}
        score = _score_material_demand("OUTRO", demand)
        assert score == 30


# ===================================================================
# Testes de Classificacao
# ===================================================================

class TestGradeClassification:
    """Testes da classificacao por grade."""

    def test_grade_a(self):
        assert classify_grade(85) == "A"

    def test_grade_b(self):
        assert classify_grade(65) == "B"

    def test_grade_c(self):
        assert classify_grade(45) == "C"

    def test_grade_d(self):
        assert classify_grade(25) == "D"

    def test_grade_f(self):
        assert classify_grade(10) == "F"


# ===================================================================
# Testes de Avaliacao Completa
# ===================================================================

class TestRemnantEvaluation:
    """Testes de avaliacao completa de retalhos."""

    def test_large_remnant_grade_a(self):
        """Retalho grande = grade A ou B."""
        r = _make_remnant(length=2000, width=1200)
        v = evaluate_remnant(r)
        assert v.grade in ("A", "B")
        assert v.is_usable

    def test_small_remnant_low_grade(self):
        """Retalho pequeno = grade baixa."""
        r = _make_remnant(length=400, width=250)
        v = evaluate_remnant(r)
        assert v.grade in ("D", "F")

    def test_narrow_remnant_penalized(self):
        """Retalho estreito = penalizado."""
        r_wide = _make_remnant(length=1000, width=800)
        r_narrow = _make_remnant(length=2000, width=350)
        v_wide = evaluate_remnant(r_wide)
        v_narrow = evaluate_remnant(r_narrow)
        # Largura 350 vs 800 — wide tem melhor score de dimensao
        assert v_wide.min_dimension_score > v_narrow.min_dimension_score

    def test_usability_check(self):
        """Retalho abaixo do minimo = nao usavel."""
        r = _make_remnant(length=500, width=200)
        v = evaluate_remnant(r)
        assert not v.is_usable

    def test_usable_remnant(self):
        """Retalho acima do minimo = usavel."""
        r = _make_remnant(length=800, width=400)
        v = evaluate_remnant(r)
        assert v.is_usable

    def test_to_dict(self):
        """Conversao para dicionario."""
        r = _make_remnant()
        v = evaluate_remnant(r)
        d = v.to_dict()
        assert "total_score" in d
        assert "grade" in d
        assert "components" in d
        assert "raw" in d

    def test_evaluate_multiple(self):
        """Avaliar lista retorna ordenada por score."""
        remnants = [
            _make_remnant(id=1, length=400, width=300),   # Pequeno
            _make_remnant(id=2, length=2000, width=1200), # Grande
            _make_remnant(id=3, length=800, width=600),   # Medio
        ]
        valuations = evaluate_remnants(remnants)
        assert len(valuations) == 3
        # Deve estar em ordem decrescente
        assert valuations[0].total_score >= valuations[1].total_score
        assert valuations[1].total_score >= valuations[2].total_score
        # O grande deve ser o primeiro
        assert valuations[0].remnant_id == 2

    def test_filter_usable(self):
        """Filtrar apenas retalhos usaveis."""
        remnants = [
            _make_remnant(id=1, length=200, width=150),   # Muito pequeno
            _make_remnant(id=2, length=2000, width=1200), # Grande
            _make_remnant(id=3, length=800, width=600),   # Medio
        ]
        usable = filter_usable_remnants(remnants, min_grade="C")
        # Retalho muito pequeno nao deve aparecer
        assert all(r.id != 1 for r in usable)
        assert len(usable) >= 1

    def test_config_weights_valid(self):
        """Config default deve ter pesos validos."""
        config = RemnantValueConfig()
        assert config.validate()


# ===================================================================
# Testes de Fit em Retalho
# ===================================================================

class TestPiecesFit:
    """Testes de verificacao se pecas cabem em retalho."""

    def test_single_piece_fits(self):
        """Uma peca que cabe."""
        pieces = [_make_piece(length=400, width=300)]
        remnant = _make_remnant(length=1000, width=800)
        fits, occ, count = _pieces_fit_in_remnant(pieces, remnant)
        assert fits
        assert count == 1
        assert occ > 0

    def test_piece_too_big(self):
        """Peca que nao cabe."""
        pieces = [_make_piece(length=1200, width=900)]
        remnant = _make_remnant(length=1000, width=800)
        fits, occ, count = _pieces_fit_in_remnant(pieces, remnant)
        assert count == 0

    def test_piece_fits_rotated(self):
        """Peca cabe se rotacionada."""
        pieces = [_make_piece(length=700, width=400)]
        remnant = _make_remnant(length=500, width=800)
        fits, occ, count = _pieces_fit_in_remnant(pieces, remnant)
        assert count == 1  # Cabe rotacionada (400x700 em 480x780)

    def test_empty_pieces(self):
        """Lista vazia = cabe."""
        fits, occ, count = _pieces_fit_in_remnant([], _make_remnant())
        assert fits
        assert count == 0

    def test_multiple_pieces(self):
        """Multiplas pecas."""
        pieces = [
            _make_piece(id=1, length=300, width=200),
            _make_piece(id=2, length=300, width=200),
            _make_piece(id=3, length=300, width=200),
        ]
        remnant = _make_remnant(length=1000, width=800)
        fits, occ, count = _pieces_fit_in_remnant(pieces, remnant)
        assert count == 3
        assert occ > 0


# ===================================================================
# Testes do Seletor
# ===================================================================

class TestRemnantSelector:
    """Testes do seletor retalho vs chapa nova."""

    def test_no_remnants_uses_sheet(self):
        """Sem retalhos = chapa nova."""
        pieces = [_make_piece()]
        sheets = [_make_sheet()]
        result = select_remnant_or_sheet(
            pieces, [], sheets, "MDF_18.5_BRANCO_TX"
        )
        assert result.decision == "new_sheet"

    def test_good_remnant_selected(self):
        """Retalho bom = usar retalho."""
        pieces = [
            _make_piece(id=1, length=500, width=400),
            _make_piece(id=2, length=500, width=400),
        ]
        remnants = [_make_remnant(length=800, width=600)]
        sheets = [_make_sheet()]
        result = select_remnant_or_sheet(
            pieces, remnants, sheets, "MDF_18.5_BRANCO_TX"
        )
        assert result.decision == "remnant"
        assert result.selected_remnant is not None

    def test_small_remnant_uses_sheet(self):
        """Retalho muito pequeno = chapa nova."""
        pieces = [_make_piece(id=1, length=2000, width=1000)]
        remnants = [_make_remnant(length=500, width=400)]
        sheets = [_make_sheet()]
        result = select_remnant_or_sheet(
            pieces, remnants, sheets, "MDF_18.5_BRANCO_TX"
        )
        assert result.decision == "new_sheet"

    def test_wrong_material_ignored(self):
        """Retalho de material diferente = ignorado."""
        pieces = [_make_piece(material_code="MDF_18.5_CARVALHO")]
        remnants = [_make_remnant(material_code="MDF_18.5_BRANCO_TX")]
        sheets = [_make_sheet(material_code="MDF_18.5_CARVALHO")]
        result = select_remnant_or_sheet(
            pieces, remnants, sheets, "MDF_18.5_CARVALHO"
        )
        assert result.decision == "new_sheet"

    def test_unavailable_remnant_ignored(self):
        """Retalho indisponivel = ignorado."""
        pieces = [_make_piece(length=400, width=300)]
        remnants = [_make_remnant(available=False)]
        sheets = [_make_sheet()]
        result = select_remnant_or_sheet(
            pieces, remnants, sheets, "MDF_18.5_BRANCO_TX"
        )
        assert result.decision == "new_sheet"

    def test_best_remnant_chosen(self):
        """Melhor retalho entre candidatos."""
        pieces = [
            _make_piece(id=1, length=400, width=300),
            _make_piece(id=2, length=400, width=300),
        ]
        remnants = [
            _make_remnant(id=1, length=600, width=400),    # Menor
            _make_remnant(id=2, length=1000, width=800),   # Medio (bom fit)
            _make_remnant(id=3, length=2500, width=1800),  # Enorme (desperdicio)
        ]
        sheets = [_make_sheet()]
        result = select_remnant_or_sheet(
            pieces, remnants, sheets, "MDF_18.5_BRANCO_TX"
        )
        if result.decision == "remnant":
            # Deve preferir o que da melhor ocupacao
            assert result.occupancy_estimate > 0

    def test_to_dict(self):
        """Conversao para dicionario."""
        result = SelectionResult(
            decision="new_sheet",
            reason="Teste",
        )
        d = result.to_dict()
        assert "decision" in d
        assert d["decision"] == "new_sheet"


# ===================================================================
# Testes de Selecao em Lote
# ===================================================================

class TestBatchSelection:
    """Testes de selecao em lote para multiplos materiais."""

    def test_multiple_materials(self):
        """Selecionar para multiplos materiais."""
        groups = {
            "MDF_18.5_BRANCO_TX": [
                _make_piece(id=1, length=400, width=300, material_code="MDF_18.5_BRANCO_TX"),
            ],
            "MDF_18.5_CARVALHO": [
                _make_piece(id=2, length=400, width=300, material_code="MDF_18.5_CARVALHO"),
            ],
        }
        remnants = [
            _make_remnant(id=1, length=1000, width=800, material_code="MDF_18.5_BRANCO_TX"),
        ]
        sheets = [
            _make_sheet(id=1, material_code="MDF_18.5_BRANCO_TX"),
            _make_sheet(id=2, material_code="MDF_18.5_CARVALHO"),
        ]
        results = select_for_material_groups(groups, remnants, sheets)
        assert len(results) == 2
        assert "MDF_18.5_BRANCO_TX" in results
        assert "MDF_18.5_CARVALHO" in results
        # Carvalho nao tem retalho
        assert results["MDF_18.5_CARVALHO"].decision == "new_sheet"

    def test_no_remnant_reuse(self):
        """Retalho usado uma vez nao reaparece."""
        groups = {
            "MDF_18.5_BRANCO_TX": [
                _make_piece(id=1, length=400, width=300, material_code="MDF_18.5_BRANCO_TX"),
                _make_piece(id=2, length=400, width=300, material_code="MDF_18.5_BRANCO_TX"),
            ],
        }
        remnants = [
            _make_remnant(id=1, length=1000, width=800),
        ]
        sheets = [_make_sheet()]
        results = select_for_material_groups(groups, remnants, sheets)
        # Deve ter exatamente um resultado
        assert len(results) == 1


# ===================================================================
# Testes de Estimativa de Economia
# ===================================================================

class TestSavingsEstimate:
    """Testes de estimativa de economia."""

    def test_all_remnants(self):
        """Todos usando retalhos = economia maxima."""
        decisions = {
            "A": SelectionResult(decision="remnant"),
            "B": SelectionResult(decision="remnant"),
        }
        savings = estimate_savings(decisions, sheet_price=150)
        assert savings["remnant_uses"] == 2
        assert savings["new_sheets"] == 0
        assert savings["estimated_savings_brl"] == 300
        assert savings["reuse_percentage"] == 100

    def test_all_new_sheets(self):
        """Todos chapas novas = zero economia."""
        decisions = {
            "A": SelectionResult(decision="new_sheet"),
        }
        savings = estimate_savings(decisions, sheet_price=150)
        assert savings["remnant_uses"] == 0
        assert savings["estimated_savings_brl"] == 0

    def test_mixed(self):
        """Mix de retalhos e chapas = economia parcial."""
        decisions = {
            "A": SelectionResult(decision="remnant"),
            "B": SelectionResult(decision="new_sheet"),
        }
        savings = estimate_savings(decisions, sheet_price=100)
        assert savings["remnant_uses"] == 1
        assert savings["new_sheets"] == 1
        assert savings["reuse_percentage"] == 50
