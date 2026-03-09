"""Testes dos modelos Pydantic."""

from app.core.domain.models import (
    Piece, Sheet, Remnant, Segment, Contour, Hole,
    Worker, MachiningData, EdgeBands, Placement,
    MachineConfig, MachineTool, OptimizationConfig,
    LayoutResult, SheetLayout, FaceMachiningProfile,
)
from app.core.domain.enums import (
    GrainDirection, RotationPolicy, PieceClassification,
    FaceSide, SheetType, VacuumRisk,
)


class TestPiece:
    """Testes do modelo Piece."""

    def test_create_piece(self):
        p = Piece(id=1, length=720, width=550, material_code="MDF_18.5_BRANCO_TX")
        assert p.id == 1
        assert p.length == 720
        assert p.width == 550
        assert p.is_rectangular is True

    def test_compute_area(self):
        p = Piece(length=720, width=550)
        area = p.compute_area()
        assert area == 720 * 550
        assert p.area_mm2 == area

    def test_compute_perimeter(self):
        p = Piece(length=720, width=550)
        perim = p.compute_perimeter()
        assert perim == 2 * (720 + 550)

    def test_classify_normal(self):
        p = Piece(length=720, width=550)
        p.classify()
        assert p.classification == PieceClassification.NORMAL

    def test_classify_small(self):
        p = Piece(length=720, width=300)
        p.classify()
        assert p.classification == PieceClassification.SMALL

    def test_classify_very_small(self):
        p = Piece(length=300, width=150)
        p.classify()
        assert p.classification == PieceClassification.VERY_SMALL

    def test_grain_default_none(self):
        p = Piece()
        assert p.grain == GrainDirection.NONE
        assert p.rotation_policy == RotationPolicy.FREE

    def test_piece_with_contour(self):
        contour = Contour(
            outer=[
                Segment(type="line", x1=0, y1=0, x2=100, y2=0),
                Segment(type="arc", x1=100, y1=0, x2=100, y2=50,
                        cx=100, cy=25, r=25, dir="cw"),
                Segment(type="line", x1=100, y1=50, x2=0, y2=50),
                Segment(type="line", x1=0, y1=50, x2=0, y2=0),
            ],
            holes=[
                Hole(type="circle", cx=50, cy=25, r=10),
            ]
        )
        p = Piece(length=100, width=50, contour=contour, is_rectangular=False)
        assert p.is_rectangular is False
        assert p.contour is not None
        assert len(p.contour.outer) == 4
        assert len(p.contour.holes) == 1

    def test_piece_with_machining(self):
        machining = MachiningData(
            code="123456A",
            workers=[
                Worker(category="transfer_hole", tool_code="f_15mm_tambor_min",
                       face="top", side="side_a", x=37, y=37, depth=12.5),
                Worker(category="Transfer_vertical_saw_cut", tool_code="r_f",
                       face="left", side="side_a", x=700, y=0, depth=8,
                       length=550, width=7),
            ],
            borders=["CMBOR22x045BRANCO_TX", "", "CMBOR22x045BRANCO_TX", ""],
        )
        p = Piece(machining=machining)
        assert len(p.machining.workers) == 2
        assert p.machining.workers[0].tool_code == "f_15mm_tambor_min"
        assert p.machining.workers[1].category == "Transfer_vertical_saw_cut"

    def test_piece_edges(self):
        edges = EdgeBands(
            front="CMBOR22x045BRANCO_TX",
            back="",
            left="CMBOR22x045BRANCO_TX",
            right="",
            type_code="1C+1L",
        )
        p = Piece(edges=edges)
        assert p.edges.front == "CMBOR22x045BRANCO_TX"
        assert p.edges.type_code == "1C+1L"


class TestSheet:
    """Testes do modelo Sheet."""

    def test_create_sheet(self):
        s = Sheet(length=2750, width=1850, trim=10, kerf=4)
        assert s.length == 2750
        assert s.width == 1850

    def test_usable_dimensions(self):
        s = Sheet(length=2750, width=1850, trim=10)
        assert s.usable_length == 2730
        assert s.usable_width == 1830
        assert s.usable_area == 2730 * 1830

    def test_usable_with_large_trim(self):
        s = Sheet(length=2750, width=1850, trim=100)
        assert s.usable_length == 2550
        assert s.usable_width == 1650

    def test_sheet_grained(self):
        s = Sheet(grain=GrainDirection.HORIZONTAL)
        assert s.grain == GrainDirection.HORIZONTAL


class TestRemnant:
    """Testes do modelo Remnant."""

    def test_remnant_area(self):
        r = Remnant(length=1200, width=800)
        assert r.area == 1200 * 800


class TestMachineConfig:
    """Testes do modelo MachineConfig."""

    def test_defaults(self):
        mc = MachineConfig()
        assert mc.z_safe == 30
        assert mc.use_onion_skin is True
        assert mc.use_tabs is False
        assert mc.onion_thickness == 0.5
        assert mc.tab_width == 4

    def test_custom_config(self):
        mc = MachineConfig(
            z_safe=50,
            use_tabs=True,
            tab_count=4,
            use_onion_skin=False,
        )
        assert mc.z_safe == 50
        assert mc.use_tabs is True
        assert mc.tab_count == 4
        assert mc.use_onion_skin is False


class TestPlacement:
    """Testes do modelo Placement."""

    def test_create_placement(self):
        p = Placement(piece_id=1, sheet_index=0, x=10, y=10, rotation=90, rotated=True)
        assert p.piece_id == 1
        assert p.rotation == 90
        assert p.rotated is True
        assert p.face_up == FaceSide.A

    def test_vacuum_risk(self):
        p = Placement(vacuum_risk=0.85, vacuum_class=VacuumRisk.HIGH)
        assert p.vacuum_risk == 0.85
        assert p.vacuum_class == VacuumRisk.HIGH


class TestFaceMachiningProfile:
    """Testes do perfil de usinagem por face."""

    def test_face_a(self):
        profile = FaceMachiningProfile(
            face=FaceSide.A,
            worker_count=5,
            total_machining_depth=62.5,
            contour_complexity=0.7,
            removed_area_ratio=0.15,
            tool_changes=3,
            has_through_holes=False,
            finish_sensitive=False,
        )
        assert profile.face == FaceSide.A
        assert profile.worker_count == 5

    def test_face_b_sparse(self):
        profile = FaceMachiningProfile(
            face=FaceSide.B,
            worker_count=1,
            total_machining_depth=12.5,
        )
        assert profile.face == FaceSide.B
        assert profile.worker_count == 1


class TestOptimizationConfig:
    """Testes da configuracao de otimizacao."""

    def test_defaults(self):
        c = OptimizationConfig()
        assert c.spacing == 7
        assert c.vacuum_aware is True
        assert c.use_remnants is True
        assert c.max_iterations == 300

    def test_custom(self):
        c = OptimizationConfig(spacing=10, kerf=6, max_iterations=500)
        assert c.spacing == 10
        assert c.kerf == 6
        assert c.max_iterations == 500
