"""Testes de parsing, materiais e ferramentas (FASE 3)."""

import json
from pathlib import Path

import pytest

from app.core.domain.parsers import parse_sketchup_json, ParseResult
from app.core.domain.materials import (
    nominal_to_real,
    real_to_nominal,
    infer_grain_from_material,
    has_grain,
    extract_thickness_from_code,
    extract_finish_from_code,
    build_material_code,
    materials_match,
    group_pieces_by_material,
    parse_edge_band_code,
)
from app.core.domain.tools import (
    ToolMagazine,
    get_default_magazine,
)
from app.core.domain.enums import GrainDirection, RotationPolicy


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> dict:
    """Carregar fixture JSON."""
    path = FIXTURES_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))


# ===================================================================
# MATERIALS
# ===================================================================

class TestThicknessMapping:
    """Testes de mapeamento de espessura."""

    def test_nominal_to_real_18(self):
        assert nominal_to_real(18) == 18.5

    def test_nominal_to_real_6(self):
        assert nominal_to_real(6) == 6.0

    def test_nominal_to_real_15(self):
        assert nominal_to_real(15) == 15.5

    def test_nominal_to_real_25(self):
        assert nominal_to_real(25) == 25.5

    def test_real_to_nominal_18_5(self):
        assert real_to_nominal(18.5) == 18

    def test_unknown_thickness_passthrough(self):
        assert nominal_to_real(20) == 20


class TestGrainDetection:
    """Testes de deteccao de veio."""

    def test_branco_no_grain(self):
        """Branco TX nao tem veio — rotacao livre."""
        grain = infer_grain_from_material("MDF_18.5_BRANCO_TX")
        assert grain == GrainDirection.NONE

    def test_cru_no_grain(self):
        """CRU nao tem veio."""
        grain = infer_grain_from_material("MDF_6.0_CRU")
        assert grain == GrainDirection.NONE

    def test_preto_no_grain(self):
        """Preto nao tem veio."""
        grain = infer_grain_from_material("MDF_18.5_PRETO")
        assert grain == GrainDirection.NONE

    def test_carvalho_has_grain(self):
        """Carvalho Hanover tem veio — rotacao travada."""
        grain = infer_grain_from_material("MDF_18.5_CARVALHO_HANOVER")
        assert grain == GrainDirection.HORIZONTAL

    def test_nogueira_has_grain(self):
        """Nogueira tem veio."""
        grain = infer_grain_from_material("MDF_18.5_NOGUEIRA")
        assert grain == GrainDirection.HORIZONTAL

    def test_freijo_has_grain(self):
        """Freijo tem veio."""
        grain = infer_grain_from_material("MDF_18.5_FREIJO")
        assert grain == GrainDirection.HORIZONTAL

    def test_rustico_has_grain(self):
        """Rustico tem veio."""
        grain = infer_grain_from_material("MDF_18.5_RUSTICO")
        assert grain == GrainDirection.HORIZONTAL

    def test_has_grain_helper(self):
        """Funcao has_grain shortcut."""
        assert not has_grain("MDF_18.5_BRANCO_TX")
        assert has_grain("MDF_18.5_CARVALHO_HANOVER")

    def test_unknown_defaults_to_none(self):
        """Material desconhecido = sem veio (conservador para otimizacao)."""
        grain = infer_grain_from_material("MDF_18.5_XPTO_123")
        assert grain == GrainDirection.NONE

    def test_finish_parameter(self):
        """Finish como parametro separado."""
        grain = infer_grain_from_material("", "CARVALHO")
        assert grain == GrainDirection.HORIZONTAL


class TestMaterialCodeParsing:
    """Testes de parsing do codigo de material."""

    def test_extract_thickness(self):
        assert extract_thickness_from_code("MDF_18.5_BRANCO_TX") == 18.5

    def test_extract_thickness_integer(self):
        assert extract_thickness_from_code("MDF_6.0_CRU") == 6.0

    def test_extract_thickness_none(self):
        assert extract_thickness_from_code("XPTO") is None

    def test_extract_finish(self):
        assert extract_finish_from_code("MDF_18.5_BRANCO_TX") == "BRANCO_TX"

    def test_extract_finish_carvalho(self):
        assert extract_finish_from_code("MDF_18.5_CARVALHO_HANOVER") == "CARVALHO_HANOVER"

    def test_build_material_code(self):
        code = build_material_code(18.5, "BRANCO_TX")
        assert code == "MDF_18.5_BRANCO_TX"

    def test_build_material_code_integer(self):
        code = build_material_code(6.0, "CRU")
        assert code == "MDF_6_CRU"


class TestMaterialMatching:
    """Testes de matching de materiais."""

    def test_exact_match(self):
        assert materials_match("MDF_18.5_BRANCO_TX", "MDF_18.5_BRANCO_TX")

    def test_case_insensitive(self):
        assert materials_match("MDF_18.5_BRANCO_TX", "mdf_18.5_branco_tx")

    def test_different_materials(self):
        assert not materials_match("MDF_18.5_BRANCO_TX", "MDF_18.5_CARVALHO")

    def test_fuzzy_same(self):
        assert materials_match("MDF_18.5_BRANCO_TX", "MDF_18.5_BRANCO_TX", strict=False)

    def test_fuzzy_different_thickness(self):
        assert not materials_match("MDF_18.5_BRANCO_TX", "MDF_15.5_BRANCO_TX", strict=False)


class TestEdgeBandParsing:
    """Testes de parsing de fita de borda."""

    def test_parse_standard(self):
        result = parse_edge_band_code("CMBOR22x045BRANCO_TX")
        assert result["width"] == 22
        assert result["thickness"] == 0.45
        assert result["finish"] == "BRANCO_TX"

    def test_parse_carvalho(self):
        result = parse_edge_band_code("CMBOR22x045CARVALHO_HANOVER")
        assert result["width"] == 22
        assert result["finish"] == "CARVALHO_HANOVER"

    def test_parse_invalid(self):
        result = parse_edge_band_code("XPTO")
        assert result["width"] == 0


class TestGroupByMaterial:
    """Testes de agrupamento por material."""

    def test_group_pieces(self):
        """Agrupar pecas da fixture por material."""
        data = _load_fixture("sketchup_export.json")
        result = parse_sketchup_json(data)
        groups = group_pieces_by_material(result.pieces)

        # Deve ter pelo menos 2 grupos: BRANCO_TX e CRU
        assert len(groups) >= 2

        # BRANCO_TX deve ter mais pecas que CRU
        branco_count = 0
        cru_count = 0
        for code, pieces in groups.items():
            if "BRANCO" in code:
                branco_count = len(pieces)
            if "CRU" in code:
                cru_count = len(pieces)

        assert branco_count > cru_count


# ===================================================================
# TOOLS
# ===================================================================

class TestToolMagazine:
    """Testes do magazine de ferramentas."""

    def test_default_magazine(self):
        """Magazine padrao tem ferramentas."""
        tools = get_default_magazine()
        assert len(tools) >= 8

    def test_find_by_code(self):
        """Buscar por codigo T01."""
        magazine = ToolMagazine()
        tool = magazine.find_by_code("T01")
        assert tool is not None
        assert tool.diameter == 6

    def test_find_by_tool_code(self):
        """Buscar por tool_code do worker."""
        magazine = ToolMagazine()

        # Broca 5mm System 32
        tool = magazine.find_by_tool_code("f_5mm_twister243")
        assert tool is not None
        assert tool.diameter == 5

        # Forstner 35mm dobradica
        tool = magazine.find_by_tool_code("f_35mm_dob")
        assert tool is not None
        assert tool.diameter == 35

        # Rasgo fundo
        tool = magazine.find_by_tool_code("r_f")
        assert tool is not None

    def test_find_by_diameter(self):
        """Buscar por diametro."""
        magazine = ToolMagazine()
        tools_8mm = magazine.find_by_diameter(8)
        assert len(tools_8mm) >= 1

    def test_find_nonexistent(self):
        """Ferramenta inexistente retorna None."""
        magazine = ToolMagazine()
        assert magazine.find_by_tool_code("xpto_inexistente") is None

    def test_contour_tool(self):
        """Ferramenta de contorno (fresa 6mm)."""
        magazine = ToolMagazine()
        tool = magazine.get_contour_tool()
        assert tool is not None
        assert "fresa" in tool.type

    def test_best_match_by_code(self):
        """best_match prioriza tool_code."""
        magazine = ToolMagazine()
        tool = magazine.find_best_match("f_15mm_tambor_min", 15)
        assert tool is not None
        assert tool.diameter == 15

    def test_best_match_by_diameter(self):
        """best_match fallback por diametro."""
        magazine = ToolMagazine()
        tool = magazine.find_best_match("xpto_nao_existe", 5)
        assert tool is not None
        assert tool.diameter == 5

    def test_tool_codes_list(self):
        """Listar tool_codes disponiveis."""
        magazine = ToolMagazine()
        codes = magazine.tool_codes()
        assert "f_5mm_twister243" in codes
        assert "f_35mm_dob" in codes
        assert "r_f" in codes


# ===================================================================
# PARSERS
# ===================================================================

class TestSketchUpParser:
    """Testes de parsing do JSON SketchUp."""

    @pytest.fixture
    def export_data(self) -> dict:
        """Carregar fixture de export."""
        return _load_fixture("sketchup_export.json")

    def test_parse_returns_result(self, export_data):
        """Parse retorna ParseResult."""
        result = parse_sketchup_json(export_data)
        assert isinstance(result, ParseResult)

    def test_parse_piece_count(self, export_data):
        """Contagem de pecas parseadas."""
        result = parse_sketchup_json(export_data)
        # 5 pecas do Balcao + 1 do Armario = 6
        assert result.piece_count == 6

    def test_parse_total_quantity(self, export_data):
        """Quantidade total (incluindo repeticoes)."""
        result = parse_sketchup_json(export_data)
        # Porta Lisa tem quantidade 3, resto 1 = 3 + 5 = 8
        assert result.total_quantity == 8

    def test_parse_lote_info(self, export_data):
        """Info do lote parseada."""
        result = parse_sketchup_json(export_data)
        assert result.lote_info["cliente"] == "João Silva"
        assert result.lote_info["projeto"] == "Cozinha Planejada"
        assert result.lote_info["codigo"] == "OP-0042"

    def test_parse_material_codes(self, export_data):
        """Codigos de material extraidos."""
        result = parse_sketchup_json(export_data)
        codes = result.material_codes
        assert "MDF_18.5_BRANCO_TX" in codes
        assert "MDF_6.0_CRU" in codes
        assert "MDF_18.5_CARVALHO_HANOVER" in codes

    def test_parse_lateral_dimensions(self, export_data):
        """Dimensoes da lateral parseadas corretamente."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        assert lateral.length == 720
        assert lateral.width == 550
        assert lateral.thickness_real == 18.5
        assert lateral.material_code == "MDF_18.5_BRANCO_TX"

    def test_parse_piece_codes(self, export_data):
        """Codigos de peca (upmcode) corretos."""
        result = parse_sketchup_json(export_data)
        codes = {p.persistent_id: p.upmcode for p in result.pieces}

        assert codes["100001"] == "CM_LAT_DIR"
        assert codes["100002"] == "CM_LAT_ESQ"
        assert codes["100003"] == "CM_BAS"
        assert codes["100004"] == "CM_FUN_VER"
        assert codes["100005"] == "CM_POR_LIS"

    def test_parse_module_info(self, export_data):
        """Info do modulo pai."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        assert lateral.module_desc == "Balcao 3 Portas"
        assert lateral.module_id == 1

    def test_parse_edges(self, export_data):
        """Bordas parseadas corretamente."""
        result = parse_sketchup_json(export_data)

        # Porta Lisa tem 4Lados
        porta = next(p for p in result.pieces if p.persistent_id == "100005")
        assert porta.edges.type_code == "4Lados"
        assert porta.edges.front == "CMBOR22x045BRANCO_TX"
        assert porta.edges.right == "CMBOR22x045BRANCO_TX"

        # Lateral tem 1C
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")
        assert lateral.edges.type_code == "1C"

    def test_parse_fundo_material(self, export_data):
        """Fundo em MDF 6mm CRU."""
        result = parse_sketchup_json(export_data)
        fundo = next(p for p in result.pieces if p.persistent_id == "100004")

        assert fundo.material_code == "MDF_6.0_CRU"
        assert fundo.thickness_real == 6.0

    def test_parse_grain_branco(self, export_data):
        """Pecas Branco TX sem veio → rotacao livre."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        assert lateral.grain == GrainDirection.NONE
        assert lateral.rotation_policy == RotationPolicy.FREE

    def test_parse_grain_carvalho(self, export_data):
        """Pecas Carvalho com veio → rotacao travada."""
        result = parse_sketchup_json(export_data)
        carvalho = next(p for p in result.pieces if p.persistent_id == "200001")

        assert carvalho.grain == GrainDirection.HORIZONTAL
        assert carvalho.rotation_policy == RotationPolicy.GRAIN_LOCKED

    def test_parse_quantity(self, export_data):
        """Quantidade de pecas."""
        result = parse_sketchup_json(export_data)
        porta = next(p for p in result.pieces if p.persistent_id == "100005")
        assert porta.quantity == 3

    def test_parse_upmdraw(self, export_data):
        """Codigo de orientacao."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")
        assert lateral.upmdraw == "FTE1x2"

    def test_parse_classification(self, export_data):
        """Classificacao automatica por tamanho."""
        result = parse_sketchup_json(export_data)
        for piece in result.pieces:
            assert piece.classification is not None
            assert piece.area_mm2 > 0

    def test_parse_all_rectangular(self, export_data):
        """Todas as pecas desta fixture sao retangulares."""
        result = parse_sketchup_json(export_data)
        for piece in result.pieces:
            assert piece.is_rectangular


class TestMachiningParser:
    """Testes de parsing de usinagem."""

    @pytest.fixture
    def export_data(self) -> dict:
        return _load_fixture("sketchup_export.json")

    def test_workers_parsed(self, export_data):
        """Workers da lateral parseados."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        assert len(lateral.machining.workers) == 4

    def test_worker_tool_codes(self, export_data):
        """Tool codes dos workers."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        tool_codes = [w.tool_code for w in lateral.machining.workers]
        assert "f_5mm_twister243" in tool_codes
        assert "f_15mm_tambor_min" in tool_codes
        assert "r_f" in tool_codes

    def test_worker_positions(self, export_data):
        """Posicoes dos workers."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        first_worker = lateral.machining.workers[0]
        assert first_worker.x == 37
        assert first_worker.y == 37
        assert first_worker.depth == 12

    def test_worker_faces(self, export_data):
        """Faces dos workers."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        faces = [w.face for w in lateral.machining.workers]
        assert "top" in faces
        assert "left" in faces

    def test_worker_side_inference(self, export_data):
        """Side A/B inferido da face."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        for worker in lateral.machining.workers:
            if worker.face == "top":
                assert worker.side == "side_a"
            elif worker.face == "back":
                assert worker.side == "side_b"

    def test_porta_dobradicas(self, export_data):
        """Porta tem 2 furos de dobradica (35mm, face back)."""
        result = parse_sketchup_json(export_data)
        porta = next(p for p in result.pieces if p.persistent_id == "100005")

        assert len(porta.machining.workers) == 2
        for w in porta.machining.workers:
            assert w.tool_code == "f_35mm_dob"
            assert w.face == "back"
            assert w.side == "side_b"

    def test_saw_cut_dimensions(self, export_data):
        """Rasgo de fundo tem length e width."""
        result = parse_sketchup_json(export_data)
        lateral = next(p for p in result.pieces if p.persistent_id == "100001")

        rasgo = next(w for w in lateral.machining.workers if w.tool_code == "r_f")
        assert rasgo.length == 720
        assert rasgo.width == 6
        assert rasgo.depth == 10.5

    def test_pieces_without_machining(self, export_data):
        """Pecas sem usinagem tem lista vazia de workers."""
        result = parse_sketchup_json(export_data)
        fundo = next(p for p in result.pieces if p.persistent_id == "100004")

        assert len(fundo.machining.workers) == 0


class TestParserEdgeCases:
    """Testes de edge cases do parser."""

    def test_empty_json(self):
        """JSON vazio com model_entities vazio."""
        result = parse_sketchup_json({
            "model_entities": {},
            "details_project": {},
            "machining": {},
        })
        assert result.piece_count == 0
        assert len(result.errors) == 0

    def test_missing_details(self):
        """JSON sem details_project."""
        result = parse_sketchup_json({
            "model_entities": {},
        })
        assert result.lote_info["cliente"] == ""

    def test_invalid_piece_no_persistent_id(self):
        """Peca sem persistent_id e ignorada."""
        result = parse_sketchup_json({
            "model_entities": {
                "0": {
                    "upmcode": "CM_BAL",
                    "entities": {
                        "0": {
                            "upmpiece": True,
                            "upmcode": "CM_LAT_DIR",
                            # Sem upmpersistentid
                            "upmdepth": "550",
                            "upmheight": "720",
                            "upmwidth": "18.5",
                            "entities": {},
                        }
                    }
                }
            },
            "machining": {},
        })
        assert result.piece_count == 0

    def test_non_piece_entities_skipped(self):
        """Entidades sem upmpiece=true sao ignoradas."""
        result = parse_sketchup_json({
            "model_entities": {
                "0": {
                    "upmcode": "CM_BAL",
                    "entities": {
                        "0": {
                            "upmcode": "CM_FERRAGEM",
                            # Sem upmpiece
                            "upmpersistentid": "999",
                            "entities": {},
                        }
                    }
                }
            },
            "machining": {},
        })
        assert result.piece_count == 0


# ===================================================================
# API ENDPOINTS
# ===================================================================

class TestJobsAPI:
    """Testes da API de jobs."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        return TestClient(app)

    def test_import_json(self, client):
        """POST /api/v1/jobs/import parseia JSON corretamente."""
        data = _load_fixture("sketchup_export.json")
        response = client.post("/api/v1/jobs/import", json=data)

        assert response.status_code == 200
        body = response.json()

        assert body["piece_count"] == 6
        assert body["total_quantity"] == 8
        assert "MDF_18.5_BRANCO_TX" in body["material_codes"]
        assert body["lote_info"]["cliente"] == "João Silva"
        assert len(body["pieces"]) == 6

    def test_import_invalid_json(self, client):
        """POST sem model_entities retorna 400."""
        response = client.post("/api/v1/jobs/import", json={"foo": "bar"})
        assert response.status_code == 400

    def test_get_job_not_found(self, client):
        """GET /api/v1/jobs/9999 retorna 404."""
        response = client.get("/api/v1/jobs/9999")
        assert response.status_code == 404

    def test_import_then_get(self, client):
        """Importar e depois consultar."""
        data = _load_fixture("sketchup_export.json")
        import_resp = client.post("/api/v1/jobs/import", json=data)
        assert import_resp.status_code == 200

        # O job_id nao e retornado diretamente na versao atual,
        # mas podemos verificar que a importacao funcionou
        body = import_resp.json()
        assert body["piece_count"] > 0

    def test_import_grain_in_response(self, client):
        """Resposta inclui info de veio."""
        data = _load_fixture("sketchup_export.json")
        response = client.post("/api/v1/jobs/import", json=data)
        body = response.json()

        # Verificar que pecas tem info de grain
        pieces = body["pieces"]

        # Branco = sem_veio
        branco_piece = next(p for p in pieces if "BRANCO" in p.get("material_code", ""))
        assert branco_piece["grain"] == "sem_veio"
        assert branco_piece["rotation"] == "free"

        # Carvalho = horizontal
        carvalho_piece = next(p for p in pieces if "CARVALHO" in p.get("material_code", ""))
        assert carvalho_piece["grain"] == "horizontal"
        assert carvalho_piece["rotation"] == "grain"
