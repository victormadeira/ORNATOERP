"""Utilitarios para conversao de arcos em polilinhas.

Converte segmentos de arco (formato SketchUp: cx, cy, r, dir) em
sequencias de pontos para criar poligonos Shapely.
"""

from __future__ import annotations

import math
from typing import Optional

from app.core.domain.models import Segment
from app.config import settings


def arc_to_polyline(
    cx: float,
    cy: float,
    r: float,
    start_angle: float,
    end_angle: float,
    direction: str = "ccw",
    num_segments: Optional[int] = None,
) -> list[tuple[float, float]]:
    """Converter arco em lista de pontos (polilinha).

    Args:
        cx, cy: Centro do arco
        r: Raio
        start_angle: Angulo inicial (radianos)
        end_angle: Angulo final (radianos)
        direction: "cw" (horario) ou "ccw" (anti-horario)
        num_segments: Numero de segmentos. None = proporcional ao angulo.

    Returns:
        Lista de (x, y) ao longo do arco, incluindo start e end.
    """
    if r <= 0:
        return [(cx, cy)]

    # Calcular angulo varrido
    if direction == "cw":
        # Horario: start -> end diminuindo angulo
        sweep = start_angle - end_angle
        if sweep <= 0:
            sweep += 2 * math.pi
    else:
        # Anti-horario: start -> end aumentando angulo
        sweep = end_angle - start_angle
        if sweep <= 0:
            sweep += 2 * math.pi

    # Numero de segmentos proporcional ao angulo
    if num_segments is None:
        full_circle_segs = settings.arc_resolution
        num_segments = max(4, int(full_circle_segs * sweep / (2 * math.pi)))

    points = []
    for i in range(num_segments + 1):
        t = i / num_segments
        if direction == "cw":
            angle = start_angle - t * sweep
        else:
            angle = start_angle + t * sweep

        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        points.append((x, y))

    return points


def segment_arc_to_polyline(
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    cx: float,
    cy: float,
    r: float,
    direction: str = "ccw",
    num_segments: Optional[int] = None,
) -> list[tuple[float, float]]:
    """Converter segmento de arco (formato SketchUp) em polilinha.

    O formato SketchUp usa pontos de inicio/fim (x1,y1)-(x2,y2) e
    centro/raio (cx,cy,r) com direcao (cw/ccw).

    Args:
        x1, y1: Ponto de inicio do arco
        x2, y2: Ponto final do arco
        cx, cy: Centro do arco
        r: Raio
        direction: "cw" ou "ccw"
        num_segments: Override do numero de segmentos

    Returns:
        Lista de (x, y) do ponto inicial ao final.
    """
    # Calcular angulos de inicio e fim
    start_angle = math.atan2(y1 - cy, x1 - cx)
    end_angle = math.atan2(y2 - cy, x2 - cx)

    points = arc_to_polyline(cx, cy, r, start_angle, end_angle, direction, num_segments)

    # Garantir que o primeiro ponto e (x1, y1) e o ultimo e (x2, y2)
    if points:
        points[0] = (x1, y1)
        points[-1] = (x2, y2)

    return points


def circle_to_polyline(
    cx: float,
    cy: float,
    r: float,
    num_segments: Optional[int] = None,
) -> list[tuple[float, float]]:
    """Converter circulo em lista de pontos (poligono fechado).

    Args:
        cx, cy: Centro
        r: Raio
        num_segments: Pontos no circulo (default: arc_resolution)

    Returns:
        Lista de (x, y) formando o circulo (primeiro == ultimo para fechar).
    """
    if r <= 0:
        return [(cx, cy)]

    n = num_segments or settings.arc_resolution
    points = []
    for i in range(n):
        angle = 2 * math.pi * i / n
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        points.append((x, y))

    # Fechar o poligono
    points.append(points[0])
    return points


def discretize_contour_segments(
    segments: list[Segment],
    close: bool = True,
) -> list[tuple[float, float]]:
    """Discretizar lista de segmentos (line/arc) em lista de pontos.

    Recebe segmentos no formato SketchUp (Segment model) e retorna
    uma lista de pontos prontos para criar um Shapely Polygon.

    Args:
        segments: Lista de Segment (type="line" ou "arc")
        close: Se True, garante que o poligono fecha

    Returns:
        Lista de (x, y) pontos
    """
    if not segments:
        return []

    points: list[tuple[float, float]] = []

    for seg in segments:
        if seg.type == "line":
            # Linha reta: so precisa do ponto final (inicio e o fim do anterior)
            if not points:
                points.append((seg.x1, seg.y1))
            points.append((seg.x2, seg.y2))

        elif seg.type == "arc":
            if seg.cx is None or seg.cy is None or seg.r is None:
                # Arco incompleto — tratar como linha
                if not points:
                    points.append((seg.x1, seg.y1))
                points.append((seg.x2, seg.y2))
                continue

            arc_points = segment_arc_to_polyline(
                seg.x1, seg.y1,
                seg.x2, seg.y2,
                seg.cx, seg.cy,
                seg.r,
                seg.dir or "ccw",
            )

            if not points:
                points.extend(arc_points)
            else:
                # Pular o primeiro ponto do arco (ja e o ultimo do segmento anterior)
                points.extend(arc_points[1:])

    # Fechar poligono se necessario
    if close and len(points) >= 3:
        if points[0] != points[-1]:
            points.append(points[0])

    return points


def point_on_arc(
    cx: float, cy: float, r: float, angle: float
) -> tuple[float, float]:
    """Calcular ponto no arco dado angulo."""
    return (cx + r * math.cos(angle), cy + r * math.sin(angle))


def arc_length(r: float, sweep_angle: float) -> float:
    """Calcular comprimento de arco."""
    return abs(r * sweep_angle)


def angle_between_points(
    cx: float, cy: float, px: float, py: float
) -> float:
    """Calcular angulo de um ponto em relacao ao centro."""
    return math.atan2(py - cy, px - cx)
