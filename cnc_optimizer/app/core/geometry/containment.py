"""Verificacao de contencao de pecas em chapas.

Funcoes para verificar se uma peca cabe dentro de uma chapa,
considerando refilos, furos, zonas proibidas e espacamento.
"""

from __future__ import annotations

from shapely.geometry import Polygon, MultiPolygon, box

from app.core.geometry.collision import polygons_collide


# ---------------------------------------------------------------------------
# Contencao basica
# ---------------------------------------------------------------------------

def piece_fits_in_sheet(
    piece_poly: Polygon,
    sheet_poly: Polygon,
    tolerance: float = 0.01,
) -> bool:
    """Verificar se peca cabe inteiramente dentro da chapa.

    A peca deve estar completamente contida no poligono da chapa.

    Args:
        piece_poly: Poligono da peca (ja posicionada)
        sheet_poly: Poligono da chapa (area util apos refilo)
        tolerance: Tolerancia em mm para bordas

    Returns:
        True se a peca cabe na chapa
    """
    if piece_poly.is_empty or sheet_poly.is_empty:
        return False

    # Fast check: bbox da peca dentro do bbox da chapa
    px0, py0, px1, py1 = piece_poly.bounds
    sx0, sy0, sx1, sy1 = sheet_poly.bounds

    if px0 < sx0 - tolerance or py0 < sy0 - tolerance:
        return False
    if px1 > sx1 + tolerance or py1 > sy1 + tolerance:
        return False

    # Verificacao precisa: peca contida na chapa
    # A diferenca (peca - chapa) deve ser vazia ou insignificante
    diff = piece_poly.difference(sheet_poly)
    return diff.area < tolerance * tolerance


def piece_fits_at_position(
    piece_poly: Polygon,
    sheet_poly: Polygon,
    x: float,
    y: float,
    rotation: float = 0,
    tolerance: float = 0.01,
) -> bool:
    """Verificar se peca cabe na chapa numa posicao especifica.

    Conveniencia que translada/rotaciona antes de verificar.

    Args:
        piece_poly: Poligono da peca (na origem)
        sheet_poly: Poligono da chapa
        x: Posicao X em mm
        y: Posicao Y em mm
        rotation: Rotacao em graus
        tolerance: Tolerancia em mm

    Returns:
        True se cabe
    """
    from app.core.geometry.polygon_utils import place_polygon
    placed = place_polygon(piece_poly, x, y, rotation)
    return piece_fits_in_sheet(placed, sheet_poly, tolerance)


# ---------------------------------------------------------------------------
# Contencao com restricoes
# ---------------------------------------------------------------------------

def piece_fits_with_obstacles(
    piece_poly: Polygon,
    sheet_poly: Polygon,
    obstacles: list[Polygon],
    spacing: float = 0.0,
    tolerance: float = 0.01,
) -> bool:
    """Verificar se peca cabe na chapa sem colidir com obstaculos.

    Obstaculos podem ser:
    - Outras pecas ja colocadas
    - Furos/defeitos na chapa
    - Zonas proibidas (grampos, etc.)

    Args:
        piece_poly: Poligono da peca (ja posicionada)
        sheet_poly: Poligono da chapa
        obstacles: Lista de poligonos de obstaculos
        spacing: Espacamento minimo entre peca e obstaculos (mm)
        tolerance: Tolerancia (mm)

    Returns:
        True se cabe sem colisoes
    """
    # 1. Verificar se cabe na chapa
    if not piece_fits_in_sheet(piece_poly, sheet_poly, tolerance):
        return False

    # 2. Verificar colisao com obstaculos
    test_poly = piece_poly
    if spacing > 0:
        test_poly = piece_poly.buffer(spacing / 2.0)

    for obstacle in obstacles:
        if polygons_collide(test_poly, obstacle, tolerance):
            return False

    return True


def piece_fits_with_placed(
    piece_poly: Polygon,
    sheet_poly: Polygon,
    placed_pieces: list[Polygon],
    kerf: float = 0.0,
    min_spacing: float = 0.0,
    tolerance: float = 0.01,
) -> bool:
    """Verificar se peca cabe na chapa sem colidir com pecas ja colocadas.

    Considera kerf e espacamento minimo.

    Args:
        piece_poly: Poligono da peca (ja posicionada)
        sheet_poly: Poligono da chapa
        placed_pieces: Lista de poligonos de pecas ja colocadas
        kerf: Largura do kerf em mm (sera adicionado como spacing)
        min_spacing: Espacamento minimo adicional em mm
        tolerance: Tolerancia (mm)

    Returns:
        True se cabe sem colisoes
    """
    # Spacing total = kerf + min_spacing
    total_spacing = kerf + min_spacing
    return piece_fits_with_obstacles(
        piece_poly, sheet_poly, placed_pieces, total_spacing, tolerance
    )


# ---------------------------------------------------------------------------
# Area disponivel na chapa
# ---------------------------------------------------------------------------

def usable_sheet_polygon(
    length: float,
    width: float,
    trim: float = 0.0,
) -> Polygon:
    """Criar poligono da area util da chapa (descontando refilo).

    Args:
        length: Comprimento total da chapa em mm
        width: Largura total da chapa em mm
        trim: Refilo em mm (removido de cada lado)

    Returns:
        Poligono retangular da area util
    """
    return box(trim, trim, length - trim, width - trim)


def usable_sheet_with_defects(
    length: float,
    width: float,
    trim: float = 0.0,
    defects: list[Polygon] | None = None,
) -> Polygon | MultiPolygon:
    """Criar poligono da area util da chapa com defeitos removidos.

    Args:
        length: Comprimento total da chapa em mm
        width: Largura total da chapa em mm
        trim: Refilo em mm
        defects: Lista de poligonos de defeitos/furos na chapa

    Returns:
        Poligono(s) da area util
    """
    sheet = usable_sheet_polygon(length, width, trim)

    if not defects:
        return sheet

    for defect in defects:
        result = sheet.difference(defect)
        if isinstance(result, (Polygon, MultiPolygon)):
            sheet = result
        else:
            # Se resultado nao e poligono, manter anterior
            continue

    return sheet


def remaining_area(
    sheet_poly: Polygon,
    placed_pieces: list[Polygon],
    kerf: float = 0.0,
) -> Polygon | MultiPolygon | None:
    """Calcular area restante na chapa apos colocar pecas.

    Cada peca e expandida por kerf/2 para representar o material
    removido pelo corte.

    Args:
        sheet_poly: Poligono da chapa
        placed_pieces: Lista de poligonos das pecas colocadas
        kerf: Largura do kerf em mm

    Returns:
        Poligono(s) da area restante, ou None se tudo ocupado
    """
    remaining = sheet_poly

    for piece in placed_pieces:
        # Expandir peca pelo kerf
        if kerf > 0:
            expanded = piece.buffer(kerf / 2.0)
        else:
            expanded = piece

        remaining = remaining.difference(expanded)

        if remaining.is_empty:
            return None

    if remaining.is_empty:
        return None

    return remaining


def occupancy_ratio(
    sheet_poly: Polygon,
    placed_pieces: list[Polygon],
) -> float:
    """Calcular taxa de aproveitamento da chapa.

    Args:
        sheet_poly: Poligono da chapa
        placed_pieces: Lista de poligonos das pecas colocadas

    Returns:
        Taxa de aproveitamento (0.0 a 1.0)
    """
    if sheet_poly.area <= 0:
        return 0.0

    total_piece_area = sum(p.area for p in placed_pieces)
    return min(total_piece_area / sheet_poly.area, 1.0)


# ---------------------------------------------------------------------------
# Inner-Fit Polygon (IFP)
# ---------------------------------------------------------------------------

def compute_ifp(
    container: Polygon,
    piece: Polygon,
) -> Polygon | None:
    """Calcular Inner-Fit Polygon (IFP).

    O IFP define a regiao onde o ponto de referencia da peca
    pode ser colocado de modo que a peca fique inteiramente
    dentro do container.

    Para retangulos: IFP = retangulo reduzido pelas dimensoes da peca.
    Para poligonos gerais: Minkowski difference.

    Args:
        container: Poligono do container (chapa)
        piece: Poligono da peca (na origem)

    Returns:
        IFP como Polygon, ou None se peca nao cabe
    """
    # Bounding box da peca
    px0, py0, px1, py1 = piece.bounds
    piece_w = px1 - px0
    piece_h = py1 - py0

    # Offset do ponto de referencia da peca (canto inferior esquerdo do bbox)
    ref_offset_x = px0
    ref_offset_y = py0

    # Para container retangular, IFP e simples
    cx0, cy0, cx1, cy1 = container.bounds

    # Verificar se container e aproximadamente retangular
    container_area = container.area
    bbox_area = (cx1 - cx0) * (cy1 - cy0)

    if abs(container_area - bbox_area) < 1.0:  # Container retangular
        # IFP = retangulo onde o ref point pode ficar
        ifp_x0 = cx0 - ref_offset_x
        ifp_y0 = cy0 - ref_offset_y
        ifp_x1 = cx1 - ref_offset_x - piece_w + (-ref_offset_x if ref_offset_x < 0 else 0)
        ifp_y1 = cy1 - ref_offset_y - piece_h + (-ref_offset_y if ref_offset_y < 0 else 0)

        # Simplificar: para peca na origem, ref_offset = 0
        ifp_x0 = cx0
        ifp_y0 = cy0
        ifp_x1 = cx1 - piece_w
        ifp_y1 = cy1 - piece_h

        if ifp_x1 < ifp_x0 or ifp_y1 < ifp_y0:
            return None  # Peca nao cabe

        return box(ifp_x0, ifp_y0, ifp_x1, ifp_y1)

    # Para container irregular: usar erosao por Minkowski
    # Aproximacao: erodir container pelo "raio" da peca
    from shapely.affinity import translate

    # Refletir peca em relacao a origem (necessario para Minkowski difference)
    reflected_coords = [(-x, -y) for x, y in piece.exterior.coords]
    reflected = Polygon(reflected_coords)

    # Minkowski sum do container com a peca refletida
    # Isso da o IFP (regiao valida para o ref point)
    try:
        # Usar erosao como aproximacao
        # O IFP exato para poligonos nao-convexos e complexo
        # Usamos buffer negativo com o "raio" da peca como aproximacao conservadora
        min_dim = min(piece_w, piece_h)
        ifp = container.buffer(-min_dim / 2.0)

        if ifp.is_empty or not isinstance(ifp, Polygon):
            return None

        return ifp
    except Exception:
        return None
