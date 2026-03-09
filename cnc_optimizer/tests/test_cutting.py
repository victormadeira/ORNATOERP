"""Testes do plano de corte (FASE 7)."""

import pytest
import math

from app.core.domain.models import (
    Piece, Placement, Worker, MachiningData, MachineTool,
)
from app.core.cutting.op_builder import (
    build_operations, CuttingOperation,
    group_operations_by_tool,
    _classify_worker, _assign_priority,
)
from app.core.cutting.precedence import (
    order_by_precedence, PrecedenceResult,
    _nearest_neighbor_order, _count_tool_changes,
    _calculate_travel,
)
from app.core.cutting.tabs import (
    Tab, TabConfig, place_tabs_rectangular,
    get_tab_params, needs_tabs,
)
from app.core.cutting.onion_skin import (
    OnionSkinConfig, OnionSkinResult,
    should_use_onion_skin, calculate_breakthrough_feed,
    select_retention_strategy, RetentionStrategy,
)


# ===================================================================
# Helpers
# ===================================================================

def _make_piece_with_workers(workers_data: list[dict]) -> Piece:
    """Criar peca com workers."""
    workers = [Worker(**w) for w in workers_data]
    return Piece(
        id=1,
        persistent_id="P001",
        description="Teste",
        length=720,
        width=550,
        thickness_real=18.5,
        machining=MachiningData(workers=workers),
    )


def _make_placement(x: float = 10, y: float = 10, rotation: float = 0) -> Placement:
    """Criar placement."""
    if rotation == 90:
        eff_l, eff_w = 550, 720
    else:
        eff_l, eff_w = 720, 550
    return Placement(
        piece_id=1,
        piece_persistent_id="P001",
        x=x, y=y,
        rotation=rotation,
        effective_length=eff_l,
        effective_width=eff_w,
    )


def _make_tool_map() -> dict[str, MachineTool]:
    """Criar mapa de ferramentas."""
    return {
        "f_5mm_twister243": MachineTool(
            code="T02", name="Broca 5mm", type="broca",
            diameter=5, rpm=12000, cut_speed=3000,
            tool_code="f_5mm_twister243", tool_number=2,
        ),
        "f_15mm_tambor_min": MachineTool(
            code="T04", name="Forstner 15mm", type="forstner",
            diameter=15, rpm=8000, cut_speed=2000,
            tool_code="f_15mm_tambor_min", tool_number=4,
        ),
        "r_f": MachineTool(
            code="T08", name="Fresa rasgo", type="fresa_reta",
            diameter=6, doc=3, rpm=18000, cut_speed=4000,
            tool_code="r_f", tool_number=8,
        ),
        "contour": MachineTool(
            code="T01", name="Fresa contorno", type="fresa_compressao",
            diameter=6, doc=5, rpm=18000, cut_speed=5000,
            tool_code="contour", tool_number=1,
        ),
    }


# ===================================================================
# Testes do Op Builder
# ===================================================================

class TestOpBuilder:
    """Testes do construtor de operacoes."""

    def test_build_no_workers(self):
        """Peca sem workers gera so contorno externo."""
        piece = Piece(
            id=1, persistent_id="P001",
            length=720, width=550, thickness_real=18.5,
        )
        placement = _make_placement()
        ops = build_operations(piece, placement)
        assert len(ops) == 1
        assert ops[0].type == "external_contour"

    def test_build_with_holes(self):
        """Peca com furos gera operacoes de furo + contorno."""
        piece = _make_piece_with_workers([
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 37, "depth": 12},
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 69, "depth": 12},
        ])
        placement = _make_placement()
        tool_map = _make_tool_map()
        ops = build_operations(piece, placement, tool_map)

        # 2 furos + 1 contorno externo
        assert len(ops) == 3
        holes = [op for op in ops if op.type == "hole"]
        contours = [op for op in ops if op.type == "external_contour"]
        assert len(holes) == 2
        assert len(contours) == 1

    def test_hole_positions_absolute(self):
        """Posicoes dos furos devem ser absolutas (offset do placement)."""
        piece = _make_piece_with_workers([
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 37, "depth": 12},
        ])
        placement = _make_placement(x=100, y=200)
        ops = build_operations(piece, placement)

        hole = [op for op in ops if op.type == "hole"][0]
        assert hole.x == 100 + 37  # x_placement + x_worker
        assert hole.y == 200 + 37

    def test_rotated_placement_positions(self):
        """Posicoes devem ser ajustadas para rotacao 90."""
        piece = _make_piece_with_workers([
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 37, "depth": 12},
        ])
        placement = _make_placement(x=100, y=200, rotation=90)
        ops = build_operations(piece, placement)

        hole = [op for op in ops if op.type == "hole"][0]
        # Com rotacao 90: abs_x = x + worker.y, abs_y = y + (eff_w - worker.x)
        assert hole.x == pytest.approx(100 + 37, abs=1)

    def test_tool_info_populated(self):
        """Informacoes da ferramenta devem ser preenchidas."""
        piece = _make_piece_with_workers([
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 37, "depth": 12},
        ])
        placement = _make_placement()
        tool_map = _make_tool_map()
        ops = build_operations(piece, placement, tool_map)

        hole = [op for op in ops if op.type == "hole"][0]
        assert hole.tool_number == 2
        assert hole.tool_diameter == 5
        assert hole.rpm == 12000

    def test_contour_multi_pass(self):
        """Contorno deve ter multi-pass baseado em DOC."""
        piece = Piece(
            id=1, persistent_id="P001",
            length=720, width=550, thickness_real=18.5,
        )
        placement = _make_placement()
        tool_map = _make_tool_map()
        ops = build_operations(piece, placement, tool_map, thickness=18.5)

        contour = [op for op in ops if op.type == "external_contour"][0]
        # DOC=5, thickness=18.5 → ceil(18.5/5) = 4 passes
        assert contour.passes == 4

    def test_classify_worker_types(self):
        """Classificar tipos de worker corretamente."""
        assert _classify_worker(Worker(category="transfer_hole")) == "hole"
        assert _classify_worker(Worker(category="pocket")) == "pocket"
        assert _classify_worker(Worker(category="Transfer_vertical_saw_cut")) == "slot"

    def test_priority_order(self):
        """Furos antes de rasgos antes de contornos."""
        p_hole = _assign_priority("hole", Worker())
        p_slot = _assign_priority("slot", Worker())
        p_contour = _assign_priority("external_contour", Worker())
        assert p_hole < p_slot < p_contour


class TestGroupByTool:
    """Testes de agrupamento por ferramenta."""

    def test_group_single_tool(self):
        """Todas operacoes com mesma ferramenta."""
        ops = [
            CuttingOperation(tool_code="f_5mm_twister243"),
            CuttingOperation(tool_code="f_5mm_twister243"),
        ]
        groups = group_operations_by_tool(ops)
        assert len(groups) == 1
        assert len(groups["f_5mm_twister243"]) == 2

    def test_group_multiple_tools(self):
        """Operacoes com ferramentas diferentes."""
        ops = [
            CuttingOperation(tool_code="f_5mm_twister243"),
            CuttingOperation(tool_code="f_15mm_tambor_min"),
            CuttingOperation(tool_code="f_5mm_twister243"),
        ]
        groups = group_operations_by_tool(ops)
        assert len(groups) == 2


# ===================================================================
# Testes de Precedencia
# ===================================================================

class TestPrecedence:
    """Testes de ordenacao por precedencia."""

    def test_basic_order(self):
        """Furos antes de contornos."""
        ops = [
            CuttingOperation(type="external_contour", x=100, y=100, tool_code="contour"),
            CuttingOperation(type="hole", x=50, y=50, tool_code="f_5mm"),
            CuttingOperation(type="hole", x=60, y=60, tool_code="f_5mm"),
        ]
        result = order_by_precedence(ops)
        assert result.ordered_ops[0].type == "hole"
        assert result.ordered_ops[1].type == "hole"
        assert result.ordered_ops[2].type == "external_contour"

    def test_phase_separation(self):
        """Operacoes separadas por fase."""
        ops = [
            CuttingOperation(type="hole", tool_code="f_5mm"),
            CuttingOperation(type="pocket", tool_code="p_8mm"),
            CuttingOperation(type="slot", tool_code="r_f"),
            CuttingOperation(type="external_contour", tool_code="contour"),
        ]
        result = order_by_precedence(ops)
        types = [op.type for op in result.ordered_ops]
        assert types.index("hole") < types.index("pocket")
        assert types.index("pocket") < types.index("slot")
        assert types.index("slot") < types.index("external_contour")

    def test_tool_grouping(self):
        """Operacoes da mesma ferramenta agrupadas."""
        ops = [
            CuttingOperation(type="hole", tool_code="f_5mm", x=10, y=10),
            CuttingOperation(type="hole", tool_code="f_8mm", x=50, y=50),
            CuttingOperation(type="hole", tool_code="f_5mm", x=20, y=20),
        ]
        result = order_by_precedence(ops, minimize_tool_changes=True)
        # Furos f_5mm devem estar juntos
        tool_seq = [op.tool_code for op in result.ordered_ops]
        # f_5mm aparece em indices consecutivos
        idx_5mm = [i for i, t in enumerate(tool_seq) if t == "f_5mm"]
        assert max(idx_5mm) - min(idx_5mm) == 1

    def test_nearest_neighbor(self):
        """Nearest-neighbor minimiza deslocamento."""
        ops = [
            CuttingOperation(type="hole", x=100, y=100),
            CuttingOperation(type="hole", x=10, y=10),
            CuttingOperation(type="hole", x=20, y=20),
        ]
        ordered = _nearest_neighbor_order(ops)
        # Deve comecar pelo mais proximo de (0,0) = (10,10)
        assert ordered[0].x == 10

    def test_tool_changes_count(self):
        """Contar trocas de ferramenta."""
        ops = [
            CuttingOperation(tool_code="A"),
            CuttingOperation(tool_code="A"),
            CuttingOperation(tool_code="B"),
            CuttingOperation(tool_code="A"),
        ]
        assert _count_tool_changes(ops) == 2

    def test_travel_calculation(self):
        """Calcular deslocamento vazio."""
        ops = [
            CuttingOperation(x=0, y=0),
            CuttingOperation(x=100, y=0),
            CuttingOperation(x=100, y=100),
        ]
        travel = _calculate_travel(ops)
        assert travel == pytest.approx(200, abs=0.1)

    def test_empty_operations(self):
        """Lista vazia."""
        result = order_by_precedence([])
        assert len(result.ordered_ops) == 0

    def test_remnant_contour_last(self):
        """Contorno de retalho deve ser o ultimo."""
        ops = [
            CuttingOperation(type="remnant_contour", tool_code="contour", x=0, y=0),
            CuttingOperation(type="external_contour", tool_code="contour", x=50, y=50),
            CuttingOperation(type="hole", tool_code="f_5mm", x=25, y=25),
        ]
        result = order_by_precedence(ops)
        assert result.ordered_ops[-1].type == "remnant_contour"


# ===================================================================
# Testes de Tabs
# ===================================================================

class TestTabs:
    """Testes de posicionamento de tabs."""

    def test_place_4_tabs(self):
        """Posicionar 4 tabs no retangulo."""
        tabs = place_tabs_rectangular(
            x=10, y=10, length=720, width=550,
            count=4, tab_width=4.0, tab_height=2.0,
        )
        assert len(tabs) == 4

    def test_tabs_on_perimeter(self):
        """Tabs devem estar no perimetro da peca."""
        tabs = place_tabs_rectangular(
            x=0, y=0, length=500, width=300,
            count=4,
        )
        for tab in tabs:
            # Cada tab deve estar em um dos 4 lados
            on_bottom = abs(tab.y - 0) < 1
            on_top = abs(tab.y - 300) < 1
            on_left = abs(tab.x - 0) < 1
            on_right = abs(tab.x - 500) < 1
            assert on_bottom or on_top or on_left or on_right

    def test_tabs_avoid_corners(self):
        """Tabs devem evitar cantos."""
        tabs = place_tabs_rectangular(
            x=0, y=0, length=500, width=300,
            count=4, corner_margin=30,
        )
        for tab in tabs:
            # Distancia de cada canto
            corners = [(0, 0), (500, 0), (500, 300), (0, 300)]
            for cx, cy in corners:
                dist = math.sqrt((tab.x - cx) ** 2 + (tab.y - cy) ** 2)
                # Deve estar a pelo menos corner_margin dos cantos
                # (com alguma tolerancia pela correcao)
                assert dist >= 25, f"Tab ({tab.x}, {tab.y}) muito perto do canto ({cx}, {cy})"

    def test_tab_params_super_pequena(self):
        """Super pequena: mais tabs, menores."""
        count, width, height = get_tab_params("super_pequena", perimeter=800)
        assert count >= 4
        assert width == 3.0
        assert height == 3.0

    def test_tab_params_normal(self):
        """Normal: poucos tabs, tamanho padrao."""
        count, width, height = get_tab_params("normal", perimeter=2000)
        assert count >= 2

    def test_needs_tabs_super_pequena(self):
        """Super pequena sempre precisa de tabs."""
        assert needs_tabs("super_pequena")

    def test_needs_tabs_normal(self):
        """Normal nao precisa de tabs por padrao."""
        assert not needs_tabs("normal")

    def test_no_tabs_with_onion_skin(self):
        """Com onion skin, nao precisa de tabs."""
        assert not needs_tabs("pequena", has_onion_skin=True)

    def test_force_tabs(self):
        """Forcar tabs mesmo em peca normal."""
        assert needs_tabs("normal", force_tabs=True)


# ===================================================================
# Testes de Onion Skin
# ===================================================================

class TestOnionSkin:
    """Testes da estrategia onion skin."""

    def test_small_piece_uses_onion(self):
        """Peca pequena deve usar onion skin."""
        result = should_use_onion_skin(
            length=180, width=150, thickness=18.5,
            piece_class="pequena",
        )
        assert result.use_onion_skin

    def test_large_piece_no_onion(self):
        """Peca grande nao usa onion skin."""
        result = should_use_onion_skin(
            length=800, width=600, thickness=18.5,
            piece_class="normal",
        )
        assert not result.use_onion_skin

    def test_partial_depth(self):
        """Profundidade parcial = thickness - skin_depth."""
        config = OnionSkinConfig(skin_depth=0.5)
        result = should_use_onion_skin(
            length=150, width=100, thickness=18.5,
            piece_class="super_pequena",
            config=config,
        )
        assert result.partial_depth == pytest.approx(18.0, abs=0.1)

    def test_breakthrough_feed(self):
        """Feed do breakthrough = 60% do normal."""
        feed = calculate_breakthrough_feed(5000)
        assert feed == 3000

    def test_disabled(self):
        """Onion skin desativado."""
        config = OnionSkinConfig(enabled=False)
        result = should_use_onion_skin(
            length=100, width=100, thickness=18.5,
            config=config,
        )
        assert not result.use_onion_skin

    def test_area_threshold(self):
        """Acima do limite de area, nao usa."""
        config = OnionSkinConfig(max_area_mm2=10000)
        result = should_use_onion_skin(
            length=200, width=200, thickness=18.5,
            piece_class="pequena",
            config=config,
        )
        # 200*200 = 40000 > 10000
        assert not result.use_onion_skin


class TestRetentionStrategy:
    """Testes da selecao de estrategia de retencao."""

    def test_normal_no_retention(self):
        """Peca normal: sem retencao."""
        strategy = select_retention_strategy(
            length=800, width=600, thickness=18.5,
            piece_class="normal",
        )
        assert strategy.method == "none"

    def test_pequena_onion_skin(self):
        """Peca pequena: onion skin."""
        strategy = select_retention_strategy(
            length=180, width=150, thickness=18.5,
            piece_class="pequena",
        )
        assert strategy.method == "onion_skin"

    def test_super_pequena_combined(self):
        """Super pequena: tabs + onion skin."""
        strategy = select_retention_strategy(
            length=100, width=80, thickness=18.5,
            piece_class="super_pequena",
        )
        assert strategy.method == "combined"
        assert strategy.tabs_count > 0
        assert strategy.onion_partial_depth > 0

    def test_pequena_tabs_when_onion_disabled(self):
        """Peca pequena sem onion skin: usa tabs."""
        config = OnionSkinConfig(enabled=False)
        strategy = select_retention_strategy(
            length=180, width=150, thickness=18.5,
            piece_class="pequena",
            onion_config=config,
        )
        assert strategy.method == "tabs"


# ===================================================================
# Cenarios Reais
# ===================================================================

class TestRealCuttingScenarios:
    """Cenarios reais de plano de corte."""

    def test_lateral_com_system32_e_rasgo(self):
        """Lateral com furos System 32 + rasgo fundo."""
        piece = _make_piece_with_workers([
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 37, "depth": 12},
            {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
             "face": "top", "x": 37, "y": 69, "depth": 12},
            {"category": "transfer_hole", "tool_code": "f_15mm_tambor_min",
             "face": "top", "x": 37, "y": 274, "depth": 14},
            {"category": "Transfer_vertical_saw_cut", "tool_code": "r_f",
             "face": "left", "x": 0, "y": 17, "depth": 10.5},
        ])
        placement = _make_placement()
        tool_map = _make_tool_map()

        ops = build_operations(piece, placement, tool_map)
        result = order_by_precedence(ops)

        # Verificar ordem: furos primeiro, depois rasgo, depois contorno
        types = [op.type for op in result.ordered_ops]
        hole_idx = [i for i, t in enumerate(types) if t == "hole"]
        slot_idx = [i for i, t in enumerate(types) if t == "slot"]
        contour_idx = [i for i, t in enumerate(types) if t == "external_contour"]

        assert all(h < s for h in hole_idx for s in slot_idx), \
            "Furos devem vir antes de rasgos"
        assert all(s < c for s in slot_idx for c in contour_idx), \
            "Rasgos devem vir antes de contornos"

    def test_full_pipeline_3_pieces(self):
        """Pipeline completo com 3 pecas."""
        pieces_data = [
            # Lateral com furos
            _make_piece_with_workers([
                {"category": "transfer_hole", "tool_code": "f_5mm_twister243",
                 "face": "top", "x": 37, "y": 37, "depth": 12},
            ]),
            # Porta com dobradicas
            _make_piece_with_workers([
                {"category": "transfer_hole", "tool_code": "f_35mm_dob",
                 "face": "back", "x": 100, "y": 22, "depth": 14},
            ]),
            # Base sem usinagem
            Piece(id=3, persistent_id="P003", length=1164, width=550,
                  thickness_real=18.5),
        ]

        tool_map = _make_tool_map()
        tool_map["f_35mm_dob"] = MachineTool(
            code="T05", name="Forstner 35mm", type="forstner",
            diameter=35, rpm=4000, cut_speed=1500,
            tool_code="f_35mm_dob", tool_number=5,
        )

        all_ops = []
        for i, piece in enumerate(pieces_data):
            placement = _make_placement(x=10 + i * 200, y=10)
            ops = build_operations(piece, placement, tool_map)
            all_ops.extend(ops)

        result = order_by_precedence(all_ops)

        # Deve ter: 2 furos + 3 contornos = 5 operacoes
        assert len(result.ordered_ops) == 5
        assert result.tool_changes >= 1  # Pelo menos 1 troca (furos → contornos)
