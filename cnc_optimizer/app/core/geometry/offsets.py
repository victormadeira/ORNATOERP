"""Offset de poligonos com Pyclipper.

Operacoes de offset (expansao/contracao) de poligonos
para compensacao de kerf (serra) e raio de fresa.
"""

from __future__ import annotations

import pyclipper
from shapely.geometry import Polygon, MultiPolygon

from app.core.geometry.validation import fix_polygon


# ---------------------------------------------------------------------------
# Conversao Shapely <-> Pyclipper
# ---------------------------------------------------------------------------

PYCLIPPER_SCALE = 1000  # Pyclipper trabalha com inteiros; 1000 = 3 casas decimais


def _shapely_to_pyclipper(poly: Polygon) -> list[list[tuple[int, int]]]:
    """Converter Shapely Polygon para formato Pyclipper (inteiros escalados).

    Args:
        poly: Poligono Shapely

    Returns:
        Lista de paths (exterior + furos) em coordenadas inteiras
    """
    paths = []

    # Exterior (sem o ultimo ponto, que e igual ao primeiro no Shapely)
    ext_coords = list(poly.exterior.coords)[:-1]
    paths.append(
        [(int(x * PYCLIPPER_SCALE), int(y * PYCLIPPER_SCALE)) for x, y in ext_coords]
    )

    # Furos
    for hole in poly.interiors:
        hole_coords = list(hole.coords)[:-1]
        paths.append(
            [(int(x * PYCLIPPER_SCALE), int(y * PYCLIPPER_SCALE)) for x, y in hole_coords]
        )

    return paths


def _pyclipper_to_shapely(paths: list[list[tuple[int, int]]]) -> Polygon | None:
    """Converter paths Pyclipper de volta para Shapely Polygon.

    O primeiro path e o exterior, os demais sao furos.
    Se nenhum path, retorna None.

    Args:
        paths: Lista de paths em coordenadas inteiras

    Returns:
        Shapely Polygon ou None
    """
    if not paths:
        return None

    # Desescalar
    scaled_paths = []
    for path in paths:
        scaled = [(x / PYCLIPPER_SCALE, y / PYCLIPPER_SCALE) for x, y in path]
        scaled_paths.append(scaled)

    if len(scaled_paths) == 1:
        return Polygon(scaled_paths[0])

    # Encontrar o path com maior area (exterior)
    # e os demais sao furos
    areas = []
    for path in scaled_paths:
        if len(path) >= 3:
            p = Polygon(path)
            areas.append(abs(p.area))
        else:
            areas.append(0)

    max_idx = areas.index(max(areas))
    exterior = scaled_paths[max_idx]
    holes = [p for i, p in enumerate(scaled_paths) if i != max_idx and len(p) >= 3]

    return Polygon(exterior, holes)


# ---------------------------------------------------------------------------
# Operacoes de Offset
# ---------------------------------------------------------------------------

def offset_polygon(
    poly: Polygon,
    distance: float,
    join_type: str = "round",
    miter_limit: float = 2.0,
    arc_tolerance: float = 0.25,
) -> Polygon | None:
    """Aplicar offset (expansao/contracao) a um poligono.

    Usa Pyclipper (Clipper library) para offset robusto.

    Args:
        poly: Poligono original
        distance: Distancia do offset em mm.
                  Positivo = expansao (outward)
                  Negativo = contracao (inward)
        join_type: Tipo de juncao nos vertices:
                   "round" (arredondado), "square", "miter"
        miter_limit: Limite de miter (apenas para join_type="miter")
        arc_tolerance: Tolerancia para arcos em vertices arredondados (mm)

    Returns:
        Poligono com offset aplicado, ou None se resultado vazio
    """
    if abs(distance) < 0.001:
        return poly

    # Configurar join type
    jt_map = {
        "round": pyclipper.JT_ROUND,
        "square": pyclipper.JT_SQUARE,
        "miter": pyclipper.JT_MITER,
    }
    jt = jt_map.get(join_type, pyclipper.JT_ROUND)

    # Converter para Pyclipper
    paths = _shapely_to_pyclipper(poly)

    # Criar offset
    pco = pyclipper.PyclipperOffset(miter_limit, arc_tolerance * PYCLIPPER_SCALE)
    pco.AddPaths(paths, jt, pyclipper.ET_CLOSEDPOLYGON)

    # Executar offset
    result_paths = pco.Execute(int(distance * PYCLIPPER_SCALE))

    if not result_paths:
        return None

    # Converter de volta para Shapely
    result = _pyclipper_to_shapely(result_paths)
    if result is not None and not result.is_valid:
        result = fix_polygon(result)

    return result


def offset_for_kerf(poly: Polygon, kerf: float) -> Polygon | None:
    """Contrair poligono para compensar kerf (largura da serra).

    O kerf e a largura do material removido pela serra/fresa.
    Para que a peca fique no tamanho correto, o contorno de corte
    e deslocado para dentro por metade do kerf.

    Args:
        poly: Poligono original (tamanho nominal da peca)
        kerf: Largura total do kerf em mm

    Returns:
        Poligono contraido por kerf/2, ou None se resultado vazio
    """
    return offset_polygon(poly, -kerf / 2.0)


def offset_for_cutter(poly: Polygon, cutter_diameter: float) -> Polygon | None:
    """Contrair poligono para compensar raio da fresa.

    Para contorno de corte, a fresa precisa andar por fora da peca.
    O centro da fresa fica a raio de distancia do contorno.

    Para contornos INTERNOS (furos, pockets), a fresa anda por dentro,
    entao o offset e negativo (contracao).

    Args:
        poly: Poligono do contorno
        cutter_diameter: Diametro da fresa em mm

    Returns:
        Poligono com compensacao de raio aplicada
    """
    return offset_polygon(poly, -cutter_diameter / 2.0)


def expand_for_cutter(poly: Polygon, cutter_diameter: float) -> Polygon | None:
    """Expandir poligono para compensar raio da fresa (contorno externo).

    Para corte externo, a fresa deve andar por FORA do contorno.

    Args:
        poly: Poligono do contorno da peca
        cutter_diameter: Diametro da fresa em mm

    Returns:
        Poligono expandido por raio da fresa
    """
    return offset_polygon(poly, cutter_diameter / 2.0)


def offset_for_spacing(poly: Polygon, spacing: float) -> Polygon:
    """Expandir poligono para criar espacamento entre pecas.

    Usado no nesting para garantir distancia minima entre pecas.

    Args:
        poly: Poligono da peca
        spacing: Espacamento desejado em mm (tipicamente metade do kerf)

    Returns:
        Poligono expandido. Se falhar, retorna original.
    """
    result = offset_polygon(poly, spacing / 2.0)
    return result if result is not None else poly


# ---------------------------------------------------------------------------
# Operacoes booleanas com Pyclipper
# ---------------------------------------------------------------------------

def boolean_difference(subject: Polygon, clip: Polygon) -> Polygon | MultiPolygon | None:
    """Subtrair clip de subject (A - B).

    Usado para subtrair pecas cortadas da chapa restante.

    Args:
        subject: Poligono base (chapa)
        clip: Poligono a subtrair (peca cortada)

    Returns:
        Resultado da subtracão, ou None se vazio
    """
    # Usar Shapely diretamente — mais simples para diferenca
    result = subject.difference(clip)

    if result.is_empty:
        return None

    if isinstance(result, (Polygon, MultiPolygon)):
        return result

    # Se resultado e GeometryCollection, extrair poligonos
    from shapely.geometry import GeometryCollection
    if isinstance(result, GeometryCollection):
        polygons = [g for g in result.geoms if isinstance(g, Polygon) and g.area > 0]
        if not polygons:
            return None
        if len(polygons) == 1:
            return polygons[0]
        return MultiPolygon(polygons)

    return None


def boolean_union(polys: list[Polygon]) -> Polygon | MultiPolygon | None:
    """Unir lista de poligonos.

    Args:
        polys: Lista de poligonos

    Returns:
        Uniao de todos os poligonos
    """
    if not polys:
        return None

    from shapely.ops import unary_union
    result = unary_union(polys)

    if result.is_empty:
        return None

    return result


def boolean_intersection(a: Polygon, b: Polygon) -> Polygon | MultiPolygon | None:
    """Interseccao de dois poligonos (A ∩ B).

    Args:
        a: Primeiro poligono
        b: Segundo poligono

    Returns:
        Interseccao ou None se vazio
    """
    result = a.intersection(b)

    if result.is_empty:
        return None

    if isinstance(result, (Polygon, MultiPolygon)):
        return result

    return None
