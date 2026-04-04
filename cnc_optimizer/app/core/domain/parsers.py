"""Parser de JSON exportado pelo SketchUp (motor_export.rb).

Converte o JSON de 3 secoes (model_entities, details_project, machining)
em modelos Pydantic do dominio (Piece, Worker, Contour, etc.).

Port do parsePluginJSON() de cnc.js para Python.
"""

from __future__ import annotations

import re
import logging
from typing import Any, Optional

from app.core.domain.models import (
    Piece, Contour, Segment, Hole, Worker, MachiningData,
    EdgeBands,
)
from app.core.domain.enums import GrainDirection, RotationPolicy
from app.core.domain.materials import (
    infer_grain_from_material,
    extract_thickness_from_code,
    extract_finish_from_code,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Resultado do parse
# ---------------------------------------------------------------------------

class ParseResult:
    """Resultado do parse do JSON SketchUp."""

    def __init__(self):
        self.pieces: list[Piece] = []
        self.lote_info: dict[str, str] = {}
        self.warnings: list[str] = []
        self.errors: list[str] = []

    @property
    def piece_count(self) -> int:
        return len(self.pieces)

    @property
    def total_quantity(self) -> int:
        return sum(p.quantity for p in self.pieces)

    @property
    def material_codes(self) -> set[str]:
        return {p.material_code for p in self.pieces if p.material_code}


# ---------------------------------------------------------------------------
# Parser principal
# ---------------------------------------------------------------------------

def parse_sketchup_json(data: dict[str, Any]) -> ParseResult:
    """Parsear JSON exportado pelo SketchUp (motor_export.rb).

    O JSON tem 3 secoes:
    - model_entities: hierarquia modulo → peca → sub-entidades
    - details_project: info do projeto (cliente, vendedor, etc.)
    - machining: dados CNC por persistent_id

    Args:
        data: JSON completo deserializado

    Returns:
        ParseResult com pecas, info do lote, avisos e erros
    """
    result = ParseResult()

    # 1. Extrair info do projeto
    details = data.get("details_project", {})
    result.lote_info = _parse_details(details)

    # 2. Extrair secao de usinagem (indexada por persistent_id)
    machining_section = data.get("machining", {})

    # 3. Iterar model_entities (modulos → pecas)
    model_entities = data.get("model_entities", {})
    piece_id = 1

    for _mod_key, modulo in model_entities.items():
        if not isinstance(modulo, dict):
            continue

        # Info do modulo
        mod_desc = _str(modulo, "upmmasterdescription") or _str(modulo, "upmdescription", "")
        mod_id = _int(modulo, "upmmasterid", 0)

        # Sub-entidades do modulo (pecas)
        entities = modulo.get("entities", {})
        if not isinstance(entities, dict):
            continue

        for _peca_key, ent in entities.items():
            if not isinstance(ent, dict):
                continue

            # Filtrar: so processar pecas (upmpiece=true)
            if not ent.get("upmpiece", False):
                continue

            try:
                piece = _parse_piece_entity(
                    ent, piece_id, mod_desc, mod_id, machining_section
                )
                if piece is not None:
                    result.pieces.append(piece)
                    piece_id += 1
            except Exception as e:
                desc = _str(ent, "upmdescription", "???")
                result.errors.append(f"Erro ao parsear peca '{desc}': {e}")
                logger.error(f"Erro ao parsear peca '{desc}': {e}")

    # 4. Numerar e classificar
    for piece in result.pieces:
        piece.compute_area()
        piece.compute_perimeter()
        piece.classify()

    return result


# ---------------------------------------------------------------------------
# Parse de uma peca individual
# ---------------------------------------------------------------------------

def _parse_piece_entity(
    ent: dict,
    piece_id: int,
    mod_desc: str,
    mod_id: int,
    machining_section: dict,
) -> Optional[Piece]:
    """Parsear uma entidade de peca do model_entities.

    Args:
        ent: Dicionario da entidade peca
        piece_id: ID sequencial
        mod_desc: Descricao do modulo pai
        mod_id: ID do modulo pai
        machining_section: Secao machining indexada por persistent_id

    Returns:
        Piece ou None se invalida
    """
    persistent_id = str(ent.get("upmpersistentid", ""))
    if not persistent_id:
        return None

    # Sub-entidades: panel, edges, hardware, machining ops
    sub_entities = ent.get("entities", {})
    panel_data = _find_panel(sub_entities)

    # Extrair dimensoes do panel (preferencial) ou fallback
    comprimento, largura, espessura = _extract_dimensions(ent, panel_data)

    if comprimento <= 0 or largura <= 0:
        return None

    # Material
    material_code = ""
    material_name = ""
    finish = ""

    if panel_data:
        material_code = (
            _str(panel_data, "upmmaterialcode")
            or _str(panel_data, "upmcode", "")
        )
        material_name = _str(panel_data, "upmdescription", "")

    if not material_code:
        material_code = _str(ent, "upmfinish", "")

    if material_code:
        finish = extract_finish_from_code(material_code)

    # Espessura do material_code se nao encontrou no panel
    if espessura <= 0 and material_code:
        espessura = extract_thickness_from_code(material_code) or 18.5

    # Bordas
    edges = EdgeBands(
        front=_str(ent, "upmedgeside3", ""),
        back=_str(ent, "upmedgeside4", ""),
        left=_str(ent, "upmedgeside2", ""),
        right=_str(ent, "upmedgeside1", ""),
        type_code=_str(ent, "upmedgesidetype", ""),
    )

    # Veio e rotacao
    upmdraw = _str(ent, "upmdraw", "")
    grain = infer_grain_from_material(material_code, finish)
    rotation_policy = (
        RotationPolicy.FREE if grain == GrainDirection.NONE
        else RotationPolicy.GRAIN_LOCKED
    )

    # Contorno (pecas nao-retangulares)
    contour = _parse_contour(ent.get("contour"))
    is_rectangular = contour is None

    # Usinagem (machining section)
    machining_data = _parse_machining(persistent_id, machining_section, ent)

    # Se machining tem contorno e a peca nao, usar o do machining
    if is_rectangular and machining_data.contour is not None:
        contour = machining_data.contour
        is_rectangular = False

    piece = Piece(
        id=piece_id,
        persistent_id=persistent_id,
        upmcode=_str(ent, "upmcode", "CM_PCA"),
        description=_str(ent, "upmdescription", ""),
        module_desc=_str(ent, "upmmasterdescription") or mod_desc,
        module_id=_int(ent, "upmmasterid") or mod_id,
        product_final=_str(ent, "upmproductfinal", ""),
        material=material_name,
        material_code=material_code,
        thickness_nominal=_infer_nominal_thickness(espessura),
        thickness_real=espessura,
        finish=finish,
        length=comprimento,
        width=largura,
        quantity=_int(ent, "upmquantity", 1),
        upmdraw=upmdraw,
        grain=grain,
        rotation_policy=rotation_policy,
        contour=contour,
        is_rectangular=is_rectangular,
        edges=edges,
        machining=machining_data,
    )

    return piece


# ---------------------------------------------------------------------------
# Extrair dimensoes
# ---------------------------------------------------------------------------

def _extract_dimensions(
    ent: dict, panel_data: Optional[dict]
) -> tuple[float, float, float]:
    """Extrair comprimento, largura, espessura de uma entidade peca.

    Prioridade:
    1. Panel sub-entity (upmcutlength, upmcutwidth, upmcutthickness)
    2. Sorting descendente de [upmheight, upmdepth, upmwidth]

    Returns:
        (comprimento, largura, espessura) em mm
    """
    comprimento = 0.0
    largura = 0.0
    espessura = 0.0

    if panel_data:
        comprimento = (
            _float(panel_data, "upmcutlength")
            or _float(panel_data, "upmlength", 0)
        )
        largura = (
            _float(panel_data, "upmcutwidth")
            or _float(panel_data, "upmwidth", 0)
        )
        espessura = (
            _float(panel_data, "upmcutthickness")
            or _float(panel_data, "upmrealthickness")
            or _float(panel_data, "upmthickness", 0)
        )

    # Fallback: ordenar dimensoes da entidade
    if comprimento <= 0 or largura <= 0:
        h = _float(ent, "upmheight", 0)
        d = _float(ent, "upmdepth", 0)
        w = _float(ent, "upmwidth", 0)
        dims = sorted([h, d, w], reverse=True)

        if len(dims) >= 3:
            if comprimento <= 0:
                comprimento = dims[0]
            if largura <= 0:
                largura = dims[1]
            if espessura <= 0:
                espessura = dims[2]

    return comprimento, largura, espessura


def _find_panel(sub_entities: dict) -> Optional[dict]:
    """Encontrar sub-entidade panel (upmfeedstockpanel=true)."""
    if not isinstance(sub_entities, dict):
        return None

    for _key, sub in sub_entities.items():
        if isinstance(sub, dict) and sub.get("upmfeedstockpanel"):
            return sub
    return None


# ---------------------------------------------------------------------------
# Parse de contorno
# ---------------------------------------------------------------------------

def _parse_contour(contour_data: Any) -> Optional[Contour]:
    """Parsear dados de contorno (outer + holes).

    Args:
        contour_data: Dict com 'outer' e 'holes', ou None

    Returns:
        Contour ou None se retangular
    """
    if contour_data is None:
        return None

    if not isinstance(contour_data, dict):
        return None

    outer_segs = contour_data.get("outer", [])
    if not outer_segs or not isinstance(outer_segs, list):
        return None

    # Parsear segmentos externos
    segments = []
    for seg in outer_segs:
        if not isinstance(seg, dict):
            continue
        segments.append(_parse_segment(seg))

    if len(segments) < 3:
        return None

    # Parsear furos
    holes = []
    for hole_data in contour_data.get("holes", []):
        if not isinstance(hole_data, dict):
            continue
        hole = _parse_hole(hole_data)
        if hole is not None:
            holes.append(hole)

    return Contour(outer=segments, holes=holes)


def _parse_segment(seg: dict) -> Segment:
    """Parsear um segmento individual (line ou arc)."""
    seg_type = seg.get("type", "line")

    return Segment(
        type=seg_type,
        x1=_float(seg, "x1", 0),
        y1=_float(seg, "y1", 0),
        x2=_float(seg, "x2", 0),
        y2=_float(seg, "y2", 0),
        cx=_float_or_none(seg, "cx"),
        cy=_float_or_none(seg, "cy"),
        r=_float_or_none(seg, "r"),
        dir=seg.get("dir"),
    )


def _parse_hole(hole_data: dict) -> Optional[Hole]:
    """Parsear um furo/vazado (circle ou polygon)."""
    hole_type = hole_data.get("type", "")

    if hole_type == "circle":
        cx = _float_or_none(hole_data, "cx")
        cy = _float_or_none(hole_data, "cy")
        r = _float_or_none(hole_data, "r")
        if cx is not None and cy is not None and r is not None:
            return Hole(type="circle", cx=cx, cy=cy, r=r)

    elif hole_type == "polygon":
        segs_data = hole_data.get("segments", [])
        segments = [_parse_segment(s) for s in segs_data if isinstance(s, dict)]
        if len(segments) >= 3:
            return Hole(type="polygon", segments=segments)

    return None


# ---------------------------------------------------------------------------
# Parse de usinagem (machining)
# ---------------------------------------------------------------------------

def _parse_machining(
    persistent_id: str,
    machining_section: dict,
    ent: dict,
) -> MachiningData:
    """Parsear dados de usinagem da secao machining.

    Args:
        persistent_id: ID da peca
        machining_section: Secao machining completa
        ent: Entidade peca (para fallback de contorno)

    Returns:
        MachiningData com workers e contorno
    """
    mach_entry = machining_section.get(persistent_id, {})
    if not isinstance(mach_entry, dict):
        return MachiningData()

    code = str(mach_entry.get("code", f"{persistent_id}A"))

    # Workers (operacoes CNC)
    workers = []
    workers_data = mach_entry.get("workers", {})
    if isinstance(workers_data, dict):
        for _key, w in workers_data.items():
            if isinstance(w, dict):
                worker = _parse_worker(w)
                workers.append(worker)

    # Bordas
    borders = mach_entry.get("borders", [])
    if not isinstance(borders, list):
        borders = []

    # Contorno (pode vir do machining ou da entidade)
    contour = _parse_contour(mach_entry.get("contour"))
    if contour is None:
        contour = _parse_contour(ent.get("contour"))

    return MachiningData(
        code=code,
        workers=workers,
        contour=contour,
        borders=[str(b) for b in borders],
    )


def _parse_worker(w: dict) -> Worker:
    """Parsear um worker individual (operacao CNC).

    Suporta dois formatos de campo:
    - Ornato nativo: x, y, face, corner_radius
    - WPS export:    position_x, position_y, quadrant, cornerradius
    """
    # Face: aceitar "face" (Ornato) ou "quadrant" (WPS)
    face = str(w.get("face", ""))
    if not face:
        quadrant = str(w.get("quadrant", ""))
        face = _quadrant_to_face(quadrant)

    # Inferir side (A ou B) com base na face
    side = _infer_side_from_face(face)

    # Coordenadas: aceitar x/y (Ornato) ou position_x/position_y (WPS)
    x = _float(w, "x", 0) or _float(w, "position_x", 0)
    y = _float(w, "y", 0) or _float(w, "position_y", 0)

    # Corner radius: aceitar corner_radius (Ornato) ou cornerradius (WPS)
    cr = _float_or_none(w, "corner_radius")
    if cr is None:
        cr = _float_or_none(w, "cornerradius")

    # Depth: aceitar depth ou usedepth (WPS)
    depth = _float(w, "depth", 0) or _float(w, "usedepth", 5)

    # Diameter: campo direto ou width_tool (WPS)
    diameter = _float_or_none(w, "diameter")
    if diameter is None:
        diameter = _float_or_none(w, "width_tool")

    return Worker(
        category=str(w.get("category", "")),
        tool_code=str(w.get("tool", "")),
        face=face,
        side=side,
        x=x,
        y=y,
        depth=depth,
        length=_float_or_none(w, "length"),
        width=_float_or_none(w, "width"),
        diameter=diameter,
        corner_radius=cr,
    )


def _quadrant_to_face(quadrant: str) -> str:
    """Converter quadrant WPS para face Ornato.

    WPS usa: top, bottom, left, right, back, front
    Ornato usa: top, bottom, left, right, back, front, top_edge, bottom_edge
    """
    mapping = {
        "top": "top",
        "bottom": "bottom",
        "left": "left",
        "right": "right",
        "back": "back",
        "front": "front",
    }
    return mapping.get(quadrant.lower(), quadrant.lower() or "top")


def _infer_side_from_face(face: str) -> str:
    """Inferir side A/B a partir da face do worker.

    Faces superiores/frontais -> side_a
    Faces inferiores/traseiras -> side_b

    Args:
        face: Nome da face ("top", "bottom", "back", etc.)

    Returns:
        "side_a" ou "side_b"
    """
    side_b_faces = {"bottom", "back", "bottom_edge"}
    return "side_b" if face in side_b_faces else "side_a"


# ---------------------------------------------------------------------------
# Parse info do projeto
# ---------------------------------------------------------------------------

def _parse_details(details: dict) -> dict[str, str]:
    """Parsear secao details_project."""
    return {
        "cliente": (
            _str(details, "client_name")
            or _str(details, "client")
            or _str(details, "cliente", "")
        ),
        "projeto": (
            _str(details, "project_name")
            or _str(details, "project")
            or _str(details, "projeto", "")
        ),
        "codigo": (
            _str(details, "project_code")
            or _str(details, "my_code")
            or _str(details, "codigo", "")
        ),
        "vendedor": (
            _str(details, "seller_name")
            or _str(details, "seller")
            or _str(details, "vendedor", "")
        ),
    }


# ---------------------------------------------------------------------------
# Helpers de conversao
# ---------------------------------------------------------------------------

def _str(d: dict, key: str, default: str = "") -> str:
    """Extrair string de dict com fallback."""
    val = d.get(key)
    if val is None:
        return default
    return str(val).strip()


def _int(d: dict, key: str, default: int = 0) -> int:
    """Extrair inteiro de dict com fallback."""
    val = d.get(key)
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _float(d: dict, key: str, default: float = 0.0) -> float:
    """Extrair float de dict com fallback."""
    val = d.get(key)
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _float_or_none(d: dict, key: str) -> Optional[float]:
    """Extrair float de dict, retornando None se ausente."""
    val = d.get(key)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _infer_nominal_thickness(real: float) -> float:
    """Inferir espessura nominal a partir da real.

    Mapeamento inverso do thickness_map.
    """
    nominal_map = {
        6.0: 6, 6.5: 6,
        9.0: 9, 9.5: 9,
        12.0: 12, 12.5: 12,
        15.0: 15, 15.5: 15,
        18.0: 18, 18.5: 18,
        25.0: 25, 25.5: 25,
        31.0: 25,  # engrossado
    }
    return nominal_map.get(real, real)
