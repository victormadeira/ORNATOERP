"""Testes dos endpoints bridge (Express ↔ Python)."""

import pytest

from app.api.routes_bridge import (
    _classify_piece,
    _pieces_to_internal,
    _sheets_to_internal,
    _detect_remnants,
    _build_express_response,
    BridgePiece, BridgeSheet, BridgeConfig,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_bridge_piece(**kwargs) -> BridgePiece:
    defaults = {
        "id": 1,
        "persistent_id": "P001",
        "comprimento": 720,
        "largura": 550,
        "quantidade": 1,
        "material_code": "MDF_18.5_BRANCO_TX",
        "espessura": 18.5,
        "allow_rotate": True,
    }
    defaults.update(kwargs)
    return BridgePiece(**defaults)


def _make_bridge_sheet(**kwargs) -> BridgeSheet:
    defaults = {
        "id": 1,
        "nome": "MDF 18mm Branco",
        "material_code": "MDF_18.5_BRANCO_TX",
        "espessura_nominal": 18,
        "espessura_real": 18.5,
        "comprimento": 2750,
        "largura": 1850,
        "refilo": 10,
        "kerf": 4,
        "veio": "sem_veio",
        "preco": 280,
    }
    defaults.update(kwargs)
    return BridgeSheet(**defaults)


# ---------------------------------------------------------------------------
# Testes de classificacao
# ---------------------------------------------------------------------------

class TestClassifyPiece:
    def test_normal(self):
        assert _classify_piece(720, 550) == "normal"

    def test_pequena(self):
        assert _classify_piece(350, 300) == "pequena"

    def test_super_pequena(self):
        assert _classify_piece(150, 100) == "super_pequena"

    def test_custom_thresholds(self):
        assert _classify_piece(350, 300, limiar_pequena=300) == "normal"
        assert _classify_piece(250, 200, limiar_super_pequena=250) == "super_pequena"

    def test_edge_case_at_threshold(self):
        assert _classify_piece(400, 400) == "normal"
        assert _classify_piece(399, 500) == "pequena"
        assert _classify_piece(200, 500) == "pequena"  # minDim=200, < 400 threshold
        assert _classify_piece(199, 500) == "super_pequena"


# ---------------------------------------------------------------------------
# Testes de conversao
# ---------------------------------------------------------------------------

class TestPiecesConversion:
    def test_basic_conversion(self):
        pieces = [_make_bridge_piece()]
        internal = _pieces_to_internal(pieces)
        assert len(internal) == 1
        assert internal[0].length == 720
        assert internal[0].width == 550
        assert internal[0].material_code == "MDF_18.5_BRANCO_TX"

    def test_grain_sem_veio(self):
        pieces = [_make_bridge_piece()]
        internal = _pieces_to_internal(pieces, "sem_veio")
        from app.core.domain.enums import GrainDirection
        assert internal[0].grain == GrainDirection.NONE

    def test_grain_horizontal_sheet(self):
        pieces = [_make_bridge_piece()]
        internal = _pieces_to_internal(pieces, "horizontal")
        from app.core.domain.enums import GrainDirection
        assert internal[0].grain == GrainDirection.HORIZONTAL

    def test_multiple_pieces(self):
        pieces = [
            _make_bridge_piece(id=1, comprimento=720, largura=550),
            _make_bridge_piece(id=2, comprimento=400, largura=300),
        ]
        internal = _pieces_to_internal(pieces)
        assert len(internal) == 2
        assert internal[1].length == 400


class TestSheetsConversion:
    def test_basic_conversion(self):
        sheets = [_make_bridge_sheet()]
        internal = _sheets_to_internal(sheets)
        assert len(internal) == 1
        assert internal[0].length == 2750
        assert internal[0].width == 1850
        assert internal[0].trim == 10
        assert internal[0].kerf == 4

    def test_grain_mapping(self):
        from app.core.domain.enums import GrainDirection
        sheets = [_make_bridge_sheet(veio="horizontal")]
        internal = _sheets_to_internal(sheets)
        assert internal[0].grain == GrainDirection.HORIZONTAL


# ---------------------------------------------------------------------------
# Testes de resposta
# ---------------------------------------------------------------------------

class TestBridgeConfig:
    def test_defaults(self):
        cfg = BridgeConfig()
        assert cfg.spacing == 7
        assert cfg.kerf == 4
        assert cfg.modo == "maxrects"
        assert cfg.considerar_sobra is True
        assert cfg.classificar_pecas is True

    def test_custom(self):
        cfg = BridgeConfig(spacing=10, kerf=6, modo="guillotine")
        assert cfg.spacing == 10
        assert cfg.kerf == 6
        assert cfg.modo == "guillotine"


class TestBuildExpressResponse:
    def test_empty_layout(self):
        """Layout vazio retorna estrutura valida."""
        from app.core.domain.models import LayoutResult
        layout = LayoutResult(sheets=[], total_pieces=0, total_score=0)
        cfg = BridgeConfig()
        sheet = _make_bridge_sheet()
        resp = _build_express_response(layout, cfg, sheet, 100)
        assert resp["ok"] is True
        assert resp["total_chapas"] == 0
        assert resp["aproveitamento"] == 0
        assert resp["motor"] == "python"

    def test_with_placements(self):
        """Layout com pecas gera chapas com pecas."""
        from app.core.domain.models import (
            LayoutResult, SheetLayout, Sheet, Placement,
        )
        from app.core.domain.enums import GrainDirection

        sheet = Sheet(
            id=1, length=2750, width=1850, thickness=18.5,
            material_code="MDF_18.5_BRANCO_TX", quantity=1,
            trim=10, grain=GrainDirection.NONE,
        )
        placement = Placement(
            piece_id=1, piece_persistent_id="P001",
            instance=0, x=10, y=10,
            effective_length=720, effective_width=550,
            rotation=0, rotated=False,
            original_length=720, original_width=550,
            material_code="MDF_18.5_BRANCO_TX",
        )
        sl = SheetLayout(
            index=0, sheet=sheet,
            placements=[placement], occupancy=15.5,
        )
        layout = LayoutResult(sheets=[sl], total_pieces=1, total_score=50)

        cfg = BridgeConfig()
        bridge_sheet = _make_bridge_sheet()
        resp = _build_express_response(layout, cfg, bridge_sheet, 50)

        assert resp["ok"] is True
        assert resp["total_chapas"] == 1
        assert resp["plano"]["chapas"][0]["pecas"][0]["pecaId"] == 1
        assert resp["plano"]["chapas"][0]["pecas"][0]["w"] == 720
        assert resp["plano"]["chapas"][0]["pecas"][0]["h"] == 550


class TestDetectRemnants:
    def test_no_placements(self):
        from app.core.domain.models import SheetLayout, Sheet
        from app.core.domain.enums import GrainDirection
        sheet = Sheet(id=1, length=2750, width=1850, thickness=18.5,
                      material_code="MDF_18.5_BRANCO_TX", quantity=1, trim=10,
                      grain=GrainDirection.NONE)
        sl = SheetLayout(index=0, sheet=sheet, placements=[], occupancy=0)
        result = _detect_remnants(sl, sheet, 300, 600)
        assert result == []

    def test_with_placement_detects_remnant(self):
        from app.core.domain.models import SheetLayout, Sheet, Placement
        from app.core.domain.enums import GrainDirection
        sheet = Sheet(id=1, length=2750, width=1850, thickness=18.5,
                      material_code="MDF_18.5_BRANCO_TX", quantity=1, trim=10,
                      grain=GrainDirection.NONE)
        p = Placement(
            piece_id=1, piece_persistent_id="P001",
            instance=0, x=10, y=10,
            effective_length=1000, effective_width=1000,
            rotation=0, rotated=False,
            original_length=1000, original_width=1000,
            material_code="MDF_18.5_BRANCO_TX",
        )
        sl = SheetLayout(index=0, sheet=sheet, placements=[p], occupancy=20)
        result = _detect_remnants(sl, sheet, 300, 600)
        # Deve detectar espaco a direita (1740x1830) e abaixo (1000x830)
        assert len(result) >= 1
        # Pelo menos o retalho a direita deve existir
        right = [r for r in result if r["x"] > 1000]
        assert len(right) >= 1
