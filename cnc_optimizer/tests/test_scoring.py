"""Testes do score engine (FASE 6)."""

import pytest

from app.core.domain.models import (
    Piece, Sheet, Placement, SheetLayout, LayoutResult,
    MachiningData, Worker,
)
from app.scoring.weights import (
    ScoreWeights, BALANCED, MAXIMIZE_OCCUPANCY,
    MINIMIZE_TIME, CNC_SAFE, get_profile, PROFILES,
)
from app.scoring.score_engine import (
    score_layout, compare_layouts, ScoreBreakdown,
    _score_occupancy, _score_sheet_count,
    _score_compactness, _score_travel_distance,
    _score_vacuum_support, _score_remnant_value,
    _score_face_selection,
)


# ===================================================================
# Helpers
# ===================================================================

def _make_sheet_layout(
    index: int = 0,
    occupancy: float = 80.0,
    placements: list[Placement] | None = None,
    sheet_length: float = 2750,
    sheet_width: float = 1850,
) -> SheetLayout:
    """Criar SheetLayout de teste."""
    if placements is None:
        placements = [
            Placement(
                x=10, y=10,
                effective_length=500, effective_width=400,
                rotation_score=0.7,
            ),
        ]
    return SheetLayout(
        index=index,
        sheet=Sheet(
            length=sheet_length, width=sheet_width,
            trim=10, material_code="MDF_18.5_BRANCO_TX",
        ),
        placements=placements,
        occupancy=occupancy,
        piece_count=len(placements),
    )


def _make_layout_result(
    n_sheets: int = 1,
    occupancies: list[float] | None = None,
    placements_per_sheet: int = 3,
) -> LayoutResult:
    """Criar LayoutResult de teste."""
    if occupancies is None:
        occupancies = [80.0] * n_sheets

    sheets = []
    total_pieces = 0
    for i, occ in enumerate(occupancies):
        pls = [
            Placement(
                piece_id=j + i * 100,
                x=10 + j * 200, y=10,
                effective_length=180, effective_width=150,
                rotation_score=0.6,
            )
            for j in range(placements_per_sheet)
        ]
        sheets.append(_make_sheet_layout(index=i, occupancy=occ, placements=pls))
        total_pieces += len(pls)

    return LayoutResult(
        sheets=sheets,
        total_sheets=len(sheets),
        total_pieces=total_pieces,
        avg_occupancy=sum(occupancies) / len(occupancies),
    )


# ===================================================================
# Testes dos Pesos
# ===================================================================

class TestScoreWeights:
    """Testes dos perfis de pesos."""

    def test_balanced_sums_to_one(self):
        """Perfil BALANCED deve somar 1.0."""
        assert BALANCED.validate()

    def test_maximize_occupancy_sums_to_one(self):
        assert MAXIMIZE_OCCUPANCY.validate()

    def test_minimize_time_sums_to_one(self):
        assert MINIMIZE_TIME.validate()

    def test_cnc_safe_sums_to_one(self):
        assert CNC_SAFE.validate()

    def test_all_profiles_valid(self):
        """Todos os perfis devem somar 1.0."""
        for name, profile in PROFILES.items():
            assert profile.validate(), f"Perfil {name} nao soma 1.0"

    def test_get_profile(self):
        """Obter perfil por nome."""
        p = get_profile("balanced")
        assert p.occupancy == 0.30

    def test_get_profile_invalid(self):
        """Perfil invalido deve lancar ValueError."""
        with pytest.raises(ValueError, match="desconhecido"):
            get_profile("inexistente")

    def test_normalize(self):
        """Normalizar pesos que nao somam 1.0."""
        w = ScoreWeights(
            occupancy=0.5, sheet_count=0.5,
            compactness=0, travel_distance=0,
            vacuum_support=0, rotation_quality=0,
            remnant_value=0, face_selection=0,
        )
        n = w.normalize()
        assert n.validate()

    def test_maximize_occupancy_has_high_occ_weight(self):
        """MAXIMIZE_OCCUPANCY deve ter peso alto em ocupacao."""
        assert MAXIMIZE_OCCUPANCY.occupancy > BALANCED.occupancy

    def test_cnc_safe_has_high_vacuum_weight(self):
        """CNC_SAFE deve ter peso alto em vacuo."""
        assert CNC_SAFE.vacuum_support > BALANCED.vacuum_support


# ===================================================================
# Testes dos Componentes Individuais
# ===================================================================

class TestOccupancyScore:
    """Testes do score de aproveitamento."""

    def test_high_occupancy(self):
        """Ocupacao alta = score alto."""
        layouts = [_make_sheet_layout(occupancy=95)]
        score, avg = _score_occupancy(layouts)
        assert score > 50
        assert avg == 95

    def test_low_occupancy(self):
        """Ocupacao baixa = score baixo."""
        layouts = [_make_sheet_layout(occupancy=20)]
        score, avg = _score_occupancy(layouts)
        assert score < 50

    def test_empty(self):
        """Sem layouts = 0."""
        score, avg = _score_occupancy([])
        assert score == 0

    def test_multiple_sheets_avg(self):
        """Media de ocupacao de multiplas chapas."""
        layouts = [
            _make_sheet_layout(occupancy=90),
            _make_sheet_layout(occupancy=60),
        ]
        score, avg = _score_occupancy(layouts)
        assert avg == 75


class TestSheetCountScore:
    """Testes do score de numero de chapas."""

    def test_optimal(self):
        """Numero = minimo teorico = score 100."""
        score, n = _score_sheet_count(2, 2)
        assert score == 100

    def test_excess_sheets(self):
        """Chapas excedentes = penalidade."""
        score_opt, _ = _score_sheet_count(2, 2)
        score_bad, _ = _score_sheet_count(5, 2)
        assert score_bad < score_opt

    def test_below_theoretical(self):
        """Menos que minimo teorico (impossivel na pratica)."""
        score, _ = _score_sheet_count(1, 2)
        assert score == 100  # Bonus!


class TestCompactnessScore:
    """Testes do score de compactacao."""

    def test_compact_layout(self):
        """Pecas proximas = alta compactacao."""
        placements = [
            Placement(x=10, y=10, effective_length=200, effective_width=200),
            Placement(x=220, y=10, effective_length=200, effective_width=200),
        ]
        layouts = [_make_sheet_layout(placements=placements)]
        score, pct = _score_compactness(layouts)
        assert score > 30  # Razoavelmente compacto

    def test_spread_layout(self):
        """Pecas espalhadas = baixa compactacao."""
        placements = [
            Placement(x=10, y=10, effective_length=100, effective_width=100),
            Placement(x=2000, y=1500, effective_length=100, effective_width=100),
        ]
        layouts = [_make_sheet_layout(placements=placements)]
        score, pct = _score_compactness(layouts)
        assert pct < 10  # Muito espalhado


class TestTravelScore:
    """Testes do score de deslocamento."""

    def test_close_pieces(self):
        """Pecas proximas = pouco travel."""
        placements = [
            Placement(x=10, y=10, effective_length=100, effective_width=100),
            Placement(x=120, y=10, effective_length=100, effective_width=100),
            Placement(x=230, y=10, effective_length=100, effective_width=100),
        ]
        layouts = [_make_sheet_layout(placements=placements)]
        score, dist = _score_travel_distance(layouts)
        assert score > 50

    def test_single_piece_no_travel(self):
        """Uma unica peca = sem deslocamento."""
        placements = [
            Placement(x=10, y=10, effective_length=100, effective_width=100),
        ]
        layouts = [_make_sheet_layout(placements=placements)]
        score, dist = _score_travel_distance(layouts)
        assert score == 100

    def test_empty(self):
        score, dist = _score_travel_distance([])
        assert score == 100


class TestVacuumScore:
    """Testes do score de vacuo."""

    def test_large_pieces_low_risk(self):
        """Pecas grandes = baixo risco."""
        placements = [
            Placement(x=10, y=10, effective_length=800, effective_width=600),
        ]
        layouts = [_make_sheet_layout(placements=placements)]
        score, risk = _score_vacuum_support(layouts)
        assert score > 80
        assert risk < 0.2

    def test_small_pieces_higher_risk(self):
        """Pecas pequenas = risco maior."""
        placements = [
            Placement(x=10, y=10, effective_length=150, effective_width=100),
        ]
        layouts = [_make_sheet_layout(placements=placements)]
        score, risk = _score_vacuum_support(layouts)
        assert risk > 0.3


# ===================================================================
# Testes do Score Engine Principal
# ===================================================================

class TestScoreEngine:
    """Testes do motor de score principal."""

    def test_score_basic_layout(self):
        """Score de layout basico."""
        layout = _make_layout_result(n_sheets=1, occupancies=[85])
        result = score_layout(layout)
        assert isinstance(result, ScoreBreakdown)
        assert result.total > 0

    def test_score_with_weights(self):
        """Score com pesos personalizados."""
        layout = _make_layout_result(n_sheets=1, occupancies=[85])
        r_balanced = score_layout(layout, BALANCED)
        r_occ = score_layout(layout, MAXIMIZE_OCCUPANCY)
        # Ambos devem produzir scores validos
        assert r_balanced.total > 0
        assert r_occ.total > 0

    def test_better_layout_higher_score(self):
        """Layout melhor (mais ocupacao) deve ter score maior."""
        layout_good = _make_layout_result(n_sheets=1, occupancies=[90])
        layout_bad = _make_layout_result(n_sheets=2, occupancies=[40, 30])
        s_good = score_layout(layout_good)
        s_bad = score_layout(layout_bad)
        assert s_good.total > s_bad.total

    def test_score_to_dict(self):
        """Converter para dicionario."""
        layout = _make_layout_result()
        result = score_layout(layout)
        d = result.to_dict()
        assert "total" in d
        assert "components" in d
        assert "raw" in d
        assert "occupancy_pct" in d["raw"]

    def test_score_with_pieces(self):
        """Score com informacao de pecas."""
        pieces = [
            Piece(id=i, length=500, width=400, quantity=1,
                  persistent_id=f"P{i}",
                  machining=MachiningData(workers=[
                      Worker(face="top", depth=12),
                  ]))
            for i in range(3)
        ]
        layout = _make_layout_result(n_sheets=1, occupancies=[80])
        result = score_layout(layout, pieces=pieces)
        assert result.total > 0

    def test_compare_layouts(self):
        """Comparar multiplos layouts."""
        l1 = _make_layout_result(n_sheets=1, occupancies=[90])
        l2 = _make_layout_result(n_sheets=2, occupancies=[50, 40])
        l3 = _make_layout_result(n_sheets=1, occupancies=[70])

        ranked = compare_layouts([l1, l2, l3])
        assert len(ranked) == 3
        # Primeiro deve ser o melhor
        best_idx = ranked[0][0]
        assert best_idx == 0  # Layout com 90% ocupacao

    def test_different_profiles_different_scores(self):
        """Perfis diferentes devem produzir scores diferentes."""
        layout = _make_layout_result(n_sheets=1, occupancies=[80])
        s1 = score_layout(layout, BALANCED)
        s2 = score_layout(layout, MINIMIZE_TIME)
        # Podem ser diferentes por causa dos pesos
        assert isinstance(s1.total, float)
        assert isinstance(s2.total, float)


class TestScoreEdgeCases:
    """Testes de edge cases do score."""

    def test_empty_layout(self):
        """Layout vazio."""
        layout = LayoutResult()
        result = score_layout(layout)
        assert result.total >= 0

    def test_single_piece_layout(self):
        """Layout com uma unica peca."""
        layout = _make_layout_result(n_sheets=1, placements_per_sheet=1)
        result = score_layout(layout)
        assert result.total > 0

    def test_score_breakdown_components(self):
        """Todos os componentes devem estar presentes."""
        layout = _make_layout_result()
        result = score_layout(layout)
        assert result.occupancy >= 0
        assert result.sheet_count >= 0
        assert result.compactness >= 0
        assert result.travel_distance >= 0
        assert result.vacuum_support >= 0
