"""Validacao e correcao de poligonos.

Funcoes para validar, corrigir orientacao, auto-intersecoes,
simplificar e garantir que poligonos estejam prontos para operacoes.
"""

from __future__ import annotations

from shapely.geometry import Polygon, MultiPolygon
from shapely.validation import make_valid

from app.config import settings


def validate_polygon(poly: Polygon) -> Polygon:
    """Validar e corrigir poligono.

    Sequencia de correcoes:
    1. Corrigir auto-intersecoes com buffer(0)
    2. Garantir orientacao CCW para exterior, CW para furos
    3. Simplificar vertices redundantes
    4. Se MultiPolygon resultante, pegar maior area

    Args:
        poly: Poligono possivelmente invalido

    Returns:
        Poligono valido e normalizado
    """
    if poly.is_empty:
        raise ValueError("Poligono vazio")

    # 1. Corrigir auto-intersecoes
    if not poly.is_valid:
        poly = _fix_self_intersection(poly)

    # 2. Garantir orientacao
    poly = fix_orientation(poly)

    # 3. Simplificar
    poly = simplify_polygon(poly, settings.polygon_simplify_tolerance)

    return poly


def is_valid(poly: Polygon) -> bool:
    """Verificar se poligono e valido."""
    return poly.is_valid and not poly.is_empty and poly.area > 0


def fix_orientation(poly: Polygon) -> Polygon:
    """Garantir orientacao correta: exterior CCW, furos CW.

    Shapely segue a convencao: exterior CCW, interior CW.
    `orient()` faz isso automaticamente.

    Args:
        poly: Poligono

    Returns:
        Poligono com orientacao corrigida
    """
    from shapely.geometry import polygon as shapely_polygon
    return shapely_polygon.orient(poly, sign=1.0)


def simplify_polygon(poly: Polygon, tolerance: float = 0.1) -> Polygon:
    """Simplificar poligono removendo vertices redundantes.

    Usa o algoritmo Douglas-Peucker para remover vertices que nao
    alteram significativamente a forma.

    Args:
        poly: Poligono
        tolerance: Tolerancia em mm. Vertices mais proximos que isso
                   da linha entre vizinhos sao removidos.

    Returns:
        Poligono simplificado (preservando topologia)
    """
    simplified = poly.simplify(tolerance, preserve_topology=True)

    # Garantir que a simplificacao nao criou algo invalido
    if simplified.is_valid and simplified.area > 0:
        return simplified
    return poly


def remove_duplicate_vertices(coords: list[tuple[float, float]], tolerance: float = 0.01) -> list[tuple[float, float]]:
    """Remover vertices duplicados consecutivos.

    Args:
        coords: Lista de (x, y)
        tolerance: Distancia minima entre vertices (mm)

    Returns:
        Lista sem duplicados consecutivos
    """
    if len(coords) < 2:
        return coords

    result = [coords[0]]
    for p in coords[1:]:
        dx = p[0] - result[-1][0]
        dy = p[1] - result[-1][1]
        dist_sq = dx * dx + dy * dy
        if dist_sq > tolerance * tolerance:
            result.append(p)

    return result


def ensure_minimum_area(poly: Polygon, min_area: float = 1.0) -> bool:
    """Verificar se poligono tem area minima.

    Args:
        poly: Poligono
        min_area: Area minima em mm²

    Returns:
        True se area >= min_area
    """
    return poly.area >= min_area


def ensure_minimum_dimension(poly: Polygon, min_dim: float = 1.0) -> bool:
    """Verificar se poligono tem dimensao minima.

    Args:
        poly: Poligono
        min_dim: Dimensao minima em mm

    Returns:
        True se ambas dimensoes do bbox >= min_dim
    """
    minx, miny, maxx, maxy = poly.bounds
    return (maxx - minx) >= min_dim and (maxy - miny) >= min_dim


def fix_polygon(poly: Polygon) -> Polygon:
    """Tentar consertar poligono invalido usando varias estrategias.

    Args:
        poly: Poligono possivelmente invalido

    Returns:
        Poligono valido (ou o melhor que conseguimos)
    """
    if poly.is_valid:
        return poly

    # Estrategia 1: buffer(0) — corrige maioria dos problemas
    fixed = poly.buffer(0)
    if isinstance(fixed, Polygon) and fixed.is_valid and fixed.area > 0:
        return fixed

    # Estrategia 2: make_valid (Shapely 2.0+)
    fixed = make_valid(poly)
    if isinstance(fixed, Polygon) and fixed.is_valid:
        return fixed
    if isinstance(fixed, MultiPolygon):
        # Pegar o maior poligono
        largest = max(fixed.geoms, key=lambda g: g.area)
        if isinstance(largest, Polygon) and largest.is_valid:
            return largest

    # Estrategia 3: convex hull como fallback extremo
    hull = poly.convex_hull
    if isinstance(hull, Polygon) and hull.is_valid:
        return hull

    raise ValueError(f"Nao foi possivel corrigir poligono: {poly.wkt[:100]}")


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _fix_self_intersection(poly: Polygon) -> Polygon:
    """Corrigir auto-intersecoes com buffer(0).

    buffer(0) e o metodo padrao do Shapely para resolver
    auto-intersecoes. Pode gerar MultiPolygon; nesse caso,
    retorna o maior fragmento.
    """
    fixed = poly.buffer(0)

    if isinstance(fixed, Polygon):
        return fixed
    elif isinstance(fixed, MultiPolygon):
        # Retornar o maior fragmento
        return max(fixed.geoms, key=lambda g: g.area)
    else:
        # Fallback: retornar original
        return poly
