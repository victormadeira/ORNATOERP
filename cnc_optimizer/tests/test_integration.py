"""Testes de integracao end-to-end (FASE 12).

Testa o pipeline completo:
Import → Nesting → Score → Vacuum → GA → Export (G-code, SVG, JSON)
"""

import pytest
import time

from app.core.domain.models import (
    Piece, Sheet, Placement, SheetLayout, LayoutResult,
    Remnant, MachiningData, Worker,
)
from app.core.domain.enums import (
    RotationPolicy, NestingHeuristic,
)
from app.core.nesting.part_ordering import (
    expand_pieces_by_quantity, sort_pieces, classify_piece_size,
)
from app.core.nesting.placement import (
    run_nesting_pass, run_fill_first, verify_no_overlaps,
    NestingPassResult,
)
from app.core.nesting.layout_builder import (
    build_optimal_layout, NestingConfig, detect_remnants,
)
from app.core.nesting.ga_optimizer import (
    GAConfig, run_brkga, optimize_with_ga,
)
from app.scoring.score_engine import score_layout, compare_layouts
from app.scoring.weights import BALANCED, MAXIMIZE_OCCUPANCY, CNC_SAFE
from app.core.vacuum.vacuum_model import (
    simulate_vacuum_progressive, optimize_cut_order_for_vacuum,
    VacuumConfig,
)
from app.core.cutting.precedence import order_by_precedence
from app.core.cutting.tabs import place_tabs_rectangular, needs_tabs
from app.core.cutting.onion_skin import select_retention_strategy
from app.core.remnants.remnant_value import evaluate_remnants
from app.core.remnants.remnant_selector import select_remnant_or_sheet
from app.core.export.gcode_generator import (
    generate_gcode, GcodeOp, MachineConfig, GcodeTool,
)
from app.core.export.json_exporter import export_layout_json
from app.core.export.svg_exporter import export_sheet_svg


# ===================================================================
# Fixtures
# ===================================================================

def _standard_sheet(material: str = "MDF_18.5_BRANCO_TX") -> Sheet:
    return Sheet(
        id=1, length=2750, width=1850,
        trim=10, kerf=4,
        material_code=material,
    )


def _cozinha_pieces() -> list[Piece]:
    """20 pecas de cozinha (cenario real)."""
    specs = [
        # Laterais (2x)
        ("CM_LAT_DIR", 720, 550, 2, "MDF_18.5_BRANCO_TX"),
        ("CM_LAT_ESQ", 720, 550, 2, "MDF_18.5_BRANCO_TX"),
        # Bases (3x)
        ("CM_BAS", 1164, 550, 3, "MDF_18.5_BRANCO_TX"),
        # Prateleiras (4x)
        ("CM_PRA", 1160, 350, 4, "MDF_18.5_BRANCO_TX"),
        # Costas (2x)
        ("CM_COS", 1164, 716, 2, "MDF_18.5_BRANCO_TX"),
        # Divisorias (3x)
        ("CM_DIV", 716, 350, 3, "MDF_18.5_BRANCO_TX"),
        # Tampos (2x)
        ("CM_TAM", 1200, 600, 2, "MDF_18.5_BRANCO_TX"),
        # Portas pequenas (2x)
        ("CM_POR", 716, 397, 2, "MDF_18.5_BRANCO_TX"),
    ]

    pieces = []
    pid = 1
    for desc, l, w, qty, mat in specs:
        pieces.append(Piece(
            id=pid, persistent_id=f"P{pid:03d}",
            description=desc,
            length=l, width=w,
            thickness_real=18.5,
            quantity=qty,
            material_code=mat,
        ))
        pid += 1

    return pieces


def _mixed_material_pieces() -> tuple[list[Piece], list[Sheet]]:
    """Pecas em 3 materiais diferentes + chapas correspondentes."""
    pieces = [
        Piece(id=1, persistent_id="P001", description="Lat Branco",
              length=720, width=550, quantity=2,
              material_code="MDF_18.5_BRANCO_TX"),
        Piece(id=2, persistent_id="P002", description="Base Branco",
              length=1164, width=550, quantity=1,
              material_code="MDF_18.5_BRANCO_TX"),
        Piece(id=3, persistent_id="P003", description="Lat Carvalho",
              length=720, width=550, quantity=2,
              material_code="MDF_18.5_CARVALHO_HANOVER"),
        Piece(id=4, persistent_id="P004", description="Porta Preta",
              length=716, width=397, quantity=2,
              material_code="MDF_18.5_PRETO_TX"),
    ]

    sheets = [
        Sheet(id=1, length=2750, width=1850, trim=10,
              material_code="MDF_18.5_BRANCO_TX"),
        Sheet(id=2, length=2750, width=1850, trim=10,
              material_code="MDF_18.5_CARVALHO_HANOVER"),
        Sheet(id=3, length=2750, width=1850, trim=10,
              material_code="MDF_18.5_PRETO_TX"),
    ]

    return pieces, sheets


# ===================================================================
# Testes de Pipeline Completo
# ===================================================================

class TestFullPipeline:
    """Testes do pipeline completo."""

    def test_cozinha_basica_pipeline(self):
        """Pipeline completo: cozinha com 20 pecas."""
        pieces = _cozinha_pieces()
        sheet = _standard_sheet()

        # 1. Expandir
        expanded = expand_pieces_by_quantity(pieces)
        total_expected = sum(p.quantity for p in pieces)
        assert len(expanded) == total_expected

        # 2. Nesting
        config = NestingConfig(spacing=7, allow_rotation=True)
        layout = build_optimal_layout(expanded, [sheet], config=config)

        # 3. Validar
        assert layout.total_pieces == total_expected
        assert layout.total_sheets >= 1
        assert layout.avg_occupancy > 0

        # 4. Score
        score = score_layout(layout, BALANCED, pieces=pieces)
        assert score.total > 0
        assert score.occupancy > 0

        # 5. JSON export
        json_out = export_layout_json(
            layout, pieces=pieces,
            score_details=score.to_dict(),
        )
        assert json_out["summary"]["total_pieces"] == total_expected

        # 6. SVG export
        for sl in layout.sheets:
            svg = export_sheet_svg(sl)
            assert "<svg" in svg

    def test_ga_optimizer_pipeline(self):
        """Pipeline com GA optimizer."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=400 + i * 50, width=300,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 6)
        ]
        sheet = _standard_sheet()

        # GA
        config = GAConfig(max_generations=10, seed=42)
        layout, info = optimize_with_ga(pieces, [sheet], config)

        assert layout.total_pieces == 5
        assert layout.total_sheets >= 1
        assert "groups" in info

        # Score
        score = score_layout(layout)
        assert score.total > 0

    def test_mixed_materials_pipeline(self):
        """Pipeline com multiplos materiais."""
        pieces, sheets = _mixed_material_pieces()
        expanded = expand_pieces_by_quantity(pieces)

        config = NestingConfig(spacing=7, allow_rotation=True)
        layout = build_optimal_layout(expanded, sheets, config=config)

        total_expected = sum(p.quantity for p in pieces)
        assert layout.total_pieces == total_expected

        # Score
        score = score_layout(layout)
        assert score.total > 0

    def test_vacuum_simulation_pipeline(self):
        """Pipeline com simulacao de vacuo."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=600, width=400,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 5)
        ]
        sheet = _standard_sheet()
        expanded = expand_pieces_by_quantity(pieces)

        # Nesting
        result = run_nesting_pass(expanded, sheet)
        assert result.total_pieces_placed == 4

        # Criar SheetLayout para simulacao
        if result.bins:
            bin0 = result.bins[0]
            sl = SheetLayout(
                index=0, sheet=sheet,
                placements=bin0.placements,
                occupancy=bin0.occupancy,
            )

            # Simulacao de vacuo
            vac_result = simulate_vacuum_progressive(sl)
            assert len(vac_result.pieces) == len(bin0.placements)

            # Otimizar ordem
            opt_order = optimize_cut_order_for_vacuum(sl)
            assert len(opt_order) == len(bin0.placements)

    def test_gcode_generation_pipeline(self):
        """Pipeline ate G-code."""
        machine = MachineConfig(
            z_origin="mesa",
            espessura_chapa=18.5,
            vel_corte=4000,
        )
        tools = {
            "T01": GcodeTool(codigo="T01", diametro=6, doc=6, rpm=18000,
                            velocidade_corte=4000),
            "T02": GcodeTool(codigo="T02", diametro=8, doc=5, rpm=16000,
                            velocidade_corte=3500),
        }

        ops = [
            GcodeOp(op_type="hole", piece_persistent_id="P001",
                    abs_x=100, abs_y=200, depth=15,
                    tool_code="T01", fase=0, prioridade=10),
            GcodeOp(op_type="hole", piece_persistent_id="P001",
                    abs_x=200, abs_y=200, depth=15,
                    tool_code="T01", fase=0, prioridade=10),
            GcodeOp(op_type="groove", piece_persistent_id="P002",
                    abs_x=500, abs_y=300, abs_x2=800, abs_y2=300,
                    width=8, depth=10,
                    tool_code="T02", fase=0, prioridade=30),
            GcodeOp(op_type="contorno", piece_persistent_id="P001",
                    depth=18.5, tool_code="T01", fase=1, prioridade=100,
                    contour_path=[(10, 10), (730, 10), (730, 560), (10, 560)]),
        ]

        result = generate_gcode(ops, machine, tools)

        assert result.gcode
        assert "G0" in result.gcode
        assert "G1" in result.gcode
        assert result.stats["total_ops"] == 4
        assert result.stats["tool_changes"] >= 1

        # Verificar que G-code tem linhas validas
        lines = result.gcode.split("\n")
        assert len(lines) > 20

    def test_no_overlaps_simple_pieces(self):
        """Zero overlaps com pecas simples e uniformes."""
        # Pecas uniformes cabem facilmente sem overlap
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=500, width=400,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 6)
        ]
        sheet = _standard_sheet()

        result = run_nesting_pass(pieces, sheet, allow_rotation=False)
        assert result.total_pieces_placed == 5
        # Com pecas uniformes e sem rotacao, nao deve ter overlaps
        assert verify_no_overlaps(result.bins, tolerance=1.0)

    def test_retention_strategy_pipeline(self):
        """Pipeline de estrategia de retencao."""
        # Peca pequena — deve usar onion skin
        strategy = select_retention_strategy(150, 100, 18.5, "super_pequena")
        assert strategy.method in ("onion_skin", "combined", "tabs")

        # Peca grande — sem retencao especial ou tabs
        strategy_large = select_retention_strategy(1000, 800, 18.5, "normal")
        assert strategy_large.method in ("none", "tabs")

    def test_remnant_in_pipeline(self):
        """Pipeline com deteccao de retalhos."""
        pieces = [
            Piece(id=1, persistent_id="P001",
                  description="Lateral",
                  length=720, width=550, quantity=1,
                  material_code="MDF_18.5_BRANCO_TX"),
        ]
        sheet = _standard_sheet()

        result = run_nesting_pass(pieces, sheet)
        assert result.total_pieces_placed == 1

        # Detectar retalhos
        if result.bins:
            bin0 = result.bins[0]
            sl = SheetLayout(
                index=0, sheet=sheet,
                placements=bin0.placements,
                occupancy=bin0.occupancy,
            )
            remnants = detect_remnants(sl)
            # Uma peca pequena em chapa grande = bastante retalho
            assert len(remnants) >= 1

    def test_scoring_profiles_consistency(self):
        """Perfis de scoring devem produzir resultados consistentes."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=500, width=400,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 4)
        ]
        sheet = _standard_sheet()

        result = run_nesting_pass(pieces, sheet)
        layout = LayoutResult(
            sheets=[SheetLayout(
                index=0, sheet=sheet,
                placements=result.bins[0].placements if result.bins else [],
                occupancy=result.avg_occupancy,
            )],
            total_sheets=len(result.bins),
            total_pieces=result.total_pieces_placed,
            avg_occupancy=result.avg_occupancy,
        )

        # Testar todos os perfis
        for profile in [BALANCED, MAXIMIZE_OCCUPANCY, CNC_SAFE]:
            score = score_layout(layout, profile)
            assert score.total >= 0
            assert score.total <= 100


# ===================================================================
# Testes de Performance (Benchmark)
# ===================================================================

class TestBenchmark:
    """Benchmarks de performance."""

    def test_20_pieces_under_2s(self):
        """20 pecas completa em < 2s."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=400 + (i * 37) % 800,
                  width=200 + (i * 23) % 400,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 21)
        ]
        sheet = _standard_sheet()

        start = time.time()
        config = NestingConfig(spacing=7, max_combinations=50)
        layout = build_optimal_layout(pieces, [sheet], config=config)
        elapsed = time.time() - start

        assert elapsed < 2.0, f"20 pecas levou {elapsed:.2f}s"
        assert layout.total_pieces == 20

    def test_50_pieces_under_15s(self):
        """50 pecas completa em < 15s (com R&R + Last-Bin)."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=300 + (i * 41) % 600,
                  width=200 + (i * 29) % 300,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 51)
        ]
        sheet = _standard_sheet()

        start = time.time()
        config = NestingConfig(spacing=7, max_combinations=30, rr_iterations=200)
        layout = build_optimal_layout(pieces, [sheet], config=config)
        elapsed = time.time() - start

        assert elapsed < 15.0, f"50 pecas levou {elapsed:.2f}s"
        assert layout.total_pieces == 50

    def test_ga_5_pieces_under_3s(self):
        """GA com 5 pecas em < 3s."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=500 + i * 50,
                  width=300 + i * 30,
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i in range(1, 6)
        ]
        sheet = _standard_sheet()

        start = time.time()
        config = GAConfig(max_generations=10, seed=42)
        layout, info = optimize_with_ga(pieces, [sheet], config)
        elapsed = time.time() - start

        assert elapsed < 3.0, f"GA 5 pecas levou {elapsed:.2f}s"
        assert layout.total_pieces == 5

    def test_gcode_100_ops_under_1s(self):
        """G-code com 100 operacoes em < 1s."""
        tools = {"T01": GcodeTool(codigo="T01", diametro=6, doc=6)}
        ops = [
            GcodeOp(
                op_type="hole",
                piece_persistent_id=f"P{i:03d}",
                abs_x=100 + (i * 37) % 2000,
                abs_y=100 + (i * 23) % 1500,
                depth=15,
                tool_code="T01",
                fase=0,
            )
            for i in range(100)
        ]

        start = time.time()
        result = generate_gcode(ops, tools=tools)
        elapsed = time.time() - start

        assert elapsed < 1.0
        assert result.stats["total_ops"] == 100


# ===================================================================
# Testes de Qualidade
# ===================================================================

class TestQuality:
    """Testes de qualidade do resultado."""

    def test_occupancy_reasonable(self):
        """Aproveitamento deve ser razoavel para pecas normais."""
        pieces = [
            Piece(id=i, persistent_id=f"P{i:03d}",
                  description=f"Peca {i}",
                  length=sizes[0], width=sizes[1],
                  quantity=1,
                  material_code="MDF_18.5_BRANCO_TX")
            for i, sizes in enumerate([
                (720, 550), (1164, 550), (716, 597),
                (400, 300), (500, 400), (300, 200),
            ], start=1)
        ]
        sheet = _standard_sheet()

        config = NestingConfig(spacing=7, allow_rotation=True)
        layout = build_optimal_layout(pieces, [sheet], config=config)

        # 6 pecas de tamanho medio devem caber em 1 chapa
        assert layout.total_sheets <= 2
        assert layout.avg_occupancy > 30

    def test_grain_locked_pieces(self):
        """Pecas com veio travado respeitam restricao."""
        pieces = [
            Piece(id=1, persistent_id="P001",
                  description="Carvalho",
                  length=720, width=550,
                  quantity=1,
                  material_code="MDF_18.5_CARVALHO",
                  rotation_policy=RotationPolicy.GRAIN_LOCKED),
        ]
        sheet = _standard_sheet("MDF_18.5_CARVALHO")

        result = run_nesting_pass(pieces, sheet)
        assert result.total_pieces_placed == 1
        # Peca com veio nao deve ser rotacionada
        if result.bins and result.bins[0].placements:
            p = result.bins[0].placements[0]
            # Rotacao deve ser 0 ou 180 (que nao troca dimensoes)
            assert p.rotation in (0, 180) or not p.rotated

    def test_better_layout_gets_higher_score(self):
        """Layout com mais ocupacao deve ter score maior."""
        # Layout bom: 1 chapa, alta ocupacao
        good = LayoutResult(
            sheets=[SheetLayout(
                index=0,
                sheet=_standard_sheet(),
                placements=[Placement(x=10, y=10,
                    effective_length=2000, effective_width=1500)],
                occupancy=85,
            )],
            total_sheets=1, total_pieces=1, avg_occupancy=85,
        )

        # Layout ruim: 2 chapas, baixa ocupacao
        bad = LayoutResult(
            sheets=[
                SheetLayout(
                    index=0,
                    sheet=_standard_sheet(),
                    placements=[Placement(x=10, y=10,
                        effective_length=500, effective_width=400)],
                    occupancy=30,
                ),
                SheetLayout(
                    index=1,
                    sheet=_standard_sheet(),
                    placements=[Placement(x=10, y=10,
                        effective_length=300, effective_width=200)],
                    occupancy=15,
                ),
            ],
            total_sheets=2, total_pieces=2, avg_occupancy=22.5,
        )

        s_good = score_layout(good)
        s_bad = score_layout(bad)
        assert s_good.total > s_bad.total

    def test_piece_classification(self):
        """Classificacao de pecas por tamanho CNC."""
        small = Piece(id=1, persistent_id="P001",
                     length=150, width=100, quantity=1,
                     material_code="MDF")
        assert classify_piece_size(small) == "super_pequena"

        medium = Piece(id=2, persistent_id="P002",
                      length=350, width=250, quantity=1,
                      material_code="MDF")
        assert classify_piece_size(medium) == "pequena"

        large = Piece(id=3, persistent_id="P003",
                     length=800, width=600, quantity=1,
                     material_code="MDF")
        assert classify_piece_size(large) == "normal"
