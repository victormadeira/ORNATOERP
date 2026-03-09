"""No-Fit Polygon (NFP) computation.

O NFP define a regiao onde o ponto de referencia de uma peca movel
NAO pode ser colocado em relacao a uma peca fixa, para evitar overlap.

Para pecas retangulares, o NFP e calculado analiticamente (rapido).
Para pecas irregulares, usa Minkowski sum.
"""

from __future__ import annotations

import math

from shapely.geometry import Polygon, box
from shapely.affinity import translate, rotate

from app.core.geometry.polygon_utils import (
    bounding_box_dimensions,
    is_approximately_rectangular,
    normalize_polygon,
)


# ---------------------------------------------------------------------------
# NFP para retangulos (fast path)
# ---------------------------------------------------------------------------

def nfp_rectangles(
    fixed_w: float, fixed_h: float,
    moving_w: float, moving_h: float,
    fixed_x: float = 0, fixed_y: float = 0,
) -> Polygon:
    """Calcular NFP de dois retangulos (caminho rapido analitico).

    O NFP de dois retangulos e sempre um retangulo.
    Se a peca movel tem ref point no canto inferior esquerdo,
    o NFP e o retangulo expandido pela dimensao da peca movel.

    Args:
        fixed_w: Largura do retangulo fixo (mm)
        fixed_h: Altura do retangulo fixo (mm)
        moving_w: Largura do retangulo movel (mm)
        moving_h: Altura do retangulo movel (mm)
        fixed_x: Posicao X do retangulo fixo (mm)
        fixed_y: Posicao Y do retangulo fixo (mm)

    Returns:
        NFP como Polygon
    """
    # NFP = retangulo que vai de (fixed_x - moving_w, fixed_y - moving_h)
    #        ate (fixed_x + fixed_w, fixed_y + fixed_h)
    nfp = box(
        fixed_x - moving_w,
        fixed_y - moving_h,
        fixed_x + fixed_w,
        fixed_y + fixed_h,
    )
    return nfp


def is_rectangular_pair(fixed: Polygon, moving: Polygon, tolerance: float = 1.0) -> bool:
    """Verificar se ambos poligonos sao aproximadamente retangulares.

    Args:
        fixed: Poligono fixo
        moving: Poligono movel
        tolerance: Tolerancia em mm

    Returns:
        True se ambos sao retangulares
    """
    return (
        is_approximately_rectangular(fixed, tolerance)
        and is_approximately_rectangular(moving, tolerance)
    )


# ---------------------------------------------------------------------------
# NFP generico (Minkowski sum)
# ---------------------------------------------------------------------------

def _reflect_polygon(poly: Polygon) -> Polygon:
    """Refletir poligono em relacao a origem: (-x, -y).

    Necessario para Minkowski sum que computa NFP:
    NFP(A, B) = A ⊕ (-B)

    Args:
        poly: Poligono original

    Returns:
        Poligono refletido
    """
    coords = list(poly.exterior.coords)
    reflected_coords = [(-x, -y) for x, y in coords]

    holes = []
    for hole in poly.interiors:
        hole_coords = list(hole.coords)
        holes.append([(-x, -y) for x, y in hole_coords])

    return Polygon(reflected_coords, holes)


def _minkowski_sum_convex(a: Polygon, b: Polygon) -> Polygon:
    """Minkowski sum de dois poligonos convexos.

    Algoritmo: ordenar vertices pelo angulo, mesclar as listas.
    Complexidade O(n + m) onde n, m sao numero de vertices.

    Args:
        a: Primeiro poligono convexo
        b: Segundo poligono convexo

    Returns:
        Minkowski sum (poligono convexo)
    """
    def _get_edges(poly: Polygon) -> list[tuple[float, float]]:
        """Extrair vetores de aresta do poligono."""
        coords = list(poly.exterior.coords)
        edges = []
        for i in range(len(coords) - 1):
            dx = coords[i + 1][0] - coords[i][0]
            dy = coords[i + 1][1] - coords[i][1]
            edges.append((dx, dy))
        return edges

    def _start_vertex(poly: Polygon) -> int:
        """Encontrar indice do vertice mais abaixo-esquerda."""
        coords = list(poly.exterior.coords)[:-1]
        min_idx = 0
        for i, (x, y) in enumerate(coords):
            cx, cy = coords[min_idx]
            if y < cy or (y == cy and x < cx):
                min_idx = i
        return min_idx

    def _edge_angle(dx: float, dy: float) -> float:
        """Angulo da aresta em radianos [0, 2*pi)."""
        angle = math.atan2(dy, dx)
        if angle < 0:
            angle += 2 * math.pi
        return angle

    # Obter coordenadas e arestas
    coords_a = list(a.exterior.coords)[:-1]
    coords_b = list(b.exterior.coords)[:-1]
    na = len(coords_a)
    nb = len(coords_b)

    if na == 0 or nb == 0:
        return Polygon()

    edges_a = _get_edges(a)
    edges_b = _get_edges(b)

    # Iniciar pelo vertice mais abaixo-esquerda
    start_a = _start_vertex(a)
    start_b = _start_vertex(b)

    # Mesclar arestas por angulo
    result = []
    i, j = 0, 0
    current_x = coords_a[start_a][0] + coords_b[start_b][0]
    current_y = coords_a[start_a][1] + coords_b[start_b][1]

    result.append((current_x, current_y))

    while i < na or j < nb:
        idx_a = (start_a + i) % na
        idx_b = (start_b + j) % nb

        if i >= na:
            dx, dy = edges_b[idx_b]
            j += 1
        elif j >= nb:
            dx, dy = edges_a[idx_a]
            i += 1
        else:
            angle_a = _edge_angle(edges_a[idx_a][0], edges_a[idx_a][1])
            angle_b = _edge_angle(edges_b[idx_b][0], edges_b[idx_b][1])

            if abs(angle_a - angle_b) < 1e-10:
                # Angulos iguais: somar ambas arestas
                dx = edges_a[idx_a][0] + edges_b[idx_b][0]
                dy = edges_a[idx_a][1] + edges_b[idx_b][1]
                i += 1
                j += 1
            elif angle_a < angle_b:
                dx, dy = edges_a[idx_a]
                i += 1
            else:
                dx, dy = edges_b[idx_b]
                j += 1

        current_x += dx
        current_y += dy
        result.append((current_x, current_y))

    if len(result) < 3:
        return Polygon()

    return Polygon(result)


def compute_nfp(
    fixed: Polygon,
    moving: Polygon,
    use_convex_hull: bool = False,
) -> Polygon | None:
    """Calcular No-Fit Polygon (NFP) de duas pecas.

    O NFP define onde o ponto de referencia da peca movel
    NAO pode estar para evitar overlap com a peca fixa.

    Para colocar a peca movel, seu ref point deve estar FORA do NFP.

    Fast paths:
    1. Ambos retangulares → NFP analitico (sem Minkowski)
    2. Ambos convexos → Minkowski sum O(n+m)
    3. Geral → Usar convex hull como aproximacao segura

    Args:
        fixed: Poligono fixo (ja posicionado)
        moving: Poligono movel (na origem)
        use_convex_hull: Forcar uso de convex hull (mais rapido, menos preciso)

    Returns:
        NFP como Polygon, ou None se falhar
    """
    # Normalizar peca movel para a origem
    moving_norm = normalize_polygon(moving)

    # Fast path 1: retangulos
    if is_rectangular_pair(fixed, moving_norm):
        fw, fh = bounding_box_dimensions(fixed)
        mw, mh = bounding_box_dimensions(moving_norm)
        fx0, fy0 = fixed.bounds[:2]
        return nfp_rectangles(fw, fh, mw, mh, fx0, fy0)

    # Refletir peca movel
    reflected = _reflect_polygon(moving_norm)

    # Fast path 2: ambos convexos
    if not use_convex_hull and fixed.convex_hull.equals(fixed) and moving_norm.convex_hull.equals(moving_norm):
        try:
            nfp = _minkowski_sum_convex(fixed, reflected)
            if nfp.is_valid and nfp.area > 0:
                return nfp
        except Exception:
            pass  # Fallback para convex hull

    # Path geral: usar convex hull como aproximacao conservadora
    # (O NFP exato para poligonos nao-convexos requer decomposicao convexa)
    try:
        fixed_hull = fixed.convex_hull
        reflected_hull = reflected.convex_hull
        nfp = _minkowski_sum_convex(fixed_hull, reflected_hull)

        if nfp.is_valid and nfp.area > 0:
            return nfp
    except Exception:
        pass

    # Fallback: buffer-based approximation
    try:
        # Usar o "raio" maximo da peca movel
        mw, mh = bounding_box_dimensions(moving_norm)
        max_dim = max(mw, mh)
        nfp = fixed.buffer(max_dim / 2.0)
        if nfp.is_valid and nfp.area > 0:
            return nfp
    except Exception:
        pass

    return None


def compute_nfp_with_rotation(
    fixed: Polygon,
    moving: Polygon,
    rotation_degrees: float,
) -> Polygon | None:
    """Calcular NFP com a peca movel rotacionada.

    Args:
        fixed: Poligono fixo
        moving: Poligono movel (na origem)
        rotation_degrees: Rotacao em graus

    Returns:
        NFP para a rotacao especificada
    """
    if abs(rotation_degrees) > 0.01:
        moving_rotated = rotate(moving, rotation_degrees, origin=(0, 0))
    else:
        moving_rotated = moving

    return compute_nfp(fixed, moving_rotated)


# ---------------------------------------------------------------------------
# Cache de NFPs
# ---------------------------------------------------------------------------

class NFPCache:
    """Cache de NFPs pre-computados.

    Como o calculo de NFP e caro, cachear resultados
    para pares de pecas que se repetem (mesma geometria).

    A chave e baseada na area + perimetro + rotacao das pecas
    (hashing geometrico aproximado).
    """

    def __init__(self):
        """Inicializar cache vazio."""
        self._cache: dict[tuple, Polygon] = {}
        self._hits = 0
        self._misses = 0

    @staticmethod
    def _geometry_key(poly: Polygon) -> tuple:
        """Criar chave de hash para geometria.

        Usa area, perimetro e numero de vertices como fingerprint.
        """
        return (
            round(poly.area, 2),
            round(poly.length, 2),
            len(poly.exterior.coords),
        )

    def get(
        self,
        fixed: Polygon,
        moving: Polygon,
        rotation: float = 0,
    ) -> Polygon | None:
        """Buscar NFP no cache.

        Args:
            fixed: Poligono fixo
            moving: Poligono movel
            rotation: Rotacao da peca movel

        Returns:
            NFP se encontrado no cache, None caso contrario
        """
        key = (
            self._geometry_key(fixed),
            self._geometry_key(moving),
            round(rotation, 1),
        )

        result = self._cache.get(key)
        if result is not None:
            self._hits += 1
            # NFP precisa ser transladado para a posicao real do fixed
            fx0, fy0 = fixed.bounds[:2]
            cached_fx0, cached_fy0 = result.bounds[:2]
            if abs(fx0 - cached_fx0) > 0.01 or abs(fy0 - cached_fy0) > 0.01:
                return translate(result, fx0 - cached_fx0, fy0 - cached_fy0)
            return result
        else:
            self._misses += 1
            return None

    def put(
        self,
        fixed: Polygon,
        moving: Polygon,
        rotation: float,
        nfp: Polygon,
    ):
        """Armazenar NFP no cache.

        Args:
            fixed: Poligono fixo
            moving: Poligono movel
            rotation: Rotacao da peca movel
            nfp: NFP calculado
        """
        key = (
            self._geometry_key(fixed),
            self._geometry_key(moving),
            round(rotation, 1),
        )
        self._cache[key] = nfp

    def get_or_compute(
        self,
        fixed: Polygon,
        moving: Polygon,
        rotation: float = 0,
    ) -> Polygon | None:
        """Buscar no cache ou computar e armazenar.

        Args:
            fixed: Poligono fixo
            moving: Poligono movel
            rotation: Rotacao da peca movel

        Returns:
            NFP (do cache ou recem-calculado)
        """
        cached = self.get(fixed, moving, rotation)
        if cached is not None:
            return cached

        nfp = compute_nfp_with_rotation(fixed, moving, rotation)
        if nfp is not None:
            self.put(fixed, moving, rotation, nfp)

        return nfp

    @property
    def stats(self) -> dict:
        """Estatisticas do cache."""
        total = self._hits + self._misses
        return {
            "size": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / total if total > 0 else 0,
        }

    def clear(self):
        """Limpar cache."""
        self._cache.clear()
        self._hits = 0
        self._misses = 0
