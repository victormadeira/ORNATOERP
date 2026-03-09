"""Utilitarios de poligonos — criacao, area, perimetro, bbox, transformacoes.

Funcoes para converter modelos de dominio (Contour, Segment, Hole) em
poligonos Shapely e realizar operacoes geometricas basicas.
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np
from shapely.geometry import Polygon, MultiPolygon, box, Point
from shapely.affinity import rotate, translate
from shapely import ops

from app.core.domain.models import Contour, Hole, Segment
from app.core.geometry.arc_utils import (
    discretize_contour_segments,
    circle_to_polyline,
)


# ---------------------------------------------------------------------------
# Criacao de poligonos
# ---------------------------------------------------------------------------

def segments_to_polygon(segments: list[Segment], holes: list[Hole] | None = None) -> Polygon:
    """Converter segmentos de contorno (line/arc) em Shapely Polygon.

    Args:
        segments: Lista de segmentos do contorno externo
        holes: Lista de furos/vazados internos (opcional)

    Returns:
        Shapely Polygon com o contorno e furos
    """
    # Discretizar contorno externo
    outer_points = discretize_contour_segments(segments, close=True)
    if len(outer_points) < 4:  # minimo 3 pontos + fechamento
        raise ValueError(f"Contorno com pontos insuficientes: {len(outer_points)}")

    # Discretizar furos
    hole_rings = []
    if holes:
        for hole in holes:
            hole_points = _hole_to_points(hole)
            if len(hole_points) >= 4:
                hole_rings.append(hole_points)

    return Polygon(outer_points, hole_rings)


def contour_to_polygon(contour: Contour) -> Polygon:
    """Converter modelo Contour em Shapely Polygon.

    Args:
        contour: Modelo Contour com outer e holes

    Returns:
        Shapely Polygon
    """
    return segments_to_polygon(contour.outer, contour.holes)


def rectangle_polygon(
    width: float,
    height: float,
    origin_x: float = 0,
    origin_y: float = 0,
) -> Polygon:
    """Criar poligono retangular.

    Args:
        width: Largura (eixo X)
        height: Altura (eixo Y)
        origin_x, origin_y: Canto inferior esquerdo

    Returns:
        Shapely Polygon retangular
    """
    return box(origin_x, origin_y, origin_x + width, origin_y + height)


def sheet_polygon(
    length: float,
    width: float,
    trim: float = 0,
) -> Polygon:
    """Criar poligono de chapa com area util (apos refilo).

    Args:
        length: Comprimento total da chapa (mm)
        width: Largura total da chapa (mm)
        trim: Refilo em cada borda (mm)

    Returns:
        Shapely Polygon representando a area util
    """
    return box(trim, trim, length - trim, width - trim)


# ---------------------------------------------------------------------------
# Transformacoes
# ---------------------------------------------------------------------------

def rotate_polygon(poly: Polygon, angle_deg: float, origin: str = "centroid") -> Polygon:
    """Rotacionar poligono.

    Args:
        poly: Poligono Shapely
        angle_deg: Angulo em graus (anti-horario)
        origin: "centroid", "center" ou (x, y)

    Returns:
        Poligono rotacionado
    """
    return rotate(poly, angle_deg, origin=origin)


def translate_polygon(poly: Polygon, dx: float, dy: float) -> Polygon:
    """Transladar poligono.

    Args:
        poly: Poligono Shapely
        dx, dy: Deslocamento em X e Y

    Returns:
        Poligono transladado
    """
    return translate(poly, xoff=dx, yoff=dy)


def place_polygon(
    poly: Polygon,
    x: float,
    y: float,
    rotation_deg: float = 0,
) -> Polygon:
    """Posicionar poligono: rotacionar na origem e depois transladar.

    Usado para colocar uma peca na chapa. O poligono da peca e definido
    com origem em (0, 0). Primeiro rotaciona, depois translada.

    Args:
        poly: Poligono da peca (origem em 0,0)
        x, y: Posicao na chapa
        rotation_deg: Rotacao em graus

    Returns:
        Poligono posicionado na chapa
    """
    result = poly
    if rotation_deg != 0:
        result = rotate(result, rotation_deg, origin=(0, 0))
    if x != 0 or y != 0:
        result = translate(result, xoff=x, yoff=y)
    return result


def normalize_polygon(poly: Polygon) -> Polygon:
    """Normalizar poligono: mover para origem (0,0) no canto inferior esquerdo.

    Args:
        poly: Poligono Shapely

    Returns:
        Poligono com bounding box iniciando em (0, 0)
    """
    minx, miny, _, _ = poly.bounds
    return translate(poly, xoff=-minx, yoff=-miny)


# ---------------------------------------------------------------------------
# Medidas
# ---------------------------------------------------------------------------

def polygon_area(poly: Polygon) -> float:
    """Area do poligono (mm²)."""
    return poly.area


def polygon_perimeter(poly: Polygon) -> float:
    """Perimetro do poligono (mm)."""
    return poly.length


def bounding_box(poly: Polygon) -> tuple[float, float, float, float]:
    """Bounding box do poligono: (minx, miny, maxx, maxy)."""
    return poly.bounds


def bounding_box_dimensions(poly: Polygon) -> tuple[float, float]:
    """Dimensoes do bounding box: (largura, altura)."""
    minx, miny, maxx, maxy = poly.bounds
    return (maxx - minx, maxy - miny)


def centroid(poly: Polygon) -> tuple[float, float]:
    """Centroide do poligono."""
    c = poly.centroid
    return (c.x, c.y)


def convex_hull_area(poly: Polygon) -> float:
    """Area do convex hull (envoltoria convexa)."""
    return poly.convex_hull.area


def rectangularity(poly: Polygon) -> float:
    """Indice de retangularidade: area / area_bbox. 1.0 = perfeitamente retangular."""
    bb_area = (poly.bounds[2] - poly.bounds[0]) * (poly.bounds[3] - poly.bounds[1])
    if bb_area <= 0:
        return 0
    return poly.area / bb_area


def aspect_ratio(poly: Polygon) -> float:
    """Razao de aspecto: max_dim / min_dim. 1.0 = quadrado."""
    w, h = bounding_box_dimensions(poly)
    if min(w, h) <= 0:
        return float("inf")
    return max(w, h) / min(w, h)


def is_approximately_rectangular(poly: Polygon, tolerance: float = 0.98) -> bool:
    """Verificar se o poligono e aproximadamente retangular.

    Args:
        poly: Poligono Shapely
        tolerance: Limite minimo de retangularidade (0-1)

    Returns:
        True se retangularidade >= tolerance
    """
    return rectangularity(poly) >= tolerance


# ---------------------------------------------------------------------------
# Simetria
# ---------------------------------------------------------------------------

def is_symmetric_180(poly: Polygon, tolerance: float = 1.0) -> bool:
    """Verificar se o poligono e simetrico sob rotacao de 180 graus.

    Util para deduplicar rotacoes: se simetrico, 0 e 180 sao equivalentes.

    Args:
        poly: Poligono normalizado (origem em 0,0)
        tolerance: Tolerancia em mm para considerar simetrico

    Returns:
        True se o poligono rotacionado 180 e equivalente
    """
    rotated = rotate(poly, 180, origin="centroid")
    return poly.symmetric_difference(rotated).area < tolerance * tolerance


def is_square(width: float, height: float, tolerance: float = 1.0) -> bool:
    """Verificar se as dimensoes formam um quadrado."""
    return abs(width - height) < tolerance


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _hole_to_points(hole: Hole) -> list[tuple[float, float]]:
    """Converter Hole em lista de pontos para ring interior."""
    if hole.type == "circle" and hole.cx is not None and hole.cy is not None and hole.r is not None:
        return circle_to_polyline(hole.cx, hole.cy, hole.r)
    elif hole.type == "polygon" and hole.segments:
        return discretize_contour_segments(hole.segments, close=True)
    return []
