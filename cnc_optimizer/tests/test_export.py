"""Testes de exportacao (FASE 11)."""

import pytest
import math

from app.core.domain.models import (
    Piece, Sheet, Placement, SheetLayout, LayoutResult,
)
from app.core.export.gcode_generator import (
    MachineConfig, GcodeTool, GcodeOp, GcodeResult,
    GcodeGenerator, calcular_passadas, generate_gcode,
)
from app.core.export.json_exporter import (
    export_layout_json, export_pieces_summary,
)
from app.core.export.svg_exporter import (
    export_sheet_svg, export_layout_svg,
)


# ===================================================================
# Helpers
# ===================================================================

def _make_machine(**kwargs) -> MachineConfig:
    return MachineConfig(**kwargs)


def _make_tool(
    codigo: str = "T01",
    diametro: float = 6.0,
    doc: float = 6.0,
    rpm: int = 18000,
    velocidade_corte: float = 4000.0,
) -> GcodeTool:
    return GcodeTool(
        codigo=codigo, nome=f"Fresa {diametro}mm",
        diametro=diametro, rpm=rpm, doc=doc,
        velocidade_corte=velocidade_corte,
    )


def _make_hole_op(**kwargs) -> GcodeOp:
    defaults = dict(
        op_type="hole",
        piece_id=1, piece_persistent_id="P001",
        abs_x=100, abs_y=200,
        depth=15,
        tool_code="T01",
        fase=0, prioridade=10,
    )
    defaults.update(kwargs)
    return GcodeOp(**defaults)


def _make_groove_op(**kwargs) -> GcodeOp:
    defaults = dict(
        op_type="groove",
        piece_id=1, piece_persistent_id="P001",
        abs_x=100, abs_y=200,
        abs_x2=500, abs_y2=200,
        width=8, depth=10,
        tool_code="T01",
        fase=0, prioridade=30,
    )
    defaults.update(kwargs)
    return GcodeOp(**defaults)


def _make_contorno_op(**kwargs) -> GcodeOp:
    defaults = dict(
        op_type="contorno",
        piece_id=1, piece_persistent_id="P001",
        depth=18.5,
        tool_code="T01",
        fase=1, prioridade=100,
        contour_path=[
            (10, 10), (730, 10), (730, 560), (10, 560),
        ],
    )
    defaults.update(kwargs)
    return GcodeOp(**defaults)


def _make_sheet_layout() -> SheetLayout:
    return SheetLayout(
        index=0,
        sheet=Sheet(
            id=1, length=2750, width=1850,
            trim=10, material_code="MDF_18.5_BRANCO_TX",
        ),
        placements=[
            Placement(
                piece_id=1, piece_persistent_id="P001",
                x=10, y=10,
                effective_length=720, effective_width=550,
            ),
            Placement(
                piece_id=2, piece_persistent_id="P002",
                x=740, y=10,
                effective_length=500, effective_width=400,
            ),
        ],
        occupancy=25.5,
    )


def _make_layout_result() -> LayoutResult:
    return LayoutResult(
        sheets=[_make_sheet_layout()],
        total_sheets=1,
        total_pieces=2,
        avg_occupancy=25.5,
    )


# ===================================================================
# Testes de Passadas
# ===================================================================

class TestPassadas:
    """Testes do calculo de passadas."""

    def test_single_pass(self):
        """Profundidade <= DOC = uma passada."""
        passes = calcular_passadas(5, 6)
        assert passes == [5]

    def test_two_passes(self):
        """Profundidade = 2x DOC."""
        passes = calcular_passadas(12, 6)
        assert len(passes) == 2
        assert passes[-1] == pytest.approx(12, abs=0.1)

    def test_three_passes(self):
        """Profundidade = 3x DOC."""
        passes = calcular_passadas(18, 6)
        assert len(passes) == 3

    def test_redistribution(self):
        """Ultima passada fina deve ser redistribuida."""
        passes = calcular_passadas(13, 6)
        # 13/6 = 2 full + 1mm left — redistribuicao
        assert passes[-1] == pytest.approx(13, abs=0.1)

    def test_zero_doc(self):
        """DOC zero = passada unica."""
        passes = calcular_passadas(10, 0)
        assert passes == [10]

    def test_cumulative(self):
        """Passadas sao cumulativas."""
        passes = calcular_passadas(18, 6)
        assert passes[0] <= 6
        assert passes[-1] == pytest.approx(18, abs=0.1)
        # Cada passada >= anterior
        for i in range(1, len(passes)):
            assert passes[i] >= passes[i - 1]


# ===================================================================
# Testes Z-helpers
# ===================================================================

class TestZHelpers:
    """Testes das funcoes de Z."""

    def test_z_mesa_origin(self):
        """Z-origin mesa: Z0 = mesa."""
        m = _make_machine(z_origin="mesa", espessura_chapa=18.5)
        gen = GcodeGenerator(m)
        assert gen.z_safe() == pytest.approx(48.5, abs=0.1)  # 18.5 + 30
        assert gen.z_approach() == pytest.approx(20.5, abs=0.1)  # 18.5 + 2
        assert gen.z_cut(18.5) == pytest.approx(0, abs=0.1)  # 18.5 - 18.5
        assert gen.z_cut(10) == pytest.approx(8.5, abs=0.1)  # 18.5 - 10

    def test_z_topo_origin(self):
        """Z-origin topo: Z0 = topo do material."""
        m = _make_machine(z_origin="topo", espessura_chapa=18.5)
        gen = GcodeGenerator(m)
        assert gen.z_safe() == 30.0
        assert gen.z_approach() == 2.0
        assert gen.z_cut(10) == -10.0
        assert gen.z_cut(18.5) == -18.5


# ===================================================================
# Testes do Gerador
# ===================================================================

class TestGcodeGenerator:
    """Testes do gerador de G-code."""

    def test_empty_ops(self):
        """Sem operacoes = header + footer apenas."""
        result = generate_gcode([])
        assert result.gcode
        assert "G90" in result.gcode
        assert "M30" in result.gcode
        assert result.stats["total_ops"] == 0

    def test_single_hole(self):
        """Gerar G-code para um furo."""
        tools = {"T01": _make_tool()}
        op = _make_hole_op()
        result = generate_gcode([op], tools=tools)

        assert "Furo P001" in result.gcode
        assert "G0 X100.000 Y200.000" in result.gcode
        assert "G1 Z" in result.gcode
        assert result.stats["total_ops"] == 1

    def test_groove(self):
        """Gerar G-code para rasgo."""
        tools = {"T01": _make_tool()}
        op = _make_groove_op()
        result = generate_gcode([op], tools=tools)

        assert "Rasgo P001" in result.gcode
        assert "G1 X" in result.gcode
        assert result.stats["total_ops"] == 1

    def test_pocket(self):
        """Gerar G-code para pocket."""
        tools = {"T01": _make_tool()}
        op = GcodeOp(
            op_type="pocket",
            piece_id=1, piece_persistent_id="P001",
            abs_x=300, abs_y=200,
            width=100, height=80,
            depth=5,
            tool_code="T01",
            fase=0,
        )
        result = generate_gcode([op], tools=tools)

        assert "Pocket P001" in result.gcode
        assert result.stats["total_ops"] == 1

    def test_contorno_retangular(self):
        """Gerar G-code para contorno retangular."""
        tools = {"T01": _make_tool()}
        op = _make_contorno_op()
        result = generate_gcode([op], tools=tools)

        assert "Contorno P001" in result.gcode
        assert result.stats["total_ops"] == 1

    def test_circular_hole(self):
        """Gerar G-code para furo circular."""
        tools = {"T01": _make_tool()}
        op = GcodeOp(
            op_type="circular_hole",
            piece_id=1, piece_persistent_id="P001",
            abs_x=500, abs_y=300,
            radius=25, depth=18.5,
            tool_code="T01",
            fase=0,
        )
        result = generate_gcode([op], tools=tools)

        assert "Furo circular" in result.gcode
        assert "G2" in result.gcode
        assert result.stats["total_ops"] == 1

    def test_tool_change(self):
        """Troca de ferramenta entre operacoes."""
        tools = {
            "T01": _make_tool(codigo="T01"),
            "T02": _make_tool(codigo="T02", diametro=8),
        }
        ops = [
            _make_hole_op(tool_code="T01"),
            _make_hole_op(piece_id=2, piece_persistent_id="P002",
                         tool_code="T02", abs_x=300),
        ]
        result = generate_gcode(ops, tools=tools)

        assert "T01 M6" in result.gcode
        assert "T02 M6" in result.gcode
        assert result.stats["tool_changes"] == 2

    def test_phase_separators(self):
        """Separadores de fase no G-code."""
        tools = {"T01": _make_tool()}
        ops = [
            _make_hole_op(fase=0),
            _make_contorno_op(fase=1),
        ]
        result = generate_gcode(ops, tools=tools)

        assert "FASE 0: USINAGENS INTERNAS" in result.gcode
        assert "FASE 1: CONTORNOS DE PECAS" in result.gcode

    def test_header_info(self):
        """Header contem informacoes da chapa."""
        tools = {"T01": _make_tool()}
        info = {"index": 0, "material": "MDF", "length": 2750, "width": 1850}
        result = generate_gcode([_make_hole_op()], tools=tools, sheet_info=info)

        assert "Material: MDF" in result.gcode
        assert "2750x1850" in result.gcode

    def test_n_codes(self):
        """N-codes opcionais."""
        machine = _make_machine(usar_n_codes=True, n_code_incremento=10)
        tools = {"T01": _make_tool()}
        result = generate_gcode([_make_hole_op()], machine=machine, tools=tools)

        assert "N10" in result.gcode or "N20" in result.gcode

    def test_onion_skin(self):
        """Onion skin com breakthrough."""
        machine = _make_machine(usar_onion_skin=True)
        tools = {"T01": _make_tool()}
        op = _make_contorno_op(needs_onion=True, onion_depth_full=18.5)
        result = generate_gcode([op], machine=machine, tools=tools)

        assert "ONION SKIN BREAKTHROUGH" in result.gcode
        assert "Breakthrough" in result.gcode
        assert result.stats["onion_ops"] == 1

    def test_small_piece_feed_reduction(self):
        """Feed reduzido para pecas pequenas."""
        machine = _make_machine(feed_percentual=50)
        tools = {"T01": _make_tool(velocidade_corte=4000)}
        op = _make_groove_op(is_small_piece=True)
        result = generate_gcode([op], machine=machine, tools=tools)

        # Feed deve ser 2000 (50% de 4000)
        assert "F2000" in result.gcode

    def test_multiple_operations(self):
        """Pipeline com multiplas operacoes."""
        tools = {"T01": _make_tool()}
        ops = [
            _make_hole_op(abs_x=100, abs_y=100),
            _make_hole_op(piece_id=2, piece_persistent_id="P002",
                         abs_x=200, abs_y=100),
            _make_groove_op(abs_x=100, abs_y=300),
            _make_contorno_op(fase=1),
        ]
        result = generate_gcode(ops, tools=tools)

        assert result.stats["total_ops"] == 4

    def test_missing_tool_fallback(self):
        """Ferramenta inexistente usa fallback."""
        tools = {"T01": _make_tool()}
        op = _make_hole_op(tool_code="T99")  # Nao existe
        result = generate_gcode([op], tools=tools)

        assert len(result.alertas) > 0
        assert result.stats["total_ops"] == 1  # Ainda executa

    def test_contorno_complexo(self):
        """Contorno complexo com segmentos."""
        tools = {"T01": _make_tool()}
        op = GcodeOp(
            op_type="contorno",
            piece_id=1, piece_persistent_id="P001",
            abs_x=100, abs_y=100,
            depth=18.5,
            tool_code="T01",
            fase=1,
            contour_segments=[
                {"type": "line", "x2": 500, "y2": 100},
                {"type": "arc", "x2": 550, "y2": 150, "cx": 500, "cy": 100, "dir": "cw"},
                {"type": "line", "x2": 550, "y2": 400},
                {"type": "line", "x2": 100, "y2": 400},
                {"type": "line", "x2": 100, "y2": 100},
            ],
        )
        result = generate_gcode([op], tools=tools)

        assert "Contorno complexo" in result.gcode
        assert "G2" in result.gcode  # Arco
        assert result.stats["total_ops"] == 1

    def test_result_structure(self):
        """Estrutura do resultado."""
        result = generate_gcode([])
        assert isinstance(result, GcodeResult)
        assert isinstance(result.gcode, str)
        assert isinstance(result.stats, dict)
        assert isinstance(result.alertas, list)
        assert "total_ops" in result.stats
        assert "tool_changes" in result.stats
        assert "lines" in result.stats


# ===================================================================
# Testes do JSON Exporter
# ===================================================================

class TestJsonExporter:
    """Testes do exportador JSON."""

    def test_basic_export(self):
        """Exportacao basica."""
        layout = _make_layout_result()
        result = export_layout_json(layout)

        assert "version" in result
        assert "generated_at" in result
        assert "summary" in result
        assert "sheets" in result
        assert result["summary"]["total_sheets"] == 1
        assert result["summary"]["total_pieces"] == 2

    def test_with_pieces(self):
        """Exportacao com pecas originais."""
        layout = _make_layout_result()
        pieces = [
            Piece(id=1, persistent_id="P001", description="Lateral",
                  length=720, width=550, quantity=1,
                  material_code="MDF_18.5_BRANCO_TX"),
        ]
        result = export_layout_json(layout, pieces=pieces)

        # Deve ter info da peca nos placements
        sheet = result["sheets"][0]
        p = sheet["placements"][0]
        assert p["piece_persistent_id"] == "P001"

    def test_with_score(self):
        """Exportacao com score."""
        layout = _make_layout_result()
        score = {"total": 75.5, "components": {}}
        result = export_layout_json(layout, score_details=score)

        assert "score_details" in result
        assert result["score_details"]["total"] == 75.5

    def test_pieces_summary(self):
        """Resumo de pecas."""
        pieces = [
            Piece(id=1, persistent_id="P001", description="Lateral",
                  length=720, width=550, quantity=2,
                  material_code="MDF_18.5_BRANCO_TX"),
        ]
        summary = export_pieces_summary(pieces)
        assert len(summary) == 1
        assert summary[0]["persistent_id"] == "P001"
        assert summary[0]["quantity"] == 2


# ===================================================================
# Testes do SVG Exporter
# ===================================================================

class TestSvgExporter:
    """Testes do exportador SVG."""

    def test_basic_svg(self):
        """SVG basico."""
        layout = _make_sheet_layout()
        svg = export_sheet_svg(layout)

        assert svg.startswith("<svg")
        assert "</svg>" in svg
        assert "rect" in svg

    def test_svg_has_pieces(self):
        """SVG contem retangulos de pecas."""
        layout = _make_sheet_layout()
        svg = export_sheet_svg(layout)

        # Deve ter pelo menos 3 rects (chapa + 2 pecas)
        assert svg.count("<rect") >= 3

    def test_svg_has_labels(self):
        """SVG contem labels."""
        layout = _make_sheet_layout()
        svg = export_sheet_svg(layout, show_labels=True)

        assert "P001" in svg
        assert "P002" in svg

    def test_svg_no_labels(self):
        """SVG sem labels."""
        layout = _make_sheet_layout()
        svg = export_sheet_svg(layout, show_labels=False)

        assert "P001" not in svg

    def test_svg_with_grid(self):
        """SVG com grid."""
        layout = _make_sheet_layout()
        svg = export_sheet_svg(layout, show_grid=True)

        assert "line" in svg

    def test_svg_scale(self):
        """SVG com escala diferente."""
        layout = _make_sheet_layout()
        svg1 = export_sheet_svg(layout, scale=0.1)
        svg2 = export_sheet_svg(layout, scale=0.3)

        # SVG maior com escala maior
        assert len(svg2) >= len(svg1)

    def test_multiple_sheets_svg(self):
        """SVG para multiplas chapas."""
        layout = _make_layout_result()
        svgs = export_layout_svg(layout)

        assert len(svgs) == 1
        assert all(s.startswith("<svg") for s in svgs)

    def test_svg_with_remnants(self):
        """SVG com retalhos."""
        layout = _make_sheet_layout()
        remnants = [
            {"x": 1500, "y": 10, "length": 1200, "width": 800},
        ]
        svg = export_sheet_svg(layout, remnants=remnants)

        assert "remnant" in svg

    def test_svg_dimensions(self):
        """SVG mostra dimensoes da chapa."""
        layout = _make_sheet_layout()
        svg = export_sheet_svg(layout, show_dimensions=True)

        assert "2750mm" in svg
        assert "1850mm" in svg
