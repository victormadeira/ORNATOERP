"""Catalogo de materiais e inferencia de propriedades.

Gerencia:
- Mapeamento espessura nominal → real
- Deteccao de veio pelo nome/codigo do material
- Catalogo de materiais conhecidos
- Matching fuzzy de material
"""

from __future__ import annotations

import re
from typing import Optional

from app.core.domain.enums import GrainDirection


# ---------------------------------------------------------------------------
# Espessura: Nominal → Real
# ---------------------------------------------------------------------------

THICKNESS_MAP: dict[float, float] = {
    3: 3.0,
    6: 6.0,
    9: 9.5,
    12: 12.5,
    15: 15.5,
    18: 18.5,
    25: 25.5,
}

# Espessura engrossado (2 chapas coladas)
ENGROSSADO_THICKNESS = 31.0


def nominal_to_real(nominal: float) -> float:
    """Converter espessura nominal para real.

    Args:
        nominal: Espessura nominal em mm (6, 15, 18, 25)

    Returns:
        Espessura real em mm (6.0, 15.5, 18.5, 25.5)
    """
    return THICKNESS_MAP.get(nominal, nominal)


def real_to_nominal(real: float) -> float:
    """Converter espessura real para nominal (inverso).

    Args:
        real: Espessura real em mm

    Returns:
        Espessura nominal em mm
    """
    inverse = {v: k for k, v in THICKNESS_MAP.items()}
    inverse[ENGROSSADO_THICKNESS] = 25  # engrossado vem de 25mm
    return inverse.get(real, real)


# ---------------------------------------------------------------------------
# Deteccao de veio (grain)
# ---------------------------------------------------------------------------

# Materiais SEM veio (lisos, unicor, texturizados sem direcao)
NO_GRAIN_KEYWORDS = [
    "BRANCO", "PRETO", "CINZA", "BEGE", "AREIA",
    "CRU", "CRU_CRU",
    "VERMELHO", "AZUL", "VERDE", "AMARELO", "ROSA", "LARANJA",
    "LINHO", "LINO",
    "CONCRETO", "CIMENTO",
]

# Materiais COM veio (amadeirados — sempre tem direcao)
GRAIN_KEYWORDS = [
    "CARVALHO", "NOGUEIRA", "FREIJO", "FREIJÓ",
    "PINUS", "TECA", "CEDRO", "MOGNO", "JEQUITIBA",
    "IMBUIA", "IPEA", "IPE", "SUCUPIRA",
    "AMENDOA", "AMÊNDOA", "AMENDOIM",
    "CASTANHO", "CASTANHA",
    "ROVERE", "RUSTICO",
    "HANOVER", "HAVANA", "ÁLAMO", "ALAMO",
    "DEMOLIÇÃO", "DEMOLICAO",
    "CANELA", "CHOCOLATE",
    "CARTAGENA", "ARIZONA", "MONTANA",
    "OLMO", "OLIVA", "OLIVEIRA",
    "FAIA", "MAPLE", "ASH",
    "OAK", "WALNUT", "CHERRY", "TEAK",
    "EUCALIPTO", "PEROBA", "CUMARU",
    "LOURO", "CABERNET",
    "MADEIRA",  # generico mas sempre amadeirado
]


def infer_grain_from_material(
    material_code: str,
    finish: str = "",
) -> GrainDirection:
    """Inferir direcao do veio a partir do codigo de material.

    Regra:
    - Se contem keyword de amadeirado → HORIZONTAL (padrao)
    - Se contem keyword de liso → NONE
    - Se nao reconhece → NONE (conservador: permite rotacao livre)

    Args:
        material_code: Codigo do material (ex: "MDF_18.5_CARVALHO_HANOVER")
        finish: Acabamento (ex: "CARVALHO_HANOVER")

    Returns:
        GrainDirection inferida
    """
    # Combinar material_code + finish para busca
    search_text = f"{material_code} {finish}".upper()

    # Verificar keywords de amadeirado primeiro (mais especifico)
    for kw in GRAIN_KEYWORDS:
        if kw in search_text:
            return GrainDirection.HORIZONTAL

    # Verificar keywords sem veio
    for kw in NO_GRAIN_KEYWORDS:
        if kw in search_text:
            return GrainDirection.NONE

    # Default: sem veio (permite rotacao livre — mais otimizacao)
    return GrainDirection.NONE


def has_grain(material_code: str) -> bool:
    """Verificar se material tem veio.

    Shortcut para infer_grain_from_material() != NONE.
    """
    return infer_grain_from_material(material_code) != GrainDirection.NONE


# ---------------------------------------------------------------------------
# Extrair info do material_code
# ---------------------------------------------------------------------------

def extract_thickness_from_code(material_code: str) -> Optional[float]:
    """Extrair espessura do codigo de material.

    Formato: MDF_{espessura}_{acabamento}
    Exemplo: "MDF_18.5_BRANCO_TX" → 18.5

    Args:
        material_code: Codigo completo

    Returns:
        Espessura em mm ou None
    """
    match = re.search(r"_(\d+(?:\.\d+)?)_", material_code)
    if match:
        return float(match.group(1))
    return None


def extract_finish_from_code(material_code: str) -> str:
    """Extrair acabamento do codigo de material.

    Formato: MDF_{espessura}_{acabamento}
    Exemplo: "MDF_18.5_BRANCO_TX" → "BRANCO_TX"

    Args:
        material_code: Codigo completo

    Returns:
        Acabamento ou string vazia
    """
    # Remover prefixo MDF_ e espessura
    match = re.match(r"MDF_\d+(?:\.\d+)?_(.*)", material_code)
    if match:
        return match.group(1)

    # Tentar extrair apos segundo _
    parts = material_code.split("_", 2)
    if len(parts) >= 3:
        return parts[2]

    return ""


def build_material_code(
    thickness_real: float,
    finish: str,
    material_type: str = "MDF",
) -> str:
    """Construir codigo de material padronizado.

    Args:
        thickness_real: Espessura real em mm
        finish: Acabamento (BRANCO_TX, CARVALHO_HANOVER, etc.)
        material_type: Tipo (MDF, etc.)

    Returns:
        Codigo completo: "MDF_18.5_BRANCO_TX"
    """
    # Formatar espessura sem zeros desnecessarios
    if thickness_real == int(thickness_real):
        thick_str = str(int(thickness_real))
    else:
        thick_str = f"{thickness_real:.1f}"

    return f"{material_type}_{thick_str}_{finish}"


# ---------------------------------------------------------------------------
# Matching de material
# ---------------------------------------------------------------------------

def materials_match(
    code_a: str,
    code_b: str,
    strict: bool = True,
) -> bool:
    """Verificar se dois codigos de material sao compativeis.

    Duas pecas so podem ir na mesma chapa se o material for igual.

    Em modo strict: codigos devem ser identicos.
    Em modo fuzzy: compara espessura + acabamento separadamente.

    Args:
        code_a: Primeiro codigo
        code_b: Segundo codigo
        strict: Se True, comparacao exata

    Returns:
        True se materiais sao compativeis
    """
    if strict:
        return code_a.strip().upper() == code_b.strip().upper()

    # Modo fuzzy: extrair espessura e acabamento
    thick_a = extract_thickness_from_code(code_a)
    thick_b = extract_thickness_from_code(code_b)
    finish_a = extract_finish_from_code(code_a).upper()
    finish_b = extract_finish_from_code(code_b).upper()

    if thick_a is None or thick_b is None:
        return False

    # Espessura deve ser igual (ou dentro de tolerancia de 1mm)
    if abs(thick_a - thick_b) > 1.0:
        return False

    # Acabamento deve ser igual
    return finish_a == finish_b


def group_pieces_by_material(
    pieces: list,
) -> dict[str, list]:
    """Agrupar pecas por material_code.

    Pecas so podem ser cortadas na mesma chapa se
    tiverem o mesmo material.

    Args:
        pieces: Lista de pecas (com atributo material_code)

    Returns:
        Dict: material_code → lista de pecas
    """
    groups: dict[str, list] = {}
    for piece in pieces:
        code = piece.material_code.strip().upper()
        if code not in groups:
            groups[code] = []
        groups[code].append(piece)
    return groups


# ---------------------------------------------------------------------------
# Catalogo de materiais conhecidos
# ---------------------------------------------------------------------------

# Chapas padrao disponiveis no mercado
STANDARD_SHEETS = [
    {
        "name": "MDF 6mm Cru",
        "material_code": "MDF_6.0_CRU",
        "thickness_nominal": 6,
        "thickness_real": 6.0,
        "length": 2750,
        "width": 1850,
        "grain": "sem_veio",
    },
    {
        "name": "MDF 15mm Branco TX",
        "material_code": "MDF_15.5_BRANCO_TX",
        "thickness_nominal": 15,
        "thickness_real": 15.5,
        "length": 2750,
        "width": 1850,
        "grain": "sem_veio",
    },
    {
        "name": "MDF 18mm Branco TX",
        "material_code": "MDF_18.5_BRANCO_TX",
        "thickness_nominal": 18,
        "thickness_real": 18.5,
        "length": 2750,
        "width": 1850,
        "grain": "sem_veio",
    },
    {
        "name": "MDF 25mm Branco TX",
        "material_code": "MDF_25.5_BRANCO_TX",
        "thickness_nominal": 25,
        "thickness_real": 25.5,
        "length": 2750,
        "width": 1850,
        "grain": "sem_veio",
    },
    {
        "name": "MDF 18mm Carvalho Hanover",
        "material_code": "MDF_18.5_CARVALHO_HANOVER",
        "thickness_nominal": 18,
        "thickness_real": 18.5,
        "length": 2750,
        "width": 1850,
        "grain": "horizontal",
    },
    {
        "name": "MDF 18mm Nogueira",
        "material_code": "MDF_18.5_NOGUEIRA",
        "thickness_nominal": 18,
        "thickness_real": 18.5,
        "length": 2750,
        "width": 1850,
        "grain": "horizontal",
    },
]


# Larguras de borda (nominal_thickness → edge_width)
EDGE_WIDTH_MAP = {
    6: 10,
    9: 13,
    12: 16,
    15: 19,
    18: 22,
    25: 29,
}


def parse_edge_band_code(code: str) -> dict:
    """Parsear codigo de fita de borda.

    Formato: CMBOR{largura}x{espessura}{acabamento}
    Exemplo: "CMBOR22x045BRANCO_TX"

    Returns:
        {width: int, thickness: float, finish: str}
    """
    match = re.match(r"CMBOR(\d+)x(\d+)(.*)", code)
    if match:
        width = int(match.group(1))
        thickness = int(match.group(2)) / 100.0  # 045 → 0.45
        finish = match.group(3)
        return {"width": width, "thickness": thickness, "finish": finish}

    return {"width": 0, "thickness": 0, "finish": ""}
