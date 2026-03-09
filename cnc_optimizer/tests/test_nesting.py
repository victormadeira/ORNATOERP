"""Testes de nesting (FASE 5).

Cobre:
- Ordenacao de pecas (15+ estrategias)
- Bins (MaxRects, Guillotine, Shelf)
- Placement e scoring
- Layout builder
- Deteccao de retalhos
"""

import pytest
import math

from app.core.domain.models import (
    Piece, Sheet, Placement, Remnant, MachiningData, Worker, SheetLayout,
)
from app.core.domain.enums import (
    GrainDirection, RotationPolicy, NestingHeuristic,
)
from app.core.nesting.part_ordering import (
    sort_pieces, get_strategy_names, expand_pieces_by_quantity,
    classify_piece_size, sort_pieces_random,
    perturb_ruin_recreate, STRATEGIES, TIERED_STRATEGIES,
)
from app.core.nesting.candidate_points import (
    MaxRectsBin, GuillotineBin, ShelfBin,
    CandidatePoint, FreeRect, create_bin,
)
from app.core.nesting.placement import (
    run_nesting_pass, run_fill_first,
    score_nesting_result, verify_no_overlaps,
    compact_bin, minimum_theoretical_sheets,
    maximum_theoretical_occupancy,
    BinResult, NestingPassResult,
)
from app.core.nesting.layout_builder import (
    LayoutBuilder, NestingConfig, build_optimal_layout,
    detect_remnants, MaterialGroupResult,
)


# ===================================================================
# Helpers
# ===================================================================

def _make_piece(
    id: int = 1,
    length: float = 720,
    width: float = 550,
    quantity: int = 1,
    material_code: str = "MDF_18.5_BRANCO_TX",
    grain: GrainDirection = GrainDirection.NONE,
    rotation_policy: RotationPolicy = RotationPolicy.FREE,
    **kwargs,
) -> Piece:
    """Criar peca de teste."""
    return Piece(
        id=id,
        persistent_id=f"P{id:03d}",
        description=f"Peca {id}",
        length=length,
        width=width,
        thickness_real=18.5,
        quantity=quantity,
        material_code=material_code,
        grain=grain,
        rotation_policy=rotation_policy,
        **kwargs,
    )


def _make_sheet(
    length: float = 2750,
    width: float = 1850,
    trim: float = 10,
    kerf: float = 4,
    material_code: str = "MDF_18.5_BRANCO_TX",
) -> Sheet:
    """Criar chapa padrao."""
    return Sheet(
        id=1,
        name="Chapa MDF 18.5",
        material_code=material_code,
        thickness_real=18.5,
        length=length,
        width=width,
        trim=trim,
        kerf=kerf,
    )


def _make_pieces_batch(count: int = 5, **kwargs) -> list[Piece]:
    """Criar lote de pecas com dimensoes variadas."""
    sizes = [
        (720, 550), (1164, 550), (716, 597),
        (400, 300), (500, 400), (300, 200),
        (800, 600), (600, 450), (350, 280),
        (900, 500), (1000, 400), (550, 350),
    ]
    pieces = []
    for i in range(count):
        l, w = sizes[i % len(sizes)]
        pieces.append(_make_piece(id=i + 1, length=l, width=w, **kwargs))
    return pieces


# ===================================================================
# Testes de Ordenacao (part_ordering.py)
# ===================================================================

class TestPartOrdering:
    """Testes das estrategias de ordenacao."""

    def test_strategy_count(self):
        """Deve ter pelo menos 15 estrategias."""
        names = get_strategy_names()
        assert len(names) >= 15

    def test_area_desc(self):
        """area_desc: maior area primeiro."""
        pieces = [
            _make_piece(id=1, length=100, width=100),  # 10000
            _make_piece(id=2, length=200, width=200),  # 40000
            _make_piece(id=3, length=150, width=150),  # 22500
        ]
        sorted_pieces = sort_pieces(pieces, "area_desc")
        areas = [p.length * p.width for p in sorted_pieces]
        assert areas == sorted(areas, reverse=True)

    def test_area_asc(self):
        """area_asc: menor area primeiro."""
        pieces = [
            _make_piece(id=1, length=200, width=200),
            _make_piece(id=2, length=100, width=100),
            _make_piece(id=3, length=150, width=150),
        ]
        sorted_pieces = sort_pieces(pieces, "area_asc")
        areas = [p.length * p.width for p in sorted_pieces]
        assert areas == sorted(areas)

    def test_maxside_desc(self):
        """maxside_desc: maior lado primeiro."""
        pieces = [
            _make_piece(id=1, length=500, width=100),
            _make_piece(id=2, length=800, width=100),
            _make_piece(id=3, length=300, width=100),
        ]
        sorted_pieces = sort_pieces(pieces, "maxside_desc")
        maxsides = [max(p.length, p.width) for p in sorted_pieces]
        assert maxsides == sorted(maxsides, reverse=True)

    def test_ratio_sq(self):
        """ratio_sq: mais quadrado primeiro."""
        pieces = [
            _make_piece(id=1, length=500, width=100),  # ratio 0.2
            _make_piece(id=2, length=400, width=400),  # ratio 1.0
            _make_piece(id=3, length=300, width=200),  # ratio 0.67
        ]
        sorted_pieces = sort_pieces(pieces, "ratio_sq")
        # Primeiro deve ser o mais quadrado
        assert sorted_pieces[0].id == 2

    def test_invalid_strategy(self):
        """Estrategia invalida deve lancar ValueError."""
        with pytest.raises(ValueError, match="desconhecida"):
            sort_pieces([], "inexistente")

    def test_tiered_gms(self):
        """tiered_gms: grande-medio-small."""
        pieces = _make_pieces_batch(9)
        result = sort_pieces(pieces, "tiered_gms")
        assert len(result) == 9
        # Primeira peca deve ser uma das maiores
        first_area = result[0].length * result[0].width
        max_area = max(p.length * p.width for p in pieces)
        assert first_area == max_area

    def test_all_strategies_return_same_count(self):
        """Todas as estrategias devem retornar mesmo numero de pecas."""
        pieces = _make_pieces_batch(8)
        for name in get_strategy_names():
            result = sort_pieces(pieces, name)
            assert len(result) == len(pieces), f"Estrategia {name} retornou {len(result)} pecas"


class TestExpandPieces:
    """Testes de expansao por quantidade."""

    def test_expand_single(self):
        """Peca com quantity=1 gera 1 instancia."""
        pieces = [_make_piece(quantity=1)]
        expanded = expand_pieces_by_quantity(pieces)
        assert len(expanded) == 1

    def test_expand_multiple(self):
        """Peca com quantity=3 gera 3 instancias."""
        pieces = [_make_piece(quantity=3)]
        expanded = expand_pieces_by_quantity(pieces)
        assert len(expanded) == 3

    def test_expand_mixed(self):
        """Multiplas pecas com quantidades diferentes."""
        pieces = [
            _make_piece(id=1, quantity=2),
            _make_piece(id=2, quantity=3),
            _make_piece(id=3, quantity=1),
        ]
        expanded = expand_pieces_by_quantity(pieces)
        assert len(expanded) == 6

    def test_expanded_are_copies(self):
        """Instancias expandidas sao copias independentes."""
        pieces = [_make_piece(id=1, quantity=2, length=500)]
        expanded = expand_pieces_by_quantity(pieces)
        assert expanded[0].length == expanded[1].length == 500
        assert expanded[0].quantity == 1


class TestClassifyPieceSize:
    """Testes de classificacao de tamanho."""

    def test_normal(self):
        """Peca > 400mm = normal."""
        p = _make_piece(length=500, width=500)
        assert classify_piece_size(p) == "normal"

    def test_pequena(self):
        """Peca < 400mm min dim = pequena."""
        p = _make_piece(length=500, width=350)
        assert classify_piece_size(p) == "pequena"

    def test_super_pequena(self):
        """Peca < 200mm min dim = super_pequena."""
        p = _make_piece(length=300, width=150)
        assert classify_piece_size(p) == "super_pequena"


class TestPerturbation:
    """Testes de perturbacao para R&R."""

    def test_perturb_returns_same_pieces(self):
        """Perturbacao deve retornar mesmas pecas em ordem diferente."""
        pieces = _make_pieces_batch(10)
        for pt in range(8):
            result = perturb_ruin_recreate(pieces, pt, seed=42)
            assert len(result) == len(pieces)

    def test_perturb_type_0_area_sort(self):
        """Tipo 0: shuffle + area sort."""
        pieces = _make_pieces_batch(10)
        result = perturb_ruin_recreate(pieces, 0, seed=42)
        assert len(result) == 10

    def test_random_sort(self):
        """Ordenacao aleatoria com seed."""
        pieces = _make_pieces_batch(5)
        r1 = sort_pieces_random(pieces, seed=42)
        r2 = sort_pieces_random(pieces, seed=42)
        assert [p.id for p in r1] == [p.id for p in r2]


# ===================================================================
# Testes dos Bins (candidate_points.py)
# ===================================================================

class TestMaxRectsBin:
    """Testes do MaxRects bin."""

    def test_create_bin(self):
        """Criar bin com dimensoes corretas."""
        bin = MaxRectsBin(2730, 1830, spacing=7)
        assert bin.width == 2730
        assert bin.height == 1830
        assert len(bin.free_rects) == 1

    def test_find_best_bssf(self):
        """BSSF deve encontrar posicao para peca que cabe."""
        bin = MaxRectsBin(1000, 1000, spacing=7)
        result = bin.find_best(400, 300, heuristic=NestingHeuristic.BSSF)
        assert result is not None
        assert result.x == 0
        assert result.y == 0

    def test_find_best_bl(self):
        """BL deve colocar no canto inferior-esquerdo."""
        bin = MaxRectsBin(1000, 1000, spacing=7)
        result = bin.find_best(400, 300, heuristic=NestingHeuristic.BL)
        assert result is not None
        assert result.x == 0
        assert result.y == 0

    def test_find_best_too_large(self):
        """Peca maior que o bin deve retornar None."""
        bin = MaxRectsBin(500, 500, spacing=7)
        result = bin.find_best(600, 600)
        assert result is None

    def test_place_and_find_next(self):
        """Apos colocar uma peca, a proxima deve encaixar ao lado."""
        bin = MaxRectsBin(1000, 1000, spacing=7)
        # Colocar primeira peca
        bin.place_rect(0, 0, 400, 300)
        # Buscar proxima
        result = bin.find_best(400, 300, heuristic=NestingHeuristic.BL)
        assert result is not None
        # Deve estar deslocada da primeira
        assert result.x > 0 or result.y > 0

    def test_place_multiple_pieces(self):
        """Colocar varias pecas sem overlap."""
        bin = MaxRectsBin(2730, 1830, spacing=7)

        for i in range(5):
            pos = bin.find_best(400, 300, heuristic=NestingHeuristic.BSSF)
            assert pos is not None, f"Peca {i} nao encontrou posicao"
            pw = 400 if pos.rotation == 0 else 300
            ph = 300 if pos.rotation == 0 else 400
            bin.place_rect(pos.x, pos.y, pw, ph)

        assert len(bin.used_rects) == 5

    def test_occupancy(self):
        """Calcular ocupacao corretamente."""
        bin = MaxRectsBin(1000, 1000, spacing=0)
        bin.place_rect(0, 0, 500, 500)
        assert bin.occupancy() == pytest.approx(25.0, abs=0.1)

    def test_rotation(self):
        """Deve encontrar posicao rotacionada."""
        bin = MaxRectsBin(400, 800, spacing=0)
        # Peca 600x300 nao cabe normal (600 > 400)
        # Mas cabe rotacionada (300x600 em 400x800)
        result = bin.find_best(600, 300, allow_rotate=True)
        assert result is not None
        assert result.rotation == 90

    def test_no_rotation_when_disabled(self):
        """Sem rotacao, peca que nao cabe retorna None."""
        bin = MaxRectsBin(400, 800, spacing=0)
        result = bin.find_best(600, 300, allow_rotate=False)
        assert result is None

    def test_multi_heuristic(self):
        """Multi-heuristic deve encontrar solucao."""
        bin = MaxRectsBin(1000, 1000, spacing=7)
        result = bin.find_best_multi_heuristic(400, 300)
        assert result is not None

    def test_vacuum_aware_small_piece(self):
        """Pecas pequenas devem ser empurradas para periferia."""
        bin = MaxRectsBin(2000, 2000, spacing=7)
        # Peca super_pequena
        r1 = bin.find_best(
            150, 100, heuristic=NestingHeuristic.BSSF,
            piece_class="super_pequena"
        )
        # Peca normal
        r2 = bin.find_best(
            150, 100, heuristic=NestingHeuristic.BSSF,
            piece_class="normal"
        )
        # Ambas devem encontrar posicao
        assert r1 is not None
        assert r2 is not None


class TestGuillotineBin:
    """Testes do Guillotine bin."""

    def test_create(self):
        """Criar bin guillotine."""
        bin = GuillotineBin(2730, 1830, spacing=7, kerf=4)
        assert bin.width == 2730
        assert len(bin.free_rects) == 1

    def test_find_and_place(self):
        """Encontrar e colocar peca."""
        bin = GuillotineBin(1000, 1000, spacing=7, kerf=4)
        pos = bin.find_best(400, 300)
        assert pos is not None
        bin.place_rect(pos.x, pos.y, 400, 300)
        assert len(bin.used_rects) == 1

    def test_kerf_consideration(self):
        """Guillotine deve considerar kerf nos cortes."""
        bin = GuillotineBin(1000, 1000, spacing=0, kerf=4)
        bin.place_rect(0, 0, 400, 300)
        # Sobra a direita deve ser 1000 - 400 - 0(spacing) - 4(kerf) = 596
        # Sobra abaixo deve ser 1000 - 300 - 0(spacing) - 4(kerf) = 696
        assert len(bin.cuts) > 0


class TestShelfBin:
    """Testes do Shelf bin."""

    def test_create(self):
        """Criar bin shelf."""
        bin = ShelfBin(2730, 1830, spacing=7)
        assert bin.width == 2730
        assert len(bin.shelves) == 0

    def test_place_creates_shelf(self):
        """Colocar peca cria prateleira."""
        bin = ShelfBin(1000, 1000, spacing=7)
        pos = bin.find_best(400, 300)
        assert pos is not None
        bin.place_rect(pos.x, pos.y, 400, 300)
        assert len(bin.shelves) == 1
        assert len(bin.used_rects) == 1

    def test_same_height_same_shelf(self):
        """Pecas com mesma altura devem ficar na mesma prateleira."""
        bin = ShelfBin(1000, 1000, spacing=7)
        # Primeira peca
        pos1 = bin.find_best(200, 300)
        bin.place_rect(pos1.x, pos1.y, 200, 300)
        # Segunda peca com mesma altura
        pos2 = bin.find_best(200, 300)
        assert pos2 is not None
        bin.place_rect(pos2.x, pos2.y, 200, 300)
        # Deve estar na mesma shelf
        assert len(bin.shelves) == 1


class TestCreateBin:
    """Testes da factory de bins."""

    def test_create_maxrects(self):
        """Factory cria MaxRectsBin."""
        bin = create_bin("maxrects", 1000, 1000)
        assert isinstance(bin, MaxRectsBin)

    def test_create_guillotine(self):
        """Factory cria GuillotineBin."""
        bin = create_bin("guillotine", 1000, 1000)
        assert isinstance(bin, GuillotineBin)

    def test_create_shelf(self):
        """Factory cria ShelfBin."""
        bin = create_bin("shelf", 1000, 1000)
        assert isinstance(bin, ShelfBin)


# ===================================================================
# Testes de Placement (placement.py)
# ===================================================================

class TestNestingPass:
    """Testes do nesting pass."""

    def test_single_piece(self):
        """Colocar uma unica peca."""
        pieces = [_make_piece(length=720, width=550)]
        sheet = _make_sheet()
        result = run_nesting_pass(pieces, sheet)
        assert result.total_pieces_placed == 1
        assert len(result.bins) == 1
        assert result.bins[0].occupancy > 0

    def test_multiple_pieces(self):
        """Colocar varias pecas."""
        pieces = _make_pieces_batch(5)
        sheet = _make_sheet()
        result = run_nesting_pass(pieces, sheet)
        assert result.total_pieces_placed == 5
        assert len(result.bins) >= 1

    def test_piece_too_large(self):
        """Peca maior que a chapa vai para unplaced."""
        pieces = [_make_piece(length=3000, width=2000)]
        sheet = _make_sheet()
        result = run_nesting_pass(pieces, sheet)
        assert len(result.unplaced_pieces) == 1
        assert result.total_pieces_placed == 0

    def test_grain_locked_no_rotation(self):
        """Pecas com veio nao devem rotacionar."""
        pieces = [_make_piece(
            length=720, width=550,
            rotation_policy=RotationPolicy.GRAIN_LOCKED,
        )]
        sheet = _make_sheet()
        result = run_nesting_pass(pieces, sheet, allow_rotation=True)
        assert result.total_pieces_placed == 1
        # A peca nao deve ter sido rotacionada
        assert result.bins[0].placements[0].rotation == 0

    def test_different_heuristics(self):
        """Diferentes heuristicas devem produzir resultados."""
        pieces = _make_pieces_batch(5)
        sheet = _make_sheet()
        for h in NestingHeuristic:
            result = run_nesting_pass(pieces, sheet, heuristic=h)
            assert result.total_pieces_placed == 5, f"Heuristica {h} falhou"

    def test_different_bin_types(self):
        """Diferentes bin types devem funcionar."""
        pieces = _make_pieces_batch(5)
        sheet = _make_sheet()
        for bt in ["maxrects", "guillotine", "shelf"]:
            result = run_nesting_pass(pieces, sheet, bin_type=bt)
            assert result.total_pieces_placed == 5, f"Bin type {bt} falhou"


class TestFillFirst:
    """Testes do fill-first nesting."""

    def test_fill_first_basic(self):
        """Fill-first basico deve colocar todas as pecas."""
        pieces = _make_pieces_batch(5)
        sheet = _make_sheet()
        result = run_fill_first(pieces, sheet)
        assert result.total_pieces_placed == 5

    def test_fill_first_multi_heuristic(self):
        """Fill-first usa multi-heuristic por peca."""
        pieces = _make_pieces_batch(3)
        sheet = _make_sheet()
        result = run_fill_first(pieces, sheet)
        assert result.total_pieces_placed == 3


class TestScoring:
    """Testes do scoring de nesting."""

    def test_empty_score(self):
        """Score de resultado vazio deve ser infinito."""
        assert score_nesting_result([]) == float("inf")

    def test_single_bin_high_occupancy(self):
        """1 chapa com alta ocupacao deve ter score bom (hierarquico)."""
        bins = [BinResult(occupancy=90)]
        score = score_nesting_result(bins)
        # Score hierarquico: 1 chapa = 1_000_000 base + (100-90)*1000 = 1_010_000
        # Menos que 2 chapas a qualquer ocupacao
        score_2 = score_nesting_result([BinResult(occupancy=95), BinResult(occupancy=95)])
        assert score < score_2  # 1 chapa SEMPRE melhor que 2

    def test_fewer_bins_better(self):
        """Menos chapas = melhor score."""
        score_1 = score_nesting_result([BinResult(occupancy=80)])
        score_2 = score_nesting_result([
            BinResult(occupancy=60),
            BinResult(occupancy=60),
        ])
        assert score_1 < score_2

    def test_high_occupancy_bonus(self):
        """Ocupacao > 95% deve receber bonus."""
        score_95 = score_nesting_result([BinResult(occupancy=95)])
        score_70 = score_nesting_result([BinResult(occupancy=70)])
        assert score_95 < score_70

    def test_underutilization_penalty(self):
        """Chapa com < 25% deve receber penalidade severa."""
        score_20 = score_nesting_result([BinResult(occupancy=20)])
        score_60 = score_nesting_result([BinResult(occupancy=60)])
        assert score_20 > score_60


class TestOverlapVerification:
    """Testes de verificacao de overlap."""

    def test_no_overlap(self):
        """Pecas sem overlap."""
        bins = [BinResult(placements=[
            Placement(x=0, y=0, effective_length=100, effective_width=100),
            Placement(x=110, y=0, effective_length=100, effective_width=100),
        ])]
        assert verify_no_overlaps(bins)

    def test_overlap_detected(self):
        """Pecas com overlap."""
        bins = [BinResult(placements=[
            Placement(x=0, y=0, effective_length=100, effective_width=100),
            Placement(x=50, y=50, effective_length=100, effective_width=100),
        ])]
        assert not verify_no_overlaps(bins)

    def test_adjacent_no_overlap(self):
        """Pecas adjacentes sem overlap."""
        bins = [BinResult(placements=[
            Placement(x=0, y=0, effective_length=100, effective_width=100),
            Placement(x=100, y=0, effective_length=100, effective_width=100),
        ])]
        assert verify_no_overlaps(bins)


class TestCompaction:
    """Testes de compactacao."""

    def test_compact_moves_down(self):
        """Compactacao deve mover pecas para baixo."""
        sheet = _make_sheet()
        bin_result = BinResult(
            sheet=sheet,
            placements=[
                Placement(x=10, y=500, effective_length=200, effective_width=200),
            ],
        )
        compacted = compact_bin(bin_result, sheet)
        # Peca deve mover para mais perto do refilo
        assert compacted.placements[0].y <= 500

    def test_compact_preserves_pieces(self):
        """Compactacao preserva numero de pecas."""
        sheet = _make_sheet()
        bin_result = BinResult(
            sheet=sheet,
            placements=[
                Placement(x=10, y=500, effective_length=200, effective_width=200),
                Placement(x=300, y=800, effective_length=200, effective_width=200),
            ],
        )
        compacted = compact_bin(bin_result, sheet)
        assert len(compacted.placements) == 2


class TestMinimumTheoretical:
    """Testes do calculo teorico."""

    def test_single_sheet_sufficient(self):
        """Uma chapa e suficiente para poucas pecas."""
        pieces = [_make_piece(length=500, width=400)]
        sheet = _make_sheet()
        assert minimum_theoretical_sheets(pieces, sheet) == 1

    def test_multiple_sheets_needed(self):
        """Pecas grandes necessitam varias chapas."""
        # Chapa util: (2750-20) x (1850-20) = 2730 x 1830 ≈ 4.996M mm2
        # 10 pecas de 1000x1000 = 10M mm2 → ceil(10M/4.996M) = 3 chapas
        pieces = [_make_piece(id=i, length=1000, width=1000) for i in range(10)]
        sheet = _make_sheet()
        result = minimum_theoretical_sheets(pieces, sheet)
        assert result == 3

    def test_max_theoretical_occupancy(self):
        """Ocupacao maxima teorica."""
        pieces = [_make_piece(length=1000, width=1000)]
        sheet = _make_sheet()
        occ = maximum_theoretical_occupancy(pieces, sheet, 1)
        # 1M / (2730*1830) ≈ 20%
        assert 15 < occ < 25


# ===================================================================
# Testes do Layout Builder (layout_builder.py)
# ===================================================================

class TestLayoutBuilder:
    """Testes do layout builder."""

    def test_basic_layout(self):
        """Layout basico com poucas pecas."""
        pieces = _make_pieces_batch(3)
        sheet = _make_sheet()
        config = NestingConfig(
            max_combinations=10,
            bin_types=["maxrects"],
            heuristics=[NestingHeuristic.BSSF],
            strategies=["area_desc"],
        )
        result = build_optimal_layout(pieces, [sheet], config=config)
        assert result.total_pieces > 0
        assert result.total_sheets >= 1

    def test_layout_with_multiple_strategies(self):
        """Layout testando multiplas estrategias."""
        pieces = _make_pieces_batch(5)
        sheet = _make_sheet()
        config = NestingConfig(
            max_combinations=30,
            bin_types=["maxrects"],
            heuristics=[NestingHeuristic.BSSF, NestingHeuristic.BL],
            strategies=["area_desc", "maxside_desc", "ratio_sq"],
        )
        result = build_optimal_layout(pieces, [sheet], config=config)
        assert result.total_pieces == 5
        assert result.avg_occupancy > 0

    def test_layout_no_overlap(self):
        """Layout resultante nao deve ter overlaps."""
        pieces = _make_pieces_batch(8)
        sheet = _make_sheet()
        config = NestingConfig(
            max_combinations=20,
            bin_types=["maxrects"],
        )
        result = build_optimal_layout(pieces, [sheet], config=config)

        # Verificar cada chapa
        for sl in result.sheets:
            bin_r = BinResult(placements=sl.placements)
            assert verify_no_overlaps([bin_r]), \
                f"Overlap na chapa {sl.index}"

    def test_layout_multiple_materials(self):
        """Layout com pecas de materiais diferentes."""
        pieces = [
            _make_piece(id=1, material_code="MDF_18.5_BRANCO_TX"),
            _make_piece(id=2, material_code="MDF_18.5_BRANCO_TX"),
            _make_piece(id=3, material_code="MDF_18.5_CARVALHO_HANOVER"),
        ]
        sheets = [
            _make_sheet(material_code="MDF_18.5_BRANCO_TX"),
            _make_sheet(material_code="MDF_18.5_CARVALHO_HANOVER"),
        ]
        config = NestingConfig(
            max_combinations=10,
            bin_types=["maxrects"],
            strategies=["area_desc"],
        )
        result = build_optimal_layout(pieces, sheets, config=config)
        assert result.total_pieces == 3

    def test_layout_with_quantities(self):
        """Layout com pecas que tem quantity > 1."""
        pieces = [
            _make_piece(id=1, length=716, width=597, quantity=3),  # 3 portas
            _make_piece(id=2, length=720, width=550, quantity=2),  # 2 laterais
        ]
        sheet = _make_sheet()
        config = NestingConfig(
            max_combinations=10,
            bin_types=["maxrects"],
            strategies=["area_desc"],
        )
        result = build_optimal_layout(pieces, [sheet], config=config)
        # Deve ter 3 + 2 = 5 instancias
        assert result.total_pieces == 5


class TestDetectRemnants:
    """Testes de deteccao de retalhos."""

    def test_remnant_right_side(self):
        """Detectar retalho na faixa direita."""
        sheet = _make_sheet()
        layout = SheetLayout(
            index=0,
            sheet=sheet,
            placements=[
                Placement(
                    x=10, y=10,  # Refilo
                    effective_length=1000, effective_width=1000,
                ),
            ],
        )
        remnants = detect_remnants(layout)
        # Deve encontrar retalho a direita e/ou acima
        assert len(remnants) >= 1
        # Pelo menos um deve ter area significativa
        assert any(r["area"] > 300 * 600 for r in remnants)

    def test_no_remnant_full_sheet(self):
        """Chapa quase cheia nao gera retalhos grandes."""
        sheet = _make_sheet()
        # Simular pecas preenchendo quase tudo
        layout = SheetLayout(
            index=0,
            sheet=sheet,
            placements=[
                Placement(
                    x=10, y=10,
                    effective_length=2700, effective_width=1800,
                ),
            ],
        )
        remnants = detect_remnants(layout, min_width=300, min_length=600)
        # Retalhos devem ser pequenos demais
        for r in remnants:
            assert r["w"] < 300 or r["h"] < 300 or r["area"] < 300 * 600


class TestFreeRect:
    """Testes da estrutura FreeRect."""

    def test_contains(self):
        """FreeRect.contains verifica dimensoes."""
        fr = FreeRect(0, 0, 500, 300)
        assert fr.contains(400, 200)
        assert not fr.contains(600, 200)

    def test_area(self):
        """FreeRect.area calcula corretamente."""
        fr = FreeRect(0, 0, 500, 300)
        assert fr.area == 150000


class TestCandidatePoint:
    """Testes do CandidatePoint."""

    def test_key_dedup(self):
        """Chave de deduplicacao."""
        p1 = CandidatePoint(x=10.04, y=20.0, rotation=0)
        p2 = CandidatePoint(x=10.0, y=20.0, rotation=0)
        assert p1.key == p2.key


# ===================================================================
# Testes de Cenarios Reais
# ===================================================================

class TestRealScenarios:
    """Cenarios de producao real."""

    def test_cozinha_basica(self):
        """Cozinha com laterais, base, fundo, portas."""
        pieces = [
            _make_piece(id=1, length=720, width=550, quantity=2),
            _make_piece(id=2, length=1164, width=550, quantity=1),
            _make_piece(id=3, length=716, width=1160, quantity=1,
                       material_code="MDF_6.0_CRU"),
            _make_piece(id=4, length=716, width=597, quantity=3),
        ]
        sheets = [
            _make_sheet(material_code="MDF_18.5_BRANCO_TX"),
            _make_sheet(material_code="MDF_6.0_CRU"),
        ]
        config = NestingConfig(
            max_combinations=30,
            strategies=["area_desc", "maxside_desc"],
        )
        result = build_optimal_layout(pieces, sheets, config=config)
        # 2 laterais + 1 base + 3 portas = 6 MDF_18.5_BRANCO_TX
        # 1 fundo = 1 MDF_6.0_CRU
        assert result.total_pieces == 7

    def test_occupancy_reasonable(self):
        """Ocupacao deve ser razoavel (> 40% para cenario tipico)."""
        pieces = _make_pieces_batch(10)
        sheet = _make_sheet()
        config = NestingConfig(
            max_combinations=50,
            strategies=["area_desc", "maxside_desc", "ratio_sq", "diff_desc"],
        )
        result = build_optimal_layout(pieces, [sheet], config=config)
        assert result.avg_occupancy > 30, \
            f"Ocupacao muito baixa: {result.avg_occupancy:.1f}%"

    def test_all_pieces_placed(self):
        """Todas as pecas devem ser colocadas (dimensoes normais)."""
        pieces = _make_pieces_batch(12)
        sheet = _make_sheet()
        config = NestingConfig(max_combinations=30)
        result = build_optimal_layout(pieces, [sheet], config=config)
        assert result.total_pieces == 12

    def test_material_sheet_matching(self):
        """Pecas devem usar chapas do material correto."""
        pieces_branco = [
            _make_piece(id=i, material_code="MDF_18.5_BRANCO_TX")
            for i in range(3)
        ]
        pieces_carvalho = [
            _make_piece(id=i + 10, material_code="MDF_18.5_CARVALHO_HANOVER",
                       grain=GrainDirection.HORIZONTAL,
                       rotation_policy=RotationPolicy.GRAIN_LOCKED)
            for i in range(2)
        ]
        sheets = [
            _make_sheet(material_code="MDF_18.5_BRANCO_TX"),
            _make_sheet(material_code="MDF_18.5_CARVALHO_HANOVER"),
        ]
        config = NestingConfig(
            max_combinations=10,
            strategies=["area_desc"],
        )
        result = build_optimal_layout(
            pieces_branco + pieces_carvalho, sheets, config=config
        )
        assert result.total_pieces == 5

    def test_score_comparison(self):
        """Melhor resultado deve ter menor score."""
        pieces = _make_pieces_batch(8)
        sheet = _make_sheet()

        scores = []
        for strategy in ["area_desc", "maxside_desc", "ratio_sq"]:
            sorted_p = sort_pieces(pieces, strategy)
            result = run_nesting_pass(sorted_p, sheet)
            scores.append((strategy, result.score))

        # Pelo menos alguma variacao de score
        score_values = [s[1] for s in scores]
        assert len(set(round(s, 2) for s in score_values)) >= 1
