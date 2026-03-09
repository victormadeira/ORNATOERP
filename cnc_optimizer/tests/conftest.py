"""Pytest fixtures compartilhadas."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.domain.models import Piece, Sheet, Remnant, MachineConfig, MachineTool
from app.core.domain.enums import GrainDirection, RotationPolicy, SheetType


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def client():
    """TestClient FastAPI para testes de API."""
    return TestClient(app)


@pytest.fixture
def sample_sheet() -> Sheet:
    """Chapa padrao MDF 18mm Branco TX."""
    return Sheet(
        id=1,
        name="MDF 18mm Branco TX",
        type=SheetType.NEW,
        material_code="MDF_18.5_BRANCO_TX",
        thickness_nominal=18,
        thickness_real=18.5,
        length=2750,
        width=1850,
        trim=10,
        grain=GrainDirection.NONE,
        kerf=4,
        price=189.90,
    )


@pytest.fixture
def sample_sheet_grained() -> Sheet:
    """Chapa com veio horizontal."""
    return Sheet(
        id=2,
        name="MDF 18mm Carvalho",
        type=SheetType.NEW,
        material_code="MDF_18.5_CARVALHO_HANOVER",
        thickness_nominal=18,
        thickness_real=18.5,
        length=2750,
        width=1850,
        trim=10,
        grain=GrainDirection.HORIZONTAL,
        kerf=4,
        price=245.00,
    )


@pytest.fixture
def sample_pieces() -> list[Piece]:
    """Lista de pecas de teste (cozinha basica)."""
    return [
        Piece(
            id=1,
            persistent_id="bp_001",
            upmcode="CM_LAT_DIR",
            description="Lateral Direita",
            module_desc="Balcao",
            material_code="MDF_18.5_BRANCO_TX",
            thickness_real=18.5,
            length=720,
            width=550,
            quantity=1,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
        Piece(
            id=2,
            persistent_id="bp_002",
            upmcode="CM_LAT_ESQ",
            description="Lateral Esquerda",
            module_desc="Balcao",
            material_code="MDF_18.5_BRANCO_TX",
            thickness_real=18.5,
            length=720,
            width=550,
            quantity=1,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
        Piece(
            id=3,
            persistent_id="bp_003",
            upmcode="CM_BAS",
            description="Base",
            module_desc="Balcao",
            material_code="MDF_18.5_BRANCO_TX",
            thickness_real=18.5,
            length=1164,
            width=550,
            quantity=1,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
        Piece(
            id=4,
            persistent_id="bp_004",
            upmcode="CM_REG",
            description="Regua",
            module_desc="Balcao",
            material_code="MDF_18.5_BRANCO_TX",
            thickness_real=18.5,
            length=1164,
            width=100,
            quantity=2,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
        Piece(
            id=5,
            persistent_id="bp_005",
            upmcode="CM_PRA",
            description="Prateleira",
            module_desc="Balcao",
            material_code="MDF_18.5_BRANCO_TX",
            thickness_real=18.5,
            length=1164,
            width=530,
            quantity=2,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
        Piece(
            id=6,
            persistent_id="bp_006",
            upmcode="CM_FUN_VER",
            description="Fundo",
            module_desc="Balcao",
            material_code="MDF_6.0_BRANCO_TX_CRU",
            thickness_real=6.0,
            thickness_nominal=6,
            length=716,
            width=1160,
            quantity=1,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
        Piece(
            id=7,
            persistent_id="bp_007",
            upmcode="CM_POR_LIS",
            description="Porta",
            module_desc="Balcao",
            material_code="MDF_18.5_BRANCO_TX",
            thickness_real=18.5,
            length=716,
            width=597,
            quantity=2,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        ),
    ]


@pytest.fixture
def sample_remnant() -> Remnant:
    """Retalho de teste."""
    return Remnant(
        id=1,
        name="Retalho MDF 18mm",
        material_code="MDF_18.5_BRANCO_TX",
        thickness_real=18.5,
        length=1200,
        width=800,
        available=True,
        origin_batch="OP-0003",
    )


@pytest.fixture
def sample_machine() -> MachineConfig:
    """Configuracao de maquina CNC padrao."""
    return MachineConfig(
        id=1,
        name="CNC Ornato",
        gcode_header="%\nG90 G54 G17\nG0 Z30.000",
        gcode_footer="G0 Z200.000\nM5\nM30\n%",
        z_safe=30,
        z_approach=2.0,
        z_origin="mesa",
        cut_speed=4000,
        plunge_speed=1500,
        rpm_default=12000,
        use_onion_skin=True,
        onion_thickness=0.5,
        use_tabs=False,
        use_lead_in=True,
        lead_in_radius=5,
        use_ramp=True,
        ramp_angle=3.0,
    )


@pytest.fixture
def sample_tools() -> list[MachineTool]:
    """Magazine de ferramentas padrao."""
    return [
        MachineTool(
            code="T01", name="Fresa 6mm compressao",
            type="fresa_compressao", diameter=6, doc=5, rpm=18000,
            cut_speed=5000, tool_code="fresa_6mm",
        ),
        MachineTool(
            code="T02", name="Broca 5mm",
            type="broca", diameter=5, doc=None, rpm=12000,
            cut_speed=3000, tool_code="f_5mm_twister243",
        ),
        MachineTool(
            code="T03", name="Broca 8mm",
            type="broca", diameter=8, doc=None, rpm=10000,
            cut_speed=3000, tool_code="f_8mm_cavilha",
        ),
        MachineTool(
            code="T04", name="Forstner 15mm",
            type="forstner", diameter=15, doc=None, rpm=8000,
            cut_speed=2000, tool_code="f_15mm_tambor_min",
        ),
        MachineTool(
            code="T05", name="Forstner 35mm",
            type="forstner", diameter=35, doc=None, rpm=4000,
            cut_speed=1500, tool_code="f_35mm_dob",
        ),
    ]


def load_fixture(name: str) -> dict:
    """Carregar fixture JSON de tests/fixtures/."""
    path = FIXTURES_DIR / name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}
