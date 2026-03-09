"""Testes do nucleo geometrico (FASE 2).

Cobre: arc_utils, polygon_utils, validation, offsets, collision,
containment e nfp.
"""

import math

import pytest
from shapely.geometry import Polygon, box

from app.core.geometry.arc_utils import (
    arc_to_polyline,
    segment_arc_to_polyline,
    circle_to_polyline,
    discretize_contour_segments,
    point_on_arc,
    arc_length,
    angle_between_points,
)
from app.core.geometry.polygon_utils import (
    rectangle_polygon,
    sheet_polygon,
    rotate_polygon,
    translate_polygon,
    place_polygon,
    normalize_polygon,
    polygon_area,
    polygon_perimeter,
    bounding_box,
    bounding_box_dimensions,
    centroid,
    convex_hull_area,
    rectangularity,
    aspect_ratio,
    is_approximately_rectangular,
    is_symmetric_180,
    is_square,
)
from app.core.geometry.validation import (
    validate_polygon,
    is_valid,
    fix_orientation,
    simplify_polygon,
    remove_duplicate_vertices,
    ensure_minimum_area,
    ensure_minimum_dimension,
    fix_polygon,
)
from app.core.geometry.offsets import (
    offset_polygon,
    offset_for_kerf,
    offset_for_cutter,
    expand_for_cutter,
    offset_for_spacing,
    boolean_difference,
    boolean_union,
    boolean_intersection,
)
from app.core.geometry.collision import (
    polygons_collide,
    polygon_overlaps_any,
    minimum_distance,
    overlap_area,
    CollisionIndex,
)
from app.core.geometry.containment import (
    piece_fits_in_sheet,
    piece_fits_at_position,
    piece_fits_with_obstacles,
    piece_fits_with_placed,
    usable_sheet_polygon,
    remaining_area,
    occupancy_ratio,
    compute_ifp,
)
from app.core.geometry.nfp import (
    nfp_rectangles,
    is_rectangular_pair,
    compute_nfp,
    compute_nfp_with_rotation,
    NFPCache,
)
from app.core.domain.models import Segment


# ===================================================================
# ARC UTILS
# ===================================================================

class TestArcToPolyline:
    """Testes de conversao arco → polilinha."""

    def test_full_circle(self):
        """Circulo completo deve ter pontos corretos."""
        points = arc_to_polyline(0, 0, 10, 0, 0, "ccw", num_segments=4)
        # 4 segmentos = 5 pontos (inicio + 4)
        assert len(points) == 5
        # Primeiro ponto: (10, 0) — raio na horizontal
        assert abs(points[0][0] - 10) < 0.001
        assert abs(points[0][1] - 0) < 0.001

    def test_quarter_arc_ccw(self):
        """Quarto de circulo anti-horario."""
        points = arc_to_polyline(0, 0, 10, 0, math.pi / 2, "ccw", num_segments=4)
        assert len(points) == 5
        # Primeiro: (10, 0), Ultimo: (0, 10)
        assert abs(points[0][0] - 10) < 0.001
        assert abs(points[-1][1] - 10) < 0.001

    def test_zero_radius(self):
        """Raio zero retorna ponto central."""
        points = arc_to_polyline(5, 5, 0, 0, math.pi, "ccw")
        assert len(points) == 1
        assert points[0] == (5, 5)

    def test_cw_direction(self):
        """Arco horario."""
        points = arc_to_polyline(0, 0, 10, math.pi / 2, 0, "cw", num_segments=4)
        assert len(points) == 5
        # Primeiro: (0, 10), Ultimo: (10, 0)
        assert abs(points[0][1] - 10) < 0.01
        assert abs(points[-1][0] - 10) < 0.01


class TestCircleToPolyline:
    """Testes de conversao circulo → polilinha."""

    def test_basic_circle(self):
        """Circulo basico com 8 segmentos."""
        points = circle_to_polyline(0, 0, 10, num_segments=8)
        # 8 pontos + 1 fechamento = 9
        assert len(points) == 9
        # Fechado
        assert points[0] == points[-1]

    def test_circle_radius(self):
        """Todos os pontos estao no raio correto."""
        r = 15
        points = circle_to_polyline(5, 5, r, num_segments=16)
        for x, y in points[:-1]:  # excluir ultimo (duplicado)
            dist = math.sqrt((x - 5) ** 2 + (y - 5) ** 2)
            assert abs(dist - r) < 0.001

    def test_zero_radius_circle(self):
        """Raio zero retorna ponto central."""
        points = circle_to_polyline(3, 4, 0)
        assert points == [(3, 4)]


class TestSegmentArcToPolyline:
    """Testes de conversao segmento de arco SketchUp."""

    def test_endpoints_exact(self):
        """Primeiro e ultimo pontos sao exatos."""
        points = segment_arc_to_polyline(10, 0, 0, 10, 0, 0, 10, "ccw", 8)
        assert points[0] == (10, 0)
        assert points[-1] == (0, 10)


class TestDiscretizeContour:
    """Testes de discretizacao de contornos."""

    def test_line_segments_only(self):
        """Contorno com apenas linhas retas (retangulo)."""
        segs = [
            Segment(type="line", x1=0, y1=0, x2=100, y2=0),
            Segment(type="line", x1=100, y1=0, x2=100, y2=50),
            Segment(type="line", x1=100, y1=50, x2=0, y2=50),
            Segment(type="line", x1=0, y1=50, x2=0, y2=0),
        ]
        points = discretize_contour_segments(segs, close=True)
        # 4 linhas = 5 pontos (inicio + 4 fins), fechado = ja coincide
        assert len(points) >= 5
        assert points[0] == points[-1]  # Fechado

    def test_empty_segments(self):
        """Lista vazia retorna lista vazia."""
        assert discretize_contour_segments([], close=True) == []


class TestArcHelpers:
    """Testes de funcoes auxiliares de arcos."""

    def test_point_on_arc(self):
        """Ponto no arco no angulo 0."""
        x, y = point_on_arc(0, 0, 10, 0)
        assert abs(x - 10) < 0.001
        assert abs(y) < 0.001

    def test_arc_length_half_circle(self):
        """Comprimento de meia circunferencia."""
        length = arc_length(10, math.pi)
        assert abs(length - 10 * math.pi) < 0.001

    def test_angle_between_points(self):
        """Angulo de (10, 0) em relacao a (0, 0) = 0."""
        angle = angle_between_points(0, 0, 10, 0)
        assert abs(angle) < 0.001


# ===================================================================
# POLYGON UTILS
# ===================================================================

class TestPolygonCreation:
    """Testes de criacao de poligonos."""

    def test_rectangle_polygon(self):
        """Retangulo 100x50 tem area correta."""
        poly = rectangle_polygon(100, 50)
        assert abs(poly.area - 5000) < 0.001

    def test_rectangle_at_origin(self):
        """Retangulo na origem."""
        poly = rectangle_polygon(100, 50)
        minx, miny, maxx, maxy = poly.bounds
        assert abs(minx) < 0.001
        assert abs(miny) < 0.001
        assert abs(maxx - 100) < 0.001
        assert abs(maxy - 50) < 0.001

    def test_rectangle_with_offset(self):
        """Retangulo com offset."""
        poly = rectangle_polygon(100, 50, 10, 20)
        minx, miny, maxx, maxy = poly.bounds
        assert abs(minx - 10) < 0.001
        assert abs(miny - 20) < 0.001

    def test_sheet_polygon(self):
        """Chapa 2750x1850 com refilo 10mm."""
        poly = sheet_polygon(2750, 1850, 10)
        w, h = bounding_box_dimensions(poly)
        assert abs(w - 2730) < 0.001  # 2750 - 2*10
        assert abs(h - 1830) < 0.001  # 1850 - 2*10


class TestPolygonTransforms:
    """Testes de transformacoes."""

    def test_translate(self):
        """Transladar retangulo."""
        poly = rectangle_polygon(100, 50)
        moved = translate_polygon(poly, 10, 20)
        minx, miny, _, _ = moved.bounds
        assert abs(minx - 10) < 0.001
        assert abs(miny - 20) < 0.001

    def test_rotate_90(self):
        """Rotacionar 90 graus troca largura e altura."""
        poly = rectangle_polygon(100, 50)
        rotated = rotate_polygon(poly, 90)
        w, h = bounding_box_dimensions(rotated)
        assert abs(w - 50) < 0.1
        assert abs(h - 100) < 0.1

    def test_place_polygon(self):
        """Posicionar peca: rotacionar + transladar."""
        poly = rectangle_polygon(100, 50)
        placed = place_polygon(poly, 200, 300, 0)
        minx, miny, _, _ = placed.bounds
        assert abs(minx - 200) < 0.001
        assert abs(miny - 300) < 0.001

    def test_normalize(self):
        """Normalizar move para (0,0)."""
        poly = rectangle_polygon(100, 50, 50, 50)
        norm = normalize_polygon(poly)
        minx, miny, _, _ = norm.bounds
        assert abs(minx) < 0.001
        assert abs(miny) < 0.001


class TestPolygonMeasures:
    """Testes de medidas."""

    def test_area(self):
        """Area de retangulo 100x50."""
        poly = rectangle_polygon(100, 50)
        assert abs(polygon_area(poly) - 5000) < 0.001

    def test_perimeter(self):
        """Perimetro de retangulo 100x50."""
        poly = rectangle_polygon(100, 50)
        assert abs(polygon_perimeter(poly) - 300) < 0.001

    def test_bounding_box(self):
        """Bounding box correto."""
        poly = rectangle_polygon(100, 50, 10, 20)
        bb = bounding_box(poly)
        assert bb == (10, 20, 110, 70)

    def test_bounding_box_dimensions(self):
        """Dimensoes do bbox."""
        poly = rectangle_polygon(100, 50)
        w, h = bounding_box_dimensions(poly)
        assert abs(w - 100) < 0.001
        assert abs(h - 50) < 0.001

    def test_centroid(self):
        """Centroide de retangulo."""
        poly = rectangle_polygon(100, 50)
        cx, cy = centroid(poly)
        assert abs(cx - 50) < 0.001
        assert abs(cy - 25) < 0.001

    def test_rectangularity(self):
        """Retangulo tem retangularidade ~1.0."""
        poly = rectangle_polygon(100, 50)
        assert abs(rectangularity(poly) - 1.0) < 0.001

    def test_aspect_ratio(self):
        """Aspect ratio 100x50 = 2.0."""
        poly = rectangle_polygon(100, 50)
        assert abs(aspect_ratio(poly) - 2.0) < 0.001

    def test_is_rectangular(self):
        """Retangulo e retangular."""
        poly = rectangle_polygon(100, 50)
        assert is_approximately_rectangular(poly)

    def test_convex_hull_area(self):
        """Convex hull de retangulo = area do retangulo."""
        poly = rectangle_polygon(100, 50)
        assert abs(convex_hull_area(poly) - 5000) < 0.001


class TestSymmetry:
    """Testes de simetria."""

    def test_rectangle_symmetric_180(self):
        """Retangulo e simetrico sob 180 graus."""
        poly = rectangle_polygon(100, 50)
        assert is_symmetric_180(poly)

    def test_square_check(self):
        """Quadrado detectado."""
        assert is_square(100, 100)
        assert not is_square(100, 50)


# ===================================================================
# VALIDATION
# ===================================================================

class TestValidation:
    """Testes de validacao de poligonos."""

    def test_valid_polygon(self):
        """Poligono valido passa."""
        poly = rectangle_polygon(100, 50)
        assert is_valid(poly)

    def test_validate_valid(self):
        """Validar poligono valido retorna ele mesmo."""
        poly = rectangle_polygon(100, 50)
        result = validate_polygon(poly)
        assert result.is_valid
        assert abs(result.area - 5000) < 1.0

    def test_validate_empty_raises(self):
        """Poligono vazio levanta erro."""
        poly = Polygon()
        with pytest.raises(ValueError, match="vazio"):
            validate_polygon(poly)

    def test_fix_orientation(self):
        """fix_orientation retorna poligono valido."""
        poly = rectangle_polygon(100, 50)
        fixed = fix_orientation(poly)
        assert fixed.is_valid

    def test_simplify_polygon(self):
        """Simplificar retangulo nao muda nada."""
        poly = rectangle_polygon(100, 50)
        simplified = simplify_polygon(poly, 0.1)
        assert simplified.is_valid
        assert abs(simplified.area - 5000) < 1.0

    def test_fix_polygon_valid(self):
        """fix_polygon de poligono valido retorna o mesmo."""
        poly = rectangle_polygon(100, 50)
        fixed = fix_polygon(poly)
        assert fixed.is_valid
        assert abs(fixed.area - poly.area) < 0.001

    def test_fix_self_intersection(self):
        """fix_polygon corrige auto-intersecao (bowtie)."""
        # Poligono bowtie (auto-intersecao)
        bowtie = Polygon([(0, 0), (100, 100), (100, 0), (0, 100), (0, 0)])
        assert not bowtie.is_valid
        fixed = fix_polygon(bowtie)
        assert fixed.is_valid

    def test_ensure_minimum_area(self):
        """Verificar area minima."""
        poly = rectangle_polygon(100, 50)
        assert ensure_minimum_area(poly, 1.0)
        assert not ensure_minimum_area(poly, 10000)

    def test_ensure_minimum_dimension(self):
        """Verificar dimensao minima."""
        poly = rectangle_polygon(100, 50)
        assert ensure_minimum_dimension(poly, 10)
        assert not ensure_minimum_dimension(poly, 200)


class TestRemoveDuplicates:
    """Testes de remocao de vertices duplicados."""

    def test_no_duplicates(self):
        """Sem duplicados, lista inalterada."""
        coords = [(0, 0), (100, 0), (100, 50), (0, 50)]
        result = remove_duplicate_vertices(coords)
        assert len(result) == 4

    def test_with_duplicates(self):
        """Duplicados consecutivos removidos."""
        coords = [(0, 0), (0, 0.005), (100, 0), (100, 50)]
        result = remove_duplicate_vertices(coords, tolerance=0.01)
        assert len(result) == 3  # segundo ponto removido

    def test_empty_list(self):
        """Lista vazia retorna vazia."""
        assert remove_duplicate_vertices([]) == []

    def test_single_point(self):
        """Um ponto retorna ele mesmo."""
        assert remove_duplicate_vertices([(1, 2)]) == [(1, 2)]


# ===================================================================
# OFFSETS
# ===================================================================

class TestOffsets:
    """Testes de offset de poligonos."""

    def test_expand_rectangle(self):
        """Expandir retangulo aumenta area."""
        poly = rectangle_polygon(100, 50)
        expanded = offset_polygon(poly, 5)
        assert expanded is not None
        assert expanded.area > poly.area

    def test_contract_rectangle(self):
        """Contrair retangulo diminui area."""
        poly = rectangle_polygon(100, 50)
        contracted = offset_polygon(poly, -5)
        assert contracted is not None
        assert contracted.area < poly.area

    def test_kerf_offset(self):
        """Offset de kerf contrai por kerf/2."""
        poly = rectangle_polygon(100, 50)
        result = offset_for_kerf(poly, 4)  # kerf = 4mm
        assert result is not None
        # Area deve ser menor (contraido por 2mm de cada lado)
        assert result.area < poly.area

    def test_cutter_offset(self):
        """Offset de fresa contrai por diametro/2."""
        poly = rectangle_polygon(100, 50)
        result = offset_for_cutter(poly, 6)  # fresa 6mm
        assert result is not None
        assert result.area < poly.area

    def test_expand_for_cutter(self):
        """Expansao para fresa aumenta area."""
        poly = rectangle_polygon(100, 50)
        result = expand_for_cutter(poly, 6)
        assert result is not None
        assert result.area > poly.area

    def test_spacing_offset(self):
        """Offset de espacamento expande."""
        poly = rectangle_polygon(100, 50)
        result = offset_for_spacing(poly, 7)
        assert result.area > poly.area

    def test_zero_offset(self):
        """Offset zero retorna original."""
        poly = rectangle_polygon(100, 50)
        result = offset_polygon(poly, 0)
        assert abs(result.area - poly.area) < 0.001

    def test_excessive_contraction_returns_none(self):
        """Contracao excessiva retorna None."""
        poly = rectangle_polygon(10, 10)
        result = offset_polygon(poly, -20)  # contrair mais que o tamanho
        assert result is None


class TestBooleanOps:
    """Testes de operacoes booleanas."""

    def test_difference(self):
        """Subtrair retangulo menor de maior."""
        big = rectangle_polygon(100, 100)
        small = rectangle_polygon(50, 50)
        result = boolean_difference(big, small)
        assert result is not None
        assert abs(result.area - 7500) < 1.0  # 10000 - 2500

    def test_union(self):
        """Unir dois retangulos sobrepostos."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 50, 0)  # deslocado 50mm em X
        result = boolean_union([a, b])
        assert result is not None
        assert result.area > a.area

    def test_intersection(self):
        """Interseccao de dois retangulos sobrepostos."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 50, 0)
        result = boolean_intersection(a, b)
        assert result is not None
        assert abs(result.area - 2500) < 1.0  # sobreposicao 50x50

    def test_no_intersection(self):
        """Interseccao vazia retorna None."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 200, 0)
        result = boolean_intersection(a, b)
        assert result is None


# ===================================================================
# COLLISION
# ===================================================================

class TestCollision:
    """Testes de deteccao de colisao."""

    def test_no_collision(self):
        """Retangulos separados nao colidem."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 200, 0)
        assert not polygons_collide(a, b)

    def test_overlap_collision(self):
        """Retangulos sobrepostos colidem."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 50, 0)
        assert polygons_collide(a, b)

    def test_touching_edges_no_collision(self):
        """Retangulos encostados (sem overlap) nao colidem."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 100, 0)
        assert not polygons_collide(a, b)

    def test_polygon_overlaps_any(self):
        """Verificar colisao com lista."""
        placed = [
            rectangle_polygon(100, 50, 0, 0),
            rectangle_polygon(100, 50, 200, 0),
        ]
        # Colide com o primeiro
        test1 = rectangle_polygon(50, 50, 50, 0)
        assert polygon_overlaps_any(test1, placed)

        # Nao colide com nenhum
        test2 = rectangle_polygon(50, 50, 120, 0)
        assert not polygon_overlaps_any(test2, placed)

    def test_minimum_distance(self):
        """Distancia entre retangulos separados."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 150, 0)
        dist = minimum_distance(a, b)
        assert abs(dist - 50) < 0.001

    def test_overlap_area(self):
        """Area de sobreposicao de retangulos."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(100, 50, 50, 0)
        area = overlap_area(a, b)
        assert abs(area - 2500) < 1.0  # 50x50


class TestCollisionIndex:
    """Testes do indice espacial."""

    def test_empty_index(self):
        """Indice vazio nao tem colisoes."""
        idx = CollisionIndex()
        poly = rectangle_polygon(100, 50)
        assert not idx.has_collision(poly)
        assert idx.count == 0

    def test_add_and_query(self):
        """Adicionar e consultar colisao."""
        idx = CollisionIndex()
        idx.add(rectangle_polygon(100, 50, 0, 0))
        idx.add(rectangle_polygon(100, 50, 200, 0))

        assert idx.count == 2

        # Colide com primeiro
        test1 = rectangle_polygon(50, 50, 50, 0)
        assert idx.has_collision(test1)

        # Nao colide
        test2 = rectangle_polygon(50, 50, 120, 0)
        assert not idx.has_collision(test2)

    def test_query_collisions_returns_indices(self):
        """query_collisions retorna indices corretos."""
        idx = CollisionIndex()
        idx.add(rectangle_polygon(100, 50, 0, 0))
        idx.add(rectangle_polygon(100, 50, 200, 0))
        idx.add(rectangle_polygon(100, 50, 400, 0))

        # Colide apenas com o primeiro
        test = rectangle_polygon(50, 50, 50, 0)
        collisions = idx.query_collisions(test)
        assert 0 in collisions
        assert 1 not in collisions

    def test_query_nearby(self):
        """Encontrar poligonos proximos."""
        idx = CollisionIndex()
        idx.add(rectangle_polygon(100, 50, 0, 0))
        idx.add(rectangle_polygon(100, 50, 150, 0))
        idx.add(rectangle_polygon(100, 50, 500, 0))

        test = rectangle_polygon(10, 10, 110, 0)
        nearby = idx.query_nearby(test, max_distance=50)
        assert len(nearby) >= 2  # Primeiro e segundo estao perto

    def test_clear(self):
        """Limpar indice."""
        idx = CollisionIndex()
        idx.add(rectangle_polygon(100, 50))
        idx.clear()
        assert idx.count == 0


# ===================================================================
# CONTAINMENT
# ===================================================================

class TestContainment:
    """Testes de contencao peca-chapa."""

    def test_piece_fits(self):
        """Peca menor cabe na chapa."""
        piece = rectangle_polygon(100, 50, 10, 10)
        sheet = sheet_polygon(2750, 1850, 10)
        assert piece_fits_in_sheet(piece, sheet)

    def test_piece_too_big(self):
        """Peca maior que chapa nao cabe."""
        piece = rectangle_polygon(3000, 2000)
        sheet = sheet_polygon(2750, 1850, 10)
        assert not piece_fits_in_sheet(piece, sheet)

    def test_piece_outside_sheet(self):
        """Peca fora da chapa nao cabe."""
        piece = rectangle_polygon(100, 50, 5000, 5000)
        sheet = sheet_polygon(2750, 1850, 10)
        assert not piece_fits_in_sheet(piece, sheet)

    def test_piece_fits_at_position(self):
        """Peca cabe em posicao especifica."""
        piece = rectangle_polygon(100, 50)
        sheet = sheet_polygon(2750, 1850, 10)
        assert piece_fits_at_position(piece, sheet, 100, 100)

    def test_piece_with_obstacles(self):
        """Peca nao cabe se obstaculo no caminho."""
        piece = rectangle_polygon(100, 50, 50, 50)
        sheet = sheet_polygon(500, 500, 0)
        obstacles = [rectangle_polygon(100, 50, 50, 50)]  # mesmo lugar
        assert not piece_fits_with_obstacles(piece, sheet, obstacles)

    def test_piece_with_placed(self):
        """Peca cabe sem colidir com pecas colocadas."""
        piece = rectangle_polygon(100, 50, 200, 0)
        sheet = sheet_polygon(500, 500, 0)
        placed = [rectangle_polygon(100, 50, 0, 0)]
        assert piece_fits_with_placed(piece, sheet, placed)

    def test_piece_with_kerf(self):
        """Peca muito proxima nao cabe com kerf."""
        piece = rectangle_polygon(100, 50, 101, 0)  # 1mm gap
        sheet = sheet_polygon(500, 500, 0)
        placed = [rectangle_polygon(100, 50, 0, 0)]
        # Gap 1mm < kerf 4mm → nao cabe
        assert not piece_fits_with_placed(piece, sheet, placed, kerf=4)

    def test_usable_sheet_polygon(self):
        """Area util com refilo."""
        poly = usable_sheet_polygon(2750, 1850, 10)
        w, h = bounding_box_dimensions(poly)
        assert abs(w - 2730) < 0.001
        assert abs(h - 1830) < 0.001

    def test_remaining_area(self):
        """Area restante apos colocar pecas."""
        sheet = rectangle_polygon(1000, 500)
        pieces = [rectangle_polygon(500, 500)]
        rem = remaining_area(sheet, pieces)
        assert rem is not None
        assert abs(rem.area - 250000) < 100  # ~metade da chapa

    def test_occupancy_ratio(self):
        """Taxa de aproveitamento."""
        sheet = rectangle_polygon(1000, 500)
        pieces = [rectangle_polygon(500, 250)]
        ratio = occupancy_ratio(sheet, pieces)
        assert abs(ratio - 0.25) < 0.001  # 125000/500000


class TestIFP:
    """Testes de Inner-Fit Polygon."""

    def test_ifp_rectangle_in_rectangle(self):
        """IFP de retangulo em chapa retangular."""
        container = rectangle_polygon(1000, 500)
        piece = rectangle_polygon(200, 100)
        ifp = compute_ifp(container, piece)
        assert ifp is not None

        # IFP deve ter dimensoes (1000-200) x (500-100) = 800 x 400
        w, h = bounding_box_dimensions(ifp)
        assert abs(w - 800) < 1.0
        assert abs(h - 400) < 1.0

    def test_ifp_piece_too_big(self):
        """Peca que nao cabe retorna None."""
        container = rectangle_polygon(100, 50)
        piece = rectangle_polygon(200, 100)
        ifp = compute_ifp(container, piece)
        assert ifp is None

    def test_ifp_exact_fit(self):
        """Peca do tamanho exato do container."""
        container = rectangle_polygon(100, 50)
        piece = rectangle_polygon(100, 50)
        ifp = compute_ifp(container, piece)
        # IFP deve ser um ponto (area ~0) ou None
        if ifp is not None:
            assert ifp.area < 1.0


# ===================================================================
# NFP (No-Fit Polygon)
# ===================================================================

class TestNFP:
    """Testes de No-Fit Polygon."""

    def test_nfp_two_rectangles(self):
        """NFP de dois retangulos e um retangulo maior."""
        fixed = rectangle_polygon(100, 50)
        moving = rectangle_polygon(80, 40)

        nfp = compute_nfp(fixed, moving)
        assert nfp is not None
        assert nfp.is_valid

        # NFP de retangulos: (100+80) x (50+40) = 180 x 90
        w, h = bounding_box_dimensions(nfp)
        assert abs(w - 180) < 1.0
        assert abs(h - 90) < 1.0

    def test_nfp_rectangles_direct(self):
        """NFP analitico de retangulos."""
        nfp = nfp_rectangles(100, 50, 80, 40)
        w, h = bounding_box_dimensions(nfp)
        assert abs(w - 180) < 0.001
        assert abs(h - 90) < 0.001

    def test_is_rectangular_pair(self):
        """Detectar par de retangulos."""
        a = rectangle_polygon(100, 50)
        b = rectangle_polygon(80, 40)
        assert is_rectangular_pair(a, b)

    def test_nfp_with_rotation(self):
        """NFP com rotacao de 90 graus."""
        fixed = rectangle_polygon(100, 50)
        moving = rectangle_polygon(80, 40)

        nfp0 = compute_nfp_with_rotation(fixed, moving, 0)
        nfp90 = compute_nfp_with_rotation(fixed, moving, 90)

        assert nfp0 is not None
        assert nfp90 is not None

        # NFP com rotacao 90: (100+40) x (50+80) = 140 x 130
        w90, h90 = bounding_box_dimensions(nfp90)
        assert abs(w90 - 140) < 2.0
        assert abs(h90 - 130) < 2.0


class TestNFPCache:
    """Testes do cache de NFPs."""

    def test_cache_miss_then_hit(self):
        """Primeiro acesso e miss, segundo e hit."""
        cache = NFPCache()
        fixed = rectangle_polygon(100, 50)
        moving = rectangle_polygon(80, 40)

        # Miss
        assert cache.get(fixed, moving) is None

        # Computar e armazenar
        nfp = compute_nfp(fixed, moving)
        cache.put(fixed, moving, 0, nfp)

        # Hit
        cached = cache.get(fixed, moving)
        assert cached is not None

        stats = cache.stats
        assert stats["hits"] == 1
        assert stats["misses"] == 1

    def test_get_or_compute(self):
        """get_or_compute automatiza cache."""
        cache = NFPCache()
        fixed = rectangle_polygon(100, 50)
        moving = rectangle_polygon(80, 40)

        # Primeiro: computa
        nfp1 = cache.get_or_compute(fixed, moving)
        assert nfp1 is not None

        # Segundo: usa cache
        nfp2 = cache.get_or_compute(fixed, moving)
        assert nfp2 is not None

        assert cache.stats["hits"] == 1
        assert cache.stats["misses"] == 1

    def test_cache_clear(self):
        """Limpar cache."""
        cache = NFPCache()
        fixed = rectangle_polygon(100, 50)
        moving = rectangle_polygon(80, 40)

        cache.get_or_compute(fixed, moving)
        assert cache.stats["size"] == 1

        cache.clear()
        assert cache.stats["size"] == 0


# ===================================================================
# INTEGRATION: Cenarios reais
# ===================================================================

class TestRealScenarios:
    """Testes com cenarios realistas de producao."""

    def test_lateral_on_sheet(self):
        """Lateral 720x550 cabe em chapa 2750x1850."""
        sheet = sheet_polygon(2750, 1850, 10)
        lateral = rectangle_polygon(720, 550, 10, 10)
        assert piece_fits_in_sheet(lateral, sheet)

    def test_multiple_pieces_on_sheet(self):
        """Varias pecas de cozinha cabem em chapa."""
        sheet = sheet_polygon(2750, 1850, 10)
        pieces = [
            rectangle_polygon(720, 550, 10, 10),       # Lateral 1
            rectangle_polygon(720, 550, 10, 570),      # Lateral 2
            rectangle_polygon(1164, 550, 740, 10),     # Base
            rectangle_polygon(1164, 100, 740, 570),    # Regua
            rectangle_polygon(716, 597, 740, 680),     # Porta
        ]
        for piece in pieces:
            assert piece_fits_in_sheet(piece, sheet)

    def test_nfp_for_nesting(self):
        """NFP permite posicionar peca adjacente ao fixo."""
        fixed = rectangle_polygon(720, 550)
        moving = rectangle_polygon(720, 550)

        nfp = compute_nfp(fixed, moving)
        assert nfp is not None

        # Se o ref point do moving esta no contorno do NFP,
        # as pecas encostam sem overlap
        # Ponto (720, 0) = adjacente a direita do fixed
        from shapely.geometry import Point
        test_point = Point(720, 0)
        # O ponto deve estar no contorno ou fora do NFP
        assert not nfp.contains(test_point)

    def test_kerf_compensation(self):
        """Compensacao de kerf reduz dimensoes corretamente."""
        # Peca 1164x550 com kerf 4mm → contorno cortado 2mm para dentro
        peca = rectangle_polygon(1164, 550)
        compensada = offset_for_kerf(peca, 4)
        assert compensada is not None
        w, h = bounding_box_dimensions(compensada)
        # Deve ser ~1160x546 (4mm menos em cada dimensao)
        assert abs(w - 1160) < 1.0
        assert abs(h - 546) < 1.0

    def test_collision_index_many_pieces(self):
        """Indice espacial com muitas pecas funciona."""
        idx = CollisionIndex()

        # Colocar 20 pecas em grid
        for row in range(4):
            for col in range(5):
                poly = rectangle_polygon(100, 50, col * 110, row * 60)
                idx.add(poly)

        assert idx.count == 20

        # Peca que nao colide
        free = rectangle_polygon(50, 30, 550, 0)
        assert not idx.has_collision(free)

        # Peca que colide
        overlap = rectangle_polygon(50, 30, 50, 10)
        assert idx.has_collision(overlap)
